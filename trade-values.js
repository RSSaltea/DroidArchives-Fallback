import {CHIP_COSTS,ALL_VARIANTS as ranks,RARITY_POWER as crystals,KYBER_TRADE_COLOUR as colour,isIconic} from './droid-rules.js?v=2026-11-08-shared';
// In-game trade valuation: each currency's positive difference is charged
// independently to the player receiving the higher value in that currency.
export function tradeValue(d,variant){
 if(!d||isIconic(d)||!variant||variant==='KYBER_ACTIVE')return null;
 const row=d.variants?.[variant],tier=variant==='SCOURGE'||variant.startsWith('KYBER_')?'KYBER':variant;
 const rank=ranks.indexOf(tier);
 if(!row||!Number.isFinite(row.cost)||rank<0||!CHIP_COSTS[d.rarity])return null;
 return {credits:row.cost,chips:rank?CHIP_COSTS[d.rarity][tier]:0,kyber:(colour[variant]||0)*crystals[d.rarity]};
}
export function tradeDifference(give,receive){
 if(!give||!receive)return null;
 const you={},other={};
 for(const k of ['credits','chips','kyber']){you[k]=Math.max(0,receive[k]-give[k]);other[k]=Math.max(0,give[k]-receive[k]);}
 return {you,other};
}
export const tradeMoney=v=>v?Object.entries({credits:'credits',chips:'upgrade chips',kyber:'Kyber crystals'}).filter(([k])=>v[k]>0).map(([k,label])=>`${v[k].toLocaleString('en-GB',{maximumFractionDigits:2})} ${label}`).join(' · ')||'No charge':'Choose an exact droid and variant';
