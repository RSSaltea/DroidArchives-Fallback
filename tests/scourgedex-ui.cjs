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
  await page.addInitScript(()=>localStorage.setItem('droid-archives-site-help-v1','{"invited":true}'));
  await page.route('https://**/*',r=>r.abort());
  await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.traitTest={state,save,route,placements,incomeForPlaced,materializePlacements,optimisedRows,validateBaseImport,baseExport,stationSlotIndices,autoPurchaseEligibleSlots,commitOwned,showSuperRebirthConfirm,showTraitModal,runFusion,refreshProfileCatalogue,rebirthVariantReady,nextVariant,applyProfileData,profileDataFromState,blankProfileData,prepareOptimiseWorkerJob,createOptimisePreview,applyOptimisedLayout,optimiseTickedProjection,optimiseInputStamp,rebirthGoal,normaliseScourgedex,prepareScourgeSubmissions,safeOptimiseStepPlan,finishOptimisePreview,backgroundOptimisePreview};'}));
  await page.goto(`http://127.0.0.1:${server.address().port}/#/traits`);
  await page.waitForFunction(()=>window.traitTest?.state.droids.length);


  page.on('dialog',dialog=>dialog.accept());
  for(const shell of ['index.html','classic.html']){
    await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/scourgedex`);
    await page.waitForSelector('.scourgedex-card');
    assert.equal(await page.locator('.scourgedex-card').count(),90);
    await page.locator('#scourgedexCompleted').fill('3');await page.locator('#scourgedexCompleted').dispatchEvent('change');
    await page.locator('[data-scourgedex-name="GONK"]').click();
    await page.reload();await page.waitForSelector('.scourgedex-card');
    assert.equal(await page.locator('#scourgedexCompleted').inputValue(),'3');
    assert.equal(await page.locator('[data-scourgedex-name="GONK"]').getAttribute('aria-pressed'),'true');
    const saved=await page.evaluate(()=>{const t=window.traitTest;return t.validateBaseImport(t.baseExport()).scourgedex;});
    assert.equal(saved.completed,3);assert(saved.submitted.includes('GONK'));
    await page.locator('#scourgedexSearch').fill('GONK');assert.equal(await page.locator('.scourgedex-card:visible').count(),1);
    await page.locator('#scourgedexSearch').fill('');
    await page.screenshot({path:`research/uefn/november02/scourgedex-${shell}.png`,fullPage:false});
    await page.setViewportSize({width:390,height:844});
    assert(await page.locator('.scourgedex-page').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    await page.screenshot({path:`research/uefn/november02/scourgedex-mobile-${shell}.png`});
    await page.setViewportSize({width:1360,height:960});
    await page.evaluate(()=>{window.traitTest.state.scourgedex={completed:0,submitted:[],handIns:0};window.traitTest.save();});
  }
  const applied=await page.evaluate(async()=>{
    const t=window.traitTest;
    t.state.rebirth=40;t.state.superRebirthGoal=40;t.state.cycle=0;t.state.autoPurchaseSlots=true;t.state.optimiseIncludeIconics=false;
    t.state.owned=[{name:'GONK',variant:'SCOURGE',qty:1,built:true,preferred:'LOUNGE',preferredSlot:0}];t.autoPurchaseEligibleSlots();t.save();
    const base=t.placements(),target={placed:base.placed.map(u=>({...u})),sell:[],overflow:[],fusing:[]};
    const steps=t.safeOptimiseStepPlan(base,target);
    if(!target.planComplete)throw Error(JSON.stringify(target.planIssues));
    const preview=t.finishOptimisePreview(base,{moves:[]},target,steps,t.optimiseInputStamp());
    await t.applyOptimisedLayout(preview);
    return{steps:steps.map(s=>s.type),owned:t.state.owned,progress:t.state.scourgedex};
  });
  assert(applied.steps.includes('submit'));assert.equal(applied.owned.length,0);assert.deepEqual(applied.progress.submitted,['GONK']);assert.equal(applied.progress.handIns,1);
  // Reapplying a stale preview must not double count; the normal apply guard
  // includes Scourgedex progress as part of the input stamp.
  const checks=await page.evaluate(()=>{
    const t=window.traitTest,original=t.profileDataFromState();t.applyProfileData({...t.blankProfileData(),scourgedex:{completed:9,submitted:['GONK'],handIns:10}});
    const roundtrip=t.profileDataFromState().scourgedex;t.applyProfileData(original);return roundtrip;
  });assert.equal(checks.completed,9);assert.deepEqual(checks.submitted,['GONK']);
  // Finishing the collection does not grant a bonus until the reset is recorded; no weekday restriction.
  await page.evaluate(()=>{const t=window.traitTest;t.state.scourgedex={completed:2,submitted:t.state.droids.filter(d=>d.rarity!=='ICONIC'&&d.variants?.SCOURGE).map(d=>d.name),handIns:90};location.hash='#/scourgedex';t.route();});
  await page.locator('#scourgedexReset').click();
  await page.waitForFunction(()=>window.traitTest.state.scourgedex.completed===3&&!document.querySelector('.scourge-wipe'));
  assert.equal(await page.locator('.scourgedex-card[aria-pressed="true"]').count(),0);
  // Exercise the actual worker, rather than just the synchronous route helper.
  await page.evaluate(()=>{const t=window.traitTest;t.state.rebirth=40;t.state.owned=[{name:'GONK',variant:'SCOURGE',qty:1,built:true,preferred:'WORKER',preferredSlot:0}];t.save();location.hash='#/optimise';t.route();});
  await page.waitForFunction(()=>window.traitTest.backgroundOptimisePreview()?.projected?.planComplete,{},{timeout:60000});
  const worker=await page.evaluate(()=>{const p=window.traitTest.backgroundOptimisePreview();return {submissions:p.projected.submissions?.map(u=>u.name),steps:p.steps.map(s=>s.type)};});
  assert.deepEqual(worker.submissions,['GONK']);assert(worker.steps.includes('submit'));
  const partial=await page.evaluate(()=>{
   const t=window.traitTest;t.state.rebirth=40;t.state.owned=[{name:'GONK',variant:'SCOURGE',qty:1,built:true,preferred:'LOUNGE',preferredSlot:0},{name:'R2',variant:'SCOURGE',qty:1,built:true,preferred:'LOUNGE',preferredSlot:1}];t.save();
   const base=t.placements(),target={placed:base.placed.map(u=>({...u})),sell:[],overflow:[],fusing:[]};const steps=t.safeOptimiseStepPlan(base,target);
   const preview=t.finishOptimisePreview(base,{moves:[]},target,steps,t.optimiseInputStamp());
   const part=t.optimiseTickedProjection(preview,1);return {count:part?.submissions.length,remaining:part?.placed.length,overflow:part?.overflow.length};
  });assert.deepEqual(partial,{count:1,remaining:1,overflow:0});
  const beforeSRB=await page.evaluate(()=>structuredClone(window.traitTest.state.scourgedex));
  await page.evaluate(()=>window.traitTest.showSuperRebirthConfirm(()=>{}));
  await page.locator('#confirmSuperRebirth').click();await page.locator('#confirmSuperRebirth').click();
  assert.equal(await page.evaluate(()=>window.traitTest.state.rebirth),0);
  assert.deepEqual(await page.evaluate(()=>window.traitTest.state.scourgedex),beforeSRB);
  assert.deepEqual(errors,[]);console.log('Scourgedex UI: both shells, mobile, persistence, profile roundtrip and Apply records hand-ins passed.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
