const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('../research/tools/ui-test/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,body)=>{if(err)return res.writeHead(404).end();if(file.endsWith('app.js'))body=Buffer.from(body.toString()+'\nwindow.mapTest={state,route,autoPurchaseEligibleSlots};');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(body)})});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const shell of ['index.html','classic.html']){
 const ctx=await browser.newContext({viewport:{width:1500,height:1100}}),page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
 await page.addInitScript(notes=>{localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(notes));localStorage.setItem('droid-archive-map-hidden','0')},JSON.parse(fs.readFileSync('data/patch-notes.json','utf8')).notes.map(n=>n.id));
 await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/base`);await page.waitForFunction(()=>window.mapTest?.state.droids.length);
 await page.evaluate(()=>{const t=mapTest;Object.assign(t.state,{cycle:3,rebirth:36,superRebirthGoal:40,autoCompleteBuilds:false,autoPurchaseSlots:true,novaUpgrades:{'blueprint-storage':1},owned:[{name:'GUNRUNNER',variant:'BESKAR',qty:1,preferred:'LOUNGE',preferredSlot:0},{name:'GUNRUNNER',variant:'KYBER_GREEN',qty:1,preferred:'LOUNGE',preferredSlot:1}],blueprints:[{name:'SNOW MOUSE',variant:'KYBER',slot:0}]});t.autoPurchaseEligibleSlots();t.route()});
 const slot=k=>page.locator(`.tm-canvas [data-slot="${k}"]`),uses=page.locator('.tm-rebirth-uses');
 await slot('LOUNGE:0').click();
 let text=await uses.innerText();assert.match(text,/Cycle 4/);assert.match(text,/Rebirth 37/);assert.match(text,/Kyber.*\(active\)/i);assert.match(text,/25K chips/);assert.match(text,/4 Kyber Crystals/);assert.match(text,/Next rebirth/);assert.doesNotMatch(await uses.locator(':scope > ul').innerText(),/Ready for this requirement/);
 await uses.locator('summary').click();assert.match(await uses.innerText(),/Rebirth 22/);
 // Returning to a tab can refresh the cloud profile and redraw the entire route.
 const otherTab=await ctx.newPage();await otherTab.goto('about:blank');await otherTab.bringToFront();await page.bringToFront();await otherTab.close();
 await page.evaluate(()=>mapTest.route());
 assert.match(await page.locator('.tm-droid-heading').innerText(),/GUNRUNNER/);
 assert.match(await uses.innerText(),/25K chips/);
 await page.locator('.base-heading h1').click();
 assert.match(await page.locator('.tm-droid-heading').innerText(),/GUNRUNNER/);
 await page.locator('.tm-viewport').click({position:{x:3,y:3}});
 assert.equal(await page.locator('.tm-droid-heading').count(),0);
 await slot('LOUNGE:0').click();await slot('LOUNGE:0').hover();await page.keyboard.press('Escape');
 assert.equal(await page.locator('.tm-droid-heading').count(),0);
 await slot('LOUNGE:0').click();
 // A different profile must not inherit the selected slot from this Base.
 await page.evaluate(()=>{window.previousMapProfileId=mapTest.state.cloud.activeProfileId;mapTest.state.cloud.activeProfileId='another-profile';mapTest.route()});
 assert.equal(await page.locator('.tm-droid-heading').count(),0);
 await page.evaluate(()=>{mapTest.state.cloud.activeProfileId=window.previousMapProfileId;mapTest.route()});await slot('LOUNGE:0').click();
 await page.locator('#tmDistanceView').click();assert.match(await uses.innerText(),/25K chips/);
 await page.selectOption('#tmMode','measure');await slot('LOUNGE:0').click();assert.match(await uses.innerText(),/25K chips/);
 await page.selectOption('#tmMode','manage');
 await page.evaluate(()=>{mapTest.state.owned[0].variant='KYBER';mapTest.route()});await slot('LOUNGE:0').click();
 text=await uses.innerText();assert.match(text,/Activate.*4 Kyber Crystals/);assert.doesNotMatch(text,/Upgrade from/);
 await slot('LOUNGE:1').click();assert.match(await uses.innerText(),/Ready for this requirement/);assert.doesNotMatch(await uses.innerText(),/then activate|Activate.*Crystals/);
 await slot('BLUEPRINT_STORAGE:0').click();text=await uses.innerText();assert.match(text,/Craft this blueprint first/);assert.match(text,/Rebirth 39/);assert.doesNotMatch(text,/Ready for this requirement/);
 await page.evaluate(()=>{mapTest.state.owned=[{name:'GUNRUNNER',variant:'KYBER_GREEN',qty:1,preferred:'BUILD',preferredSlot:0}];mapTest.route()});await slot('BUILD:0').click();assert.match(await uses.innerText(),/Finish building this droid first/);assert.match(await uses.innerText(),/Variant ready/);assert.doesNotMatch(await uses.innerText(),/Ready for this requirement/);
 await page.evaluate(()=>{Object.assign(mapTest.state,{cycle:0,rebirth:26,superRebirthGoal:30,owned:[{name:'SNOW MOUSE',variant:'BESKAR',qty:1,preferred:'LOUNGE',preferredSlot:0}]});mapTest.route()});await slot('LOUNGE:0').click();
 text=await uses.innerText();for(const rank of [27,35,40])assert.match(text,new RegExp('Rebirth '+rank));assert.match(text,/After your goal/);assert.match(text,/Ready for this requirement/);assert.match(text,/do not add the costs together/);
 await page.setViewportSize({width:390,height:844});await uses.scrollIntoViewIfNeeded();assert(await uses.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 fs.mkdirSync(path.join(root,'research/uefn/october04/ui'),{recursive:true});await page.locator('.tm-inspector').screenshot({path:path.join(root,'research/uefn/october04/ui',shell+'-rebirth-uses.png')});
 await page.evaluate(()=>{mapTest.state.rebirth=40;mapTest.route()});await slot('LOUNGE:0').click();assert.match(await uses.innerText(),/No remaining rebirth uses/);
 await page.evaluate(()=>{mapTest.state.owned[0].name='CHOPPER';mapTest.state.owned[0].variant='DEFAULT';mapTest.route()});await slot('LOUNGE:0').click();assert.match(await uses.innerText(),/Not required for any rebirth/);
 await page.setViewportSize({width:1500,height:1500});
 for(const [name,variant,station] of [['B2-RP','STELLAR','BUILD'],['LOADLIFTER','GALACTIC','FUSION_BUILD']]){
  await page.evaluate(({name,variant,station})=>{Object.assign(mapTest.state,{cycle:4,rebirth:25,owned:[{name,variant,qty:1,preferred:station,preferredSlot:0,built:true}]});mapTest.autoPurchaseEligibleSlots();mapTest.route()},{name,variant,station});
  await slot(station+':0').click();
  assert.match(await page.locator('.tm-droid-heading').innerText(),new RegExp(name));
  await page.locator('.tm-droid-portrait img').waitFor();
  assert.match(await page.locator('.tm-production').innerText(),/^Build complete\n/);
  const status=await page.locator('.tm-production>.adjusted-production').boundingBox(),breakdown=await page.locator('.tm-production>.production-breakdown').boundingBox();assert(breakdown.y>=status.y+status.height);
  assert.equal(await page.locator('.tm-production>.production-breakdown').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)),12);
  await page.locator('.tm-inspector').screenshot({path:path.join(root,'research/uefn/october04/ui',shell+'-'+name+'-inspector.png')});
 }
 assert.deepEqual(errors,[]);console.log('PASS map rebirth uses, selected-copy costs, activation, blueprints, builds, cycle/goal boundaries, portraits and production spacing:',shell);await ctx.close();
}}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
