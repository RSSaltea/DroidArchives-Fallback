const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('../tools/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'research/uefn/november27/ui/protocol');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data)});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{for(const shell of ['index.html','classic.html']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('droid-archives-site-help-v1','{"invited":true}');localStorage.setItem('droid-archive-map-hidden','0')});
  await page.route('https://**/*',r=>r.abort());await page.route('**/data/patch-notes.json*',r=>r.fulfill({json:{notes:[]}}));
  await page.route('**/app.js?*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('app.js','utf8')+'\nwindow.fixture={state,route,blankProfileData,autoPurchaseEligibleSlots,protocolProductionHtml,placements};'}));
  await page.goto(`http://127.0.0.1:${server.address().port}/${shell}?companion=1#/droid/c-3po`);await page.waitForFunction(()=>window.fixture?.state.droids.length>100);
  await page.evaluate(()=>{Object.assign(fixture.state,fixture.blankProfileData(),{rebirth:40,multiplier:20,owned:[{name:'C-3PO',variant:'DEFAULT',qty:1,built:true,preferred:'PROTOCOL_WORKER_CREDITS',preferredSlot:0},{name:'KL-NK',variant:'KYBER_YELLOW',qty:1,built:true,preferred:'PROTOCOL_BATTLE_CREDITS',preferredSlot:0}]});fixture.autoPurchaseEligibleSlots();fixture.route()});
  const panel=page.locator('.protocol-adaptation');assert.match(await panel.innerText(),/200% base → \+270% now/);assert.match(await panel.innerText(),/KL-NK Kyber Yellow/);
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});await panel.scrollIntoViewIfNeeded();await panel.screenshot({path:path.join(out,`${shell}-${width}.png`)});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await panel.evaluate(e=>parseFloat(getComputedStyle(e).paddingLeft)>=16));
  }
  await page.evaluate(()=>{fixture.state.owned[1].preferred='LOUNGE';fixture.route()});assert.match(await panel.innerText(),/No non-Iconic in a Credits Protocol slot/);assert(!(await panel.innerText()).includes('+270% now'));
  await page.evaluate(()=>{fixture.state.owned[1].preferred='PROTOCOL_BATTLE_CREDITS';location.hash='#/base'});
  await page.waitForSelector('.tm-canvas');await page.locator('.tm-canvas [data-slot="PROTOCOL_WORKER_CREDITS:0"]').click();
  const info=page.locator('.tm-inspector');assert.match(await info.innerText(),/270% now/);assert.match(await info.innerText(),/KL-NK/);
  await info.screenshot({path:path.join(out,`${shell}-map-320.png`)});
  assert.deepEqual(errors,[]);await page.close();console.log('PASS',shell,'live source, source removal, map inspector and responsive guidance');
 }}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
