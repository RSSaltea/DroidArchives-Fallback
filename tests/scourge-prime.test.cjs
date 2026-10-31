const {test}=require('node:test'),assert=require('node:assert/strict');
const {placedHive,primeAvailable}=require('../scourge.js');
const {createAssignmentScorer}=require('../optimise-layout-score.js');
const {iconicTraitPrice}=require('../trait-planning.js');
const {normaliseTrait}=require('../traits.js');
const droids=require('../data/droids.json');
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const prime={name:'SCOURGE PRIME',variant:'DEFAULT',station:'PROTOCOL_WORKER_CREDITS',trait:{id:26,tier:'Rainbow'}};
test('Prime event boundary, exclusive trait and per-droid purchase counter',()=>{
 assert(!primeAvailable(Date.parse('2026-10-31T13:59:59Z')));
 assert(primeAvailable(Date.parse('2026-10-31T14:00:00Z')));
 assert(primeAvailable(Date.parse('2026-11-02T14:00:00Z')));
 assert.equal(iconicTraitPrice(null),3000);assert.equal(iconicTraitPrice({rerolls:0}),2950);
 assert.equal(iconicTraitPrice({rerolls:9}),2500);assert.equal(iconicTraitPrice({rerolls:59}),0);
 assert.equal(iconicTraitPrice({rerolls:100}),0);
 assert(normaliseTrait(prime.trait,droids.find(d=>d.name===prime.name)));
 assert.equal(normaliseTrait(prime.trait,droids.find(d=>d.name==='WG-22')),null);
});
test('Prime links only its credit region, doubles existing Scourge bonus and excludes Iconics',()=>{
 const normal={name:'GONK',variant:'DEFAULT',station:'WORKER'},scourge={...normal,variant:'SCOURGE'},other={...normal,station:'BATTLE'},iconic={name:'C-3PO',variant:'DEFAULT',station:'WORKER'};
 const rows=[prime,normal,scourge,other,iconic];let hive=placedHive(rows,droids);
 assert.equal(hive.count,8);near(hive.bonusFor(normal),7*.1045);near(hive.bonusFor(scourge),14*.1045);
 assert.equal(hive.bonusFor(other),0);assert.equal(hive.bonusFor(iconic),0);assert.equal(hive.bonusFor(prime),0);
 const lounge={...prime,station:'LOUNGE'};hive=placedHive([lounge,normal,scourge],droids);
 assert.equal(hive.count,2);assert.equal(hive.bonusFor(normal),0);near(hive.bonusFor(scourge),.1045);
 const crafting={...prime,station:'PROTOCOL_WORKER_CRAFTING'};hive=placedHive([crafting,normal,scourge],droids);
 assert.equal(hive.count,7);assert.equal(hive.bonusFor(normal),0);near(hive.bonusFor(scourge),6*.1045);
});
test('assignment scorer follows Prime when moved between credit regions and accounts for opportunity cost',()=>{
 const units=[{prime:true,iconic:true,hiveTrait:5,base:50,dynamic:.15,type:'PROTOCOL',creditBonus:2,craftBonus:40}];
 const slots=[{station:'PROTOCOL_WORKER_CREDITS',region:-1,creditRegion:0,craftRegion:-1},{station:'PROTOCOL_BATTLE_CREDITS',region:-1,creditRegion:1,craftRegion:-1}];
 const locked=[{base:100,scourge:true,type:'WORKER',station:'WORKER',region:0,creditRegion:-1,craftRegion:-1},{base:50,type:'WORKER',station:'WORKER',region:0,creditRegion:-1,craftRegion:-1},{base:10,type:'BATTLE',station:'BATTLE',region:1,creditRegion:-1,craftRegion:-1}];
 const score=createAssignmentScorer({units,slots,locked,regions:['WORKER','BATTLE'],multiplier:2,lambda:0,craftSeconds:[0,0],craftBaseSpeed:1});
 // 1 Scourge + 1 linked ordinary droid + Prime + 5 trait = 8.
 near(score([0,-1])[0],(100+50)*1.1*2*3+10*1.1*2+(100*2+50)*7*.1045);
 near(score([-1,0])[0],(100+50)*1.1*2+10*1.1*2*3+(100+10)*7*.1045);
 assert(score([0,-1])[0]>score([-1,0])[0]);
});
