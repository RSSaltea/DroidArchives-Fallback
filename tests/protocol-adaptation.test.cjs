const {test}=require('node:test'),assert=require('node:assert/strict');
const droids=require('../data/droids.json');
const unit=(name,variant,station)=>({name,variant,station,slot:0});
const c3=unit('C-3PO','DEFAULT','PROTOCOL_WORKER_CREDITS');
const kl=unit('KL-NK','KYBER_YELLOW','PROTOCOL_BATTLE_CREDITS');
test('adaptation identifies its source and only accepts same-role station bonuses',async()=>{
 const {protocolBonusDetails}=await import('../droid-rules.js');
 const d=droids.find(d=>d.name===c3.name),get=rows=>protocolBonusDetails(d,'DEFAULT','CREDITS',rows,droids);
 assert.deepEqual(get([kl,c3]),{base:200,best:225,effective:270,source:kl});
 for(const station of ['LOUNGE','COMPANION','WORKER','BUILD','PROTOCOL_BATTLE_CRAFTING'])assert.equal(get([{...kl,station},c3]).effective,200);
 assert.equal(get([c3,{...c3,station:'PROTOCOL_BATTLE_CREDITS'}]).effective,200);
 assert.equal(get([{...kl,variant:'KYBER_PURPLE'}]).effective,200);
});
test('crafting threshold is strict; source and subject are never mutated',async()=>{
 const {protocolBonusDetails}=await import('../droid-rules.js');
 const d=droids.find(d=>d.name===c3.name),source={name:'Fixture',type:'PROTOCOL',rarity:'MYTHIC',variants:{DEFAULT:{protocolCraftingBonusPercent:5000}}};
 const rows=[unit('Fixture','DEFAULT','PROTOCOL_BATTLE_CRAFTING')],catalogue=[d,source],before=JSON.stringify({rows,catalogue});
 assert.equal(protocolBonusDetails(d,'DEFAULT','CRAFTING',rows,catalogue).effective,6000);
 assert.equal(JSON.stringify({rows,catalogue}),before);
 source.variants.DEFAULT.protocolCraftingBonusPercent=4000;assert.equal(protocolBonusDetails(d,'DEFAULT','CRAFTING',rows,catalogue).effective,4000);
});
test('scrap comparison places boosted Iconic on the higher-income region and preserves the donor',async()=>{
 const {bestProtocolCredits}=await import('../protocol-credit-plan.js');
 const regions={WORKER:{beforeBonus:100},BATTLE:{beforeBonus:10}},open=['WORKER','BATTLE'];
 const plan=bestProtocolCredits({pool:[kl,c3],open,regions,droids});
 assert.equal(plan.income,402.5);assert.equal(plan.placed[0].name,'C-3PO');
 assert.equal(bestProtocolCredits({pool:[c3],open,regions,droids}).income,310);
 const fixed=bestProtocolCredits({pool:[kl],open:['BATTLE'],fixed:[c3],regions,droids});assert.equal(fixed.income,402.5);
 assert.equal(bestProtocolCredits({pool:[],open:[],fixed:[c3],regions,droids}).income,310);
});
test('UI explains region multiplier rather than promising a companion or trait increase',async()=>{
 const {protocolAdaptationHtml,protocolAdaptationText}=await import('../protocol-guidance.js');
 const d=droids.find(d=>d.name===c3.name),label=()=>'<Battle>';
 const html=protocolAdaptationHtml(d,'DEFAULT',[kl],droids,label);
 assert.match(html,/225/);assert.match(html,/270/);assert.match(html,/&lt;Battle&gt;/);assert.match(html,/does not raise the Iconic's companion perk/);
 assert.match(protocolAdaptationText(d,'DEFAULT','CRAFTING',[kl],droids,label),/4,000% base bonus/);
});
test('credit subset selection agrees with exhaustive assignments, including multiple Iconics',async()=>{
 const {bestProtocolCredits}=await import('../protocol-credit-plan.js'),{placedProtocolBonus}=await import('../droid-rules.js');
 const pool=[c3,unit('SCOURGE PRIME','DEFAULT'),kl,...['KYBER_PURPLE','STELLAR','GALACTIC','BESKAR'].map(v=>unit('KL-NK',v))];
 const regions={WORKER:{beforeBonus:100},ASTROMECH:{beforeBonus:40},BATTLE:{beforeBonus:10}},open=Object.keys(regions);
 const before=JSON.stringify(pool);let expected=0;
 const enumerate=(picked,remaining)=>{
  if(picked.length===open.length){
   const placed=picked.map((u,i)=>({...u,station:`PROTOCOL_${open[i]}_CREDITS`}));
   expected=Math.max(expected,placed.reduce((sum,u,i)=>sum+regions[open[i]].beforeBonus*(1+placedProtocolBonus(droids.find(d=>d.name===u.name),u.variant,'CREDITS',placed,droids)/100),0));return;
  }
  remaining.forEach((u,i)=>enumerate([...picked,u],remaining.filter((_,j)=>i!==j)));
 };enumerate([],pool);
 const plan=bestProtocolCredits({pool,open,regions,droids});assert.equal(plan.income,expected);assert.equal(JSON.stringify(pool),before);
});
