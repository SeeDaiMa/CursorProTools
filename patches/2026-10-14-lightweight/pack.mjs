import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {getRawHeader} from '@electron/asar';
const library=path.dirname(fileURLToPath(import.meta.resolve('@electron/asar')));
const {Pickle}=await import(path.join(library,'pickle.js'));
const {getFileIntegrityFromBuffer}=await import(path.join(library,'integrity.js'));
const root=path.resolve(process.argv[2]??path.join(path.dirname(fileURLToPath(import.meta.url)),'build'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const archive=fs.readFileSync(manifest.archive);
if(sha(archive)!==manifest.archive_sha256)throw new Error('Application baseline changed');
const raw=getRawHeader(manifest.archive),header=structuredClone(raw.header),payloadStart=8+raw.headerSize;
function entries(node,prefix=''){
  return Object.entries(node.files??{}).flatMap(([name,item])=>{
    const member=prefix?prefix+'/'+name:name;
    return item.files?entries(item,member):[{member,node:item}];
  });
}
const beforeEntries=entries(raw.header),afterEntries=entries(header);
const replacements=manifest.targets.map(spec=>{
  const selected=afterEntries.find(entry=>entry.member===spec.member);
  if(!selected||selected.node.unpacked||selected.node.link)throw new Error('Patch member is not a packed regular file');
  const offset=Number(selected.node.offset),size=selected.node.size;
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(size)||offset<0||size<0||payloadStart+offset+size>archive.length)throw new Error('Invalid patch member range');
  const original=archive.subarray(payloadStart+offset,payloadStart+offset+size);
  const patched=fs.readFileSync(path.join(root,spec.patched));
  if(sha(original)!==spec.original_sha256||sha(patched)!==spec.patched_sha256)throw new Error('Patch source/output identity mismatch');
  return{...spec,offset,size,patched,selected,delta:patched.length-size};
}).sort((a,b)=>a.offset-b.offset);
for(let i=1;i<replacements.length;i++)if(replacements[i].offset<replacements[i-1].offset+replacements[i-1].size)throw new Error('Patch members overlap');
for(const entry of afterEntries){
  const node=entry.node;if(node.unpacked||node.link||node.offset===undefined)continue;
  const offset=Number(node.offset);
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(node.size)||offset<0||node.size<0||payloadStart+offset+node.size>archive.length)throw new Error('Invalid packed member range');
  for(const replacement of replacements){
    if(entry!==replacement.selected&&node.size>0&&offset<replacement.offset+replacement.size&&offset+node.size>replacement.offset)throw new Error('Other packed member overlaps replacement');
  }
  node.offset=String(offset+replacements.filter(r=>r.offset+r.size<=offset).reduce((sum,r)=>sum+r.delta,0));
}
const segments=[];let previous=payloadStart;
for(const replacement of replacements){
  segments.push(archive.subarray(previous,payloadStart+replacement.offset),replacement.patched);
  previous=payloadStart+replacement.offset+replacement.size;
  replacement.selected.node.size=replacement.patched.length;
  replacement.selected.node.integrity=getFileIntegrityFromBuffer(replacement.patched);
}
segments.push(archive.subarray(previous));
const headerString=JSON.stringify(header),pickle=Pickle.createEmpty();pickle.writeString(headerString);
const headerBuffer=pickle.toBuffer(),sizePickle=Pickle.createEmpty();sizePickle.writeUInt32(headerBuffer.length);
const result=Buffer.concat([sizePickle.toBuffer(),headerBuffer,...segments]);
const output=path.join(root,'patched-app.asar');fs.writeFileSync(output,result);
if(getRawHeader(output).headerString!==headerString)throw new Error('Format-aware header re-read failed');
const selectedNames=new Set(replacements.map(r=>r.member));let identical=0;
for(let i=0;i<beforeEntries.length;i++){
  const old=beforeEntries[i],next=afterEntries[i];assertIdentity(old.member===next.member);
  if(selectedNames.has(old.member))continue;
  const oldMeta={...old.node},newMeta={...next.node};delete oldMeta.offset;delete newMeta.offset;
  assertIdentity(JSON.stringify(oldMeta)===JSON.stringify(newMeta));
  if(!old.node.unpacked&&!old.node.link&&old.node.offset!==undefined){
    assertIdentity(archive.subarray(payloadStart+Number(old.node.offset),payloadStart+Number(old.node.offset)+old.node.size)
      .equals(result.subarray(8+headerBuffer.length+Number(next.node.offset),8+headerBuffer.length+Number(next.node.offset)+next.node.size)));
    identical++;
  }
}
function assertIdentity(value){if(!value)throw new Error('An unselected archive member changed')}
const report={original_archive_sha256:sha(archive),patched_archive_sha256:sha(result),header_sha256:sha(Buffer.from(headerString)),
  changed_members:[...selectedNames],unselected_packed_files_byte_identical:identical,unpacked_and_link_metadata_preserved:true};
fs.writeFileSync(path.join(root,'package-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
