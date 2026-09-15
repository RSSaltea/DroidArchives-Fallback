// Result capacity must be checked before loading the next three inputs.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(path.resolve(__dirname,'../../app.js'),'utf8');
const start=src.indexOf('function scheduleFusionBuildSteps('),end=src.indexOf('function safeOptimiseStepPlan(',start);
const cap={FUSION_BUILD:3,WORKER:6,ASTROMECH:0,BATTLE:0,LOUNGE:0};
const sb={state:{droids:[{name:'READY',type:'WORKER'},{name:'INPUT',type:'WORKER'}]},
  stationSlotIndices:s=>Array.from({length:cap[s]||0},(_,i)=>i),slotFillOrder:s=>Array.from({length:cap[s]||0},(_,i)=>i),
  NEAREST_ORDER:['WORKER','BATTLE','ASTROMECH'],PRODUCTIVE_STATIONS:['WORKER','ASTROMECH','BATTLE'],
  unitName:u=>u.name+' '+u.variant,placeName:s=>s};
vm.createContext(sb);vm.runInContext(src.slice(start,end),sb);
const inputs=Array.from({length:6},(_,i)=>({source:i,unit:0,name:'INPUT',variant:'BESKAR',station:'WORKER',slot:i}));
const ready=(slot,built=true)=>({source:10+slot,unit:0,name:'READY',variant:'DEFAULT',station:'FUSION_BUILD',slot,built});
function batch(n){return [...inputs.slice(n*3,n*3+3).map(unit=>({type:'fuse-in',unit,from:'WORKER',visit:n})),
  {type:'fuse',visit:n,fusion:{variant:'BESKAR'},unit:null,text:'Fuse. Collect the result and clear the table before the next batch.'}];}
const run=(build,steps=[...batch(0),...batch(1)])=>sb.scheduleFusionBuildSteps(steps,{placed:[...inputs,...build],overflow:[]},{placed:[]});
let plan=run([ready(0),ready(1)]);
assert(!plan.blocked);
assert.equal(plan.steps.filter(s=>s.type==='fuse').length,2);
const move=plan.steps.findIndex(s=>s.from==='FUSION_BUILD');
assert(move>plan.steps.findIndex(s=>s.type==='fuse'));
assert(move<plan.steps.findIndex(s=>s.type==='fuse-in'&&s.visit===1));
assert.deepEqual(Array.from(plan.steps.filter(s=>s.type==='fuse'),s=>s.toSlot),[2,0]);
assert.equal(plan.remaining.placed.filter(x=>x.station==='FUSION_BUILD').length,3);
assert.equal(plan.remaining.placed.find(x=>x.source===10).station,'WORKER');
console.log('PASS: two ready builds + one result fills the room; a ready droid leaves before batch two loads');
plan=run([ready(0,false),ready(1,false)]);
assert(plan.blocked);
assert.equal(plan.steps.filter(s=>s.type==='fuse').length,1);
assert.equal(plan.steps.filter(s=>s.type==='fuse-in').length,3);
assert.equal(plan.steps.filter(s=>s.type==='fuse-deferred').length,3);
assert(plan.steps.some(s=>s.fusionBlocked));
console.log('PASS: unfinished builds stop later transfers instead of overflowing');
plan=run([ready(0,false),ready(1,false),ready(2,false)]);
assert(plan.blocked);assert(!plan.steps.some(s=>s.type==='fuse-in'||s.type==='fuse'));
console.log('PASS: a full room at the start prevents loading the first batch');
cap.LOUNGE=2;
plan=run([ready(0),ready(1),ready(2)]);
assert(!plan.blocked);assert.equal(plan.steps.filter(s=>s.type==='fuse').length,2);
assert.equal(plan.steps[0].to,'LOUNGE');assert.equal(plan.steps[0].toSlot,0);assert.equal(plan.steps[0].fromSlot,0);
assert.equal(plan.steps[0].kind,'lounge');assert(plan.steps[0].text.startsWith('Move READY'));
assert.equal(plan.remaining.placed.find(x=>x.source===10).station,'LOUNGE');
assert.equal(plan.remaining.placed.find(x=>x.source===11).station,'WORKER','prefer work after inputs free a work slot');
assert.equal(new Set(plan.remaining.placed.map(x=>`${x.station}:${x.slot}`)).size,plan.remaining.placed.length);
const loungeOccupant={source:20,unit:0,name:'READY',variant:'DEFAULT',station:'LOUNGE',slot:0};
plan=run([ready(0),ready(1),ready(2),loungeOccupant],batch(0));
assert.equal(plan.steps[0].toSlot,1,'use a genuinely empty Lounge slot');
assert.equal(plan.remaining.placed.find(x=>x.source===20).slot,0,'existing occupant stays put');
plan=run([{...ready(0),lockedSlot:true},ready(1,false),ready(2)],batch(0));
assert.equal(plan.steps[0].unit.source,12,'skip locked and unfinished droids');
plan=run([ready(0,false),ready(1,false),ready(2,false)],batch(0));assert(plan.blocked,'free Lounge cannot make unfinished builds movable');
cap.LOUNGE=1;plan=run([ready(0),ready(1),ready(2),loungeOccupant],batch(0));
assert(plan.blocked);assert(!plan.steps.some(s=>s.type==='fuse-in'||s.type==='fuse'),'full destinations remain blocked');
cap.LOUNGE=0;
console.log('PASS: completed builds use free Lounge slots, continue batches and respect occupants, locks and unfinished builds');
cap.FUSION_BUILD=1;
plan=run([]);assert(plan.blocked);assert.equal(plan.steps.filter(s=>s.type==='fuse').length,1);
console.log('PASS: only unlocked result slots are counted');
// A known result reused in the next recipe frees its own result slot.
const first=batch(0);first[3].unit={name:'RESULT',variant:'RAINBOW'};
const next=[{type:'fuse-result',unit:{name:'RESULT',variant:'RAINBOW',count:1},visit:1},...batch(1).slice(0,2),batch(1)[3]];
plan=run([],first.concat(next));assert(!plan.blocked);
assert.equal(plan.steps.filter(s=>s.type==='fuse').length,2);
assert(plan.steps.find(s=>s.type==='fuse-result').text.includes('Wait for'));
assert.equal(plan.remaining.placed.filter(x=>x.station==='FUSION_BUILD').length,1);
console.log('PASS: chained results wait to finish and release their occupied slot');
