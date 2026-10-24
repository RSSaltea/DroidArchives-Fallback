import {mountMissionTools} from './mission-tools-ui.js?v=2026-10-18-mission-tools';
import { mountTraitTools } from './trait-tools-ui.js?v=2026-10-24-scourge';
import { TRAIT_DATA } from './data/traits.js?v=2026-10-24-scourge';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tiers=['Default','Gold','Diamond','Rainbow'];
const roleLabel=role=>role==='Worker'?'Working (including Protocol bays)':role==='Astromech'?'Astromech mission':role;
export function traitValue(trait,value){
  if(trait.value_format==='Percent')return `${Number((value*100).toFixed(4))}%`;
  if(trait.value_format==='Hidden')return 'Available';
  return String(value);
}
export async function traitsPage(host,droids=[],missionContext=null){
  host.innerHTML='<section class="traits-page"><h1>Droid traits</h1><p role="status">Loading traits…</p></section>';
  const root=host.firstElementChild;
  try{
    const data=TRAIT_DATA;
    if(!root.isConnected)return;
    root.innerHTML=`<p class="eyebrow">Game v${escape(data.gameVersion)}</p><h1>Droid traits</h1><p>Reveal a droid's trait at a Trait Scanner Terminal using credits for ordinary droids or Nova Crystals for Iconics. Each droid has one trait, with its own tier: Default, Gold, Diamond or Rainbow. Trait tier is separate from the droid's quality.</p>
      <section class="trait-notice"><h2>Do traits survive Super Rebirth?</h2><p><strong>Normal droids: no.</strong> A trait belongs to one individual copy, not every droid of that name. Super Rebirth removes the droid and its trait.</p><p><strong>Iconic droids: yes.</strong> Their trait, tier and reroll count are saved separately and restored when you receive that Iconic again. This behaviour is verified in the exported game code.</p></section>
      <details class="trait-guide"><summary>Scanning, reroll costs and how traits activate</summary><p>Equip the droid as a companion to use the scanner. Reveal gives it a trait; reroll replaces its current trait. Rerolling can give a lower tier.</p><div class="trait-costs"><article><h3>Ordinary droids</h3><p>Reveal: <strong>3 times blueprint cost</strong><br>Next reroll: <strong>blueprint cost × 1.25<sup>previous rerolls</sup></strong><br>Paid in credits; includes the droid's variant.</p></article><article><h3>Iconic droids</h3><p>Reveal: <strong>200 Nova</strong><br>Every reroll: <strong>200 Nova</strong></p></article></div><p>An eligible droid-exclusive trait is guaranteed by roll 60, counting the initial reveal. The saved roll counter does not reset when you hit that trait. The game asks for confirmation before you reroll an exclusive trait.</p><p>The game chooses an eligible tier first (equal base weight for each of the four tiers), then an eligible trait within that tier. Droid-exclusive traits and Iconic exclusions affect the available pool. A reroll excludes the exact current trait and tier combination.</p><p>Companion traits need the droid equipped. Working traits also activate in Protocol bays and Astromech work slots; Astromech-only traits require a mission slot (1, 3, 5, 7 or 9). Having a trait does not make it active in every slot.</p></details>
      <div data-mission-tools></div><div data-trait-tools></div><div class="trait-filters"><label>Search traits or droids<input type="search" class="form-control" data-trait-search placeholder="Hyperdrive, CB-23, crafting…"></label><label>Active role<select class="form-control" data-trait-role><option value="">All roles</option>${['Companion','Worker','Astromech','Fusion'].map(role=>`<option value="${role}">${roleLabel(role)}</option>`).join('')}</select></label><label>Trait tier<select class="form-control" data-trait-tier><option value="">All tiers</option>${tiers.map(tier=>`<option>${tier}</option>`).join('')}</select></label></div><p data-trait-count role="status"></p><div class="trait-grid trait-catalogue"></div>`;
    mountMissionTools(root.querySelector('[data-mission-tools]'),missionContext);
    mountTraitTools(root.querySelector('[data-trait-tools]'),droids);
    const render=()=>{
      const search=root.querySelector('[data-trait-search]').value.trim().toLowerCase(),role=root.querySelector('[data-trait-role]').value,tier=root.querySelector('[data-trait-tier]').value;
      const shown=data.traits.filter(t=>(!role||t.active_in===role)&&(!tier||Object.hasOwn(t.values,tier))&&[t.name,t.effect,...t.exclusive_droids].join(' ').toLowerCase().includes(search));
      root.querySelector('[data-trait-count]').textContent=`${shown.length} of ${data.traits.length} traits`;
      root.querySelector('.trait-catalogue').innerHTML=shown.map(t=>`<article class="trait-card"><small>${escape(roleLabel(t.active_in))}</small><h2>${escape(t.name)}</h2><p>${escape(t.effect)}</p><p class="trait-eligibility">${t.exclusive_droids.length?`Exclusive to ${escape(t.exclusive_droids.join(', '))}`:t.exclude_iconics?'Non-Iconic droids only':'No droid-specific restriction'}</p><dl class="trait-tiers">${Object.entries(t.values).map(([tier,value])=>`<div class="trait-tier-${tier.toLowerCase()}"><dt>${tier}</dt><dd>${traitValue(t,value)}</dd></div>`).join('')}</dl></article>`).join('')||'<p>No traits match these filters.</p>';
    };
    root.querySelector('[data-trait-search]').oninput=render;
    root.querySelectorAll('[data-trait-role],[data-trait-tier]').forEach(select=>select.onchange=render);
    render();
  }catch(error){if(root.isConnected)root.innerHTML=`<h1>Droid traits</h1><p role="alert">${escape(error.message)}</p><button class="btn" data-trait-retry>Try again</button>`;root.querySelector('[data-trait-retry]')?.addEventListener('click',()=>traitsPage(host,droids));}
}
