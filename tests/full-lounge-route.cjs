// Run with node tests/full-lounge-route.cjs (requires Playwright and Chrome).
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')));}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 const type={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)];
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':type||'application/octet-stream'});res.end(data);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.abort());
 await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.testPlan={state,save,validateBaseImport,placements,optimiseBase,incomeForPlaced,optimisedPlacements,safeOptimiseStepPlan,isBuilding,keepForFusion,baseExport,profileDataFromState,optimiseFusionChain};'}));
 await page.addInitScript(notes=>localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(notes)),JSON.parse(fs.readFileSync(path.join(root,'data/patch-notes.json'),'utf8')).notes.map(n=>n.id));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.waitForFunction(()=>window.testPlan?.state.droids.length);
 const profile=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/full-lounge-build.json'),'utf8'));
 const result=await page.evaluate(profile=>{
 const d=window.testPlan;Object.assign(d.state,d.validateBaseImport(profile));d.save();
 const base=d.placements(),target=d.optimisedPlacements(base,d.optimiseBase(base,d.incomeForPlaced(base.placed)));
 return {base,target,steps:d.safeOptimiseStepPlan(base,target)};
 },profile);
 assert.equal(result.target.overflow.length,0);assert.equal(result.target.sell.length,0);
 assert.equal(result.target.placed.length,result.base.placed.length);
 assert.equal(result.steps.length,4);assert(!result.steps.some(s=>s.type==='note'));
 const key=x=>`${x.source}:${x.unit}`,spot=x=>`${x.station}:${x.slot}`;
 const current=new Map(result.base.placed.map(x=>[key(x),{...x}]));
 for(const step of result.steps){
 const unit=current.get(key(step.unit));assert.equal(spot(unit),spot(step.from));assert(!unit.lockedSlot);
 assert(!(unit.station==='BUILD'&&!unit.built));
 if(step.type==='swap'){
  const other=current.get(key(step.withUnit));assert.equal(spot(other),spot(step.withFrom));assert(!other.lockedSlot);
  assert(!(other.station==='BUILD'&&!other.built));
  const from={station:unit.station,slot:unit.slot};Object.assign(unit,{station:other.station,slot:other.slot});Object.assign(other,from);
 }else{
  assert(![...current.values()].some(x=>spot(x)===spot(step.to)));assert.notEqual(step.to.station,'BUILD');
  Object.assign(unit,{station:step.to.station,slot:step.to.slot});
 }
 assert.equal(new Set([...current.values()].map(spot)).size,current.size);
 }
 for(const goal of result.target.placed)assert.equal(spot(current.get(key(goal))),spot(goal));
 await page.goto(`http://127.0.0.1:${server.address().port}/#/optimise`);
 await page.waitForSelector('#applyOptimised');
 assert(!(await page.locator('#app').innerText()).includes('Could not route'));
 await page.click('#applyOptimised');
 const actual=await page.evaluate(()=>window.testPlan.placements());
 const rows=xs=>xs.map(x=>`${x.name}|${x.variant}|${x.station}|${x.slot}`).sort();
 assert.deepEqual(rows(actual.placed),rows(result.target.placed));assert.equal(actual.overflow.length,0);
 const missions=await page.evaluate(()=>{
  const d=window.testPlan,out=[];
  for(const protocol of [false,true])for(const priority of ['credits','crafting']){
   d.state.protocolPriority=priority;
   d.state.owned=[{name:'CB-23',variant:'DEFAULT',preferred:'ASTROMECH',preferredSlot:1},
    {name:'R2-D2',variant:'DEFAULT',preferred:'ASTROMECH',preferredSlot:0},
    {name:'BB-8',variant:'DEFAULT',preferred:'WORKER',preferredSlot:0},
    {name:'CHOPPER',variant:'DEFAULT',preferred:'LOUNGE',preferredSlot:0},
    {name:'DRFT-R',variant:'STELLAR',qty:11,preferred:'WORKER'},
    {name:'MECHA-DROID',variant:'STELLAR',qty:19,preferred:'ASTROMECH'},
    ...(protocol?[{name:'C-3PO',variant:'DEFAULT',preferred:'BATTLE'}]:[])].map(x=>({qty:1,built:true,...x}));
   const base=d.placements(),plan=d.optimiseBase(base,d.incomeForPlaced(base.placed)),target=d.optimisedPlacements(base,plan);
   out.push({protocol,priority,picks:target.placed.filter(x=>['CB-23','R2-D2','BB-8','CHOPPER'].includes(x.name)),steps:d.safeOptimiseStepPlan(base,target)});
  }
  return out;
 });
 for(const scenario of missions){
  assert.equal(scenario.picks.length,4);
  for(const pick of scenario.picks){assert.equal(pick.station,'ASTROMECH');assert([0,2,4,6,8].includes(pick.slot));}
  assert.equal(new Set(scenario.picks.map(x=>x.slot)).size,4);
  assert(!scenario.steps.some(x=>x.type==='note'),JSON.stringify(scenario.steps));
 }
 console.log('PASS: all four Astromech Iconics keep mission slots through both optimisers and both priorities.');
 const reserved=await page.evaluate(()=>{
  const d=window.testPlan;d.state.companionGoals=['pickaxe'];d.state.preferredCompanions=[];d.state.optimiseKeepDroidex=false;
  d.state.fusionKeepRules=[{rarity:'LEGENDARY',variant:'BESKAR'},{rarity:'MYTHIC',variant:'DIAMOND'}];
  const matches=[['MECHA-DROID','BESKAR'],['MECHA-DROID','DIAMOND'],['RIC','DIAMOND'],['RIC','GOLD']].map(([name,variant])=>d.keepForFusion({name,variant}));
  d.state.owned=[{name:'MECHA-DROID',variant:'BESKAR',qty:1,preferred:'LOUNGE',preferredSlot:0,built:true}];
  const base=d.placements(),one=d.optimisedPlacements(base,{assignments:[]}),chain=d.optimiseFusionChain(one,base);
  d.state.owned[0].qty=14;d.state.optimiseFreeBuild=true;d.state.optimiseFreeBuildMode='upgrade-cost';
  const full=d.optimisedPlacements(d.placements(),{assignments:[]});
  d.state.owned[0].qty=3;const ready=d.optimisedPlacements(d.placements(),{assignments:[]}),readyChain=d.optimiseFusionChain(ready,d.placements());
  d.state.owned[0].qty=1;d.save();const exported=d.baseExport(),roundtrip=d.validateBaseImport(exported);
  return {matches,one,chain,full,readyChain,rules:roundtrip.fusionKeepRules,profile:d.profileDataFromState().fusionKeepRules};
 });
 assert.deepEqual(reserved.matches,[true,false,true,false]);assert.equal(reserved.one.sell.length,0);
 assert.equal(reserved.one.placed[0].keepReason,'fusion');assert.equal(reserved.chain.length,0);
 assert.equal(reserved.full.sell.length,0);assert(reserved.full.overflow.length>0);assert(reserved.readyChain.length>0);
 assert.equal(reserved.rules.length,2);assert.deepEqual(reserved.profile,reserved.rules);
 await page.reload();await page.waitForFunction(()=>window.testPlan?.state.droids.length);
 assert.equal(await page.evaluate(()=>window.testPlan.state.fusionKeepRules.length),2);
 await page.goto(`http://127.0.0.1:${server.address().port}/#/base`);
 await page.click('#toggleCommandOptimise');
 await page.locator('[data-fusion-keep-settings]:visible').click();
 await page.waitForSelector('#addFusionKeepRule');assert((await page.locator('#modalRoot').innerText()).includes('LEGENDARY+'));
 await page.locator('[data-remove-fusion-rule]').first().click();await page.click('#closeFusionKeepRules');
 assert.equal(await page.evaluate(()=>window.testPlan.state.fusionKeepRules.length),1);
 console.log('PASS: incomplete fusion batch is kept; rarity/quality thresholds, profile persistence, export/import and rule controls work.');
 assert.deepEqual(errors,[]);
 console.log('PASS: reported full-Lounge profile completes four legal swaps and applies without losing droids.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
