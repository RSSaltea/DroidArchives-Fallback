const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('../tools/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'research/uefn/november22/ui');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data)});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{for(const shell of ['index.html','classic.html']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('droid-archives-site-help-v1','{"invited":true}'));
  await page.route('https://**/*',r=>r.abort());await page.route('**/data/patch-notes.json*',r=>r.fulfill({json:{notes:[]}}));
  await page.route('**/app.js?*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('app.js','utf8')+'\nwindow.fixture={state,route};'}));
  await page.goto(`http://127.0.0.1:${server.address().port}/${shell}?companion=1#/fusion-lab`);
  await page.waitForSelector('[data-target]');await page.locator('[data-fusion-view="rebirth"]').click();
  await page.locator('[data-coverage-cycle]').selectOption('1');await page.locator('[data-coverage-search]').fill('X-ONK');
  const card=page.locator('[data-coverage-recipe="X-ONK"]');assert(await card.isVisible());assert((await card.innerText()).includes('Cycle 2'));
  const uses=await page.locator('.fusion-coverage-cycle li strong').allTextContents();assert(uses.includes('R1'));
  await page.locator('[data-coverage-from]').fill('10');await page.locator('[data-coverage-multiple]').uncheck();
  assert((await page.locator('.fusion-coverage-cycle li strong').allTextContents()).every(r=>Number(r.slice(1))>=10));
  await page.reload();await page.waitForSelector('[data-coverage-from]');assert.equal(await page.locator('[data-coverage-from]').inputValue(),'10');assert.equal(await page.locator('[data-coverage-cycle]').inputValue(),'1');assert.equal(await page.locator('[data-coverage-search]').inputValue(),'X-ONK');
  await page.locator('[data-coverage-from]').fill('1');await page.locator('[data-coverage-multiple]').check();await page.locator('[data-coverage-search]').fill('');
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});await page.locator('.fusion-coverage').evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(out,`${shell}-coverage-${width}.png`),fullPage:false});
   const first=page.locator('.fusion-coverage-card').first();await first.scrollIntoViewIfNeeded();
   await first.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
   await first.screenshot({path:path.join(out,`${shell}-coverage-card-${width}.png`)});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'coverage overflow '+width);
   const inset=await page.locator('.fusion-coverage').evaluate(el=>parseFloat(getComputedStyle(el).paddingLeft));assert(inset>=16);
  }
  await page.locator('[data-coverage-cycle]').selectOption('all');await page.locator('[data-coverage-search]').fill('X-ONK');assert(await card.locator('.fusion-coverage-cycle').count()>1);
  const chosen=card.locator('[data-coverage-plan]').first(),variant=await chosen.getAttribute('data-coverage-variant');await chosen.click();
  assert(await page.locator('[data-target]').isVisible());assert.equal(await page.locator('[data-target]').inputValue(),'X-ONK');assert.equal(await page.locator('[data-quality]').inputValue(),variant);
  await page.screenshot({path:path.join(out,`${shell}-fusion-plan-320.png`),fullPage:true});
  await page.locator('[data-fusion-view="rebirth"]').click();await page.locator('[data-coverage-search]').fill('no such droid');assert(await page.locator('.fusion-coverage-empty').isVisible());
  await page.screenshot({path:path.join(out,`${shell}-coverage-empty-320.png`),fullPage:false});
  await page.locator('[data-fusion-view="recipes"]').click();await page.locator('#fusionSearch').fill('X-ONK');assert(await page.locator('[data-fusion-row="X-ONK"]').isVisible());
  await page.screenshot({path:path.join(out,`${shell}-recipe-320.png`),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'recipe overflow');
  await page.evaluate(()=>{fixture.state.owned=[{name:'KX',variant:'DEFAULT',qty:2,preferred:'BUILD',built:false},{name:'GONK',variant:'DEFAULT',qty:1,preferred:'LOUNGE'}];fixture.route()});
  assert(!(await page.locator('[data-fusion-row="X-ONK"]').getAttribute('class')).includes('fusion-ready'));
  await page.evaluate(()=>{fixture.state.owned[0].built=true;fixture.route()});assert((await page.locator('[data-fusion-row="X-ONK"]').getAttribute('class')).includes('fusion-ready'));
  await page.evaluate(()=>{fixture.state.owned[0].lockedSlot=true;fixture.route()});assert(!(await page.locator('[data-fusion-row="X-ONK"]').getAttribute('class')).includes('fusion-ready'));
  assert.deepEqual(errors,[]);await page.close();console.log('PASS',shell,'rebirth filters, refresh, all cycles, planner link, empty state, completed ingredients and 1440/390/320 layouts');
 }}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
