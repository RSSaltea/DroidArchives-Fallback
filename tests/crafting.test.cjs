const {test}=require('node:test');
const assert=require('node:assert/strict');
const droids=require('../data/droids.json');
const d=name=>droids.find(x=>x.name===name);
const load=()=>import('../crafting.js');
test('matching depot, Nova, companions, Protocol and event combine in the traced order',async()=>{
 const {craftingEstimate}=await load();
 const placed=[{name:'MOUSE',variant:'DEFAULT',station:'COMPANION',slot:0},{name:'MOUSE',variant:'GOLD',station:'COMPANION',slot:1},{name:'LOM',variant:'DEFAULT',station:'PROTOCOL_WORKER_CRAFTING',slot:0}];
 const args={droid:d('MOUSE'),droids,placed,novaUpgrades:{'crafting-speed':10},eventMultiplier:2};
 const result=craftingEstimate(args);
 const protocol=d('LOM').variants.DEFAULT.protocolCraftingBonusPercent/100;
 assert.equal(result.base,33.51);assert(Math.abs(result.worker-.6)<1e-9);
 assert(Math.abs(result.seconds-33.51*.9/((1+1+.6+protocol)*2))<1e-9);
 const other=craftingEstimate({...args,slot:1});assert.equal(other.match,1);assert.equal(other.protocol,0);
});
test('Fusion uses Fusion Speed and D-O, independently of regular crafting bonuses',async()=>{
 const {craftingEstimate}=await load();
 const args={droid:d('MOUSE'),station:'FUSION_BUILD',droids,placed:[{name:'D-O',station:'COMPANION'},{name:'MOUSE',variant:'KYBER_PURPLE',station:'COMPANION'}],novaUpgrades:{'fusion-speed':2,'crafting-speed':100},eventMultiplier:2};
 assert.equal(craftingEstimate(args).seconds,33.51*.5/3);
 assert.equal(craftingEstimate({...args,placed:[]}).seconds,33.51/3);
 assert.equal(craftingEstimate({...args,droid:d('D-O')}),null);
});
test('fusion-exclusive droids receive their additional companion power; Kyber colours have equal perk strength',async()=>{
 const {companionAttributeValue}=await load();
 assert.equal(companionAttributeValue(d('WHL-EX'),'DEFAULT'),.6);
 assert.equal(companionAttributeValue(d('WHL-EX'),'KYBER_GREEN'),companionAttributeValue(d('WHL-EX'),'KYBER_PURPLE'));
 assert.equal(companionAttributeValue(d('D-O')),0);
});
test('published data contains consistent unboosted construction times and audited prices/income',()=>{
 const multipliers={DEFAULT:1,GOLD:4,DIAMOND:6,RAINBOW:8,BESKAR:10,GALACTIC:14,STELLAR:18,KYBER:36,KYBER_GREEN:36,KYBER_BLUE:36,KYBER_PURPLE:36};
 assert.equal(droids.length,92);
 for(const droid of droids.filter(x=>x.rarity!=='ICONIC')){
  const income=droid.variants.DEFAULT.income,base=30+Math.min(income,2000)*1.755+Math.max(income-2000,0)*.7;
  for(const [variant,stats] of Object.entries(droid.variants)){
   assert(Math.abs(stats.craftingSeconds-base*multipliers[variant])<1e-5,`${droid.name} ${variant}`);
   assert(stats.cost>0&&stats.income>0);assert.equal(droid.variants.DEFAULT.sellUpgradeChips,0);
  }
 }
 assert.equal(d('MOUSE').variants.RAINBOW.cost,11400);
 assert.equal(d('B1 HEAVY').variants.DEFAULT.income,600);
 assert.equal(d('LOW-MO').variants.DEFAULT.craftingSeconds,10330);
});
