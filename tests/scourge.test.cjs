const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const droids=JSON.parse(fs.readFileSync('data/droids.json'));
test('all 90 non-Iconic Scourge variants have stats and transparent portraits',()=>{
 const costs={COMMON:32,RARE:32,EPIC:975,LEGENDARY:18850,MYTHIC:36400},incomes={COMMON:28.8,RARE:28.8,EPIC:72,LEGENDARY:135,MYTHIC:112};let count=0;
 for(const d of droids){if(d.rarity==='ICONIC'){assert(!d.variants.SCOURGE);continue;}count++;
 const b=d.variants.DEFAULT,s=d.variants.SCOURGE;
 assert(Math.abs(s.cost-b.cost*costs[d.rarity])<.01);assert(Math.abs(s.income-b.income*incomes[d.rarity])<.001);assert(Math.abs(s.craftingSeconds-b.craftingSeconds*14)<.001);
 const png=fs.readFileSync(d.portraits.SCOURGE);assert.equal(png.readUInt32BE(16),512);assert.equal(png[25],6);
 }assert.equal(count,90);
});
test('Hive Mind counts only registered stations and scorer adds it after all multipliers',()=>{
 const {scourgeCount,hiveMindBonus}=require('../scourge.js'),{createAssignmentScorer}=require('../optimise-layout-score.js');
 assert.equal(scourgeCount(['WORKER','ASTROMECH','BATTLE','PROTOCOL_WORKER_CRAFTING','LOUNGE','COMPANION','BUILD','FUSION_BUILD','UPGRADE_CHIP'].map(station=>({station,variant:'SCOURGE'}))),4);
 assert.equal(hiveMindBonus(1),0);assert.equal(hiveMindBonus(3),.209);
 const score=createAssignmentScorer({units:[{base:100,type:'WORKER',scourge:true},{base:200,type:'WORKER',scourge:true}],slots:[{region:0,creditRegion:-1,craftRegion:-1},{region:0,creditRegion:-1,craftRegion:-1}],locked:[],regions:['WORKER'],multiplier:10,lambda:0,craftSeconds:[0],craftBaseSpeed:1});
 assert(Math.abs(score([0,1])[0]-(3300+300*.1045))<1e-8);
});
test('exclusive trait pity uses initial reveal and saved reroll count',()=>{
 const {rerollEstimate}=require('../trait-planning.js'),d={name:'CB-23',rarity:'ICONIC'};
 const r=rerollEstimate(d,{id:1,tier:'Gold',rerolls:58},{id:24,tier:'Rainbow'},1);
 assert.equal(r.nextChance,1);assert.equal(r.expectedRolls,1);assert.equal(r.expectedNova,200);assert.equal(r.chance,1);
 const blocked=rerollEstimate(d,{id:1,tier:'Gold',rerolls:58},{id:2,tier:'Gold'},10);assert.equal(blocked.chance,0);assert.equal(blocked.expectedRolls,Infinity);
});
