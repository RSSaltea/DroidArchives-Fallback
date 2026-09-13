// Protocol slots belong inside the card for their region, in their own section,
// rather than as two separate cards underneath it. And the Regional production
// panel can be hidden from Advanced settings.
const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..','..')+'/';
const src=fs.readFileSync(ROOT+'app.js','utf8'),LINES=src.split(/\r?\n/);
const css=fs.readFileSync(ROOT+'styles.css','utf8');
let fails=0;const ok=(l,c,x='')=>{if(!c)fails++;console.log('  '+(c?'ok  ':'FAIL')+' '+l+(c?'':'  -> '+x))};
const line=k=>{const l=LINES.find(x=>x.trimStart().startsWith(k));if(!l)throw Error('missing '+k);return l};
const grab=k=>{const i=src.indexOf(k);if(i<0)throw Error('missing '+k);let d=0,j=src.indexOf('{',i),st=false;
  for(;j<src.length;j++){if(src[j]==='{'){d++;st=true}else if(src[j]==='}'){d--;if(st&&d===0){j++;break}}}return src.slice(i,j)};

console.log('=== each region card carries its own Protocol section ===');
{
  const sb={};vm.createContext(sb);
  vm.runInContext(line('const PROTOCOL_REGIONS='),sb);
  vm.runInContext(grab('function protocolSlotsHtml('),sb);
  // Stand in for a page's slot renderer, so the ids that reach it are visible.
  sb.renderSlot=(station,index)=>'['+station+':'+index+']';
  const draw=type=>{sb.type=type;return vm.runInContext('protocolSlotsHtml(type,renderSlot)',sb)};
  for(const region of ['WORKER','ASTROMECH','BATTLE']){
    const html=draw(region);
    ok(region+' gets a Protocol divider',html.includes('<span>Protocol</span>'),html);
    ok(region+' gets its Credits slot, under its own station id',html.includes('[PROTOCOL_'+region+'_CREDITS:0]'));
    ok(region+' gets its Crafting slot, under its own station id',html.includes('[PROTOCOL_'+region+'_CRAFTING:0]'));
    ok(region+' puts the divider before the slots',html.indexOf('Protocol</span>')<html.indexOf('[PROTOCOL_'));
  }
  for(const other of ['BUILD','LOUNGE','FUSION','COMPANION','PROTOCOL_WORKER_CREDITS'])
    ok(other+' gets no Protocol section',draw(other)==='',draw(other));
}

console.log('');
console.log('=== both pages build it into the card, and the separate cards are gone ===');
{
  const stationLines=LINES.filter(l=>l.includes('const station=type=>'));
  ok('the Base page and the Optimise page both have a station renderer',stationLines.length===2,String(stationLines.length));
  ok('each one appends the Protocol section to its slots',stationLines.every(l=>l.includes(").join('')+protocolSlotsHtml(type,slot);")));
  // Each renderer opens on one line and returns its markup on the next.
  const renderers=LINES.map((l,i)=>l.includes('const station=type=>')?l+'\n'+(LINES[i+1]||''):null).filter(Boolean);
  ok('inside the slot grid, where the platform dividers live',renderers.length===2&&renderers.every(r=>r.includes('<div class="slot-grid">${slots}</div>')));
  ok('nothing still draws the old separate Protocol cards',!src.includes('protocolRegionSlots'));
  ok('and their styles are gone too',!css.includes('protocol-region-slots'));
  ok('the region layout still wraps each region card',(src.match(/'<div class="region-stations">'\+station\(region\)\+'<\/div>'/g)||[]).length===2);
}

console.log('');
console.log('=== Regional production can be hidden ===');
{
  const sb={};vm.createContext(sb);
  vm.runInContext(line('const PROTOCOL_REGIONS='),sb);
  vm.runInContext(grab('function protocolSummaryHtml('),sb);
  sb.regionalIncome=()=>({WORKER:{total:2,beforeBonus:2,bonus:0,multiplier:1},ASTROMECH:{total:3,beforeBonus:3,bonus:0,multiplier:1},BATTLE:{total:4,beforeBonus:4,bonus:0,multiplier:1}});
  sb.protocolCraftBonus=()=>0;sb.stationName=t=>t;sb.protocolNumber=v=>String(v);sb.craftTimeText=v=>v+'s';
  const panel=()=>vm.runInContext('protocolSummaryHtml([])',sb);
  sb.state={};
  ok('it shows by default, for anyone who never touched the setting',panel().includes('Regional production'));
  sb.state={showRegionalProduction:true};
  ok('it shows when the setting is on',panel().includes('Regional production'));
  sb.state={showRegionalProduction:false};
  ok('and disappears entirely when it is off',panel()==='',panel().slice(0,60));
}

console.log('');
console.log('=== the setting is wired like the others in Advanced settings ===');
{
  for(const [id,where] of [['sideShowRegionalProduction','sidebar'],['commandShowRegionalProduction','Command Deck']]){
    ok(where+' has the checkbox',src.includes('id="'+id+'"'));
    ok(where+' has its handler',src.includes("'#"+id+"'"));
  }
  ok('it is on unless someone turned it off',src.includes("localStorage.getItem('droid-archive-show-regional-production')!=='0'"));
  ok('it is saved',src.includes("localStorage.setItem('droid-archive-show-regional-production'"));
  ok('it travels with a profile export',src.includes('showRegionalProduction:state.showRegionalProduction'));
  ok('and comes back on import',src.includes('showRegionalProduction:data?.showRegionalProduction'));
  ok('a new profile starts with it shown',src.includes('fusionAsLounge:false,showRegionalProduction:true,'));
}

console.log('');
console.log(fails?fails+' failed':'all passed');
process.exit(fails?1:0);
