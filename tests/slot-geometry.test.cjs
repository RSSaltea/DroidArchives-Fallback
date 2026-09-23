const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=async()=>({...await import('../optimise-route.js'),...await import('../slot-geometry.js'),...await import('../optimise-plan-validation.js')});
const droid=(station='LOUNGE',slot=0,type='WORKER')=>({source:0,unit:0,name:'Test',variant:'DEFAULT',station,slot,type});
function rules(points){
  return {
    slots:station=>(points[station]||[]).map((_,i)=>i),
    typeOf:unit=>unit.type,canUse:()=>true,isBuilding:()=>false,
    isMissionSlot:(station,slot)=>station==='ASTROMECH'&&slot%2===0,
    regionOf:station=>station,distance:()=>0,nearestOrder:()=>['ASTROMECH','BATTLE'],
    protocolStations:()=>Object.keys(points).filter(s=>s.startsWith('PROTOCOL_')),
    slotDistanceSquared:(from,to)=>{
      const a=points[from.station]?.[from.slot],b=points[to.station]?.[to.slot];
      return a&&b?a.reduce((sum,x,i)=>sum+(x-b[i])**2,0):null;
    }
  };
}
test('all 60 mapped positions are finite; mobile and invalid slots have no position',async()=>{
  const {slotPosition,slotDistanceSquared}=await load();
  const counts={WORKER:11,BATTLE:11,ASTROMECH:9,LOUNGE:13,BUILD:3,FUSION:3,FUSION_BUILD:3,UPGRADE_CHIP:1,
    PROTOCOL_WORKER_CREDITS:1,PROTOCOL_WORKER_CRAFTING:1,PROTOCOL_ASTROMECH_CREDITS:1,PROTOCOL_ASTROMECH_CRAFTING:1,PROTOCOL_BATTLE_CREDITS:1,PROTOCOL_BATTLE_CRAFTING:1};
  let count=0;
  for(const [station,n] of Object.entries(counts))for(let slot=0;slot<n;slot++){
    const point=slotPosition({station,slot});assert.equal(point.length,3);assert(point.every(Number.isFinite));count++;
    assert.equal(slotDistanceSquared({station,slot},{station,slot}),0);
  }
  assert.equal(count,60);
  for(const value of [droid('COMPANION'),droid('WORKER',-1),droid('WORKER',11),{...droid(),positionUncertain:true},{...droid(),moving:true}])assert.equal(slotPosition(value),null);
  const p=slotPosition(droid('WORKER'));p[0]=Infinity;assert(Number.isFinite(slotPosition(droid('WORKER'))[0]));
  assert.equal(slotDistanceSquared(droid('COMPANION'),droid('WORKER')),null);
  assert(slotPosition(droid('BATTLE',5))[2]-slotPosition(droid('BATTLE',0))[2]>700);
});
test('two origins choose different slots within the same room, excluding occupied slots',async()=>{
  const {predictWorkLanding}=await load(),r=rules({LOUNGE:[[0,0,0],[100,0,0]],WORKER:[[10,0,0],[90,0,0],[80,0,0]]});
  assert.equal(predictWorkLanding(droid(),[],r).slot,0);
  assert.equal(predictWorkLanding(droid('LOUNGE',1),[],r).slot,1);
  assert.equal(predictWorkLanding(droid('LOUNGE',1),[droid('WORKER',1)],r).slot,2);
});
test('height changes the chosen slot, without a fixed floor penalty',async()=>{
  const {predictWorkLanding}=await load(),r=rules({LOUNGE:[[0,0,0]],BATTLE:[[1,0,20],[10,0,0]]});
  const landing=predictWorkLanding(droid('LOUNGE',0,'BATTLE'),[],r);
  assert.equal(landing.slot,1);assert.equal(landing.assumed,false);
});

test('a temporary Work landing unlocks a Protocol exchange without Lounge detours',async()=>{
  const {planOptimiseRoute,predictWorkLanding,validateOptimisePlan}=await load();
  const a=droid('PROTOCOL_WORKER_CREDITS',0,'PROTOCOL'),b={...droid('PROTOCOL_ASTROMECH_CREDITS',0,'PROTOCOL'),source:1,name:'Other'};
  const r=rules({PROTOCOL_WORKER_CREDITS:[[0,0,0]],PROTOCOL_WORKER_CRAFTING:[[10,0,0]],PROTOCOL_ASTROMECH_CREDITS:[[100,0,0]]});
  r.regionOf=station=>station.includes('WORKER')?'WORKER':'ASTROMECH';
  const initial={placed:[a,b]},target={placed:[{...a,station:b.station},{...b,station:a.station}]};
  const route=planOptimiseRoute({initial,target,rules:r});
  assert(route.complete,route.issues.join('\n'));assert.equal(route.commands,3);assert.equal(route.assumed,0);
  assert(route.steps.some(s=>s.buffer&&s.kind==='work'&&s.to.station==='PROTOCOL_WORKER_CRAFTING'));
  assert.equal(validateOptimisePlan({initial,projected:{placed:route.finalPlaced},steps:route.steps,rules:{...r,workLanding:(u,p)=>predictWorkLanding(u,p,r)}}).ok,true);
});
test('role priority and Astromech mission priority outrank distance',async()=>{
  const {predictWorkLanding}=await load(),r=rules({LOUNGE:[[0,0,0]],ASTROMECH:[[100,0,0],[1,0,0]],WORKER:[[0,0,0]]});
  const landing=predictWorkLanding(droid('LOUNGE',0,'ASTROMECH'),[],r);
  assert.equal(landing.station,'ASTROMECH');assert.equal(landing.slot,0);
});
test('overflow compares every free slot across rooms and has no mission preference for Workers',async()=>{
  const {predictWorkLanding}=await load(),r=rules({LOUNGE:[[0,0,0]],ASTROMECH:[[100,0,0],[2,0,0]],BATTLE:[[10,0,0],[1,0,0]]});
  assert.equal(predictWorkLanding(droid(),[],r).station,'BATTLE');
  const landing=predictWorkLanding(droid(),[droid('BATTLE',1)],r);
  assert.equal(landing.station,'ASTROMECH');assert.equal(landing.slot,1);
});
test('Protocol compares all Protocol points instead of assuming the local room wins',async()=>{
  const {predictWorkLanding}=await load(),r=rules({LOUNGE:[[0,0,0]],PROTOCOL_WORKER_CREDITS:[[100,0,0]],PROTOCOL_BATTLE_CREDITS:[[1,0,0]],WORKER:[[0,0,0]]});
  r.regionOf=station=>station==='LOUNGE'?'PROTOCOL_WORKER_CREDITS':station;
  assert.equal(predictWorkLanding(droid('LOUNGE',0,'PROTOCOL'),[],r).station,'PROTOCOL_BATTLE_CREDITS');
});
test('unknown origins, incomplete geometry, and ties expose only eligible candidates',async()=>{
  const {predictWorkLanding}=await load(),r=rules({ASTROMECH:[[1,0,0],[0,0,0],[-1,0,0]],LOUNGE:[[0,0,0]]});
  for(const unit of [droid('COMPANION',0,'ASTROMECH'),droid('LOUNGE',0,'ASTROMECH')]){
    const landing=predictWorkLanding(unit,[],r);assert.equal(landing.assumed,true);
    assert.deepEqual(landing.candidates.map(x=>x.slot),[0,2]);
  }
  const partial=rules({WORKER:[[1,0,0],null],LOUNGE:[[0,0,0]]});
  assert.equal(predictWorkLanding(droid(),[],partial).assumed,true);
});
test('one eligible destination is unambiguous even from a Companion',async()=>{
  const {predictWorkLanding}=await load();
  assert.equal(predictWorkLanding(droid('COMPANION'),[],rules({WORKER:[[1,0,0]]})).assumed,false);
});
test('the current slot remains occupied while selecting Work',async()=>{
  const {predictWorkLanding}=await load(),u=droid('WORKER'),r=rules({WORKER:[[0,0,0]],BATTLE:[[10,0,0]]});
  assert.equal(predictWorkLanding(u,[u],r).station,'BATTLE');
});
test('Lounge uses its free attachment points and carries uncertain availability',async()=>{
  const {predictStationLanding}=await load(),r=rules({WORKER:[[0,0,0]],LOUNGE:[[100,0,0],[1,0,0]]});
  assert.equal(predictStationLanding(droid('WORKER'),[],'LOUNGE',r).slot,1);
  const landing=predictStationLanding(droid('WORKER'),[{...droid('LOUNGE',1),positionUncertain:true}],'LOUNGE',r);
  assert.equal(landing.assumed,true);
});
test('validator rejects a distant slot even when the step falsely claims it is assumed',async()=>{
  const {predictWorkLanding,validateOptimisePlan}=await load(),u=droid(),r=rules({LOUNGE:[[0,0,0]],WORKER:[[1,0,0],[10,0,0]]});
  r.workLanding=(u,p)=>predictWorkLanding(u,p,r);
  const to={station:'WORKER',slot:1};
  const result=validateOptimisePlan({initial:{placed:[u]},projected:{placed:[{...u,...to}]},steps:[{type:'move',kind:'work',unit:u,from:u,to,assumed:true}],rules:r});
  assert.equal(result.ok,false);assert.match(result.issues.join(' '),/cannot reach/);
});
test('route simulation books the nearest slot and validates that exact slot',async()=>{
  const {planOptimiseRoute,predictWorkLanding,predictStationLanding,validateOptimisePlan}=await load();
  const a=droid('LOUNGE'),b={...droid('LOUNGE',1),source:1,name:'Other'};
  const r=rules({LOUNGE:[[0,0,0],[100,0,0]],WORKER:[[90,0,0],[10,0,0]]});
  r.workLanding=(u,p)=>predictWorkLanding(u,p,r);r.stationLanding=(u,p,s)=>predictStationLanding(u,p,s,r);
  const initial={placed:[a,b]},target={placed:[{...a,station:'WORKER',slot:0},{...b,station:'WORKER',slot:1}]};
  const route=planOptimiseRoute({initial,target,rules:r});assert.equal(route.complete,true);
  assert.equal(route.finalPlaced.find(x=>x.source===0).slot,1);assert.equal(route.finalPlaced.find(x=>x.source===1).slot,0);
  assert.equal(validateOptimisePlan({initial,projected:{placed:route.finalPlaced},steps:route.steps,rules:r}).ok,true);
});

test('a Protocol droid can reposition through the Lounge when a nearer open slot blocks its goal',async()=>{
  const {planOptimiseRoute,predictWorkLanding,predictStationLanding,validateOptimisePlan}=await load();
  const u=droid('PROTOCOL_A',0,'PROTOCOL');
  const r=rules({PROTOCOL_A:[[0,0,0]],PROTOCOL_B:[[100,0,0]],PROTOCOL_C:[[2,0,0]],LOUNGE:[[100,0,0]]});
  r.workLanding=(u,p)=>predictWorkLanding(u,p,r);r.stationLanding=(u,p,s)=>predictStationLanding(u,p,s,r);
  const initial={placed:[u]},target={placed:[{...u,station:'PROTOCOL_B'}]};
  assert.equal(predictWorkLanding(u,[u],r).station,'PROTOCOL_C');
  const route=planOptimiseRoute({initial,target,rules:r});
  assert.equal(route.complete,true);assert.equal(route.assumed,0);
  assert.deepEqual(route.steps.map(x=>x.to.station),['LOUNGE','PROTOCOL_B']);
  assert.equal(validateOptimisePlan({initial,projected:{placed:route.finalPlaced},steps:route.steps,rules:r}).ok,true);
});

test('validator carries an uncertain Lounge landing into the following Work command',async()=>{
  const {predictWorkLanding,predictStationLanding,validateOptimisePlan}=await load();
  const u=droid('COMPANION'),r=rules({COMPANION:[null],LOUNGE:[[0,0,0],[100,0,0]],WORKER:[[1,0,0],[99,0,0]]});
  r.workLanding=(u,p)=>predictWorkLanding(u,p,r);r.stationLanding=(u,p,s)=>predictStationLanding(u,p,s,r);
  const lounge={station:'LOUNGE',slot:0},work={station:'WORKER',slot:0};
  const steps=[{type:'move',kind:'lounge',unit:u,from:u,to:lounge,assumed:true},
    {type:'move',kind:'work',unit:u,from:lounge,to:work,assumed:false}];
  const input={initial:{placed:[u]},projected:{placed:[{...u,...work}]},steps,rules:r};
  const rejected=validateOptimisePlan(input);assert.equal(rejected.ok,false);assert.match(rejected.issues.join(' '),/uncertain work/);
  steps[1].assumed=true;assert.equal(validateOptimisePlan(input).ok,true);
});
