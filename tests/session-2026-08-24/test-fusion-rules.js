// What a fusion produces: the quality that comes out, the quality ladder for
// three of one droid, and the rarity ladder for three that merely share one.
const fs=require('fs'),vm=require('vm');
const ROOT=require('path').resolve(__dirname,'..','..')+'/';
const src=fs.readFileSync(ROOT+'app.js','utf8');
let fails=0;const ok=(l,c,x='')=>{if(!c)fails++;console.log(`  ${c?'ok  ':'FAIL'} ${l}${c?'':'  -> '+x}`)};
const grab=k=>{const i=src.indexOf(k);if(i<0)throw Error('missing '+k);let d=0,j=i,started=false;
  for(;j<src.length;j++){if(src[j]==='{'){d++;started=true}else if(src[j]==='}'){d--;if(started&&d===0){j++;break}}}
  return src.slice(i,j)};
const line=k=>{const i=src.indexOf(k);if(i<0)throw Error('missing '+k);return src.slice(i,src.indexOf('\n',i))};

const droids=[
  {name:'A-EPIC',rarity:'EPIC'},{name:'B-EPIC',rarity:'EPIC'},{name:'C-EPIC',rarity:'EPIC'},{name:'D-EPIC',rarity:'EPIC'},
  {name:'A-LEG',rarity:'LEGENDARY'},{name:'B-LEG',rarity:'LEGENDARY'},{name:'C-LEG',rarity:'LEGENDARY'},
  {name:'A-MYTH',rarity:'MYTHIC'},{name:'B-MYTH',rarity:'MYTHIC'},{name:'C-MYTH',rarity:'MYTHIC'},
  {name:'ARG',rarity:'RARE'},{name:'MOUSE',rarity:'COMMON'},{name:'WHL-EX',rarity:'RARE',fusion:true},
  {name:'ICON',rarity:'ICONIC',special:{onlyDefaultVariant:true}},
];
const sandbox={console,state:{droids,owned:[],fusion:{recipes:[{name:'WHL-EX',rarity:'RARE',inputs:['ARG','MOUSE','MOUSE']},{name:'TRI',rarity:'EPIC',inputs:['A-EPIC','B-EPIC','C-EPIC']}]}},
  escapeAttr:s=>String(s),variantText:v=>v,rarityText:r=>r,variantLabel:v=>v,rarityLabel:r=>r};
vm.createContext(sandbox);
for(const chunk of [line('const VARIANTS='),line('const isIconic='),line('const fusionRecipes='),line('const fusionDroid='),
  line('const fusionKey='),line('const fusionRecipeFor='),line('const RARITY_LADDER='),line('const rarityStep='),
  line('const nextRarity='),line('const variantStep='),line('const nextVariant=v=>'),line('const lowestVariant='),
  line('const droidRarity='),grab('function fusionOutcome('),grab('function fusionStock('),grab('function fusionCountFrom('),
  line('const fusionRecipeWants='),grab('function fusionBestVariant('),grab('function fusionQualitySteps('),grab('function fusionRaritySteps(')])
  vm.runInContext(chunk,sandbox);
const outcome=u=>vm.runInContext('fusionOutcome('+JSON.stringify(u)+')',sandbox);

console.log('=== the quality that comes out is the worst that went in ===');
let r=outcome([{name:'A-LEG',variant:'GOLD'},{name:'B-LEG',variant:'GOLD'},{name:'C-LEG',variant:'RAINBOW'}]);
ok('two Gold Legendaries and a Rainbow Legendary make a Gold Mythic',r.kind==='rarity'&&r.rarity==='MYTHIC'&&r.variant==='GOLD',JSON.stringify(r));
r=outcome([{name:'A-LEG',variant:'RAINBOW'},{name:'B-LEG',variant:'STELLAR'},{name:'C-LEG',variant:'STELLAR'}]);
ok('one Rainbow among two Stellar still comes out Rainbow',r.variant==='RAINBOW',JSON.stringify(r));

console.log('=== three that merely share a rarity step the rarity up ===');
r=outcome([{name:'B-EPIC',variant:'BESKAR'},{name:'C-EPIC',variant:'BESKAR'},{name:'D-EPIC',variant:'BESKAR'}]);
ok('three different Epics at Beskar make a Legendary Beskar',r.kind==='rarity'&&r.rarity==='LEGENDARY'&&r.variant==='BESKAR',JSON.stringify(r));
r=outcome([{name:'A-MYTH',variant:'GOLD'},{name:'B-MYTH',variant:'GOLD'},{name:'C-MYTH',variant:'GOLD'}]);
ok('Mythic is the top of the rarity ladder, so it has no step',r.kind==='unknown',JSON.stringify(r));
r=outcome([{name:'A-EPIC',variant:'GOLD'},{name:'B-LEG',variant:'GOLD'},{name:'C-MYTH',variant:'GOLD'}]);
ok('mixed rarities are not a recorded combination',r.kind==='unknown',JSON.stringify(r));

console.log('=== three of one droid hand that same droid back a quality up ===');
r=outcome([{name:'A-LEG',variant:'GOLD'},{name:'A-LEG',variant:'GOLD'},{name:'A-LEG',variant:'GOLD'}]);
ok('three Gold of one droid make that same droid at Diamond',r.kind==='quality'&&r.name==='A-LEG'&&r.rarity==='LEGENDARY'&&r.variant==='DIAMOND',JSON.stringify(r));
r=outcome([{name:'A-LEG',variant:'STELLAR'},{name:'A-LEG',variant:'STELLAR'},{name:'A-LEG',variant:'STELLAR'}]);
// Stellar has nothing above it, so the three step rarity instead.
ok('three Stellar of one Legendary make a random Mythic Stellar',r.kind==='rarity'&&r.rarity==='MYTHIC'&&r.variant==='STELLAR'&&r.from==='LEGENDARY',JSON.stringify(r));
r=outcome([{name:'A-MYTH',variant:'STELLAR'},{name:'A-MYTH',variant:'STELLAR'},{name:'A-MYTH',variant:'STELLAR'}]);
ok('but a Mythic at Stellar has neither ladder left',r.kind==='capped',JSON.stringify(r));
r=outcome([{name:'A-LEG',variant:'GOLD'},{name:'A-LEG',variant:'GOLD'},{name:'A-LEG',variant:'DIAMOND'}]);
ok('three of one droid at mixed qualities is not recorded',r.kind==='unknown',JSON.stringify(r));
r=outcome([{name:'ICON',variant:'DEFAULT'},{name:'ICON',variant:'DEFAULT'},{name:'ICON',variant:'DEFAULT'}]);
ok('iconics have no quality ladder to climb',r.kind==='unknown',JSON.stringify(r));

console.log('=== a recipe names its result; a rarity step does not ===');
r=outcome([{name:'A-EPIC',variant:'GOLD'},{name:'B-EPIC',variant:'GOLD'},{name:'C-EPIC',variant:'GOLD'}]);
ok('three Epics that are a recorded combination make it, not a Legendary',r.kind==='recipe'&&r.name==='TRI',JSON.stringify(r));
ok('a rarity step settles rarity and quality but not which droid',!outcome([{name:'B-EPIC',variant:'GOLD'},{name:'C-EPIC',variant:'GOLD'},{name:'D-EPIC',variant:'GOLD'}]).name,'named');
r=outcome([{name:'ARG',variant:'GOLD'},{name:'MOUSE',variant:'DIAMOND'},{name:'MOUSE',variant:'RAINBOW'}]);
ok('ARG + MOUSE + MOUSE makes WHL-EX, not a rarity step',r.kind==='recipe'&&r.name==='WHL-EX',JSON.stringify(r));
ok('and it comes out at the worst quality that went in',r.variant==='GOLD',JSON.stringify(r));

console.log('=== what your base could fuse ===');
sandbox.state.owned=[{name:'A-EPIC',variant:'BESKAR',qty:1},{name:'B-EPIC',variant:'BESKAR',qty:1},
  {name:'C-EPIC',variant:'BESKAR',qty:1},{name:'A-LEG',variant:'GOLD',qty:3},
  {name:'ARG',variant:'STELLAR',qty:1},{name:'MOUSE',variant:'DIAMOND',qty:2}];
const q=vm.runInContext('fusionQualitySteps(fusionStock())',sandbox);
ok('holding three Gold A-LEG offers a step to Diamond',q.length===1&&q[0].name==='A-LEG'&&q[0].to==='DIAMOND',JSON.stringify(q));
let rare=vm.runInContext('fusionRaritySteps(fusionStock())',sandbox);
ok('exactly the three of a recorded combination is that recipe, not a rarity step',!rare.some(g=>g.rarity==='EPIC'&&g.variant==='BESKAR'),JSON.stringify(rare));
sandbox.state.owned.push({name:'D-EPIC',variant:'BESKAR',qty:1});
rare=vm.runInContext('fusionRaritySteps(fusionStock())',sandbox);
ok('a fourth Beskar Epic makes it a real rarity step again',rare.some(g=>g.rarity==='EPIC'&&g.variant==='BESKAR'&&g.to==='LEGENDARY'),JSON.stringify(rare));
const best=vm.runInContext("fusionBestVariant(state.fusion.recipes[0],fusionStock())",sandbox);
ok('WHL-EX can be made at Diamond, held back by the two Diamond MOUSE',best==='DIAMOND',String(best));
sandbox.state.owned=[{name:'ARG',variant:'STELLAR',qty:1},{name:'MOUSE',variant:'DIAMOND',qty:1}];
ok('one MOUSE is not enough for a recipe that wants two',vm.runInContext("fusionBestVariant(state.fusion.recipes[0],fusionStock())",sandbox)==='',String(best));

console.log(fails?`\n${fails} FAILED`:'\nall passed');
process.exit(fails?1:0);
