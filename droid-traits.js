import {escapeHtml as escape} from './ui-text.js?v=2026-11-08-shared';
import {TRAITS,traitEligible} from './traits.js?v=2026-11-02-scourgedex-crit';
import {ICONIC_TRAIT_ADVICE} from './trait-planning.js?v=2026-11-02-scourgedex-crit';
const slug=name=>name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
export const traitDroidLink=name=>`<a href="#/droid/${slug(name)}">${escape(name)}</a>`;
export function droidTraitRecommendations(droid){
 const advice=ICONIC_TRAIT_ADVICE.find(row=>row[0]===droid.name);
 if(advice)return [{id:advice[1],use:advice[2],reason:advice[3]}];
 if(droid.rarity==='ICONIC')return [{id:10,use:'Offline earnings while working',reason:'A useful working option if you collect offline credits. If you equip this droid as a companion, choose a trait for your current activity instead.'}];
 const rows=[{id:0,use:'Working credits',reason:'Keep this if the droid earns credits in your Base.'}];
 if(droid.type==='ASTROMECH')rows.push({id:9,use:'Astromech missions',reason:'Useful when this droid runs missions. Credit-only pads do not run missions.'});
 return rows;
}
export function droidTraitsHtml(droid){
 const eligible=TRAITS.filter(t=>traitEligible(t,droid)),recommendations=droidTraitRecommendations(droid).filter(r=>eligible.some(t=>t.id===r.id));
 const tierText=t=>Object.entries(t.values).map(([tier,value])=>`${tier}: ${t.value_format==='Hidden'?'available':t.value_format==='Percent'?`${Number((value*100).toFixed(4))}%`:value}`).join(' · ');
 return `<section class="droid-traits" aria-label="Droid traits"><h2>Traits for ${escape(droid.name)}</h2><p>${droid.rarity==='ICONIC'?'You can own only one of this Iconic. Its trait and tier are retained through Super Rebirth and restored when you receive the droid again.':`A trait belongs to one copy of this droid, not every ${escape(droid.name)} you own. Trait tier is separate from droid quality.`}</p><h3>Recommended traits by activity</h3><div class="trait-grid">${recommendations.map(r=>{const t=eligible.find(t=>t.id===r.id);return `<article class="trait-card"><small>${escape(r.use)}</small><h3>${escape(t.name)}</h3><p>${escape(r.reason)}</p><p class="trait-eligibility">Active: ${escape(t.active_in==='Worker'?'Working, including Protocol bays':t.active_in==='Astromech'?'Astromech mission slots':t.active_in)}${t.exclusive_droids.length?' · Exclusive to this droid':''}</p></article>`;}).join('')}</div><p>${droid.rarity==='ICONIC'?'Iconic traits survive Super Rebirth and return with the droid. These recommendations depend on how you use it; an exclusive trait is not automatically best for every activity.':'Ordinary droids and their traits are lost on Super Rebirth. These are suggestions for traits you already reveal, not a recommendation to spend heavily rerolling them.'}</p><p>For companions, choose Crafting Speed for builds, Scrap Specialist for scrap credits, or critical/pickaxe traits for active hitting. Companion traits only work while equipped.</p><details class="trait-guide"><summary>All ${eligible.length} eligible traits</summary><div class="trait-grid">${eligible.map(t=>`<article class="trait-card"><small>${t.exclusive_droids.length?'Exclusive to this droid':'Shared trait'} · ${escape(t.active_in)}</small><h3>${escape(t.name)}</h3><p>${escape(t.effect)}</p><p class="trait-eligibility">${escape(tierText(t))}</p></article>`).join('')}</div></details><p>Record the trait on your individual droid in Base. <a href="#/traits">All traits, exclusive droids and reroll calculator</a></p></section>`;
}
