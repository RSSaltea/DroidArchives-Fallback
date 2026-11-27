const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('../tools/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'research/uefn/november26/ui/yellow-kyber');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data)});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{for(const shell of ['index.html','classic.html']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('droid-archives-site-help-v1','{"invited":true}'));
  await page.route('https://**/*',r=>r.abort());await page.route('**/data/patch-notes.json*',r=>r.fulfill({json:{notes:[]}}));
  await page.route('**/app.js?*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('app.js','utf8')+'\nwindow.yellowFixture={state,save,route,showVariantChoice};'}));
  const url=`http://127.0.0.1:${server.address().port}/${shell}?companion=1`;
  await page.goto(url+'#/base');await page.waitForFunction(()=>window.yellowFixture?.state.droids?.length>100);
  await page.evaluate(()=>yellowFixture.showVariantChoice('MOUSE','WORKER',()=>{},0));
  assert.deepEqual((await page.locator('.variant-choice [data-variant]').evaluateAll(rows=>rows.map(r=>r.dataset.variant))).slice(-3),['KYBER_PURPLE','KYBER_YELLOW','SCOURGE']);
  await page.locator('[data-variant="KYBER_YELLOW"]').click();assert.equal(await page.evaluate(()=>yellowFixture.state.owned.find(d=>d.name==='MOUSE').variant),'KYBER_YELLOW');
  await page.reload();await page.waitForFunction(()=>window.yellowFixture?.state.droids?.length>100);assert.equal(await page.evaluate(()=>yellowFixture.state.owned.find(d=>d.name==='MOUSE').variant),'KYBER_YELLOW');
  await page.goto(url+'#/droid/mouse');await page.locator('[data-v="KYBER_YELLOW"]').click();await page.waitForSelector('img[src*="kyber-yellow"]');
  await page.waitForFunction(()=>[...document.querySelectorAll('img[src*="kyber-yellow"]')].every(i=>i.complete&&i.naturalWidth===512));
  assert((await page.locator('main').innerText()).includes('Yellow'));
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});await page.screenshot({path:path.join(out,`${shell}-droid-${width}.png`)});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await page.evaluate(()=>{const t=yellowFixture;t.state.owned=[{name:'X-ONK',variant:'GOLD',qty:1,built:true,preferred:'WORKER',preferredSlot:0}];t.state.cycle=0;t.state.rebirth=0;t.state.rebirths[0]=[{to:1,creditsCost:10000,requiredDroids:[{droidName:'GONK',variant:'BESKAR'}]},{to:10,creditsCost:1000000,requiredDroids:[{droidName:'KX',variant:'BESKAR'}]}];t.save();location.hash='#/rebirth'});
  await page.waitForFunction(()=>document.querySelector('main')?.textContent.includes('X-ONK'));
  const text=await page.locator('main').innerText();assert(text.includes('X-ONK fusion'),text.slice(0,3500));assert(/52K|52,000/.test(text),text.slice(0,3500));assert(text.includes('Keep through R 10'));assert(/192 chips/i.test(text));assert(!text.includes('104K'));
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});await page.screenshot({path:path.join(out,`${shell}-rebirth-${width}.png`)});await page.locator('.rebirth-collection-card').first().screenshot({path:path.join(out,`${shell}-fusion-card-${width}.png`)});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await page.locator('[data-tree-upgrade="GONK"]').click();assert.deepEqual(await page.evaluate(()=>yellowFixture.state.owned.map(d=>[d.name,d.variant])),[['X-ONK','BESKAR']]);
  await page.goto(url+'#/rebirth/reqs');await page.waitForSelector('.needed-card');assert((await page.locator('main').innerText()).includes('X-ONK fusion'));
  assert.deepEqual(errors,[]);await page.close();console.log('PASS',shell,'Yellow order, portrait, save/reload and fusion rebirth guidance');
 }}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
