// Only catalogue filters belong in URLs. Never capture profile inputs, trade names or chat.
const selector='.toolbar input:not([type=checkbox]),.toolbar select,.trait-filters input,.trait-filters select,input[id$="Search"],select[id$="Filter"]';
export function installViewState(host){
 const restored=new WeakSet();let restoring=false;
 const path=()=>location.hash.split('?')[0]||'#/';
 const key=el=>el.id||[...el.attributes].find(a=>a.name.startsWith('data-trait-'))?.name;
 const eligible=el=>el.matches(selector)&&!el.closest('form,.trading-page')&&key(el);
 const read=()=>{try{return JSON.parse(sessionStorage.getItem('archive-view:'+path())||'{}')}catch{return {}}};
 const save=e=>{const el=e.target;if(restoring||!eligible(el))return;const values=read(),name=key(el);values[name]=el.value;try{sessionStorage.setItem('archive-view:'+path(),JSON.stringify(values))}catch{}const params=new URLSearchParams(location.hash.split('?')[1]||'');if(el.value)params.set('filter.'+name,el.value);else params.delete('filter.'+name);history.replaceState(null,'',path()+(params.size?'?'+params:''));};
 host.addEventListener('input',save);host.addEventListener('change',save);
 const restore=()=>{if(restoring)return;const values=read(),params=new URLSearchParams(location.hash.split('?')[1]||'');restoring=true;try{for(const el of host.querySelectorAll(selector)){if(!eligible(el)||restored.has(el))continue;restored.add(el);const name=key(el),value=params.has('filter.'+name)?params.get('filter.'+name):values[name];if(value===undefined||el.value===value)continue;el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}}finally{restoring=false}};
 new MutationObserver(restore).observe(host,{childList:true,subtree:true});
 window.addEventListener('hashchange',event=>{
  const oldHash=new URL(event.oldURL).hash,newHash=new URL(event.newURL).hash;
  if(oldHash.split('?')[0]===newHash.split('?')[0]){
   const before=new URLSearchParams(oldHash.split('?')[1]||''),after=new URLSearchParams(newHash.split('?')[1]||''),values=read();
   for(const name of before.keys())if(name.startsWith('filter.')&&!after.has(name)){
    const field=name.slice(7);values[field]='';
    for(const el of host.querySelectorAll(selector))if(eligible(el)&&key(el)===field){el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));}
   }
   try{sessionStorage.setItem('archive-view:'+path(),JSON.stringify(values))}catch{}
  }
  queueMicrotask(restore);
 });
 return restore;
}
