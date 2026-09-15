// Fusing what the cycle no longer wants: which copies are really spare, which
// routes reach a droid you still need, and which fusions beat selling the parts.
const fs=require('fs'),vm=require('vm');
const ROOT=require('path').resolve(__dirname,'..','..')+'/';
const src=fs.readFileSync(ROOT+'app.js','utf8');
let fails=0;const ok=(l,c,x='')=>{if(!c)fails++;console.log('  '+(c?'ok  ':'FAIL')+' '+l+(c?'':'  -> '+x))};
const grab=k=>{const i=src.indexOf(k);if(i<0)throw Error('missing '+k);let d=0,j=i,started=false;
  for(;j<src.length;j++){if(src[j]==='{'){d++;started=true}else if(src[j]==='}'){d--;if(started&&d===0){j++;break}}}
  return src.slice(i,j)};
const line=k=>{const i=src.indexOf(k);if(i<0)throw Error('missing '+k);return src.slice(i,src.indexOf('\n',i))};

const droids=[
  {name:'CB',rarity:'COMMON',variants:{DEFAULT:{income:8}}},
  {name:'PIT',rarity:'COMMON',variants:{DEFAULT:{income:8}}},
  {name:'GONK',rarity:'COMMON',variants:{DEFAULT:{income:9}}},
  {name:'MOUSE',rarity:'COMMON',variants:{DEFAULT:{income:8},GOLD:{income:20}}},
  {name:'ARG',rarity:'RARE',variants:{DEFAULT:{income:50},GOLD:{income:120}}},
  {name:'2BB',rarity:'RARE',variants:{DEFAULT:{income:60}}},
  {name:'BAL-CORE',rarity:'RARE',variants:{DEFAULT:{income:55}}}
];
const sandbox={console,
  // An empty Droidex: the chain may fuse for a square as well as for income.
  state:{droids,droidex:[],owned:[],cycle:0,rebirth:1,rebirths:{0:[
    {to:1,requiredDroids:[{droidName:'CB',variant:'DEFAULT'}]},
    {to:2,requiredDroids:[{droidName:'2BB',variant:'DEFAULT'},{droidName:'BAL-CORE',variant:'DEFAULT'}]},
    {to:4,requiredDroids:[{droidName:'ARG',variant:'GOLD'}]}]},
    fusion:{recipes:[{name:'WHL-EX',rarity:'RARE',inputs:['ARG','MOUSE','MOUSE']}]}},
  rebirthGoal:()=>35,rowIsBuilding:()=>false,capacity:()=>2};
vm.createContext(sandbox);
for(const chunk of [line('const VARIANTS='),line('const isIconic='),line('const fusionRecipes='),line('const fusionDroid='),
  line('const fusionKey='),line('const fusionRecipeFor='),line('const RARITY_LADDER='),line('const rarityStep='),
  line('const nextRarity='),line('const variantStep='),line('const nextVariant=v=>'),line('const lowestVariant='),
  line('const droidRarity='),line('const PRODUCTIVE_STATIONS='),line('const droidIncomeAt='),
  // These three are one-liners whose parameters carry braces of their own, so
  // brace counting would stop at the parameter list rather than the body.
  line('function futureRequirements('),line('function bestOwnedVariant('),line('function hasRequirement('),
  grab('function fusionStock('),grab('function fusionCountFrom('),line('const fusionRecipeWants='),
  grab('function fusionBestVariant('),grab('function fusionQualitySteps('),grab('function fusionRaritySteps('),
  grab('function typicalIncomeFor('),grab('function fusionSpareStock('),grab('function fusionRoutesToNeeded('),
  grab('function droidexEntry('),line('const droidexGapFor='),grab('function fusionSpendFrom('),
  grab('function fusionOutcome('),grab('function normaliseFusionPreferences('),grab('function fusionBestFrom('),grab('function fusionChainFromSpares(')])
  vm.runInContext(chunk,sandbox);
const run=e=>vm.runInContext(e,sandbox);
const own=rows=>{sandbox.state.owned=rows};
const spareList=()=>run('[...fusionSpareStock()].map(function(e){return e[0]+":"+[...e[1]].map(function(v){return v[0]+"x"+v[1]}).join(",")})');

console.log('=== which copies are really spare ===');
own([{name:'CB',variant:'DEFAULT',qty:2},{name:'ARG',variant:'DEFAULT',qty:1},{name:'GONK',variant:'DEFAULT',qty:3}]);
let spare=spareList();
ok('a droid the rest of the cycle never asks for is spare in full',spare.includes('CB:DEFAULTx2'),JSON.stringify(spare));
ok('and so is every copy of another one',spare.includes('GONK:DEFAULTx3'),JSON.stringify(spare));
ok('but the single copy of a droid still wanted is held back',!spare.some(x=>x.indexOf('ARG:')===0),JSON.stringify(spare));
own([{name:'ARG',variant:'DEFAULT',qty:3}]);
ok('duplicates of a wanted droid are spare, the best copy is not',spareList().includes('ARG:DEFAULTx2'),JSON.stringify(spareList()));

console.log('=== routes to a droid you still need ===');
own([{name:'CB',variant:'DEFAULT',qty:2},{name:'PIT',variant:'DEFAULT',qty:2},{name:'GONK',variant:'DEFAULT',qty:2},{name:'MOUSE',variant:'DEFAULT',qty:2}]);
let routes=run('fusionRoutesToNeeded()');
ok('both Rares Rebirth 2 wants get a route',routes.filter(r=>r.kind==='roll').length===2,JSON.stringify(routes.map(r=>r.name+':'+r.kind)));
ok('a roll is never sold as a certainty',routes.every(r=>r.kind!=='roll'||r.sure===false),JSON.stringify(routes));
ok('and it draws only on spare Commons, the rarity below',routes[0].pool.every(n=>['CB','PIT','GONK','MOUSE'].indexOf(n)>=0),JSON.stringify(routes[0].pool));
own([{name:'CB',variant:'DEFAULT',qty:1}]);
ok('with nothing to spare there is no route',run('fusionRoutesToNeeded()').length===0,JSON.stringify(run('fusionRoutesToNeeded()')));
own([{name:'2BB',variant:'DEFAULT',qty:1},{name:'CB',variant:'DEFAULT',qty:3},{name:'PIT',variant:'DEFAULT',qty:3},{name:'GONK',variant:'DEFAULT',qty:3}]);
ok('a requirement already met needs no route',!run('fusionRoutesToNeeded()').some(r=>r.name==='2BB'),JSON.stringify(run('fusionRoutesToNeeded()').map(r=>r.name)));

console.log('=== fusions worth making out of the sell list ===');
const spares=[{name:'CB',variant:'DEFAULT'},{name:'PIT',variant:'DEFAULT'},{name:'GONK',variant:'DEFAULT'}];
const placed=[{name:'CB',variant:'DEFAULT',station:'WORKER'},{name:'PIT',variant:'DEFAULT',station:'WORKER'},
  {name:'GONK',variant:'DEFAULT',station:'ASTROMECH'},{name:'MOUSE',variant:'DEFAULT',station:'ASTROMECH'},
  {name:'CB',variant:'DEFAULT',station:'BATTLE'},{name:'PIT',variant:'DEFAULT',station:'BATTLE'}];
let worth=run('fusionChainFromSpares('+JSON.stringify(spares)+','+JSON.stringify(placed)+')');
ok('three spare Commons are worth rolling into a Rare',worth.some(w=>w.kind==='rarity'&&w.rarity==='RARE'),JSON.stringify(worth));
ok('and that suggestion is flagged as a roll',worth.filter(w=>w.kind==='rarity').every(w=>w.sure===false),JSON.stringify(worth));
ok('the gain is measured against the weakest earner, not against nothing',worth[0].gain>0&&worth[0].gain<worth[0].income,JSON.stringify(worth[0]));
ok('nothing to spare means nothing to suggest',run('fusionChainFromSpares([],[])').length===0,'');
const three=[{name:'MOUSE',variant:'DEFAULT'},{name:'MOUSE',variant:'DEFAULT'},{name:'MOUSE',variant:'DEFAULT'}];
worth=run('fusionChainFromSpares('+JSON.stringify(three)+','+JSON.stringify(placed)+')');
ok('three of one spare droid offer the certain quality step',worth.some(w=>w.kind==='quality'&&w.out.name==='MOUSE'&&w.out.variant==='GOLD'&&w.sure),JSON.stringify(worth));

console.log(fails?'\n'+fails+' FAILED':'\nall passed');
process.exit(fails?1:0);
