const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')));}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data)});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{for(const shell of ['index.html','classic.html']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.partyTest={state,route,baseExport,validateBaseImport,profileDataFromState,applyProfileData,blankProfileData,normalizeProfileDoc,save,slotProductionHtml};'}));
  await context.addInitScript(ids=>{localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(ids));localStorage.setItem('droid-archive-crit-pickaxe','29');localStorage.setItem('droid-archive-crit-chopper','1');localStorage.setItem('droid-archive-crit-perks','0')},JSON.parse(fs.readFileSync('data/patch-notes.json','utf8')).notes.map(n=>n.id));
  const url=`http://127.0.0.1:${server.address().port}/${shell}`;
  await page.goto(url+'#/crit-calc');await page.locator('.party-settings').waitFor();
  await page.evaluate(()=>{partyTest.state.novaUpgrades={'critical-chance':10,'critical-amount':8,'multi-crit':1,'scrap-value':1};partyTest.save();partyTest.route()});
  const size=page.locator('[data-party-setting="size"]'),hitters=page.locator('[data-party-setting="depotHitters"]'),target=page.locator('[data-party-setting="target"]'),scrap=page.locator('[data-party-setting="scrapAtPartyBase"]');
  assert.equal(await size.inputValue(),'1');assert.match(await page.locator('.crit-stats').innerText(),/133.5s/);
  await size.selectOption('4');await hitters.selectOption('3');assert.match(await page.locator('.crit-stats').innerText(),/213.6s/);
  await target.selectOption('fusion');assert.match(await page.locator('.crit-stats').innerText(),/133.5s/);assert(await hitters.isDisabled());
  await target.selectOption('depot');await scrap.check();
  await page.reload();await page.locator('.party-settings').waitFor();assert.equal(await size.inputValue(),'4');assert.equal(await hitters.inputValue(),'3');assert(await scrap.isChecked());
  const exported=await page.evaluate(()=>partyTest.baseExport());assert.deepEqual(exported.base.party,{size:4,depotHitters:3,scrapAtPartyBase:true,target:'depot'});
  const original=await page.evaluate(()=>partyTest.profileDataFromState());
  await page.evaluate(()=>{partyTest.applyProfileData(partyTest.blankProfileData());partyTest.route()});assert.equal(await size.inputValue(),'1');
  await page.evaluate(p=>{partyTest.applyProfileData(p);partyTest.route()},original);assert.equal(await size.inputValue(),'4');
  await page.evaluate(()=>{const p=partyTest.normalizeProfileDoc({profiles:[{id:'party',data:partyTest.profileDataFromState()},{id:'old',data:{owned:[]}}]});if(p.profiles[0].data.party.size!==4||p.profiles[1].data.party.size!==1)throw Error('Profile party migration failed')});
  await page.goto(url+'#/base');await page.locator('.party-settings').waitFor();assert.equal(await size.inputValue(),'4');
  await page.getByText('Advanced: scrap station level (optional)',{exact:true}).click();
  await page.locator('[data-scrap-station-level]').fill('10');await page.locator('[data-scrap-station-level]').dispatchEvent('change');
  assert.match(await page.locator('.scrap-calculator').first().innerText(),/61.5/);
  await size.selectOption('1');assert(await scrap.isDisabled());assert(!(await scrap.isChecked()));assert.equal(await hitters.inputValue(),'0');
  await page.goto(url+'#/nova-shop/kyber-droid-sell');await page.locator('[data-nova-select="kyber-droid-sell"]').waitFor();
  for(const [id,filename] of [['kyber-droid-sell','T_Icon_KyberSell'],['huyang-hologram','T_Icon_HuyangHologram']]){
   await page.locator(`[data-nova-select="${id}"]`).click();assert(await page.locator('#novaLevelUp').isEnabled());await page.locator('#novaLevelUp').click();assert(await page.locator('#novaLevelUp').isDisabled());
   const imgs=await page.locator(`img[src*="${filename}"]`).evaluateAll(imgs=>imgs.map(i=>({complete:i.complete,width:i.naturalWidth})));assert(imgs.length&&imgs.every(i=>i.complete&&i.width>=128));
  }
  await page.goto(url+'#/crit-calc');await size.selectOption('6');await hitters.selectOption('5');
  fs.mkdirSync(path.join(root,'research/uefn/october04/ui'),{recursive:true});
  await page.screenshot({path:path.join(root,'research/uefn/october04/ui',shell+'-party.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert(await size.isVisible());assert(await page.locator('.party-settings').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await page.screenshot({path:path.join(root,'research/uefn/october04/ui',shell+'-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS party controls, calculations, saves, profile isolation, original shop icons and mobile layout:',shell);await context.close();
 }}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
