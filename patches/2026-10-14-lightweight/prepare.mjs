import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {extractFile} from '@electron/asar';

const root=path.dirname(fileURLToPath(import.meta.url));
const output=path.resolve(process.argv[2]??path.join(root,'build'));
const archive=process.argv[3]??'/Applications/CursorProTools.app/Contents/Resources/app.asar';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const baseline='7c089f09f492f3921e9ea3b892d3995f0dd9edcf5b401fc5fc191449b5cfbd97';
if(fs.existsSync(output))throw new Error('Output exists; preserving it');
if(sha(fs.readFileSync(archive))!==baseline)throw new Error('Unknown application baseline; refusing to overwrite modifications');
const files={
  main:{member:'out/main/index.js',sha:'a2265b20fb613d3871e8b942773962c3d860e08351885d6fd033a6041f7633f7'},
  renderer:{member:'out/renderer/assets/index-TW81dTqy.js',sha:'7cb215f314b4d1f62f2dbb559cbcd45d4c21ffb00f451a8c2090d75e5b2fc1b1'}
};
const changes=[];
function once(text,old,replacement,label){
  if(text.split(old).length!==2)throw new Error('Ambiguous boundary: '+label);
  changes.push({label,old,new:replacement});
  return text.replace(old,replacement);
}
const staged=[];
for(const[name,spec]of Object.entries(files)){
  const original=extractFile(archive,spec.member);
  if(sha(original)!==spec.sha)throw new Error('Source identity differs: '+spec.member);
  let text=original.toString('utf8');
  const start=changes.length;
  if(name==='main'){
    text=once(text,'      const state = this.readRenewalState();\n      this.syncMembership();',
      '      const state = this.readRenewalState();\n      this.syncMembership(state);','Account response and synchronization share one request snapshot');
    text=once(text,'  syncMembership() {\n    const state = this.readRenewalState();',
      '  syncMembership(state = this.readRenewalState()) {','Independent synchronization still reads fresh state');
    text=once(text,'    const previous = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("cursorAuth/stripeMembershipType");',
      '    const membershipStatement = db.prepare("SELECT value FROM ItemTable WHERE key = ?");\n    const previous = membershipStatement.get("cursorAuth/stripeMembershipType");','Prepare membership SELECT once within the owned connection');
    text=once(text,'    const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("cursorAuth/stripeMembershipType");',
      '    const row = membershipStatement.get("cursorAuth/stripeMembershipType");','Preserve the second membership verification read');
  }else if(name==='renderer'){
    text=once(text,'function AccountList({',fs.readFileSync(path.join(root,'renderer-sharing.js'),'utf8')+'\nfunction AccountList({','Stable row rendering and exact snapshot reuse');
    text=once(text,'    ] }) : sortedAccounts.map((account, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(\n      AccountRow,',
      '    ] }) : sortedAccounts.map((account, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(\n      CptStableAccountRow,','Keep every row mounted with stable callbacks');
    text=once(text,'      setAccounts(accs);','      setAccounts(previous => cptReuseAccountSnapshot(previous, accs));','Reuse only field-identical account records');
  }
  staged.push({name,...spec,original,patched:Buffer.from(text),changes:changes.slice(start)});
}
fs.mkdirSync(output,{recursive:true});
for(const row of staged){
  fs.writeFileSync(path.join(output,row.name+'.original'),row.original);
  fs.writeFileSync(path.join(output,row.name+'.patched'),row.patched);
}
fs.writeFileSync(path.join(output,'css.original'),extractFile(archive,'out/renderer/assets/index-b8BQ-3Jl.css'));
fs.copyFileSync(path.join(root,'tests/fixture-harness.js'),path.join(output,'fixture-harness.js'));
const manifest={archive,archive_sha256:baseline,scope:'Preserve row lifecycle, account operations, timers, validation and rollback',
  targets:staged.map(row=>({name:row.name,member:row.member,original_sha256:row.sha,patched_sha256:sha(row.patched),
    original:row.name+'.original',patched:row.name+'.patched',changes:row.changes}))};
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({status:'prepared',directory:output,members:manifest.targets.map(row=>row.member),app_or_account_writes:false}));
