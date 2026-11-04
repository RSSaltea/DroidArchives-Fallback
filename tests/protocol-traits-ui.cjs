const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')));}
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();if(file.endsWith('app.js'))data=Buffer.from(data.toString()+'\nwindow.protocolTest={state,route,placements,blankProfileData,autoPurchaseEligibleSlots};');res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const [shell,style] of [['index.html','next'],['classic.html','modern'],['classic.html','legacy']]){
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
 await context.addInitScript(style=>{localStorage.setItem('droid-archives-site-help-v1',JSON.stringify({invited:true}));localStorage.setItem('droid-archive-ui-style',style);localStorage.setItem('droid-archive-map-hidden','0');},style);
 await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
 await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/base`);await page.waitForFunction(()=>window.protocolTest?.state.droids.length);
 await page.evaluate(()=>{const t=protocolTest;Object.assign(t.state,t.blankProfileData(),{rebirth:40,multiplier:24,novaUpgrades:{'scrap-value':2,'double-companion':1},owned:[
  {name:'TDA',variant:'GOLD',qty:1,preferred:'COMPANION',preferredSlot:0,trait:{id:7,tier:'Rainbow'}},
  {name:'R7',variant:'DEFAULT',qty:1,preferred:'WORKER',preferredSlot:0,trait:{id:0,tier:'Diamond'}},
  {name:'BB9',variant:'DEFAULT',qty:1,preferred:'LOUNGE',preferredSlot:0,trait:{id:7,tier:'Gold'}},
  {name:'TDA',variant:'GOLD',qty:1,preferred:'LOUNGE',preferredSlot:1,trait:{id:12,tier:'Rainbow'}},
  {name:'R2',variant:'DEFAULT',qty:1,preferred:'WORKER',preferredSlot:1}
 ]});for(const u of t.state.owned)if(u.trait)u.trait.rerolls=0;t.autoPurchaseEligibleSlots();t.route();});
 const snapshot=await page.evaluate(()=>JSON.stringify(protocolTest.state.owned));
 const panel=page.locator('.tm-inspector .protocol-trait-comparison');
 await page.locator('.tm-canvas [data-slot="COMPANION:0"]').click();
 assert.match(await panel.innerText(),/Equal scrap payouts/);
 assert.equal(await page.locator('.tm-trait-badge').count(),4);
 assert.equal(await page.locator('.base-slot.occupied .recorded-trait-badge').count(),4);
 assert.match(await page.locator('.tm-canvas [data-slot="LOUNGE:0"]').getAttribute('aria-label'),/Scrap Specialist.*Gold/);
 await page.waitForFunction(()=>[...document.querySelectorAll('.recorded-trait-badge img,.protocol-trait-option>img')].every(i=>i.complete&&i.naturalWidth));
 await panel.screenshot({path:path.join(root,`research/protocol-traits-${style}.png`)});
 await page.locator('.tm-canvas').screenshot({path:path.join(root,`research/protocol-traits-map-${style}.png`)});
 await page.locator('#toggleBaseMap').click();
 const card=page.locator('.base-slot.occupied[data-source="0"]');await card.scrollIntoViewIfNeeded();
 assert(await card.locator('.recorded-trait-badge').isVisible());
 await card.screenshot({path:path.join(root,`research/protocol-traits-card-${style}.png`)});
 await page.locator('#toggleBaseMap').click();
 await page.evaluate(()=>{protocolTest.state.multiplier=32;protocolTest.route();});
 assert.match(await panel.locator('.protocol-trait-verdict').innerText(),/Rainbow Scrap Specialist is better/);
 await page.evaluate(()=>{protocolTest.state.multiplier=22;protocolTest.route();});
 assert.match(await panel.locator('.protocol-trait-verdict').innerText(),/Overclocked is better/);
 await page.evaluate(()=>{protocolTest.state.multiplier=36;protocolTest.state.owned[0].trait={id:12,tier:'Rainbow'};protocolTest.route();});
 assert.match(await panel.innerText(),/Equal scrap payouts/);
 await page.evaluate(()=>{protocolTest.state.multiplier=1;protocolTest.route();});
 assert.match(await panel.innerText(),/Record your current in-game credit multiplier/);assert.equal(await panel.locator('.protocol-trait-options').count(),0);
 await page.evaluate(()=>{protocolTest.state.multiplier=24;protocolTest.state.owned[0].trait={id:7,tier:'Rainbow',rerolls:0};protocolTest.route();});
 await page.evaluate(()=>{location.hash='#/droid/tda';});await page.locator('[data-v="GOLD"]').click();
 const detail=page.locator('[data-protocol-traits]');assert.match(await detail.innerText(),/Equal scrap payouts/);
 assert.equal(await detail.locator('[data-protocol-copy] option').count(),2);
 await detail.locator('[data-protocol-copy]').selectOption('1');
 assert.match(await detail.innerText(),/Moves this copy from Lounge 2/);assert.match(await detail.innerText(),/TDA is unequipped/);
 assert.equal(await page.evaluate(()=>JSON.stringify(protocolTest.state.owned)),snapshot);
 await detail.locator('[data-protocol-copy]').selectOption('0');
 await page.evaluate(()=>{protocolTest.state.multiplier=48;protocolTest.route();});
 await detail.locator('summary').click();await detail.locator('[data-protocol-boost]').fill('2');await detail.locator('[data-protocol-boost]').dispatchEvent('change');
 assert.match(await detail.innerText(),/Equal scrap payouts/);
 await page.locator('[data-v="DEFAULT"]').click();assert.match(await detail.locator('.protocol-trait-context').first().innerText(),/Default/);
 for(const width of [390,320]){
  await page.setViewportSize({width,height:900});assert(await detail.evaluate(e=>e.scrollWidth<=e.clientWidth+1),`${style} comparison overflow ${width}`);
  await detail.screenshot({path:path.join(root,`research/protocol-traits-${style}-${width}.png`)});
 }
 await page.evaluate(()=>{location.hash='#/droid/c-3po';});await page.waitForFunction(()=>document.querySelector('[data-protocol-traits]')?.textContent.includes('Iconic'));
 assert.match(await detail.innerText(),/Overclocked cannot roll on Iconic/);
 assert.deepEqual(errors,[]);await context.close();console.log('PASS Protocol comparison, variants, duplicate copies, Base changes, no mutation, trait badges and mobile:',style);
}}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
