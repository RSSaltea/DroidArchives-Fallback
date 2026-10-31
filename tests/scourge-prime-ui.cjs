const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require(path.join(__dirname,'../research/tools/ui-test/node_modules/playwright')))}
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
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.traitTest={prepareOptimiseLayout,state,save,route,placements,incomeForPlaced,materializePlacements,optimisedRows,validateBaseImport,baseExport,stationSlotIndices,autoPurchaseEligibleSlots,commitOwned,showSuperRebirthConfirm,showTraitModal,runFusion,refreshProfileCatalogue,rebirthVariantReady,nextVariant};'}));
  await page.goto(`http://127.0.0.1:${server.address().port}/#/traits`);
  await page.waitForFunction(()=>window.traitTest?.state.droids.length);


  await page.evaluate(()=>{window.primeNow=Date.parse('2026-10-31T13:59:59Z');Date.now=()=>window.primeNow;const t=window.traitTest;t.state.owned=[];t.commitOwned('SCOURGE PRIME','DEFAULT');});
  assert.equal(await page.evaluate(()=>window.traitTest.state.owned.length),0);
  await page.evaluate(()=>{window.primeNow=Date.parse('2026-10-31T14:00:00Z');const t=window.traitTest;t.commitOwned('SCOURGE PRIME','DEFAULT',1,'PROTOCOL_WORKER_CREDITS',0);});
  assert.equal(await page.evaluate(()=>window.traitTest.state.owned.filter(x=>x.name==='SCOURGE PRIME').length),1);
  const result=await page.evaluate(()=>{const t=window.traitTest;
    t.state.rebirth=40;t.state.autoPurchaseSlots=true;t.autoPurchaseEligibleSlots();t.state.multiplier=2;
    t.state.owned=[{name:'SCOURGE PRIME',variant:'DEFAULT',qty:1,preferred:'PROTOCOL_WORKER_CREDITS',preferredSlot:0,trait:{id:26,tier:'Rainbow',rerolls:9}},{name:'GONK',variant:'SCOURGE',qty:1,preferred:'WORKER',preferredSlot:0},{name:'GONK',variant:'DEFAULT',qty:1,preferred:'WORKER',preferredSlot:1}];t.save();
    const p=t.placements(),saved=t.validateBaseImport(t.baseExport()),base=t.state.droids.find(d=>d.name==='GONK');
    return {saved:saved.owned.find(x=>x.name==='SCOURGE PRIME'),income:t.incomeForPlaced(p.placed),expected:(base.variants.SCOURGE.income+base.variants.DEFAULT.income)*1.1*2*3+(base.variants.SCOURGE.income*2+base.variants.DEFAULT.income)*7*.1045};});
  assert.equal(result.saved.trait.id,26);assert.equal(result.saved.trait.rerolls,9);assert(Math.abs(result.income-result.expected)<1e-6,JSON.stringify(result));
  const plan=await page.evaluate(()=>{const t=window.traitTest,before=JSON.stringify(t.state.owned);const p=t.prepareOptimiseLayout();return {unchanged:before===JSON.stringify(t.state.owned),before:t.incomeForPlaced(p.baseP.placed),after:t.incomeForPlaced(p.projected.placed),prime:[...p.projected.placed,...p.projected.overflow].find(x=>x.name==='SCOURGE PRIME')};});
  assert(plan.unchanged);assert(plan.after>=plan.before-1e-6);assert.equal(plan.prime.trait.id,26);
  await page.reload();await page.waitForFunction(()=>window.traitTest?.state.droids.length);
  assert.equal(await page.evaluate(()=>window.traitTest.state.owned.find(x=>x.name==='SCOURGE PRIME').trait.id),26);
  for(const shell of ['index.html','classic.html']){
    await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/droid/scourge-prime`);await page.waitForFunction(()=>window.traitTest?.state.droids.length);
    assert.match(await page.locator('#app').innerText(),/3x regional credits/i);
    assert(await page.locator('.infobox .info-image img').evaluate(i=>i.complete&&i.naturalWidth===512));
    await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/traits`);await page.waitForSelector('[data-roll-droid]');
    await page.locator('[data-roll-droid]').selectOption({label:'SCOURGE PRIME'});
    assert.match(await page.locator('[data-roll-target]').innerText(),/Hive Mind Master/);
    await page.locator('[data-roll-current]').selectOption('0');await page.locator('[data-roll-count]').fill('9');
    assert.match(await page.locator('[data-roll-result]').innerText(),/2,500 V-Bucks/);
    await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/event`);await page.waitForSelector('.event-panel');
    assert.match(await page.locator('#app').innerText(),/120,000 progress/i);
    await page.setViewportSize({width:390,height:844});assert(await page.locator('.event-page').evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.setViewportSize({width:1360,height:960});
  }
  assert.deepEqual(errors,[]);console.log('Prime event gate, native portrait, live Hive income, trait/profile round-trip, calculator and both shells passed.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});


