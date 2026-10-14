import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../build/protools');
const source=fs.readFileSync(path.join(root,'patched-main.js'),'utf8');
const tree=parse(source,{sourceType:'unambiguous'});
const declaration=name=>tree.program.body.find(node=>node.id?.name===name);
const code=node=>source.slice(node.start,node.end);
const functions=['aiAssistantAtomicWrite','aiAssistantSnapshot','aiAssistantRestoreSnapshot','aiLoginAccountById','aiAssistantLoginAccountTransaction'];
const queue=tree.program.body.find(node=>node.type==='VariableDeclaration'&&node.declarations.some(d=>d.id.name==='aiAssistantAccountWriteQueue'));
const transactionCode=[code(queue),...functions.map(name=>code(declaration(name)))].join('\n');
const serviceCode=code(declaration('SeamlessService'));
const injectorMethod=declaration('TokenInjector').body.body.find(node=>node.key?.name==='_injectTokenInternal');
const temporary=fs.mkdtempSync(path.join(root,'fixture-'));
const fakeTokens={old:'synthetic-old-access',first:'synthetic-first-access',second:'synthetic-second-access'};
const accounts={
  first:{id:'first',email:'first@example.test',sessionToken:'synthetic-first-session'},
  second:{id:'second',email:'second@example.test',sessionToken:'synthetic-second-session'},
};
const quiet={log(){},warn(){},error(){}};
let caseNumber=0;
function fixture(){
  const home=path.join(temporary,String(++caseNumber));fs.mkdirSync(home);
  const renewal=path.join(home,'.cursor-renewal');fs.mkdirSync(renewal);
  const cursorData=path.join(home,'cursor');fs.mkdirSync(cursorData);
  const file=name=>path.join(renewal,name);
  fs.writeFileSync(file('active_token'),fakeTokens.old);
  fs.writeFileSync(file('seamless_state.json'),JSON.stringify({accessToken:fakeTokens.old,email:'old@example.test',config:{enabled:true,custom:'preserve'},auto_switch_enabled:false,auto_resume_enabled:false}));
  fs.writeFileSync(file('machine_id_override'),JSON.stringify({mappings:[{old:'physical-test-machine',new:'test-machine-old'},{old:'unrelated-source',new:'unrelated-target'}],custom:'preserve'}));
  const effects={prepare:0,probe:0,reload:0,launch:0,bridge:0,events:[],logs:[]};
  let current={email:'old@example.test',accessToken:fakeTokens.old,refreshToken:'synthetic-old-refresh',sessionToken:'synthetic-old-session'};
  let selected='old';let rejectFirstInjection=false;let activeWrites=0;let peakWrites=0;
  const store={
    getConfig(){return undefined},setConfig(){},getAccountById:id=>accounts[id],
    getCurrentAccount:()=>({id:selected}),setCurrentAccount:id=>{selected=id},
    addLog:(action)=>effects.logs.push(action),updateAccount(){},
  };
  const injector={
    getCurrentAccount:()=>({...current}),
    readDbValue:key=>key==='cursorAuth/accessToken'?current.accessToken:undefined,
    async injectToken(email,accessToken,refreshToken,sessionToken){
      activeWrites++;peakWrites=Math.max(peakWrites,activeWrites);effects.events.push('begin:'+accessToken);
      try{
        await new Promise(resolve=>setTimeout(resolve,3));
        if(rejectFirstInjection&&accessToken===fakeTokens.first){rejectFirstInjection=false;throw new Error('synthetic write failure')}
        current={email,accessToken,refreshToken,sessionToken};
      }finally{effects.events.push('end:'+accessToken);activeWrites--}
    },
  };
  const seamless={getConfig:()=>({enabled:true}),setCurrentAccount:id=>{selected=id}};
  const globals={
    fs__namespace:fs,path__namespace:path,os__namespace:{homedir:()=>home},console:quiet,process:{pid:process.pid},
    cursorPaths:{dataPath:cursorData},getAppDatabase:()=>store,tokenInjector:injector,seamlessService:seamless,
    prepareTokensForInjection:async account=>{effects.prepare++;return{accessToken:fakeTokens[account.id],refreshToken:'synthetic-'+account.id+'-refresh',sessionToken:account.sessionToken}},
    aiAssistantMachineBundle:account=>({target:{machineId:'test-machine-'+account.id,macMachineId:'test-mac-'+account.id,devDeviceId:'test-dev-'+account.id,sqmId:'test-sqm-'+account.id},current:{machineId:'physical-test-machine'}}),
    aiAssistantSeamlessPatcher:{getStatus:()=>({isEnabled:true})},
    processManager:{isCursorRunning:async()=>{effects.probe++;return true},launchCursor:async()=>effects.launch++},
    aiAssistantForceProMembership:()=>({existed:true,value:'pro'}),aiAssistantRestoreMembership(){},
    aiAssistantLocalBridge:{start:async()=>{effects.bridge++;return{mode:'test',port:0}}},
    aiAssistantReloadCursorWindow:async()=>effects.reload++,mainWindow:null,updateTrayMenu(){},
    setTimeout:(fn)=>setTimeout(fn,0),
  };
  const context=vm.createContext(globals);vm.runInContext(transactionCode+'\n'+serviceCode,context,{timeout:1000});
  const service=vm.runInContext('new SeamlessService()',context);service.getNextAvailableAccount=()=>accounts.first;
  return{context,service,home,file,effects,injector,current:()=>current,selected:()=>selected,fail:()=>{rejectFirstInjection=true},peak:()=>peakWrites};
}
try{
  const first=fixture();const switched=await first.service.switchToNextAccount('manual','test');
  assert.equal(switched.success,true);assert.equal(first.current().accessToken,fakeTokens.first);
  assert.equal(fs.readFileSync(first.file('active_token'),'utf8'),fakeTokens.first);
  const state=JSON.parse(fs.readFileSync(first.file('seamless_state.json'),'utf8'));
  assert.equal(state.accessToken,fakeTokens.first);assert.equal(state.config.custom,'preserve');
  assert.equal(state.auto_switch_enabled,false);assert.equal(state.auto_resume_enabled,false);
  const machineMap=JSON.parse(fs.readFileSync(first.file('machine_id_override'),'utf8')).mappings;
  assert.equal(machineMap.filter(item=>item.old==='physical-test-machine').length,1);
  assert.equal(machineMap.find(item=>item.old==='physical-test-machine').new,'test-machine-first');
  assert.equal(machineMap.find(item=>item.old==='unrelated-source').new,'unrelated-target');
  assert.equal(first.effects.prepare,1);assert.equal(first.effects.reload,0);assert.equal(first.effects.launch,0);assert.equal(first.effects.probe,0);
  assert.equal(first.service.stats.totalSwitches,1);assert.equal(first.selected(),'first');
  const second=fixture();assert.equal((await second.service.switchToAccount('second')).success,true);
  assert.equal(second.current().accessToken,fakeTokens.second);assert.equal(fs.readFileSync(second.file('active_token'),'utf8'),fakeTokens.second);
  const failed=fixture();const originals=['active_token','seamless_state.json','machine_id_override'].map(name=>[name,fs.readFileSync(failed.file(name))]);
  failed.fail();assert.equal((await failed.service.switchToNextAccount('manual','test')).success,false);
  for(const[name,bytes]of originals)assert.deepEqual(fs.readFileSync(failed.file(name)),bytes);
  assert.equal(failed.current().accessToken,fakeTokens.old);assert.equal(failed.selected(),'old');assert.equal(failed.service.stats.totalSwitches,0);
  const concurrent=fixture();const results=await Promise.all([
    concurrent.context.aiLoginAccountById('first',{stateOnly:true,prepared:{accessToken:fakeTokens.first,refreshToken:'synthetic-first-refresh',sessionToken:accounts.first.sessionToken}}),
    concurrent.context.aiLoginAccountById('second',{stateOnly:true,prepared:{accessToken:fakeTokens.second,refreshToken:'synthetic-second-refresh',sessionToken:accounts.second.sessionToken}}),
  ]);assert.ok(results.every(result=>result.success));assert.equal(concurrent.peak(),1);
  assert.equal(concurrent.current().accessToken,fakeTokens.second);assert.equal(fs.readFileSync(concurrent.file('active_token'),'utf8'),fakeTokens.second);
  const legacy=fixture();assert.equal((await legacy.context.aiLoginAccountById('first')).success,true);
  assert.equal(legacy.effects.prepare,1);assert.equal(legacy.effects.probe,1);assert.equal(legacy.effects.reload,1);assert.equal(legacy.effects.bridge,1);
  const atomic=fixture();const oldFile=atomic.file('active_token');const oldBytes=fs.readFileSync(oldFile);
  const renameFailureFs=Object.assign({},fs,{renameSync(){throw new Error('synthetic rename failure')}});
  atomic.context.fs__namespace=renameFailureFs;
  assert.throws(()=>atomic.context.aiAssistantAtomicWrite(oldFile,'synthetic-new-value'));
  assert.deepEqual(fs.readFileSync(oldFile),oldBytes);
  assert.equal(fs.readdirSync(path.dirname(oldFile)).filter(name=>name.includes('.tmp-')).length,0);
  // Execute the actual low-level producer with inert SQLite/filesystem adapters.
  const rows=new Map([['WorkosCursorSessionToken','synthetic-old-session']]);const statements=[];
  const database=class{exec(sql){statements.push(sql)}prepare(sql){return{run:(key,value)=>{if(sql.startsWith('DELETE'))rows.delete(key);else rows.set(key,value)}}}pragma(){}close(){}};
  const nativeContext=vm.createContext({console:quiet,Database:database,waitForFileAvailable:async()=>true,copyFileWithRetry:async()=>{},fs__namespace:{},Date});
  const Producer=vm.runInContext('(class {'+code(injectorMethod)+'})',nativeContext);const producer=new Producer();producer.dbPath='fixture';producer.checkDatabase=()=>{};producer.parseUserIdFromJwt=()=>'';
  await producer._injectTokenInternal('synthetic@example.test','synthetic-access','synthetic-refresh',undefined);
  assert.equal(rows.has('WorkosCursorSessionToken'),false);assert.equal(rows.get('cursorAuth/accessToken'),'synthetic-access');assert.ok(statements.includes('COMMIT'));
  await producer._injectTokenInternal('synthetic@example.test','synthetic-access','synthetic-refresh','synthetic-new-session');
  assert.equal(rows.get('WorkosCursorSessionToken'),'synthetic-new-session');
  const output={success:true,assertions:[
    'Both ordinary seamless paths synchronize Cursor DB and Hook credentials and preserve flags.',
    'Ordinary seamless switch prepares once, updates statistics once and does not reload or launch Cursor.',
    'Injection failure restores shared files and prior credentials and does not report a successful switch.',
    'Concurrent state writes run serially and finish with one coherent account.',
    'Existing AI-login path retains its original reload and bridge behavior.',
    'A missing session clears the previous account session; a supplied session is preserved.',
    'The selected account replaces an earlier current-device mapping and retains unrelated mappings.',
    'A failed atomic rename leaves the previous file intact and removes the owned private temporary file.',
  ],limitations:['Controlled execution of actual extracted functions with synthetic credentials and adapters; no real accounts, network, GUI or provider requests.']};
  fs.writeFileSync(path.join(root,'verification.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
}finally{fs.rmSync(temporary,{recursive:true,force:true})}
