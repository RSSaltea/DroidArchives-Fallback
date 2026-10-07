const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const shop=JSON.parse(fs.readFileSync('data/nova-shop.json','utf8'));
const moduleReady=import('../nova-levels.js');
test('unlimited tables extend only after the tracked level passes 50, with correct costs and rewards',async()=>{
 const {novaVisibleLevels,novaLevelRow,novaTotalCost}=await moduleReady;
 for(const u of shop.upgrades.filter(u=>u.uncapped&&!u.repeatable)){
  assert.equal(novaVisibleLevels(u,0).length,50,u.id);
  assert.equal(novaVisibleLevels(u,50).length,50,u.id);
  assert.equal(novaVisibleLevels(u,51).length,51,u.id);
  assert.equal(novaVisibleLevels(u,75).length,75,u.id);
  const next=novaLevelRow(u,51);
  assert.equal(next.cost,u.costBase+u.costScale*50,u.id);
  assert.equal(novaTotalCost(u,51)-novaTotalCost(u,50),next.cost,u.id);
  assert.equal(novaTotalCost(u,75),Array.from({length:75},(_,i)=>novaLevelRow(u,i+1).cost).reduce((a,b)=>a+b,0),u.id);
 }
 assert.equal(novaLevelRow(shop.upgrades.find(u=>u.id==='critical-chance'),51).reward,'+255% Critical Chance');
 assert.equal(novaLevelRow(shop.upgrades.find(u=>u.id==='fusion-speed'),51).reward,'+51/sec Droid fusion.');
});
test('finite upgrades and repeatable tokens retain their existing presentation',async()=>{
 const {novaVisibleLevels,novaTotalCost,novaLevelRow}=await moduleReady;
 for(const u of shop.upgrades.filter(u=>!u.uncapped)){
  assert.equal(novaVisibleLevels(u,75).length,u.levels.length);
  assert.equal(novaLevelRow(u,u.levels.length+1),null);
 }
 const token=shop.upgrades.find(u=>u.repeatable);
 assert.equal(novaVisibleLevels(token,75).length,1);
 assert.equal(novaTotalCost(token,75),token.levels[0].cost*75);
});
