import {traitIcon} from './trait-picker.js?v=2026-11-08-shared';
import {TRAITS,traitEligible} from './traits.js?v=2026-11-02-scourgedex-crit';
import {escapeHtml as esc} from './ui-text.js?v=2026-11-08-shared';
export const COMPANION_TRAIT_GOALS={scrap:'Scrap Farming',credits:'Credit Gain',pickaxe:'Pickaxe Gain',crafting:'Depot Crafting',health:'Health',chips:'Upgrade Chips'};
export function companionTraitOptions(droid,goal,{fusion=false,tier='Rainbow'}={}){
 const ids={scrap:[7,11,...(droid.type==='PROTOCOL'?[12]:[])],credits:[11,...(droid.type==='PROTOCOL'?[12]:[])],pickaxe:[1,4,5,18,...(droid.type==='ASTROMECH'?[12]:[]),...(fusion?[8]:[])],crafting:[3,...(droid.type==='WORKER'?[12]:[])],health:[2,...(droid.type==='BATTLE'?[12]:[])],chips:[6]}[goal]||[];
 return TRAITS.filter(t=>ids.includes(t.id)&&traitEligible(t,droid)&&Object.hasOwn(t.values,tier));
}
export function mountCompanionTraitComparison(mountHost,{droid,copies,slots,locationLabel,evaluate,fmt}){
 const settingsKey='droid-archive-companion-comparison';
 let saved={};try{saved=JSON.parse(localStorage.getItem(settingsKey))||{}}catch{}
 let open=saved.open===true;
 let goal=Object.hasOwn(COMPANION_TRAIT_GOALS,saved.goal)?saved.goal:'scrap',fusion=saved.fusion===true,copy=0,seat=copies[0]?.station==='COMPANION'?copies[0].slot:(slots.find(s=>!s.unit)||slots[0])?.slot,boost=Math.max(1,Math.min(100,Number(saved.boost)||1));
 if(slots.some(s=>s.slot===saved.seat))seat=saved.seat;
 const saveSettings=()=>{try{localStorage.setItem(settingsKey,JSON.stringify({goal,fusion,seat,boost,open}))}catch{}};
 mountHost.replaceChildren();
 const toggleBar=document.createElement('div');toggleBar.className='companion-trait-toggle';
 const toggle=document.createElement('button');toggle.type='button';toggle.className='btn secondary';toggle.textContent='Trait comparison';
 const host=document.createElement('div');host.className='companion-trait-comparison';
 host.id='trait-comparison-'+crypto.randomUUID();toggle.setAttribute('aria-controls',host.id);
 toggleBar.append(toggle);mountHost.append(toggleBar,host);
 const setOpen=()=>{host.hidden=!open;toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-pressed',String(open));};
 toggle.onclick=()=>{open=!open;setOpen();saveSettings();};setOpen();
 const draw=()=>{
  const options=['Rainbow','Diamond','Gold','Default'].flatMap(tier=>companionTraitOptions(droid,goal,{fusion:goal==='pickaxe'&&fusion,tier}).map(trait=>({trait,tier})));
  const rows=[...options,{trait:null,tier:null}].map(({trait,tier})=>({trait,tier,result:evaluate({unit:copies[copy],slot:seat,trait:trait?{id:trait.id,tier}:null,goal,fusion:goal==='pickaxe'&&fusion,creditBoost:boost})}));
  rows.sort((a,b)=>(Number.isFinite(b.result.score)?b.result.score:-Infinity)-(Number.isFinite(a.result.score)?a.result.score:-Infinity));
  const best=Math.max(...rows.filter(r=>Number.isFinite(r.result.score)).map(r=>r.result.score));
  host.innerHTML=`<h3>Trait comparison <small>${esc(droid.name)}</small></h3><div class="companion-trait-controls"><label>Goal<select data-trait-compare-goal>${Object.entries(COMPANION_TRAIT_GOALS).map(([id,name])=>`<option value="${id}" ${goal===id?'selected':''}>${name}</option>`).join('')}</select></label>${copies.length>1?`<label>Copy<select data-companion-copy>${copies.map((u,i)=>`<option value="${i}" ${copy===i?'selected':''}>${esc(locationLabel(u))}</option>`).join('')}</select></label>`:''}<label>Companion slot<select data-companion-seat>${slots.map(s=>`<option value="${s.slot}" ${seat===s.slot?'selected':''}>${s.slot+1} - ${esc(s.unit?.name||'Empty')}</option>`).join('')}</select></label>${goal==='pickaxe'?`<label class="companion-fusion-toggle"><input type="checkbox" data-companion-fusion ${fusion?'checked':''}> Fusion</label>`:''}${['scrap','credits'].includes(goal)?`<label>Credit boost<input type="number" min="1" max="100" step="any" data-companion-boost value="${boost}"></label>`:''}</div>
  <div class="companion-trait-results" tabindex="0" role="region" aria-label="Ranked trait results"><table><thead><tr><th scope="col">Trait (best first)</th>${(rows.find(r=>r.result.metrics)?.result.metrics||[]).map(([name])=>`<th scope="col">${esc(name)}</th>`).join('')}</tr></thead><tbody>${rows.map(({trait,tier,result})=>`<tr class="companion-trait-result ${Number.isFinite(result.score)&&Math.abs(result.score-best)<=Math.max(1,best)*1e-9?'is-best':''}"><th scope="row"><span class="companion-trait-name">${trait?`<img src="${esc(traitIcon(trait))}" alt=""><span>${esc(trait.name)} <small>${esc(tier)}</small></span>`:'No trait'}</span></th>${result.pending?`<td>${esc(result.pending)}</td>`:result.metrics.map(([,value])=>`<td>${esc(typeof value==='number'?fmt(value):value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const bind=(selector,fn)=>host.querySelector(selector)?.addEventListener('change',e=>{fn(e.target);saveSettings();draw()});
  bind('[data-trait-compare-goal]',e=>goal=e.value);bind('[data-companion-copy]',e=>copy=Number(e.value));bind('[data-companion-seat]',e=>seat=Number(e.value));bind('[data-companion-fusion]',e=>fusion=e.checked);bind('[data-companion-boost]',e=>boost=Math.max(1,Math.min(100,Number(e.value)||1)));
 };draw();
}
