import { traitAmount, traitSum } from './traits.js?v=2026-10-18-signin-fix';
// Curated from v1.35 AstromechMissions and depot completion code.
// Credit rewards are seconds of generation, not fixed amounts.
export const MISSION_SHIPS=[
  {id:0,seconds:240,cost:0,credits:24,blueprints:.5,label:'4-minute ship'},
  {id:2,seconds:480,cost:200000,credits:66,blueprints:.45,label:'8-minute ship'},
  {id:3,seconds:720,cost:60000000,credits:130,blueprints:.35,label:'12-minute ship'},
  {id:4,seconds:960,cost:20000000000,credits:300,blueprints:.25,label:'16-minute ship'},
  {id:6,seconds:1200,cost:1e12,credits:450,blueprints:.25,label:'20-minute ship'},
  {id:7,seconds:1440,cost:6e12,credits:640,blueprints:.2,label:'24-minute ship'},
  {id:5,seconds:3000,cost:0,credits:0,blueprints:0,chips:231,nova:5,label:'CB-23 special mission',exclusive:'CB-23'}
];
const number=(x,fallback=0)=>Number.isFinite(Number(x))?Math.max(0,Number(x)):fallback;
export function normaliseMissionSettings(value={}){
  const v=value&&typeof value==='object'?value:{};
  return {ships:Object.fromEntries([0,2,4,6,8].flatMap(slot=>MISSION_SHIPS.some(s=>s.id===Number(v.ships?.[slot]))?[[slot,Number(v.ships[slot])]]:[])),
    turnaround:Math.min(3600,number(v.turnaround,30)),speedBonus:Math.min(.95,number(v.speedBonus)),
    offlineRate:Math.min(100,number(v.offlineRate,.1)),offlineCap:Math.min(8760,number(v.offlineCap,1)),awayHours:Math.min(8760,number(v.awayHours,8)),
    buildName:typeof v.buildName==='string'?v.buildName.slice(0,100):'',buildVariant:typeof v.buildVariant==='string'?v.buildVariant.slice(0,24):'DEFAULT',buildSlot:Math.min(2,Math.floor(number(v.buildSlot))),
    buildDelay:Math.min(3600,number(v.buildDelay,15))};
}
export function missionEstimate(unit,droid,{shipId,turnaround=30,speedBonus=0,creditsPerSecond=0,baseCrates=unit.name==='R2-D2'?2:1}={}){
  if(unit.station!=='ASTROMECH'||![0,2,4,6,8].includes(unit.slot)||unit.built===false)return null;
  const ship=MISSION_SHIPS.find(s=>s.id===shipId&&(!s.exclusive||s.exclusive===unit.name));
  if(!ship)return null;
  const {base,efficiency,progress}=missionProgress(unit,droid);
  const duration=Math.ceil(ship.seconds*(1-Math.min(.95,number(speedBonus)))/progress);
  const missions=3600/(duration+number(turnaround)),crates=baseCrates===1?1+traitAmount(unit,19):baseCrates;
  const hyperdrive=traitAmount(unit,24)||1;
  return {ship,base,efficiency,progress,duration,missions,crates,cratesPerHour:missions*crates,
    credits:missions*crates*ship.credits*number(creditsPerSecond),blueprints:missions*crates*ship.blueprints,
    chips:missions*crates*(ship.chips||0)*hyperdrive,nova:missions*crates*(ship.nova||0)*hyperdrive};
}
export function offlineEstimate(placed,creditsPerSecond,settings){
  const s=normaliseMissionSettings(settings),bonus=traitSum(placed,10),seconds=Math.min(s.awayHours,s.offlineCap)*3600;
  return {rate:s.offlineRate+bonus,bonus,seconds,credits:number(creditsPerSecond)*(s.offlineRate+bonus)*seconds};
}
export function chipFinderEstimate(placed,baseSaleChips,saleMultiplier,craftSeconds,delay=15){
  const bonus=traitSum(placed,13),perBuild=bonus?Math.max(1,number(baseSaleChips)*number(saleMultiplier)*bonus):0;
  const builds=craftSeconds>0?3600/(craftSeconds+number(delay)):0;
  return {bonus,perBuild,builds,perHour:perBuild*builds};
}

export function missionProgress(unit,droid){
  const rarity={COMMON:1,RARE:2,EPIC:3,LEGENDARY:4,MYTHIC:5,ICONIC:10}[droid?.rarity]||1;
  const quality=Math.max(0,['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR','KYBER'].indexOf(String(unit.variant||'DEFAULT').replace(/^KYBER_.*/, 'KYBER')));
  const base=droid?.type==='ASTROMECH'?1+(rarity-1)*.2+quality*.1+number(droid.additionalPowerScale)*.1:1;
  const efficiency=traitAmount(unit,9);
  return {base,efficiency,progress:base*(1+efficiency)};
}
