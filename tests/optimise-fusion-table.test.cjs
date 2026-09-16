const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function fn(name){const start=source.indexOf(`function ${name}(`),tail=source.slice(start),end=tail.slice(1).search(/\n(?:function |const |let |async function |\/\/)/);assert(start>=0,name);return tail.slice(0,end+1);}
const key=unit=>`${unit.source}:${unit.unit}`;
const input=(name,source,station='LOUNGE',keep=false)=>({name,variant:'DIAMOND',source,unit:0,station,slot:station==='FUSION'?0:source,built:true,...(keep?{keepReason:'fusion'}:{})});
const batch=name=>({spend:[{name,variant:'DIAMOND',count:3}],out:{name,variant:'RAINBOW'},sure:true,after:[],gain:0,rarity:'RARE'});
function setup(units,batches){
 let scored=0;
 const context=vm.createContext({
  state:{optimiseFuseFirst:true},soldInsteadOfFusion:()=>[],fusionRebirthProtectedKeys:()=>new Set(),
  // Fix the scorer's order so these tests isolate whether execution respects
  // the existing table, independently of income and Droidex scoring changes.
  fusionChainFromSpares:()=>{scored++;assert(scored<3,'table conflicts must not recursively retry an unchanged pool');return batches;},
  variantLabel:variant=>variant,slotLabel:place=>`${place.station} ${place.slot+1}`,
  rarityLabel:rarity=>rarity,unitName:unit=>unit.name,fmt:String
 });
 vm.runInContext(source.split(/\r?\n/).find(line=>line.startsWith('const protocolFusionSpares=')),context);
 for(const name of ['optimiseFusionChain','withFusionSteps'])vm.runInContext(fn(name),context);
 const base={placed:units,overflow:[]},projected={placed:units.filter(unit=>unit.keepReason),sell:units.filter(unit=>!unit.keepReason),overflow:[]};
 const steps=projected.sell.map(unit=>({type:'sell',unit,from:{station:unit.station,slot:unit.slot},text:`Sell ${unit.name}.`}));
 const before=JSON.stringify({base,projected,steps});
 return {base,projected,steps,run:()=>context.withFusionSteps(steps,projected,base),unchanged:()=>assert.equal(JSON.stringify({base,projected,steps}),before),scored:()=>scored};
}
test('kept Fusion input needed by a later batch defers fusion without recursion or a new sale',()=>{
 const units=[...Array.from({length:3},(_,i)=>input('SA-5',i)),...Array.from({length:3},(_,i)=>input('LOM',i+3,i===0?'FUSION':'LOUNGE',true))];
 const fixture=setup(units,[batch('SA-5'),batch('LOM')]),steps=fixture.run();
 assert.equal(steps,fixture.steps,'retain the original ordinary plan');
 assert.equal(fixture.scored(),1);assert(steps.every(step=>step.type==='sell'&&step.unit.name==='SA-5'));
 assert(!steps.some(step=>step.unit?.name==='LOM'),'explicit fusion reserves are not newly sold or consumed');
 fixture.unchanged();
});
test('Fusion table split across kept batches remains intact',()=>{
 const units=[...Array.from({length:3},(_,i)=>input('SA-5',i,i===0?'FUSION':'LOUNGE',true)),...Array.from({length:3},(_,i)=>input('LOM',i+3,i===0?'FUSION':'LOUNGE',true))];
 units[3].slot=1;
 const fixture=setup(units,[batch('SA-5'),batch('LOM')]);
 assert.equal(fixture.run(),fixture.steps);assert.equal(fixture.steps.length,0);assert.equal(fixture.scored(),1);fixture.unchanged();
});
test('a compatible first batch uses the actual held input and replaces only its planned sales',()=>{
 const held=input('SA-5',0,'FUSION',true),units=[held,input('SA-5',1),input('SA-5',2)];
 const fixture=setup(units,[batch('SA-5')]);
 // Allocation may have wanted to store it elsewhere; the batch still starts
 // from its real table position, rather than that proposed destination.
 fixture.projected.placed=[{...held,station:'LOUNGE',slot:2}];
 const steps=fixture.run();
 assert.equal(steps.filter(step=>step.type==='fuse').length,1);
 assert.equal(steps.filter(step=>step.type==='fuse-in').length,2);
 assert.equal(key(steps.find(step=>step.type==='fuse-held').unit),key(held));
 assert(!steps.some(step=>step.type==='sell'));
});
test('a protected occupant outside the spare pool prevents loading another batch',()=>{
 const blocker={...input('PZ',9,'FUSION'),lockedSlot:true},units=[blocker,...Array.from({length:3},(_,i)=>input('SA-5',i))];
 const fixture=setup(units,[batch('SA-5')]);
 fixture.projected.sell=fixture.projected.sell.filter(unit=>unit!==blocker);
 fixture.steps.splice(fixture.steps.findIndex(step=>step.unit===blocker),1);
 fixture.projected.placed.push(blocker);
 assert.equal(fixture.run(),fixture.steps);assert.equal(fixture.scored(),0);
 assert(fixture.steps.every(step=>step.type==='sell'&&step.unit.name==='SA-5'));
});
