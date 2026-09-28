// Iconic planning, real background worker, checkpoint map, returns and persistence.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')));}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.json':'application/json','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data)});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const screenshots=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'droid-iconics-'));
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('https://**/*',r=>r.abort());
  await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.t={state,save,applyProfileData,blankProfileData,baseExport,profileDataFromState,normalizeProfileDoc,validateBaseImport,placements,prepareOptimiseLayout,optimiseInputStamp,applyOptimisedLayout,stationSlotIndices,autoPurchaseEligibleSlots,moveUnitToSlot,basePageV2,read:()=>optimisePreviewCache?.preview};'}));
  const url=`http://127.0.0.1:${server.address().port}`;
  await page.goto(url+'/#/base');await page.waitForFunction(()=>window.t?.state.droids.length);
  const result=await page.evaluate(()=>{
   const s=t.state,reset=()=>{t.applyProfileData(t.blankProfileData());s.rebirth=2;s.autoPurchaseSlots=true;s.optimiseKeepDroidex=false;t.autoPurchaseEligibleSlots();};
   const evaluate=()=>{const before=JSON.stringify(s.owned),ref=s.owned,result=t.prepareOptimiseLayout();if(before!==JSON.stringify(s.owned)||ref!==s.owned)throw Error('Planning changed owned droids');return result;};
   reset();s.optimiseIncludeIconics=true;s.novaIconicUnlocks=['DJ R-3X'];const empty=evaluate();
   const strong=s.droids.filter(d=>d.type==='BATTLE'&&d.rarity!=='ICONIC').sort((a,b)=>b.variants.DEFAULT.income-a.variants.DEFAULT.income)[0];
   s.owned=['WORKER','ASTROMECH','BATTLE'].flatMap(station=>t.stationSlotIndices(station).map(slot=>({name:station==='WORKER'?'MOUSE':strong.name,variant:'DEFAULT',qty:1,preferred:station,preferredSlot:slot})));
   s.optimiseIncludeIconics=false;const off=evaluate();s.optimiseIncludeIconics=true;const on=evaluate();
   s.novaIconicUnlocks=[];const locked=evaluate();s.novaIconicUnlocks=['DJ R-3X'];s.owned.push({name:'DJ R-3X',variant:'DEFAULT',qty:1,preferred:'BUILD'});const owned=evaluate();s.owned.pop();
   s.owned.forEach(u=>u.lockedSlot=true);const allLocked=evaluate();s.owned.forEach(u=>delete u.lockedSlot);
   const exported=t.baseExport(),normalized=t.normalizeProfileDoc({profiles:[{id:'a',data:t.profileDataFromState()},{id:'b',data:t.blankProfileData()}]});
   t.applyProfileData(normalized.profiles[1].data);const blank=s.optimiseIncludeIconics;t.applyProfileData(normalized.profiles[0].data);
   const restored=s.optimiseIncludeIconics,legacy=t.validateBaseImport({owned:[]}).optimiseIncludeIconics,roundtrip=t.validateBaseImport(exported).optimiseIncludeIconics;
   // Temporary borrowing of locked companions is required to buy.
   s.novaUpgrades['companion-slot']=1;t.autoPurchaseEligibleSlots();
   s.owned.push({name:'CHOPPER',variant:'DEFAULT',qty:1,preferred:'COMPANION',preferredSlot:0,lockedSlot:true},{name:'BB-8',variant:'DEFAULT',qty:1,preferred:'COMPANION',preferredSlot:1,lockedSlot:true});
   t.save();return {empty:empty.baseP.purchases,off:off.baseP.purchases,on:on.baseP.purchases,locked:locked.baseP.purchases,owned:owned.baseP.purchases,allLocked:allLocked.baseP.purchases,blank,restored,legacy,roundtrip};
  });
  console.log('selection',JSON.stringify(result));
  assert.equal(result.empty.length,0);assert(!result.off?.length);assert.equal(result.on.length,1);assert.equal(result.on[0].name,'DJ R-3X');
  for(const k of ['locked','owned','allLocked'])assert.equal(result[k].length,0,k);
  assert(!result.blank&&!result.legacy&&result.restored&&result.roundtrip);
  await page.goto(url+'/#/optimise');
  await page.waitForFunction(()=>{const p=t.read();return p?.inputStamp===t.optimiseInputStamp()&&p.projected.planComplete},{},{timeout:65000});
  const route=await page.evaluate(async()=>{
   const p=t.read(),buys=p.steps.filter(s=>s.type==='buy'),before=t.state.owned.some(u=>u.name==='DJ R-3X');
   const locks=p.projected.placed.filter(u=>u.station==='COMPANION'&&u.lockedSlot).map(u=>({name:u.name,slot:u.slot}));
   return {buys,before,locks,steps:p.steps.length};

  });
  assert.equal(route.buys.length,1);assert(!route.before);assert.equal(route.locks.length,2);assert.match(route.buys[0].text,/Cantina/);assert(!/\u2014 credits/.test(route.buys[0].text));
  await page.locator('[data-apply-through]').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(screenshots,'purchase-checkpoint.png')});
  await page.locator('[data-apply-through]').click();
  await page.locator('[data-purchase-checkpoint]').waitFor();
  await page.screenshot({path:path.join(screenshots,'map-checkpoint.png')});
  assert.equal(await page.evaluate(()=>t.state.owned.find(u=>u.name==='DJ R-3X').preferred),'LOUNGE');
  assert.equal(await page.evaluate(()=>t.state.owned.filter(u=>u.lockedSlot&&u.preferred==='COMPANION').length),2);
  await page.evaluate(()=>{const u=t.placements().placed.find(u=>u.name==='DJ R-3X');t.moveUnitToSlot(`${u.source}:${u.unit}`,'LOUNGE',4,()=>t.basePageV2());});
  await page.locator('[data-purchase-checkpoint]').waitFor();
  assert.equal(await page.evaluate(()=>t.state.owned.find(u=>u.name==='DJ R-3X').preferredSlot),4);
  await page.locator('[data-continue-optimise]').click();
  await page.waitForFunction(()=>{const p=t.read();return p?.inputStamp===t.optimiseInputStamp()&&p.projected.planComplete},{},{timeout:65000});
  assert.equal(await page.evaluate(()=>t.read().steps.filter(s=>s.type==='buy').length),0);
  assert.equal(await page.evaluate(()=>t.read().baseP.placed.find(u=>u.name==='DJ R-3X').slot),4);
  await page.evaluate(()=>t.applyOptimisedLayout(t.read()));
  assert.equal(await page.evaluate(()=>t.state.owned.filter(u=>u.name==='DJ R-3X').length),1);
  await page.goto(url+'/#/optimise');
  assert(await page.locator('[data-optimise-iconics]:visible').first().isChecked());
  await page.locator('[data-optimise-iconics]:visible').first().uncheck();assert.equal(await page.evaluate(()=>t.state.optimiseIncludeIconics),false);
  await page.reload();await page.waitForFunction(()=>window.t?.state.droids.length);assert.equal(await page.evaluate(()=>t.state.optimiseIncludeIconics),false);
  await page.goto(url+'/classic.html#/optimise');await page.waitForFunction(()=>window.t?.state.droids.length);
  await page.locator('[data-optimise-iconics]:visible').first().check();assert.equal(await page.evaluate(()=>t.state.optimiseIncludeIconics),true);
  await page.setViewportSize({width:390,height:844});assert(await page.locator('[data-optimise-iconics]:visible').first().isVisible());
  await page.screenshot({path:path.join(screenshots,'mobile.png')});
  const storage=await page.evaluate(()=>{
    t.applyProfileData(t.blankProfileData());t.state.optimiseIncludeIconics=true;
    t.state.owned=t.state.droids.filter(d=>d.rarity==='ICONIC').map(d=>({name:d.name,variant:'DEFAULT',qty:1,built:true}));
    const p=t.prepareOptimiseLayout(),remaining=p.projected.placed.map(u=>u.name),returned=p.projected.returns.map(u=>u.name);
    if(p.projected.sell.some(u=>returned.includes(u.name)))throw Error('Returns must not become sales');
    t.save();return {remaining,returned,reserve:p.projected.iconicReserve};
  });
  assert(storage.returned.length>0,'low-tier base returns Iconics that do not improve its priorities');assert.equal(storage.reserve,2);
  await page.waitForFunction(()=>{const p=t.read();return p?.inputStamp===t.optimiseInputStamp()&&p.projected.planComplete},{},{timeout:65000});
  const returned=await page.evaluate(async()=>{
    const p=t.read(),names=p.projected.returns.map(u=>u.name);await t.applyOptimisedLayout(p);
    return {names,unlocks:t.state.novaIconicUnlocks,owned:t.state.owned.map(u=>u.name)};
  });
  assert(returned.names.length>0);for(const name of returned.names){assert(returned.unlocks.includes(name));assert(!returned.owned.includes(name));}
  console.log('PASS: low-tier returns, storage reserve, worker replay and retained unlocks.',JSON.stringify(storage));
  console.log('Screenshots: '+screenshots);
  assert.deepEqual(errors,[]);console.log('PASS: selection, default off, profiles/import, worker Buy route, locked companions, Apply and both shells.',JSON.stringify(route));
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
