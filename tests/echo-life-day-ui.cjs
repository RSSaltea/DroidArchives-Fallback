const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('../tools/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'research/uefn/november16/ui');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data)});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{for(const shell of ['index.html','classic.html']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{Date.now=()=>1794823200000;localStorage.setItem('droid-archives-site-help-v1','{"invited":true}');localStorage.setItem('droid-archive-crit-perks','0')});
  await page.route('https://**/*',r=>r.abort());await page.route('**/data/patch-notes.json*',r=>r.fulfill({json:{notes:[]}}));
  await page.route('**/app.js?*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('app.js','utf8')+'\nwindow.echoFixture={state,save,route,critProfile,critUpgradeOptions,critBudgetPlan,minimumNovaLevel};'}));
  const url=`http://127.0.0.1:${server.address().port}/${shell}?companion=1`;
  await page.goto(url+'#/crit-calc');await page.waitForSelector('#echoChance');
  assert.equal(await page.locator('#critSession').isVisible(),false);
  await page.locator('#critSessionToggle').click();
  assert.equal(await page.locator('#critSession').isVisible(),true);
  await page.reload();await page.waitForSelector('#echoChance');
  assert.equal(await page.locator('#critSession').isVisible(),true,'Session visibility persists on reload');
  await page.evaluate(()=>{const t=echoFixture;t.state.novaUpgrades={'critical-chance':10,'critical-amount':8,'multi-crit':1};t.state.owned=[];t.state.rebirth=0;t.state.pickaxeLevel=29;localStorage.setItem('droid-archive-crit-chopper','1');t.save();t.route()});
  assert.equal(await page.locator('#echoChance').inputValue(),'0');
  await page.locator('[data-perk-up="echo-strike-amount"]').click();
  assert.equal(await page.locator('#echoChance').inputValue(),'1');assert.equal(await page.locator('#echoAmount').inputValue(),'1');
  assert.equal(await page.evaluate(()=>echoFixture.state.novaUpgrades['echo-strike-amount']||0),0);
  assert((await page.locator('[aria-label="Upgrade plan"]').innerText()).includes('400 Nova'));
  await page.reload();await page.waitForSelector('#echoAmount');assert.equal(await page.locator('#echoAmount').inputValue(),'1');
  await page.locator('#critPurchase').click();assert.equal(await page.evaluate(()=>echoFixture.state.novaUpgrades['echo-strike-amount']),1);
  await page.locator('#critBudget').fill('3500');await page.locator('#critBudget').dispatchEvent('change');await page.waitForSelector('#critApplyBudget');
  const before=await page.evaluate(()=>JSON.stringify(echoFixture.state.novaUpgrades));await page.locator('#critApplyBudget').click();assert.equal(await page.evaluate(()=>JSON.stringify(echoFixture.state.novaUpgrades)),before);
  assert.equal(await page.locator('#critBudget').inputValue(),'3500');
  await page.reload();await page.waitForSelector('#critBudgetResult');assert.equal(await page.locator('#critBudget').inputValue(),'3500');
  const targetAmount=await page.locator('#critAmount').inputValue();
  await page.locator('#critNovaPlanner').click();await page.waitForSelector('[data-plan-target="critical-amount"]');
  assert.equal(await page.locator('[data-plan-target="critical-amount"]').inputValue(),targetAmount);
  assert.equal(await page.locator('[data-plan-owned="echo-strike-amount"]').inputValue(),'1');
  await page.goto(url+'#/crit-calc');await page.waitForSelector('#echoChance');
  assert(!/Chopper\?s|Echo\?s|\? Target/.test(await page.locator('#app').innerText()));
  // Separate profiles must not inherit the local plan/budget.
  const originalProfile=await page.evaluate(()=>echoFixture.state.cloud.activeProfileId);
  await page.evaluate(()=>{echoFixture.state.cloud.activeProfileId='test-other-profile';echoFixture.route()});assert.equal(await page.locator('#critBudget').inputValue(),'0');
  await page.evaluate(id=>{echoFixture.state.cloud.activeProfileId=id;echoFixture.route()},originalProfile);assert.equal(await page.locator('#critBudget').inputValue(),'3500');
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,`${shell}-crit-${width}.png`),fullPage:true});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${shell} Crit overflow ${width}`);
  }
  await page.locator('#echoBreakdown').screenshot({path:path.join(out,`${shell}-echo-detail.png`)});
  await page.locator('#critResetTargets').click();await page.locator('#critBudget').fill('0');await page.locator('#critBudget').dispatchEvent('change');assert.equal(await page.locator('#critBudgetResult').count(),0);
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});
   await page.locator('.crit-session').screenshot({path:path.join(out,`${shell}-session-zero-${width}.png`)});
   if(width===1440)assert((await page.locator('.crit-session').boundingBox()).height<160,'Empty session stays compact');
  }
  await page.evaluate(()=>{echoFixture.state.novaUpgrades['echo-strike-amount']=9;echoFixture.save()});
  await page.goto(url+'#/cantina-shop');await page.locator('[data-cantina-category="packs"]').click();await page.locator('[data-cantina-select="echo-strike-pack"]').click();
  await page.locator('#cantinaOwned').check();
  const levels=()=>page.evaluate(()=>['echo-strike-chance','echo-strike-amount','echo-strike-cap'].map(id=>echoFixture.state.novaUpgrades[id]));assert.deepEqual(await levels(),[3,9,1]);
  await page.reload();await page.waitForSelector('#cantinaOwned');assert.deepEqual(await levels(),[3,9,1]);
  await page.locator('#cantinaOwned').uncheck();await page.locator('#cantinaOwned').check();assert.deepEqual(await levels(),[3,9,1]);
  assert.equal(await page.evaluate(()=>echoFixture.minimumNovaLevel('echo-strike-chance')),3);
  for(const route of ['cantina-shop','nova-shop','event','traits']){
   if(route!=='cantina-shop')await page.goto(url+'#/'+route);
   await page.waitForFunction(()=>!!window.echoFixture?.state.novaShop);await page.waitForTimeout(250);
   if(route==='nova-shop'){await page.locator('[data-nova-category="featured"]').first().click();assert((await page.locator('#app').innerText()).includes('Echo Strike'));}
   if(route==='event'){
    assert.equal(await page.locator('[data-event-featured] [data-scheduled-event^="life-day-"]').count(),2);
    assert.equal(await page.locator('.event-life-day-art').count(),2);
    assert((await page.locator('[data-event-featured]').innerText()).includes('Upcoming event'));
   }
   for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(80);
    await page.screenshot({path:path.join(out,`${shell}-${route}-${width}.png`),fullPage:true});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${shell} ${route} overflow ${width}`);
   }
   assert(await page.locator('img[src*="assets/nova-shop/"],img[src*="assets/traits/"]').evaluateAll(images=>images.every(i=>getComputedStyle(i).mixBlendMode==='screen')),`${shell} shared icons on ${route}`);
   const broken=await page.locator('#app img').evaluateAll(images=>images.filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src));assert.deepEqual(broken,[]);
  }
  assert.deepEqual(errors,[]);await page.close();console.log('PASS',shell,'targets, purchase, budget, profile isolation, pack idempotence, event artwork and 1440/390/320 layouts');
 }}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
