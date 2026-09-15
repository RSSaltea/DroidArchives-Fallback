// Reproduces the reported case: Rebirth 30 needs OPTI-STRIKE Galactic, KX Beskar
// and DRFT-R Galactic. KX and DRFT-R are owned at the right quality; OPTI-STRIKE
// is only Beskar and needs 20K chips to reach Galactic. That last one must NOT
// be counted as sellable - it is the whole reason for selling everything else.
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('c:/Users/admin/OneDrive/Desktop/Droid Tycoon Helper/app.js','utf8'),lines=src.split(/\r?\n/);
const grab=start=>{const i=lines.findIndex(l=>l.startsWith(start));if(i<0)throw new Error('missing '+start);
  let depth=0,out=[];for(let j=i;j<lines.length;j++){out.push(lines[j]);for(const c of lines[j]){if(c==='{')depth++;else if(c==='}')depth--}if(depth===0&&/[{}]/.test(out.join('')))break}return out.join('\n')};
const grabConst=n=>{const i=src.indexOf('const '+n+'=');return src.slice(i,src.indexOf('\n};',i)+3)};
const grabLine=n=>lines.find(l=>l.startsWith('const '+n+'='));

const REBIRTHS=[{to:30,creditsCost:1e14,requiredDroids:[
  {droidName:'OPTI-STRIKE',variant:'GALACTIC'},{droidName:'KX',variant:'BESKAR'},{droidName:'DRFT-R',variant:'GALACTIC'}]}];
const droid=(name,rarity)=>({name,rarity,type:'WORKER',variants:{}});
const sandbox={console,
  VARIANTS:['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC'],
  fmt:n=>String(n),rarityText:r=>r,variantText:v=>v,slug:s=>s,picture:()=>'<img>',
  bb8CompanionActive:placed=>placed.some(x=>x.station==='COMPANION'&&x.name==='BB-8'),
  state:{cycle:1,rebirth:29,rebirths:{1:REBIRTHS},droids:[
    droid('OPTI-STRIKE','LEGENDARY'),droid('KX','MYTHIC'),droid('DRFT-R','MYTHIC'),droid('FODDER','MYTHIC')]},
};
sandbox.rebirthFusionCalculatorHtml=()=>''; // Fusion scenarios have their own regression suite.
vm.createContext(sandbox);
vm.runInContext(grabConst('CHIP_SELL_VALUES'),sandbox);
vm.runInContext(grabLine('CHIP_COSTS'),sandbox);
vm.runInContext('const chipSellValue=(d,variant)=>CHIP_SELL_VALUES[d?.rarity]?.[variant]||0;',sandbox);
vm.runInContext(grab('function chipsToVariant'),sandbox);
vm.runInContext(grab('function nextRebirthHoldBacks'),sandbox);
vm.runInContext(grab('function chipSellCalculatorHtml'),sandbox);

sandbox.state.owned=[
  {name:'OPTI-STRIKE',variant:'BESKAR',qty:1},   // needs upgrading to GALACTIC - must be held
  {name:'KX',variant:'BESKAR',qty:1},            // meets requirement - held
  {name:'DRFT-R',variant:'GALACTIC',qty:1},      // meets requirement - held
  {name:'FODDER',variant:'GALACTIC',qty:10},     // 204 each = 2040 sellable
];
sandbox.expandedOwned=()=>sandbox.state.owned.flatMap((x,i)=>Array.from({length:x.qty},(_,unit)=>({...x,source:i,unit})));

const held=vm.runInContext('nextRebirthHoldBacks(expandedOwned())',sandbox);
console.log('held back:',[...held.values()].map(u=>`${u.name} ${u.variant}${u.chipsNeeded?` (needs ${u.chipsNeeded})`:' (ready)'}`).join(', '));
const optiHeld=[...held.values()].some(u=>u.name==='OPTI-STRIKE');
console.log('OPTI-STRIKE held back rather than sold:',optiHeld);

const html=vm.runInContext('chipSellCalculatorHtml({placed:[]})',sandbox);
const grabStat=label=>{const m=html.match(new RegExp(`<small>${label}[^<]*</small><strong>(\\d+)</strong>`));return m&&m[1]};
console.log('\nsell everything:      ',grabStat('Sell everything'),'(expected 2040)');
console.log('with BB-8:            ',grabStat('With BB-8 companion'),'(expected 4080)');
console.log('needed for rebirth:   ',grabStat('Needed for Rebirth'),'(expected 16000)');
console.log('still short:          ',grabStat('Still short after selling'),'(expected 13960)');
console.log('short with BB-8 note: ',/11920 short with BB-8/.test(html),'(expected true)');
const pass=optiHeld&&grabStat('Sell everything')==='2040'&&grabStat('Needed for Rebirth')==='16000'
  &&grabStat('Still short after selling')==='13960'&&/11920 short with BB-8/.test(html);
console.log('\nPASS:',pass);

// Selling enough to cover it should flip to the covered state.
sandbox.state.owned[3].qty=200; // 200 x 204 = 40800
const covered=vm.runInContext('chipSellCalculatorHtml({placed:[]})',sandbox);
console.log('\nwith a big roster -> covered state:',/Covered by selling/.test(covered),
  '| leftover:',(covered.match(/<small>Covered by selling<\/small><strong>(\d+)<\/strong>/)||[])[1],'(expected 24800)');

