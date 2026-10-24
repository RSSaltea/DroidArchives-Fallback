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
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.traitTest={state,save,route,placements,incomeForPlaced,materializePlacements,optimisedRows,validateBaseImport,baseExport,stationSlotIndices,autoPurchaseEligibleSlots,commitOwned,showSuperRebirthConfirm,showTraitModal,runFusion,refreshProfileCatalogue,rebirthVariantReady,nextVariant};'}));
  await page.goto(`http://127.0.0.1:${server.address().port}/#/traits`);
  await page.waitForFunction(()=>window.traitTest?.state.droids.length);

  const result=await page.evaluate(()=>{const t=window.traitTest;
    if(!t.rebirthVariantReady('SCOURGE','KYBER')||t.nextVariant('SCOURGE')!==null)throw Error('Scourge rebirth/upgrade rules');
    t.state.owned=[{name:'GONK',variant:'SCOURGE',qty:2,built:true,preferred:'WORKER'}];t.state.multiplier=10;t.state.rebirth=40;t.state.autoPurchaseSlots=true;t.autoPurchaseEligibleSlots();t.save();
    const p=t.placements(),saved=t.validateBaseImport(t.baseExport());return {count:saved.owned.filter(u=>u.variant==='SCOURGE').reduce((n,u)=>n+u.qty,0),income:t.incomeForPlaced(p.placed),base:t.state.droids.find(d=>d.name==='GONK').variants.SCOURGE.income};});
  assert.equal(result.count,2);assert(Math.abs(result.income-(result.base*2*11+result.base*2*.1045))<1e-6);
  for(const shell of ['index.html','classic.html']){
    await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/droid/gonk`);
    await page.waitForFunction(()=>window.traitTest?.state.droids.length);
    await page.locator('[data-v="SCOURGE"]').click();
    assert.match(await page.locator('.infobox .info-image img').getAttribute('src'),/scourge/);
    assert(await page.locator('.infobox .info-image img').evaluate(i=>i.complete&&i.naturalWidth===512));
    await page.locator('#addBlueprintThis').click();
    await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/event`);
    await page.waitForSelector('.event-panel');assert.match(await page.locator('#app').innerText(),/Scourgedex rewards/i);
    await page.setViewportSize({width:390,height:844});
    assert(await page.locator('.event-page').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    await page.setViewportSize({width:1360,height:960});
  }
  assert.deepEqual(errors,[]);console.log('Scourge profile round-trip, Hive Mind income, portraits, blueprint action and both page shells passed.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});


