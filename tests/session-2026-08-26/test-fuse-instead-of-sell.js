// Fusing the Sell list instead of selling it. The point of the chain is that a
// fusion puts a droid back into the pool, so a later step can spend what an
// earlier one made - three spare Diamonds and two spare Rainbows are a Beskar,
// not two dead ends.
const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..','..')+'/';
const src=fs.readFileSync(ROOT+'app.js','utf8'),LINES=src.split(/\r?\n/);
let fails=0;const ok=(l,c,x='')=>{if(!c)fails++;console.log('  '+(c?'ok  ':'FAIL')+' '+l+(c?'':'  -> '+x))};
const pick=k=>{const l=LINES.find(x=>x.trimStart().startsWith(k));if(!l)throw Error('missing '+k);return l};
const grab=k=>{const i=src.indexOf(k);if(i<0)throw Error('missing '+k);let d=0,j=src.indexOf('{',i),st=false;
  for(;j<src.length;j++){if(src[j]==='{'){d++;st=true}else if(src[j]==='}'){d--;if(st&&d===0){j++;break}}}return src.slice(i,j)};

const VARIANTS=['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR'];
const sb={};vm.createContext(sb);
vm.runInContext('const VARIANTS='+JSON.stringify(VARIANTS)+';',sb);
vm.runInContext(pick('const RARITY_LADDER='),sb);
for(const k of ['const variantStep=','const rarityStep=','const nextVariant=','const nextRarity=','const isIconic=',
  'const fusionDroid=','const fusionRecipes=','const fusionRecipeWants=','const fusionKey=','const fusionRecipeFor=',
  'const droidIncomeAt=','const droidexGapFor=','const PRODUCTIVE_STATIONS=']) vm.runInContext(pick(k),sb);
for(const k of ['function fusionCountFrom(','function fusionBestVariant(','function fusionQualitySteps(',
  'function fusionRaritySteps(','function typicalIncomeFor(','function fusionSpendFrom(','function fusionBestFrom(',
  'function fusionChainFromSpares(','function droidexEntry(']) vm.runInContext(grab(k),sb);
vm.runInContext('function capacity(){return 5}',sb);   // only feeds the "are all productive slots full" test

const droids=JSON.parse(fs.readFileSync(ROOT+'data/droids.json','utf8'));
const fusion=JSON.parse(fs.readFileSync(ROOT+'data/fusion.json','utf8'));
const everySquare=[];for(const d of droids)for(const v of VARIANTS)everySquare.push({name:d.name,variant:v});
const chain=(spares,placed,droidex)=>{sb.state={droids,fusion,droidex:droidex||[],owned:[]};sb.s=spares;sb.p=placed||[];
  return vm.runInContext('fusionChainFromSpares(s,p)',sb)};
const MYTH=droids.find(d=>d.rarity==='MYTHIC'&&!d.fusion).name;

console.log('=== the chain spends what it just made ===');
{
  const steps=chain([{name:MYTH,variant:'DIAMOND',qty:3},{name:MYTH,variant:'RAINBOW',qty:2}]);
  ok('three Diamonds and two Rainbows make two steps',steps.length===2,steps.length+' steps');
  ok('the first turns three Diamonds into a Rainbow',
    steps[0].out.variant==='RAINBOW'&&steps[0].spend[0].variant==='DIAMOND'&&steps[0].spend[0].count===3);
  ok('the second reaches Beskar',steps[1].out.variant==='BESKAR');
  ok('and it knows it is spending the first step\u2019s result',steps[1].after.includes(0),JSON.stringify(steps[1].after));
  ok('the two spare Rainbows are what made that possible',steps[1].spend[0].count===3);
}

console.log('');
console.log('=== a Droidex square is reason enough on its own ===');
{
  const empty=chain([{name:MYTH,variant:'DIAMOND',qty:3}]);
  ok('an empty Droidex fuses for the square',empty.length===1&&empty[0].fills===true);
  const done=chain([{name:MYTH,variant:'DIAMOND',qty:3}],[],everySquare);
  ok('with the square already filled it is judged on income alone',done.every(s=>s.fills===false));
  ok('and here income still justifies it',done.length===1,'a Rainbow out-earns a Diamond');
}

console.log('');
console.log('=== nothing worth doing ===');
{
  ok('one droid is not a fusion',chain([{name:MYTH,variant:'DIAMOND',qty:1}]).length===0);
  ok('an empty sell list gives an empty chain',chain([]).length===0);
  const rich=[{name:MYTH,variant:'STELLAR',qty:5}];
  ok('the top quality has no step above it',chain(rich).every(s=>s.kind!=='quality'));
}

console.log('');
console.log('=== a recipe beats a plain rarity roll ===');
{
  const recipe=fusionRecipes_first();
  const steps=chain(recipe.inputs.map(n=>({name:n,variant:'GOLD',qty:1})));
  ok('the recipe is found from its exact inputs',steps.length===1&&steps[0].kind==='recipe');
  ok('it names what comes out',steps[0].out.name===recipe.name,steps[0].out&&steps[0].out.name);
  ok('at the worst quality that went in',steps[0].out.variant==='GOLD');
  ok('and a fusion droid is new to the Droidex',steps[0].fills===true);
}
function fusionRecipes_first(){sb.state={droids,fusion,droidex:[],owned:[]};return vm.runInContext('fusionRecipes()[0]',sb)}

console.log('');
console.log('=== a roll is offered but never promises a droid ===');
{
  const epics=droids.filter(d=>d.rarity==='EPIC'&&!d.fusion).slice(0,3).map(d=>d.name);
  const steps=chain(epics.map(n=>({name:n,variant:'BESKAR',qty:1})),[],everySquare);
  const roll=steps.find(s=>s.kind==='rarity');
  if(roll){
    ok('a roll carries no named result',roll.out===null);
    ok('and is marked uncertain',roll.sure===false);
    ok('it still says which rarity it lands in',Boolean(roll.rarity));
  } else ok('three different Epics offer a rarity roll',false,'no roll produced');
}

console.log('');
console.log('=== the pool cannot be spent twice ===');
{
  const steps=chain([{name:MYTH,variant:'DIAMOND',qty:3},{name:MYTH,variant:'RAINBOW',qty:2}]);
  const spentDiamond=steps.flatMap(s=>s.spend).filter(p=>p.variant==='DIAMOND').reduce((t,p)=>t+p.count,0);
  const spentRainbow=steps.flatMap(s=>s.spend).filter(p=>p.variant==='RAINBOW').reduce((t,p)=>t+p.count,0);
  ok('it spends the three Diamonds it had',spentDiamond===3,'spent '+spentDiamond);
  ok('and three Rainbows: the two spare plus the one it made',spentRainbow===3,'spent '+spentRainbow);
  ok('the chain terminates',steps.length<12);
}

console.log('');
console.log('=== the rows say what they cost, make, and why ===');
{
  const ui={};vm.createContext(ui);
  ui.console=console;
  vm.runInContext('const VARIANTS='+JSON.stringify(VARIANTS)+';',ui);
  for(const k of ['const escapeAttr=','const variantStep=','const variantLabel=','const variantText=',
    'const rarityClass=','const rarityLabel=','const rarityText=','const fmt=']) vm.runInContext(pick(k),ui);
  const at=src.indexOf('const fuseStep=step=>{');
  vm.runInContext(src.slice(at,src.indexOf('\n  };',at)+5),ui);
  const render=step=>{ui.step=step;return vm.runInContext('fuseStep(step)',ui)};
  const plain=h=>h.replace(/<[^>]+>/g,' ').replace(/&times;/g,'x').replace(/&middot;/g,'.').replace(/\s+/g,' ').trim();

  const first=render({step:1,sure:true,fills:true,gain:120,spend:[{name:'SNOW MOUSE',variant:'DIAMOND',count:3}],
    out:{name:'SNOW MOUSE',variant:'RAINBOW'},after:[]});
  ok('a step names what it spends',plain(first).includes('3 x SNOW MOUSE Diamond'),plain(first));
  ok('and what it makes',plain(first).includes('SNOW MOUSE Rainbow'));
  ok('a Droidex square is called out',first.includes('fills a Droidex square'));
  ok('it is marked certain',first.includes('is-sure'));

  const second=render({step:2,sure:true,fills:false,gain:340,spend:[{name:'SNOW MOUSE',variant:'RAINBOW',count:3}],
    out:{name:'SNOW MOUSE',variant:'BESKAR'},after:[0]});
  ok('a step that waits on another says so',second.includes('Waits for step 1'),plain(second));
  ok('and explains why it waits',second.includes('spends what that one makes'));

  const roll=render({step:3,sure:false,fills:false,gain:90,out:null,rarity:'LEGENDARY',variant:'BESKAR',after:[],
    spend:[{name:'LO',variant:'BESKAR',count:1},{name:'GROUNDMECH',variant:'BESKAR',count:1},{name:'AMP WALKER',variant:'BESKAR',count:1}]});
  ok('a roll is marked as one',roll.includes('is-roll'));
  ok('it promises a rarity, not a droid',plain(roll).includes('Legendary droid')&&!roll.includes('<strong>'),plain(roll));
  ok('and its figure is hedged',plain(roll).includes('about +'));
}

console.log('');
console.log('=== Fusion slots become storage only when asked ===');
{
  const st={state:{fusionAsLounge:false}};vm.createContext(st);
  vm.runInContext(pick('const loungeLikeStations='),st);
  ok('off, the Lounge and Companion are the storage',vm.runInContext("loungeLikeStations().join(',')",st)==='LOUNGE,COMPANION');
  st.state.fusionAsLounge=true;
  ok('on, Fusion joins them',vm.runInContext("loungeLikeStations().join(',')",st)==='LOUNGE,COMPANION,FUSION');
  // The helper itself is the one place the pair is allowed to be written out.
  const literals=LINES.filter(l=>l.includes("['LOUNGE','COMPANION']")&&!l.includes('const loungeLikeStations='));
  ok('no caller still hard-codes the pair',literals.length===0,literals.join(' | ').slice(0,120));
  // The storage list is read wherever a droid needs somewhere to stand: the
  // kept-by-hand candidate, the Droidex keeper, the general fallbacks and
  // staging. An exact count is brittle - what matters is that no caller
  // reimplements the pair for itself.
  ok('every caller goes through the helper',(src.match(/loungeLikeStations\(\)/g)||[]).length>=4);
}

console.log('');
console.log('=== both switches are wired at both ends ===');
{
  for(const [id,what] of [['toggleFuseFirst','fuse instead of selling'],['commandFusionAsLounge','Fusion as Lounge (deck)'],['sideFusionAsLounge','Fusion as Lounge (sidebar)']]){
    ok(what+' has a control',src.includes('id="'+id+'"'),id);
    ok(what+' has a handler',src.includes("'#"+id+"'"),id);
  }
  ok('the switch defaults to on',src.includes("localStorage.getItem('droid-archive-optimise-fuse-first')!=='0'"));
  ok('storing in Fusion defaults to off',src.includes("localStorage.getItem('droid-archive-fusion-as-lounge')==='1'"));
  ok('both ride along with a saved profile',src.includes('optimiseFuseFirst:state.optimiseFuseFirst')&&src.includes('fusionAsLounge:state.fusionAsLounge'));
}

console.log('');
console.log('=== the walkthrough agrees with the Sell list ===');
{
  for(const k of ['const variantLabel=','const rarityLabel=','const fmt=']) vm.runInContext(pick(k),sb);
  sb.soldInsteadOfFusion=()=>[];
  vm.runInContext(grab('function optimiseFusionChain('),sb);
  vm.runInContext(grab('function withFusionSteps('),sb);
  sb.state={droids,fusion,droidex:[],owned:[],optimiseFuseFirst:true};
  sb.projected={sell:[{name:MYTH,variant:'DIAMOND',qty:3},{name:MYTH,variant:'RAINBOW',qty:2}],placed:[]};
  const input=[
    {type:'sell',unit:{name:MYTH,variant:'DIAMOND'},text:'Sell '+MYTH+' Diamond from Battle (upstairs).'},
    {type:'sell',unit:{name:MYTH,variant:'DIAMOND'},text:'Sell '+MYTH+' Diamond from Worker.'},
    {type:'sell',unit:{name:MYTH,variant:'DIAMOND'},text:'Sell '+MYTH+' Diamond in Lounge.'},
    {type:'sell',unit:{name:MYTH,variant:'RAINBOW'},text:'Sell '+MYTH+' Rainbow from Battle.'},
    {type:'sell',unit:{name:MYTH,variant:'RAINBOW'},text:'Sell '+MYTH+' Rainbow from Worker.'},
    {type:'sell',unit:{name:'GONK',variant:'DEFAULT'},text:'Sell GONK Default from Worker.'},
    {type:'move',text:'Send B2-RP Beskar to the Lounge.'}];
  sb.steps=input;
  const out=vm.runInContext('withFusionSteps(steps,projected)',sb);
  const fuseIn=out.filter(s=>s.type==='fuse-in'), fuses=out.filter(s=>s.type==='fuse');
  ok('the five droids the chain wants stop being sold',fuseIn.length===5,fuseIn.length+' rewritten');
  ok('and are sent to the Fusion room instead',fuseIn.every(s=>s.text.includes('to the Fusion room instead of selling')));
  ok('their origin survives the rewrite',fuseIn[0].text.includes('from Battle (upstairs)'),fuseIn[0].text);
  ok('a droid the chain does not want is still sold',out.some(s=>s.type==='sell'&&s.text.includes('GONK')));
  ok('steps that were never sells are untouched',out.some(s=>s.type==='move'));
  ok('both fusions are added',fuses.length===2,fuses.length+' fuse steps');
  ok('the first says what it makes',fuses[0].text.includes('This makes '+MYTH+' Rainbow'),fuses[0].text);
  ok('a Droidex square is given as the reason',fuses[0].text.includes('Droidex square you do not have'));
  ok('the dependent one says it must wait',fuses[1].text.includes('after the fusion above'),fuses[1].text);
  ok('a fuse step carries the droid it makes, for its thumbnail',fuses[0].unit&&fuses[0].unit.name===MYTH);
  sb.state.optimiseFuseFirst=false;
  sb.steps=input;
  const off=vm.runInContext('withFusionSteps(steps,projected)',sb);
  ok('with the switch off the plan is left exactly alone',off.length===input.length&&off.every(s=>s.type!=='fuse'&&s.type!=='fuse-in'));
  sb.state.optimiseFuseFirst=true;
  sb.projected={sell:[],placed:[]};sb.steps=input;
  ok('an empty Sell list changes nothing',vm.runInContext('withFusionSteps(steps,projected)',sb).length===input.length);
}

console.log('=== fusion feedback regressions ===');
{
  let excluded=[];
  sb.soldInsteadOfFusion=()=>excluded;
  sb.state={droids,fusion,droidex:[],owned:[],optimiseFuseFirst:true};
  const units=Array.from({length:6},(_,source)=>({name:MYTH,variant:'DIAMOND',qty:6,source,unit:0,station:'WORKER'}));
  const moves=units.map(unit=>({type:'sell',kind:'sell',unit,from:unit.station,at:unit.station,text:`Sell ${unit.name} Diamond from ${unit.station}.`}));
  const run=(rows=units,list=moves)=>{sb.projected={sell:rows,placed:[]};sb.steps=list;return vm.runInContext('withFusionSteps(steps,projected)',sb)};
  const result=run();
  let table=0,batches=0;
  for(const step of result){
    if(step.type==='fuse-in'||step.type==='fuse-held')table++;
    if(step.type==='fuse-result')table+=step.unit.count;
    ok('table never holds more than three inputs',table<=3);
    if(step.type==='fuse'){ok('a fusion consumes exactly three inputs',table===3);table=0;batches++}
  }
  ok('six spare droids produce two separate batches',batches===2);
  ok('every fusion has its room label',result.filter(s=>s.type==='fuse').every(s=>s.at==='FUSION'));
  excluded=['0:0'];
  const sold=run();
  ok('Sell keeps the selected copy out of all fusions',sold.some(s=>s.type==='sell'&&s.unit.source===0)&&!sold.some(s=>s.type==='fuse-in'&&s.unit.source===0));
  ok('remaining copies are recalculated into one batch',sold.filter(s=>s.type==='fuse').length===1);
  excluded=[];
  const held=units.slice(0,3).map((u,i)=>({...u,station:i<2?'FUSION':'WORKER'}));
  const heldMoves=held.map(unit=>({type:'sell',unit,from:unit.station,at:unit.station,text:`Sell ${unit.name} Diamond from ${unit.station}.`}));
  const tablePlan=run(held,heldMoves);
  ok('two existing table droids are left there',tablePlan.filter(s=>s.type==='fuse-held').length===2);
  ok('only the missing third droid is sent to Fusion',tablePlan.filter(s=>s.type==='fuse-in').length===1);
  ok('no droid is sent from Fusion to Fusion',!tablePlan.some(s=>s.type==='fuse-in'&&s.from==='FUSION'));
  sb.baseP={placed:[{name:'GONK',variant:'DEFAULT',station:'FUSION',source:99,unit:0}]};
  ok('a kept table occupant is never consumed or overfilled',vm.runInContext('withFusionSteps(steps,projected,baseP)',sb).every(s=>s.type!=='fuse'));
  const chainUnits=[...units.slice(0,3),...units.slice(3,5).map(u=>({...u,variant:'RAINBOW'}))];
  const chained=run(chainUnits,chainUnits.map(unit=>({type:'sell',unit,from:'WORKER',at:'WORKER',text:`Sell ${unit.name} ${unit.variant} from Worker.`})));
  ok('a later batch explicitly loads the earlier result',chained.some(s=>s.type==='fuse-result'&&s.unit.variant==='RAINBOW'));
  ok('the earlier result is made before it is loaded',chained.findIndex(s=>s.type==='fuse')<chained.findIndex(s=>s.type==='fuse-result'));
  sb.steps=chained;vm.runInContext(grab('function optimiseVisits('),sb);
  ok('route grouping preserves the batch order',JSON.stringify(vm.runInContext('optimiseVisits(steps).flatMap(v=>v.steps)',sb))===JSON.stringify(chained));
}

console.log('');
console.log(fails?fails+' failed':'all passed');
process.exit(fails?1:0);
