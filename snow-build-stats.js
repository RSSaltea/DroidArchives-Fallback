const PREFIX='droid-snow-build:';
const NAMES=new Set(['GONK','R7','BB','MOUSE','EG-58','EGL','ECG','PROTO-ROLLER','ORB-WALKER','SNOW MOUSE','TRI-TEK','CHOPPER','OPTI-POD']);
export const snowDay=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));
let api=()=>null;
export function setSnowStatsClient(getClient){api=getClient;}
export function createSnowCounter({storage,client=()=>api(),now=Date.now,onChange=()=>{}}={}){
 const memory=new Map();let busy=false,global=null,status='loading';
 const rows=()=>{const map=new Map(memory);try{for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(PREFIX)){const event=JSON.parse(storage.getItem(key));if(event?.id&&NAMES.has(event.name)&&Number.isFinite(Date.parse(event.at)))map.set(event.id,event);}}}catch{}return [...map.values()];};
 const save=event=>{memory.set(event.id,event);try{storage.setItem(PREFIX+event.id,JSON.stringify(event));}catch{}};
 const snapshot=()=>{const events=rows(),days={};for(const e of events){const day=snowDay(e.at);days[day]=(days[day]||0)+1;}return{personal:{total:events.length,today:days[snowDay(now())]||0,days},global,status};};
 const notify=()=>onChange(snapshot());
 function record({id,name}){
  if(!NAMES.has(name)||!id||rows().some(e=>e.id===id))return;
  save({id,name,at:new Date(now()).toISOString(),sent:false});notify();
 }
 async function refresh(){
  const service=client();if(!service||busy)return;busy=true;
  try{
   // Stable event IDs make cross-tab sends and interrupted retries harmless.
   for(const event of rows().filter(e=>!e.sent).slice(0,12)){
    if(now()-Date.parse(event.at)>30*86400000){save({...event,sent:true});continue;}
    const {error}=await service.rpc('droid_snow_build_complete',{event:event.id,droid_name:event.name,completed_at:event.at});
    if(error)throw error;save({...event,sent:true});
   }
   const {data,error}=await service.rpc('droid_snow_build_stats');if(error)throw error;
   global=data;status='ready';
  }catch(error){status=['PGRST202','42883'].includes(error?.code)?'setup':'offline';}
  finally{busy=false;notify();}
 }
 return{record,refresh,snapshot};
}
export function mountSnowCounters(){
 let storage;try{storage=localStorage}catch{}
 const panel=document.createElement('details');panel.className='snow-build-stats';panel.innerHTML='<summary aria-label="Snow droids built">☃ <span data-snow-count>0</span> built</summary><section><strong>Snow droids built</strong><div data-snow-totals></div><button type="button" data-snow-refresh>Refresh</button><button type="button" data-snow-close>Close</button></section>';document.body.append(panel);
 function render(s){
  panel.querySelector('[data-snow-count]').textContent=s.personal.total.toLocaleString();
  const global=s.status==='ready'?s.global:null,count=n=>Number.isFinite(Number(n))?Number(n).toLocaleString():'—';
  const today=snowDay(Date.now()),days=Array.from({length:7},(_,i)=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-i);return d.toISOString().slice(0,10)});
  panel.querySelector('[data-snow-totals]').innerHTML=`<table><thead><tr><th></th><th>You</th><th>Everyone</th></tr></thead><tbody><tr><th>Today</th><td>${count(s.personal.today)}</td><td>${global?count(global.today):'—'}</td></tr><tr><th>All time</th><td>${count(s.personal.total)}</td><td>${global?count(global.total):'—'}</td></tr></tbody></table><details><summary>Last 7 days</summary><table><thead><tr><th>Date</th><th>You</th><th>Everyone</th></tr></thead><tbody>${days.map(day=>`<tr><th>${day.slice(5)}</th><td>${count(s.personal.days[day]||0)}</td><td>${global?count(global.days?.[day]||0):'—'}</td></tr>`).join('')}</tbody></table></details><p>Days reset at UK midnight. Your counts are saved in this browser. Rebuilds count; owner test builds do not.</p><p>${s.status==='setup'?'Site-wide counter setup is pending.':s.status==='offline'?'Site-wide counts are temporarily unavailable; builds will retry syncing.':s.status==='loading'?'Connecting to site-wide counts…':'Site-wide counts update about once a minute.'} Counts start when this feature is enabled.</p>`;
 }
 const counter=createSnowCounter({storage,onChange:render});render(counter.snapshot());
 panel.querySelector('[data-snow-refresh]').onclick=()=>counter.refresh();
 panel.querySelector('[data-snow-close]').onclick=()=>panel.open=false;
 panel.addEventListener('toggle',e=>{if(e.target===panel&&panel.open)counter.refresh()});
 panel.addEventListener('keydown',e=>{if(e.key==='Escape'){panel.open=false;panel.querySelector('summary').focus();}});
 addEventListener('storage',e=>{if(e.key?.startsWith(PREFIX))render(counter.snapshot())});
 setInterval(()=>{render(counter.snapshot());if(!document.hidden)counter.refresh()},60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)counter.refresh()});
 return counter;
}
