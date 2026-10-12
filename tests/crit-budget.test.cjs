const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const shop=JSON.parse(fs.readFileSync('data/nova-shop.json','utf8'));
const upgrades=Object.fromEntries([['chance','critical-chance'],['amount','critical-amount'],['multi','multi-crit']].map(([key,id])=>[key,shop.upgrades.find(u=>u.id===id)]));
const ready=import('../crit-budget.js');
const price=(key,from,to)=>{let cost=0;const u=upgrades[key];for(let l=from+1;l<=to;l++)cost+=u.levels.find(row=>row.level===l)?.cost??u.costBase+u.costScale*(l-1);return cost;};
// Independent expected-value sum, including the probability of reaching each roll.
const scoreWith=(chanceBonus,amountBonus)=>levels=>{let reach=1,sum=1;for(let k=0;k<=levels.multi;k++){reach*=Math.min(1,(.01+.05*levels.chance+chanceBonus)/2**k);sum+=reach*(.5+.1*levels.amount+amountBonus);}return sum;};
function exhaustive(budget,owned,score){
 const rows=key=>{const out=[];for(let l=owned[key];l<=Math.max(owned[key],upgrades[key].uncapped?10000:upgrades[key].levels.length);l++){const cost=price(key,owned[key],l);if(cost>budget)break;out.push({level:l,cost});}return out;};
 const chances=rows('chance'),amounts=rows('amount'),multis=rows('multi');let best={score:score(owned),cost:0};
 for(const c of chances)for(const a of amounts)for(const m of multis){const cost=c.cost+a.cost+m.cost;if(cost>budget||m.level>owned.multi&&c.level<4)continue;const value=score({chance:c.level,amount:a.level,multi:m.level});if(value>best.score||value===best.score&&cost<best.cost)best={score:value,cost};}
 return best;
}
test('whole-plan search matches exhaustive combinations across budgets, bonuses and owned levels',async()=>{
 const {suggestCritBudget}=await ready;
 for(const owned of [{chance:0,amount:0,multi:0},{chance:3,amount:3,multi:0},{chance:10,amount:10,multi:2},{chance:51,amount:55,multi:4}])
 for(const budget of [0,1,59,60,400,810,1390,3500,12000])for(const bonus of [[0,0],[.5,.5],[.65,1.15]]){
  const score=scoreWith(...bonus),actual=suggestCritBudget({budget,owned,upgrades,score}),expected=exhaustive(budget,owned,score);
  assert.equal(actual.score,expected.score,JSON.stringify({owned,budget,bonus,actual,expected}));assert.equal(actual.cost,expected.cost);
  assert(actual.cost<=budget);assert.equal(actual.remaining,budget-actual.cost);
  assert.equal(actual.cost,Object.keys(owned).reduce((sum,key)=>sum+price(key,owned[key],actual.levels[key]),0));
 }
});
test('free preview cannot change owned data; ties save crystals; unusable budgets become zero',async()=>{
 const {suggestCritBudget}=await ready,owned=Object.freeze({chance:0,amount:0,multi:0});
 const result=suggestCritBudget({budget:3500,owned,upgrades,score:()=>1});assert.deepEqual(result.levels,owned);assert.equal(result.cost,0);assert.equal(result.remaining,3500);
 for(const budget of [-5,NaN,Infinity,'']){const p=suggestCritBudget({budget,owned,upgrades,score:scoreWith(0,0)});assert.deepEqual(p.levels,owned);assert.equal(p.cost,0);}
});
test('large budgets stay within supported planner levels and keep unused crystals',async()=>{
 const {suggestCritBudget}=await ready;const result=suggestCritBudget({budget:Number.MAX_SAFE_INTEGER,owned:{chance:50,amount:50,multi:0},upgrades,score:scoreWith(.65,1.15)});
 assert.equal(result.levels.amount,10000);assert.equal(result.levels.multi,4);assert(result.levels.chance<10000,'do not spend beyond guaranteed crit rolls');assert(result.remaining>0);
});
