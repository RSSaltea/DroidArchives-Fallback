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
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.abort());
 await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.testPlan={state,save,applyProfileData,placements,optimiseBase,incomeForPlaced,optimisedPlacements,safeOptimiseStepPlan,droidIncomeAt,blankProfileData,autoPurchaseEligibleSlots,stationSlotIndices,refreshBackgroundOptimise,optimiseInputStamp,fusionRebirthProtectedKeys,readPreview:()=>optimisePreviewCache?.preview};'}));
 await page.addInitScript(notes=>localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(notes)),JSON.parse(fs.readFileSync(path.join(root,'data/patch-notes.json'),'utf8')).notes.map(n=>n.id));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.waitForFunction(()=>window.testPlan?.state.droids.length);

 const setup=async(mode='ready',fuse=true)=>page.evaluate(([mode,fuse])=>{
  const t=window.testPlan;window.originalRebirthTables??=t.state.rebirths;t.state.rebirths=window.originalRebirthTables;t.applyProfileData(t.blankProfileData());
  Object.assign(t.state,{rebirth:40,superRebirthGoal:40,cycle:0,novaUpgrades:{'fusion-tank':2},fusionPreferences:{goal:'rarity',mythics:mode==='mythic'?'variant':'off',recipes:false},fusionKeepRules:[{rarity:'EPIC',variant:'DEFAULT'}],optimiseFuseFirst:fuse,optimiseKeepDroidex:false});
  if(mode==='rebirth'){t.state.rebirth=39;t.state.rebirths={...t.state.rebirths,0:[{to:40,requiredDroids:['SEN-TRI','GUNRUNNER','OPTI-POD'].map(droidName=>({droidName,variant:'KYBER'}))}]};}
  t.autoPurchaseEligibleSlots();
  const add=(name,variant,station,slot,extras={})=>t.state.owned.push({name,variant,qty:1,preferred:station,preferredSlot:slot,built:true,...extras});
  for(const station of ['WORKER','BATTLE','ASTROMECH','BUILD','COMPANION','UPGRADE_CHIP','PROTOCOL_WORKER_CREDITS','PROTOCOL_WORKER_CRAFTING','PROTOCOL_ASTROMECH_CREDITS','PROTOCOL_ASTROMECH_CRAFTING','PROTOCOL_BATTLE_CREDITS','PROTOCOL_BATTLE_CRAFTING']){
   for(const slot of t.stationSlotIndices(station))add(station.startsWith('PROTOCOL_')?'TDA':'RIC','STELLAR',station,slot,{lockedSlot:true});
  }
  const inputs=mode==='mythic'?[['RIC','GALACTIC'],['RIC','GALACTIC'],['CYCLENS','GALACTIC'],['DRFT-R','BESKAR'],['LOADLIFTER','BESKAR'],['SNOW MOUSE','BESKAR']]:[['SEN-TRI','KYBER_GREEN'],['GUNRUNNER','KYBER_BLUE'],['OPTI-POD','KYBER_PURPLE'],['SEN-TRI','KYBER_GREEN'],['GUNRUNNER','KYBER_BLUE'],['OPTI-POD','KYBER_PURPLE']];
  for(const slot of t.stationSlotIndices('LOUNGE')){const [name,variant]=inputs[slot]||['KX','GALACTIC'];add(name,variant,'LOUNGE',slot,{lockedSlot:slot>=inputs.length||mode==='inputs-locked'});}
  for(const slot of t.stationSlotIndices('FUSION_BUILD'))add((mode==='mythic'?['CHOPPER','BB-8','R2-D2']:['CYCLENS','LOADLIFTER','RIC'])[slot],mode==='mythic'?'DEFAULT':'GALACTIC','FUSION_BUILD',slot,{built:mode!=='building',lockedSlot:mode==='locked'});
  const base=t.placements(),plan=t.optimiseBase(base,t.incomeForPlaced(base.placed)),target=t.optimisedPlacements(base,plan),steps=t.safeOptimiseStepPlan(base,target);
  window.fusionCase={base,plan,target,steps};
  return {protected:[...t.fusionRebirthProtectedKeys()],before:base.placed.length,after:target.placed.length+(target.fusionResults||[]).filter(u=>u.fusionUnknown).length,gain:plan.gain,complete:target.planComplete,issues:target.planIssues,steps,results:target.fusionResults,overflow:target.overflow};
 },[mode,fuse]);
 const result=await setup();
 assert.equal(result.complete,true,JSON.stringify(result.issues));assert.equal(result.gain,0);
 assert.equal(result.steps.filter(s=>s.type==='fuse').length,2,JSON.stringify(result.steps));
 assert.equal(result.before-result.after,4,'two batches consume six inputs and create two results');
 assert.equal(result.results.length,2);assert(result.results.every(u=>u.built===false),'results cannot move before building');
 assert.equal(result.overflow.length,0);
 const firstFuse=result.steps.findIndex(s=>s.type==='fuse'),secondInput=result.steps.findIndex((s,i)=>i>firstFuse&&s.type==='fuse-in');
 assert(secondInput>firstFuse,'the first fusion empties the table before the next batch');
 assert(result.steps.some(s=>s.type==='move'&&s.from?.station==='FUSION_BUILD'&&s.to?.station==='LOUNGE'),'make tank room in freed storage');
 // Worker preparation must carry the same consumed copies into verification.
 await page.evaluate(()=>{window.testPlan.save();window.testPlan.refreshBackgroundOptimise()});
 await page.waitForFunction(()=>{const t=window.testPlan,p=t.readPreview();return p?.inputStamp===t.optimiseInputStamp()&&p.projected.planComplete},{},{timeout:65000});
 assert.equal(await page.evaluate(()=>window.testPlan.readPreview().steps.filter(s=>s.type==='fuse').length),2);
 for(const mode of ['locked','building','inputs-locked']){
  const blocked=await setup(mode);assert.equal(blocked.complete,true,JSON.stringify(blocked.issues));
  assert.equal(blocked.steps.filter(s=>s.type==='fuse').length,0,mode+' tanks cannot be emptied');assert.equal(blocked.before,blocked.after);
 }
 const protectedCase=await setup('rebirth');assert.equal(protectedCase.complete,true,JSON.stringify(protectedCase.issues));
 assert.equal(protectedCase.steps.filter(s=>s.type==='fuse').length,1,'keep one copy of each future rebirth requirement');
 assert(protectedCase.steps.filter(s=>s.type==='fuse').flatMap(s=>s.inputs).every(key=>!protectedCase.protected.includes(key)));
 const mythic=await setup('mythic');assert.equal(mythic.complete,true,JSON.stringify(mythic.issues));
 assert.equal(mythic.steps.filter(s=>s.type==='fuse').length,2,'random Mythic variant upgrades qualify without enabling rerolls');
 assert.deepEqual(mythic.results.map(x=>x.variant).sort(),['GALACTIC','STELLAR']);assert(mythic.results.every(x=>x.fusionUnknown&&x.rarity==='MYTHIC'&&!x.built),JSON.stringify(mythic.results));
 const off=await setup('ready',false);assert.equal(off.steps.filter(s=>s.type==='fuse').length,0);assert.equal(off.before,off.after);
 assert.deepEqual(errors,[]);console.log('PASS: zero-income fusion, full storage, consecutive batches, real worker, locked and unfinished tanks, fuse off');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exit(1);});
