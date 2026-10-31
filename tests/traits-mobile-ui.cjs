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



  await page.evaluate(()=>{const t=window.traitTest;t.state.rebirth=40;t.state.multiplier=100000;t.state.autoPurchaseSlots=true;t.autoPurchaseEligibleSlots();t.state.owned=[0,2,4,6,8].map((slot,i)=>({name:i===4?'R2-D2':'ECG',variant:i===4?'DEFAULT':'DIAMOND',qty:1,preferred:'ASTROMECH',preferredSlot:slot}));t.state.missionSettings={...t.state.missionSettings,ships:{0:4,2:4,4:4,6:4,8:4}};t.save();});
  for(const shell of ['index.html','classic.html'])for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});
    await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/traits`);await page.waitForSelector('[data-ship]');
    assert.equal(await page.locator('[data-ship]').count(),5);
    assert(await page.locator('.mission-tools abbr').count()>0);
    const overflow=await page.evaluate(()=>[...document.querySelectorAll('.trait-card select,.trait-tiers dd,.trait-filters .form-control')].filter(e=>{const parent=e.closest('.trait-card')||e.closest('label'),a=e.getBoundingClientRect(),b=parent?.getBoundingClientRect();return e.scrollWidth>e.clientWidth+2||b&&(a.right>b.right+1||a.left<b.left-1);}).map(e=>({html:e.outerHTML.slice(0,80),width:e.clientWidth,scroll:e.scrollWidth,box:e.getBoundingClientRect().toJSON(),parent:(e.closest('.trait-card')||e.closest('label')).getBoundingClientRect().toJSON()})));
    assert.deepEqual(overflow,[],shell+' '+width+' controls or values overflow');
    assert(await page.locator('.traits-page').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    await page.locator('[data-ship="0"]').selectOption('0');
    await page.waitForFunction(()=>document.querySelector('[data-ship="0"]').value==='0');
    if(width===390)for(const route of ['event','droid/scourge-prime','nova-shop/scourge-surge-token','cantina-shop','base','optimise','droids','rebirth']){
      await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/${route}`);await page.waitForFunction(()=>window.traitTest?.state.droids.length);await page.waitForTimeout(100);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),shell+' '+route+' overflows viewport');
      if(route==='event')assert.match(await page.locator('#app').innerText(),/Scourge Surge/i);
      if(route==='nova-shop/scourge-surge-token')assert.match(await page.locator('#app').innerText(),/30 seconds/i);
    }
  }
  assert.deepEqual(errors,[]);console.log('Populated mission controls and large numbers fit at 320/390/768/1440px; major pages fit mobile in both shells.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});


