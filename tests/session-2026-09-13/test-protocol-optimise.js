// Optimise and Protocol droids. Its walkthrough grouped every Protocol step under a
// stop reading "undefined", and it sold spare Protocol droids as dead ends when
// they can be upgraded or fused. Spares are now kept, and fused when that gives a
// stronger bonus than the weakest one slotted.
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

console.log('=== Protocol steps are grouped into named stops ===');
{
  const state={droids:structuredClone(droids)};
  const sb={state,console,
    unitName:x=>x.name,
    slotLabel:x=>x?`${x.station} ${x.slot+1}`:'Roster',
    withFusionSteps:x=>x,
    isBuilding:()=>false,
    stationSlotIndices:station=>station==='LOUNGE'?[0,1,2,3,4,5,6,7,8,9]:[0]};
  vm.createContext(sb);
  vm.runInContext(protocolBlock,sb);
  vm.runInContext(line('const isProtocolStation='),sb);
  vm.runInContext(line('const canUseStation='),sb);
  vm.runInContext(grab('function protocolStepPlan('),sb);
  vm.runInContext(grab('function optimiseVisits('),sb);
  vm.runInContext(line('const stationName='),sb);
  vm.runInContext(line('const ROSTER='),sb);
  vm.runInContext(line('const placeName='),sb);
  const u=(name,variant,station,slot,source)=>({name,variant,station,slot,source,unit:0});
  // Deliberately interleaved: Lounge, Protocol slot, Lounge, Astromech, not placed.
  const pz=u('PZ','DEFAULT','PROTOCOL_ASTROMECH_CREDITS',0,1),sa1=u('SA-5','BESKAR','LOUNGE',2,2),
        sa2=u('SA-5','DIAMOND','LOUNGE',6,3),tri=u('TRI-TEK','DIAMOND','ASTROMECH',1,4),loose={name:'LO',variant:'GOLD',source:5,unit:0};
  sb.baseP={placed:[sa1,pz,sa2,tri]};
  sb.projected={placed:[],sell:[sa1,pz,sa2,tri,loose]};
  const steps=vm.runInContext('protocolStepPlan(baseP,projected)',sb);
  ok('every step has a stop',steps.every(s=>s.at),JSON.stringify(steps.map(s=>s.at)));
  ok('and a visit to group it by',steps.every(s=>s.visit!==undefined));
  sb.steps=steps;
  const headings=vm.runInContext('optimiseVisits(steps).map(v=>placeName(v.at))',sb);
  ok('no stop is called undefined',!headings.some(h=>/undefined/i.test(String(h))),headings.join(' | '));
  ok('a Protocol slot is named for what it is',headings.includes('Astromech Protocol · Credits'),headings.join(' | '));
  ok('the Lounge is its own stop',headings.includes('Lounge'),headings.join(' | '));
  ok('both Lounge sells land in the same stop, not two',headings.filter(h=>h==='Lounge').length===1,headings.join(' | '));
  ok('a droid that is not placed is sold from the Roster',headings.includes('Roster'),headings.join(' | '));
  sb.baseP={placed:[]};
  sb.projected={placed:[{name:'SA-5',variant:'DEFAULT',station:'PROTOCOL_WORKER_CREDITS',slot:0,source:9,unit:0}],sell:[]};
  sb.stationSlotIndices=()=>[];
  const noted=vm.runInContext('protocolStepPlan(baseP,projected)',sb);
  ok('a lone move still gets a stop',noted.every(s=>s.at&&s.visit!==undefined),JSON.stringify(noted.map(s=>[s.type,s.at])));
}

console.log('');
console.log('=== Optimise keeps spare Protocol droids ===');
{
  const fnText=grab('function optimisedPlacements(');
  const protocolAt=fnText.indexOf("if(d?.type==='PROTOCOL'){"),dexAt=fnText.indexOf('Not needed for a rebirth, but upgrading it could still complete Droidex');
  ok('a Protocol droid with no rebirth use is kept, not sold',protocolAt>=0);
  ok('ahead of the Droidex keeper, which only keeps one copy while storage is free',protocolAt>=0&&protocolAt<dexAt);
  ok('it is marked so that with no room it overflows instead of selling',fnText.includes("spared:true,keepReason:'protocol'"));
  ok('its reason is shown',fnText.includes("Kept · Protocol droids can be upgraded or fused"));
  ok('and the final sell pass leaves it alone',fnText.includes('&&!protocolDetail&&!isBuilding(x))'));

  // The placement loop, lifted out: a kept Protocol droid with nowhere to stand.
  const marker=LINES.findIndex(l=>l.includes("let station='',slot=-1;"));
  const loop=LINES.slice(marker-3,marker+4).join('\n');
  const sell=[],overflow=[];
  const sb={candidates:[{unit:{name:'PZ',variant:'GOLD',source:1,unit:0},fallbacks:['LOUNGE'],old:null,kept:false,spared:true,keepReason:'protocol'}],
    sell,overflow,strictKeepBuild:true,free:()=>-1,claim:()=>{},isIconic:()=>false,
    optimiseFreeBuildMode:()=>'upgrade-cost',optimiseFreeBuildModeLabel:()=>'x',state:{droids:[{name:'PZ'}]}};
  vm.createContext(sb);vm.runInContext(loop,sb);
  ok('with every store full it is still not sold',sell.length===0,JSON.stringify(sell));
  ok('it overflows, carrying its reason, so fusions can still find it',overflow.length===1&&overflow[0].keepReason==='protocol',JSON.stringify(overflow));
}

console.log('');
console.log('=== spare Protocol droids can be fused, judged by the bonus they give ===');
{
  const sb={console};vm.createContext(sb);
  vm.runInContext('const VARIANTS='+JSON.stringify(VARIANTS)+';',sb);
  vm.runInContext(line('const RARITY_LADDER='),sb);
  for(const k of ['const variantStep=','const rarityStep=','const nextVariant=','const nextRarity=','const isIconic=',
    'const fusionDroid=','const fusionRecipes=','const fusionRecipeWants=','const fusionKey=','const fusionRecipeFor=',
    'const droidIncomeAt=','const droidexGapFor=','const PRODUCTIVE_STATIONS=','const variantLabel=','const rarityLabel=','const fmt=',
    'const protocolBonus=','const protocolFusionSpares=']) vm.runInContext(line(k),sb);
  vm.runInContext(protocolBlock,sb);
  for(const k of ['function fusionCountFrom(','function fusionBestVariant(','function fusionQualitySteps(','function fusionRaritySteps(',
    'function typicalIncomeFor(','function fusionSpendFrom(','function fusionBestFrom(','function fusionChainFromSpares(',
    'function droidexEntry(','function optimiseFusionChain(','function withFusionSteps(']) vm.runInContext(grab(k),sb);
  vm.runInContext("function capacity(){return 1};function soldInsteadOfFusion(){return []};function slotLabel(x){return x.station+' '+(x.slot+1)}",sb);
  const everySquare=[];for(const d of droids)for(const v of VARIANTS)everySquare.push({name:d.name,variant:v});
  const slotted=(name,variant)=>Object.keys(vm.runInContext('PROTOCOL_SLOTS',sb)).map((station,i)=>({name,variant,station,slot:0,source:100+i,unit:0}));
  const spares=['DIAMOND','DIAMOND','DIAMOND'].map((variant,i)=>({name:'SA-5',variant,station:'LOUNGE',slot:i,source:i,unit:0,keepReason:'protocol'}));

  // Weak bonuses slotted: three SA-5 Diamond (24% credits) become a Rainbow (32%).
  sb.state={droids,fusion:JSON.parse(fs.readFileSync(ROOT+'data/fusion.json','utf8')),droidex:everySquare,owned:[],optimiseFuseFirst:true};
  sb.s=spares;sb.p=slotted('SA-5','DEFAULT');
  const chain=vm.runInContext('fusionChainFromSpares(s,p)',sb);
  ok('three spare SA-5 Diamond are worth fusing when your slotted bonuses are weaker',chain.length===1&&chain[0].out&&chain[0].out.variant==='RAINBOW',JSON.stringify(chain.map(c=>c.out)));
  ok('the reason is the bonus, not the credits',chain[0]&&chain[0].protocol===true&&chain[0].bonusGain>0,JSON.stringify(chain[0]&&{p:chain[0].protocol,b:chain[0].bonusGain}));

  // Strong bonuses slotted, and strong earners working: nothing is worth fusing.
  sb.p=[...slotted('TDA','STELLAR'),...['WORKER','ASTROMECH','BATTLE'].map((station,i)=>({name:'B1 HEAVY',variant:'DEFAULT',station,slot:0,source:200+i,unit:0}))];
  const none=vm.runInContext('fusionChainFromSpares(s,p)',sb);
  ok('with stronger bonuses already slotted they are simply kept',none.length===0,JSON.stringify(none.map(c=>c.out)));

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
  const stellar=[0,1,2].map(i=>({name:'SA-5',variant:'STELLAR',station:'LOUNGE',slot:i,source:i,unit:0,keepReason:'protocol'}));
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
  vm.runInContext(line('const STEP_VERB_TONE=')+line('const FUSION_STEP_TYPES='),sbv);
  const toneOf=step=>{sbv.step=step;return vm.runInContext('(()=>{'+tones+'return tone})()',sbv)};
  for(const type of ['fuse-in','fuse-held','fuse-deferred','fuse-result','fuse'])
    ok(type+' is coloured as a Fusion step',toneOf({type,text:'Send X to the Fusion room.'})==='fusion',toneOf({type,text:'Send X.'}));
  ok('sending to storage keeps its own colour',toneOf({type:'move',text:'Send X to the Lounge.'})==='stage');
  ok('the Fusion colour is styled, and differs from storage',/\.verb-fusion\{color:#[0-9a-f]{6}\}/i.test(fs.readFileSync(ROOT+'styles.css','utf8')));
  ok('a kept Protocol spare in a fusion step offers Keep, not Sell',src.includes("${step.protocolSpare?'Keep':'Sell'}</button>"));
  ok('the Base panel no longer lists Protocol droids as spare to sell',src.includes("d.special?.cannotSell||d.type==='PROTOCOL')continue;"));
  const plan=grab('function safeOptimiseStepPlan(');
  ok('the re-plan drops droids already sent to Fusion, so it cannot move them afterwards',plan.includes('placed:(projected.placed||[]).filter(x=>!consumed.has('));
}

console.log('');
console.log(fails?fails+' failed':'all passed');
process.exit(fails?1:0);
