const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')));}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data)});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{for(const shell of ['index.html','classic.html']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.eventTest={state,route,baseExport,validateBaseImport,profileDataFromState,applyProfileData,blankProfileData,normalizeProfileDoc,cacheCloudDocLocally,optimiseInputStamp,eventReminders};'}));
  await context.addInitScript(ids=>localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(ids)),JSON.parse(fs.readFileSync('data/patch-notes.json','utf8')).notes.map(n=>n.id));
  const url=`http://127.0.0.1:${server.address().port}/${shell}#/event`;
  await page.goto(url);await page.locator('.event-page').waitFor();
  await page.locator('[data-event-visit]').first().check();
  const day=await page.evaluate(()=>eventTest.state.eventProgress.visitDay);assert.equal(day,Math.floor(Date.now()/86400000));
  await page.locator('[data-event-visit]').nth(1).check();assert.equal(await page.evaluate(()=>eventTest.state.eventProgress.visitDay),day);
  assert.match(await page.locator('.event-section-heading').first().innerText(),/00:00 UTC/);
  assert.equal(await page.locator('#eventRemaining').count(),0);
  const stamp=await page.evaluate(()=>eventTest.optimiseInputStamp());
  await page.locator('[data-event-wish="bat-hat"]').click();await page.locator('[data-event-wish="ghoulish-gonk"]').click();await page.locator('[data-event-wish="event-pass"]').click();await page.locator('[data-event-wish="reward-treats"]').click();
  await page.locator('#eventTreatBalance').fill('30');await page.locator('#eventTreatBalance').dispatchEvent('change');
  assert.match(await page.locator('.event-wishlist-summary').innerText(),/180/);assert.match(await page.locator('.event-wishlist-summary').innerText(),/150 Treats/);
  await page.locator('[data-event-owned="bat-hat"]').check();assert.match(await page.locator('.event-wishlist-summary').innerText(),/130 Treats/);
  assert.equal(await page.evaluate(()=>eventTest.optimiseInputStamp()),stamp);
  const saved=await page.evaluate(()=>eventTest.profileDataFromState());assert.equal((await page.evaluate(()=>eventTest.baseExport())).base.eventProgress.treats,30);
  // Loading a saved profile and rebuilding the cloud cache must preserve all Event fields.
  const roundTrip=await page.evaluate(saved=>eventTest.normalizeProfileDoc({activeProfileId:'event-regression',profiles:[{id:'event-regression',data:saved}]}).profiles[0].data,saved);
  assert.deepEqual(roundTrip.eventProgress,saved.eventProgress,'Profile normalisation dropped Event progress');
  await page.evaluate(saved=>{const previous=eventTest.state.cloud.doc;eventTest.state.cloud.doc={activeProfileId:eventTest.state.cloud.activeProfileId,profiles:[{id:eventTest.state.cloud.activeProfileId,data:saved}]};eventTest.cacheCloudDocLocally();eventTest.state.cloud.doc=previous;},saved);
  await page.reload();await page.locator('.event-page').waitFor();assert.equal(await page.locator('#eventTreatBalance').inputValue(),'30');assert(await page.locator('[data-event-visit]').nth(1).isChecked());assert(await page.locator('[data-event-owned="bat-hat"]').isChecked());assert.equal(await page.locator('[data-event-wish="ghoulish-gonk"]').getAttribute('aria-pressed'),'true');
  await page.evaluate(()=>{eventTest.applyProfileData(eventTest.blankProfileData());eventTest.route()});assert.equal(await page.locator('#eventTreatBalance').inputValue(),'0');
  await page.evaluate(p=>{eventTest.applyProfileData(p);eventTest.route()},saved);assert.equal(await page.locator('#eventTreatBalance').inputValue(),'30');
  assert.equal((await page.evaluate(()=>eventTest.validateBaseImport({owned:[]}))).eventProgress.visitDay,day);
  await page.locator('#eventShopSearch').fill('werewolf');assert.equal(await page.locator('.event-shop-card').count(),1);await page.locator('#eventShopSearch').fill('');
  await page.locator('[data-event-start]').click();assert.equal(await page.locator('[data-event-visit]:checked').count(),0);
  // Exercise the real reminder scheduler with isolated progress and notification spies.
  const alertResult=await page.evaluate(async()=>{
   const {startEventReminders}=await import('./event-page.js?v=2026-10-08-daily-treats');
   let data={eventId:'gonk-o-ween-2026',visitDay:Math.floor(Date.now()/86400000)-1,alerts:true},key='event-ui-test',count=0;
   const runner=startEventReminders({getProgress:()=>data,getProfileKey:()=>key,notify:()=>count++});
   await runner.tick();await runner.tick();const once=count;data={...data,visitDay:data.visitDay-1};await runner.tick();key+='second-profile';await runner.tick();runner.dispose();return {once,count};
  });assert.deepEqual(alertResult,{once:1,count:2});
  // Advance across midnight while the page remains mounted.
  await page.locator('[data-event-visit]').first().check();
  await page.evaluate(async()=>{const realNow=Date.now;try{Date.now=()=> (Math.floor(realNow()/86400000)+1)*86400000;await eventTest.eventReminders.tick();}finally{Date.now=realNow;}});
  assert.equal(await page.locator('[data-event-visit]:checked').count(),0);
  assert.equal(await page.locator('#eventTreatBalance').inputValue(),'30');
  fs.mkdirSync(path.join(root,'research/uefn/october04/ui'),{recursive:true});
  for(const width of [1920,1280,1000,650,390,320]){
   await page.setViewportSize({width,height:950});await page.evaluate(()=>scrollTo(0,0));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${shell} overflow ${width}`);
   if(shell==='classic.html'){
    assert.deepEqual(await page.locator('#nav>a').allTextContents(),['Base','Optimise','Droidex','Crit Calc']);
    for(const link of await page.locator('#nav>a').all())assert(await link.isVisible());
    assert(await page.locator('.site-header .companion-download').isVisible());
    await page.locator('#menuButton').click();assert(await page.locator('.sidebar').isVisible());
    assert(await page.locator('.sidebar').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1}));
    await page.keyboard.press('Escape');assert(!(await page.locator('.sidebar').isVisible()));
   }
   if(width===1280){await page.locator('.event-page img').evaluateAll(imgs=>imgs.forEach(i=>i.loading='eager'));await page.waitForFunction(()=>[...document.querySelectorAll('.event-page img')].every(i=>i.complete));}
   if(width===1280||width===390)await page.screenshot({path:path.join(root,`research/uefn/october04/ui/${shell}-event-${width}.png`),fullPage:width===1280});
  }
  if(shell==='classic.html'){
   await page.locator('#menuButton').click();await page.locator('#uiStyleButton').click();
   for(const width of [1280,390,320]){await page.setViewportSize({width,height:950});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Legacy overflow ${width}`);for(const link of await page.locator('#nav>a').all())assert(await link.isVisible());}
   await page.setViewportSize({width:390,height:950});await page.screenshot({path:path.join(root,'research/uefn/october04/ui/classic-menu-mobile.png')});await page.keyboard.press('Escape');
  }
  const imageErrors=await page.locator('.event-page img').evaluateAll(imgs=>imgs.filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src));assert.deepEqual(imageErrors,[]);
  assert.deepEqual(errors,[]);console.log('PASS event collection timer, wishlist, profile persistence, export, alerts, responsive navigation:',shell);await context.close();
 }}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
