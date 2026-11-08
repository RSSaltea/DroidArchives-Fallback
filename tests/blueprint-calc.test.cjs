const {test}=require('node:test');
const assert=require('node:assert/strict');
const {blueprintSummary,blueprintCounts,blueprintPlan,blueprintGoal}=require('../blueprint-calc.js');
const unit=(rarity,station='WORKER',slot=0,extra={})=>({name:rarity,rarity,type:'WORKER',station,slot,built:true,...extra});
const slots=[{station:'WORKER',slot:0},{station:'WORKER',slot:1},{station:'LOUNGE',slot:0},{station:'LOUNGE',slot:1}];
test('rarity half-boundaries are inclusive below, exclusive above; Mythic counts as five',()=>{
 assert.equal(blueprintCounts({RARE:1,EPIC:1}).rarity,'EPIC');
 assert.equal(blueprintCounts({EPIC:1,LEGENDARY:1}).rarity,'LEGENDARY');
 assert.equal(blueprintCounts({COMMON:1,MYTHIC:1}).average,2.5);
 assert.equal(blueprintCounts({MYTHIC:8}).rarity,'LEGENDARY');
 assert.equal(blueprintCounts({}).rarity,'COMMON');
 assert.equal(blueprintCounts({RARE:2,EPIC:1}).rarity,'RARE');
});
test('same target works for both; different rarity targets and Mythic are unavailable',()=>{
 assert.deepEqual(blueprintGoal('EPIC','EPIC'),{rarity:'EPIC',min:1.5,max:2.5});
 assert(blueprintGoal('EPIC','RARE').error);assert(blueprintGoal('MYTHIC',null).error);
});
test('counts occupied slots, excluding only Iconics, Lounge, Protocol and unallocated',()=>{
 const s=blueprintSummary([unit('MYTHIC','LOUNGE'),unit('MYTHIC','PROTOCOL_WORKER_CREDITS'),unit('ICONIC'),unit('MYTHIC',null),unit('EPIC','BUILD',0,{built:false}),unit('RARE','COMPANION'),unit('LEGENDARY','FUSION')]);
 assert.equal(s.count,3);assert.equal(s.average,2);assert.equal(s.rarity,'EPIC');
});
test('can lower a Base by replacing an exact Mythic copy with an owned Epic',()=>{
 const units=[unit('MYTHIC','WORKER',0,{source:0,unit:0}),unit('EPIC','LOUNGE',0,{source:1,unit:0})];
 const p=blueprintPlan({units,slots,goal:blueprintGoal('EPIC')});
 assert.equal(p.status,'found');assert.equal(p.summary.rarity,'EPIC');assert.equal(p.steps.length,1);
 assert.equal(p.steps[0].unit.source,0);assert.equal(p.steps[0].other.source,1);
 assert.equal(units[0].station,'WORKER','input save is unchanged');
 assert.equal(new Set(p.units.map(u=>u.station+u.slot)).size,units.length);
});
test('can raise the average using a stored higher rarity',()=>{
 const p=blueprintPlan({units:[unit('COMMON'),unit('EPIC','LOUNGE')],slots,goal:blueprintGoal(null,'EPIC')});
 assert.equal(p.status,'found');assert.equal(p.summary.rarity,'EPIC');
});
test('can lower by storing a high copy without consuming it',()=>{
 const p=blueprintPlan({units:[unit('MYTHIC'),unit('EPIC','WORKER',1)],slots,goal:blueprintGoal('EPIC')});
 assert.equal(p.status,'found');assert.equal(p.units.length,2);assert.equal(p.units.find(u=>u.rarity==='MYTHIC').station,'LOUNGE');
});
test('locked, unfinished and group-protected droids stay in place',()=>{
 for(const protection of [{lockedSlot:true},{built:false},{protected:true}]){
  const p=blueprintPlan({units:[unit('MYTHIC','WORKER',0,protection),unit('EPIC','LOUNGE',0,{lockedSlot:true})],slots,goal:blueprintGoal('EPIC')});
  assert.equal(p.status,'not-found');
 }
});
test('cannot place an incompatible droid or use nonexistent storage',()=>{
 const p=blueprintPlan({units:[unit('MYTHIC'),unit('EPIC','LOUNGE')],slots:[slots[0],slots[2]],canUse:()=>false,goal:blueprintGoal('EPIC')});
 assert.equal(p.status,'not-found');
});
test('combined setup requires and preserves an operating blueprint mission',()=>{
 const goal=blueprintGoal('EPIC','EPIC');
 assert.equal(blueprintPlan({units:[unit('EPIC')],slots,goal,requireMission:true}).status,'mission');
 assert.equal(blueprintPlan({units:[unit('ICONIC','ASTROMECH',0,{missionBlueprint:false})],slots,goal,requireMission:true}).status,'mission');
 const units=[unit('MYTHIC','ASTROMECH',0),unit('EPIC','LOUNGE',0)];
 const p=blueprintPlan({units,slots:[{station:'ASTROMECH',slot:0},...slots],goal,requireMission:true});
 assert.equal(p.status,'found');assert(p.units.some(u=>u.station==='ASTROMECH'&&u.slot===0));assert.equal(p.summary.rarity,'EPIC');
});

test('keeps searching when the target requires more than ten changes',()=>{
 const units=Array.from({length:22},(_,i)=>unit('MYTHIC','WORKER',i));
 units.push(unit('EPIC','BUILD',0,{built:false}));
 const slots=Array.from({length:22},(_,i)=>({station:'LOUNGE',slot:i}));
 const p=blueprintPlan({units,slots,goal:blueprintGoal('EPIC')});
 assert.equal(p.status,'found');assert.equal(p.steps.length,22);
 assert.equal(p.summary.rarity,'EPIC');assert.equal(p.units.length,23);
});
