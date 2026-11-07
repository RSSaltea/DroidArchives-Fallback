// In-game trade valuation: each currency's positive difference is charged
// independently to the player receiving the higher value in that currency.
const chips={COMMON:[10,25,40,80,120,180,240],RARE:[30,60,100,250,400,750,1000],EPIC:[120,180,240,2000,5000,8000,12000],LEGENDARY:[400,1200,2500,6000,16000,24000,30000],MYTHIC:[4000,8000,14000,30000,60000,90000,110000]};
const ranks=['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR','KYBER'];
const crystals={COMMON:1,RARE:2,EPIC:3,LEGENDARY:4,MYTHIC:5};
const colour={KYBER_GREEN:1,KYBER_BLUE:2,KYBER_PURPLE:3};
export function tradeValue(d,variant){
 if(!d||d.rarity==='ICONIC'||d.special?.onlyDefaultVariant||!variant||variant==='KYBER_ACTIVE')return null;
 const row=d.variants?.[variant],tier=variant==='SCOURGE'||variant.startsWith('KYBER_')?'KYBER':variant;
 const rank=ranks.indexOf(tier);
 if(!row||!Number.isFinite(row.cost)||rank<0||!chips[d.rarity])return null;
 return {credits:row.cost,chips:rank?chips[d.rarity][rank-1]:0,kyber:(colour[variant]||0)*crystals[d.rarity]};
}
export function tradeDifference(give,receive){
 if(!give||!receive)return null;
 const you={},other={};
 for(const k of ['credits','chips','kyber']){you[k]=Math.max(0,receive[k]-give[k]);other[k]=Math.max(0,give[k]-receive[k]);}
 return {you,other};
}
export const tradeMoney=v=>v?Object.entries({credits:'credits',chips:'upgrade chips',kyber:'Kyber crystals'}).filter(([k])=>v[k]>0).map(([k,label])=>`${v[k].toLocaleString('en-GB',{maximumFractionDigits:2})} ${label}`).join(' · ')||'No charge':'Choose an exact droid and variant';
