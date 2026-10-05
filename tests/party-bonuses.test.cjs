const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8'),shop=require('../data/nova-shop.json');
test('party size includes the player and chip bonuses stop at 100%',async()=>{
 const {normaliseParty,partyBonuses}=await import('../economy.js');
 assert.deepEqual(partyBonuses(),{chips:1,scrap:1,pickaxe:1});
 for(const size of [1,2,3,4,5,6,10,16])assert.equal(partyBonuses({size}).chips,1+Math.min(size-1,5)*.2);
 assert.deepEqual(normaliseParty({size:1,depotHitters:5,scrapAtPartyBase:true}),{size:1,depotHitters:0,scrapAtPartyBase:false,target:'depot'});
 assert.deepEqual(normaliseParty({size:'3',depotHitters:20}),{size:3,depotHitters:2,scrapAtPartyBase:false,target:'depot'});
 for(const value of [null,{}, {size:-4},{size:Infinity},{size:'bad'}])assert.equal(normaliseParty(value).size,1);
});
test('only active depot helpers grant pickaxe bonus; Fusion and passive income are unchanged',async()=>{
 const {partyBonuses,workingIncome}=await import('../economy.js');
 assert.equal(partyBonuses({size:6}).pickaxe,1);
 assert.equal(partyBonuses({size:6,depotHitters:3}).pickaxe,1.6);
 assert.equal(partyBonuses({size:16,depotHitters:15}).pickaxe,2);
 assert.equal(partyBonuses({size:6,depotHitters:5,target:'fusion'}).pickaxe,1);
 assert.equal(workingIncome({base:100,party:{size:6}}).total,100);
});
test('party scrap credits affect both hit and break, including station minimums',async()=>{
 const {partyBonuses,scrapRewards}=await import('../economy.js');
 assert.equal(partyBonuses({size:2,scrapAtPartyBase:true}).scrap,1.5);
 assert.equal(partyBonuses({size:6,scrapAtPartyBase:false}).scrap,1);
 assert.deepEqual(scrapRewards({income:0,stationLevel:10,partyMultiplier:1.5}),{hit:61.5,break:1230});
 assert.deepEqual(scrapRewards({income:1000,seconds:1,partyMultiplier:1.5}),{hit:1500,break:30000});
});
test('sale chips stack the Nova sell perk and party multiplier, with BB-8 still a separate doubling',async()=>{
 const {partyBonuses}=await import('../economy.js');
 const context=vm.createContext({partyBonuses,state:{party:{size:6}},baseVariant:v=>v,novaLevelFor:()=>4});
 vm.runInContext(source.slice(source.indexOf('const CHIP_SELL_VALUES='),source.indexOf('const bb8CompanionActive=')),context);
 const chips=vm.runInContext("chipSellValue({rarity:'MYTHIC'},'STELLAR')",context);
 assert.equal(chips,207*3*2);assert.equal(chips*2,2484);
});
test('party boosts scale seconds per crit swing without changing upgrade rankings',()=>{
 const context=vm.createContext({state:{rebirth:0,novaShop:shop},Math,critSetting:()=>0,novaUpgrade:id=>shop.upgrades.find(u=>u.id===id),localStorage:{getItem:()=>null}});
 vm.runInContext(source.slice(source.indexOf('const PICKAXE_SECONDS_PER_LEVEL='),source.indexOf('// Pickaxe Mastery only decides')),context);
 const start=source.indexOf('const novaLevelCost='),end=source.indexOf('\n}',source.indexOf('function critUpgradeOptions',start))+2;
 vm.runInContext(source.slice(start,end),context);
 const run=x=>vm.runInContext(x,context);
 run('var current={chanceLevel:10,amountLevel:8,multiLevel:1,chopper:true,pickaxe:29};');
 assert(Math.abs(run('critProfile({...current,partyMultiplier:1.6}).perHit')-133.524*1.6)<1e-9);
 assert.equal(run('JSON.stringify(critUpgradeOptions(current))'),run('JSON.stringify(critUpgradeOptions({...current,partyMultiplier:2}))'));
});
test('new Workshop perks have the right prices and real PNG icons',()=>{
 for(const [id,price] of [['kyber-droid-sell',1000],['huyang-hologram',1500]]){
  const perk=shop.upgrades.find(x=>x.id===id);assert.equal(perk.category,'workshop');assert.equal(perk.levels.length,1);assert.equal(perk.levels[0].cost,price);
  const icon=fs.readFileSync(perk.icon);assert.equal(icon.subarray(1,4).toString(),'PNG');assert(icon.readUInt32BE(16)>=128);
 }
});
