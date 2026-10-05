// Credit generation and repair-station rewards, shared by the Base estimates.
export const SCRAP_QUALITIES={
  default:{hit:1,break:20,health:6},gold:{hit:3,break:60,health:8},
  diamond:{hit:5,break:120,health:10},rainbow:{hit:10,break:300,health:12}
};
export function workingIncome({base=0,dynamicPercent=0,staticIncome=0,matching=false,multiplier=1,protocol=1}={}){
  const raw=Math.max(base,dynamicPercent*staticIncome);
  return {raw,matched:raw*(matching?1.1:1),total:raw*(matching?1.1:1)*multiplier*protocol};
}
// Party size includes you and only counts members currently in the game.
export function normaliseParty(value={}){
  const integer=(n,fallback)=>Number.isFinite(Number(n))?Math.floor(Number(n)):fallback;
  const size=Math.max(1,Math.min(6,integer(value?.size,1)));
  return {size,depotHitters:Math.max(0,Math.min(size-1,integer(value?.depotHitters,0))),
    scrapAtPartyBase:size>1&&value?.scrapAtPartyBase===true,
    target:value?.target==='fusion'?'fusion':'depot'};
}
export function partyBonuses(value){
  const party=normaliseParty(value);
  return {chips:1+Math.min(1,(party.size-1)*.2),
    scrap:party.scrapAtPartyBase?1.5:1,
    pickaxe:party.target==='depot'?1+Math.min(1,party.depotHitters*.2):1};
}
export function scrapRewards({income=0,seconds=0,quality='default',stationLevel=null,partyMultiplier=1}={}){
  const row=SCRAP_QUALITIES[quality]||SCRAP_QUALITIES.default;
  return Object.fromEntries(['hit','break'].map(kind=>[kind,Math.max(
    Math.max(0,income)*seconds*Math.max(kind==='hit'?1:20,row[kind]/1.5),
    stationLevel===null?0:row[kind]*(4*stationLevel+1)
  )*partyMultiplier]));
}
export function scrapProgress(pickaxeLevel,companionBonus=0){
  return 1+Math.floor(2*Math.max(0,pickaxeLevel)+Math.max(0,companionBonus));
}
export function scrapActiveEstimate({rewards,swings,cycleSeconds}={}){
  if(!Number.isSafeInteger(swings)||swings<1||!Number.isFinite(cycleSeconds)||cycleSeconds<=0)return null;
  const credits=(swings-1)*rewards.hit+rewards.break;
  return {credits,perSecond:credits/cycleSeconds};
}
