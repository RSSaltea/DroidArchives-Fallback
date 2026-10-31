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



  for(const shell of ['index.html','classic.html']){
    for(const [slug,wanted,excluded] of [['scourge-prime','Hive Mind Master','Hyperdrive'],['cb-23','Hyperdrive','Hive Mind Master'],['gonk','Credit Per Second Multiplier','Hyperdrive'],['r2-d2','Double Crate Chance','Hive Mind Master']]){
      await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/droid/${slug}`);
      await page.waitForSelector('.droid-traits');
      const text=await page.locator('.droid-traits').textContent();assert(text.includes(wanted));assert(!text.includes(excluded));
      if(slug==='r2-d2')assert.match(text,/Recommended for your mission team/);
      await page.locator('.droid-traits summary').click();
      await page.setViewportSize({width:390,height:844});assert(await page.locator('.droid-traits').evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.setViewportSize({width:1360,height:960});
    }
    await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/traits`);await page.waitForSelector('[data-trait-availability]');
    assert.equal(await page.locator('.trait-exclusive-guide .trait-card').count(),11);
    await page.locator('[data-trait-availability]').selectOption('exclusive');assert.equal(await page.locator('.trait-catalogue .trait-card').count(),11);
    await page.locator('[data-trait-search]').fill('Scourge Prime');assert.equal(await page.locator('.trait-catalogue .trait-card').count(),1);
    assert.equal(await page.locator('.trait-catalogue a').getAttribute('href'),'#/droid/scourge-prime');
    await page.locator('[data-trait-search]').fill('');await page.locator('[data-trait-availability]').selectOption('ordinary');assert.equal(await page.locator('.trait-catalogue .trait-card').count(),6);
  }
  assert.deepEqual(errors,[]);console.log('Droid recommendations, eligibility, exclusive directory, filters and mobile layout passed in both shells.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});


