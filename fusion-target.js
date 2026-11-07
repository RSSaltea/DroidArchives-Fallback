const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ladder=['COMMON','RARE','EPIC','LEGENDARY','MYTHIC'];
const variants=['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR','KYBER','KYBER_GREEN','KYBER_BLUE','KYBER_PURPLE','SCOURGE'];
const label=v=>v.replaceAll('_',' ');
export function fusionTargetPlan({target,variant,droids,recipes,units=[],blueprints=[],scrapLevel=0,combineClasses=false,outcome}){
 const byName=new Map(droids.map(d=>[d.name,d])),recipe=recipes.find(r=>r.name===target.name),fusionNames=new Set(recipes.map(r=>r.name));
 const eligible=u=>byName.has(u.name)&&byName.get(u.name).rarity!=='ICONIC'&&!u.lockedSlot&&!u.locked&&!(['BUILD','FUSION_BUILD'].includes(u.station||u.preferred)&&!u.built);
 const stock=units.filter(eligible),count=(name,v)=>stock.filter(u=>u.name===name&&u.variant===v).length;
 const reaches=o=>o&&o.variant===variant&&(o.name?o.name===target.name:!recipe&&o.kind==='rarity'&&o.rarity===target.rarity&&(!o.requiredClass||o.requiredClass===target.type));
 const result={iconic:target.rarity==='ICONIC',recipe,owned:stock.filter(u=>u.name===target.name&&u.variant===variant).length,ready:[],farm:null,parts:[],scrapVariant:variants[Math.min(5,Math.max(0,scrapLevel))-1]||null};
 if(result.iconic)return result;
 if(recipe){const need=new Map();recipe.inputs.forEach(n=>need.set(n,(need.get(n)||0)+1));result.parts=[...need].map(([name,total])=>{const have=count(name,variant),bp=blueprints.filter(b=>b.name===name&&b.variant===variant).reduce((n,b)=>n+(b.qty||1),0);return{name,total,have,blueprints:bp,missing:Math.max(0,total-have-bp)};});const inputs=recipe.inputs.map(name=>({name,variant}));if(result.parts.every(p=>p.have>=p.total)&&reaches(outcome(inputs)))result.ready.push({inputs,guaranteed:true});}
 // Check real, complete, unlocked copies. Every triple is evaluated by the game's existing resolver,
 // including named-recipe collisions and Scourge/Kyber rules. Group by rarity for random rolls.
 const groups=new Map(),seen=new Set();for(const u of stock){const r=byName.get(u.name).rarity;if(recipe?!recipe.inputs.includes(u.name):![target.rarity,ladder[ladder.indexOf(target.rarity)-1]].includes(r))continue;const key=recipe?'recipe':r;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(u);}
 for(const group of groups.values())for(let a=0;a<group.length;a++)for(let b=a+1;b<group.length;b++)for(let c=b+1;c<group.length;c++){
  const inputs=[group[a],group[b],group[c]].sort((x,y)=>Number(y.variant===variant)-Number(x.variant===variant)),o=outcome(inputs);if(!reaches(o))continue;
  const key=inputs.map(u=>u.name+'|'+u.variant).sort().join(';');if(seen.has(key))continue;seen.add(key);
  result.ready.push({key,inputs,guaranteed:!!o.name,requiredClass:o.requiredClass});result.ready.sort((a,b)=>Number(b.guaranteed)-Number(a.guaranteed)||Number(!!b.requiredClass)-Number(!!a.requiredClass)||a.inputs.filter(x=>x.trait).length-b.inputs.filter(x=>x.trait).length);if(result.ready.length>3)result.ready.length=3;
 }
 result.ready.sort((a,b)=>Number(b.guaranteed)-Number(a.guaranteed)||Number(!!b.requiredClass)-Number(!!a.requiredClass)||a.inputs.filter(x=>x.trait).length-b.inputs.filter(x=>x.trait).length);result.ready=result.ready.slice(0,3);
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
 const {droids,recipes,picture=()=>''}=context;
 host.innerHTML=`<section class="fusion-target"><h2>Which droid do you want?</h2><p>Pick a target. See an exact recipe, a possible random roll, or where fusion cannot help.</p><div class="trade-fields"><label>Droid<input data-target list="fusion-targets" placeholder="Search any droid" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"><datalist id="fusion-targets">${droids.map(d=>`<option value="${esc(d.name)}">`).join('')}</datalist></label><label>Variant<select data-quality></select></label></div><div data-plan aria-live="polite"><p>Choose a droid to start.</p></div></section>`;
 const input=host.querySelector('[data-target]'),select=host.querySelector('[data-quality]'),out=host.querySelector('[data-plan]');let previous=null;
 const part=u=>{const d=droids.find(d=>d.name===u.name);return `<span class="fusion-target-part">${picture(d,u.variant)}<strong>${esc(u.name)}</strong><small>${label(u.variant)}</small></span>`;};
 const row=inputs=>`<div class="fusion-target-inputs">${inputs.map(part).join('<b aria-hidden="true">+</b>')}</div>`;
 const draw=()=>{const d=droids.find(d=>d.name===input.value.trim().toUpperCase());if(!d){out.innerHTML='<p>Select a droid from the search suggestions.</p>';return;}if(previous!==d.name){previous=d.name;const initial=variants[Math.min(5,context.scrapLevel)-1]||'DEFAULT';select.innerHTML=variants.filter(v=>d.variants[v]).map(v=>`<option ${v===initial?'selected':''} value="${v}">${label(v)}</option>`).join('');}
 const params=new URLSearchParams(location.hash.split('?')[1]||'');params.set('target',d.name);params.set('quality',select.value);history.replaceState(null,'',location.hash.split('?')[0]+'?'+params);
 const v=select.value,p=fusionTargetPlan({...context,target:d,variant:v});
 if(p.iconic){out.innerHTML=`${part({name:d.name,variant:v})}<p><strong>Iconics cannot be made through fusion.</strong> Unlock this droid through its tutorial, shop or event source. <a href="#/droid/${d.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}">Open droid page</a></p>`;return;}
 const parts=p.parts.map(x=>`<article>${part({name:x.name,variant:v})}<p>Need ${x.total} · ${Math.min(x.total,x.have)} ready in Base · ${Math.min(Math.max(0,x.total-x.have),x.blueprints)} stored blueprints</p><strong>${x.missing?`Find ${x.missing} more`:'All inputs recorded'}</strong>${x.blueprints?'<p>Build the blueprints before fusing.</p>':''}</article>`).join('');
 out.innerHTML=`<h3>${esc(d.name)} · ${label(v)}</h3>${p.owned?`<p>You already have ${p.owned} completed ${label(v)} ${esc(d.name)}.</p>`:''}${p.recipe?`<h4>Exact recipe — guaranteed droid</h4><div class="fusion-target-inputs">${parts}</div><p>Build these three at ${label(v)}, then fuse them. Fusion droids cannot be upgraded afterwards.</p>`:'<p>This is an ordinary droid. Find its blueprint directly, upgrade an existing copy, or use the fusion routes below.</p>'}<h4>Using your Base</h4>${p.ready.length?p.ready.map(r=>`<article class="fusion-target-route">${row(r.inputs)}<p><strong>${r.guaranteed?'Guaranteed target':'Random result — target is possible'}</strong>${r.requiredClass?` · ${esc(r.requiredClass)} results only`:''}</p><p>Place these three completed droids in Fusion, fuse, then finish the result in a Fusion Build tank.</p>${r.inputs.some(u=>u.trait)?'<p>These inputs include recorded traits. Fusing spends the droids and loses those traits.</p>':''}</article>`).join(''):'<p>No matching complete triple is recorded in your Base. Finish builds or obtain the missing inputs first.</p>'}<h4>Farming with Blueprint Scrap</h4>${!p.scrapVariant?'<p>Unlock Blueprint Scrap to find blueprints while scrapping.</p>':p.farm?`<p>Your Blueprint Scrap level ${context.scrapLevel} can produce ${label(p.scrapVariant)} blueprints. Farm and <strong>build</strong> these three:</p>${row(p.farm.inputs)}<p>${p.farm.guaranteed?'This triple guarantees the selected droid and variant.':p.farm.requiredClass?`With Fusion Combine Classes, this verified triple narrows the random result to ${esc(p.farm.requiredClass)} droids at the target rarity.`:'This verified triple can roll the target, but other classes can also come out. Fusion Combine Classes can narrow results when all three inputs share a class.'}</p><p>Blueprint drops are random. Exact droid odds are not confirmed; a smaller result class is not a guaranteed target.</p>`:`<p>Your Blueprint Scrap level ${context.scrapLevel} reaches ${label(p.scrapVariant)}. ${p.recipe?'Collect the named recipe ingredients at the requested variant; use stored blueprints above to reduce what you need.':'No verified single-fusion route from that scrap quality reaches this exact target. Find the target directly, upgrade a copy, or choose a different quality.'}</p>`}<p class="muted">This is advice, not an automatic change to your Base. Locked and unfinished copies are excluded. Check rebirth uses before spending inputs. Fusion consumes three droids; it does not fuse blueprints directly.</p>`;
 };
 input.addEventListener('change',draw);select.addEventListener('change',draw);
 const initial=new URLSearchParams(location.hash.split('?')[1]||'');if(initial.get('target')){input.value=initial.get('target');draw();if([...select.options].some(o=>o.value===initial.get('quality'))){select.value=initial.get('quality');draw();}}
}
