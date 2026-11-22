const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const acorn=require('../tools/node_modules/acorn');
const droids=require('../data/droids.json'),fusion=require('../data/fusion.json');
const expected=[
 ['AX-L','BATTLE','MYTHIC',12000,360000000,['IG','IG','MPH']],
 ['BI-BIT','ASTROMECH','EPIC',960,12000000,['EGL','R9','R9']],
 ['HV-EE','ASTROMECH','LEGENDARY',2250,72000000,['JO9-4MN','BB9','BB9']],
 ['MO-TRO','ASTROMECH','MYTHIC',11700,340000000,['ECG','A-LT','A-LT']],
 ['KL-NK','PROTOCOL','MYTHIC',7000,320000000,['RIC','PZ','PZ']],
 ['SKM-MR','ASTROMECH','MYTHIC',11100,305000000,['SNOW MOUSE','A-LT','A-LT']],
 ['TOR-Q','BATTLE','LEGENDARY',2160,69000000,['B2-RP','KT','KT']],
 ['STRD-3','WORKER','EPIC',1000,12500000,['MPH','SENATE HOVERCAM','SENATE HOVERCAM']],
 ['LFT-3R','BATTLE','COMMON',18,30000,['GONK','IMPERIAL PROBE','IMPERIAL PROBE']],
 ['ION PROBE','WORKER','COMMON',16,26000,['MOUSE','MOUSE','ID10']],
 ['QUAD SENTRY','ASTROMECH','COMMON',17,28000,['R5','R5','ID10']]
];
const source=fs.readFileSync('app.js','utf8');
const ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'});
async function setup(){
 const rules=await import('../droid-rules.js');
 const state={droids,fusion,owned:[]};
 const context=vm.createContext({...rules,state,novaLevelFor:()=>0});
 const names=['rowIsBuilding','fusionRecipes','fusionDroid','fusionKey','fusionRecipeFor','variantStep','fusionPower','lowestVariant','fusionResultVariant','fusionOutcome','rebirthNames','bestOwnedVariant','hasRequirement'];
 for(const name of names){
  const node=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name||n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name===name));
  assert(node,name);vm.runInContext(source.slice(node.start,node.end),context);
 }
 return {state,run:code=>vm.runInContext(code,context),context};
}
test('eleven new fusion droids have complete canonical definitions and exact recipes',()=>{
 assert.equal(fusion.recipes.length,28);
 for(const [name,type,rarity,income,cost,inputs] of expected){
  const matches=droids.filter(d=>d.name===name);assert.equal(matches.length,1,name);
  const d=matches[0];assert(d.fusion);assert.equal(d.type,type);assert.equal(d.rarity,rarity);
  assert.equal(d.additionalPowerScale,1);assert.equal(d.variants.DEFAULT.income,income);assert.equal(d.variants.DEFAULT.cost,cost);
  assert.deepEqual(fusion.recipes.find(r=>r.name===name),{name,type,rarity,inputs});
  assert.equal(Object.keys(d.variants).length,12);
  for(const [v,stats] of Object.entries(d.variants)){
   assert(stats.income>0&&stats.cost>0&&stats.craftingSeconds>0,name+' '+v);
   assert(fs.existsSync(d.portraits[v]),name+' '+v+' portrait');
  }
 }
 const kl=droids.find(d=>d.name==='KL-NK');
 assert.equal(kl.variants.DEFAULT.protocolCpsBonusPercent,25);
 assert.equal(kl.variants.DEFAULT.protocolCraftingBonusPercent,375);
 assert.equal(kl.variants.STELLAR.protocolCpsBonusPercent,175);
 assert.equal(kl.variants.KYBER_PURPLE.protocolCraftingBonusPercent,3000);
 assert.equal(kl.variants.DEFAULT.craftingSeconds,7040);
});
test('shared fusion resolver recognises each recipe in any input order before generic results',async()=>{
 const t=await setup();
 for(const [name,,,,,inputs] of expected){
  t.context.units=inputs.map(n=>({name:n,variant:'GALACTIC'}));
  for(let i=0;i<3;i++){
   const out=t.run('fusionOutcome(units)');assert.equal(out.kind,'recipe');assert.equal(out.name,name);assert.equal(out.variant,'GALACTIC');
   t.context.units.push(t.context.units.shift());
  }
  t.context.units[0].variant='GOLD';assert.equal(t.run('fusionOutcome(units).variant'),'GOLD');
 }
});
test('finished fusions satisfy all their ingredients at their own quality, including active Kyber',async()=>{
 const t=await setup();
 for(const [name,,,,,inputs] of expected){
  t.state.owned=[{name,variant:'GALACTIC',qty:1,preferred:'LOUNGE'}];
  for(const ingredient of new Set(inputs)){
   t.context.req={droidName:ingredient,variant:'GALACTIC'};assert(t.run('hasRequirement(req)'),name+' covers '+ingredient);
   t.context.req.variant='STELLAR';assert(!t.run('hasRequirement(req)'),name+' must not cover a higher quality');
   t.state.owned[0].variant='KYBER';t.context.req.variant='KYBER';assert(!t.run('hasRequirement(req)'),'inactive Kyber is not ready');
   t.state.owned[0].variant='KYBER_GREEN';assert(t.run('hasRequirement(req)'),'active Kyber covers ingredient');
   t.state.owned[0].variant='SCOURGE';assert(t.run('hasRequirement(req)'),'Scourge covers Kyber ingredient');
   t.state.owned[0].variant='GALACTIC';
  }
  t.context.req={droidName:inputs[0],variant:'GOLD'};
  t.state.owned[0].preferred='FUSION_BUILD';t.state.owned[0].built=false;assert(!t.run('hasRequirement(req)'),'unfinished fusion excluded');
  t.state.owned[0].built=true;assert(t.run('hasRequirement(req)'),'finished fusion included');
  t.context.req={droidName:'CHOPPER',variant:'DEFAULT'};assert(!t.run('hasRequirement(req)'),'unrelated droid excluded');
 }
});
