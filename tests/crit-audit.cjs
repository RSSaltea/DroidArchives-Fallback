const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('app.js','utf8'),shop=JSON.parse(fs.readFileSync('data/nova-shop.json','utf8'));
const state={rebirth:35,novaShop:shop};let perks=0;
const context=vm.createContext({state,Math,critSetting:()=>perks,novaUpgrade:id=>shop.upgrades.find(u=>u.id===id),localStorage:{getItem:()=>String(perks)}});
vm.runInContext(src.slice(src.indexOf('const PICKAXE_SECONDS_PER_LEVEL='),src.indexOf('// Pickaxe Mastery only decides')),context);
const start=src.indexOf('const novaLevelCost=');const end=src.indexOf('\n}',src.indexOf('function critUpgradeOptions',start))+2;vm.runInContext(src.slice(start,end),context);
const run=s=>vm.runInContext(s,context),near=(a,b)=>assert(Math.abs(a-b)<1e-10,`${a} != ${b}`);
// Independent exhaustive branching of the game rolls, including early failure.
function enumerate(chance,amount,cap){let total=0;function visit(count,prob){if(count===cap){total+=prob*(1+count*amount);return;}const p=Math.min(1,chance/2**count);total+=prob*(1-p)*(1+count*amount);visit(count+1,prob*p);}visit(0,1);return total;}
for(const chance of [0,.01,.51,.99,1,1.01,1.06,1.16,1.99,2,2.01,3.16])for(const cap of [1,2,3,4,5])for(const amount of [.5,1.8,2.1,6.3])near(run(`critMultiplier(${chance},${amount},${cap})`),enumerate(chance,amount,cap));
near(run('critMultiplier(1.01,1.8,2)'),3.709);
near(run('critMultiplier(1.06,1.8,2)'),3.754);
near(run('critMultiplier(1.01,1.9,2)'),3.8595);
near(run('critMultiplier(1.01,1.8,3)'),3.9385225);
near(run('critMultiplier(2,1,2)'),3);
near(run('critMultiplier(3,1,1)'),2);
near(run('critRollBreakdown(1.01,3)[2].reach'),.1275125);
const input='{chanceLevel:10,amountLevel:8,multiLevel:1,chopper:true,pickaxe:29}';
near(run(`critProfile(${input}).perHit`),133.524);
for(const on of [0,1]){perks=on;const options=run(`critUpgradeOptions(${input})`);assert.equal(options[0].id,on?'multi-crit':'critical-amount');console.log(on?'Rebirth perks ON':'Rebirth perks OFF',options.map(o=>({id:o.id,gain:o.gain*100,cost:o.cost,novaPerPercent:o.cost/(o.gain*100)})));}
perks=0;near(run(`critProfile({...${input},boost:2}).perHit`),267.048);near(run('pickaxeHitSeconds(29)'),36);
console.log('PASS 240 exhaustive roll comparisons, overflow thresholds, screenshot values, rebirth rankings and temporary boost');
