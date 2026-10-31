const {test}=require('node:test'),assert=require('node:assert/strict');
const {missionEstimate,missionDoubleCrateChance}=require('../mission-economy.js');
const droids=require('../data/droids.json');
const r2={name:'R2-D2',variant:'DEFAULT',station:'ASTROMECH',slot:0,trait:{id:19,tier:'Rainbow'}};
const other={name:'R3',variant:'DEFAULT',station:'ASTROMECH',slot:2};
const estimate=(u,placed)=>missionEstimate(u,droids.find(d=>d.name===u.name),{placed,shipId:0,creditsPerSecond:100});
test('R2 exclusive crate trait benefits other one-crate missions, not R2 itself',()=>{
 const alone=estimate(other,[other]),shared=estimate(other,[r2,other]);
 assert.equal(alone.crates,1);assert.equal(shared.crates,1.5);
 assert.equal(shared.credits,alone.credits*1.5);
 assert.equal(shared.blueprints,alone.blueprints*1.5);
 assert.equal(shared.missions,alone.missions);
 assert.equal(estimate(r2,[r2,other]).crates,2);
});
test('credit pads, companions, lounge and unfinished droids do not share the chance; chances do not stack',()=>{
 for(const override of [{station:'COMPANION'},{station:'LOUNGE'},{slot:1},{built:false}])assert.equal(estimate(other,[{...r2,...override},other]).crates,1);
 assert.equal(missionDoubleCrateChance([r2,{...r2,slot:4}]),.5);
});
