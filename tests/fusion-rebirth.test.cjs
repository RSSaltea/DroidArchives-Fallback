const {test}=require('node:test');
const assert=require('node:assert/strict');
const {recipes}=require('../data/fusion.json');
const cycles=Object.fromEntries(require('../data/rebirth-cycles/index.json').cycles.map((file,i)=>[i,require('../data/rebirth-cycles/'+file)]));
const model=()=>import('../fusion-rebirth.js');
const example={recipes:[{name:'FUSION',inputs:['A','A','B']}],cycles:{0:[{to:1,requiredDroids:[{droidName:'A',variant:'DEFAULT'}]},{to:10,requiredDroids:[{droidName:'B',variant:'GOLD'}]},{to:27,requiredDroids:[{droidName:'A',variant:'KYBER'}]}],1:[{to:10,requiredDroids:[{droidName:'B',variant:'GOLD'}]},{to:20,requiredDroids:[{droidName:'B',variant:'DIAMOND'}]}]}};
test('inclusive cutoff, distinct ingredient coverage and active Kyber minimum',async()=>{
 const {fusionRebirthCoverage:f}=await model();
 const all=f(example);assert.equal(all.length,1);assert.equal(all[0].cycles.length,1);
 assert.deepEqual(all[0].cycles[0].names,['A','B']);assert.equal(all[0].cycles[0].minimumVariant,'KYBER_GREEN');
 assert.deepEqual(f({...example,from:10})[0].cycles[0].uses.map(u=>u.rebirth),[10,27]);
 assert.equal(f({...example,from:11}).length,0);
 assert.equal(f({...example,cycle:1}).length,0,'same ingredient at two rebirths is not two droids');
 const single=f({...example,cycle:1,multipleOnly:false})[0].cycles[0];assert.equal(single.minimumVariant,'DIAMOND');assert.equal(single.uses.length,2);
 assert.equal(f({...example,from:28,multipleOnly:false}).length,0);
 assert.equal(f({...example,query:'absent'}).length,0);assert.equal(f({...example,query:'b'}).length,1);
});
test('all real recipes and cycles use canonical requirements without mutation',async()=>{
 const {fusionRebirthCoverage:f}=await model();const before=JSON.stringify({recipes,cycles});
 const rows=f({recipes,cycles});assert(rows.some(r=>r.recipe.name==='AX-L'));assert(rows.some(r=>r.recipe.name==='X-ONK'));
 const {rebirthVariantReady}=await import('../droid-rules.js');
 for(const row of rows)for(const cycle of row.cycles){
  assert(cycle.names.length>=2);assert(cycle.uses.every(use=>row.recipe.inputs.includes(use.name)));
  assert(cycle.uses.every(use=>rebirthVariantReady(cycle.minimumVariant,use.variant)));
  assert(cycle.uses.every(use=>cycles[cycle.cycle].some(r=>r.to===use.rebirth&&r.requiredDroids.some(req=>req.droidName===use.name&&req.variant===use.variant))));
 }
 assert.equal(JSON.stringify({recipes,cycles}),before);
 for(let cycle=0;cycle<6;cycle++)for(const from of [1,10,27,40])for(const result of f({recipes,cycles,cycle,from})){
  assert.equal(result.cycles.length,1);assert.equal(result.cycles[0].cycle,cycle);assert(result.cycles[0].uses.every(use=>use.rebirth>=from));
 }
});
