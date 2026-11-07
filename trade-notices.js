import {traitIcon} from './trait-picker.js?v=2026-11-03-trait-picker';
import {TRAITS} from './traits.js?v=2026-11-02-scourgedex-crit';
const preference='droid-archive-trade-notices';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const items=v=>Array.isArray(v)?v:v?[v]:[];
export const tradeNoticesEnabled=()=>localStorage.getItem(preference)!=='0';
export function setTradeNoticesEnabled(enabled){localStorage.setItem(preference,enabled?'1':'0');window.dispatchEvent(new Event('trade-notice-preference'));}
export function wireTradeNoticeSettings(host){
 const section=document.createElement('div');section.className='side-field';
 section.innerHTML=`<p class="side-title">Trading notifications</p><label class="side-check"><input type="checkbox" data-trade-notices ${tradeNoticesEnabled()?'checked':''}> Show new trade listings</label><small>Show a 10-second popup on this device.</small>`;
 host.prepend(section);section.querySelector('input').onchange=e=>setTradeNoticesEnabled(e.target.checked);
}
export function startTradeNotices({client,ready=async()=>{},droids,picture,account=()=>'',interval=15000,duration=10000}){
 let seen=new Set(),initialised=false,busy=false,disposed=false,queue=[],active=null,hideTimer=null,identity=account(),since=Date.now();
 const close=()=>{clearTimeout(hideTimer);active?.remove();active=null;showNext();};
 const reset=()=>{queue=[];clearTimeout(hideTimer);active?.remove();active=null;seen.clear();initialised=false;since=Date.now();};
 const icon=c=>{const d=droids.find(d=>d.name===c.name),trait=TRAITS.find(t=>String(t.id)===String(c.trait));
 const label=[c.name,c.variant,c.type,trait?.name,c.traitTier].filter(Boolean).join(' Â· ')||'Any droid';
 return `<span class="trade-notice-icon" title="${esc(label)}" aria-label="${esc(label)}">${d?picture(d,c.variant==='KYBER_ACTIVE'?'KYBER_GREEN':c.variant||'DEFAULT'):trait?`<img src="${esc(traitIcon(trait))}" alt="">`:['WORKER','ASTROMECH','BATTLE','PROTOCOL'].includes(c.type)?`<img src="assets/types/${c.type==='PROTOCOL'?'Protocol.svg':c.type[0]+c.type.slice(1).toLowerCase()+'_Droid_-_Droid_-_Droid_Tycoon.png'}" alt="">`:'<span aria-hidden="true">âœ¦</span>'}</span>`;};
 const group=(rows,empty)=>items(rows).map(icon).join('')||`<small>${empty}</small>`;
 function showNext(){
  if(disposed||active||!tradeNoticesEnabled()||document.hidden)return;
  let row;while(queue.length){const candidate=queue.shift();if(Date.now()-Date.parse(candidate.created_at)<120000){row=candidate;break;}}
  if(!row)return;
  active=document.createElement('aside');active.className='trade-notice';active.setAttribute('aria-label','New trade listing');
  active.innerHTML=`<button type="button" class="trade-notice-close" aria-label="Dismiss trade notification">Ã—</button><p role="status">Someone listed a trade</p><a href="#/trading/${encodeURIComponent(row.id)}" aria-label="View new trade listing"><span class="trade-notice-items" aria-label="Offering">${group(row.giving,'No droid listed')}</span><span class="trade-notice-arrow" aria-hidden="true">â‡„</span><span class="trade-notice-items" aria-label="Wanted">${group(row.criteria,'Nothing requested')}</span></a>`;
  active.querySelector('button').onclick=close;active.querySelector('a').onclick=close;document.body.append(active);hideTimer=setTimeout(close,duration);
 }
 async function poll(){
  if(disposed||busy||document.hidden||!tradeNoticesEnabled())return;
  if(identity!==account()){identity=account();reset();}
  busy=true;const requestIdentity=identity;
  try{await ready();if(disposed||!client())return;const {data,error}=await client().rpc('droid_trade_browse');
   if(error||!Array.isArray(data)||disposed||requestIdentity!==account()||!tradeNoticesEnabled())return;
   if(initialised){const fresh=data.filter(r=>!seen.has(r.id)&&r.status==='open'&&!r.mine&&Date.parse(r.created_at)>=since);queue.push(...fresh.reverse());queue=queue.slice(-5);}
   // Keep identifiers for this visit so a status change cannot replay a listing.
   data.forEach(r=>seen.add(r.id));initialised=true;showNext();
  }catch{/* Retry quietly; notifications never interrupt the current page. */}finally{busy=false;}
 }
 const preferenceChanged=()=>{reset();poll();};
 const visibility=()=>{if(document.hidden){queue=[];clearTimeout(hideTimer);active?.remove();active=null;}else poll();};
 const storage=e=>{if(e.key===preference)preferenceChanged();};
 window.addEventListener('trade-notice-preference',preferenceChanged);window.addEventListener('storage',storage);document.addEventListener('visibilitychange',visibility);
 const timer=setInterval(poll,interval);poll();
 return {poll,dispose(){disposed=true;reset();clearInterval(timer);window.removeEventListener('trade-notice-preference',preferenceChanged);window.removeEventListener('storage',storage);document.removeEventListener('visibilitychange',visibility);}};
}
