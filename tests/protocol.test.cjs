// Run with node --test tests/protocol.test.cjs.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const validation=fs.readFileSync(path.join(__dirname,'../optimise-plan-validation.js'),'utf8').replace(/^export /gm,'');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/droids.json'),'utf8'));
// Select complete top-level functions by the next top-level declaration.
function fn(name){const at=src.indexOf(`function ${name}(`);assert(at>=0,name);const tail=src.slice(at);const end=tail.slice(1).search(/\n(?:function |const |let |async function |\/\/)/);return end<0?tail:tail.slice(0,end+1);}
function setup(){
 const state={droids:structuredClone(data),owned:[],protocolPriority:'credits'};
 const caps={WORKER:1,ASTROMECH:1,BATTLE:1,BUILD:3,FUSION_BUILD:3,LOUNGE:1};
 const ctx=vm.createContext({state,console,ASTROMECH_MISSION_SLOTS:[0,2,4,6,8],optimiseMoveLambda:()=>0,PRODUCTIVE_STATIONS:['WORKER','ASTROMECH','BATTLE'],
  effectiveMultiplier:()=>1,isIconic:d=>d?.rarity==='ICONIC',iconicIncome:d=>d?.rarity==='ICONIC'?(d.special?.incomePercent??.15):0,
  placedBaseIncome:placed=>placed.reduce((n,x)=>n+(state.droids.find(d=>d.name===x.name)?.variants[x.variant]?.income||0),0),
  expandedOwned:()=>state.owned.flatMap((x,source)=>Array.from({length:x.qty||1},(_,unit)=>({...x,source,unit}))),
  isBuilding:x=>['BUILD','FUSION_BUILD'].includes(x.station)&&!x.built,
  productiveStations:()=>Object.entries(caps).filter(([station])=>['WORKER','ASTROMECH','BATTLE'].includes(station)).flatMap(([station,n])=>Array.from({length:n},(_,slot)=>({station,slot}))),
  stationSlotIndices:station=>Array.from({length:caps[station]??(station.startsWith('PROTOCOL_')?1:0)},(_,i)=>i),
  slotFillOrder:station=>Array.from({length:caps[station]||0},(_,i)=>i).reverse(),
  optimiseAssignmentMoves:()=>[],
  stabiliseAssignments:x=>x,
  optimiseCreditBase:()=>({income:0,assignments:[],moves:[]}),
  unitName:x=>x.name,slotLabel:x=>x?`${x.station} ${x.slot+1}`:'Roster',withFusionSteps:x=>x
 });
 vm.runInContext(src.slice(src.indexOf('const PROTOCOL_REGIONS='),src.indexOf('const SLOT_RULES=')),ctx);
 vm.runInContext(fn('stabiliseProjectedPlacements'),ctx);
 vm.runInContext(fn('normaliseProjectedForSteps'),ctx);
 vm.runInContext(validation,ctx);
 vm.runInContext(fn('resolveOptimiseProjection'),ctx);
 ctx.isProtocolStation=s=>s.startsWith('PROTOCOL_');ctx.optimiseStepStyle=()=> 'route';
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
 const result=run('normaliseProjectedForSteps(base,target)');assert.equal(result.sell[0].source,0);assert.equal(result.placed[0].source,1);
});
