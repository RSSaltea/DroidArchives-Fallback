const {test}=require('node:test'),assert=require('node:assert/strict');
const {normaliseScourgedex,recordScourgeSubmissions,completeScourgedex,scourgeSubmissionCandidates}=require('../scourgedex.js');
const {placedHive}=require('../scourge.js');
const {createAssignmentScorer}=require('../optimise-layout-score.js');
const {planOptimiseRoute,predictStationLanding,predictWorkLanding,shortenOptimiseWalk,scourgeSubmissionTrips,optimiseWalkDistance}=require('../optimise-route.js');
const {validateOptimisePlan}=require('../optimise-plan-validation.js');
const droids=[{name:'A',type:'WORKER',rarity:'COMMON',variants:{SCOURGE:{income:100}}},{name:'B',type:'WORKER',rarity:'RARE',variants:{SCOURGE:{income:200}}}];
const unit=(name,station,slot=0,extra={})=>({source:name,unit:0,name,station,slot,variant:'SCOURGE',built:true,...extra});
function rulesFor(caps,goal=false){
 const rules={slots:s=>Array.from({length:caps[s]||0},(_,i)=>i),canUse:()=>true,isBuilding:u=>['BUILD','FUSION_BUILD'].includes(u.station)&&!u.built,typeOf:()=> 'WORKER',isMissionSlot:()=>false,regionOf:s=>s==='COMPANION'?null:s,distance:(a,b)=>a===b?0:10,protocolStations:()=>[],allowTemporaryCompanionSwaps:true,canSubmit:u=>u.variant==='SCOURGE'&&(!u.lockedSlot||goal),forceSubmit:u=>goal&&u.variant==='SCOURGE'};
 rules.stationLanding=(u,p,s)=>predictStationLanding(u,p,s,rules);rules.workLanding=(u,p)=>predictWorkLanding(u,p,rules);return rules;
}
test('submissions count uniquely, duplicates reward without progress; completion waits for the recorded in-game reset',()=>{
 const result=recordScourgeSubmissions({completed:3,submitted:['A'],handIns:9},[unit('A','LOUNGE'),unit('B','LOUNGE'),unit('A','LOUNGE')],droids);
 assert.deepEqual(result,{completions:0,progress:{completed:3,submitted:['A','B'],handIns:12}});
 assert.deepEqual(completeScourgedex(result.progress,droids),{completed:4,submitted:[],handIns:12});
 assert.equal(completeScourgedex({submitted:['A']},droids),null);
 assert.deepEqual(normaliseScourgedex({completed:-5,submitted:['A','A',null],handIns:-1}),{completed:0,submitted:['A'],handIns:0});
});
test('permanent Hive members affect working Scourge and the layout scorer identically',()=>{
 const u=unit('A','WORKER'),hive=placedHive([u],droids,3);assert.equal(hive.count,4);assert.equal(hive.bonusFor(u),3*.1045);
 const score=createAssignmentScorer({permanentMembers:3,units:[{base:100,type:'WORKER',scourge:true}],slots:[{station:'WORKER',region:0,creditRegion:-1,craftRegion:-1}],locked:[],regions:['WORKER'],multiplier:1,lambda:0,craftSeconds:[0],craftBaseSpeed:1});
 assert(Math.abs(score([0])[0]-(110+100*3*.1045))<1e-7);
});
test('protect future rebirths, income and companions before the goal; goal includes locked copies but not unfinished builds',()=>{
 const a=unit('A','LOUNGE'),b=unit('B','WORKER'),c=unit('C','COMPANION'),d=unit('D','LOUNGE',1,{lockedSlot:true}),e=unit('E','BUILD',0,{built:false});
 const args={initial:{placed:[a,b,c,d,e]},projected:{placed:[a,b,c,d,e]},protectedKeys:new Set(['A:0']),isBuilding:u=>u.built===false};
 assert.deepEqual(scourgeSubmissionCandidates({...args,atGoal:false}),[]);
 assert.deepEqual(scourgeSubmissionCandidates({...args,atGoal:true}).map(u=>u.name),['A','B','C','D']);
});
test('working droid is sent to Lounge before submitting and replay rejects a direct work-slot submission',()=>{
 const a=unit('A','WORKER'),rules=rulesFor({WORKER:1,LOUNGE:1}),initial={placed:[a]},target={placed:[],sell:[],submissions:[a]};
 const route=planOptimiseRoute({initial,target,rules});assert(route.complete,route.issues.join(';'));
 assert.deepEqual(route.steps.map(s=>s.type),['move','submit']);
 assert(validateOptimisePlan({initial,projected:target,steps:route.steps,rules}).ok);
 assert(!validateOptimisePlan({initial,projected:target,steps:[{type:'submit',unit:a,from:{station:'WORKER',slot:0}}],rules}).ok);
});
test('a full Lounge is freed by an existing hand-in, then reused for the working copy',()=>{
 const a=unit('A','WORKER'),b=unit('B','LOUNGE'),rules=rulesFor({WORKER:1,LOUNGE:1}),initial={placed:[a,b]},target={placed:[],sell:[],submissions:[a,b]};
 const route=planOptimiseRoute({initial,target,rules});assert(route.complete,route.issues.join(';'));
 assert.equal(route.steps[0].type,'submit');assert.equal(route.steps[0].unit.name,'B');assert.equal(route.submitted.length,2);
 assert(validateOptimisePlan({initial,projected:target,steps:route.steps,rules}).ok);
});
test('at goal a locked Companion can be sent to Lounge and submitted, before goal it cannot',()=>{
 const a=unit('A','COMPANION',0,{lockedSlot:true}),initial={placed:[a]},target={placed:[],sell:[],submissions:[a]};
 const rules=rulesFor({COMPANION:1,LOUNGE:1},true),route=planOptimiseRoute({initial,target,rules});assert(route.complete,route.issues.join(';'));
 const validation=validateOptimisePlan({initial,projected:target,steps:route.steps,rules});assert(validation.ok,validation.issues.join(';'));
 assert(!validateOptimisePlan({initial,projected:target,steps:route.steps,rules:rulesFor({COMPANION:1,LOUNGE:1})}).ok);
});
test('full Lounge retains an ordinary droid by parking it temporarily and restoring it after the hand-in',()=>{
 const a=unit('A','WORKER'),b=unit('B','LOUNGE',0,{variant:'GOLD'}),rules=rulesFor({WORKER:1,LOUNGE:1,FUSION:3,COMPANION:1}),initial={placed:[a,b]},target={placed:[b],sell:[],submissions:[a]};
 const route=planOptimiseRoute({initial,target,rules});assert(route.complete,JSON.stringify({issues:route.issues,steps:route.steps}));
 const replay=validateOptimisePlan({initial,projected:target,steps:route.steps,rules});assert(replay.ok,replay.issues.join(';'));
 assert.equal(route.finalPlaced.length,1);assert.equal(route.finalPlaced[0].station,'LOUNGE');assert.equal(route.finalPlaced[0].name,'B');
});


test('Lounge hand-ins stay in one batch around independent work and Fusion moves',()=>{
 const submits=[8,7,5,0].map((slot,i)=>unit('SUBMIT-'+i,'LOUNGE',slot));
 const worker=unit('WORK','LOUNGE',3,{variant:'GOLD'}),park=unit('PARK','LOUNGE',2,{variant:'GOLD'});
 const rules=rulesFor({WORKER:1,LOUNGE:9,FUSION:3}),initial={placed:[...submits,worker,park]};
 const target={placed:[{...worker,station:'WORKER',slot:0},{...park,station:'FUSION',slot:0}],sell:[],submissions:submits};
 const submit=u=>({type:'submit',unit:u,from:{station:u.station,slot:u.slot},at:'LOUNGE',visit:'lounge'});
 const move=(u,station,kind)=>({type:'move',kind,unit:u,from:{station:u.station,slot:u.slot},to:{station,slot:0},at:'LOUNGE',visit:'lounge'});
 const steps=[submit(submits[0]),submit(submits[1]),move(worker,'WORKER','work'),move(park,'FUSION','park'),submit(submits[2]),submit(submits[3])];
 const isValid=steps=>validateOptimisePlan({initial,projected:target,steps,rules}).ok;
 assert(isValid(steps));
 // Exercise the fast worker pass too, including absent map coordinates.
 for(const slotDistanceSquared of [undefined,(a,b)=>(a.slot-b.slot)**2]){
  const result=shortenOptimiseWalk(steps,{distance:rules.distance,slotDistanceSquared,isValid,withinOnly:true,maxPasses:2});
  assert(isValid(result.steps));assert.equal(scourgeSubmissionTrips(result.steps),1);
  assert.equal(result.steps.length,6);assert.equal(scourgeSubmissionTrips(steps),2,'input is unchanged');
 }
 assert.equal(optimiseWalkDistance(submits.map(submit),{distance:rules.distance,slotDistanceSquared:()=>{throw Error('hand-ins must not visit individual Lounge slots');}}),0);
});

test('batching preserves separate hand-ins when a full Lounge must be freed first',()=>{
 const a=unit('A','WORKER'),b=unit('B','LOUNGE'),rules=rulesFor({WORKER:1,LOUNGE:1});
 const initial={placed:[a,b]},target={placed:[],sell:[],submissions:[a,b]},route=planOptimiseRoute({initial,target,rules});
 const isValid=steps=>validateOptimisePlan({initial,projected:target,steps,rules}).ok;
 const result=shortenOptimiseWalk(route.steps,{distance:rules.distance,slotDistanceSquared:()=>0,isValid});
 assert(isValid(result.steps));assert.deepEqual(result.steps.map(s=>s.type),['submit','move','submit']);
 assert.equal(scourgeSubmissionTrips(result.steps),2);
});

const {planScourgeSubmissions}=require('../scourge-submit-plan.js');
test('submission-only plan preserves other droids and queues unfinished builds',()=>{
 const a=unit('A','WORKER',0,{lockedSlot:true}),b=unit('B','LOUNGE'),normal=unit('C','LOUNGE',1,{variant:'GOLD',trait:{id:0,tier:'Gold'}}),building=unit('D','BUILD',0,{built:false});
 const initial={placed:[a,b,normal,building],overflow:[]},rules=rulesFor({WORKER:2,LOUNGE:2,FUSION:3,BUILD:1,COMPANION:1},true);
 const canSubmit=rules.canSubmit;rules.canSubmit=u=>canSubmit(u)&&!rules.isBuilding(u);
 const result=planScourgeSubmissions(initial,rules);
 assert(result.projected.planComplete,result.projected.planIssues.join(';'));
 assert.deepEqual(result.projected.submissions.map(u=>u.name),['A','B']);
 assert.deepEqual(result.pending.map(u=>u.name),['D']);
 assert.deepEqual(result.projected.sell,[]);assert.deepEqual(result.projected.returns,[]);assert.deepEqual(result.projected.fusions,[]);
 assert(result.steps.every(s=>!['sell','return','buy','fuse'].includes(s.type)));
 assert.deepEqual(result.projected.placed.find(u=>u.name==='C'),normal);
 assert.deepEqual(result.projected.placed.find(u=>u.name==='D'),building);
});
test('submission-only plan clears a full ordinary Lounge without consuming its occupants',()=>{
 const initial={placed:[unit('A','WORKER'),unit('B','LOUNGE',0,{variant:'GOLD'})],overflow:[]};
 const result=planScourgeSubmissions(initial,rulesFor({WORKER:1,LOUNGE:1,FUSION:3,COMPANION:1},true));
 assert(result.projected.planComplete,result.projected.planIssues.join(';'));
 assert.equal(result.projected.placed.length,1);assert.equal(result.projected.placed[0].name,'B');assert.equal(result.projected.placed[0].station,'LOUNGE');
 assert.deepEqual(result.projected.sell,[]);
});
