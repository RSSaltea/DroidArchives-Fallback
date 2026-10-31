const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require(path.join(__dirname,'../research/tools/ui-test/node_modules/playwright')))}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data)});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{for(const [shell,style] of [['index.html','next'],['classic.html','modern'],['classic.html','legacy']]){
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await context.addInitScript(style=>{localStorage.setItem('droid-archive-ui-style',style);localStorage.setItem('droid-archive-map-hidden','0');},style);
 await page.route('https://**/*',r=>r.abort());await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
 await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.t={state,blankProfileData,route,placements,autoPurchaseEligibleSlots,mapDroidAction,optimiseRouteRules,predictWorkLanding};'}));
 await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/base`);await page.waitForFunction(()=>window.t?.state.droids.length);
 const setup=async(station,built=true,name='GONK')=>page.evaluate(({station,built,name})=>{Object.assign(t.state,t.blankProfileData());t.state.rebirth=40;t.state.autoPurchaseSlots=true;t.autoPurchaseEligibleSlots();t.state.autoCompleteBuilds=false;t.state.owned=[{name,variant:'DEFAULT',qty:1,preferred:station,preferredSlot:0,built}];t.route();},{station,built,name});
 const select=async station=>{await page.locator(`.tm-slot[data-slot="${station}:0"]`).dispatchEvent('click');};
 await setup('BUILD',false);await select('BUILD');assert(await page.locator('[data-action="work"]').isDisabled());
 await page.evaluate(()=>{const u=t.placements().placed[0];t.mapDroidAction(u,'work',t.route);});assert.equal(await page.evaluate(()=>t.state.owned[0].preferred),'BUILD');
 await page.locator('[data-action="complete"]').click();await select('BUILD');assert(!(await page.locator('[data-action="work"]').isDisabled()));
 const expected=await page.evaluate(()=>{const p=t.placements();return t.predictWorkLanding(p.placed[0],p.placed,t.optimiseRouteRules());});
 await page.locator('[data-action="work"]').click();const actual=await page.evaluate(()=>t.state.owned[0]);assert.equal(actual.preferred,expected.station);assert.equal(actual.preferredSlot,expected.slot);
 for(const station of ['WORKER','LOUNGE','FUSION','FUSION_BUILD','COMPANION']){await setup(station);await select(station);assert.equal(await page.locator('[data-action="work"]').count(),1);assert.equal(await page.locator('[data-action="sell"]').count(),1);}
 await setup('BUILD',true,'BB-8');await page.evaluate(()=>{t.state.owned[0].trait={id:3,tier:'Gold'};t.route();});await select('BUILD');assert.equal(await page.locator('[data-action="sell"]').count(),0);await page.locator('[data-action="return"]').click();assert.equal(await page.evaluate(()=>t.state.owned.length),0);assert(await page.evaluate(()=>t.state.iconicTraits['BB-8']));
 await setup('BUILD');await page.locator('.tm-slot[data-slot="BUILD:0"]').dispatchEvent('click');await page.locator('[data-action="companion"]').click();assert.equal(await page.evaluate(()=>t.state.owned[0].preferred),'COMPANION');
 await setup('BUILD');await page.evaluate(()=>{t.state.owned.push({name:'BB-8',variant:'DEFAULT',qty:1,built:true,preferred:'COMPANION',preferredSlot:0},{name:'CHOPPER',variant:'DEFAULT',qty:1,built:true,preferred:'COMPANION',preferredSlot:1});t.route();});await select('BUILD');await page.locator('[data-action="companion"]').click();await page.locator('[data-command-companion]').first().click();assert.equal(await page.evaluate(()=>t.state.owned.find(u=>u.name==='GONK').preferred),'COMPANION');assert.equal(await page.evaluate(()=>t.state.owned.find(u=>u.name==='BB-8').preferred),'BUILD');
 assert.deepEqual(errors,[]);console.log(shell,style,'map commands, gating, slot prediction, companion swaps and Iconic trait retention passed');await context.close();
 }}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
