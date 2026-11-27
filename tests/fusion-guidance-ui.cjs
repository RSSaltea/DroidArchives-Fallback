const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('../tools/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'research/uefn/november27/ui/fusion-guidance');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data)});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{for(const shell of ['index.html','classic.html']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('droid-archives-site-help-v1','{"invited":true}'));
  await page.route('https://**/*',r=>r.abort());await page.route('**/data/patch-notes.json*',r=>r.fulfill({json:{notes:[]}}));
  await page.route('**/app.js?*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('app.js','utf8')+'\nwindow.fixture={state,save,route};'}));
  const url=`http://127.0.0.1:${server.address().port}/${shell}?companion=1#/fusion-lab?target=X-ONK&quality=BESKAR`;
  await page.goto(url);await page.waitForFunction(()=>window.fixture?.state.droids.length>100);
  await page.evaluate(()=>{
   const s=fixture.state;s.owned=[['GONK','GOLD'],['KX','DIAMOND'],['KX','BESKAR'],['X-ONK','GOLD']].map(([name,variant],i)=>({name,variant,qty:1,built:true,preferred:'LOUNGE',preferredSlot:i}));s.cycle=1;s.rebirth=0;
   s.rebirths[1]=[{to:1,requiredDroids:[{droidName:'GONK',variant:'GOLD'}]},{to:27,requiredDroids:[{droidName:'KX',variant:'BESKAR'}]},{to:31,requiredDroids:[{droidName:'GONK',variant:'KYBER'}]}];fixture.save();fixture.route();
  });
  assert(await page.locator('.fusion-rules').isVisible());assert(await page.locator('.fusion-owned-upgrades').isVisible());
  const text=await page.locator('[data-plan]').innerText();assert(text.includes('52,000 chips'));assert(/fuse, then upgrade/i.test(text),text);assert(text.includes('Lounge 1'));assert(text.includes('Keep through R31'));assert(!text.includes('All inputs recorded'));
  const route=page.locator('.fusion-target-route').filter({hasText:'Fuse, then upgrade'}).first();assert.equal(await route.locator('.fusion-target-part').count(),3);
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});await page.locator('.fusion-target').evaluate(el=>el.scrollIntoView({block:'start'}));
   await page.locator('[data-plan] img').evaluateAll(imgs=>Promise.all(imgs.filter(img=>img.getClientRects().length).map(img=>{img.loading='eager';return img.decode()})));
   await page.screenshot({path:path.join(out,`${shell}-plan-${width}.png`)});await route.evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await route.screenshot({path:path.join(out,`${shell}-route-${width}.png`)});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+width);
   assert(await route.evaluate(el=>parseFloat(getComputedStyle(el).paddingLeft)>=16));
  }
  await page.reload();await page.waitForSelector('.fusion-owned-upgrades');assert.equal(await page.locator('[data-quality]').inputValue(),'BESKAR');
  await page.locator('[data-quality]').selectOption('KYBER_YELLOW');assert((await page.locator('[data-plan]').innerText()).includes('Activation rolls a colour'));
  await page.locator('[data-quality]').selectOption('SCOURGE');assert.equal(await page.locator('.fusion-owned-upgrades').count(),0);assert.equal(await page.locator('.fusion-target-route').count(),0);
  await page.locator('[data-target]').fill('NOT A DROID');await page.locator('[data-target]').press('Tab');assert((await page.locator('[data-plan]').innerText()).includes('Select a droid'));
  await page.screenshot({path:path.join(out,`${shell}-empty-320.png`)});
  await page.locator('[data-fusion-view="recipes"]').click();await page.locator('#fusionSearch').fill('X-ONK');await page.locator('[data-fusion-row="X-ONK"] a').filter({hasText:'Plan recipe'}).click();assert.equal(await page.locator('[data-target]').inputValue(),'X-ONK');
  assert.deepEqual(errors,[]);await page.close();console.log('PASS',shell,'owned upgrades, actual ingredient locations, lower-variant routes, rebirth uses, colour caveats, links and responsive layouts');
 }}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
