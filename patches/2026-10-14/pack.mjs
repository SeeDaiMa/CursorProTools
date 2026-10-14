import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {getRawHeader} from '@electron/asar';
const asarLibrary=path.dirname(fileURLToPath(import.meta.resolve('@electron/asar')));
const {Pickle}=await import(path.join(asarLibrary,'pickle.js'));
const {getFileIntegrityFromBuffer}=await import(path.join(asarLibrary,'integrity.js'));
import {fileURLToPath} from 'node:url';
const root=path.resolve(process.argv[2]??path.join(path.dirname(fileURLToPath(import.meta.url)),'build/protools'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const archive=fs.readFileSync(manifest.target_archive);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
if(![manifest.archive_sha256,manifest.patched_archive_sha256].includes(sha(archive)))throw new Error('Installed archive changed; refusing to package a different baseline');
const raw=getRawHeader(manifest.target_archive);
const header=structuredClone(raw.header);
function entries(node,prefix=''){
  const out=[];
  for(const[name,item]of Object.entries(node.files??{})){
    const member=prefix?prefix+'/'+name:name;
    if(item.files)out.push(...entries(item,member));
    else out.push({member,node:item});
  }
  return out;
}
const originalEntries=entries(raw.header);
const newEntries=entries(header);
const selected=newEntries.find(entry=>entry.member===manifest.member);
if(!selected||selected.node.unpacked||selected.node.link)throw new Error('Selected main module is not one packed regular file');
const offset=Number(selected.node.offset),size=selected.node.size,payloadStart=8+raw.headerSize;
if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(size)||offset<0||size<0||payloadStart+offset+size>archive.length)throw new Error('Invalid selected member range');
const original=archive.subarray(payloadStart+offset,payloadStart+offset+size);
if(sha(archive)===manifest.patched_archive_sha256){
  if(sha(original)!==manifest.patched_main_sha256)throw new Error('Already-patched ASAR module differs from the verified source');
  fs.writeFileSync(path.join(root,'patched-app.asar'),archive);
  const output={patched_archive_sha256:sha(archive),header_sha256:sha(Buffer.from(raw.headerString)),
    changed_member:manifest.member,already_patched:true,original_to_patched_comparison:'not rerun for already-patched input'};
  fs.writeFileSync(path.join(root,'package-verification.json'),JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify(output));
  process.exit(0);
}
if(sha(original)!==manifest.original_main_sha256)throw new Error('ASAR member differs from examined source');
const patched=fs.readFileSync(path.join(root,'patched-main.js'));
if(sha(patched)!==manifest.patched_main_sha256)throw new Error('Staged main module changed');
const delta=patched.length-size;
for(const entry of newEntries){
  const node=entry.node;
  if(node.unpacked||node.link||node.offset===undefined)continue;
  const old=Number(node.offset);
  if(!Number.isSafeInteger(old)||!Number.isSafeInteger(node.size)||old<0||node.size<0||payloadStart+old+node.size>archive.length)throw new Error('Invalid packed member range');
  if(entry!==selected&&old<offset+size&&old+node.size>offset)throw new Error('Packed members overlap the selected main module');
  if(entry!==selected&&old>=offset+size)node.offset=String(old+delta);
}
selected.node.size=patched.length;
selected.node.integrity=getFileIntegrityFromBuffer(patched);
const headerString=JSON.stringify(header);
const headerPickle=Pickle.createEmpty();headerPickle.writeString(headerString);
const headerBuffer=headerPickle.toBuffer();
const sizePickle=Pickle.createEmpty();sizePickle.writeUInt32(headerBuffer.length);
const result=Buffer.concat([sizePickle.toBuffer(),headerBuffer,
  archive.subarray(payloadStart,payloadStart+offset),patched,
  archive.subarray(payloadStart+offset+size)]);
const destination=path.join(root,'patched-app.asar');fs.writeFileSync(destination,result);
const newPayloadStart=8+headerBuffer.length;
let packedVerified=0;
for(let index=0;index<originalEntries.length;index++){
  const before=originalEntries[index],after=newEntries[index];
  if(before.member!==after.member)throw new Error('Archive member identity changed');
  if(before.member===manifest.member)continue;
  const oldMeta=structuredClone(before.node),newMeta=structuredClone(after.node);
  delete oldMeta.offset;delete newMeta.offset;
  if(JSON.stringify(oldMeta)!==JSON.stringify(newMeta))throw new Error('Unselected member metadata changed');
  if(before.node.offset!==undefined&&!before.node.unpacked&&!before.node.link){
    const oldBytes=archive.subarray(payloadStart+Number(before.node.offset),payloadStart+Number(before.node.offset)+before.node.size);
    const newBytes=result.subarray(newPayloadStart+Number(after.node.offset),newPayloadStart+Number(after.node.offset)+after.node.size);
    if(!oldBytes.equals(newBytes))throw new Error('Unselected packed member changed');
    packedVerified++;
  }
}
const verified=getRawHeader(destination);
if(verified.headerString!==headerString)throw new Error('Packaged header failed format-aware re-read');
const output={original_archive_sha256:sha(archive),patched_archive_sha256:sha(result),
  header_sha256:sha(Buffer.from(headerString)),changed_member:manifest.member,
  unselected_packed_files_byte_identical:packedVerified,total_members:originalEntries.length,
  unpacked_and_link_metadata_preserved:true};
fs.writeFileSync(path.join(root,'package-verification.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output));
