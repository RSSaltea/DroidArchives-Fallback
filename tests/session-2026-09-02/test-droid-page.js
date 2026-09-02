// The droid page after the feedback round: every quality listed at once, the
// ones already in the Droidex marked, a fusion droid's recipe shown, and the
// quality you picked surviving a re-render.
const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..','..')+'/';
const src=fs.readFileSync(ROOT+'app.js','utf8'),LINES=src.split(/\r?\n/);
let fails=0;const ok=(l,c,x='')=>{if(!c)fails++;console.log('  '+(c?'ok  ':'FAIL')+' '+l+(c?'':'  -> '+x))};
const line=k=>{const l=LINES.find(x=>x.trimStart().startsWith(k));if(!l)throw Error('missing '+k);return l};
const grab=k=>{const i=src.indexOf(k);if(i<0)throw Error('missing '+k);let d=0,j=src.indexOf('{',i),st=false;
  for(;j<src.length;j++){if(src[j]==='{'){d++;st=true}else if(src[j]==='}'){d--;if(st&&d===0){j++;break}}}return src.slice(i,j)};

const VARIANTS=['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR'];
const sb={console,Map,Boolean,Number,String,Math,JSON,Set};
sb.app={innerHTML:''};
sb.document={querySelectorAll:()=>[],querySelector:()=>({onclick:null,onchange:null})};
vm.createContext(sb);
vm.runInContext('const VARIANTS='+JSON.stringify(VARIANTS)+';const UPGRADE_CHIP_RATES={};',sb);
vm.runInContext(line('const RARITY_LADDER='),sb);
for(const k of ['const slug=','const escapeAttr=','const isIconic=','const isFusion=','const onlyDefaultVariant=',
  'const variantLabel=','const variantText=','const rarityClass=','const rarityLabel=','const rarityText=','const fmt=',
  'const fusionRecipes=','const fusionDroid=','const fusionOwnedCount=','const norm=','const variantStep=',
  'const droidGameplayAttribute=','const craftTimeText=','const isDroidFlawless=','const upgradeChipRate=',
  'const knownNumber=','const variantIncomeText=','const variantCostText=','const detailVariantChoice=',
  'const detailOnlySelected=']) vm.runInContext(line(k),sb);
for(const k of ['function droidAttribute(','function droidexEntry(','function imageFor(','function picture(',
  'function fusionNeed(','function detailFusionHtml(','function detailPage(']) vm.runInContext(grab(k),sb);
vm.runInContext('function notFound(){app.innerHTML="NOT FOUND"};function placements(){return{placed:[]}};'
  +'function bb8CompanionActive(){return false};function requestAdd(){};function addBlueprint(){};function chipSellValue(){return 0};',sb);

const droids=JSON.parse(fs.readFileSync(ROOT+'data/droids.json','utf8'));
sb.state={droids,fusion:JSON.parse(fs.readFileSync(ROOT+'data/fusion.json','utf8')),
  images:JSON.parse(fs.readFileSync(ROOT+'data/image-manifest.json','utf8')),
  droidex:[{name:'ORB-XL',variant:'DEFAULT'},{name:'ORB-XL',variant:'GOLD'},{name:'ORB-XL',variant:'STELLAR'}],
  owned:[],flawless:[]};
const draw=name=>{sb.id=name;vm.runInContext('detailPage(id)',sb);return sb.app.innerHTML};
const rowsOf=html=>[...html.matchAll(/data-row-variant="([A-Z]+)"/g)].map(m=>m[1]);

console.log('=== every quality is in the table at once ===');
{
  const html=draw('orb-xl');
  ok('all seven qualities are listed',rowsOf(html).length===7,rowsOf(html).join(','));
  ok('no clicking back and forth to compare',rowsOf(html).join(',')===VARIANTS.join(','));
  const iconic=draw('cb-23');
  ok('an iconic still shows only its one quality',rowsOf(iconic).length===1,rowsOf(iconic).join(','));
}

console.log('');
console.log('=== the Droidex ones you already have are marked ===');
{
  const html=draw('orb-xl');
  ok('a tick per tracked quality',(html.match(/dex-tick/g)||[]).length===3,String((html.match(/dex-tick/g)||[]).length));
  const marked=[...html.matchAll(/data-v="([A-Z]+)" class="([^"]*)"/g)].filter(m=>m[2].includes('in-droidex')).map(m=>m[1]);
  ok('and the tabs for those qualities too',marked.join(',')==='DEFAULT,GOLD,STELLAR',marked.join(','));
  ok('the page says how many are still missing',html.includes('3/7 in your Droidex'),'summary line');
  ok('and names them',html.includes('still missing'));
  const none=draw('gonk');
  ok('a droid with nothing tracked has no ticks',(none.match(/dex-tick/g)||[]).length===0);
}

console.log('');
console.log('=== a fusion droid shows where it comes from ===');
{
  const html=draw('orb-xl');
  ok('the recipe is on the page',html.includes('<h2>Fusion recipe</h2>'));
  const parts=[...html.matchAll(/detail-fusion-part ([a-z-]+)" href="#\/droid\/[^"]*">([^<]*)</g)];
  ok('all three ingredients are named',parts.length===3,JSON.stringify(parts.map(p=>p[2])));
  ok('and it says the droid cannot be crafted',html.includes('cannot be crafted'));
  ok('an ordinary droid has no recipe block',!draw('gonk').includes('<h2>Fusion recipe</h2>'));
}

console.log('');
console.log('=== the quality you picked survives a re-render ===');
{
  draw('orb-xl');
  // What clicking a tab does, without a DOM to click in.
  vm.runInContext("detailVariantChoice.set('ORB-XL','BESKAR')",sb);
  const again=draw('orb-xl');
  const selected=again.match(/data-v="([A-Z]+)" class="active/);
  ok('it comes back on the quality you were reading',selected&&selected[1]==='BESKAR',selected&&selected[1]);
  ok('and the Add button follows it',again.includes('Add <span class="variant-text variant-beskar">'));
  vm.runInContext("detailVariantChoice.set('CB-23','GALACTIC')",sb);
  const iconic=draw('cb-23');
  ok('a quality the droid does not have falls back safely',iconic.includes('data-row-variant="DEFAULT"'));
}

console.log('');
console.log('=== the roster reads alphabetically ===');
{
  const start=LINES.findIndex(l=>l.includes('const rosterGroups=[];'));
  const block=LINES.slice(start,start+6).join('\n');
  const rs={VARIANTS,state:{owned:[
    {name:'MO-TRAK',variant:'GALACTIC',qty:1},{name:'BB-8',variant:'DEFAULT',qty:1},
    {name:'MO-TRAK',variant:'BESKAR',qty:1},{name:'AMP WALKER',variant:'STELLAR',qty:2},
    {name:'R6',variant:'GALACTIC',qty:1}]}};
  vm.createContext(rs);
  const groups=vm.runInContext(block+'; rosterGroups',rs);
  ok('sorted by name',groups.map(g=>g.name).join(',')==='AMP WALKER,BB-8,MO-TRAK,MO-TRAK,R6',groups.map(g=>g.name).join(','));
  ok('and by quality within one droid',groups.filter(g=>g.name==='MO-TRAK').map(g=>g.variant).join(',')==='BESKAR,GALACTIC');
  ok('duplicates still collapse to a count',groups.find(g=>g.name==='AMP WALKER').qty===2);
}

console.log('');
console.log('=== B1 HEAVY Stellar is the measured figure ===');
{
  const st={Math,JSON};vm.createContext(st);
  vm.runInContext(line('const knownNumber='),st);
  const i=src.indexOf('function applyStellarData(');
  vm.runInContext(src.slice(i,src.indexOf('\nasync function loadEvents',i)),st);
  st.droids=JSON.parse(fs.readFileSync(ROOT+'data/droids.json','utf8'));
  st.stellar=JSON.parse(fs.readFileSync(ROOT+'data/stellar.json','utf8'));
  const out=vm.runInContext('applyStellarData(droids,stellar)',st);
  const b1=out.find(x=>x.name==='B1 HEAVY');
  ok('it is 48k, not the 50.4k the multiplier would give',b1.variants.STELLAR.income===48000,String(b1.variants.STELLAR.income));
  ok('its cost is still derived',b1.variants.STELLAR.cost>0);
  ok('other Epics are untouched',out.find(x=>x.name==='B2 HEAVY').variants.STELLAR.income===38400);
}

console.log('');
console.log('=== Ctrl-drag copies instead of moving ===');
{
  // This arrived from the other machine while the same thing was being written
  // here; that version won because it also covers Cmd on a Mac and respects a
  // droid's maximum quantity. These pin what it has to keep doing.
  const drag=grab('function attachSlotDragAndDrop(');
  const copy=grab('function copyPlacedDroid(');
  ok('a drag offers copy as well as move',drag.includes("effectAllowed='copyMove'"));
  ok('Ctrl or Cmd both count',line('const dragCopyWanted=').includes('e.ctrlKey||e.metaKey'));
  ok('the drop is routed through the copy path',drag.includes('dragCopyWanted(e)')&&drag.includes('copyPlacedDroid('));
  ok('a copy adds another of the same droid and quality',copy.includes('commitOwned(d.name,source.variant,1,station,slot)'));
  ok('an occupied slot is refused rather than overwritten',copy.includes('copies into an empty slot'));
  ok('and a droid capped in quantity is not multiplied past it',copy.includes('is limited to'));
  ok('without Ctrl it still moves',drag.includes('movePlacedDroid('));
}

console.log('');
console.log(fails?fails+' failed':'all passed');
process.exit(fails?1:0);
