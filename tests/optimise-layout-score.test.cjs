const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('compiled candidate scores match the full income and crafting calculations',async()=>{
 const {createAssignmentScorer}=await import('../optimise-layout-score.js');
 const {workingIncome}=await import('../economy.js');
 const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
 const regions=['WORKER','ASTROMECH','BATTLE'];
 const droids=[
  {name:'worker',type:'WORKER',income:11400},{name:'battle',type:'BATTLE',income:450000},
  {name:'astro',type:'ASTROMECH',income:30000},{name:'iconic',type:'BATTLE',iconic:true,income:100,dynamic:.15},
  {name:'zero-share iconic',type:'WORKER',iconic:true,income:25,dynamic:0},
  {name:'protocol',type:'PROTOCOL',income:0,credit:56,craft:12},
  {name:'strong protocol',type:'PROTOCOL',income:0,credit:200,craft:40}
 ].map(d=>({...d,variants:{DEFAULT:{income:d.income,protocolCpsBonusPercent:d.credit||0,protocolCraftingBonusPercent:d.craft||0}}}));
 const state={droids},context=vm.createContext({state,PRODUCTIVE_STATIONS:regions,PROTOCOL_REGIONS:regions,workingIncome,
  isIconic:d=>!!d?.iconic,iconicIncome:d=>d?.iconic?d.dynamic:0,effectiveMultiplier:()=>18.7,
  protocolBonus:(d,v,role)=>d?.variants[v]?.[role==='CREDITS'?'protocolCpsBonusPercent':'protocolCraftingBonusPercent']||0,
  placedBaseIncome:placed=>placed.reduce((sum,u)=>{const d=droids.find(x=>x.name===u.name);return sum+(d.iconic?0:d.income)},0)});
 for(const name of ['protocolRegionMultiplier','protocolCraftBonus','regionalIncome','incomeForPlaced']){
  const start=source.indexOf(`function ${name}(`),tail=source.slice(start),end=tail.slice(1).search(/\n(?:function |const |let |async function |\/\/)/);
  vm.runInContext(tail.slice(0,end+1),context);
 }
 const slots=regions.flatMap(station=>[0,1].map(slot=>({station,slot,region:regions.indexOf(station),creditRegion:-1,craftRegion:-1})));
 for(const [i,region] of regions.entries())for(const role of ['CREDITS','CRAFTING'])slots.push({station:`PROTOCOL_${region}_${role}`,slot:0,region:-1,creditRegion:role==='CREDITS'?i:-1,craftRegion:role==='CRAFTING'?i:-1});
 const units=Array.from({length:18},(_,i)=>{const d=droids[i%droids.length];return {name:d.name,variant:'DEFAULT',type:d.type,base:d.income,iconic:!!d.iconic,dynamic:d.iconic?d.dynamic:0,creditBonus:(d.credit||0)/100,craftBonus:(d.craft||0)/100,station:i%2?'LOUNGE':regions[i%3],movingCosts:i%2===0||d.type==='PROTOCOL'}});
 const fixed=[{...units[0],station:'WORKER',slot:2,region:0,creditRegion:-1,craftRegion:-1},{...units[6],station:'PROTOCOL_BATTLE_CREDITS',slot:0,region:-1,creditRegion:2,craftRegion:-1}];
 const available=slots.filter(s=>s.station!=='PROTOCOL_BATTLE_CREDITS'),craftSeconds=[180,600,0],craftBaseSpeed=2.6,lambda=120;
 let seed=7151;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 for(const craftingPriority of [false,true]){
  const score=createAssignmentScorer({units,slots:available,locked:fixed,regions,multiplier:18.7,lambda,craftSeconds,craftBaseSpeed,craftingPriority});
  for(let n=0;n<250;n++){
   const used=new Set(),assignment=available.map(slot=>{const choices=units.map((u,i)=>i).filter(i=>!used.has(i)&&(slot.region>=0||units[i].type==='PROTOCOL'));if(!choices.length||random()<.2)return -1;const i=choices[Math.floor(random()*choices.length)];used.add(i);return i;});
   const placed=[...fixed,...assignment.flatMap((i,s)=>i<0?[]:[{...units[i],...available[s]}])];
   const moves=assignment.reduce((sum,i,s)=>sum+(i>=0&&units[i].movingCosts&&units[i].station!==available[s].station?1:0),0);
   const credits=context.incomeForPlaced(placed)-lambda*moves;
   const craft=regions.map((_,i)=>context.protocolCraftBonus(placed,i)),saved=craftSeconds.reduce((sum,seconds,i)=>sum+seconds/craftBaseSpeed-seconds/(craftBaseSpeed+craft[i]),0);
   const expected=craftingPriority?[craft.reduce((a,b)=>a+b,0),saved,credits]:[credits,craft.reduce((a,b)=>a+b,0),saved];
   score(assignment).forEach((value,i)=>assert(Math.abs(value-expected[i])<=Math.max(1e-7,Math.abs(expected[i])*1e-12),JSON.stringify({value,expected:expected[i],n,i})));
  }
 }
});
