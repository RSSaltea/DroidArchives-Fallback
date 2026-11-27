import {OWNED_VARIANTS,rebirthVariantReady,variantLabel,baseVariant} from './droid-rules.js?v=2026-11-27-protocol';
import {escapeHtml as esc} from './ui-text.js?v=2026-11-08-shared';

// Requirements and recipes come from the same loaded sources as the Rebirth page.
// A repeated recipe input counts once; repeated rebirth uses remain visible.
export function fusionRebirthCoverage({recipes,cycles,cycle=null,from=1,multipleOnly=true,query=''}){
 const start=Math.max(1,Math.trunc(Number(from)||1)),search=query.trim().toUpperCase();
 return recipes.flatMap(recipe=>{
  if(search&&![recipe.name,...recipe.inputs].some(name=>name.includes(search)))return [];
  const ingredients=new Set(recipe.inputs),matches=[];
  for(const [index,requirements] of Object.entries(cycles)){
   if(cycle!==null&&Number(index)!==Number(cycle))continue;
   const uses= requirements.flatMap(row=>Number(row.to)<start?[]:(row.requiredDroids||[])
    .filter(req=>ingredients.has(req.droidName)).map(req=>({name:req.droidName,rebirth:Number(row.to),variant:req.variant})));
   uses.sort((a,b)=>a.rebirth-b.rebirth||a.name.localeCompare(b.name));
   const names=[...new Set(uses.map(use=>use.name))];
   if(names.length<(multipleOnly?2:1))continue;
   const minimumVariant=OWNED_VARIANTS.find(v=>uses.every(use=>rebirthVariantReady(v,use.variant)))||null;
   matches.push({cycle:Number(index),uses,names,minimumVariant});
  }
  return matches.length?[{recipe,cycles:matches}]:[];
 }).sort((a,b)=>a.recipe.name.localeCompare(b.recipe.name));
}

export function mountFusionRebirth(host,{recipes,cycles,droids,picture,currentCycle=0,currentRebirth=0,plan}){
 const params=new URLSearchParams(location.hash.split('?')[1]||'');
 const entries=Object.keys(cycles).sort((a,b)=>Number(a)-Number(b));
 const max=Math.max(1,...Object.values(cycles).flatMap(rows=>rows.map(row=>Number(row.to))));
 const initial= params.get('coverageCycle')??String(currentCycle);
 host.innerHTML=`<section class="fusion-coverage"><h2>One fusion, several rebirth droids</h2>
  <p>A finished fusion counts as each of its recipe ingredients. Find combinations that cover different required droids in the same cycle.</p>
  <div class="fusion-coverage-filters">
   <label>Cycle<select data-coverage-cycle><option value="all">All cycles</option>${entries.map(key=>`<option value="${key}">Cycle ${Number(key)+1}${Number(key)===currentCycle?' (current)':''}</option>`).join('')}</select></label>
   <label>From rebirth (inclusive)<input data-coverage-from type="number" min="1" max="${max}" step="1" value="${Math.min(max,Math.max(1,Number(params.get('coverageFrom'))||(Number(currentRebirth)+1)))}"></label>
   <label>Find a fusion or ingredient<input data-coverage-search type="search" placeholder="e.g. X-ONK or KX" autocomplete="off" value="${esc(params.get('coverageSearch')||'')}"></label>
  </div>
  <label class="fusion-coverage-check"><input data-coverage-multiple type="checkbox" ${params.get('coverageMultiple')==='0'?'':'checked'}>Only fusions covering two or more different required droids</label>
  <p class="muted fusion-coverage-note">Requirements before your starting rebirth are excluded. The final target covers all listed uses. You can make the fusion at a lower variant and upgrade it before each requirement. Active Kyber is required for Kyber requirements; unfinished builds do not count.</p>
  <p data-coverage-count role="status"></p><div class="fusion-coverage-grid" data-coverage-results></div></section>`;
 const select=host.querySelector('[data-coverage-cycle]'),from=host.querySelector('[data-coverage-from]'),search=host.querySelector('[data-coverage-search]'),multiple=host.querySelector('[data-coverage-multiple]');
 select.value=initial==='all'||entries.includes(initial)?initial:entries[0];
 const variantText=v=>baseVariant(v)==='KYBER'?'Kyber (active)':variantLabel(v);
 const draw=()=>{
  const start=Math.min(max,Math.max(1,Math.trunc(Number(from.value)||1)));
  const matches=fusionRebirthCoverage({recipes,cycles,cycle:select.value==='all'?null:Number(select.value),from:start,multipleOnly:multiple.checked,query:search.value});
  const p=new URLSearchParams(location.hash.split('?')[1]||'');
  p.set('coverageCycle',select.value);p.set('coverageFrom',start);p.set('coverageMultiple',multiple.checked?'1':'0');
  if(search.value)p.set('coverageSearch',search.value);else p.delete('coverageSearch');
  history.replaceState(null,'',location.hash.split('?')[0]+'?'+p);
  host.querySelector('[data-coverage-count]').textContent=`${matches.length} fusion${matches.length===1?'':'s'} · ${select.value==='all'?'all cycles':'Cycle '+(Number(select.value)+1)} · rebirth ${start} onwards`;
  host.querySelector('[data-coverage-results]').innerHTML=matches.length?matches.map(({recipe,cycles:uses})=>{
   const droid=droids.find(d=>d.name===recipe.name),counts=new Map();recipe.inputs.forEach(n=>counts.set(n,(counts.get(n)||0)+1));
   return `<article class="fusion-coverage-card" data-coverage-recipe="${esc(recipe.name)}">
    <header>${picture(droid,'DEFAULT')}<div><h3>${esc(recipe.name)}</h3><p>${esc([...counts].map(([name,count])=>`${count} × ${name}`).join(' + '))}</p></div></header>
    ${uses.map(use=>`<section class="fusion-coverage-cycle"><div class="fusion-coverage-cycle-title"><h4>Cycle ${use.cycle+1}</h4><span>${use.names.length} different droids · ${new Set(use.uses.map(x=>x.rebirth)).size} rebirths</span></div>
     <ul>${use.uses.map(req=>`<li><strong>R${req.rebirth}</strong><span>${esc(req.name)}</span><span class="fusion-required-variant">${esc(variantText(req.variant))}</span></li>`).join('')}</ul>
     <footer><p>Final target: <strong>${esc(variantText(use.minimumVariant))}</strong><br>Keep through R${use.uses[use.uses.length-1].rebirth}</p><button class="btn secondary" type="button" data-coverage-plan="${esc(recipe.name)}" data-coverage-variant="${esc(use.minimumVariant||'DEFAULT')}">Plan this target</button></footer>
    </section>`).join('')}</article>`;
  }).join(''):'<div class="fusion-coverage-empty"><h3>No matching fusions</h3><p>Try an earlier rebirth, another cycle or a different search. Uncheck the multiple-droid filter to include fusions with just one required ingredient remaining.</p></div>';
 };
 select.addEventListener('change',draw);multiple.addEventListener('change',draw);search.addEventListener('input',draw);
 from.addEventListener('input',draw);from.addEventListener('change',()=>{from.value=Math.min(max,Math.max(1,Math.trunc(Number(from.value)||1)));draw();});
 host.addEventListener('click',event=>{const button=event.target.closest('[data-coverage-plan]');if(button)plan(button.dataset.coveragePlan,button.dataset.coverageVariant);});
 draw();
}
