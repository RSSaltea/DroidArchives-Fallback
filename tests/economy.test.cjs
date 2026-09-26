const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../economy.js');
test('dynamic income uses raw static income, a base floor, affinity and regional bonus',async()=>{
  const {workingIncome}=await load();
  const iconic=workingIncome({base:0,dynamicPercent:.25,staticIncome:1000,matching:true,multiplier:2,protocol:3});
  assert.equal(iconic.raw,250);assert.equal(iconic.total,1650);
  assert.equal(workingIncome({base:50,dynamicPercent:.15,staticIncome:100}).raw,50);
  assert.equal(workingIncome({base:100,matching:false,multiplier:2,protocol:3}).total,600);
});
test('scrap quality uses exact factors and pays a station minimum even without Nova',async()=>{
  const {scrapRewards}=await load();
  assert.deepEqual(scrapRewards({income:3000,seconds:1,quality:'diamond'}),{hit:10000,break:240000});
  assert.deepEqual(scrapRewards({income:3000,seconds:1,quality:'rainbow'}),{hit:20000,break:600000});
  assert.deepEqual(scrapRewards({income:0,seconds:0,stationLevel:10}),{hit:41,break:820});
  assert.deepEqual(scrapRewards({income:1000,seconds:1,stationLevel:10,quality:'gold'}),{hit:2000,break:40000});
});
test('repair progress doubles own levels but adds companion levels once',async()=>{
  const {scrapProgress}=await load();assert.equal(scrapProgress(0),1);assert.equal(scrapProgress(10,7),28);
});
test('active scrap includes replacement time and never pays an extra normal hit on completion',async()=>{
  const {scrapActiveEstimate}=await load(),rewards={hit:100,break:2000};
  assert.deepEqual(scrapActiveEstimate({rewards,swings:1,cycleSeconds:2}),{credits:2000,perSecond:1000});
  assert.deepEqual(scrapActiveEstimate({rewards,swings:4,cycleSeconds:5}),{credits:2300,perSecond:460});
  assert.equal(scrapActiveEstimate({rewards,swings:null,cycleSeconds:5}),null);
  assert.equal(scrapActiveEstimate({rewards,swings:1,cycleSeconds:0}),null);
});
