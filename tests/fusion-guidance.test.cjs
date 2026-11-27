const {test}=require('node:test'),assert=require('node:assert/strict');
const droids=require('../data/droids.json'),{recipes}=require('../data/fusion.json');
async function context(){
 const rules=await import('../droid-rules.js'),model=await import('../fusion-target.js');
 const target=droids.find(d=>d.name==='X-ONK');
 const upgradeCost=(d,from,to)=>rules.ALL_VARIANTS.slice(rules.variantRank(from)+1,rules.variantRank(to)+1).reduce((sum,v)=>sum+(rules.CHIP_COSTS[d.rarity]?.[v]||0),0);
 const outcome=inputs=>inputs.map(u=>u.name).sort().join(',')==='GONK,KX,KX'?{name:'X-ONK',variant:inputs.reduce((v,u)=>rules.variantRank(u.variant)<rules.variantRank(v)?u.variant:v,inputs[0].variant)}:{kind:'rarity',rarity:'MYTHIC',variant:'GOLD'};
 return {...model,target,droids,recipes,variant:'BESKAR',upgradeCost,outcome};
}
const copy=(name,variant,slot,extra={})=>({name,variant,station:'LOUNGE',slot,source:slot,unit:0,built:true,...extra});
test('an owned lower fusion can be upgraded with its actual rarity cost',async()=>{
 const c=await context(),unit=copy('X-ONK','GOLD',0),p=c.fusionTargetPlan({...c,units:[unit]});
 assert.equal(p.upgrades.length,1);assert.equal(p.upgrades[0].unit,unit);assert.equal(p.upgrades[0].path.chips,52000);assert.equal(p.ready.length,0);
});
test('a lower mixed-variant recipe retains real copies and shows the post-fusion cost',async()=>{
 const c=await context(),units=[copy('GONK','GOLD',0),copy('KX','DIAMOND',1),copy('KX','BESKAR',2)];
 const p=c.fusionTargetPlan({...c,units});assert.equal(p.ready.length,1);const r=p.ready[0];assert(r.guaranteed);assert.equal(r.resultVariant,'GOLD');assert.equal(r.upgrade.chips,52000);assert(r.inputs.every(u=>units.includes(u)));assert.deepEqual(r.inputs.map(u=>u.slot).sort(),[0,1,2]);
});
test('exact ready recipes are not duplicated or fabricated; locked and unfinished copies stay excluded',async()=>{
 const c=await context(),units=[copy('GONK','BESKAR',0),copy('KX','BESKAR',1),copy('KX','BESKAR',2)];
 assert.equal(c.fusionTargetPlan({...c,units}).ready.length,1);
 assert.equal(c.fusionTargetPlan({...c,units:units.slice(0,2)}).ready.length,0);
 for(const extra of [{lockedSlot:true},{station:'FUSION_BUILD',built:false}])assert.equal(c.fusionTargetPlan({...c,units:[...units.slice(0,2),{...units[2],...extra}]}).ready.length,0);
});
test('activation and rerolls are separate from chips and cannot promise a selected colour',async()=>{
 const c=await context(),f=(from,to)=>c.fusionUpgradePath(c.target,from,to,c.upgradeCost);
 assert.deepEqual(f('KYBER','KYBER_YELLOW'),{from:'KYBER',to:'KYBER_YELLOW',chips:0,activation:true,reroll:false,activationCrystals:10});
 assert.equal(f('KYBER_PURPLE','KYBER_YELLOW').reroll,true);assert.equal(f('STELLAR','KYBER_YELLOW').chips,110000);
 for(const [from,to] of [['GOLD','SCOURGE'],['SCOURGE','KYBER_YELLOW'],['BESKAR','GOLD'],['KYBER_YELLOW','KYBER']])assert.equal(f(from,to),null);
});
