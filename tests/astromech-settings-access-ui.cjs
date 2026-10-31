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



  for(const shell of ['index.html','classic.html'])for(const width of [390,1360]){
    await page.setViewportSize({width,height:900});
    await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/base`);await page.waitForFunction(()=>window.traitTest?.state.droids.length);
    if(await page.locator('#baseDrawerButton').isVisible())await page.locator('#baseDrawerButton').click();
    await page.evaluate(()=>{document.querySelectorAll('details.side-group').forEach(e=>e.open=true);const b=document.querySelector('#toggleCommandOptimise');if(b?.getAttribute('aria-expanded')==='false')b.click();});
    const button=page.locator('[data-astromech-settings]:visible').first();await button.click();
    const select=page.locator('[data-astromech-role="CB-23"]');await select.selectOption('credits');await select.selectOption('mission');await page.locator('#closeAstromechSettings').click();
    await page.reload();await page.waitForFunction(()=>window.traitTest?.state.droids.length);
    assert.equal(await page.evaluate(()=>window.traitTest.state.astromechIconicRoles['CB-23']),'mission');
  }
  assert.deepEqual(errors,[]);console.log('Astromech settings open and save CB-23 Mission in both layouts on desktop and mobile.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});


