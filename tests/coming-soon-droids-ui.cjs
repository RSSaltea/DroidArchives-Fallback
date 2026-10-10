const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')));}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data)});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try {for(const shell of ['index.html','classic.html']) {
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.upcomingTest={state,COMING_SOON_DROIDS,requestAdd,commitOwned,addBlueprint,toggleDroidex};'}));
  await context.addInitScript(ids=>localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(ids)),JSON.parse(fs.readFileSync('data/patch-notes.json','utf8')).notes.map(n=>n.id));
  const base=`http://127.0.0.1:${server.address().port}/${shell}`;
  await page.goto(base+'#/droids');await page.waitForFunction(()=>window.upcomingTest?.state.droids.length===100);
  assert.equal(await page.locator('[data-coming-soon]').count(),0);
  for(const name of ['WG-22','KT','MPH','JO9-4MN','ECG','EG-58','EGL','PLNK']){
   await page.goto(base+'#/droid/'+name.toLowerCase());await page.locator('#addThis').waitFor();
   assert.equal(await page.locator('#addThis').isEnabled(),true);
   const art=page.locator('.info-image img');await art.waitFor();await art.evaluate(img=>img.decode());
   assert(await art.evaluate(img=>img.naturalWidth>0));
   assert.match(await page.locator('.article-grid article').innerText(),name==='WG-22'?/200 personal Gonk Army points/:/Sandcrawler conveyor/);
  }
  await page.goto(base+'#/droid/kt');await page.locator('[data-v="KYBER_PURPLE"]').click();assert.match(await page.locator('.info-rows').innerText(),/142\.56K/);
  const added=await page.evaluate(()=>{
   const t=upcomingTest;t.state.rebirth=40;t.state.novaUpgrades['blueprint-storage']=9;
   for(const name of ['WG-22','KT','MPH','JO9-4MN','ECG','EG-58','EGL','PLNK']){t.commitOwned(name,'DEFAULT',1);t.toggleDroidex(name,'DEFAULT');}
   t.addBlueprint('KT','KYBER',8);
   return {owned:t.state.owned.map(d=>d.name),blueprints:t.state.blueprints};
  });assert.equal(added.owned.length,8);assert.equal(added.blueprints[0].slot,8);
  await page.goto(base+'#/base');await page.locator('.tm-canvas').waitFor();assert.equal(await page.locator('.tm-canvas [data-slot^="BLUEPRINT_STORAGE:"]').count(),9);
  assert.equal(await page.locator('.tm-canvas img').evaluateAll(imgs=>imgs.filter(i=>i.src.includes('gonk-army')).length)>0,true);
  await page.goto(base+'#/event');await page.locator('.gonk-army-panel').waitFor();await page.selectOption('[data-gonk-droid]','ECG');await page.selectOption('[data-gonk-quality]','KYBER');await page.locator('[data-gonk-pass]').check();assert.match(await page.locator('[data-gonk-points]').innerText(),/24 personal/);
  fs.mkdirSync('research/uefn/october10/ui',{recursive:true});await page.screenshot({path:`research/uefn/october10/ui/${shell}-event.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Mobile event page should not overflow');
  assert.deepEqual(errors,[]);await context.close();console.log(`${shell}: released droids, portraits, storage, event and mobile layout passed`);
 }}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
