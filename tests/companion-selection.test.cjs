const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const droids=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/droids.json'),'utf8'));
function fn(name){const at=src.indexOf(`function ${name}(`);assert(at>=0,name);const tail=src.slice(at),end=tail.slice(1).search(/\n(?:function |const |let |async function |\/\/)/);return end<0?tail:tail.slice(0,end+1);}
function optimise({units,preferred=['CHOPPER'],goals=['pickaxe'],assignments=[],slots=2}){
 const owned=units.map((u,source)=>({variant:'DEFAULT',qty:1,...u,source,unit:0}));
 const state={droids,owned,preferredCompanions:preferred,companionGoals:goals,optimiseKeepDroidex:false};
 const caps={COMPANION:slots,LOUNGE:10,WORKER:2,ASTROMECH:2,BATTLE:2,BUILD:1,UPGRADE_CHIP:0};
 const indices=s=>Array.from({length:caps[s]||0},(_,i)=>i);
 const ctx=vm.createContext({state,base:{placed:owned.filter(x=>x.station)},plan:{assignments},
  VARIANTS:['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR'],SLOT_RULES:caps,
  PRODUCTIVE_STATIONS:['WORKER','ASTROMECH','BATTLE'],ASTROMECH_MISSION_SLOTS:[],
  stationSlotIndices:indices,slotFillOrder:indices,expandedOwned:()=>owned,
  isBuilding:x=>x.station==='BUILD'&&!x.built,isIconic:d=>d?.rarity==='ICONIC',
  isProtocolStation:s=>s.startsWith('PROTOCOL_'),upgradeChipRate:()=>0,
  sparedFromSelling:()=>[],keepForFusion:()=>false,loungeLikeStations:()=>['LOUNGE'],
  droidCycleStatus:()=>({kind:'future',label:'Needed for rebirth'}),
  droidexGapsAbove:()=>[],droidAttribute:()=> 'boost',
  optimisedRows:placed=>placed
 });
 for(const prefix of ['const COMPANION_GOALS=','const companionGoals=','const companionSlotCount=','const preferredCompanions=']){
  const line=src.split(/\r?\n/).find(x=>x.startsWith(prefix));assert(line,prefix);vm.runInContext(line,ctx);
 }
 for(const name of ['droidAttributeValue','stabiliseProjectedPlacements','optimisedPlacements'])vm.runInContext(fn(name),ctx);
 return vm.runInContext('optimisedPlacements(base,plan)',ctx);
}
const lockedChopper={name:'CHOPPER',station:'COMPANION',slot:0,lockedSlot:true};
const spareAstro={name:'MO-TRAK',variant:'RAINBOW',station:'LOUNGE',slot:0};

test('locked preferred CHOPPER leaves the second slot for the strongest spare Pickaxe droid',()=>{
 const result=optimise({units:[lockedChopper,{name:'OPTI-POD',variant:'STELLAR',station:'COMPANION',slot:1},spareAstro,
  {name:'R7',variant:'DEFAULT',station:'LOUNGE',slot:1},
  {name:'MO-TRAK',variant:'STELLAR',station:'ASTROMECH',slot:0},
  {name:'CYCLENS',variant:'STELLAR',station:'ASTROMECH',slot:1,lockedSlot:true},
  {name:'MO-TRAK',variant:'BESKAR',station:'BUILD',slot:0}],assignments:[{key:'4:0',station:'ASTROMECH',slot:0}]});
 const second=result.placed.find(x=>x.station==='COMPANION'&&x.slot===1);
 assert.equal(second.name,'MO-TRAK');assert.equal(second.variant,'RAINBOW');assert.equal(second.keepReason,'companion');
 for(const source of [4,5])assert.equal(result.placed.find(x=>x.source===source).station,'ASTROMECH');
 assert.equal(result.placed.find(x=>x.source===6).station,'BUILD');
 assert(result.placed.find(x=>x.source===0).lockedSlot);
});

test('missing and already fulfilled preferences do not waste available Companion slots',()=>{
 for(const preferred of [['CHOPPER','BB-8'],['BB-8','CHOPPER'],['CHOPPER','CHOPPER']]){
  const result=optimise({units:[lockedChopper,spareAstro],preferred});
  assert.equal(result.placed.find(x=>x.station==='COMPANION'&&x.slot===1)?.name,'MO-TRAK');
 }
});

test('preferred droid assigned to work stays there and does not suppress spare boost choices',()=>{
 const result=optimise({units:[{name:'CHOPPER',station:'ASTROMECH',slot:0},spareAstro,{name:'R7',station:'LOUNGE',slot:1}],assignments:[{key:'0:0',station:'ASTROMECH',slot:0}]});
 assert.equal(result.placed.find(x=>x.name==='CHOPPER').station,'ASTROMECH');
 assert.equal(result.placed.filter(x=>x.station==='COMPANION').length,2);
});

test('an unavailable boost falls through to another selected boost in the same slot',()=>{
 const result=optimise({units:[spareAstro,{name:'R7',station:'LOUNGE',slot:1}],preferred:[],goals:['crafting','pickaxe']});
 assert.equal(result.placed.filter(x=>x.station==='COMPANION').length,2);
});

test('owned preferred Iconics still come first and both locked slots stay fixed',()=>{
 const result=optimise({units:[{name:'CHOPPER',station:'LOUNGE',slot:2},spareAstro]});
 assert.equal(result.placed.find(x=>x.station==='COMPANION'&&x.slot===0).name,'CHOPPER');
 assert.equal(result.placed.find(x=>x.station==='COMPANION'&&x.slot===1).name,'MO-TRAK');
 const locked=optimise({units:[lockedChopper,{name:'OPTI-POD',station:'COMPANION',slot:1,lockedSlot:true},spareAstro]});
 assert.equal(locked.placed.find(x=>x.station==='COMPANION'&&x.slot===1).name,'OPTI-POD');
});
