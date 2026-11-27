import {RARITY_LADDER as ladder,OWNED_VARIANTS as variants,baseVariant,variantRank,isActiveKyber,variantLabel,kyberActivationCost} from './droid-rules.js?v=2026-11-27-protocol';
import {escapeHtml as esc} from './ui-text.js?v=2026-11-08-shared';
const label=variantLabel;
const number=n=>Number(n).toLocaleString('en-GB');
// Chip upgrades stop at dormant Kyber. Colours need Huyang; Scourge is not a chip upgrade.
export function fusionUpgradePath(droid,from,to,upgradeCost){
 if(from===to||from==='SCOURGE'||to==='SCOURGE'||droid.rarity==='ICONIC'||typeof upgradeCost!=='function')return null;
 if(variantRank(from)<0||variantRank(from)>variantRank(to))return null;
 const chips=upgradeCost(droid,from,to),activation=isActiveKyber(to)&&!isActiveKyber(from),reroll=isActiveKyber(to)&&isActiveKyber(from);
 if(!chips&&!activation&&!reroll)return null;
 return {from,to,chips,activation,reroll,activationCrystals:activation?kyberActivationCost(droid):0};
}
export function fusionTargetPlan({target,variant,droids,recipes,units=[],blueprints=[],scrapLevel=0,combineClasses=false,outcome,upgradeCost}){
 const byName=new Map(droids.map(d=>[d.name,d])),recipe=recipes.find(r=>r.name===target.name),fusionNames=new Set(recipes.map(r=>r.name));
 const eligible=u=>byName.has(u.name)&&byName.get(u.name).rarity!=='ICONIC'&&!u.lockedSlot&&!u.locked&&!(['BUILD','FUSION_BUILD'].includes(u.station||u.preferred)&&!u.built);
 const stock=units.filter(eligible),count=(name,v)=>stock.filter(u=>u.name===name&&u.variant===v).length;
 const reaches=o=>o&&o.variant===variant&&(o.name?o.name===target.name:!recipe&&o.kind==='rarity'&&o.rarity===target.rarity&&(!o.requiredClass||o.requiredClass===target.type));
 const result={iconic:target.rarity==='ICONIC',recipe,owned:stock.filter(u=>u.name===target.name&&u.variant===variant).length,ready:[],upgrades:[],farm:null,parts:[],scrapVariant:variants[Math.min(5,Math.max(0,scrapLevel))-1]||null};
 if(result.iconic)return result;
 result.upgrades=stock.filter(u=>u.name===target.name).map(unit=>({unit,path:fusionUpgradePath(target,unit.variant,variant,upgradeCost)})).filter(r=>r.path).sort((a,b)=>a.path.chips-b.path.chips).slice(0,3);
 if(recipe){const need=new Map();recipe.inputs.forEach(n=>need.set(n,(need.get(n)||0)+1));result.parts=[...need].map(([name,total])=>{const have=count(name,variant),bp=blueprints.filter(b=>b.name===name&&b.variant===variant).reduce((n,b)=>n+(b.qty||1),0);return{name,total,have,blueprints:bp,missing:Math.max(0,total-have-bp)};});}
 // Check real, complete, unlocked copies. Every triple is evaluated by the game's existing resolver,
 // including named-recipe collisions and Scourge/Kyber rules. Group by rarity for random rolls.
 const groups=new Map(),seen=new Set();for(const u of stock){const r=byName.get(u.name).rarity;if(recipe?!recipe.inputs.includes(u.name):![target.rarity,ladder[ladder.indexOf(target.rarity)-1]].includes(r))continue;const key=recipe?'recipe':r;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(u);}
 for(const group of groups.values())for(let a=0;a<group.length;a++)for(let b=a+1;b<group.length;b++)for(let c=b+1;c<group.length;c++){
  const inputs=[group[a],group[b],group[c]].sort((x,y)=>Number(y.variant===variant)-Number(x.variant===variant)),o=outcome(inputs);const upgrade=o?.name===target.name?fusionUpgradePath(target,o.variant,variant,upgradeCost):null;if(!reaches(o)&&!upgrade)continue;
  const key=inputs.map(u=>u.name+'|'+u.variant).sort().join(';');if(seen.has(key))continue;seen.add(key);
  result.ready.push({key,inputs,guaranteed:!!o.name,requiredClass:o.requiredClass,resultVariant:o.variant,upgrade});result.ready.sort((a,b)=>Number(b.guaranteed)-Number(a.guaranteed)||(a.upgrade?.chips||0)-(b.upgrade?.chips||0)||Number(!!b.requiredClass)-Number(!!a.requiredClass)||a.inputs.filter(x=>x.trait).length-b.inputs.filter(x=>x.trait).length);if(result.ready.length>3)result.ready.length=3;
 }
 result.ready.sort((a,b)=>Number(b.guaranteed)-Number(a.guaranteed)||(a.upgrade?.chips||0)-(b.upgrade?.chips||0)||Number(!!b.requiredClass)-Number(!!a.requiredClass)||a.inputs.filter(x=>x.trait).length-b.inputs.filter(x=>x.trait).length);result.ready=result.ready.slice(0,3);
 if(!recipe&&result.scrapVariant){
  const inputVariant=result.scrapVariant,prev=ladder[ladder.indexOf(target.rarity)-1];
  // Restrict farming suggestions to ordinary catalogue droids, not fusion, Iconic or reward-only droids.
  const pool=droids.filter(d=>!fusionNames.has(d.name)&&!d.acquisition&&d.type!=='PROTOCOL'&&[prev,target.rarity].includes(d.rarity)&&d.variants?.[inputVariant]);
  let best=null;
  for(let a=0;a<pool.length;a++)for(let b=a;b<pool.length;b++)for(let c=b;c<pool.length;c++){
   const inputs=[pool[a],pool[b],pool[c]].map(d=>({name:d.name,variant:inputVariant})),o=outcome(inputs);if(!reaches(o))continue;
   const cost=inputs.reduce((n,u)=>n+(byName.get(u.name).variants[inputVariant].cost||0),0),score=(o.name?0:o.requiredClass?1:2)*1e18+cost;
   if(!best||score<best.score)best={inputs,guaranteed:!!o.name,requiredClass:o.requiredClass,score};
  }
  result.farm=best;
 }
 return result;
}
export function mountFusionTarget(host,context){
 const {droids,recipes,picture=()=>'',locationLabel=()=>'',rebirthUses=()=>[]}=context;
 host.innerHTML=`<section class="fusion-target"><h2>Which droid do you want?</h2><p>Find ingredients in your Base, or upgrade a finished copy to reach your target.</p><div class="trade-fields"><label>Droid<input data-target list="fusion-targets" placeholder="Search any droid" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"><datalist id="fusion-targets">${droids.map(d=>`<option value="${esc(d.name)}">`).join('')}</datalist></label><label>Target variant<select data-quality></select></label></div><div data-plan aria-live="polite"><p>Choose a droid to see its recipe, available copies and next steps.</p></div></section>`;
 const input=host.querySelector('[data-target]'),select=host.querySelector('[data-quality]'),out=host.querySelector('[data-plan]');let previous=null;
 const part=u=>{const d=droids.find(d=>d.name===u.name),where=locationLabel(u),uses=u.source!==undefined?rebirthUses(u.name):[];return `<span class="fusion-target-part">${picture(d,u.variant)}<strong>${esc(u.name)}</strong><small>${esc(label(u.variant))}</small>${where?`<small class="fusion-input-location">${esc(where)}</small>`:''}${uses.length?`<small>Rebirth uses: ${[...new Set(uses.map(r=>r.at))].map(n=>'R'+n).join(', ')}</small>`:''}</span>`;};
 const row=inputs=>`<div class="fusion-target-inputs">${inputs.map(part).join('<b aria-hidden="true">+</b>')}</div>`;
 const upgradeText=path=>`${path.chips?`Upgrade ${esc(label(path.from))} to ${esc(label(baseVariant(path.to)))}: <strong>${number(path.chips)} chips</strong>.`:'No chip upgrade needed.'}${path.activation?` Then activate at Huyang (${number(path.activationCrystals)} Kyber Crystals, or an alternative payment). Activation rolls a colour; ${esc(label(path.to))} is not guaranteed.`:''}${path.reroll?` This copy already meets active Kyber rebirth requirements. Only reroll at Huyang if you specifically want ${esc(label(path.to))}. Each reroll costs Kyber Crystals; the selected colour is not guaranteed on the next roll.`:''}`;
 const draw=()=>{
  const d=droids.find(d=>d.name===input.value.trim().toUpperCase());
  if(!d){out.innerHTML='<p>Select a droid from the search suggestions.</p>';return;}
  if(previous!==d.name){previous=d.name;const initial=variants[Math.min(5,context.scrapLevel)-1]||'DEFAULT';select.innerHTML=variants.filter(v=>d.variants[v]).map(v=>`<option ${v===initial?'selected':''} value="${v}">${esc(label(v))}</option>`).join('');}
  const params=new URLSearchParams(location.hash.split('?')[1]||'');params.set('target',d.name);params.set('quality',select.value);history.replaceState(null,'',location.hash.split('?')[0]+'?'+params);
  const v=select.value,p=fusionTargetPlan({...context,target:d,variant:v});
  if(p.iconic){out.innerHTML=`${part({name:d.name,variant:v})}<p><strong>Iconics cannot be made through fusion.</strong> Unlock this droid through its tutorial, shop or event source. <a href="#/droid/${d.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}">Open droid page</a></p>`;return;}
  const parts=p.parts.map(x=>`<article>${part({name:x.name,variant:v})}<p>Need ${x.total} &middot; ${Math.min(x.total,x.have)} ready &middot; ${Math.min(Math.max(0,x.total-x.have),x.blueprints)} blueprints</p><strong>${x.missing?`Find ${x.missing} more`:x.have>=x.total?'Ready to use':'Build stored blueprints'}</strong></article>`).join('');
  const uses=rebirthUses(d.name),last=Math.max(0,...uses.map(r=>r.at));
  const route=r=>`<article class="fusion-target-route fusion-input-route"><h4>${r.upgrade?'Fuse, then upgrade':r.guaranteed?'Fuse this exact recipe':'Random result: target is possible'}</h4>${row(r.inputs)}<ol class="fusion-route-steps"><li>Move these three completed copies to Fusion. ${r.guaranteed?`The result is <strong>${esc(d.name)} &middot; ${esc(label(r.resultVariant||v))}</strong>.`:`The result is random${r.requiredClass?` within ${esc(r.requiredClass)}`:''}; ${esc(d.name)} is one possible outcome.`}</li><li>Finish the result in a Fusion Build tank.${r.upgrade?'':' It is then ready to use.'}</li>${r.upgrade?`<li>${upgradeText(r.upgrade)}</li>`:''}</ol>${r.inputs.some(u=>u.trait)?'<p class="fusion-route-caution">Recorded input traits do not transfer to the result. Fusion Preservation may return an input, but removes its trait.</p>':''}</article>`;
  out.innerHTML=`<div class="fusion-target-heading">${picture(d,v)}<div><h3>${esc(d.name)} &middot; ${esc(label(v))}</h3><p>${p.owned?`${p.owned} completed matching ${p.owned===1?'copy':'copies'} in your available Base.`:p.upgrades.length?'You have a copy you can upgrade.':p.ready.length?'Your Base has a route to this target.':'Collect or finish the ingredients below.'}</p></div></div>
   ${isActiveKyber(v)?'<p class="fusion-colour-note">Every active Kyber colour meets Kyber rebirth requirements. You only need this particular colour for your own collection or bonus goals.</p>':''}
   ${p.upgrades.length?`<section class="fusion-owned-upgrades"><h4>Copies you already own</h4>${p.upgrades.map(r=>`<article class="fusion-target-route"><div class="fusion-upgrade-copy">${part(r.unit)}<p>${upgradeText(r.path)}</p></div><p class="muted">Keep this copy; no recipe inputs are spent.</p></article>`).join('')}</section>`:''}
   <h4>${p.owned?'Make another copy':'Fuse from your Base'}</h4>${p.ready.length?route(p.ready[0])+(p.ready.length>1?`<details class="fusion-extra-routes"><summary>${p.ready.length-1} other ${p.ready.length===2?'route':'routes'} from your Base</summary>${p.ready.slice(1).map(route).join('')}</details>`:''):`<p>${p.owned?'You already have the selected target. No completed triple for another copy is available.':'No available completed triple reaches this target yet.'} Locked copies and unfinished builds are excluded.</p>`}
   ${p.recipe?`<details class="fusion-recipe-checklist" ${p.owned||p.ready.length||p.upgrades.length?'':'open'}><summary>Recipe ingredients at ${esc(label(v))}</summary><p>Matching these variants makes the target directly. You can also fuse lower variants, finish the result, then upgrade it with chips. The routes above show your available combinations and their upgrade costs.</p><div class="fusion-target-inputs">${parts}</div></details>`:'<p>This is an ordinary droid: finding its blueprint or upgrading an owned copy may avoid a random fusion roll.</p>'}
   ${p.recipe?`<section class="fusion-target-rebirth"><h4>Keep it for rebirths</h4><p>Once built, ${esc(d.name)} counts as <strong>${esc([...new Set(p.recipe.inputs)].join(' and '))}</strong> at its current variant. Upgrade the fusion itself when a later requirement needs a higher variant; active Kyber is required for Kyber rebirths.</p>${uses.length?`<p>Keep through <strong>R${last}</strong> in your current cycle.</p><details><summary>${uses.length} upcoming ${uses.length===1?'requirement':'requirements'}</summary><ul>${uses.map(r=>`<li>R${r.at}: ${esc(r.droidName)} &middot; ${esc(label(r.variant))}</li>`).join('')}</ul></details>`:'<p>No remaining ingredient requirements in your recorded cycle. Check income and other uses before selling.</p>'}<a href="#/fusion-lab?view=rebirth&coverageSearch=${encodeURIComponent(d.name)}&coverageMultiple=0">Compare rebirth cycles</a></section>`:''}
   <details class="fusion-target-farming" ${p.recipe?'':'open'}><summary>Farming with Blueprint Scrap</summary>${!p.scrapVariant?'<p>Unlock Blueprint Scrap to find blueprints while scrapping.</p>':p.farm?`<p>Blueprint Scrap level ${context.scrapLevel} can produce ${esc(label(p.scrapVariant))} blueprints. Farm and build these three:</p>${row(p.farm.inputs)}<p>${p.farm.guaranteed?'This triple guarantees the selected droid and variant.':p.farm.requiredClass?`With Fusion Combine Classes, this triple narrows the random result to ${esc(p.farm.requiredClass)} droids at the target rarity.`:'This triple can roll the target, but other classes can also come out. Fusion Combine Classes narrows results when all three inputs share a class.'}</p><p>Blueprint drops and random fusion results are not guaranteed targets.</p>`:`<p>Blueprint Scrap level ${context.scrapLevel} reaches ${esc(label(p.scrapVariant))}. ${p.recipe?'Find the named ingredients, build and fuse them, then upgrade the finished result if needed.':'No single-fusion route from that scrap quality reaches this exact target. Find the target directly, upgrade a copy, or choose a different variant.'}</p>`}</details>
   <p class="muted fusion-plan-note">Planning does not change your Base. Fusion normally consumes all three inputs. Finish the result and any needed upgrades before rebirthing.</p>`;
 };
 input.addEventListener('change',draw);select.addEventListener('change',draw);
 const initial=new URLSearchParams(location.hash.split('?')[1]||'');if(initial.get('target')){input.value=initial.get('target');draw();if([...select.options].some(o=>o.value===initial.get('quality'))){select.value=initial.get('quality');draw();}}
}
