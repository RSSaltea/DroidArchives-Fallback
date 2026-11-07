const {test}=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../group-trading.js');
const rank=v=>['DEFAULT','BESKAR','GALACTIC','SCOURGE','KYBER_GREEN'].indexOf(v);
const unit=(source,variant='BESKAR',station='LOUNGE',extra={})=>({name:'R7',source,unit:0,variant,station,...extra});
const need=(name='R7',at=1,variant='BESKAR')=>({droidName:name,at,variant});
const profile=(key,units=[],needs=[],extra={})=>({key,ownerId:key,groups:['g'],units,needs,ready:()=>false,settings:{},...extra});
const rules={names:name=>name==='FUSION'?['R7','GONK']:[name],rank,ready:(have,want)=>want==='KYBER_ACTIVE'?have==='KYBER_GREEN':rank(have)>=rank(want),working:u=>u.station==='WORKER',blocked:u=>u.hasBeenTraded||u.lockedSlot||u.building,loss:(p,keys)=>({percent:[...keys].reduce((n,k)=>n+(p.units.find(u=>`${u.source}:${u.unit}`===k)?.cost||0),0),credits:0})};
test('highest own future copy kept, working duplicate kept before Lounge; one donation per unmet need',async()=>{
 const {findGroupTrades}=await load();const donor=profile('a',[unit(0,'SCOURGE','WORKER'),unit(1,'SCOURGE'),unit(2)], [need('R7',38)]);
 const receiver=profile('b',[],[need(),need('R7',2)]);const matches=findGroupTrades([donor,receiver],rules);
 assert.equal(matches.length,1);assert.equal(matches[0].unit.source,2);
 donor.units.pop();assert.equal(findGroupTrades([donor,receiver],rules)[0].unit.source,1);
 donor.units.splice(1);assert.equal(findGroupTrades([donor,receiver],rules).length,0);
});
test('working settings and cumulative income cap; copy cannot be promised twice',async()=>{
 const {findGroupTrades}=await load();const donor=profile('a',[unit(0,'BESKAR','WORKER',{cost:4}),unit(1,'BESKAR','WORKER',{cost:4})]);const peers=[profile('b',[],[need()]),profile('c',[],[need()])];
 assert.equal(findGroupTrades([donor,...peers],rules).length,0);
 donor.settings={allowWorking:true,maxLossPercent:5};assert.equal(findGroupTrades([donor,...peers],rules).length,1);
 donor.settings.maxLossPercent=10;assert.equal(findGroupTrades([donor,...peers],rules).length,2);
 donor.units.pop();assert.equal(findGroupTrades([donor,...peers],rules).length,1);
 donor.settings.enabled=false;assert.equal(findGroupTrades([donor,...peers],rules).length,0);
});
test('traded, locked, unfinished, unrelated groups, same owner, satisfied requests excluded',async()=>{
 const {findGroupTrades}=await load();const receiver=profile('b',[],[need()]);
 for(const flag of ['hasBeenTraded','lockedSlot','building'])assert.equal(findGroupTrades([profile('a',[unit(0,'BESKAR','LOUNGE',{[flag]:true})]),receiver],rules).length,0);
 const donor=profile('a',[unit(0)]);assert.equal(findGroupTrades([donor,{...receiver,groups:['other']}],rules).length,0);
 assert.equal(findGroupTrades([donor,{...receiver,ownerId:'a'}],rules).length,0);
 assert.equal(findGroupTrades([donor,{...receiver,ready:()=>true}],rules).length,0);
});
test('fusion components and active Kyber match future requirements',async()=>{
 const {findGroupTrades}=await load();const donor=profile('a',[{...unit(0),name:'FUSION'}]);const receiver=profile('b',[],[need('R7'),need('GONK')]);
 assert.equal(findGroupTrades([donor,receiver],rules).length,1);
 const kyber=profile('b',[],[need('R7',1,'KYBER_ACTIVE')]);assert.equal(findGroupTrades([profile('a',[unit(0,'SCOURGE')]),kyber],rules).length,0);
 assert.equal(findGroupTrades([profile('a',[unit(0,'KYBER_GREEN')]),kyber],rules).length,1);
});
