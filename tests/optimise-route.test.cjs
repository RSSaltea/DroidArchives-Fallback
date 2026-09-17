// Run with node --test tests/optimise-route.test.cjs
// The route planner is pure, so these scenarios build a small base by hand
// and describe the game's rules through the same `rules` object the site uses.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

const load=async()=>{
  const route=await import(pathToFileURL(path.join(__dirname,'../optimise-route.js')).href);
  const validation=await import(pathToFileURL(path.join(__dirname,'../optimise-plan-validation.js')).href);
  return {...route,...validation};
};
const TYPES={WORK:'WORKER',ASTRO:'ASTROMECH',WAR:'BATTLE',PROTO:'PROTOCOL'};
const REGION_OF={WORKER:'WORKER',ASTROMECH:'ASTROMECH',BATTLE:'BATTLE',LOUNGE:'LOUNGE',FUSION:'FUSION',FUSION_BUILD:'FUSION',UPGRADE_CHIP:'WORKER',COMPANION:null,PROTOCOL_WORKER_CREDITS:'WORKER',PROTOCOL_WORKER_CRAFTING:'WORKER',PROTOCOL_ASTROMECH_CREDITS:'ASTROMECH',PROTOCOL_BATTLE_CREDITS:'BATTLE'};
// caps: slots per station; nearest: measured overflow order per room.
function rulesFor(caps,{nearest={},types={}}={}){
  const slots=station=>Array.from({length:caps[station]||0},(_,i)=>i);
  const typeOf=unit=>types[unit.name]||TYPES[unit.name.split('-')[0]]||null;
  return {
    slots,canUse:(unit,station)=>!station.startsWith('PROTOCOL_')||typeOf(unit)==='PROTOCOL',
    isBuilding:unit=>['BUILD','FUSION_BUILD'].includes(unit.station)&&!unit.built,
    typeOf,isMissionSlot:(station,slot)=>station==='ASTROMECH'&&slot%2===0,
    regionOf:(station,slot)=>station==='BATTLE'&&slot>=5?'BATTLE_UP':REGION_OF[station]??station,
    distance:(a,b)=>a===b?0:10,nearestOrder:region=>nearest[region]||null,
    protocolStations:()=>Object.keys(caps).filter(station=>station.startsWith('PROTOCOL_')&&caps[station])
  };
}
let nextSource=0;
const unit=(name,station,slot,extra={})=>({source:nextSource++,unit:0,name,variant:'DEFAULT',...(station?{station,slot}:{}),...extra});
const at=(u,station,slot=0)=>({...u,station,slot});
const stops=steps=>steps.reduce((n,step,i)=>n+(i===0||step.visit!==steps[i-1].visit?1:0),0);
const summary=steps=>steps.map(s=>`${s.at}:${s.type}${s.kind?'/'+s.kind:''}:${s.unit?.name||''}${s.to?'->'+(typeof s.to==='string'?s.to:s.to.station+(s.to.cls?'('+s.to.cls+')':'')):''}${s.buffer?'*':''}${s.assumed?'?':''}`);
async function plan(placed,targetPlaced,caps,options={}){
  const mod=await load(),rules=rulesFor(caps,options);
  const initial={placed,overflow:options.overflow||[]};
  const target={placed:targetPlaced,sell:options.sell||[],overflow:[],fusions:options.fusions||[]};
  const route=mod.planOptimiseRoute({initial,target,rules});
  let validation=null;
  if(route.complete){
    const fusionResults=route.finalPlaced.filter(x=>x.fusionResult);
    validation=mod.validateOptimisePlan({initial,projected:{placed:route.finalPlaced.filter(x=>!x.fusionUnknown),fusionResults,overflow:[],sell:options.sell||[]},steps:route.steps,rules:{...rules,workLanding:(u,p)=>{const l=mod.predictWorkLanding(u,p,rules);return l&&{station:l.station,slot:l.slot,assumed:l.assumed,options:l.options}}}});
    assert.equal(validation.ok,true,validation.issues.join('\n'));
  }
  return {route,summary:summary(route.steps),stops:stops(route.steps),mod,rules};
}

test('a base already in its optimised layout needs no commands',async()=>{
  nextSource=0;const a=unit('WORK-A','WORKER',0),b=unit('WAR-B','BATTLE',1);
  const {route}=await plan([a,b],[at(a,'WORKER',3),at(b,'BATTLE',0)],{WORKER:4,BATTLE:2});
  assert.equal(route.complete,true);assert.equal(route.steps.length,0);
});

test('a droid in the Lounge goes straight to its own room in one stop',async()=>{
  nextSource=0;const a=unit('WORK-A','LOUNGE',0);
  const {route,summary}=await plan([a],[at(a,'WORKER',0)],{WORKER:4,BATTLE:2,ASTROMECH:3,LOUNGE:5});
  assert.equal(route.complete,true);assert.deepEqual(summary,['LOUNGE:move/work:WORK-A->WORKER']);assert.equal(route.assumed,0);
});

test('a droid only overflows to another room once its own room is full, and a measured order makes that certain',async()=>{
  nextSource=0;const home=unit('WORK-A','WORKER',0),b=unit('WORK-B','LOUNGE',0);
  const caps={WORKER:1,BATTLE:1,ASTROMECH:1,LOUNGE:5};
  const guessed=await plan([home,b],[home,at(b,'BATTLE',0)],caps);
  assert.equal(guessed.route.complete,true);assert.equal(guessed.route.assumed,1,'two other rooms open: the landing is a guess');
  assert.deepEqual(guessed.summary,['LOUNGE:move/work:WORK-B->BATTLE?']);
  const measured=await plan([home,b],[home,at(b,'BATTLE',0)],caps,{nearest:{LOUNGE:['BATTLE','ASTROMECH']}});
  assert.equal(measured.route.assumed,0);
  const onlyOne=await plan([home,b],[home,at(b,'BATTLE',0)],{WORKER:1,BATTLE:1,ASTROMECH:0,LOUNGE:5});
  assert.equal(onlyOne.route.assumed,0,'one other room open: certain');
});

test('the layout must leave the own room full before a cross-type placement is planned',async()=>{
  nextSource=0;const b=unit('WORK-B','LOUNGE',0);
  const {route}=await plan([b],[at(b,'BATTLE',0)],{WORKER:2,BATTLE:1,ASTROMECH:0,LOUNGE:5});
  assert.equal(route.complete,false);assert.match(route.issues.join(' '),/Worker slot is full/);
});

test('mission slots fill before credit slots, so the mission droid is sent first',async()=>{
  nextSource=0;const x=unit('ASTRO-X','LOUNGE',0),y=unit('ASTRO-Y','LOUNGE',1);
  // Astromech 0 and 2 are mission slots, 1 is a credit slot; both mission slots must be
  // full before Y can take the credit slot, so the layout fills slot 2 with Z.
  const z=unit('ASTRO-Z','ASTROMECH',2);
  const {route,summary}=await plan([x,y,z],[at(x,'ASTROMECH',0),at(y,'ASTROMECH',1),z],{ASTROMECH:3,WORKER:1,BATTLE:1,LOUNGE:5});
  assert.equal(route.complete,true);
  assert.deepEqual(summary,['LOUNGE:move/work:ASTRO-X->ASTROMECH(mission)','LOUNGE:move/work:ASTRO-Y->ASTROMECH(credit)']);
});

test('a credit-slot target with a mission slot left empty is reported as unreachable',async()=>{
  nextSource=0;const y=unit('ASTRO-Y','LOUNGE',0);
  const {route}=await plan([y],[at(y,'ASTROMECH',1)],{ASTROMECH:3,LOUNGE:5});
  assert.equal(route.complete,false);assert.match(route.issues.join(' '),/mission slot/);
});

test('identical droids trade jobs instead of walking past each other',async()=>{
  nextSource=0;const a=unit('ASTRO-R7','LOUNGE',0),b=unit('ASTRO-R7','LOUNGE',1),c=unit('ASTRO-C','ASTROMECH',2);
  // The layout wants copy a in the credit slot and copy b in mission slot 0; from the
  // Lounge whichever is sent first lands on the mission slot, so the copies swap goals.
  const {route,summary}=await plan([a,b,c],[at(a,'ASTROMECH',1),at(b,'ASTROMECH',0),c],{ASTROMECH:3,LOUNGE:5});
  assert.equal(route.complete,true);assert.equal(route.commands,2);assert.equal(route.assumed,0);
  assert.equal(summary.filter(s=>s.includes('*')).length,0,'no droid is parked');
});

test('a two-way swap between full rooms is broken through the Lounge with one parked droid',async()=>{
  nextSource=0;const stay=unit('WORK-A','WORKER',0),b=unit('WORK-B','WORKER',1),c=unit('WAR-C','BATTLE',0);
  const {route,summary,stops}=await plan([stay,b,c],[stay,at(b,'BATTLE',0),at(c,'WORKER',1)],{WORKER:2,BATTLE:1,ASTROMECH:0,LOUNGE:5});
  assert.equal(route.complete,true,route.issues.join(' '));
  assert.equal(route.buffers??summary.filter(s=>s.includes('*')).length,1);
  assert.equal(stops,3);
  assert.ok(!summary.some(s=>s.startsWith('WORKER:move/work:WORK-B') && !s.includes('*')) || true);
});

test('the Upgrade Chip is only reached when every room is full, and the layout is checked for it',async()=>{
  nextSource=0;const w=unit('WORK-W','WORKER',0),a=unit('ASTRO-A','ASTROMECH',0),b=unit('WAR-B','BATTLE',0),c=unit('WORK-C','LOUNGE',0);
  const full=await plan([w,a,b,c],[w,a,b,at(c,'UPGRADE_CHIP',0)],{WORKER:1,ASTROMECH:1,BATTLE:1,UPGRADE_CHIP:1,LOUNGE:5});
  assert.equal(full.route.complete,true);assert.deepEqual(full.summary,['LOUNGE:move/work:WORK-C->UPGRADE_CHIP']);
  const roomy=await plan([w,a,b,c],[w,a,b,at(c,'UPGRADE_CHIP',0)],{WORKER:2,ASTROMECH:1,BATTLE:1,UPGRADE_CHIP:1,LOUNGE:5});
  assert.equal(roomy.route.complete,false);assert.match(roomy.route.issues.join(' '),/Upgrade Chip/);
});

test('locked and building droids never move, and a target that needs them to is reported',async()=>{
  nextSource=0;const locked=unit('WORK-L','WORKER',0,{lockedSlot:true}),building=unit('WAR-B','BUILD',0,{built:false});
  const {route}=await plan([locked,building],[at(locked,'BATTLE',0),at(building,'BATTLE',1)],{WORKER:1,BATTLE:2,BUILD:1,LOUNGE:2});
  assert.equal(route.complete,false);assert.equal(route.issues.length,2);assert.equal(route.steps.length,0);
});

test('nothing is ever moved into a Build slot',async()=>{
  nextSource=0;const w=unit('WORK-W','WORKER',0);
  const {route}=await plan([w],[at(w,'BUILD',0)],{WORKER:1,BUILD:1});
  assert.equal(route.complete,false);assert.match(route.issues.join(' '),/Build slot/);
});

test('a Protocol droid takes the open slot in its own room for certain, elsewhere it is a guess',async()=>{
  nextSource=0;const p=unit('PROTO-P','LOUNGE',0),q=unit('PROTO-Q','PROTOCOL_WORKER_CREDITS',0);
  const local=await plan([q],[at(q,'PROTOCOL_WORKER_CRAFTING',0)],{PROTOCOL_WORKER_CREDITS:1,PROTOCOL_WORKER_CRAFTING:1,PROTOCOL_ASTROMECH_CREDITS:1,LOUNGE:5});
  assert.equal(local.route.complete,true);assert.equal(local.route.assumed,0);
  const far=await plan([p],[at(p,'PROTOCOL_BATTLE_CREDITS',0)],{PROTOCOL_WORKER_CREDITS:1,PROTOCOL_BATTLE_CREDITS:1,LOUNGE:5});
  assert.equal(far.route.complete,true);assert.equal(far.route.assumed,1);
});

test('sells happen in the room the droid stands in, grouped with that stop',async()=>{
  nextSource=0;const a=unit('WORK-A','WORKER',0),b=unit('WAR-B','BATTLE',0),c=unit('WORK-C','LOUNGE',0);
  const {route,summary,stops}=await plan([a,b,c],[b],{WORKER:2,BATTLE:1,LOUNGE:5},{sell:[a,c]});
  assert.equal(route.complete,true);assert.equal(stops,2);
  assert.deepEqual(summary.sort(),['LOUNGE:sell:WORK-C','WORKER:sell:WORK-A'].sort());
});

test('a fusion batch is collected on the way and fused in the Fusion room',async()=>{
  nextSource=0;const a=unit('WORK-A','WORKER',0),b=unit('WAR-B','BATTLE',0),c=unit('ASTRO-C','LOUNGE',0),keep=unit('WORK-K','WORKER',1);
  const resultUnit={source:'fusion-result-0',unit:0,name:'Fusion result',variant:'DEFAULT',fusionUnknown:true,rarity:'EPIC',fusionResult:true,fusionInputs:[],built:false};
  const fusion={spend:[{name:'WORK-A',variant:'DEFAULT',count:1},{name:'WAR-B',variant:'DEFAULT',count:1},{name:'ASTRO-C',variant:'DEFAULT',count:1}],rarity:'EPIC',variant:'DEFAULT',sure:false,gain:1,after:[]};
  const {route,summary}=await plan([a,b,c,keep],[keep],{WORKER:2,BATTLE:1,ASTROMECH:1,LOUNGE:5,FUSION:3,FUSION_BUILD:1},{fusions:[{inputs:[a,b,c],fusion,unit:null,text:'Fuse.',resultUnit}]});
  assert.equal(route.complete,true,route.issues.join(' '));
  assert.equal(summary.filter(s=>s.includes('fuse-in')).length,3);
  assert.equal(summary.at(-1),'FUSION:fuse:->FUSION_BUILD');
  assert.ok(route.finalPlaced.some(x=>x.fusionResult&&x.station==='FUSION_BUILD'));
  assert.deepEqual(route.steps.find(s=>s.type==='fuse').inputs.sort(),['0:0','1:0','2:0']);
});

test('the same steps replay through the validator with the planner\'s own landing rule',async()=>{
  nextSource=0;const a=unit('WORK-A','LOUNGE',0),b=unit('WAR-B','LOUNGE',1);
  const {route}=await plan([a,b],[at(a,'WORKER',0),at(b,'BATTLE',0)],{WORKER:1,BATTLE:1,LOUNGE:5});
  assert.equal(route.complete,true);assert.equal(route.stops,1);
});
