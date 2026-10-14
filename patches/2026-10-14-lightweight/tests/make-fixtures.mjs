import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.argv[2]??path.join(path.dirname(new URL(import.meta.url).pathname),'../build'));
const fixtures=path.join(root,'fixtures');fs.mkdirSync(fixtures,{recursive:true});
for(const variant of ['original','patched']){
  let source=fs.readFileSync(path.join(root,'renderer.'+variant),'utf8');
  const ending=source.indexOf('client.createRoot(document.getElementById("root")).render(');
  if(ending<0||source.indexOf('client.createRoot(document.getElementById("root")).render(',ending+1)!==-1)throw new Error('Ambiguous bootstrap');
  source=source.slice(0,ending);
  source=source.replace('  const isActive = account.isCurrent;','  window.__rowRenders++;\n  const isActive = account.isCurrent;');
  source+='\n'+fs.readFileSync(path.join(root,'fixture-harness.js'),'utf8');
  fs.writeFileSync(path.join(fixtures,variant+'.js'),source);
  fs.copyFileSync(path.join(root,'css.original'),path.join(fixtures,variant+'.css'));
  fs.writeFileSync(path.join(fixtures,variant+'.html'),`<!doctype html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="${variant}.css"><style>html,body,#root{height:100%;margin:0;} .animate-fade-in{animation:none!important} </style></head><body><div id="root"></div><script>window.__variant=${JSON.stringify(variant)};window.__rowRenders=0;window.__calls=[];window.__pending={};window.api=new Proxy({openCursorDashboard:(...args)=>window.__mock('dashboard',args)}, {get:(o,k)=>{if(k in o)return o[k];return (...args)=>{throw new Error('Unexpected inert API '+String(k))}}});window.fetch=()=>Promise.reject(new Error('Network disabled in synthetic fixture'));</script><script type="module" src="${variant}.js"></script></body></html>`);
}
console.log(JSON.stringify({fixtures,accounts:'synthetic only',original_bootstrap:'removed',real_backend:'absent'}));
