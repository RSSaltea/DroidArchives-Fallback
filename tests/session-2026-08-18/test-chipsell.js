// Exercises the sell values, the hold-back rule and the totals against the real
// cycle-1 rebirth requirements.
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('c:/Users/admin/OneDrive/Desktop/Droid Tycoon Helper/app.js','utf8'),lines=src.split(/\r?\n/);
const grab=start=>{const i=lines.findIndex(l=>l.startsWith(start));if(i<0)throw new Error('missing '+start);
  let depth=0,out=[];for(let j=i;j<lines.length;j++){out.push(lines[j]);for(const c of lines[j]){if(c==='{')depth++;else if(c==='}')depth--}if(depth===0&&/[{}]/.test(out.join('')))break}return out.join('\n')};
const grabConst=name=>{const i=src.indexOf('const '+name+'=');const j=src.indexOf('\n};',i);return src.slice(i,j+3)};

const cycle1=JSON.parse(fs.readFileSync('c:/Users/admin/OneDrive/Desktop/Droid Tycoon Helper/data/rebirth-cycles/cycle-1.json','utf8'));
const rebirths=Array.isArray(cycle1)?cycle1:(cycle1.rebirths||Object.values(cycle1)[0]);

const droid=(name,rarity)=>({name,rarity,type:'WORKER',variants:{}});
const sandbox={console,
  VARIANTS:['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC'],
  fmt:n=>String(n),rarityText:r=>r,variantText:v=>v,slug:s=>s,picture:()=>'<img>',
  bb8CompanionActive:placed=>placed.some(x=>x.station==='COMPANION'&&x.name==='BB-8'),
  state:{cycle:1,rebirth:2,rebirths:{1:rebirths},droids:[]},
};
sandbox.rebirthFusionCalculatorHtml=()=>''; // Fusion scenarios have their own regression suite.
vm.createContext(sandbox);
vm.runInContext(grabConst('CHIP_SELL_VALUES'),sandbox);
vm.runInContext('const chipSellValue=(d,variant)=>CHIP_SELL_VALUES[d?.rarity]?.[variant]||0;',sandbox);
vm.runInContext(grab('function nextRebirthHoldBacks'),sandbox);
vm.runInContext(grab('function chipSellCalculatorHtml'),sandbox);

// Spot-check the table against the values supplied.
const checks=[['COMMON','GOLD',4],['COMMON','GALACTIC',16],['RARE','GOLD',6],['EPIC','RAINBOW',36],
  ['LEGENDARY','BESKAR',93],['MYTHIC','GALACTIC',204],['MYTHIC','GOLD',192],
  ['COMMON','DEFAULT',0],['MYTHIC','DEFAULT',0],['ICONIC','GOLD',0]];
let ok=true;
for(const [rarity,variant,want] of checks){
  const got=vm.runInContext(`chipSellValue({rarity:'${rarity}'},'${variant}')`,sandbox);
  if(got!==want){ok=false;console.log(`  MISMATCH ${rarity} ${variant}: got ${got}, want ${want}`)}
}
console.log('sell table matches supplied values:',ok);

// Rebirth 3 needs A-LT DEFAULT, B-U4D DEFAULT, R9 GOLD.
console.log('\nnext rebirth (to=3) requires:',rebirths.find(r=>r.to===3).requiredDroids.map(r=>`${r.droidName} ${r.variant}`).join(', '));
sandbox.state.droids=[droid('A-LT','EPIC'),droid('B-U4D','RARE'),droid('R9','LEGENDARY'),droid('SPARE','MYTHIC')];
sandbox.state.owned=[
  {name:'A-LT',variant:'BESKAR',qty:1},          // satisfies A-LT, worth 39
  {name:'B-U4D',variant:'DEFAULT',qty:1},        // satisfies B-U4D, worth 0
  {name:'R9',variant:'GALACTIC',qty:1},          // satisfies R9 GOLD, worth 96
  {name:'R9',variant:'GOLD',qty:1},              // also satisfies, worth 84 - cheaper, should be the one held
  {name:'SPARE',variant:'GALACTIC',qty:2},       // 204 each
  {name:'SPARE',variant:'DEFAULT',qty:3},        // worth nothing
];
sandbox.expandedOwned=()=>sandbox.state.owned.flatMap((x,i)=>Array.from({length:x.qty},(_,unit)=>({...x,source:i,unit})));
const held=vm.runInContext('nextRebirthHoldBacks(expandedOwned())',sandbox);
console.log('held back:',[...held.values()].map(u=>`${u.name} ${u.variant}`).join(', '));
console.log('  (R9 GOLD held, not GALACTIC - keeps the cheaper copy sellable):',
  [...held.values()].some(u=>u.name==='R9'&&u.variant==='GOLD'));

const html=vm.runInContext('chipSellCalculatorHtml({placed:[]})',sandbox);
const total=html.match(/<small>Sell everything<\/small><strong>(\d+)<\/strong>/);
const doubled=html.match(/<small>With BB-8 companion<\/small><strong>(\d+)<\/strong>/);
// Held: A-LT BESKAR (only copy that satisfies, so its 39 is forfeited), B-U4D
// DEFAULT (0) and R9 GOLD (84). Sellable: R9 GALACTIC 96 + SPARE GALACTIC 204x2
// = 504. The three Standard SPAREs are worth nothing.
console.log(`\ntotal: ${total&&total[1]} (expected 504)`);
console.log(`with BB-8: ${doubled&&doubled[1]} (expected 1008)`);
console.log('PASS:',ok&&total&&total[1]==='504'&&doubled&&doubled[1]==='1008');
const bb8Html=vm.runInContext("chipSellCalculatorHtml({placed:[{station:'COMPANION',name:'BB-8'}]})",sandbox);
console.log('BB-8 active styling applied:',bb8Html.includes('chip-sell-bb8 active'));
