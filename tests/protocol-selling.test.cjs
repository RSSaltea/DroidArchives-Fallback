const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const droids=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/droids.json'),'utf8'));
function fn(name){
  const start=src.indexOf(`function ${name}(`);assert(start>=0,name);
  const tail=src.slice(start),end=tail.slice(1).search(/\n(?:function |const |let |async function |\/\/)/);
  return end<0?tail:tail.slice(0,end+1);
}
function setup({units,assignments=[],keep=[],rules=[],gaps=[],lounge=3,freeBuild=false}={}){
  units??=[{name:'SA-5',variant:'DEFAULT',station:'LOUNGE',slot:0}];
  units=units.map((u,source)=>({...u,source,unit:0}));
  const state={droids,owned:units,fusionKeepRules:rules,optimiseKeepDroidex:true,optimiseFreeBuild:freeBuild};
  const caps={WORKER:1,ASTROMECH:0,BATTLE:0,PROTOCOL_WORKER_CREDITS:1,PROTOCOL_WORKER_CRAFTING:1,BUILD:1,FUSION_BUILD:1,LOUNGE:lounge,COMPANION:0,UPGRADE_CHIP:0};
  const indices=station=>Array.from({length:caps[station]||0},(_,i)=>i);
  const ctx=vm.createContext({state,baseP:{placed:units.filter(u=>u.station)},plan:{assignments},
    VARIANTS:['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR'],
    RARITY_LADDER:['COMMON','RARE','EPIC','LEGENDARY','MYTHIC'],SLOT_RULES:caps,
    PRODUCTIVE_STATIONS:['WORKER','ASTROMECH','BATTLE'],ASTROMECH_MISSION_SLOTS:[],
    expandedOwned:()=>units,stationSlotIndices:indices,slotFillOrder:indices,
    isIconic:d=>d?.rarity==='ICONIC'||d?.special?.onlyDefaultVariant,
    isBuilding:u=>['BUILD','FUSION_BUILD'].includes(u.station)&&!u.built,
    isProtocolStation:s=>s.startsWith('PROTOCOL_'),
    droidCycleStatus:()=>({kind:'unused',label:'No further rebirth use'}),
    sparedFromSelling:()=>keep,upgradeChipRate:()=>0,loungeLikeStations:()=>['LOUNGE'],
    droidexGapsAbove:()=>gaps,variantText:v=>v,
    optimiseFreeBuildMode:()=>'upgrade-cost',optimiseStorageKeepScore:()=>0,
    optimiseFreeBuildModeLabel:()=>'Upgrade cost',
    stabiliseProjectedPlacements:(_,placed)=>placed,optimisedRows:(placed,overflow)=>[...placed,...overflow]
  });
  for(const name of ['normaliseFusionKeepRules','keepForFusion','optimisedPlacements'])vm.runInContext(fn(name),ctx);
  return vm.runInContext('optimisedPlacements(baseP,plan)',ctx);
}
test('unused Protocol copies are sold from Lounge, obsolete Protocol slots and overflow',()=>{
  for(const station of ['LOUNGE','PROTOCOL_WORKER_CREDITS',undefined]){
    const result=setup({units:[{name:'SA-5',variant:'DEFAULT',station,slot:0}]});
    assert.equal(result.sell.length,1,station);assert.equal(result.placed.length,0);assert.equal(result.overflow.length,0);
  }
});
test('productive Protocol assignments survive while the replaced copy is sold',()=>{
  for(const station of ['PROTOCOL_WORKER_CREDITS','PROTOCOL_WORKER_CRAFTING','WORKER']){
    const result=setup({units:[{name:'SA-5',variant:'DEFAULT',station,slot:0},{name:'LOM',variant:'STELLAR',station:'LOUNGE',slot:0}],assignments:[{key:'1:0',station,slot:0}]});
    assert.equal(result.sell.length,1);assert.equal(result.sell[0].name,'SA-5');
    assert.equal(result.placed.length,1);assert.equal(result.placed[0].name,'LOM');assert.equal(result.placed[0].station,station);
  }
});
test('explicit Keep and matching fusion rules protect spare Protocol droids',()=>{
  for(const settings of [{keep:['0:0']},{rules:[{name:'SA-5',variant:'DEFAULT'}]},{rules:[{rarity:'RARE',variant:'DEFAULT'}]}]){
    for(const lounge of [0,3]){
      const result=setup({...settings,lounge,freeBuild:true});
      assert.equal(result.sell.length,0);assert.equal(result.placed.length+result.overflow.length,1);
    }
  }
  assert.equal(setup({rules:[{rarity:'LEGENDARY',variant:'BESKAR'}]}).sell.length,1);
});
test('Droidex preference keeps a useful spare only while storage is available',()=>{
  const result=setup({gaps:['GOLD']});
  assert.equal(result.sell.length,0);assert.equal(result.placed[0].keepReason,'droidex');
  assert.equal(setup({gaps:['GOLD'],lounge:0}).sell.length,1);
});
test('locked, unfinished and Iconic Protocol droids are not sold',()=>{
  for(const unit of [
    {name:'SA-5',station:'LOUNGE',lockedSlot:true},
    {name:'SA-5',station:'BUILD',built:false},
    {name:'SA-5',station:'FUSION_BUILD',built:false},
    {name:'C-3PO',station:'LOUNGE'}
  ]){
    const result=setup({units:[{variant:'DEFAULT',slot:0,...unit}]});
    assert.equal(result.sell.length,0);assert.equal(result.placed.length,1);
  }
});
