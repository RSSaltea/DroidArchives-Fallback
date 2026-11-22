const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('app.js','utf8'),shop=JSON.parse(fs.readFileSync('data/nova-shop.json','utf8'));
const context=vm.createContext({Math,fmt:String,state:{rebirth:0,novaShop:shop},critSetting:()=>0,novaUpgrade:id=>shop.upgrades.find(u=>u.id===id)});
vm.runInContext(fs.readFileSync('nova-levels.js','utf8').replaceAll('export function','function'),context);
vm.runInContext(src.slice(src.indexOf('const PICKAXE_SECONDS_PER_LEVEL='),src.indexOf('// Pickaxe Mastery only decides')),context);
vm.runInContext(src.slice(src.indexOf('const novaLevelCost='),src.indexOf('// Where the optimiser may park')),context);
const run=(expression)=>vm.runInContext(expression,context),near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
// Enumerate all success/failure paths independently, including crit on each Echo.
function echoDamage(p,cap,ratio,critChance,critAmount){
 let expected=0;
 function branch(depth,probability,damage){
  if(depth===cap){expected+=probability*damage;return;}
  const trigger=p/(2**depth),q=Math.min(1,critChance);
  expected+=probability*(1-trigger)*damage;
  branch(depth+1,probability*trigger*(1-q),damage+ratio);
  branch(depth+1,probability*trigger*q,damage+ratio*(1+critAmount));
 }
 branch(0,1,0);return expected;
}
test('Echo expected value matches independent branching, including overflow and Chopper',()=>{
 for(const chanceLevel of [0,10,40])for(const amountLevel of [0,8,100])for(const echoChanceLevel of [0,1,3,5])for(const echoAmountLevel of [0,1,5,51])for(const echoCapLevel of [0,1,4])for(const traitMulti of [0,1]){
  const input={chanceLevel,amountLevel,multiLevel:4,echoChanceLevel,echoAmountLevel,echoCapLevel,traitMulti,chopper:true,pickaxe:29};
  const p=run(`critProfile(${JSON.stringify(input)})`);
  near(p.echoMultiplier,echoDamage(echoChanceLevel/10,echoCapLevel+1,(echoAmountLevel+1)/10,p.chance,p.amount));
  near(p.perHit,p.base*(p.primaryMultiplier+p.echoMultiplier));
 }
 const base={chanceLevel:10,amountLevel:8,multiLevel:1,chopper:true,echoChanceLevel:3,echoAmountLevel:5,echoCapLevel:1};
 const plain=run(`critProfile(${JSON.stringify(base)})`),trait=run(`critProfile(${JSON.stringify({...base,traitMulti:1})})`);
 near(plain.echoCount,.345);near(plain.echoRatio,.6);near(plain.echoMultiplier,trait.echoMultiplier);
 assert(trait.primaryMultiplier>plain.primaryMultiplier);
});
test('costs, prerequisites, caps and bundle targets match the current shop',()=>{
 assert.deepEqual(shop.upgrades.find(u=>u.id==='echo-strike-chance').levels.map(x=>x.cost),[250,500,900,1450,2200]);
 assert.deepEqual(shop.upgrades.find(u=>u.id==='echo-strike-cap').levels.map(x=>x.cost),[500,1000,1500,2000]);
 const amount=shop.upgrades.find(u=>u.id==='echo-strike-amount');
 near(run(`novaTotalCost(${JSON.stringify(amount)},5)`),2750);
 assert.equal(run(`novaLevelRow(${JSON.stringify(amount)},51).reward`),'520% of pre-crit hit amount');
 const options=run('critUpgradeOptions({chanceLevel:10,amountLevel:8,multiLevel:1,chopper:true})');
 assert.equal(options[0].id,'critical-amount');
 assert(options.find(x=>x.id==='echo-strike-amount').locked);
 assert(options.find(x=>x.id==='echo-strike-cap').locked);
 assert(!run('critUpgradeOptions({chanceLevel:10,amountLevel:8,multiLevel:4,echoChanceLevel:5,echoCapLevel:4,echoAmountLevel:50})').some(x=>['echo-strike-chance','echo-strike-cap','multi-crit'].includes(x.id)));
 const bundle=JSON.parse(fs.readFileSync('data/cantina-shop.json','utf8')).items.find(x=>x.id==='echo-strike-pack');
 assert.equal(bundle.vbucksCost,3500);assert.deepEqual(bundle.novaLevels,{'echo-strike-chance':3,'echo-strike-amount':5,'echo-strike-cap':1});
 assert.equal(Object.entries(bundle.novaLevels).reduce((sum,[id,level])=>sum+run(`novaTotalCost(${JSON.stringify(shop.upgrades.find(u=>u.id===id))},${level})`),0),4900);
});
test('budget suggestions are affordable, respect unlocks, preserve owned levels and handle zero',()=>{
 const owned={chanceLevel:10,amountLevel:8,multiLevel:1,chopper:true,echoChanceLevel:0,echoAmountLevel:0,echoCapLevel:0};
 for(const budget of [0,1,249,250,400,3500,1000000]){
  const plan=run(`critBudgetPlan(${JSON.stringify(owned)},${budget})`);
  assert(plan.spent<=budget);assert.equal(plan.spent,plan.steps.reduce((sum,s)=>sum+s.cost,0));assert.equal(plan.remaining,budget-plan.spent);
  let current={...owned};
  for(const step of plan.steps){
   if(['echo-strike-amount','echo-strike-cap'].includes(step.id))assert(current.echoChanceLevel>=1);
   if(step.id==='multi-crit')assert(current.chanceLevel>=4);
   current={...current,...step.next};
  }
  for(const key of Object.keys(owned).filter(k=>k.endsWith('Level')))assert(plan.levels[key]>=owned[key]);
 }
 assert.equal(run(`critBudgetPlan(${JSON.stringify(owned)},0).steps.length`),0);
 assert.equal(run('critBudgetPlan({chanceLevel:0,amountLevel:0,multiLevel:0},30).steps.length'),0);
});

test('Charge is unavailable with canonical thresholds, prices and icon',()=>{
 const charge=shop.upgrades.find(u=>u.id==='echo-strike-charge');
 assert.equal(charge.comingSoon,true);
 assert.deepEqual(charge.levels.map(x=>x.chargeHits),[10,5,3]);
 assert.deepEqual(charge.levels.map(x=>x.cost),[200,1000,2000]);
 assert.equal(run(`novaTotalCost(${JSON.stringify(charge)},3)`),3200);
 assert(fs.existsSync(charge.icon));
});

test('Charge averages follow accumulated Echo counts and only multiply the charged hit across depots',()=>{
 const input={chanceLevel:10,amountLevel:8,multiLevel:4,traitMulti:1,chopper:true,pickaxe:29,echoChanceLevel:5,echoCapLevel:4};
 for(const echoChargeLevel of [1,2,3]){
  const one=run(`critProfile(${JSON.stringify({...input,echoChargeLevel})})`);
  const three=run(`critProfile(${JSON.stringify({...input,echoChargeLevel,activeDepots:3})})`);
  const threshold=[10,5,3][echoChargeLevel-1];
  // Independent long-run counter: max-rank Echo has 0.641632... successful
  // Echoes per swing. After many swings only the unfinished charge is lost.
  const echoesPerSwing=.5+.5*.25+.5*.25*.125+.5*.25*.125*.0625+.5*.25*.125*.0625*.03125;
  const swings=10000000,charges=Math.floor(swings*echoesPerSwing/threshold);
  const expected=charges/swings*(1+one.amount*6);
  assert(Math.abs(one.chargeMultiplier-expected)<.000002);
  near(three.chargeMultiplier,one.chargeMultiplier*3);
  near(three.primaryMultiplier,one.primaryMultiplier);near(three.echoMultiplier,one.echoMultiplier);
  near(three.perHit-one.perHit,2*one.chargeMultiplier*one.base);
  near(run(`critProfile(${JSON.stringify({...input,echoChargeLevel,echoAmountLevel:50})}).chargeMultiplier`),one.chargeMultiplier);
  near(run(`critProfile(${JSON.stringify({...input,echoChargeLevel,partyMultiplier:2})}).perHit`),one.perHit*2);
 }
 near(run('critProfile({echoChargeLevel:3}).chargeMultiplier'),0);
 near(run('critProfile({echoChanceLevel:5,echoChargeLevel:3,target:"fusion",activeDepots:3}).chargeMultiplier'),0);
 near(run('critProfile({echoChanceLevel:5,echoChargeLevel:0}).chargeMultiplier'),0);
});

test('Charge previews affect comparisons without being recommended for purchase',()=>{
 const input={chanceLevel:20,amountLevel:20,multiLevel:4,echoChanceLevel:5,echoAmountLevel:5,echoCapLevel:4,echoChargeLevel:1,activeDepots:3};
 const options=run(`critUpgradeOptions(${JSON.stringify(input)})`),charge=options.find(o=>o.id==='echo-strike-charge');
 assert(charge.gain>0);assert(charge.locked);assert(charge.unavailable);
 const plan=run(`critBudgetPlan(${JSON.stringify(input)},100000)`);
 assert(plan.steps.length>0);assert(!plan.steps.some(x=>x.id==='echo-strike-charge'));
 assert.equal(plan.levels.echoChargeLevel,1);assert(plan.spent<=100000);
 const amount=options.find(o=>o.id==='critical-amount');
 near(amount.gain,run(`critProfile(${JSON.stringify({...input,amountLevel:21})}).multiplier/critProfile(${JSON.stringify(input)}).multiplier-1`));
});
