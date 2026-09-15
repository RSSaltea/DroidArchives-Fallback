// Chip Sell Bonus is 4 levels at +50% each, up to +200%. Check it reaches both
// the per-droid figure and the roster total in the sell calculator.
const fs=require('fs'),vm=require('vm');
const ROOT='c:/Users/admin/OneDrive/Desktop/Droid Tycoon Helper/';
const src=fs.readFileSync(ROOT+'app.js','utf8'),lines=src.split(/\r?\n/);
const grab=k=>{const i=src.indexOf(k);let d=0,j=i;for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0){j++;break}}}return src.slice(i,j)};
const grabLine=k=>lines.find(l=>l.trimStart().startsWith(k));
const grabConst=n=>{const i=src.indexOf('const '+n+'=');return src.slice(i,src.indexOf('\n};',i)+3)};

const REBIRTHS=[{to:2,requiredDroids:[]}];
let novaLevel=0;
const sandbox={console,
  VARIANTS:['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR'],
  fmt:n=>String(Math.round(n)),rarityText:r=>r,variantText:v=>v,slug:s=>s,picture:()=>'<img>',
  bb8CompanionActive:()=>false,
  novaLevelFor:id=>id==='chip-sell-bonus'?novaLevel:0,
  Math,
  state:{cycle:1,rebirth:1,rebirths:{1:REBIRTHS},
    droids:[{name:'FODDER',rarity:'MYTHIC',type:'WORKER',variants:{}}],
    owned:[{name:'FODDER',variant:'GALACTIC',qty:10}]},
};
sandbox.expandedOwned=()=>sandbox.state.owned.flatMap((x,i)=>Array.from({length:x.qty},(_,unit)=>({...x,source:i,unit})));
sandbox.rebirthFusionCalculatorHtml=()=>''; // Fusion scenarios have their own regression suite.
vm.createContext(sandbox);
vm.runInContext(grabConst('CHIP_SELL_VALUES'),sandbox);
for(const k of ['const baseChipSellValue=','const chipSellBonusMultiplier=','const chipSellValue='])
  vm.runInContext(grabLine(k),sandbox);
vm.runInContext(grabLine('const CHIP_COSTS='),sandbox);
vm.runInContext(grab('function chipsToVariant'),sandbox);
vm.runInContext(grab('function nextRebirthHoldBacks'),sandbox);
vm.runInContext(grab('function chipSellCalculatorHtml'),sandbox);

const base=vm.runInContext("baseChipSellValue({rarity:'MYTHIC'},'GALACTIC')",sandbox);
console.log('Mythic Galactic base value:',base,'(table says 204)');

console.log('\nlevel | multiplier | per droid | roster of 10');
let ok=base===204;
for(novaLevel=0;novaLevel<=5;novaLevel++){
  const mult=vm.runInContext('chipSellBonusMultiplier()',sandbox);
  const each=vm.runInContext("chipSellValue({rarity:'MYTHIC'},'GALACTIC')",sandbox);
  const html=vm.runInContext('chipSellCalculatorHtml({placed:[]})',sandbox);
  const total=Number((html.match(/<small>Sell everything<\/small><strong>(\d+)<\/strong>/)||[])[1]);
  const wantMult=1+Math.min(4,novaLevel)*0.5;
  const good=mult===wantMult&&each===base*wantMult&&total===Math.round(base*wantMult)*10;
  if(!good)ok=false;
  console.log(`  ${novaLevel}   |    x${mult.toFixed(1)}    |    ${String(each).padStart(4)}   |   ${String(total).padStart(5)}   ${good?'':'*** WRONG ***'}`);
}
console.log('\ncaps at level 4 (+200%):',vm.runInContext('(()=>{const a=chipSellBonusMultiplier();return a})()',sandbox)===3);
console.log('\nPASS:',ok);
