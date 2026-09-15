const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),src=fs.readFileSync(path.join(root,'app.js'),'utf8');
const line=key=>src.split(/\r?\n/).find(s=>s.startsWith(key));
const fn=name=>{const start=src.indexOf('function '+name+'(');assert(start>=0,name);let depth=0,end=src.indexOf('{',start);for(;end<src.length;end++){if(src[end]==='{')depth++;if(src[end]==='}'&&!--depth)return src.slice(start,end+1)}};
const state={droids:JSON.parse(fs.readFileSync(path.join(root,'data/droids.json'))),fusion:JSON.parse(fs.readFileSync(path.join(root,'data/fusion.json'))),cycle:0,rebirth:34,rebirths:{0:[{to:35,requiredDroids:[{droidName:'CYCLENS',variant:'STELLAR'},{droidName:'R7',variant:'STELLAR'},{droidName:'DRFT-R',variant:'STELLAR'}]}]}};
const sb={state,console,novaLevelFor:()=>4,isBuilding:u=>['BUILD','FUSION_BUILD'].includes(u.station)&&!u.built};vm.createContext(sb);
for(const name of ['VARIANTS','RARITY_LADDER','isIconic','isFusion','fusionDroid','fusionRecipes','fusionKey','fusionRecipeFor','variantStep','nextVariant','nextRarity','rarityStep','lowestVariant','droidRarity','CHIP_COSTS','baseChipSellValue','chipSellBonusMultiplier','chipSellValue','knownNumber'])vm.runInContext(line('const '+name+'='),sb);
const sellStart=src.indexOf('const CHIP_SELL_VALUES=');vm.runInContext(src.slice(sellStart,src.indexOf('\n};',sellStart)+3),sb);
for(const name of ['fusionOutcome','chipsToVariant','nextRebirthHoldBacks','rebirthFusionOptions','parseGalacticNumber','rebirthFusionCreditBudget'])vm.runInContext(fn(name),sb);
const run=code=>vm.runInContext(code,sb);
function options(rows){
  sb.units=rows.map((u,source)=>({variant:'GALACTIC',unit:0,source,...u}));sb.held=run('nextRebirthHoldBacks(units)');
  sb.total=run('units.filter(u=>!held.has(`${u.source}:${u.unit}`)).reduce((sum,u)=>sum+chipSellValue(fusionDroid(u.name),u.variant),0)');
  return run('rebirthFusionOptions({placed:units},units,held,total)');
}
const protectedRows=[{name:'R7',variant:'STELLAR'},{name:'DRFT-R',variant:'STELLAR'}];
let m=options([...protectedRows,{name:'MECHA-DROID'},{name:'BB9'},{name:'CYCLO-GRAV'},{name:'KX',variant:'BESKAR'},{name:'IG',variant:'BESKAR'},{name:'LOADLIFTER',variant:'BESKAR'}]);
assert.equal(m.length,1);let opts=m[0].options;assert(opts.some(o=>o.from==='LEGENDARY'&&o.variant==='GALACTIC'));assert(opts.some(o=>o.from==='MYTHIC'&&o.variant==='BESKAR'));
for(const o of opts){
 assert(!o.sure);assert(o.inputs.every(u=>!protectedRows.some(p=>p.name===u.name)));
 assert.equal(o.chips,o.variant==='GALACTIC'?90000:150000);
 assert.equal(o.remainingChips,sb.total-o.lostChips);assert.equal(o.shortfallBb8,Math.max(0,o.chips-o.remainingChips*2));
 assert.equal(new Set(o.inputs.map(u=>`${u.source}:${u.unit}`)).size,3);
}
m=options([...protectedRows,...Array.from({length:3},()=>({name:'MECHA-DROID'}))]);assert.equal(m[0].options.length,0,'identical Galactic Legendaries upgrade themselves, not roll Cyclens');
m=options([...protectedRows,{name:'KX'},{name:'IG'},{name:'RIC'}]);assert.equal(m[0].options.length,0,'named RIV-3T recipe is not a Cyclens reroll');
m=options([...protectedRows,{name:'KX',lockedSlot:true},{name:'IG'},{name:'LOADLIFTER'}]);assert.equal(m[0].options.length,0);
for(const station of ['BUILD','FUSION_BUILD','COMPANION']){m=options([...protectedRows,{name:'KX',station},{name:'IG'},{name:'LOADLIFTER'}]);assert.equal(m[0].options.length,0,station)}
m=options([...protectedRows,{name:'CYCLENS',variant:'BESKAR'},{name:'KX',variant:'GOLD'},{name:'IG',variant:'GOLD'},{name:'LOADLIFTER',variant:'GOLD'}]);assert.equal(m[0].options.length,0,'do not replace an owned copy with a worse roll');
m=options([...protectedRows,{name:'CYCLENS',variant:'STELLAR'},{name:'KX'},{name:'IG'},{name:'LOADLIFTER'}]);assert.equal(m.length,0,'ready rebirth needs no fusion');
m=options([...protectedRows,{name:'MECHA-DROID',variant:'GOLD'},{name:'BB9'},{name:'CYCLO-GRAV'}]);assert.equal(m[0].options[0].variant,'GOLD','mixed inputs take lowest variant');
state.rebirths[0][0].requiredDroids=[{droidName:'MECHA-DROID',variant:'STELLAR'}];m=options(Array.from({length:4},()=>({name:'MECHA-DROID'})));assert(m[0].options[0].sure);assert.equal(m[0].options[0].chips,0);assert.equal(sb.held.size,1,'keep an upgrade candidate out of the inputs');
state.rebirths[0][0].requiredDroids=[{droidName:'RIV-3T',variant:'GALACTIC'}];m=options([{name:'KX'},{name:'IG'},{name:'RIC'}]);assert(m[0].options[0].sure);assert.equal(m[0].options[0].kind,'recipe');
assert.equal(run("rebirthFusionCreditBudget('1T','250B').remaining"),750e9);assert.equal(run("rebirthFusionCreditBudget('10B','250B').shortfall"),240e9);
assert.equal(run("rebirthFusionCreditBudget('1T','')"),null);assert(run("rebirthFusionCreditBudget('bad','1B').invalid"));assert.equal(run("rebirthFusionCreditBudget('0','0').shortfall"),0);
console.log('PASS: Cyclens rarity rolls and rerolls, named recipes, upgrades, protected inputs, chip accounting and credit budgets');
