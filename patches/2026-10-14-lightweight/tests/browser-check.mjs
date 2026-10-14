import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]??path.join(path.dirname(new URL(import.meta.url).pathname),'../build'));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class CDP {
  constructor(socket){this.socket=socket;this.next=0;this.pending=new Map();this.events=[];
    socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=this.pending.get(m.id);this.pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result)}else this.events.push(m)});
  }
  static async connect(url){const socket=new WebSocket(url);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});return new CDP(socket)}
  send(method,params={}){const id=++this.next;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(this.pending.delete(id))reject(new Error('CDP timeout: '+method))},15000).unref()})}
  async eval(expression){const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value}
}
const results=[];
const permitted=new Set(['original.html','original.js','original.css','patched.html','patched.js','patched.css']);
const server=http.createServer((req,res)=>{
  const name=(req.url??'').slice(1);
  if(!permitted.has(name)){res.writeHead(404);res.end();return}
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');
  res.end(fs.readFileSync(path.join(root,'fixtures',name)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));server.unref();
for(const variant of ['original','patched']){
  const profile=fs.mkdtempSync(path.join(root,'chrome-profile-'));
  let child,cdp;
  try{
    child=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
      '--headless=new','--remote-debugging-port=0','--user-data-dir='+profile,
      '--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run',
      '--no-default-browser-check','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1','about:blank'
    ],{stdio:['ignore','ignore','pipe']});
    let diagnostic='';child.stderr.on('data',bytes=>{diagnostic=(diagnostic+bytes).slice(-4000)});
    const portFile=path.join(profile,'DevToolsActivePort');
    let port,targets;
    for(let i=0;i<150&&!targets;i++){
      if(fs.existsSync(portFile)){
        port=fs.readFileSync(portFile,'utf8').split('\n')[0].trim();
        if(/^[1-9][0-9]*$/.test(port))try{targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()}catch{}
      }
      if(!targets)await sleep(100);
    }
    if(!targets)throw new Error('Chrome startup failed: '+diagnostic);
    const target=targets.find(t=>t.type==='page'&&t.url==='about:blank');assert(target);
    cdp=await CDP.connect(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');await cdp.send('Page.enable');await cdp.send('Performance.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1,mobile:false});
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    const navigation=await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'+variant+'.html'});
    if(navigation.errorText)throw new Error('Fixture navigation: '+navigation.errorText);
    for(let i=0;i<100;i++){if(await cdp.eval('Boolean(window.__ready&&document.querySelectorAll(".account-table-grid:not(.account-table-header)").length===804)'))break;await sleep(100)}
    assert.equal(await cdp.eval('document.querySelectorAll(".account-table-grid:not(.account-table-header)").length'),804,
      JSON.stringify({errors:cdp.events.filter(e=>e.method==='Runtime.exceptionThrown'),page:await cdp.eval('({url:location.href,ready:window.__ready,body:document.body?.innerText.slice(0,400),scripts:[...document.scripts].map(s=>s.src)})')}));
    const pageErrors=cdp.events.filter(e=>e.method==='Runtime.exceptionThrown');assert.equal(pageErrors.length,0,JSON.stringify(pageErrors));
    const tick='new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))';
    const geometry=()=>cdp.eval(`(()=>{const owner=document.querySelector('.overflow-y-auto');const rows=[...document.querySelectorAll('.account-table-grid:not(.account-table-header)')];const first=rows[0],style=getComputedStyle(first);return {scrollHeight:owner.scrollHeight,viewportHeight:owner.clientHeight,rowCount:rows.length,buttonCount:document.querySelectorAll('button').length,firstHeight:first.getBoundingClientRect().height,contentHeight:first.getBoundingClientRect().height-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)-parseFloat(style.borderTopWidth)-parseFloat(style.borderBottomWidth)}})()`);
    const initial=await geometry();
    const beforeCounters=await cdp.send('Memory.getDOMCounters');
    const beforeRenders=await cdp.eval('window.__rowRenders');
    const metricsBefore=await cdp.send('Performance.getMetrics');
    // R3 loadData replaces snapshots and rerenders unrelated root state.
    for(let i=0;i<12;i++)await cdp.eval(`window.__setAccounts(structuredClone(window.__accounts));${tick}`);
    const sameDataRenders=await cdp.eval('window.__rowRenders')-beforeRenders;
    const metricsAfter=await cdp.send('Performance.getMetrics');
    await cdp.eval(`document.querySelector('.account-table-header button').click();${tick}`);
    assert.equal(await cdp.eval('window.__selected.length'),804,'Full selection must include offscreen accounts');
    await cdp.eval(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('批量刷新')).click();${tick}`);
    assert.equal(await cdp.eval('window.__calls.find(c=>c.name==="bulkRefresh").args[0].length'),804);
    await cdp.eval(`window.__pending.bulkRefresh.resolve();${tick}`);
    await cdp.eval(`document.querySelector('.account-table-header button').click();${tick}`);
    assert.equal(await cdp.eval('window.__selected.length'),0);
    const firstRow='document.querySelector(".account-table-grid:not(.account-table-header)")';
    const rendersBeforeSelect=await cdp.eval('window.__rowRenders');
    await cdp.eval(`${firstRow}.querySelector('button').click();${tick}`);
    assert.deepEqual(await cdp.eval('window.__selected'),['account-0']);
    const singleSelectionRenders=await cdp.eval('window.__rowRenders')-rendersBeforeSelect;
    await cdp.eval(`document.querySelectorAll('.account-table-grid:not(.account-table-header)')[1].querySelector('button').click();${tick}`);
    assert.deepEqual(await cdp.eval('window.__selected'),['account-0','account-1'],'The unchanged row must use the latest selection closure');
    await cdp.eval(`document.querySelectorAll('.account-table-grid:not(.account-table-header)')[1].querySelector('button').click();${tick}`);
    assert.deepEqual(await cdp.eval('window.__selected'),['account-0']);
    // AccountRow button sequence: select, refresh, convert, seamless, AI,
    // ordinary switch, detail, dashboard, delete in this complete fixture.
    await cdp.eval(`window.__setVersion(99);${tick}`);
    await cdp.eval(`${firstRow}.querySelectorAll('button')[1].click();${tick}`);
    assert.equal(await cdp.eval(`${firstRow}.querySelectorAll('button')[1].disabled`),true);
    await cdp.eval(`document.querySelector('.overflow-y-auto').scrollTop=100000;${tick}`);
    assert.equal(await cdp.eval('document.querySelectorAll(".account-table-grid:not(.account-table-header)").length'),804);
    await cdp.eval(`document.querySelector('.overflow-y-auto').scrollTop=0;${tick}`);
    assert.equal(await cdp.eval(`${firstRow}.querySelectorAll('button')[1].disabled`),true,'Scrolling must preserve an active operation');
    assert.equal(await cdp.eval('window.__calls.filter(c=>c.name==="refresh").length'),1);
    assert.equal(await cdp.eval('window.__calls.find(c=>c.name==="refreshCallback").version'),99,'Callback must use latest committed handler');
    await cdp.eval(`window.__pending.refresh.resolve();${tick}`);
    assert.equal(await cdp.eval(`${firstRow}.querySelectorAll('button')[1].disabled`),false);
    await cdp.eval(`${firstRow}.querySelectorAll('button')[4].click();${tick}`);
    assert.equal(await cdp.eval(`${firstRow}.querySelectorAll('button')[4].disabled`),true);
    await cdp.eval(`window.__setAiEnabled(false);${tick}`);
    assert.equal(await cdp.eval(`${firstRow}.querySelectorAll('button').length`),8);
    await cdp.eval(`window.__setAiEnabled(true);${tick}`);
    assert.equal(await cdp.eval(`${firstRow}.querySelectorAll('button')[4].disabled`),true,'Re-enabling a callback must preserve pending state');
    await cdp.eval(`window.__pending.aiLogin.resolve();${tick}`);
    assert.equal(await cdp.eval(`${firstRow}.querySelectorAll('button')[4].disabled`),false);
    await cdp.eval(`${firstRow}.querySelectorAll('button')[6].click();${tick}`);
    const modal=await cdp.eval('Boolean([...document.querySelectorAll("h2")].some(e=>e.textContent.includes("账号详情")))');assert(modal,JSON.stringify(await cdp.eval('({headings:[...document.querySelectorAll("h1,h2,h3")].map(e=>e.textContent),rowButtons:[...document.querySelector(".account-table-grid:not(.account-table-header)").querySelectorAll("button")].map(e=>e.outerHTML.slice(0,180)),body:document.body.innerText.slice(-1500)})')));
    const portalTextBefore=await cdp.eval('document.body.innerText.includes("synthetic-0@example.test")');assert(portalTextBefore);
    await cdp.eval(`document.querySelector('[title="编辑备注"]').click();${tick}`);
    await cdp.eval(`(()=>{const input=document.querySelector('input[placeholder="输入备注"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'未保存的测试备注');input.dispatchEvent(new Event('input',{bubbles:true}))})();${tick}`);
    await cdp.eval(`window.__setAccounts(window.__accounts.map(a=>({...a,isCurrent:a.id==='account-700'})));${tick}`);
    assert.equal(await cdp.eval('Boolean([...document.querySelectorAll("h2")].some(e=>e.textContent.includes("账号详情")))'),true,'Reordering must preserve portal state');
    assert.equal(await cdp.eval(`document.querySelector('input[placeholder="输入备注"]').value`),'未保存的测试备注');
    await cdp.eval(`document.querySelector('[title="保存"]').click();${tick}`);
    assert.deepEqual(await cdp.eval('window.__calls.find(c=>c.name==="nickname").args'),['account-0','未保存的测试备注']);
    await cdp.eval(`window.__pending.nickname.reject(new Error('synthetic save failure'));${tick}`);
    assert.equal(await cdp.eval(`document.querySelector('input[placeholder="输入备注"]').value`),'未保存的测试备注');
    assert.equal(await cdp.eval(`document.querySelector('[title="保存"]').disabled`),false);
    await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));${tick}`);
    const findTail=await cdp.eval(`(()=>{document.activeElement?.blur();window.getSelection().removeAllRanges();return window.find('synthetic-803@example.test',false,false,true)})()`);assert(findTail,'Browser find must cover every retained row');
    await cdp.eval(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='全部').click();${tick}`);
    await cdp.eval(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Pro 账号').click();${tick}`);
    assert.equal(await cdp.eval('document.querySelectorAll(".account-table-grid:not(.account-table-header)").length'),536);
    await cdp.eval(`document.querySelector('.account-table-header button').click();${tick}`);
    assert.equal(await cdp.eval('window.__selected.length'),536);
    assert.equal(await cdp.eval('window.__selected.every(id=>Number(id.split("-")[1])%3!==0)'),true);
    await cdp.eval(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('批量转换')).click();${tick}`);
    assert.equal(await cdp.eval('window.__calls.find(c=>c.name==="bulkConvert").args[0].length'),536);
    await cdp.eval(`window.__pending.bulkConvert.resolve();${tick}`);
    await cdp.eval(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='清除筛选').click();${tick}`);
    const widths=[];
    for(const width of [639,640,767,768,1200]){
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});await cdp.eval(tick);
      widths.push({width,...await geometry()});
    }
    const metric=value=>Object.fromEntries(value.metrics.map(m=>[m.name,m.value]));
    const m0=metric(metricsBefore),m1=metric(metricsAfter);
    const result={variant,initial,sameDataReloads:12,sameDataRowRenders: sameDataRenders,singleSelectionRowRenders:singleSelectionRenders,
      reloadTaskDurationSeconds:m1.TaskDuration-m0.TaskDuration,reloadScriptDurationSeconds:m1.ScriptDuration-m0.ScriptDuration,
      reloadLayoutDurationSeconds:m1.LayoutDuration-m0.LayoutDuration,initialDomCounters:beforeCounters,widths,
      coverage:['804 retained rows','full selection and bulk refresh including offscreen IDs','latest committed callbacks','active refresh survives scrolling','details and unsaved nickname survive current-account reorder','failed nickname save retains draft and allows retry','filtered full selection and bulk conversion include all matching IDs','browser find reaches last account','responsive breakpoints'],
      runtime:'Installed Google Chrome headless; actual packaged React/components/CSS; synthetic account data and inert API only'};
    results.push(result);console.log(JSON.stringify(result));
    assert.equal(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0,JSON.stringify(cdp.events.filter(e=>e.method==='Runtime.exceptionThrown')));
  }finally{
    cdp?.socket.close();
    if(child&&child.exitCode===null&&child.signalCode===null){const closed=new Promise(resolve=>child.once('close',resolve));child.kill('SIGTERM');await Promise.race([closed,sleep(5000)])}
    fs.rmSync(profile,{recursive:true,force:true});
  }
}
fs.writeFileSync(path.join(root,'browser-verification.json'),JSON.stringify({success:true,results},null,2)+'\n');
server.close();
