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
 const ctx=vm.createContext({state,console,PRODUCTIVE_STATIONS:['WORKER','ASTROMECH','BATTLE'],
  effectiveMultiplier:()=>1,isIconic:d=>d?.rarity==='ICONIC',iconicIncome:d=>d?.rarity==='ICONIC'?(d.special?.incomePercent??.15):0,
  placedBaseIncome:placed=>placed.reduce((n,x)=>n+(state.droids.find(d=>d.name===x.name)?.variants[x.variant]?.income||0),0),
  expandedOwned:()=>state.owned.flatMap((x,source)=>Array.from({length:x.qty||1},(_,unit)=>({...x,source,unit}))),
  isBuilding:x=>x.station==='BUILD'&&!x.built,
  productiveStations:()=>Object.entries(caps).flatMap(([station,n])=>Array.from({length:n},(_,slot)=>({station,slot}))),
  stationSlotIndices:station=>Array.from({length:caps[station]??(station.startsWith('PROTOCOL_')?1:0)},(_,i)=>i),
  stabiliseAssignments:x=>x,
  optimiseCreditBase:()=>({income:0,assignments:[],moves:[]}),
  unitName:x=>x.name,slotLabel:x=>x?`${x.station} ${x.slot+1}`:'Roster',withFusionSteps:x=>x
 });
 vm.runInContext(src.slice(src.indexOf('const PROTOCOL_REGIONS='),src.indexOf('const SLOT_RULES=')),ctx);
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
