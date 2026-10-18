import { TRAIT_DATA } from './data/traits.js?v=2026-10-18-mission-tools';
export const TRAITS=TRAIT_DATA.traits;
const work=['WORKER','ASTROMECH','BATTLE','UPGRADE_CHIP'];
export function normaliseTrait(value,droid){
  if(!value||value.id===null||value.id===undefined)return null;
  const trait=TRAITS.find(t=>t.id===Number(value.id));
  const tier=String(value.tier||'').toLowerCase();
  const key=Object.keys(trait?.values||{}).find(t=>t.toLowerCase()===tier);
  if(!trait||!key||droid&&!traitEligible(trait,droid))return null;
  return {id:trait.id,tier:key,rerolls:Number.isFinite(Number(value.rerolls))?Math.max(0,Math.floor(Number(value.rerolls))):0};
}
export function traitEligible(trait,droid){
  return Boolean(droid&&(!trait.exclude_iconics||droid.rarity!=='ICONIC')&&(!trait.exclusive_droids.length||trait.exclusive_droids.some(n=>n.toUpperCase()===droid.name)));
}
export function traitAmount(unit,id,station=unit?.station){
  const value=normaliseTrait(unit?.trait),trait=value&&TRAITS.find(t=>t.id===value.id);
  if(!trait||trait.id!==id||unit.built===false&&['BUILD','FUSION_BUILD'].includes(station))return 0;
  // Protocol bays also inherit work_droid_attach_component. Astromech-only
  // effects require one of the five mission stations, not a credit-only pad.
  const active=trait.active_in==='Worker'?(work.includes(station)||String(station).startsWith('PROTOCOL_')):trait.active_in==='Companion'?station==='COMPANION':trait.active_in==='Astromech'?station==='ASTROMECH'&&(!Number.isInteger(unit.slot)||[0,2,4,6,8].includes(unit.slot)):station==='FUSION';
  return active?trait.values[value.tier]:0;
}
export const traitSum=(placed,id)=>placed.reduce((sum,u)=>sum+traitAmount(u,id),0);
export function traitLabel(unit){const value=normaliseTrait(unit?.trait);return value?`${TRAITS.find(t=>t.id===value.id).name} · ${value.tier}`:'No trait recorded';}
export function companionPerkActive(unit,name){
  if(unit.name!==name)return false;
  return unit.station==='COMPANION'||Boolean(traitAmount(unit,{'D-O':17,'C-3PO':20,'BB-8':21,'DJ R-3X':22}[name]));
}
export const overclockFactor=unit=>1+traitAmount(unit,12,'COMPANION');
export function companionGoalValue(droid,unit,goal,attribute){
  const type={pickaxe:'ASTROMECH',crafting:'WORKER',health:'BATTLE',credits:'PROTOCOL'}[goal];
  const base=droid?.type===type?attribute*overclockFactor(unit):0;
  if(goal==='crafting')return base+traitAmount(unit,3,'COMPANION');
  return base+traitAmount(unit,{pickaxe:1,health:2}[goal],'COMPANION');
}
export function normaliseIconicTraits(value,droids){
  return Object.fromEntries(Object.entries(value||{}).flatMap(([name,trait])=>{const d=droids.find(d=>d.name===name&&d.rarity==='ICONIC'),t=d&&normaliseTrait(trait,d);return t?[[name,t]]:[];}));
}
export function rememberIconicTraits(saved,owned,droids){
  const next=normaliseIconicTraits(saved,droids);
  for(const row of owned){const d=droids.find(d=>d.name===row.name);if(d?.rarity!=='ICONIC')continue;const value=normaliseTrait(row.trait,d);if(value)next[row.name]=value;}
  return next;
}
