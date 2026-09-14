const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')));}
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(err,body)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(body);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{

  const context=await browser.newContext({viewport:{width:1600,height:1000}});
  const page=await context.newPage();
  await page.route('https://**/*',route=>route.abort());
  await page.route('**/data/supabase-config.json*',route=>route.fulfill({json:{url:'',anonKey:''}}));
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
  await context.route('https://**/*',route=>route.abort());
  await context.route('**/data/supabase-config.json*',route=>route.fulfill({json:{url:'',anonKey:''}}));
  await context.route('**/app.js*',route=>route.fulfill({contentType:'text/javascript',body:source+'\nwindow.astroTest={state,save,route,applyProfileData,blankProfileData,profileDataFromState,baseExport,validateBaseImport,normalizeProfileDoc,placements,optimiseBase,optimisedPlacements,incomeForPlaced};'}));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('droid-archive-sync-provider','local');});
  const url=`http://127.0.0.1:${server.address().port}/?companion=1#/base`;
  await page.goto(url);await page.waitForFunction(()=>window.astroTest?.state.droids.length);
  await page.evaluate(()=>{
    const d=window.astroTest;
    d.applyProfileData({...d.blankProfileData(),cycle:1,rebirth:30,owned:[
      ...['R2-D2','CB-23','BB-8','CHOPPER'].map((name,i)=>({name,variant:'DEFAULT',qty:1,preferred:'ASTROMECH',preferredSlot:i*2})),
      {name:'MECHA-DROID',variant:'GALACTIC',qty:5,preferred:'WORKER'},
      {name:'C-3PO',variant:'DEFAULT',qty:1,preferred:'PROTOCOL_WORKER_CREDITS'}
    ]});d.save();d.route();
  });
  if(await page.locator('.modern-optimise-settings').isHidden())await page.locator('#toggleCommandOptimise').click();
  await page.locator('[data-astromech-settings]').click();
  assert.equal(await page.locator('[data-astromech-role]').count(),4);
  assert.deepEqual(await page.locator('[data-astromech-role]').evaluateAll(xs=>xs.map(x=>x.value)),['mission','mission','mission','mission']);
  await page.locator('[data-astromech-role="R2-D2"]').selectOption('credits');
  await page.locator('[data-astromech-role="CHOPPER"]').selectOption('credits');
  await page.locator('.astromech-settings-modal').screenshot({path:'research/astromech-settings-desktop.png'});
  await page.locator('#closeAstromechSettings').click();
  const missionSlots=await page.locator('.station-astromech .mission-slot-badge').count();assert.equal(missionSlots,5);
  assert.equal(await page.locator('.station-worker .mission-slot-badge').count(),0);
  await page.addStyleTag({content:'.archive-timers,#rebirthQuickBar{visibility:hidden!important}'});
  await page.locator('.station-astromech').screenshot({path:'research/astromech-slot-labels.png'});
  const result=await page.evaluate(()=>{
    const d=window.astroTest,p=d.placements(),plan=d.optimiseBase(p,d.incomeForPlaced(p.placed)),projected=d.optimisedPlacements(p,plan);
    const profile=d.profileDataFromState(),transfer=d.validateBaseImport(d.baseExport()),cloud=d.normalizeProfileDoc({profiles:[{id:'test',data:profile}]}).profiles[0].data;
    d.applyProfileData(d.blankProfileData());const blank=d.state.astromechIconicRoles;d.applyProfileData(profile);
    return{assignments:plan.assignments,placed:projected.placed,profile:profile.astromechIconicRoles,transfer:transfer.astromechIconicRoles,cloud:cloud.astromechIconicRoles,blank,restored:d.state.astromechIconicRoles};
  });
  const expected={'R2-D2':'credits','CHOPPER':'credits'};
  for(const key of ['profile','transfer','cloud','restored'])assert.deepEqual(result[key],expected,key);
  assert.deepEqual(result.blank,{});
  for(const name of ['CB-23','BB-8'])assert.ok(result.assignments.some(x=>x.name===name&&x.missionPriority),name+' is reserved for missions');
  for(const name of ['R2-D2','CHOPPER']){
    assert.ok(result.assignments.some(x=>x.name===name&&!x.missionPriority),name+' is assigned for credits');
    assert.ok(!result.placed.some(x=>x.name===name&&(x.missionPriority||x.keepReason==='companion')),name+' is not reclaimed by mission pass');
  }
  await page.reload();await page.locator('[data-astromech-settings]').waitFor();
  assert.deepEqual(await page.evaluate(()=>window.astroTest.state.astromechIconicRoles),expected,'refresh');
  const tab=await context.newPage();await tab.goto(url);await tab.waitForFunction(()=>window.astroTest?.state.droids.length);
  assert.deepEqual(await tab.evaluate(()=>window.astroTest.state.astromechIconicRoles),expected,'new tab');await tab.close();
  await page.setViewportSize({width:390,height:844});
  if(await page.locator('.modern-optimise-settings').isHidden())await page.locator('#toggleCommandOptimise').click();
  await page.locator('[data-astromech-settings]').click();
  const size=await page.locator('.astromech-settings-modal').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));assert.ok(size.scroll<=size.client,'mobile dialog fits');
  await page.locator('.astromech-settings-modal').screenshot({path:'research/astromech-settings-mobile.png'});
  await page.locator('#closeAstromechSettings').click();
  assert.deepEqual(errors,[]);
  console.log('PASS: default/mixed roles, full optimiser, profile/import/cloud/refresh/new-tab persistence, five mission labels, desktop and mobile UI.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});