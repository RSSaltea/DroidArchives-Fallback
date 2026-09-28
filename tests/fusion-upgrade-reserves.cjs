const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':{'.js':'text/javascript','.html':'text/html','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
 await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.t={state,save,applyProfileData,blankProfileData,placements,optimiseBase,incomeForPlaced,optimisedPlacements,safeOptimiseStepPlan,optimiseFusionChain,optimiseFusionBatches,showFusionKeepSettings,profileDataFromState,baseExport,validateBaseImport,autoPurchaseEligibleSlots,refreshBackgroundOptimise,optimiseInputStamp,readPreview:()=>optimisePreviewCache?.preview};'}));
 await page.addInitScript(notes=>localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(notes)),JSON.parse(fs.readFileSync(path.join(root,'data/patch-notes.json'))).notes.map(n=>n.id));
 const url=`http://127.0.0.1:${server.address().port}`;
 await page.goto(url);await page.waitForFunction(()=>window.t?.state.droids.length);
 const setup=async(count=2,mode='ready')=>page.evaluate(([count,mode])=>{
  const t=window.t;t.applyProfileData(t.blankProfileData());
  Object.assign(t.state,{rebirth:38,superRebirthGoal:40,cycle:0,novaUpgrades:{'fusion-tank':2},fusionPreferences:{goal:'rarity',mythics:'variant',recipes:true},fusionKeepRules:[{rarity:'MYTHIC',variant:'BESKAR'},{name:'SNOW MOUSE',variant:'STELLAR',upgradeOnly:true}],optimiseFuseFirst:mode!=='off',optimiseKeepDroidex:false,optimiseIncludeIconics:false});
  t.state.rebirths={0:[{to:39,requiredDroids:[{droidName:'SNOW MOUSE',variant:'KYBER'}]}]};t.autoPurchaseEligibleSlots();
  t.state.owned=Array.from({length:count},(_,i)=>({name:'SNOW MOUSE',variant:'STELLAR',qty:1,preferred:mode==='building'&&i===0?'FUSION_BUILD':'LOUNGE',preferredSlot:i,built:!(mode==='building'&&i===0),lockedSlot:mode==='locked'&&i===0}));
  t.state.owned.push({name:'RIC',variant:'STELLAR',qty:1,preferred:'LOUNGE',preferredSlot:count,built:true});
  const base=t.placements(),plan=t.optimiseBase(base,t.incomeForPlaced(base.placed)),target=t.optimisedPlacements(base,plan),steps=t.safeOptimiseStepPlan(base,target);
  return {complete:target.planComplete,issues:target.planIssues,steps,placed:target.placed,sell:target.sell,results:target.fusionResults};
 },[count,mode]);
 let result=await setup();assert.equal(result.complete,true,JSON.stringify(result.issues));assert(!result.steps.some(s=>s.type==='fuse'));assert(!result.sell.some(x=>x.name==='SNOW MOUSE'));assert.equal(result.placed.filter(x=>x.name==='SNOW MOUSE').length,2);
 result=await setup(3);assert.equal(result.complete,true,JSON.stringify(result.issues));assert.equal(result.steps.filter(s=>s.type==='fuse').length,1);assert(result.results.some(x=>x.name==='SNOW MOUSE'&&x.variant==='KYBER'&&!x.built));
 for(const mode of ['locked','building','off']){result=await setup(3,mode);assert.equal(result.complete,true,JSON.stringify(result.issues));assert(!result.steps.some(s=>s.type==='fuse'),mode);assert(!result.sell.some(x=>x.name==='SNOW MOUSE'));}
 await setup(3);await page.evaluate(()=>{t.save();t.refreshBackgroundOptimise();});
 await page.waitForFunction(()=>{const p=t.readPreview();return p?.inputStamp===t.optimiseInputStamp()&&p.projected.planComplete;},{},{timeout:65000});
 assert.equal(await page.evaluate(()=>t.readPreview().steps.filter(s=>s.type==='fuse').length),1,'real worker honours the rule and required Rebirth copy');
 for(const shell of ['index.html','classic.html']){
  await page.goto(`${url}/${shell}`);await page.waitForFunction(()=>window.t?.state.droids.length);await setup(2);
  await page.evaluate(()=>{t.state.fusionKeepRules=[];t.showFusionKeepSettings();});
  await page.locator('#fusionUpgradeSearch').fill('snow');await page.locator('#fusionUpgradeName').selectOption('SNOW MOUSE');await page.locator('#fusionUpgradeVariant').selectOption('STELLAR');
  assert.match(await page.locator('#fusionUpgradeCount').innerText(),/^2 owned/);
  assert.equal(await page.locator('#fusionUpgradeVariant option[value="KYBER"]').count(),0);
  await page.locator('#addFusionUpgradeRule').click();assert.match(await page.locator('#modalRoot').innerText(),/same-droid upgrade only/);
  const persisted=await page.evaluate(()=>({profile:t.profileDataFromState().fusionKeepRules,imported:t.validateBaseImport(t.baseExport()).fusionKeepRules}));
  assert(persisted.profile[0].upgradeOnly);assert.deepEqual(persisted.profile,persisted.imported);
  await page.reload();await page.waitForFunction(()=>window.t?.state.droids.length);assert.equal(await page.evaluate(()=>t.state.fusionKeepRules[0].upgradeOnly),true);
  await page.evaluate(()=>t.showFusionKeepSettings());
  for(const width of [1280,390]){await page.setViewportSize({width,height:800});assert(await page.locator('#modalRoot .modal').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}),'modal fits viewport');}
  if(process.env.UI_SCREENSHOT&&shell==='index.html')await page.screenshot({path:process.env.UI_SCREENSHOT});
  await page.locator('[data-remove-fusion-rule]').click();assert.equal(await page.evaluate(()=>t.state.fusionKeepRules.length),0);
 }
 if(process.env.PROFILE_EXPORT){
  const profile=JSON.parse(fs.readFileSync(process.env.PROFILE_EXPORT));
  const check=await page.evaluate(profile=>{
   const t=window.t;t.applyProfileData(t.validateBaseImport(profile));
   const mice=t.state.owned.filter(x=>x.name==='SNOW MOUSE'&&x.variant==='STELLAR');
   const assess=()=>{const base=t.placements(),plan=t.optimiseBase(base,t.incomeForPlaced(base.placed)),target=t.optimisedPlacements(base,plan);return {chain:t.optimiseFusionChain(target,base),sell:target.sell};};
   const before=assess();t.state.fusionKeepRules.push({name:'SNOW MOUSE',variant:'STELLAR',upgradeOnly:true});const after=assess();
   t.state.owned.push({...mice[0],qty:1,preferred:'LOUNGE',preferredSlot:2,lockedSlot:false});const third=assess();
   return {mice:mice.reduce((n,x)=>n+x.qty,0),before:before.chain.map(x=>x.spend),after:after.chain.map(x=>x.spend),soldMice:after.sell.filter(x=>x.name==='SNOW MOUSE'),third:third.chain.filter(x=>x.out?.name==='SNOW MOUSE')};
  },profile);
  assert.equal(check.mice,2);assert(check.after.flat().every(x=>x.name!=='SNOW MOUSE'));assert.equal(check.soldMice.length,0);assert.equal(check.third.length,1);assert.equal(check.third[0].out.variant,'KYBER');
  console.log('PASS: provided profile, two Stellar Snow Mice retained; mixed Snow Mouse batches before rule:',check.before.filter(parts=>parts.some(x=>x.name==='SNOW MOUSE')).length);
 }
 assert.deepEqual(errors,[]);console.log('PASS: two copies protected; third upgrades including Rebirth copy; locks/builds/off; worker; both shells; mobile; export/import/reload/removal');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
