const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')));}
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const [shell,style] of [['index.html','next'],['classic.html','modern'],['classic.html','legacy']]){
 const context=await browser.newContext({viewport:{width:1280,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
 await context.addInitScript(style=>{localStorage.setItem('droid-archives-site-help-v1',JSON.stringify({invited:true}));localStorage.setItem('droid-archive-ui-style',style);},style);
 await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
 await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.traitFixture={state,showTraitModal,placements,blankProfileData,autoPurchaseEligibleSlots};'}));
 await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/base`);await page.waitForFunction(()=>window.traitFixture?.state.droids.length);
 const open=()=>page.evaluate(()=>{const t=traitFixture;t.showTraitModal(t.placements().placed.find(u=>u.name==='R7'),()=>{});});
 await page.evaluate(()=>{const t=traitFixture;Object.assign(t.state,t.blankProfileData());t.state.rebirth=40;t.state.autoPurchaseSlots=true;t.autoPurchaseEligibleSlots();t.state.owned=[{name:'R7',variant:'DEFAULT',qty:2,built:true,preferred:'ASTROMECH'}];});
 await open();await page.locator('.trait-picker>summary').click();await page.locator('[data-trait-choice="9"]').click();await page.getByRole('radio',{name:/Gold/}).check();
 assert.match(await page.locator('#ownedTraitHelp').innerText(),/\+10% Astromech Mission Speed/);assert.match(await page.locator('#traitPickerSelection').innerText(),/Gold: \+10%/);
 assert.equal(await page.locator('[name="ownedTraitTierChoice"]').count(),4);
 await page.locator('#saveOwnedTrait').click();const saved=await page.evaluate(()=>traitFixture.state.owned.filter(u=>u.trait));assert.equal(saved.length,1);assert.equal(saved[0].trait.tier,'Gold');assert.equal(saved[0].trait.id,9);
 await open();assert(await page.getByRole('radio',{name:/Gold/}).isChecked());
 await page.locator('.trait-picker>summary').click();await page.waitForFunction(()=>[...document.querySelectorAll('.trait-picker-options img')].every(i=>i.complete&&i.naturalWidth));
 assert(await page.locator('[data-trait-choice="9"] img').isVisible());
 await page.screenshot({path:path.join(root,`research/trait-picker-${style}-open.png`)});
 await page.locator('[data-trait-choice="1"]').click();assert(await page.getByRole('radio',{name:/Gold/}).isChecked());assert.match(await page.locator('#ownedTraitHelp').innerText(),/\+4 Pickaxe Level/);
 await page.locator('#cancelOwnedTrait').click();await open();assert.match(await page.locator('#traitPickerSelection').innerText(),/Mission Efficiency/);
 for(const width of [1280,390,320]){await page.setViewportSize({width,height:1000});assert(await page.locator('.trait-edit-modal').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`${style} overflow ${width}`);await page.screenshot({path:path.join(root,`research/trait-picker-${style}-${width}.png`)});}
 await page.locator('.trait-picker>summary').focus();await page.keyboard.press('Enter');assert(await page.locator('.trait-picker').evaluate(e=>e.open));await page.keyboard.press('Escape');assert.equal(await page.locator('.trait-picker').evaluate(e=>e.open),false);assert(await page.locator('#saveOwnedTrait').count());
 await page.locator('.trait-picker>summary').click();await page.locator('[data-trait-choice="12"]').click();assert.equal(await page.locator('[name="ownedTraitTierChoice"]').count(),1);assert.match(await page.locator('#ownedTraitHelp').innerText(),/Doubles Companion Bonus/);
 await page.locator('.trait-picker>summary').click();await page.locator('[data-trait-choice=""]').click();assert.equal(await page.locator('.trait-tier-picker').isVisible(),false);await page.locator('#saveOwnedTrait').click();assert.equal(await page.evaluate(()=>traitFixture.state.owned.filter(u=>u.trait).length),0);
 assert.deepEqual(errors,[]);await context.close();console.log('PASS trait icons, tier values, copy-specific save, cancel, keyboard and mobile:',style);
}}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
