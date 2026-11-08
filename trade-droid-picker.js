import {isIconic} from './droid-rules.js?v=2026-11-08-shared';
import {escapeHtml as esc} from './ui-text.js?v=2026-11-08-shared';
import {tradeVariantLabel} from './trade-rules.js?v=2026-11-08-shared';
import {TRAITS,normaliseTrait,traitEligible,traitLabel,traitOptionLabel} from './traits.js?v=2026-11-02-scourgedex-crit';
const words=v=>String(v??'').replaceAll('_',' ');

export function tradeBlockReason(unit,droid){
  if(!droid)return 'Droid not in the catalogue';
  if(isIconic(droid))return 'Iconics cannot be traded';
  if(unit.hasBeenTraded||unit.traded||unit.tradedOnce)return 'Traded Once - cannot trade again';
  if(unit.blueprint)return 'Build this blueprint first';
  if(['BUILD','FUSION_BUILD'].includes(unit.station||unit.preferred)&&!unit.built)return 'Finish building first';
  return '';
}
export function tradeBaseChoices(units,droids){
  const byName=new Map(droids.map(d=>[d.name,d]));
  return units.map((unit,index)=>{
    const droid=byName.get(unit.name),trait=normaliseTrait(unit.trait,droid);
    const location=unit.station?`${words(unit.station)} ${Number(unit.slot)+1}`:'Unplaced';
    return {key:`${unit.source}:${unit.unit}:${index}`,unit,droid,trait,location,
      blocked:tradeBlockReason(unit,droid),
      search:[unit.name,words(unit.variant),droid?.type,droid?.rarity,location,traitLabel({trait})].join(' ').toLowerCase()};
  });
}
export function tradeSelection(droid,variant,trait,baseCopy=null){
  if(!droid||tradeBlockReason({},droid)||!Object.hasOwn(droid.variants||{},variant))return null;
  return {name:droid.name,variant,type:droid.type,rarity:droid.rarity,
    trait:normaliseTrait(trait,droid),
    ...(baseCopy?{baseCopy:{source:baseCopy.source,unit:baseCopy.unit,station:baseCopy.station??null,slot:baseCopy.slot??null}}:{})};
}

// Selection is a snapshot for the offer form. It never mutates the Base or
// treats a source-array index as a permanent inventory identifier.
export function mountTradeDroidPicker(host,{droids,units=[],picture=()=>'',onSelect=()=>{},mountMap=null,rebirthWarning=()=>'',reservedCopies=new Set()}){
  const choices=tradeBaseChoices(units,droids).filter(c=>!c.blocked).sort((a,b)=>Number(b.unit.station==='LOUNGE')-Number(a.unit.station==='LOUNGE'));
  const catalogue=droids.filter(d=>!tradeBlockReason({},d));
  let mode='base',selected=null,manual=null;
  host.innerHTML=`<section class="trade-picker"><h2>Choose the droid you want to offer</h2>
    <div class="trade-picker-modes" role="group" aria-label="Choose a droid source"><button type="button" class="btn" data-mode="base" aria-pressed="true">From your Base</button>${mountMap?'<button type="button" class="btn secondary" data-mode="map" aria-pressed="false">Map view</button>':''}<button type="button" class="btn secondary" data-mode="search" aria-pressed="false">Search all droids</button></div>
    <p data-source-help>Choose the exact copy. Its variant and recorded trait are included.</p>
    <label class="trade-search">Find a droid<input type="search" placeholder="Name, trait, class, variant or room" autocomplete="off" data-search></label>
    <label class="trade-confirm" data-reserve-label><input type="checkbox" data-reserve> Hide droids needed for future rebirths (keep one copy)</label>
    <p data-count role="status"></p><div class="trade-picker-grid" data-choices></div>
    <div data-trade-map hidden></div><div data-manual></div><section class="trade-selection" data-selection hidden aria-label="Selected droid"></section>
  </section>`;
  const root=host.firstElementChild,list=root.querySelector('[data-choices]'),search=root.querySelector('[data-search]'),manualHost=root.querySelector('[data-manual]'),review=root.querySelector('[data-selection]');
  const label=s=>`${s.name} · ${words(s.variant)} · ${traitLabel(s)}`;
  function showSelection(value){
    selected=value;review.hidden=!value;
    if(!value){review.replaceChildren();return;}
    const d=droids.find(d=>d.name===value.name);
    review.innerHTML=`<h3>Your selection</h3><div class="trade-picked">${picture(d,value.variant)}<p><strong>${esc(value.name)}</strong><br>${esc(tradeVariantLabel(value.variant))} · ${esc(value.rarity)} · ${esc(value.type)}<br>${esc(traitLabel(value))}</p></div>
      ${rebirthWarning(value)?`<p class="trade-rebirth-warning">${esc(rebirthWarning(value))}</p>`:''}<label class="trade-confirm"><input type="checkbox" data-confirm> This is the correct droid and it has never been traded in game.</label>
      <p class="muted">Each droid can only be traded once. Choosing it here does not remove it from your Base or perform an in-game trade.</p>
      <button type="button" class="btn" data-use disabled>Use this droid</button>`;
    review.querySelector('[data-confirm]').onchange=e=>review.querySelector('[data-use]').disabled=!e.target.checked;
    review.querySelector('[data-use]').onclick=()=>{if(review.querySelector('[data-confirm]').checked)onSelect(structuredClone(selected));};
  }
  function showManual(d){
    manual=d;
    const variants=Object.keys(d.variants||{}),traits=TRAITS.filter(t=>traitEligible(t,d));
    manualHost.innerHTML=`<fieldset class="trade-manual"><legend>${esc(d.name)} — enter its actual details</legend><label>Variant<select data-variant>${variants.map(v=>`<option value="${esc(v)}">${esc(tradeVariantLabel(v))}</option>`).join('')}</select></label><label>Trait<select data-trait><option value="">No trait recorded</option>${traits.map(t=>`<option value="${t.id}">${esc(traitOptionLabel(t))}</option>`).join('')}</select></label><label data-tier-label hidden>Trait tier<select data-tier></select></label></fieldset>`;
    const variant=manualHost.querySelector('[data-variant]'),trait=manualHost.querySelector('[data-trait]'),tier=manualHost.querySelector('[data-tier]');
    const update=()=>showSelection(tradeSelection(d,variant.value,trait.value===''?null:{id:Number(trait.value),tier:tier.value}));
    trait.onchange=()=>{const t=traits.find(t=>String(t.id)===trait.value);tier.innerHTML=Object.keys(t?.values||{}).map(v=>`<option>${esc(v)}</option>`).join('');manualHost.querySelector('[data-tier-label]').hidden=!t;update();};
    variant.onchange=update;tier.onchange=update;update();
    manualHost.scrollIntoView({block:'nearest'});
  }
  function render(){
    const q=search.value.trim().toLowerCase();
    root.querySelector('[data-reserve-label]').hidden=mode==='search';
    const available=choices.filter(c=>!root.querySelector('[data-reserve]').checked||!reservedCopies.has(`${c.unit.source}:${c.unit.unit}`));
    const mapHost=root.querySelector('[data-trade-map]');mapHost.hidden=mode!=='map';list.hidden=mode==='map';
    if(mode==='map'){const matches=available.filter(c=>c.search.includes(q));root.querySelector('[data-count]').textContent=`${matches.length} tradeable copies`;mountMap(mapHost,matches.map(c=>c.unit),unit=>{const c=matches.find(c=>c.unit.source===unit.source&&c.unit.unit===unit.unit);if(c)showSelection(tradeSelection(c.droid,c.unit.variant,c.trait,c.unit));});return;}

    const shown=mode!=='search'?available.filter(c=>c.search.includes(q)):catalogue.filter(d=>`${d.name} ${d.type} ${d.rarity}`.toLowerCase().includes(q));
    root.querySelector('[data-count]').textContent=`${shown.length} ${mode!=='search'?'recorded copies':'droids'}`;
    list.innerHTML=shown.map((c,i)=>{
      const d=mode!=='search'?c.droid:c,unit=mode!=='search'?c.unit:{name:d.name,variant:'DEFAULT'},trait=mode!=='search'?traitLabel({trait:c.trait}):'Choose variant and trait';
      const chosen=mode!=='search'?selected?.baseCopy&&selected.baseCopy.source===unit.source&&selected.baseCopy.unit===unit.unit:manual?.name===d.name;
      return `<button type="button" class="trade-droid-card" data-pick="${i}" aria-pressed="${Boolean(chosen)}" ${c.blocked?'disabled':''} aria-label="${esc(`${unit.name}, ${words(unit.variant)}, ${trait}${c.location?', '+c.location:''}${c.blocked?', '+c.blocked:''}`)}">${d?picture(d,unit.variant):''}<span><strong>${esc(unit.name)}</strong><small>${esc(mode!=='search'?words(unit.variant):d.rarity)} · ${esc(d?.type)}</small><span class="trade-card-trait">${esc(trait)}</span>${mode!=='search'?`<small>${esc(c.location)}</small>`:''}${rebirthWarning(unit)?`<small class="trade-rebirth-warning">${esc(rebirthWarning(unit))}</small>`:''}</span></button>`;
    }).join('')||`<p>${mode!=='search'&&!choices.length?'No tradeable copies recorded. Use Search all droids, or update your Base.':'No matching droids.'}</p>`;
    list.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{const c=shown[Number(b.dataset.pick)];if(mode!=='search'){if(c.blocked)return;showSelection(tradeSelection(c.droid,c.unit.variant,c.trait,c.unit));}else showManual(c);render();});
  }
  search.oninput=render;
  root.querySelector('[data-reserve]').onchange=()=>{if(selected?.baseCopy&&reservedCopies.has(`${selected.baseCopy.source}:${selected.baseCopy.unit}`))showSelection(null);render();};
  root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;search.value='';manual=null;manualHost.replaceChildren();showSelection(null);root.querySelectorAll('[data-mode]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.mode===mode));b.classList.toggle('secondary',b.dataset.mode!==mode);});root.querySelector('[data-source-help]').textContent=mode!=='search'?'Choose the exact copy. Its variant and recorded trait are included.':'Find a droid, then choose its actual variant and trait. It does not need to be recorded in your Base.';search.placeholder=mode!=='search'?'Name, trait, class, variant or room':'Droid name, class or rarity';render();});
  render();
  return {getSelection:()=>selected?structuredClone(selected):null};
}
