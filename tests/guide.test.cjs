const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const shop=JSON.parse(fs.readFileSync('data/nova-shop.json','utf8'));
const ready=import('../guide-page.js');
test('early milestone targets include regular rewards and completed-rank payout',async()=>{
 const {guideShoppingPlan}=await ready;
 const first=guideShoppingPlan({shop});assert.equal(first.cost,91);assert.equal(first.rank,21);
 const second=guideShoppingPlan({shop,milestone:1,balance:16,owned:{'rebirth-droid-alert':1,'blueprint-scrap':1,'scrap-value':2}});
 assert.equal(second.cost,532);assert.equal(second.rank,29);
 assert.equal(guideShoppingPlan({shop,milestone:3}).cost,395);
});
test('already-earned regular Nova is not counted again; owned levels cannot create a refund',async()=>{
 const {guideShoppingPlan}=await ready;
 const plan=guideShoppingPlan({shop,milestone:2,rebirth:25,balance:0});
 // At completed R25 the payout is 154, not 154 plus past regular rewards.
 assert.equal(plan.rank,27);
 const owned={'rebirth-droid-alert':1,'blueprint-scrap':2,'scrap-value':6};
 const snapshot={...owned};assert.equal(guideShoppingPlan({shop,owned}).cost,0);assert.deepEqual(owned,snapshot);
 assert.equal(guideShoppingPlan({shop,balance:91}).shortfall,0);
});
