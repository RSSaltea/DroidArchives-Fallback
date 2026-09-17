// Protocol routing and beneficial fusion regressions. Unneeded Protocol copies
// now follow normal sale rules; explicit fusion reserves remain protected.
const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..','..')+'/';
const src=fs.readFileSync(ROOT+'app.js','utf8'),LINES=src.split(/\r?\n/);
let fails=0;const ok=(l,c,x='')=>{if(!c)fails++;console.log('  '+(c?'ok  ':'FAIL')+' '+l+(c?'':'  -> '+x))};
const line=k=>{const l=LINES.find(x=>x.trimStart().startsWith(k));if(!l)throw Error('missing '+k);return l.trim()};
const grab=k=>{const i=src.indexOf(k);if(i<0)throw Error('missing '+k);let d=0,j=src.indexOf('{',i),st=false;
  for(;j<src.length;j++){if(src[j]==='{'){d++;st=true}else if(src[j]==='}'){d--;if(st&&d===0){j++;break}}}return src.slice(i,j)};
const VARIANTS=['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR'];
const droids=JSON.parse(fs.readFileSync(ROOT+'data/droids.json','utf8'));
const protocolBlock=src.slice(src.indexOf('const PROTOCOL_REGIONS='),src.indexOf('const isProtocolStation='));

console.log('');
// Full placement and sale regressions live in tests/protocol-selling.test.cjs.
console.log('=== spare Protocol droids can be fused, judged by the bonus they give ===');
{
  const sb={console};vm.createContext(sb);
  vm.runInContext('const VARIANTS='+JSON.stringify(VARIANTS)+';',sb);
  vm.runInContext(line('const RARITY_LADDER='),sb);
  for(const k of ['const variantStep=','const rarityStep=','const nextVariant=','const nextRarity=','const isIconic=',
    'const fusionDroid=','const fusionRecipes=','const fusionRecipeWants=','const fusionKey=','const fusionRecipeFor=',
    'const lowestVariant=','const droidRarity=','const droidIncomeAt=','const droidexGapFor=','const PRODUCTIVE_STATIONS=','const variantLabel=','const rarityLabel=','const fmt=',
    'const protocolBonus=','const protocolFusionSpares=']) vm.runInContext(line(k),sb);
  vm.runInContext(protocolBlock,sb);
  for(const k of ['function fusionCountFrom(','function fusionBestVariant(','function fusionQualitySteps(','function fusionRaritySteps(',
    'function typicalIncomeFor(','function normaliseFusionPreferences(','function fusionOutcome(','function fusionOutcomeText(','function fusionSpendFrom(','function fusionBestFrom(','function fusionChainFromSpares(',
    'function droidexEntry(','function optimiseFusionChain(','function withFusionSteps(']) vm.runInContext(grab(k),sb);
  vm.runInContext("function fusionRebirthProtectedKeys(){return new Set()};function capacity(){return 1};function soldInsteadOfFusion(){return []};function slotLabel(x){return x.station+' '+(x.slot+1)}",sb);
  const everySquare=[];for(const d of droids)for(const v of VARIANTS)everySquare.push({name:d.name,variant:v});
  const slotted=(name,variant)=>Object.keys(vm.runInContext('PROTOCOL_SLOTS',sb)).map((station,i)=>({name,variant,station,slot:0,source:100+i,unit:0}));
  const spares=['DIAMOND','DIAMOND','DIAMOND'].map((variant,i)=>({name:'SA-5',variant,station:'LOUNGE',slot:i,source:i,unit:0,keepReason:'fusion'}));

  // Weak bonuses slotted: three SA-5 Diamond (24% credits) become a Rainbow (32%).
  sb.state={droids,fusion:JSON.parse(fs.readFileSync(ROOT+'data/fusion.json','utf8')),droidex:everySquare,owned:[],optimiseFuseFirst:true};
  sb.s=spares;sb.p=slotted('SA-5','DEFAULT');
  const chain=vm.runInContext('fusionChainFromSpares(s,p)',sb);
  ok('three spare SA-5 Diamond are worth fusing when your slotted bonuses are weaker',chain.length===1&&chain[0].out&&chain[0].out.variant==='RAINBOW',JSON.stringify(chain.map(c=>c.out)));
  ok('the reason is the bonus, not the credits',chain[0]&&chain[0].protocol===true&&chain[0].bonusGain>0,JSON.stringify(chain[0]&&{p:chain[0].protocol,b:chain[0].bonusGain}));

  // Strong bonuses slotted, and strong earners working: nothing is worth fusing.
  sb.p=[...slotted('TDA','STELLAR'),...['WORKER','ASTROMECH','BATTLE'].map((station,i)=>({name:'B1 HEAVY',variant:'DEFAULT',station,slot:0,source:200+i,unit:0}))];
  const none=vm.runInContext('fusionChainFromSpares(s,p)',sb);
  ok('with stronger bonuses already slotted no fusion is recommended',none.length===0,JSON.stringify(none.map(c=>c.out)));

  // Unprotected Protocol spares now reach fusion planning through the sell list.
  sb.sellable=spares.map(({keepReason,...unit})=>unit);
  sb.sellSteps=sb.sellable.map(unit=>({type:'sell',unit,from:{station:unit.station,slot:unit.slot},at:unit.station,text:`Sell ${unit.name}.`}));
  sb.baseP={placed:sb.sellable};
  sb.projected={placed:sb.p,overflow:[],sell:sb.sellable};
  const unchanged=vm.runInContext('withFusionSteps(sellSteps,projected,baseP)',sb);
  ok('unneeded Protocol copies stay in the sell plan when fusion adds nothing',unchanged.length===3&&unchanged.every(x=>x.type==='sell'));
  sb.projected.placed=slotted('SA-5','DEFAULT');
  const improved=vm.runInContext('withFusionSteps(sellSteps,projected,baseP)',sb);
  ok('a beneficial Protocol fusion still replaces the three sells',improved.filter(x=>x.type==='fuse-in').length===3&&improved.some(x=>x.type==='fuse')&&!improved.some(x=>x.type==='sell'));

  // No Protocol droid in the pool: the floors are never worked out at all.
  sb.s=[{name:'SNOW MOUSE',variant:'DIAMOND',qty:3}];sb.p=[];
  ok('a pool with no Protocol droid behaves exactly as it did',vm.runInContext('fusionChainFromSpares(s,p)',sb).every(c=>c.bonusGain===0));

  // The walkthrough: kept spares, no sell steps, empty Protocol slots.
  sb.projected={placed:spares,overflow:[],sell:[]};
  sb.baseP={placed:spares};
  const out=vm.runInContext('withFusionSteps([],projected,baseP)',sb);
  const sends=out.filter(x=>x.type==='fuse-in'),fuse=out.find(x=>x.type==='fuse');
  ok('all three are sent to Fusion',sends.length===3,JSON.stringify(out.map(x=>x.type)));
  ok('marked as kept Protocol spares',sends.every(x=>x.protocolSpare===true));
  ok('from where they stand now',sends.every(x=>/from LOUNGE/.test(x.text)),sends.map(x=>x.text).join(' | '));
  ok('and never told they are being sold',sends.every(x=>!/instead of selling/.test(x.text)),sends.map(x=>x.text).join(' | '));
  ok('the fusion says the bonus is why',fuse&&/stronger Protocol bonus/.test(fuse.text),fuse&&fuse.text);

  // Three at the top quality roll the next rarity, and the result can be any type.
  const stellar=[0,1,2].map(i=>({name:'SA-5',variant:'STELLAR',station:'LOUNGE',slot:i,source:i,unit:0,keepReason:'fusion'}));
  sb.projected={placed:[...['WORKER','ASTROMECH','BATTLE'].map((station,i)=>({name:'SA-5',variant:'DEFAULT',station,slot:0,source:50+i,unit:0})),...stellar],overflow:[],sell:[]};
  sb.baseP={placed:stellar};
  const roll=vm.runInContext('withFusionSteps([],projected,baseP)',sb).find(x=>x.type==='fuse');
  ok('three Protocol droids at Stellar roll into the next rarity',roll&&/an Epic droid at Stellar/.test(roll.text),roll&&roll.text);
  ok('and it says the result can be any type',roll&&/Worker, Astromech, Battle or Protocol/.test(roll.text),roll&&roll.text);

  // Not enough to fuse: kept, and nothing is said about them.
  sb.projected={placed:spares.slice(0,2),overflow:[],sell:[]};sb.baseP={placed:spares.slice(0,2)};
  ok('two spares make no steps at all',vm.runInContext('withFusionSteps([],projected,baseP)',sb).length===0);
}

console.log('');
console.log('=== the rest of the page agrees ===');
{
  const tones=grab('function stepHtml(').match(/const tone=.*/)[0];
  const sbv={};vm.createContext(sbv);
  const loungeTone=grab('function stepHtml(').match(/const toLounge=.*/)[0];
  vm.runInContext(line('const STEP_VERB_TONE=')+line('const FUSION_STEP_TYPES='),sbv);
  const toneOf=step=>{sbv.step=step;return vm.runInContext('(()=>{'+loungeTone+tones+'return tone})()',sbv)};
  for(const type of ['fuse-in','fuse-held','fuse-deferred','fuse-result','fuse'])
    ok(type+' is coloured as a Fusion step',toneOf({type,text:'Send X to the Fusion room.'})==='fusion',toneOf({type,text:'Send X.'}));
  ok('sending to storage keeps its own colour',toneOf({type:'move',to:'LOUNGE',text:'Move X to the Lounge.'})==='lounge');
  ok('the Fusion colour is styled, and differs from storage',/\.verb-fusion\{color:#[0-9a-f]{6}\}/i.test(fs.readFileSync(ROOT+'styles.css','utf8')));
  ok('a kept Protocol spare in a fusion step offers Keep, not Sell',src.includes("${step.protocolSpare?'Keep':'Sell'}</button>"));
  ok('the Base panel includes saleable Protocol spares',!src.includes("d.special?.cannotSell||d.type==='PROTOCOL')continue;"));
  const plan=grab('function safeOptimiseStepPlan(');
  ok('droids kept for a fusion batch are taken out of the sell list before the walk is planned',plan.includes('projected.sell.filter(unit=>!claimed.has(keyOf(unit)))'));
}

console.log('');
console.log(fails?fails+' failed':'all passed');
process.exit(fails?1:0);
