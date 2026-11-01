const {test}=require('node:test'),assert=require('node:assert/strict');
const droids=require('../data/droids.json');
const {craftingEstimate}=require('../crafting.js');
const {createAssignmentScorer}=require('../optimise-layout-score.js');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
// October 31 mutation 3558: power 7. Consumers 34859, 36691 and
// 36692 multiply rarity power by mutation power, then 0.04 / 0.6.
const expected=[['SA-5',56,8.4,5760000,403.2,763.98],['LOM',84,12.6,6825000000,7560,2999.85],['PZ',112,16.8,697450000000,121500,22533],['TDA',140,21,14560000000000,448000,69160]];
test('Scourge Protocol support uses Scourge power; blueprint stats retain their own multipliers',()=>{
 for(const [name,credits,craft,cost,income,seconds] of expected){
  const d=droids.find(d=>d.name===name),s=d.variants.SCOURGE;
  near(s.protocolCpsBonusPercent,credits);near(s.protocolCraftingBonusPercent,craft*100);
  near(s.cost,cost);near(s.income,income);near(s.craftingSeconds,seconds);
  assert(s.protocolCpsBonusPercent<d.variants.KYBER.protocolCpsBonusPercent);
 }
});
test('passive build times use the corrected Scourge support in the matching region only',()=>{
 const droid={type:'WORKER',rarity:'COMMON',variants:{DEFAULT:{craftingSeconds:1000}}};
 for(const [name,,craft] of expected){
  const placed=[{name,variant:'SCOURGE',station:'PROTOCOL_WORKER_CRAFTING'}];
  const local=craftingEstimate({droid,slot:0,placed,droids});near(local.protocol,craft);near(local.seconds,900/(1+craft));
  const other=craftingEstimate({droid,slot:2,placed,droids});near(other.protocol,0);near(other.seconds,1000);
 }
});
test('Optimise scores the corrected credit and crafting boosts from the catalogue',()=>{
 for(const [name,credits,craft] of expected){
  const s=droids.find(d=>d.name===name).variants.SCOURGE;
  const score=createAssignmentScorer({units:[{base:s.income,type:'PROTOCOL',scourge:true,creditBonus:s.protocolCpsBonusPercent/100,craftBonus:s.protocolCraftingBonusPercent/100}],slots:[{station:'PROTOCOL_WORKER_CREDITS',region:-1,creditRegion:0,craftRegion:-1},{station:'PROTOCOL_WORKER_CRAFTING',region:-1,creditRegion:-1,craftRegion:0}],locked:[{base:100,type:'WORKER',region:0,creditRegion:-1,craftRegion:-1,station:'WORKER'}],regions:['WORKER'],multiplier:1,lambda:0,craftSeconds:[1000],craftBaseSpeed:1});
  near(score([0,-1])[0],110*(1+credits/100));near(score([-1,0])[1],craft);near(score([-1,0])[2],1000-1000/(1+craft));
 }
});
