import {TRAITS,normaliseTrait} from './traits.js?v=2026-11-02-scourgedex-crit';
import {traitBonusText,traitIcon} from './trait-picker.js?v=2026-11-03-trait-picker';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function recordedTrait(unit){
  if(unit?.blueprint)return null;
  const value=normaliseTrait(unit?.trait),trait=value&&TRAITS.find(t=>t.id===value.id);
  return trait?{icon:traitIcon(trait),tier:value.tier,label:`${trait.name} · ${value.tier}: ${traitBonusText(trait,value.tier)}`} :null;
}
export function traitBadgeHtml(unit){
  const trait=recordedTrait(unit);
  return trait?`<span class="recorded-trait-badge trait-tier-${trait.tier.toLowerCase()}" role="img" aria-label="${escape(trait.label)}" title="${escape(trait.label)}"><img src="${trait.icon}" alt=""></span>`:'';
}
export function traitBadgeSvg(unit){
  const trait=recordedTrait(unit);
  return trait?`<g class="tm-trait-badge trait-tier-${trait.tier.toLowerCase()}" pointer-events="none"><circle cx="17" cy="14" r="9"/><image href="${trait.icon}" x="10" y="7" width="14" height="14"/></g>`:'';
}
