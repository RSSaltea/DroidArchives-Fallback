const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require(path.join(__dirname,'../research/tools/ui-test/node_modules/playwright')))}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data)});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{for(const [shell,style] of [['index.html','next'],['classic.html','modern'],['classic.html','legacy']]){
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));let acceptDialog=true;page.on('dialog',d=>acceptDialog?d.accept():d.dismiss());
 await context.addInitScript(style=>{localStorage.setItem('droid-archives-site-help-v1','{"invited":true}');localStorage.setItem('droid-archive-ui-style',style);localStorage.setItem('droid-archive-map-hidden','0');},style);
 await page.route('https://**/*',r=>r.abort());await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
 await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.t={state,blankProfileData,route,placements,autoPurchaseEligibleSlots,mapDroidAction,optimiseRouteRules,predictWorkLanding,scourgeSubmitPreview,applyOptimisedLayout,save,rebirthGoal};'}));
 await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/base`);await page.waitForFunction(()=>window.t?.state.droids.length);

 const setup=async(owned)=>page.evaluate(owned=>{Object.assign(t.state,t.blankProfileData());t.state.rebirth=40;t.state.superRebirthGoal=40;t.state.autoPurchaseSlots=true;t.autoPurchaseEligibleSlots();t.state.autoCompleteBuilds=false;t.state.owned=owned;t.save();location.hash='#/base';t.route();},owned);
 const droid=(name,station,slot=0,more={})=>({name,variant:'SCOURGE',qty:1,built:true,preferred:station,preferredSlot:slot,...more});
 await setup([droid('GONK','WORKER',0,{lockedSlot:true}),droid('R2','LOUNGE'),droid('BB9','BUILD',0,{built:false}),droid('LEP','WORKER',1,{variant:'GOLD'}),droid('CHOPPER','COMPANION',0,{variant:'DEFAULT',lockedSlot:true})]);
 await page.locator('#scourgeGoalReminder a[href="#/optimise/scourge"]').click();await page.waitForSelector('#applyScourgeSubmissions');
 assert(await page.locator('#applyScourgeSubmissions').isEnabled());
 assert((await page.locator('#app').textContent()).includes('Finish these first'));
 const planned=await page.evaluate(()=>{const p=t.scourgeSubmitPreview();return {submitted:p.projected.submissions.map(u=>u.name),steps:p.steps.map(s=>s.type),pending:p.pending.map(u=>u.name),kept:p.projected.placed.map(u=>u.name)};});
 assert.deepEqual(planned.submitted,['GONK','R2']);assert.deepEqual(planned.pending,['BB9']);assert(planned.kept.includes('LEP'));assert(planned.kept.includes('CHOPPER'));assert(!planned.steps.some(s=>['sell','return','buy','fuse'].includes(s)));
 for(const width of [1280,390]){await page.setViewportSize({width,height:900});assert(await page.locator('.optimise-steps').evaluate(e=>e.scrollWidth<=e.clientWidth+2));await page.screenshot({path:`research/scourge-submit-${style}-${width}.png`,fullPage:true});}
 await page.reload();await page.waitForSelector('#applyScourgeSubmissions');
 await page.locator('.step-tick').first().click();assert.equal(await page.locator('[data-step-tick]').first().isChecked(),true);assert((await page.locator('[data-step-tick]').first().getAttribute('data-step-tick')).startsWith('scourge|'));
 acceptDialog=false;await page.locator('#applyScourgeSubmissions').click();assert.equal(await page.evaluate(()=>t.state.scourgedex.handIns),0);
 acceptDialog=true;await page.locator('#applyScourgeSubmissions').click();await page.waitForFunction(()=>location.hash==='#/base');
 assert.equal(await page.evaluate(()=>t.state.scourgedex.handIns),2);
 assert.deepEqual(await page.evaluate(()=>t.state.owned.map(u=>u.name).sort()),['BB9','CHOPPER','LEP']);
 await setup([droid('GONK','WORKER')]);await page.locator('.tm-slot[data-slot="WORKER:0"]').dispatchEvent('click');assert(await page.locator('[data-action="submit"]').isDisabled());
 await page.locator('[data-action="lounge"]').click();const loungeSlot=await page.evaluate(()=>t.placements().placed[0].slot);
 await page.locator(`.tm-slot[data-slot="LOUNGE:${loungeSlot}"]`).dispatchEvent('click');assert(await page.locator('[data-action="submit"]').isEnabled());
 acceptDialog=false;await page.locator('[data-action="submit"]').click();assert.equal(await page.evaluate(()=>t.state.owned.length),1);
 acceptDialog=true;await page.locator('[data-action="submit"]').click();assert.equal(await page.evaluate(()=>t.state.owned.length),0);assert.equal(await page.evaluate(()=>t.state.scourgedex.handIns),1);assert.equal(await page.locator('#scourgeGoalReminder').count(),0);
 await setup([droid('GONK','LOUNGE',0,{qty:2})]);await page.locator('.tm-slot[data-slot="LOUNGE:0"]').dispatchEvent('click');await page.locator('[data-action="submit"]').click();assert.equal(await page.evaluate(()=>t.state.owned.reduce((n,u)=>n+u.qty,0)),1);assert.equal(await page.evaluate(()=>t.state.scourgedex.handIns),1);
 await setup([droid('GONK','BUILD',0,{built:false})]);await page.locator('.tm-slot[data-slot="BUILD:0"]').dispatchEvent('click');assert(await page.locator('[data-action="submit"]').isDisabled());
 await setup([droid('GONK','LOUNGE',0,{variant:'GOLD'})]);await page.locator('.tm-slot[data-slot="LOUNGE:0"]').dispatchEvent('click');assert.equal(await page.locator('[data-action="submit"]').count(),0);
 await page.evaluate(()=>{t.state.rebirth=10;location.hash='#/optimise/scourge';t.route();});await page.waitForFunction(()=>document.querySelector('h1')?.textContent==='Submit all Scourge droids');assert.equal(await page.locator('#applyScourgeSubmissions').count(),0);
 assert.deepEqual(errors,[]);console.log(shell,style,'submission-only route, apply, pending builds, map submit, duplicate copies and mobile passed');await context.close();
 }}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
