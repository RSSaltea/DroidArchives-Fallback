const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchives/ui-test/node_modules/playwright')))}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data)});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1360,height:960}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.abort());
  await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.traitTest={state,save,route,placements,incomeForPlaced,materializePlacements,optimisedRows,validateBaseImport,baseExport,stationSlotIndices,autoPurchaseEligibleSlots,commitOwned,showSuperRebirthConfirm,showTraitModal,runFusion};'}));
  await page.goto(`http://127.0.0.1:${server.address().port}/#/traits`);
  await page.waitForFunction(()=>window.traitTest?.state.droids.length);
  assert.equal(await page.locator('.trait-catalogue .trait-card').count(),26);
  await page.locator('[data-trait-search]').fill('CB-23');assert.equal(await page.locator('.trait-catalogue .trait-card').count(),1);
  await page.locator('[data-trait-search]').fill('');
  assert(await page.locator('[data-roll-result]').innerText());
  await page.locator('[data-setting="offlineRate"]').fill('25');await page.locator('[data-setting="offlineRate"]').dispatchEvent('change');
  await page.locator('[data-setting="offlineCap"]').fill('3');await page.locator('[data-setting="offlineCap"]').dispatchEvent('change');
  assert.equal(await page.evaluate(()=>window.traitTest.validateBaseImport(window.traitTest.baseExport()).missionSettings.offlineRate),.25);
  await page.reload();await page.waitForFunction(()=>window.traitTest?.state.droids.length);
  assert.equal(await page.locator('[data-setting="offlineCap"]').inputValue(),'3');

  await page.locator('[data-roll-droid]').selectOption({label:'CB-23'});
  const hyper=await page.locator('[data-roll-target]').inputValue();
  await page.locator('[data-roll-current]').selectOption(hyper);
  assert.match(await page.locator('[data-roll-result]').innerText(),/already have/);
  await page.locator('[data-roll-current]').selectOption('-1');
  await page.locator('[data-roll-attempts]').fill('1000');
  assert.match(await page.locator('[data-roll-result]').innerText(),/100.00%/);

  if(process.env.TRAIT_SCREENSHOT)await page.screenshot({path:process.env.TRAIT_SCREENSHOT,fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert(await page.locator('.traits-page').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await page.setViewportSize({width:1360,height:960});
  const baseline=await page.evaluate(()=>{const t=window.traitTest;t.state.owned=[{name:'GONK',variant:'DEFAULT',qty:2,built:true,preferred:'WORKER'},{name:'CB-23',variant:'DEFAULT',qty:1,built:true,trait:{id:24,tier:'Rainbow',rerolls:2}}];t.state.multiplier=2;t.state.iconicTraits={};t.state.novaUpgrades={'lounge-slot':12};t.state.rebirth=40;t.state.autoPurchaseSlots=true;t.autoPurchaseEligibleSlots();t.save();location.hash='#/base';return t.incomeForPlaced(t.placements().placed);});
  assert.equal(await page.locator('#baseMissionTools .mission-tools').count(),1);
  await page.locator('.tm-canvas [data-slot="WORKER:0"]').first().click();
  await page.locator('[data-action="trait"]').click();
  await page.locator('#ownedTrait').selectOption('0');await page.locator('#ownedTraitTier').selectOption('Rainbow');await page.locator('#saveOwnedTrait').click();
  const result=await page.evaluate(()=>{const t=window.traitTest,p=t.placements();t.materializePlacements(p);t.save();const exp=t.baseExport(),imported=t.validateBaseImport(exp),rows=t.optimisedRows(p.placed,p.overflow);return {income:t.incomeForPlaced(p.placed),traits:imported.owned.filter(u=>u.trait),projectedTraits:rows.filter(u=>u.trait).length,slots:t.stationSlotIndices('LOUNGE').length,memory:imported.iconicTraits};});
  assert(result.income>baseline);assert.equal(result.traits.length,2);assert.equal(result.projectedTraits,2);assert.equal(result.slots,21);assert.equal(result.memory['CB-23'].id,24);
  await page.evaluate(()=>window.traitTest.showSuperRebirthConfirm(()=>window.traitTest.route(),true));
  await page.locator('#confirmSuperRebirth').click();
  const retained=await page.evaluate(()=>{const t=window.traitTest;return {owned:t.state.owned.length,trait:t.state.iconicTraits['CB-23']};});
  assert.equal(retained.owned,0);assert.equal(retained.trait.rerolls,2);
  await page.evaluate(()=>window.traitTest.commitOwned('CB-23','DEFAULT',1,'ASTROMECH',0));
  assert.equal(await page.evaluate(()=>window.traitTest.state.owned[0].trait.id),24);
  await page.reload();await page.waitForFunction(()=>window.traitTest?.state.droids.length);
  assert.equal(await page.evaluate(()=>window.traitTest.state.owned[0].trait.id),24);
  page.on('dialog',d=>d.accept());
  const preserved=await page.evaluate(()=>{const t=window.traitTest;t.state.rebirth=40;t.autoPurchaseEligibleSlots();t.state.owned=[0,1,2].map(slot=>({name:'GONK',variant:'DEFAULT',qty:1,built:true,preferred:'FUSION',preferredSlot:slot,...(slot===1?{trait:{id:14,tier:'Rainbow'}}:{})}));t.runFusion();return t.placements().placed.map(u=>({name:u.name,variant:u.variant,station:u.station,slot:u.slot,trait:u.trait}));});
  assert(preserved.some(u=>u.name==='GONK'&&u.variant==='DEFAULT'&&u.station==='FUSION'&&u.slot===1&&!u.trait));
  assert(preserved.some(u=>u.station==='FUSION_BUILD'));
  await page.evaluate(()=>{location.hash='#/base';window.traitTest.route();});
  assert.equal(await page.locator('.tm-canvas [data-slot="LOUNGE:20"]').count(),1);
  if(process.env.TRAIT_MAP_SCREENSHOT)await page.locator('.tm-canvas').screenshot({path:process.env.TRAIT_MAP_SCREENSHOT});
  assert.deepEqual(errors,[]);
  console.log('Trait page, mobile layout, per-copy editing, income, projection/import, 21 Lounge slots, Super Rebirth and reload passed.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

