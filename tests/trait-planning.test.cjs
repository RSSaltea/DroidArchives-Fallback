const {test}=require('node:test'),assert=require('node:assert/strict');
const {traitRollPool,rerollEstimate}=require('../trait-planning.js');
const d={name:'CB-23',rarity:'ICONIC'},target={id:24,tier:'Rainbow'};
test('roll pools normalise by tier, exclude current combination and respect Iconic eligibility',()=>{
 const pool=traitRollPool(d);
 assert(Math.abs(pool.reduce((s,t)=>s+t.probability,0)-1)<1e-12);
 assert(Math.abs(pool.filter(t=>t.tier==='Rainbow').reduce((s,t)=>s+t.probability,0)-.25)<1e-12);
 assert(!pool.some(t=>t.id===0||t.id===19));assert(pool.some(t=>t.id===24));
 assert(!traitRollPool(d,target).some(t=>t.id===24&&t.tier==='Rainbow'));
});
test('budget probability accounts for exclusions on each failed roll',()=>{
 const current={id:1,tier:'Gold'},pool=traitRollPool(d,current),hit=t=>t.id===24;
 const first=pool.filter(hit).reduce((s,t)=>s+t.probability,0);
 const second=first+pool.filter(t=>!hit(t)).reduce((s,t)=>s+t.probability*traitRollPool(d,t).filter(hit).reduce((s,t)=>s+t.probability,0),0);
 const result=rerollEstimate(d,current,target,2);
 assert(Math.abs(result.chance-second)<1e-12);assert.equal(result.nextChance,first);
 assert(Math.abs(result.expectedNova-result.expectedRolls*200)<1e-7);
 assert.equal(rerollEstimate(d,target,target).expectedNova,0);
 assert.equal(rerollEstimate({name:'GONK',rarity:'COMMON'},null,target),null);
 assert(rerollEstimate(d,null,target,1000).chance>.999);
});
