const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('../tools/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'research/uefn/november26/ui/echo-charge');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data)});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{for(const shell of ['index.html','classic.html']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('droid-archives-site-help-v1','{"invited":true}');localStorage.setItem('droid-archive-crit-perks','0')});
  await page.route('https://**/*',r=>r.abort());await page.route('**/data/patch-notes.json*',r=>r.fulfill({json:{notes:[]}}));
  await page.route('**/app.js?*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('app.js','utf8')+'\nwindow.chargeFixture={state,save,route,setNovaLevel,plannerStorageKey,plannerTargets};'}));
  const url=`http://127.0.0.1:${server.address().port}/${shell}?companion=1`;
  await page.goto(url+'#/crit-calc');await page.waitForSelector('#echoCharge');
  assert.equal(await page.locator('#echoCharge').inputValue(),'0');assert.equal(await page.locator('#critThreeDepots').isChecked(),false);
  await page.evaluate(()=>{const t=chargeFixture;t.state.novaUpgrades={'critical-chance':20,'critical-amount':20,'multi-crit':4,'echo-strike-chance':3,'echo-strike-amount':5,'echo-strike-cap':1};t.state.owned=[];t.state.rebirth=0;t.state.pickaxeLevel=29;t.save();t.route()});
  const average=async()=>Number((await page.locator('.crit-stats .stat').nth(1).locator('strong').innerText()).replace('s',''));
  const base=await average();await page.locator('#echoCharge').fill('1');await page.locator('#echoCharge').dispatchEvent('change');const one=await average();assert(one>base);
  await page.locator('#critThreeDepots').check();const three=await average();assert(Math.abs((three-base)-3*(one-base))<.3);
  assert((await page.locator('.crit-charge-notice').innerText()).includes('total crafting time'));
  assert.equal(await page.evaluate(()=>chargeFixture.state.novaUpgrades['echo-strike-charge']||0),0);
  await page.locator('#critSessionToggle').click();assert.equal(await page.locator('#critPurchase').isDisabled(),false);
  assert((await page.locator('#critSession').innerText()).includes('200 Nova'));
  await page.locator('#critPurchase').click();assert.equal(await page.evaluate(()=>chargeFixture.state.novaUpgrades['echo-strike-charge']),1);
  await page.locator('#echoCharge').fill('4');await page.locator('#echoCharge').dispatchEvent('change');
  assert((await page.locator('#critSession').innerText()).includes('7K Nova'));await page.locator('#critPurchase').click();
  await page.reload();await page.waitForSelector('#echoCharge');assert.equal(await page.locator('#echoCharge').inputValue(),'4');assert(await page.locator('#critThreeDepots').isChecked());
  const originalProfile=await page.evaluate(()=>chargeFixture.state.cloud.activeProfileId);
  await page.evaluate(()=>{chargeFixture.state.cloud.activeProfileId='charge-isolation';chargeFixture.route()});assert.equal(await page.locator('#critThreeDepots').isChecked(),false);
  await page.evaluate(id=>{chargeFixture.state.cloud.activeProfileId=id;chargeFixture.route()},originalProfile);assert(await page.locator('#critThreeDepots').isChecked());
  await page.evaluate(()=>{chargeFixture.state.party.target='fusion';chargeFixture.route()});assert(await page.locator('#critThreeDepots').isDisabled());
  assert((await page.locator('main').innerText()).includes('Charge does not affect Fusion Tanks'));
  await page.evaluate(()=>{chargeFixture.state.party.target='depot';chargeFixture.route()});
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));
   await page.screenshot({path:path.join(out,`${shell}-crit-${width}.png`),fullPage:true});
   await page.locator('.crit-inputs').screenshot({path:path.join(out,`${shell}-inputs-${width}.png`)});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${shell} overflow ${width}`);
  }
  await page.goto(url+'#/nova-shop/echo-strike-charge');await page.waitForSelector('#novaLevelUp');
  assert(!(await page.locator('.nova-detail-panel').innerText()).includes('Unavailable'));assert(await page.locator('#novaLevelDown').isEnabled());
  assert.equal(await page.locator('.nova-detail-panel tbody tr').count(),4);
  assert((await page.locator('.nova-detail-panel tbody').innerText()).includes('7,200')||(await page.locator('.nova-detail-panel tbody').innerText()).includes('7.2K'));
  await page.evaluate(()=>{chargeFixture.setNovaLevel('echo-strike-charge',3);chargeFixture.route()});assert.equal(await page.evaluate(()=>chargeFixture.state.novaUpgrades['echo-strike-charge']),3);
  assert(await page.locator('#novaLevelUp').isEnabled());
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});await page.locator('.nova-detail-panel').screenshot({path:path.join(out,`${shell}-shop-${width}.png`)});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${shell} shop overflow ${width}`);
  }
  assert(await page.locator('img[src$="echo-strike-charge.png"]').evaluateAll(images=>images.length>0&&images.every(i=>i.naturalWidth>0&&getComputedStyle(i).mixBlendMode==='screen')));
  await page.locator('[data-nova-category="planner"]').click();assert.equal(await page.locator('[data-plan-owned="echo-strike-charge"]').count(),1);
  assert.deepEqual(errors,[]);await page.close();console.log('PASS',shell,'Released Charge, depot scaling, purchasing, persistence, Fusion and responsive layouts');
 }}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
