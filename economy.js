// Credit generation and repair-station rewards, shared by the Base estimates.
export const SCRAP_QUALITIES={
  default:{hit:1,break:20,health:6},gold:{hit:3,break:60,health:8},
  diamond:{hit:5,break:120,health:10},rainbow:{hit:10,break:300,health:12}
};
export function workingIncome({base=0,dynamicPercent=0,staticIncome=0,matching=false,multiplier=1,protocol=1}={}){
  const raw=Math.max(base,dynamicPercent*staticIncome);
  return {raw,matched:raw*(matching?1.1:1),total:raw*(matching?1.1:1)*multiplier*protocol};
}
export function scrapRewards({income=0,seconds=0,quality='default',stationLevel=null}={}){
  const row=SCRAP_QUALITIES[quality]||SCRAP_QUALITIES.default;
  return Object.fromEntries(['hit','break'].map(kind=>[kind,Math.max(
    Math.max(0,income)*seconds*Math.max(kind==='hit'?1:20,row[kind]/1.5),
    stationLevel===null?0:row[kind]*(4*stationLevel+1)
  )]));
}
export function scrapProgress(pickaxeLevel,companionBonus=0){
  return 1+Math.floor(2*Math.max(0,pickaxeLevel)+Math.max(0,companionBonus));
}
export function scrapActiveEstimate({rewards,swings,cycleSeconds}={}){
  if(!Number.isSafeInteger(swings)||swings<1||!Number.isFinite(cycleSeconds)||cycleSeconds<=0)return null;
  const credits=(swings-1)*rewards.hit+rewards.break;
  return {credits,perSecond:credits/cycleSeconds};
}
