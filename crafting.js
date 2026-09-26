// Passive crafting rules. Pickaxe hits, critical hits and rushes are additional.
const RARITY_POWER={COMMON:1,RARE:2,EPIC:3,LEGENDARY:4,MYTHIC:5};
const QUALITIES=['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR','KYBER'];
const REGIONS=['WORKER','ASTROMECH','BATTLE'];
const level=value=>Math.max(0,Math.floor(Number(value)||0));
export function companionAttributeValue(d,variant='DEFAULT'){
  const rarity=RARITY_POWER[d?.rarity];
  if(!rarity)return 0;
  const quality=Math.max(0,QUALITIES.indexOf(variant.startsWith('KYBER_')?'KYBER':variant));
  const additional=Number(d.additionalPowerScale)||0;
  if(d.type==='WORKER')return Math.round(.2*(rarity+quality+additional)*1e6)/1e6;
  if(d.type==='ASTROMECH')return rarity+quality+additional;
  if(d.type==='BATTLE')return 20*(rarity+2*quality+additional);
  if(d.type==='PROTOCOL')return 200*(rarity+quality+additional);
  return 0;
}
export function craftingEstimate({droid,variant='DEFAULT',station='BUILD',slot=0,placed=[],droids=[],novaUpgrades={},eventMultiplier=1}={}){
  const base=droid?.variants?.[variant]?.craftingSeconds;
  if(!Number.isFinite(base)||base<=0||droid?.rarity==='ICONIC')return null;
  const companions=placed.filter(x=>x.station==='COMPANION');
  if(station==='FUSION_BUILD'){
    const doBonus=companions.some(x=>x.name==='D-O') ? .5 : 1;
    const speed=1+level(novaUpgrades['fusion-speed']);
    return {seconds:base*doBonus/speed,base,speed,match:1,doBonus,nova:speed-1,worker:0,protocol:0,event:1};
  }
  const worker=companions.reduce((sum,u)=>{const d=droids.find(d=>d.name===u.name);return sum+(d?.type==='WORKER'?companionAttributeValue(d,u.variant):0);},0);
  const nova=.1*level(novaUpgrades['crafting-speed']);
  const protocolUnit=placed.find(x=>x.station===`PROTOCOL_${REGIONS[slot]}_CRAFTING`);
  const protocolDroid=droids.find(d=>d.name===protocolUnit?.name);
  const protocol=Number(protocolDroid?.variants?.[protocolUnit?.variant]?.protocolCraftingBonusPercent||0)/100;
  const event=Number.isFinite(Number(eventMultiplier))?Math.max(1,Number(eventMultiplier)):1;
  const speed=(1+nova+worker+protocol)*event;
  const match=droid.type===REGIONS[slot] ? .9 : 1;
  return {seconds:base*match/speed,base,speed,match,nova,worker,protocol,event,doBonus:1};
}
