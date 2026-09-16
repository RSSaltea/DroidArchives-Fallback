const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')))}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data)});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const executablePath=process.env.DROID_BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file=>fs.existsSync(file));
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 try{
 const page=await browser.newPage({viewport:{width:1360,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('https://**/*',r=>r.abort());await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
 await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.fusionApplyTest={state,save,route,placements,optimiseBase,incomeForPlaced,optimisedPlacements,safeOptimiseStepPlan,validateBaseImport,baseExport,autoPurchaseEligibleSlots,stationSlotIndices,createOptimisePreview,applyOptimisedLayout,slotLogSession,forceUnreachablePlan:()=>{state.optimiseFuseFirst=false;protocolStepPlan=()=>[{type:"note",at:"WORKER",text:"Unreachable work destination"}];}};'}));
 await page.goto(base+'/#/base');await page.waitForFunction(()=>window.fusionApplyTest?.state.droids.length).catch(error=>{error.message+=`\nBrowser errors: ${errors.join('; ')}`;throw error});
 const profile=process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2],'utf8')):null;
 const result=await page.evaluate(profile=>{
  const t=window.fusionApplyTest;
  if(profile)Object.assign(t.state,t.validateBaseImport(profile));
  else{
   t.state.rebirth=34;t.state.cycle=0;t.state.superRebirthGoal=35;t.state.novaUpgrades={'fusion-tank':2};
   t.state.rebirths[0]=[];
   t.state.fusionPreferences={goal:'rarity',mythics:'reroll',recipes:false};
   t.state.fusionKeepRules=[{rarity:'LEGENDARY',variant:'GALACTIC'}];
   t.state.owned=[{name:'MECHA-DROID',qty:3},{name:'BB9',qty:2},{name:'CYCLO-GRAV',qty:1}].map(u=>({...u,variant:'GALACTIC',built:true,preferred:'LOUNGE'}));
   t.autoPurchaseEligibleSlots();
   for(const station of ['WORKER','BATTLE','ASTROMECH','BUILD','COMPANION'])for(const slot of t.stationSlotIndices(station))t.state.owned.push({name:'RIC',variant:'STELLAR',qty:1,preferred:station,preferredSlot:slot,built:true,lockedSlot:true});
  }
  t.state.sharedView=null;t.save();
  const base=t.placements(),target=t.optimisedPlacements(base,t.optimiseBase(base,t.incomeForPlaced(base.placed))),steps=t.safeOptimiseStepPlan(base,target);
  return {before:JSON.stringify(t.state.owned),base,target,steps};
 },profile);
 const rolls=result.steps.filter(s=>s.type==='fuse');assert.equal(rolls.filter(s=>s.fusion.rarity==='MYTHIC'&&s.fusion.variant==='GALACTIC').length,2);
 assert(!result.steps.some(s=>s.fusionBlocked||s.type==='note'));
 assert.equal(result.target.planComplete,true,JSON.stringify(result.target.planIssues));
 const pending=result.target.fusionResults.filter(r=>r.fusionUnknown);assert(pending.length>=2);
 const staleChecks=await page.evaluate(async()=>{
  const t=window.fusionApplyTest,checks=[];
  for(const change of ['setting','roster','landing']){
   const preview=t.createOptimisePreview(),oldSetting=t.state.optimiseKeepDroidex,oldQuantity=t.state.owned[0].qty,oldLandings=localStorage.getItem('droid-archive-slot-session');
   if(change==='setting')t.state.optimiseKeepDroidex=!oldSetting;
   if(change==='roster')t.state.owned[0].qty++;
   if(change==='landing')t.slotLogSession.set('Test recorded landing',{station:'WORKER',slot:0});
   const before=JSON.stringify(t.state.owned),storageBefore={...localStorage};
   await t.applyOptimisedLayout(preview);
   checks.push({change,before,after:JSON.stringify(t.state.owned),storageBefore,storageAfter:{...localStorage},pickerOpen:Boolean(document.querySelector('#fusionResultCancel'))});
   t.state.optimiseKeepDroidex=oldSetting;t.state.owned[0].qty=oldQuantity;
   if(oldLandings===null)localStorage.removeItem('droid-archive-slot-session');else localStorage.setItem('droid-archive-slot-session',oldLandings);
  }
  return checks;
 });
 for(const check of staleChecks){assert.equal(check.after,check.before,`stale ${check.change} does not overwrite the current roster`);assert.deepEqual(check.storageAfter,check.storageBefore);assert.equal(check.pickerOpen,false,`stale ${check.change} is rejected before collecting results`)}
 await page.goto(base+'/#/optimise');await page.waitForSelector('#applyOptimised').catch(error=>{error.message+=`\nBrowser errors: ${errors.join('; ')}`;throw error});await page.locator('#applyOptimised').click();await page.waitForSelector('#fusionResultCancel');
 assert.match(await page.locator('.picker-hint').innerText(),/Nothing is applied/);
 await page.locator('#fusionResultCancel').click();await page.waitForFunction(()=>!document.querySelector('#applyOptimised')?.disabled);
 assert.equal(await page.evaluate(()=>JSON.stringify(window.fusionApplyTest.state.owned)),result.before,'cancel is atomic');
 await page.locator('#applyOptimised').click();await page.waitForSelector('#fusionResultCancel');
 await page.locator('[data-result="CYCLENS"]').click();await page.waitForSelector('#fusionResultCancel');await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.querySelector('#applyOptimised')?.disabled);
 assert.equal(await page.evaluate(()=>JSON.stringify(window.fusionApplyTest.state.owned)),result.before,'cancel after a selection is still atomic');
 // Settings can change while the result picker is open. Complete all selections
 // after that change and verify the previously validated preview is discarded.
 await page.locator('#applyOptimised').click();await page.waitForSelector('#fusionResultCancel');
 const midPick=await page.evaluate(()=>{const t=window.fusionApplyTest,setting=t.state.optimiseKeepDroidex;t.state.optimiseKeepDroidex=!setting;return{setting,storage:{...localStorage}}});
 for(const expected of pending){await page.waitForSelector('#fusionResultCancel');await page.locator(`[data-result="${expected.rarity==='MYTHIC'?'CYCLENS':'MECHA-DROID'}"]`).click()}
 await page.waitForFunction(()=>!document.querySelector('#fusionResultCancel')&&document.querySelector('#applyOptimised')?.disabled);
 assert.equal(await page.evaluate(()=>JSON.stringify(window.fusionApplyTest.state.owned)),result.before,'changing settings during result collection does not apply the old roster');
 assert.deepEqual(await page.evaluate(()=>({...localStorage})),midPick.storage,'stale result selection does not save');
 await page.evaluate(setting=>{window.fusionApplyTest.state.optimiseKeepDroidex=setting;window.fusionApplyTest.route()},midPick.setting);
 await page.locator('#applyOptimised').click();
 const chosen=[];
 for(const expected of pending){
  await page.waitForSelector('#fusionResultCancel');
  const pick=expected.rarity==='MYTHIC'?'CYCLENS':'MECHA-DROID';chosen.push({...expected,name:pick});
  assert.match(await page.locator('.picker-hint').innerText(),new RegExp(`Fusion Build ${expected.slot+1}`));
  await page.locator(`[data-result="${pick}"]`).click();
 }
 await page.waitForURL('**/#/base');
 const saved=await page.evaluate(()=>window.fusionApplyTest.state.owned);
 const bag=rows=>{const b={};for(const u of rows){const k=u.name+'|'+u.variant;b[k]=(b[k]||0)+(u.qty||1)}return b};
 const expected=bag([...result.target.rows,...chosen.map(r=>({name:r.name,variant:r.variant,qty:1}))]);
 assert.deepEqual(bag(saved),expected,'saved roster matches consumed inputs and selected outputs exactly');
 for(const r of chosen){const held=saved.find(u=>u.name===r.name&&u.variant===r.variant&&u.preferred==='FUSION_BUILD'&&u.preferredSlot===r.slot);assert(held);assert(!held.built&&!held.lockedSlot)}
 await page.reload();await page.waitForFunction(()=>window.fusionApplyTest?.state.droids.length);
 assert.deepEqual(await page.evaluate(()=>window.fusionApplyTest.state.owned),saved,'applied fusions survive reload');
 // An ordinary route failure must receive the same Apply guard as a full
 // Fusion Build. Inject a route failure, keeping the real safety/UI pipeline.
 const blocked=await page.evaluate(()=>{const t=window.fusionApplyTest;t.forceUnreachablePlan();return t.createOptimisePreview()});
 assert.equal(blocked.projected.planComplete,false);
 assert(!blocked.steps.some(step=>step.fusionBlocked));
 await page.goto(base+'/#/optimise');await page.waitForSelector('#applyOptimised');
 assert(await page.locator('#applyOptimised').isDisabled(),'generic incomplete plans cannot be applied from the UI');
 const blockedStorage=await page.evaluate(async()=>{const before={...localStorage};await window.fusionApplyTest.applyOptimisedLayout();return{before,after:{...localStorage}}});
 assert.deepEqual(blockedStorage.after,blockedStorage.before,'blocked Apply does not save');
 assert.deepEqual(await page.evaluate(()=>window.fusionApplyTest.state.owned),saved,'the Apply function also rejects generic incomplete plans');
 await page.goto(base+'/?companion=1#/optimise');await page.waitForFunction(()=>window.fusionApplyTest?.state.droids.length&&window.__companionApplyOptimise);
 const companionGuard=await page.evaluate(()=>{const t=window.fusionApplyTest;t.forceUnreachablePlan();t.route();const before=JSON.stringify(t.state.owned),storageBefore={...localStorage},result=window.__companionApplyOptimise();return{result,before,after:JSON.stringify(t.state.owned),storageBefore,storageAfter:{...localStorage}}});
 assert.equal(companionGuard.result.applied,false,'companion also refuses an incomplete ordinary route');
 assert.equal(companionGuard.after,companionGuard.before);assert.deepEqual(companionGuard.storageAfter,companionGuard.storageBefore);
 assert.deepEqual(errors,[]);console.log('PASS: mixed Galactic rolls, cancellation, stale previews and result selection, exact consumption, saved reload and website/companion Apply guards');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
