const {test}=require('node:test'),assert=require('node:assert/strict');
const {missionEstimate,offlineEstimate,chipFinderEstimate,normaliseMissionSettings}=require('../mission-economy.js');
const unit={name:'R9',station:'ASTROMECH',slot:0,variant:'DIAMOND',built:true};
test('mission progress combines rarity and quality then per-copy efficiency',()=>{
 const d={type:'ASTROMECH',rarity:'RARE',additionalPowerScale:0};
 const a=missionEstimate(unit,d,{shipId:0,turnaround:0});
 const b=missionEstimate({...unit,trait:{id:9,tier:'Rainbow'}},d,{shipId:0,turnaround:30});
 assert.equal(a.progress,1.4);assert.equal(b.progress,1.75);
 assert.equal(b.duration,138);assert.equal(b.missions,3600/168);
 assert.equal(missionEstimate({...unit,slot:1},d,{shipId:0}),null);
 assert.equal(missionEstimate({...unit,built:false},d,{shipId:0}),null);
 assert.equal(missionEstimate(unit,d,{shipId:5}),null);
});
test('Hyperdrive triples CB-23 rewards, not speed; R2 double crate does not stack',()=>{
 const d={type:'ASTROMECH',rarity:'ICONIC'};
 const cb={...unit,name:'CB-23',variant:'DEFAULT'};
 const a=missionEstimate(cb,d,{shipId:5});
 const b=missionEstimate({...cb,trait:{id:24,tier:'Rainbow'}},d,{shipId:5});
 assert.equal(b.chips,a.chips*3);assert.equal(b.nova,a.nova*3);assert.equal(b.duration,a.duration);
 assert.equal(a.chips/a.missions,231);assert(Math.abs(a.nova/a.missions-5)<1e-9);
 const r=missionEstimate({...cb,name:'R2-D2',trait:{id:19,tier:'Rainbow'}},d,{shipId:0});
 assert.equal(r.crates,2);
});
test('offline adds working trait points and caps paid time',()=>{
 const placed=[{station:'WORKER',trait:{id:10,tier:'Rainbow'}},{station:'LOUNGE',trait:{id:10,tier:'Rainbow'}}];
 const r=offlineEstimate(placed,100,{awayHours:8,offlineCap:2,offlineRate:.2});
 assert.equal(r.bonus,.1);assert.equal(r.seconds,7200);assert(Math.abs(r.credits-216000)<1e-7);
});
test('Chip Finder requires equipped trait and models repeated builds with delay',()=>{
 const active=[{station:'COMPANION',trait:{id:13,tier:'Rainbow'}}];
 assert.deepEqual(chipFinderEstimate(active,10,3,45,15),{bonus:1,perBuild:30,builds:60,perHour:1800});
 assert.equal(chipFinderEstimate(active,0,3,45).perBuild,1);
 assert.equal(chipFinderEstimate([{...active[0],station:'LOUNGE'}],10,3,45).perBuild,0);
 assert.equal(chipFinderEstimate(active,10,3,0).perHour,0);
 assert.equal(normaliseMissionSettings({offlineRate:Infinity,awayHours:-1,ships:{0:99}}).offlineRate,.1);
});
