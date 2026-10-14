window.__mock = (name, args) => {
  window.__calls.push({name,args,version:window.__version});
  return new Promise((resolve,reject)=>{window.__pending[name]={resolve,reject}});
};
function TestRoot() {
  const makeAccounts=()=>Array.from({length:804},(_,i)=>({id:'account-'+i,email:'synthetic-'+i+'@example.test',nickname:'测试账号 '+i,
    token:'synthetic-access-'+i,sessionToken:'synthetic-session-'+i,sessionTokenReady:true,membershipType:i%3?'pro':'free',
    isCurrent:i===0,used:i%100,limit:100,usagePercent:i%100,daysRemaining:12,totalCost:1,includedCost:1,
    modelUsage:{'synthetic-model':{cost:1,tokens:200,inputTokens:100,outputTokens:100,cacheReadTokens:0,cacheWriteTokens:0}},tags:[],refreshStatus:'success'}));
  const [accounts,setAccounts]=reactExports.useState(makeAccounts);
  const [version,setVersion]=reactExports.useState(0);
  const [shown,setShown]=reactExports.useState(true);
  const [aiEnabled,setAiEnabled]=reactExports.useState(true);
  window.__version=version;
  window.__accounts=accounts;
  window.__setAccounts=next=>{
    if(window.__variant==='patched')setAccounts(previous=>cptReuseAccountSnapshot(previous,next));
    else setAccounts(next);
    setVersion(previous=>previous+1);
  };
  window.__setVersion=setVersion;
  window.__setShown=setShown;
  window.__setAiEnabled=setAiEnabled;
  const onSelectedIdsChange=ids=>{window.__selected=ids;setVersion(previous=>previous+1)};
  const onRefresh=id=>{window.__calls.push({name:'refreshCallback',version});return window.__mock('refresh',[id])};
  const onConvert=id=>window.__mock('convert',[id]);
  const onSeamlessSwitch=id=>window.__mock('seamless',[id]);
  const onAiLogin=id=>window.__mock('aiLogin',[id]);
  const onUpdateNickname=(...args)=>window.__mock('nickname',args);
  return jsxRuntimeExports.jsx('div',{style:{height:'100%',padding:'12px'},hidden:!shown,children:jsxRuntimeExports.jsx(AccountList,{
    accounts,onSelectedIdsChange,onRefresh,onConvert,onSeamlessSwitch,onAiLogin:aiEnabled?onAiLogin:undefined,onUpdateNickname,
    onSwitch:id=>window.__calls.push({name:'switch',args:[id],version}),
    onDelete:id=>window.__calls.push({name:'delete',args:[id],version}),
    onRefreshSelected:ids=>window.__mock('bulkRefresh',[ids]),onConvertSelected:ids=>window.__mock('bulkConvert',[ids])
  })});
}
client.createRoot(document.getElementById('root')).render(jsxRuntimeExports.jsx(MessageProvider,{children:jsxRuntimeExports.jsx(TestRoot,{})}));
window.__ready=true;
