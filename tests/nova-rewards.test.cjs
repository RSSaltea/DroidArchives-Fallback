const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const shop=require('../data/nova-shop.json');
const context=vm.createContext({state:{novaShop:shop}});
vm.runInContext(src.slice(src.indexOf('const NOVA_ICON='),src.indexOf('function baseRebirthSummaryHtml()')),context);
const totals=n=>context.novaRebirthTotals(n);

test('all supplied regular rewards and cumulative totals match the completed rank',()=>{
  const regular=[5,10,15,20,25,40,50,60,70,80,120,140,160,180,200,300];
  const running=[5,15,30,50,75,115,165,225,295,375,495,635,795,975,1175,1475];
  const srb=[79,92,106,121,137,154,172,191,211,232,254,277,301,326,352,379];
  for(let i=0;i<regular.length;i++){
    const r=totals(i+20);
    assert.equal(r.regularNovaCrystals,regular[i]);
    assert.equal(r.regularTotal,running[i]);
    assert.equal(r.superRebirthNova,srb[i]);
    assert.equal(r.totalNovaCrystals,running[i]+srb[i]);
  }
  assert.equal(totals(19).regularTotal,0);
  assert.equal(new Set(shop.rebirthRewards.map(r=>r.rebirth)).size,shop.rebirthRewards.length);
});

test('Rank 31-35 screenshots offer the SRB payout for the current, preceding rank',()=>{
  [254,277,301,326,352].forEach((payout,i)=>assert.equal(totals(i+30).superRebirthNova,payout));
  assert.equal(totals(35).superRebirthNova,379);
});

test('ranks 31-35 show the supplied credit and XP percentages',()=>{
  const table=context.novaRebirthRewardsHtml();
  [[31,554,2770],[32,602,3010],[33,652,3260],[34,704,3520],[35,758,3790]].forEach(([rank,credits,xp])=>{
    const reward=shop.rebirthRewards.find(r=>r.rebirth===rank);
    assert.equal(reward.creditMultPercent,credits);
    assert.equal(reward.xpMultPercent,xp);
    const row=table.match(new RegExp(`<tr data-nova-rebirth="${rank}">[^]*?</tr>`))[0];
    assert(row.includes(`<td>${credits}%</td><td>${xp.toLocaleString('en-US')}%</td>`));
    assert.match(context.rebirthRewardHtml(rank),new RegExp(`SRB \\+${credits}% credits`));
  });
});

test('full-run planner includes regular earnings once and rounds up complete runs',()=>{
  const row=(target,rank)=>context.novaRebirthRouteOptions(target).find(r=>r.rebirth===rank);
  assert.equal(row(1854,35).runs,1);
  assert.equal(row(1855,35).runs,2);
  assert.equal(row(1854,30).runs,3);
  assert.equal(row(12,12).runs,2);
  assert.equal(row(0,35).runs,0);
  assert.equal(row(1854,35).totalNovaCrystals,1854);
});

test('Outlook separates rewards and the Nova table shows exact totals',()=>{
  const outlook=context.rebirthRewardHtml(31);
  assert.match(outlook,/On rebirth[^]*140 Nova Crystals/);
  assert.match(outlook,/On Super Rebirth[^]*277 Nova Crystals/);
  assert.doesNotMatch(outlook,/undefined|NaN/);
  assert.doesNotMatch(context.rebirthRewardHtml(19),/class="rebirth-nova-reward regular"/);
  const table=context.novaRebirthRewardsHtml();
  assert.match(table,/34 &rarr; 35<\/td><td>300<\/td><td>1,475<\/td><td>379<\/td><td><strong>1,854/);
  assert.doesNotMatch(table,/undefined|NaN/);
});
