const {test}=require('node:test'),assert=require('node:assert/strict');
const {TRAITS,normaliseTrait,traitAmount,traitSum,companionPerkActive,companionGoalValue,rememberIconicTraits}=require('../traits.js');
const {workingIncome}=require('../economy.js');
const {craftingEstimate}=require('../crafting.js');
const {createAssignmentScorer}=require('../optimise-layout-score.js');
const unit=(id,tier='Rainbow',station='COMPANION')=>({trait:{id,tier},station});
test('catalogue has 26 unique traits and rejects impossible imported traits',()=>{
 assert.equal(new Set(TRAITS.map(t=>t.id)).size,26);
 assert.equal(normaliseTrait({id:24,tier:'Gold'}),null);
 assert.equal(normaliseTrait({id:24,tier:'Rainbow'},{name:'GONK',rarity:'COMMON'}),null);
 assert.equal(normaliseTrait({id:0,tier:'Rainbow'},{name:'CB-23',rarity:'ICONIC'}),null);
 assert.deepEqual(normaliseTrait({id:24,tier:'rainbow',rerolls:Infinity},{name:'CB-23',rarity:'ICONIC'}),{id:24,tier:'Rainbow',rerolls:0});
});
test('traits activate only in their supported roles and tiers',()=>{
 assert.equal(traitAmount(unit(0,'Diamond','WORKER'),0),.35);
 assert.equal(traitAmount(unit(0,'Rainbow','ASTROMECH'),0),.5);
 assert.equal(traitAmount(unit(0,'Rainbow','LOUNGE'),0),0);
 assert.equal(traitAmount(unit(24,'Rainbow','WORKER'),24),0);
 assert.equal(traitAmount(unit(24,'Rainbow','ASTROMECH'),24),3);
 assert.equal(traitAmount({...unit(24,'Rainbow','ASTROMECH'),slot:1},24),0);
 assert.equal(companionPerkActive({...unit(20,'Rainbow','PROTOCOL_WORKER_CREDITS'),name:'C-3PO'},'C-3PO'),true);
 assert.equal(traitSum([unit(3),unit(3,'Gold')],3),.35);
});
test('working traits affect per-droid income and assignment scoring without inflating the raw Iconic pool',()=>{
 assert.equal(workingIncome({base:100,traitBonus:.5,multiplier:2,matching:true}).total,330);
 const units=[{base:100,traitBonus:.5,type:'WORKER',dynamic:0},{base:140,type:'WORKER',dynamic:0}];
 const score=createAssignmentScorer({units,slots:[{station:'WORKER',region:0,creditRegion:-1,craftRegion:-1}],locked:[],regions:['WORKER'],multiplier:1,lambda:0,craftSeconds:[0],craftBaseSpeed:1});
 assert(score([0])[0]>score([1])[0]);
 assert.equal(workingIncome({base:0,dynamicPercent:.15,staticIncome:100}).total,15);
});
test('Overclocked, crafting traits and working D-O are included in estimates',()=>{
 const d={name:'GONK',type:'WORKER',rarity:'COMMON',variants:{DEFAULT:{craftingSeconds:100}}};
 const placed=[{...unit(12),name:'GONK',variant:'DEFAULT'},unit(3)];
 const result=craftingEstimate({droid:d,droids:[d],placed,novaUpgrades:{'crafting-speed':5}});
 assert.equal(result.worker,.4);assert.equal(result.traits,.25);assert.equal(result.speed,2.15);
 assert.equal(companionGoalValue(d,unit(1),'pickaxe',.2),10);
 assert.equal(companionPerkActive({...unit(21,'Rainbow','BATTLE'),name:'BB-8'},'BB-8'),true);
 const fusion=craftingEstimate({droid:d,station:'FUSION_BUILD',placed:[{...unit(17,'Rainbow','WORKER'),name:'D-O'}]});
 assert.equal(fusion.seconds,50);
});
test('only Iconic traits are retained separately after the roster is cleared',()=>{
 const droids=[{name:'CB-23',rarity:'ICONIC'},{name:'GONK',rarity:'COMMON'}];
 const owned=[{name:'CB-23',trait:{id:24,tier:'Rainbow',rerolls:3}},{name:'GONK',trait:{id:0,tier:'Gold'}}];
 const kept=rememberIconicTraits({},owned,droids);
 assert.deepEqual(Object.keys(kept),['CB-23']);
 assert.deepEqual(rememberIconicTraits(kept,[],droids),kept);
});
test('v1.35 mission rewards distinguish tier 3 and 4 and keep Hyperdrive weights unchanged',()=>{
 const {CB23_REWARDS,WORLD_MISSION_BOOSTS}=require('../update-135.js');
 assert.equal(CB23_REWARDS.reduce((n,r)=>n+r.weight,0),200);
 assert.deepEqual(CB23_REWARDS.map(r=>r.amount),[120,240,360,480,40,80]);
 assert.match(WORLD_MISSION_BOOSTS[2],/^Crafting/);assert.match(WORLD_MISSION_BOOSTS[3],/^Kyber/);
});
