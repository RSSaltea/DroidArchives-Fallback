const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const rules=require('../droid-rules.js'),{tradeValue}=require('../trade-values.js'),{imageFor,droidPicture}=require('../droid-display.js');
const droids=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../data/droids.json')));
test('catalogue portraits resolve consistently for every recorded droid and form',()=>{
 for(const d of droids)for(const [variant,path] of Object.entries(d.portraits||{})){
  assert.equal(imageFor(d,variant),path,`${d.name} ${variant}`);
  assert(droidPicture(d,variant).includes(path));
 }
 assert.equal(rules.canonicalDroidName('BU-4D'),'B-U4D');
 assert.equal(rules.canonicalDroidName('C3-PO'),'C-3PO');
});
test('upgrade and trade consumers agree on chip costs without conflating activation charges',()=>{
 for(const d of droids.filter(d=>!rules.isIconic(d)))for(const variant of rules.OWNED_VARIANTS){
  const value=tradeValue(d,variant);if(!value)continue;
  const tier=variant==='SCOURGE'?'KYBER':rules.baseVariant(variant);
  assert.equal(value.chips,rules.CHIP_COSTS[d.rarity]?.[tier]||0,`${d.name} ${variant}`);
 }
 const d=droids.find(d=>d.rarity==='LEGENDARY'&&d.variants.KYBER_GREEN);
 assert.equal(rules.kyberActivationCost(d),7);
 assert.equal(tradeValue(d,'KYBER_GREEN').kyber,4);
});
test('shared rule tables cannot be accidentally changed by a page',()=>{
 assert(Object.isFrozen(rules.CHIP_COSTS.LEGENDARY));assert(Object.isFrozen(rules.OWNED_VARIANTS));
 assert.throws(()=>rules.OWNED_VARIANTS.sort(),TypeError);
 assert.equal(rules.BLUEPRINT_RARITY_POINTS.MYTHIC,5);
 assert.equal(rules.RARITY_LADDER.indexOf('MYTHIC'),4);
 for(const v of rules.ACTIVE_KYBER)assert(rules.rebirthVariantReady(v,'KYBER'));
 assert(!rules.rebirthVariantReady('KYBER','KYBER'));
 assert(rules.rebirthVariantReady('SCOURGE','KYBER'));
});
test('portrait fallback and labels escape catalogue text',()=>{
 const html=droidPicture({name:'<x>',portraits:{DEFAULT:'x" onerror="bad'}});
 assert(html.includes('&lt;x&gt;'));assert(html.includes('&quot;'));assert(!html.includes(' onerror="bad'));
});
