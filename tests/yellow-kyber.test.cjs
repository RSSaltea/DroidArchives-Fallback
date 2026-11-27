const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const acorn=require('../tools/node_modules/acorn'),droids=require('../data/droids.json'),fusion=require('../data/fusion.json');
test('Yellow is ordered after Purple, before Scourge, with complete portraits and power',async()=>{
 const rules=await import('../droid-rules.js'),{companionAttributeValue}=await import('../crafting.js');
 assert.deepEqual(rules.OWNED_VARIANTS.slice(-3),['KYBER_PURPLE','KYBER_YELLOW','SCOURGE']);
 for(const d of droids.filter(d=>d.variants.KYBER)){
  assert.deepEqual(Object.keys(d.variants).slice(-3),['KYBER_PURPLE','KYBER_YELLOW','SCOURGE']);
  assert(Math.abs(d.variants.KYBER_YELLOW.income-d.variants.KYBER.income*4.2)<.01,d.name);
  const b=fs.readFileSync(d.portraits.KYBER_YELLOW);assert.equal(b.readUInt32BE(16),512);assert.equal(b.readUInt32BE(20),512);assert.equal(b[25],6);
  assert.equal(rules.upgradeChipRate(d,'KYBER_YELLOW'),rules.upgradeChipRate(d,'KYBER')*9/8);
  const gain={WORKER:.2,ASTROMECH:1,BATTLE:40,PROTOCOL:200}[d.type];
  assert(Math.abs(companionAttributeValue(d,'KYBER_YELLOW')-companionAttributeValue(d,'KYBER_PURPLE')-gain)<1e-8);
 }
 assert(rules.rebirthVariantReady('KYBER_YELLOW','KYBER'));
});
test('fusion coverage names the held fusion and prices upgrades using its rarity',async()=>{
 const rules=await import('../droid-rules.js'),source=fs.readFileSync('app.js','utf8'),ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'});
 const state={droids,fusion,owned:[{name:'X-ONK',variant:'GOLD',qty:1,built:true}]};
 const context=vm.createContext({...rules,VARIANTS:rules.ALL_VARIANTS,state,novaLevelFor:()=>0,requirementLocations:()=>new Map([['GONK:GOLD','X-ONK / Worker 2']]),escapeAttr:s=>s,variantText:s=>s,fmt:n=>String(n),activationNeeded:(a,b)=>b==='KYBER'&&!rules.isActiveKyber(a)});
 for(const name of ['rowIsBuilding','fusionRecipes','fusionDroid','fusionKey','fusionRecipeFor','variantStep','fusionPower','lowestVariant','fusionResultVariant','droidRarity','fusionOutcome','rebirthNames','bestOwnedVariant','hasRequirement','chipsToVariant','requirementStatus','requirementWhere']){
  const node=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name||n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name===name));assert(node,name);vm.runInContext(source.slice(node.start,node.end),context);
 }
 const run=s=>vm.runInContext(s,context),status=run('requirementStatus({droidName:"GONK",variant:"BESKAR"})');
 assert.equal(status.heldName,'X-ONK');assert.equal(status.heldDroid.rarity,'MYTHIC');assert.equal(status.chips,52000);assert(status.needsUpgrade);assert.equal(status.where,'X-ONK / Worker 2');
 assert(run('requirementWhere(requirementStatus({droidName:"GONK",variant:"BESKAR"}))').includes('X-ONK fusion'));
 state.owned[0].variant='KYBER_YELLOW';assert(run('hasRequirement({droidName:"GONK",variant:"KYBER"})'));assert(run('hasRequirement({droidName:"KX",variant:"KYBER"})'));
 const out=run('fusionOutcome(Array.from({length:3},()=>({name:"MOUSE",variant:"KYBER_PURPLE"})))');assert.equal(out.variant,'KYBER_YELLOW');assert.equal(out.name,'MOUSE');
});
test('Iconic Protocol lead uses active same-role non-Iconics, without compounding',async()=>{
 const {placedProtocolBonus,iconicProtocolBonus}=await import('../droid-rules.js');
 const iconic=droids.find(d=>d.name==='C-3PO'),kl=droids.find(d=>d.name==='KL-NK');
 const placed=[{name:'KL-NK',variant:'KYBER_YELLOW',station:'PROTOCOL_BATTLE_CREDITS'}];
 assert.equal(kl.variants.KYBER_YELLOW.protocolCpsBonusPercent,225);
 assert.equal(placedProtocolBonus(iconic,'DEFAULT','CREDITS',placed,droids),270);
 assert.equal(placedProtocolBonus(iconic,'DEFAULT','CRAFTING',placed,droids),4000);
 assert.equal(placedProtocolBonus(iconic,'DEFAULT','CREDITS',[{...placed[0],station:'LOUNGE'}],droids),200);
 assert.equal(iconicProtocolBonus(200,200),200);assert.equal(iconicProtocolBonus(200,225),270);
});

test('Yellow power does not increase mutation-only mission speed or sale chips',async()=>{
 const {missionProgress}=await import('../mission-economy.js');
 const {baseChipSellValue}=await import('../droid-rules.js');
 const d=droids.find(d=>d.type==='ASTROMECH'&&d.variants.KYBER_YELLOW);
 assert.deepEqual(missionProgress({variant:'KYBER_YELLOW'},d),missionProgress({variant:'KYBER_PURPLE'},d));
 assert.equal(baseChipSellValue(d,'KYBER_YELLOW'),baseChipSellValue(d,'KYBER_PURPLE'));
});
test('Optimise recomputes the Iconic lead for each candidate layout',async()=>{
 const {createAssignmentScorer}=await import('../optimise-layout-score.js');
 const regionless={region:-1,creditRegion:-1,craftRegion:-1,base:0,traitBonus:0,creditBonus:0,craftBonus:0};
 const score=createAssignmentScorer({
  units:[{...regionless,type:'PROTOCOL',creditBonus:2.25,craftBonus:33.75}],
  slots:[{region:-1,craftRegion:-1,station:'PROTOCOL_BATTLE_CREDITS',creditRegion:2}],
  locked:[{...regionless,type:'BATTLE',base:100,region:0,station:'WORKER'},
   {...regionless,type:'PROTOCOL',iconic:true,creditBonus:2,craftBonus:40,creditRegion:0,station:'PROTOCOL_WORKER_CREDITS'}],
  regions:['WORKER','ASTROMECH','BATTLE'],multiplier:1,lambda:0,craftSeconds:[0,0,0],craftBaseSpeed:1,craftingPriority:false
 });
 assert.equal(score([-1])[0],300);assert.equal(score([0])[0],370);
});
