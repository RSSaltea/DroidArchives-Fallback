import {isIconic,protocolBonusDetails,variantLabel} from './droid-rules.js?v=2026-11-27-protocol';
import {escapeHtml as esc} from './ui-text.js?v=2026-11-08-shared';

export function protocolAdaptationText(d,variant,role,placed,droids,locationLabel){
  if(d?.type!=='PROTOCOL'||!isIconic(d))return '';
  const {base,best,effective,source}=protocolBonusDetails(d,variant,role,placed,droids);
  const number=n=>Number(n.toFixed(2)).toLocaleString('en-GB');
  return source?`+${number(base)}% base → +${number(effective)}% now. ${source.name} ${variantLabel(source.variant)} in ${locationLabel(source)} supplies +${number(best)}%; this Iconic uses 120% of that bonus.`
    :`+${number(base)}% base bonus. No non-Iconic in a ${role==='CREDITS'?'Credits':'Crafting'} Protocol slot currently exceeds it.`;
}

export function protocolAdaptationHtml(d,variant,placed,droids,locationLabel){
  if(d?.type!=='PROTOCOL'||!isIconic(d))return '';
  return `<section class="panel protocol-summary protocol-adaptation"><h3>Iconic bonuses with your Base</h3><p>These are the bonuses this droid would give in a Protocol slot with your current setup.</p><div class="protocol-summary-grid">${['CREDITS','CRAFTING'].map(role=>`<div><h4>${role==='CREDITS'?'Region credits':'Depot crafting'}</h4><p>${esc(protocolAdaptationText(d,variant,role,placed,droids,locationLabel))}</p></div>`).join('')}</div><p>The supporting droid must stay in a Protocol slot of the same role, anywhere in your Base. Lounge, companions, ordinary work slots and other Iconics do not qualify. Moving or selling the supporting droid recalculates the bonus.</p><p>This changes Protocol station bonuses only. It does not raise the Iconic's companion perk or affect Overclocked.</p></section>`;
}
