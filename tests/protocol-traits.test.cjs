const {test}=require('node:test'),assert=require('node:assert/strict');
const {compareProtocolTraits}=require('../protocol-traits.js');
const {traitBadgeHtml,traitBadgeSvg,recordedTrait}=require('../trait-badges.js');
const fixture={multiplier:24,removedCreditBonus:12,protocolPercent:1200,incomePerMultiplier:100,seconds:1};
test('1200% ties at a 12x baseline; recommendations flip either side',()=>{
  const tie=compareProtocolTraits(fixture);
  assert.equal(tie.winner,'tie');assert.equal(tie.overclocked.income,3600);assert.equal(tie.specialist.income,2400);
  assert.equal(compareProtocolTraits({...fixture,multiplier:22}).winner,'overclocked');
  assert.equal(compareProtocolTraits({...fixture,multiplier:32}).winner,'specialist');
});
test('an already equipped Overclocked copy is removed exactly once',()=>{
  assert.deepEqual(compareProtocolTraits({...fixture,multiplier:36,removedCreditBonus:24}),compareProtocolTraits(fixture));
});
test('shared credit event boosts are separated before subtracting companions',()=>{
  const boosted=compareProtocolTraits({...fixture,multiplier:48,creditBoost:2});
  assert.equal(boosted.winner,'tie');assert.equal(boosted.overclocked.multiplier,72);
});
test('another Scrap Specialist reduces the marginal benefit of adding a second',()=>{
  const result=compareProtocolTraits({...fixture,otherScrapBonus:.5});
  assert.equal(result.winner,'overclocked');assert.equal(result.specialist.hit,4800);assert.equal(result.overclocked.hit,5400);
});
test('fixed Hive income benefits from Scrap Specialist but not extra credit multiplier',()=>{
  const result=compareProtocolTraits({...fixture,fixedIncome:1000});
  assert.equal(result.overclocked.income,4600);assert.equal(result.specialist.income,3400);assert.equal(result.winner,'specialist');
});
test('station reward floors can favour Scrap Specialist despite an income gain',()=>{
  const result=compareProtocolTraits({...fixture,multiplier:22,incomePerMultiplier:0,stationLevel:100});
  assert.equal(result.winner,'specialist');assert.equal(result.specialist.hit,401*1.5);
});
test('party bonus scales payouts, never passive income',()=>{
  const normal=compareProtocolTraits(fixture),party=compareProtocolTraits({...fixture,partyMultiplier:1.5});
  assert.equal(party.overclocked.income,normal.overclocked.income);assert.equal(party.overclocked.break,normal.overclocked.break*1.5);
});
test('missing and inconsistent inputs do not invent a winner',()=>{
  for(const changed of [{multiplier:1},{multiplier:5},{creditBoost:0},{protocolPercent:0},{incomePerMultiplier:0},{seconds:0}]){
    const result=compareProtocolTraits({...fixture,...changed});assert(result.pending);assert.equal(result.winner,undefined);
  }
});
test('badges describe the individual trait and tier, including inactive copies',()=>{
  const unit={station:'LOUNGE',trait:{id:7,tier:'Rainbow'}};
  assert.match(traitBadgeHtml(unit),/assets\/traits\/7.png/);assert.match(recordedTrait(unit).label,/50%/);
  assert.match(traitBadgeSvg(unit),/trait-tier-rainbow/);
  for(const other of [{},{trait:{id:7,tier:'Stellar'}},{...unit,blueprint:true}])assert.equal(traitBadgeHtml(other),'');
});
