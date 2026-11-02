const {test}=require('node:test'),assert=require('node:assert/strict');
const {normaliseScourgedex,recordScourgeSubmissions,completeScourgedex,scourgeSubmissionCandidates}=require('../scourgedex.js');
const {placedHive}=require('../scourge.js');
const {createAssignmentScorer}=require('../optimise-layout-score.js');
const {planOptimiseRoute,predictStationLanding,predictWorkLanding}=require('../optimise-route.js');
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
