const {test}=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../companion-trait-comparison.js');
const d=type=>({name:'TEST',rarity:'EPIC',type});
test('pickaxe compares Overclocked only for Astromechs and gates Fusion Expert',async()=>{
 const {companionTraitOptions:options}=await load();
 for(const type of ['WORKER','BATTLE','PROTOCOL','ASTROMECH']){
  const ids=options(d(type),'pickaxe').map(t=>t.id);assert(ids.includes(1)&&ids.includes(4)&&ids.includes(5));assert.equal(ids.includes(12),type==='ASTROMECH');assert(!ids.includes(8));assert(options(d(type),'pickaxe',{fusion:true}).some(t=>t.id===8));
 }
});
test('Iconic and tier restrictions come from the shared trait catalogue',async()=>{
 const {companionTraitOptions:options}=await load();
 assert(!options({...d('ASTROMECH'),rarity:'ICONIC'},'pickaxe').some(t=>t.id===12));
 assert(!options(d('ASTROMECH'),'pickaxe',{tier:'Gold'}).some(t=>t.id===12));
});
test('credits excludes Scrap Specialist; non-pickaxe goals exclude Fusion Expert',async()=>{
 const {companionTraitOptions:options}=await load();
 assert.deepEqual(options(d('PROTOCOL'),'credits').map(t=>t.id),[11,12]);
 for(const goal of ['scrap','credits','crafting','health','chips'])assert(!options(d('PROTOCOL'),goal,{fusion:true}).some(t=>t.id===8));
});

test('scrap compares payout traits, not pickaxe progress',async()=>{
 const {companionTraitOptions:options}=await load();
 assert.deepEqual(options(d('ASTROMECH'),'scrap').map(t=>t.id),[7,11]);
 assert.deepEqual(options(d('PROTOCOL'),'scrap').map(t=>t.id),[7,11,12]);
});
