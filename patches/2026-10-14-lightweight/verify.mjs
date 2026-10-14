import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {parse} from '@babel/parser';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const build=path.resolve(process.argv[2]??path.join(root,'build'));
const main=fs.readFileSync(path.join(build,'main.patched'),'utf8');
const before=fs.readFileSync(path.join(build,'main.original'),'utf8');
const tree=parse(main,{sourceType:'unambiguous'}),oldTree=parse(before,{sourceType:'unambiguous'});
const declaration=(ast,name)=>ast.program.body.find(node=>node.id?.name===name);
const code=(source,node)=>source.slice(node.start,node.end);
for(const name of ['SeamlessService','TokenInjector','aiLoginAccountById','aiAssistantLoginAccountTransaction','aiAssistantAtomicWrite','aiAssistantRestoreMembership']){
  assert.equal(code(main,declaration(tree,name)),code(before,declaration(oldTree,name)),name+' must stay byte-identical');
}
const timers=source=>[...source.matchAll(/(?:setInterval|setTimeout)\([^\n]+/g)].map(item=>item[0]);
assert.deepEqual(timers(main),timers(before),'Scheduling must remain unchanged');
const context=vm.createContext({console:{warn(){}},os__namespace:{homedir:()=>'/synthetic-home'},path__namespace:{join:(...parts)=>parts.join('/')},
  url:{parse:()=>({pathname:'/account'})},fs__namespace:{existsSync:()=>true},cursorPaths:{dataPath:'/synthetic-cursor'},aiAssistantForceProMembership:()=>{context.forces++},forces:0});
vm.runInContext(code(main,declaration(tree,'AiAssistantLocalBridge')),context);
const bridge=vm.runInContext('new AiAssistantLocalBridge()',context);
let reads=0,state={email:'synthetic@example.test',config:{enabled:true}};
bridge.readRenewalState=()=>{reads++;return state};
bridge.sendJson=(_res,code,payload)=>{assert.equal(code,200);assert.equal(payload.email,state.email)};
bridge.handleRequest({method:'GET',url:'/account'},{});
assert.equal(reads,1);assert.equal(context.forces,1);
state={email:'changed@example.test',config:{enabled:false}};
bridge.handleRequest({method:'GET',url:'/account'},{});
assert.equal(reads,2);assert.equal(context.forces,1);
state={config:{enabled:true}};bridge.syncMembership();assert.equal(reads,3);assert.equal(context.forces,2);

const forceCode=code(main,declaration(tree,'aiAssistantForceProMembership'));
function membershipFixture(options={}){
  const initial=Object.prototype.hasOwnProperty.call(options,'initial')?options.initial:'pro';
  const {rewrite=false,insertFailure=false}=options;
  let value=initial,gets=0,prepares=0,closes=0;
  class Database{
    exec(){}
    prepare(sql){
      if(sql.startsWith('SELECT')){prepares++;return{get(){gets++;const result=value===undefined?undefined:{value};if(rewrite&&gets===1)value='free';return result}}}
      return{run(_key,next){if(insertFailure)throw new Error('synthetic insert failure');value=next}};
    }
    close(){closes++}
  }
  const ctx=vm.createContext({Database,fs__namespace:{existsSync:()=>true},path__namespace:{join:(...parts)=>parts.join('/')},cursorPaths:{dataPath:'/synthetic'}});
  vm.runInContext(forceCode,ctx);
  return{run:()=>vm.runInContext('aiAssistantForceProMembership()',ctx),state:()=>({value,gets,prepares,closes})};
}
for(const initial of ['pro','free',undefined]){
  const f=membershipFixture({initial});const snapshot=f.run();
  assert.equal(snapshot.existed,initial!==undefined);assert.equal(snapshot.value,initial);
  assert.deepEqual(f.state(),{value:'pro',gets:2,prepares:1,closes:1});
}
const external=membershipFixture({rewrite:true});assert.throws(external.run,/写入验证失败/);assert.equal(external.state().gets,2);assert.equal(external.state().closes,1);
const failed=membershipFixture({initial:'free',insertFailure:true});assert.throws(failed.run,/synthetic insert failure/);assert.equal(failed.state().closes,1);

const sharing=fs.readFileSync(path.join(root,'renderer-sharing.js'),'utf8').split('const CptMemoAccountRow')[0];
const payload=vm.createContext({});vm.runInContext(sharing,payload);
const evaluate=expression=>vm.runInContext(expression,payload);
assert.equal(evaluate('cptAccountPayloadEqual({x:undefined},{})'),false);
assert.equal(evaluate('cptAccountPayloadEqual({x:NaN},{x:null})'),false);
assert.equal(evaluate('cptAccountPayloadEqual({x:-0},{x:0})'),false);
assert.equal(evaluate('cptAccountPayloadEqual({a:1,b:2},{b:2,a:1})'),false);
assert.equal(evaluate('cptAccountPayloadEqual([,],[undefined])'),false);
assert.equal(evaluate('cptAccountPayloadEqual(new Date(0),new Date(0))'),false);
assert.equal(evaluate('cptAccountPayloadEqual({x:{cost:1,tags:["a"]}},{x:{cost:1,tags:["a"]}})'),true);
assert.equal(evaluate(`(()=>{const a=[{id:'one',token:'synthetic',daysRemaining:2},{id:'two',used:1}];const b=a.map(x=>({...x}));return cptReuseAccountSnapshot(a,b)===a})()`),true);
assert.equal(evaluate(`(()=>{const a=[{id:'one',used:1},{id:'two',used:2}];const b=[{id:'one',used:3},{id:'two',used:2}];const c=cptReuseAccountSnapshot(a,b);return c[0]===b[0]&&c[1]===a[1]})()`),true);
assert.equal(evaluate(`(()=>{const a=[{id:'one',token:'old'}];const b=[{id:'one',token:'new'}];return cptReuseAccountSnapshot(a,b)[0]===b[0]})()`),true);
assert.equal(evaluate(`(()=>{const a=[{id:'one'}];const b=[{id:'one'}];b.total=1;return cptReuseAccountSnapshot(a,b)===b})()`),true);
assert.equal(evaluate(`(()=>{const a=[{id:'one'}];const b=[{id:'one'},{id:'one'}];return cptReuseAccountSnapshot(a,b)===b})()`),true);
console.log(JSON.stringify({success:true,coverage:['Byte-identical login/token/rollback implementations','Unchanged timer scheduling','One per-request state snapshot, fresh independent synchronization','Both membership reads and external rewrite detection','Insert errors and DB close','Exact payload presence/order/NaN/signed-zero checks','Unchanged records reuse and changed credentials update']}));
