import {escapeHtml as escape} from './ui-text.js?v=2026-11-08-shared';
import {traitOptionLabel} from './traits.js?v=2026-11-02-scourgedex-crit';
export const traitIcon=trait=>`assets/traits/${trait?trait.id:'unknown'}.png`;
export function traitBonusText(trait,tier){
  const value=trait?.values[tier];
  if(value===undefined)return '';
  const number=Number((value*(trait.value_format==='Percent'?100:1)).toFixed(4));
  if(trait.id===11)return `${number}% of this droid's CPS every 5 seconds`;
  if(trait.id===13)return `${number}% of chip sell reward on build completion`;
  if(trait.id===15)return `Heal ${number}% of max health per enemy defeated`;
  if(trait.id===18)return 'First extra crit guaranteed; +1 Multi Crit level';
  if(trait.id===19)return `${number}% chance of a second crate`;
  return trait.description.replace('{Value}',`${number}${trait.value_format==='Percent'?'%':''}`);
}
export function mountTraitPicker(host,options,current,onChange){
  // Native values remain the single source of truth for saving and comparisons.
  // Visible choices use ordinary buttons and radios so icons also work on mobile.
  host.innerHTML=`<select id="ownedTrait" hidden aria-hidden="true" tabindex="-1"><option value="">No trait recorded</option>${options.map(t=>`<option value="${t.id}">${escape(traitOptionLabel(t))}</option>`).join('')}</select><select id="ownedTraitTier" hidden aria-hidden="true" tabindex="-1"></select><p class="trait-picker-label" id="traitPickerLabel">Trait</p><details class="trait-picker"><summary aria-labelledby="traitPickerLabel traitPickerSelection"><img alt="" data-trait-selected-icon><span id="traitPickerSelection"></span><span aria-hidden="true">&#9662;</span></summary><div class="trait-picker-options"></div></details><fieldset class="trait-tier-picker"><legend>Trait tier &amp; bonus</legend><div data-trait-tiers></div></fieldset>`;
  const select=host.querySelector('#ownedTrait'),tier=host.querySelector('#ownedTraitTier'),picker=host.querySelector('details'),summary=picker.querySelector('summary'),list=host.querySelector('.trait-picker-options');
  select.value=current?String(current.id):'';
  function showSelection(){
    const t=options.find(t=>String(t.id)===select.value);
    host.querySelector('[data-trait-selected-icon]').src=traitIcon(t);
    host.querySelector('#traitPickerSelection').innerHTML=t?`<strong>${escape(t.name)}</strong><small>${escape(tier.value)}: ${escape(traitBonusText(t,tier.value))}</small>`:'No trait recorded';
    list.innerHTML=[null,...options].map(option=>{const chosen=option&&Object.hasOwn(option.values,tier.value)?tier.value:Object.keys(option?.values||{})[0];return `<button type="button" data-trait-choice="${option?.id??''}" aria-pressed="${option?select.value===String(option.id):!select.value}"><img src="${traitIcon(option)}" alt=""><span><strong>${escape(option?.name||'No trait recorded')}</strong><small>${option?`${escape(chosen)}: ${escape(traitBonusText(option,chosen))}`:'Clear the recorded trait'}</small></span></button>`;}).join('');
    host.querySelectorAll('[name="ownedTraitTierChoice"]').forEach(input=>input.checked=input.value===tier.value);
  }
  function updateTiers(preferred){
    const t=options.find(t=>String(t.id)===select.value),tiers=Object.keys(t?.values||{});
    tier.innerHTML=tiers.map(v=>`<option value="${v}">${escape(v)} - ${escape(traitBonusText(t,v))}</option>`).join('');
    if(tiers.includes(preferred))tier.value=preferred;
    tier.disabled=!t;
    host.querySelector('.trait-tier-picker').hidden=!t;
    host.querySelector('[data-trait-tiers]').innerHTML=tiers.map(v=>`<label class="trait-tier-choice trait-tier-${v.toLowerCase()}"><input type="radio" name="ownedTraitTierChoice" value="${v}" ${v===tier.value?'checked':''}><img src="${traitIcon(t)}" alt=""><span><strong>${v}</strong><small>${escape(traitBonusText(t,v))}</small></span></label>`).join('');
    showSelection();
  }
  select.onchange=()=>{updateTiers(tier.value);onChange();};
  tier.onchange=()=>{showSelection();onChange();};
  list.onclick=e=>{const button=e.target.closest('[data-trait-choice]');if(!button)return;select.value=button.dataset.traitChoice;select.dispatchEvent(new Event('change'));picker.open=false;summary.focus({preventScroll:true});};
  host.querySelector('[data-trait-tiers]').onchange=e=>{if(e.target.name!=='ownedTraitTierChoice')return;tier.value=e.target.value;tier.dispatchEvent(new Event('change'));};
  picker.addEventListener('keydown',e=>{if(e.key==='Escape'&&picker.open){e.preventDefault();e.stopPropagation();picker.open=false;summary.focus();}});
  updateTiers(current?.tier);
  return {select,tier};
}
