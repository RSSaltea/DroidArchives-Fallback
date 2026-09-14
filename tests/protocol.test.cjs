// Run with node --test tests/protocol.test.cjs.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/droids.json'),'utf8'));
// Select complete top-level functions by the next top-level declaration.
function fn(name){const at=src.indexOf(`function ${name}(`);assert(at>=0,name);const tail=src.slice(at);const end=tail.slice(1).search(/\n(?:function |const |let |async function |\/\/)/);return end<0?tail:tail.slice(0,end+1);}
function setup(){
 const state={droids:structuredClone(data),owned:[],protocolPriority:'credits'};
 const caps={WORKER:1,ASTROMECH:1,BATTLE:1};
 const ctx=vm.createContext({state,console,ASTROMECH_MISSION_SLOTS:[0,2,4,6,8],NEAREST_ORDER:['WORKER','BATTLE','ASTROMECH'],PRODUCTIVE_STATIONS:['WORKER','ASTROMECH','BATTLE'],
  effectiveMultiplier:()=>1,isIconic:d=>d?.rarity==='ICONIC',iconicIncome:d=>d?.rarity==='ICONIC'?(d.special?.incomePercent??.15):0,
  placedBaseIncome:placed=>placed.reduce((n,x)=>n+(state.droids.find(d=>d.name===x.name)?.variants[x.variant]?.income||0),0),
  expandedOwned:()=>state.owned.flatMap((x,source)=>Array.from({length:x.qty||1},(_,unit)=>({...x,source,unit}))),
  isBuilding:x=>x.station==='BUILD'&&!x.built,
  productiveStations:()=>Object.entries(caps).flatMap(([station,n])=>Array.from({length:n},(_,slot)=>({station,slot}))),
  stationSlotIndices:station=>Array.from({length:caps[station]??(station.startsWith('PROTOCOL_')?1:0)},(_,i)=>i),
  slotFillOrder:station=>Array.from({length:caps[station]||0},(_,i)=>i).reverse(),
  optimiseAssignmentMoves:()=>[],
  stabiliseAssignments:x=>x,
  optimiseCreditBase:()=>({income:0,assignments:[],moves:[]}),
  unitName:x=>x.name,slotLabel:x=>x?`${x.station} ${x.slot+1}`:'Roster',withFusionSteps:x=>x
 });
 vm.runInContext(src.slice(src.indexOf('const PROTOCOL_REGIONS='),src.indexOf('const SLOT_RULES=')),ctx);
 vm.runInContext(fn('stabiliseProjectedPlacements'),ctx);
 vm.runInContext(fn('applyPlannedEquivalentSlots'),ctx);
 vm.runInContext(fn('normaliseProjectedForSteps'),ctx);
 vm.runInContext(fn('safeOptimiseStepPlan'),ctx);
 ctx.isProtocolStation=s=>s.startsWith('PROTOCOL_');ctx.optimiseStepStyle=()=> 'route';
 vm.runInContext('globalThis.optimiseRoutePlan=protocolStepPlan',ctx);
 vm.runInContext(src.slice(src.indexOf('const optimisedRows='),src.indexOf('function optimisedPlacements(')),ctx);
 return {state,caps,run:code=>vm.runInContext(code,ctx),ctx};
}
test('new source stats, all seven qualities, portraits and C-3PO type',()=>{
 assert.equal(data.find(d=>d.name==='C-3PO').type,'PROTOCOL');
 assert.equal(new Set(data.map(d=>d.name)).size,data.length);
 for(const name of ['SA-5','LOM','PZ','TDA']){const d=data.find(x=>x.name===name);assert.equal(d.type,'PROTOCOL');assert.equal(Object.keys(d.variants).length,7);for(const p of Object.values(d.portraits))assert(fs.existsSync(path.join(__dirname,'..',p)));}
 assert.equal(data.find(d=>d.name==='SA-5').variants.STELLAR.protocolCpsBonusPercent,56);
 assert.equal(data.find(d=>d.name==='LOM').variants.DIAMOND.protocolCraftingBonusPercent,540);
});
test('generic Stellar loader preserves explicit Protocol stats and bonuses',()=>{
 const {ctx,run}=setup();vm.runInContext(fn('applyStellarData'),ctx);
 const result=run(`applyStellarData(state.droids.filter(d=>d.type==='PROTOCOL'),{_rules:{costMultiplier:{RARE:999},incomeMultiplier:{RARE:999},craftingMultiplier:999}})`);
 const sa=result.find(d=>d.name==='SA-5').variants.STELLAR;
 assert.equal(sa.income,448);assert.equal(sa.protocolCpsBonusPercent,56);assert.equal(sa.craftingSeconds,982.26);
});
test('1.56x adds 56% only to its region; craft is local and not income',()=>{
 const {run}=setup();
 const r=run(`regionalIncome([{name:'MOUSE',variant:'DEFAULT',station:'WORKER'}, {name:'MOUSE',variant:'DEFAULT',station:'BATTLE'}, {name:'SA-5',variant:'STELLAR',station:'PROTOCOL_WORKER_CREDITS'}, {name:'LOM',variant:'DIAMOND',station:'PROTOCOL_BATTLE_CRAFTING'}])`);
 assert.equal(r.WORKER.beforeBonus,2.2);assert(Math.abs(r.WORKER.total-3.432)<1e-8);assert.equal(r.BATTLE.total,2);
 assert.equal(run(`protocolCraftBonus([{name:'LOM',variant:'DIAMOND',station:'PROTOCOL_BATTLE_CRAFTING'}],2)`),5.4);
 assert.equal(run(`protocolCraftBonus([{name:'LOM',variant:'DIAMOND',station:'PROTOCOL_BATTLE_CRAFTING'}],0)`),0);
});
test('ordinary station matching and unique Iconic income remain unchanged',()=>{
 const {run}=setup();const total=run(`incomeForPlaced([{name:'MOUSE',variant:'DEFAULT',station:'WORKER'},{name:'PIT',variant:'DEFAULT',station:'BATTLE'},{name:'C-3PO',variant:'DEFAULT',station:'ASTROMECH'}])`);
 assert(Math.abs(total-5.2)<1e-8);
});
test('credit priority puts the strongest bonus in the highest earning locked region',()=>{
 const {state,run}=setup();state.owned=[{name:'SA-5',variant:'STELLAR'},{name:'LOM',variant:'STELLAR'}];
 const result=run(`optimiseBase({placed:[{name:'PIT',variant:'DEFAULT',station:'WORKER',slot:0,source:99,unit:0,lockedSlot:true},{name:'MECHA-DROID',variant:'GALACTIC',station:'BATTLE',slot:0,source:98,unit:0,lockedSlot:true}]},0)`);
 assert(result.assignments.some(x=>x.name==='LOM'&&x.station==='PROTOCOL_BATTLE_CREDITS'));
 assert(!result.assignments.some(x=>x.source===99||x.station==='BATTLE'));
});
test('craft priority reserves scarce strongest Protocol for crafting',()=>{
 const {state,run}=setup();state.owned=[{name:'LOM',variant:'DIAMOND'}];state.protocolPriority='crafting';
 const result=run('optimiseBase({placed:[]},0)');assert.equal(result.assignments.length,1);assert(result.assignments[0].station.endsWith('_CRAFTING'));
 assert.equal(run("canUseStation(state.droids.find(d=>d.name==='MOUSE'),'PROTOCOL_WORKER_CREDITS')"),false);
});
test('locked and unfinished Protocol droids never become candidates',()=>{
 const {state,run}=setup();state.protocolPriority='crafting';state.owned=[{name:'LOM',variant:'DIAMOND'},{name:'TDA',variant:'STELLAR'}];
 const result=run(`optimiseBase({placed:[{name:'LOM',variant:'DIAMOND',station:'PROTOCOL_BATTLE_CREDITS',slot:0,source:0,unit:0,lockedSlot:true},{name:'TDA',variant:'STELLAR',station:'BUILD',slot:0,source:1,unit:0}]},0)`);
 assert.equal(result.assignments.length,0);
});
test('craft speed ties put the strongest boost behind the longest active build',()=>{
 const {state,run}=setup();state.protocolPriority='crafting';state.owned=[{name:'SA-5',variant:'DEFAULT'},{name:'LOM',variant:'DEFAULT'},{name:'TDA',variant:'DEFAULT'}];
 const result=run(`optimiseBase({placed:[{name:'MOUSE',variant:'DEFAULT',station:'BUILD',slot:0,source:99,unit:0},{name:'TDA',variant:'STELLAR',station:'BUILD',slot:2,source:98,unit:0}]},0)`);
 assert(result.assignments.some(x=>x.name==='TDA'&&x.station==='PROTOCOL_BATTLE_CRAFTING'));
});
test('protocol transfers specify regional destinations without auto-route claims',()=>{
 const {run}=setup();const steps=run(`protocolStepPlan({placed:[{name:'LOM',variant:'DEFAULT',station:'BUILD',slot:0,source:0,unit:0,built:true}]},{placed:[{name:'LOM',variant:'DEFAULT',station:'PROTOCOL_WORKER_CREDITS',slot:0,source:0,unit:0}],sell:[]})`);
 assert.equal(steps.length,1);assert.equal(steps[0].to.station,'PROTOCOL_WORKER_CREDITS');assert(!steps[0].text.includes('go to work'));
});

// Replay instructions against occupancy, so a pretty walkthrough cannot conceal
// a move into an occupied slot or lose a droid during temporary storage.
function planMoves(positions,targets,lounge=1){
 const {ctx,caps,run}=setup();caps.LOUNGE=lounge;
 const base=positions.map(([station,slot,extra={}],source)=>({name:'LOM',variant:'DEFAULT',source,unit:0,station,slot,...extra}));
 const goals=base.map((x,i)=>({...x,station:targets[i][0],slot:targets[i][1]}));
 ctx.base={placed:base};ctx.target={placed:goals,sell:[],overflow:[]};
 const steps=run('protocolStepPlan(base,target)'),current=structuredClone(base);
 for(const step of steps){
  if(step.type==='note')continue;
  const unit=current[step.unit.source];assert.equal(unit.station,step.from.station);assert.equal(unit.slot,step.from.slot);
  assert(!unit.lockedSlot);assert(!(unit.station==='BUILD'&&!unit.built));
  if(step.type==='swap'){
   const other=current[step.withUnit.source];assert.equal(other.station,step.withFrom.station);assert.equal(other.slot,step.withFrom.slot);
   const from={station:unit.station,slot:unit.slot};Object.assign(unit,{station:other.station,slot:other.slot});Object.assign(other,from);
  }else{
   assert(!current.some(x=>x!==unit&&x.station===step.to.station&&x.slot===step.to.slot));
   if(step.to.station==='LOUNGE')assert(step.to.slot<lounge);
   Object.assign(unit,{station:step.to.station,slot:step.to.slot});
  }
 }
 ctx.steps=steps;run('applyPlannedEquivalentSlots(base,target,steps)');
 return {steps,current,goals:structuredClone(ctx.target.placed)};
}
function finished(plan){assert.deepEqual(plan.current,plan.goals);assert(!plan.steps.some(s=>s.type==='note'));}
test('occupied work cycle uses nearest available Lounge slot then returns to work',()=>{
 const p=planMoves([['WORKER',0],['ASTROMECH',0],['BATTLE',0]],[['ASTROMECH',0],['BATTLE',0],['WORKER',0]],2);
 finished(p);assert(!p.steps.some(s=>s.type==='swap'));assert.equal(p.steps[0].to.station,'LOUNGE');assert.equal(p.steps[0].to.slot,1);
 assert(p.steps.some(s=>s.from.station==='LOUNGE'&&s.to.station!=='LOUNGE'));assert(p.steps.every(s=>s.at&&s.visit));
});
test('drains a full Lounge before breaking a work cycle',()=>{
 const p=planMoves([['WORKER',0],['ASTROMECH',0],['LOUNGE',0]],[['ASTROMECH',0],['WORKER',0],['BATTLE',0]]);
 finished(p);assert(!p.steps.some(s=>s.type==='swap'));assert.equal(p.steps[0].from.station,'LOUNGE');
});
test('Lounge to work exchange uses the spare Lounge slot',()=>{
 const p=planMoves([['WORKER',0],['LOUNGE',0]],[['LOUNGE',0],['WORKER',0]],2);
 finished(p);assert(!p.steps.some(s=>s.type==='swap'));assert.equal(p.steps.length,2);
 assert.equal(p.current[0].slot,1);
});
test('full Lounge falls back to a swap without displacing its resident',()=>{
 const p=planMoves([['WORKER',0],['ASTROMECH',0],['LOUNGE',0]],[['ASTROMECH',0],['WORKER',0],['LOUNGE',0]]);
 finished(p);assert.equal(p.steps.length,1);assert.equal(p.steps[0].type,'swap');
});

test('parked droids do not bounce between Lounge buffers while native work slots are free',()=>{
 for(const batch of [false,true]){
  const {ctx,caps,run}=setup();caps.LOUNGE=3;
  const positions=[['R7','ASTROMECH',0],['KX','WORKER',0],['LOM','LOUNGE',2],['R7','LOUNGE',0],['KX','LOUNGE',1]];
  const destinations=[['LOUNGE',0],['LOUNGE',1],['PROTOCOL_WORKER_CREDITS',0],['ASTROMECH',0],['WORKER',0]];
  const base=positions.map(([name,station,slot],source)=>({name,station,slot,variant:'DEFAULT',source,unit:0}));
  ctx.base={placed:base};ctx.target={placed:base.map((x,i)=>({...x,station:destinations[i][0],slot:destinations[i][1]})),sell:[],overflow:[]};
  const steps=run(`protocolStepPlan(base,target,false,${batch})`),current=structuredClone(base);
  assert(!steps.some(s=>s.type==='note'));assert(steps.length<15);
  const seen=new Set([JSON.stringify(current)]);
  for(const step of steps){
   const unit=current[step.unit.source];assert.equal(unit.station,step.from.station);assert.equal(unit.slot,step.from.slot);
   if(step.type==='swap'){
    const other=current[step.withUnit.source];assert.equal(other.station,step.withFrom.station);assert.equal(other.slot,step.withFrom.slot);
    const from={station:unit.station,slot:unit.slot};Object.assign(unit,{station:other.station,slot:other.slot});Object.assign(other,from);
   }else{
    assert(!current.some(x=>x.station===step.to.station&&x.slot===step.to.slot));
    if(step.workCommand){
     ctx.positions=current;ctx.moving=unit;
     const landing=run('plannedWorkLanding(moving,positions)');
     assert.equal(step.to.station,landing.station);assert.equal(step.to.slot,landing.slot);
    }
    Object.assign(unit,{station:step.to.station,slot:step.to.slot});
   }
   const layout=JSON.stringify(current);assert(!seen.has(layout),'repeated layout');seen.add(layout);
  }
  ctx.steps=steps;run('applyPlannedEquivalentSlots(base,target,steps)');
  assert.deepEqual(current,structuredClone(ctx.target.placed));
 }
});

test('MO-TRAK stays in its reached Lounge slot and Apply rows match the walkthrough',()=>{
 for(const batch of [false,true]){
  const {ctx,caps,run}=setup();caps.LOUNGE=5;
  ctx.base={placed:[
   {name:'MO-TRAK',variant:'RAINBOW',source:0,unit:0,station:'ASTROMECH',slot:0},
   {name:'TRI-TEK',variant:'BESKAR',source:1,unit:0,station:'LOUNGE',slot:2},
   {name:'KX',variant:'STELLAR',source:2,unit:0,station:'LOUNGE',slot:0,lockedSlot:true}
  ]};
  ctx.target={placed:ctx.base.placed.map((x,i)=>({...x,...(i===0?{station:'LOUNGE',slot:2}:i===1?{station:'ASTROMECH',slot:0}:{})})),sell:[],overflow:[]};
  const original=JSON.stringify(ctx.target),steps=run(`protocolStepPlan(base,target,false,${batch})`);
  assert.equal(JSON.stringify(ctx.target),original,'candidate planning must not mutate the preview');
  assert.equal(steps.length,2);assert.equal(steps[0].unit.name,'MO-TRAK');assert.equal(steps[0].to.slot,4);
  assert.equal(steps[1].unit.name,'TRI-TEK');assert.equal(steps[1].to.station,'ASTROMECH');
  ctx.steps=steps;run('applyPlannedEquivalentSlots(base,target,steps)');
  const mo=ctx.target.placed.find(x=>x.name==='MO-TRAK'),row=ctx.target.rows.find(x=>x.name==='MO-TRAK');
  assert.equal(mo.slot,4);assert.equal(row.preferred,'LOUNGE');assert.equal(row.preferredSlot,4);
  assert.equal(ctx.target.placed.find(x=>x.lockedSlot).slot,0);
  assert.equal(new Set(ctx.target.placed.map(x=>`${x.station}:${x.slot}`)).size,3);
 }
});
test('locked and unfinished blockers are never parked in the Lounge',()=>{
 for(const extra of [{lockedSlot:true},{built:false}]){
  const station=extra.lockedSlot?'ASTROMECH':'BUILD';
  const p=planMoves([['WORKER',0],[station,0,extra]],[[station,0],['WORKER',0]]);
  assert(p.steps.some(s=>s.type==='note'));assert.equal(p.current[1].station,station);
 }
});

test('Build replacement stays occupied until its incoming droid can swap in',()=>{
 const p=planMoves([['BUILD',0,{built:true}],['WORKER',0]],[['WORKER',0],['BUILD',0]],2);
 finished(p);assert(p.steps.some(s=>s.type==='swap'));
 assert(!p.steps.some(s=>s.type==='move'&&(s.from.station==='BUILD'||s.to.station==='BUILD')));
});
test('an empty Build slot is never used as storage',()=>{
 const p=planMoves([['WORKER',0]],[['BUILD',0]],2);
 assert(p.steps.some(s=>s.type==='note'));assert.equal(p.current[0].station,'WORKER');
});

test('mission Iconics are reserved before Protocol credit and crafting searches',()=>{
 for(const priority of ['credits','crafting']){
 const {state,caps,run}=setup();caps.ASTROMECH=3;state.protocolPriority=priority;
 state.owned=[{name:'CB-23',variant:'DEFAULT'},{name:'R2-D2',variant:'DEFAULT'},{name:'DRFT-R',variant:'STELLAR'},{name:'C-3PO',variant:'DEFAULT'}];
 const result=run(`optimiseBase({placed:[{...state.owned[0],source:0,unit:0,station:'ASTROMECH',slot:0},{...state.owned[1],source:1,unit:0,station:'ASTROMECH',slot:1}]},0)`);
 for(const name of ['CB-23','R2-D2']){const pick=result.assignments.find(x=>x.name===name);assert(pick?.missionPriority);assert.equal(pick.station,'ASTROMECH');assert([0,2].includes(pick.slot));}
 assert.equal(result.assignments.find(x=>x.name==='CB-23').slot,0);
 assert.equal(new Set(result.assignments.map(x=>`${x.station}:${x.slot}`)).size,result.assignments.length);
 }
});
test('mission priority respects locks and unfinished Iconics',()=>{
 const {state,run}=setup();state.owned=[{name:'CB-23',variant:'DEFAULT'},{name:'R2-D2',variant:'DEFAULT'}];
 const result=run(`optimiseBase({placed:[{...state.owned[0],source:0,unit:0,station:'WORKER',slot:0,lockedSlot:true},{...state.owned[1],source:1,unit:0,station:'BUILD',slot:0,built:false}]},0)`);
 assert.equal(result.assignments.length,0);
});

test('C-3PO triples regional credits without also applying his work bonus',()=>{
 const {run}=setup();
 const total=run(`incomeForPlaced([{name:'MOUSE',variant:'DEFAULT',station:'WORKER'},{name:'C-3PO',variant:'DEFAULT',station:'PROTOCOL_WORKER_CREDITS'}])`);
 assert(Math.abs(total-6.6)<1e-8);
 assert.equal(run(`protocolBonus(state.droids.find(d=>d.name==='C-3PO'),'DEFAULT','CREDITS')`),200);
});
test('C-3PO takes regional support when it wins, or work when another Protocol makes work better',()=>{
 for(const strongSupport of [false,true]){
  const {state,caps,ctx,run}=setup();caps.WORKER=2;
  state.droids.push({name:'EARNER',type:'WORKER',rarity:'COMMON',variants:{DEFAULT:{income:1000}}});
  state.owned=[{name:'C-3PO',variant:'DEFAULT'}];
  if(strongSupport){state.droids.push({name:'SUPPORT',type:'PROTOCOL',rarity:'COMMON',variants:{DEFAULT:{income:0,protocolCpsBonusPercent:190}}});state.owned.push({name:'SUPPORT',variant:'DEFAULT',qty:3});}
  const result=run(`optimiseBase({placed:['WORKER','ASTROMECH','BATTLE'].map((station,i)=>({name:'EARNER',variant:'DEFAULT',source:99+i,unit:0,station,slot:0,lockedSlot:true}))},0)`);
  const pick=result.assignments.find(x=>x.name==='C-3PO');assert(pick);
  assert.equal(pick.station,strongSupport?'WORKER':'PROTOCOL_WORKER_CREDITS');
 }
});

test('C-3PO gives +40/s only to his regional Build and wins crafting priority',()=>{
 const {state,run}=setup();state.protocolPriority='crafting';state.owned=[{name:'C-3PO',variant:'DEFAULT'}];
 assert.equal(run(`protocolCraftBonus([{name:'C-3PO',variant:'DEFAULT',station:'PROTOCOL_BATTLE_CRAFTING'}],2)`),40);
 assert.equal(run(`protocolCraftBonus([{name:'C-3PO',variant:'DEFAULT',station:'PROTOCOL_BATTLE_CRAFTING'}],0)`),0);
 assert.equal(run(`protocolCraftBonus([{name:'C-3PO',variant:'DEFAULT',station:'PROTOCOL_BATTLE_CREDITS'}],2)`),0);
 const result=run(`optimiseBase({placed:[]},0)`);
 assert(result.assignments.find(x=>x.name==='C-3PO').station.endsWith('_CRAFTING'));
});

test('independent region exchanges batch through Lounge in three visits',()=>{
 const {state,caps,ctx,run}=setup();Object.assign(caps,{WORKER:3,BATTLE:3,ASTROMECH:0,LOUNGE:3});
 state.droids.push({name:'TEST WORKER',type:'WORKER'},{name:'TEST BATTLE',type:'BATTLE'});
 const base=Array.from({length:6},(_,i)=>({name:i<3?'TEST WORKER':'TEST BATTLE',variant:'DEFAULT',source:i,unit:0,station:i<3?'BATTLE':'WORKER',slot:i%3}));
 ctx.base={placed:base};ctx.target={placed:base.map(x=>({...x,station:x.station==='WORKER'?'BATTLE':'WORKER'})),sell:[],overflow:[]};
 const steps=run('protocolStepPlan(base,target,false)'),baseline=run('protocolStepPlan(base,target,false,false)');
 const visits=xs=>xs.filter((x,i)=>!i||x.at!==xs[i-1].at).length;
 assert(!steps.some(x=>x.type==='note'||x.type==='swap'));assert.equal(visits(steps),3);assert(visits(steps)<visits(baseline));
 const current=structuredClone(base);
 for(const step of steps){
  const unit=current[step.unit.source];assert.equal(unit.station,step.from.station);assert.equal(unit.slot,step.from.slot);
  assert(!current.some(x=>x.station===step.to.station&&x.slot===step.to.slot));
  if(step.workCommand){const native=state.droids.find(x=>x.name===unit.name).type;assert.equal(step.to.station,native);}
  Object.assign(unit,{station:step.to.station,slot:step.to.slot});
  assert(current.filter(x=>x.station==='LOUNGE').length<=3);
 }
 ctx.steps=steps;run('applyPlannedEquivalentSlots(base,target,steps)');
 assert.deepEqual(current,structuredClone(ctx.target.placed));
});


test('Astromech Iconics use individual Mission or Credit Gain preferences',()=>{
 const {state,ctx,run}=setup();
 state.owned=['R2-D2','CB-23','BB-8','CHOPPER'].map(name=>({name,variant:'DEFAULT'}));
 state.astromechIconicRoles={'R2-D2':'credits','BB-8':'credits'};
 // Observe the reservation layer independently of the earning solver.
 run('optimiseUnreservedBase=(p)=>({assignments:[],fixed:p.placed})');
 ctx.p={placed:[]};
 const result=run('optimiseBase(p,0)');
 assert.deepEqual(Array.from(result.assignments,x=>x.name),['CB-23']);
 assert(result.assignments.every(x=>x.missionPriority));
 state.astromechIconicRoles=Object.fromEntries(state.owned.map(x=>[x.name,'credits']));
 assert.equal(run('optimiseBase(p,0)').assignments.length,0);
 state.astromechIconicRoles={};
 assert.equal(run('optimiseBase(p,0)').assignments[0].name,'R2-D2');
});
test('Astromech role validation defaults invalid and missing preferences to Mission',()=>{
 const {state,run}=setup();
 for(const value of [null,[],5,'credits',{'R2-D2':'invalid'}]){
  state.astromechIconicRoles=value;assert.equal(run("astromechIconicRole('R2-D2')"),'mission');
 }
 state.astromechIconicRoles={'R2-D2':'credits','CB-23':'mission'};
 assert.equal(run("astromechIconicRole('R2-D2')"),'credits');
 assert.equal(run("astromechIconicRole('CB-23')"),'mission');
});

function replayPlan(ctx,run){
 const steps=run('safeOptimiseStepPlan(base,target)'),key=x=>`${x.source}:${x.unit}`,spot=x=>`${x.station}:${x.slot}`;
 assert(!steps.some(s=>s.type==='note'));const current=new Map(ctx.base.placed.map(x=>[key(x),{...x}]));
 for(const step of steps){
  const unit=current.get(key(step.unit));assert(unit);assert.equal(spot(unit),spot(step.from));assert(!unit.lockedSlot);
  if(step.type==='sell'){current.delete(key(unit));continue;}
  if(step.type==='swap'){
   const other=current.get(key(step.withUnit));assert.equal(spot(other),spot(step.withFrom));assert(!other.lockedSlot);
   const from={station:unit.station,slot:unit.slot};Object.assign(unit,{station:other.station,slot:other.slot});Object.assign(other,from);
  }else{
   assert.equal(step.type,'move');assert(![...current.values()].some(x=>spot(x)===spot(step.to)));
   if(step.workCommand){ctx.moving=unit;ctx.positions=[...current.values()];const landing=run('plannedWorkLanding(moving,positions)');assert.equal(spot(step.to),spot(landing));}
   Object.assign(unit,{station:step.to.station,slot:step.to.slot});
  }
  assert.equal(new Set([...current.values()].map(spot)).size,current.size);
 }
 for(const goal of ctx.target.placed)assert.equal(spot(current.get(key(goal))),spot(goal));
 return steps;
}

test('identical Rainbow LOM already crafting stays put; the other copy moves directly',()=>{
 const {ctx,run}=setup();
 ctx.base={placed:[
  {name:'LOM',variant:'RAINBOW',source:0,unit:0,station:'PROTOCOL_WORKER_CRAFTING',slot:0,built:true},
  {name:'LOM',variant:'RAINBOW',source:1,unit:0,station:'PROTOCOL_WORKER_CREDITS',slot:0}
 ]};
 // The floating destination deliberately comes before the already occupied one.
 ctx.target={placed:ctx.base.placed.map((x,i)=>({...x,station:i?'PROTOCOL_WORKER_CRAFTING':'PROTOCOL_ASTROMECH_CRAFTING'})),sell:[],overflow:[]};
 const steps=replayPlan(ctx,run);
 assert.equal(steps.length,1);assert.equal(steps[0].from.station,'PROTOCOL_WORKER_CREDITS');
 assert.equal(steps[0].to.station,'PROTOCOL_ASTROMECH_CRAFTING');
 assert.equal(ctx.target.placed.find(x=>x.source===0).station,'PROTOCOL_WORKER_CRAFTING');
 assert.equal(ctx.target.rows.find(x=>x.preferred==='PROTOCOL_WORKER_CRAFTING').built,true);
});

test('IG arriving in Worker 8 stays there; CYCLENS swaps straight from Worker 2 to Astromech',()=>{
 const {ctx,caps,run}=setup();Object.assign(caps,{WORKER:8,BATTLE:6,ASTROMECH:1,LOUNGE:0});
 const names=['PROTO-ROLLER','IG','CYCLENS','R7','IG'];
 const starts=[['WORKER',7],['BATTLE',5],['WORKER',1],['ASTROMECH',0],['BATTLE',1]];
 const goals=[['BATTLE',5],['WORKER',1],['ASTROMECH',0],['BATTLE',1],['WORKER',7]];
 const units=starts.map(([station,slot],source)=>({name:names[source],variant:['STELLAR','BESKAR','BESKAR','STELLAR','BESKAR'][source],source,unit:0,station,slot}));
 const fixed=[...Array.from({length:8},(_,slot)=>['WORKER',slot]),...Array.from({length:6},(_,slot)=>['BATTLE',slot])]
  .filter(([station,slot])=>!units.some(x=>x.station===station&&x.slot===slot))
  .map(([station,slot],i)=>({name:'MOUSE',variant:'DEFAULT',source:10+i,unit:0,station,slot,lockedSlot:true}));
 ctx.base={placed:[...units,...fixed]};ctx.target={placed:[...units.map((x,i)=>({...x,station:goals[i][0],slot:goals[i][1]})),...fixed],sell:[],overflow:[]};
 const steps=replayPlan(ctx,run);
 assert.equal(steps.length,3);assert(steps.every(x=>x.type==='swap'&&x.from.station!==x.withFrom.station));
 assert(steps.some(x=>x.unit.name==='CYCLENS'&&x.from.station==='WORKER'&&x.from.slot===1&&x.withFrom.station==='ASTROMECH'));
 assert.equal(ctx.target.placed.find(x=>x.source===1).slot,7);
});

test('Worker slot-only permutations need no steps, while mission slot choices remain exact',()=>{
 const {ctx,caps,run}=setup();Object.assign(caps,{WORKER:2,ASTROMECH:3,LOUNGE:0});
 ctx.base={placed:[{name:'IG',variant:'BESKAR',source:0,unit:0,station:'WORKER',slot:0},{name:'CYCLENS',variant:'BESKAR',source:1,unit:0,station:'WORKER',slot:1}]};
 ctx.target={placed:ctx.base.placed.map(x=>({...x,slot:1-x.slot})),sell:[],overflow:[]};
 assert.equal(replayPlan(ctx,run).length,0);
 ctx.base={placed:ctx.base.placed.map((x,i)=>({...x,station:'ASTROMECH',slot:i*2}))};
 ctx.target={placed:ctx.base.placed.map(x=>({...x,slot:2-x.slot,missionPriority:true})),sell:[],overflow:[]};
 assert.equal(replayPlan(ctx,run).length,1);
 caps.ASTROMECH=4;
 ctx.base={placed:ctx.base.placed.map((x,i)=>({...x,slot:1+i*2}))};
 ctx.target={placed:ctx.base.placed.map(x=>({...x,slot:4-x.slot})),sell:[],overflow:[]};
 assert.equal(replayPlan(ctx,run).length,0,'ordinary Astromech credit slots are interchangeable');
 ctx.base={placed:ctx.base.placed.map((x,i)=>({...x,slot:i}))};
 ctx.target={placed:ctx.base.placed.map(x=>({...x,slot:1-x.slot})),sell:[],overflow:[]};
 assert.equal(replayPlan(ctx,run).length,1,'moving into or out of a mission position is a real change');
});

test('duplicate matching preserves locks, unfinished builds, manual Keep and copy counts',()=>{
 const {ctx,run}=setup();
 for(const protection of [{lockedSlot:true},{keepReason:'manual'},{station:'BUILD',built:false}]){
  const a={name:'LOM',variant:'RAINBOW',source:0,unit:0,station:'PROTOCOL_WORKER_CRAFTING',slot:0,...protection};
  const b={name:'LOM',variant:'RAINBOW',source:1,unit:0,station:'PROTOCOL_ASTROMECH_CRAFTING',slot:0};
  ctx.base={placed:[a,b]};ctx.target={placed:[{...a,station:b.station}],sell:[b],overflow:[]};
  const result=run('normaliseProjectedForSteps(base,target)');
  assert.equal(result.placed[0].source,0);assert.equal(result.sell[0].source,1);
 }
 ctx.base={placed:[{name:'LOM',variant:'RAINBOW',source:0,unit:0,station:'LOUNGE',slot:0},{name:'LOM',variant:'RAINBOW',source:1,unit:0,station:'PROTOCOL_WORKER_CRAFTING',slot:0}]};
 ctx.target={placed:[{...ctx.base.placed[0],station:'PROTOCOL_WORKER_CRAFTING',slot:0}],sell:[ctx.base.placed[1]],overflow:[]};
 const steps=replayPlan(ctx,run);assert.equal(steps.length,1);assert.equal(steps[0].type,'sell');assert.equal(steps[0].unit.source,0);
});
