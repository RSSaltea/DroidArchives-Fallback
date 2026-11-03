const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('trait bonuses use each actual tier and the correct units',async()=>{
 const {TRAITS}=await import('../traits.js'),{traitBonusText,traitIcon}=await import('../trait-picker.js');
 assert.equal(traitBonusText(TRAITS.find(t=>t.id===9),'Gold'),'+10% Astromech Mission Speed');
 assert.equal(traitBonusText(TRAITS.find(t=>t.id===1),'Gold'),'+4 Pickaxe Level');
 assert.equal(traitBonusText(TRAITS.find(t=>t.id===2),'Gold'),'+100 Max Health');
 assert.equal(traitBonusText(TRAITS.find(t=>t.id===12),'Rainbow'),'Doubles Companion Bonus');
 assert.match(traitBonusText(TRAITS.find(t=>t.id===18),'Rainbow'),/guaranteed; \+1 Multi Crit/);
 assert.equal(traitBonusText(TRAITS.find(t=>t.id===26),'Rainbow'),'+5 effective Hive Mind droids');
 assert.equal(traitBonusText(TRAITS.find(t=>t.id===12),'Gold'),'');
 for(const trait of [null,...TRAITS])assert(fs.existsSync(path.join(__dirname,'..',traitIcon(trait))),`Missing icon ${trait?.id}`);
});
