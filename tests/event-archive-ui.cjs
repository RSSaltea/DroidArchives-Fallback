const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')));}
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const shell of ['index.html','classic.html']){
 const context=await browser.newContext({viewport:{width:1280,height:950}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
 await context.addInitScript(ids=>{localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(ids));Date.now=()=>Date.parse('2026-11-03T12:00:00Z');},JSON.parse(fs.readFileSync(path.join(root,'data/patch-notes.json'))).notes.map(n=>n.id));
 await context.addInitScript(()=>localStorage.setItem('droid-archives-site-help-v1',JSON.stringify({invited:true})));
 const url=`http://127.0.0.1:${server.address().port}/${shell}`;
 await page.goto(url+'#/event');await page.locator('.event-page').waitFor();
 assert.match(await page.locator('[data-event-featured]').innerText(),/Boosted Weekend/);
 assert.match(await page.locator('[data-scheduled-countdown]').innerText(),/4d 09h/);
 assert.equal(await page.locator('[data-event-archive][open]').count(),0);
 assert.equal(await page.locator('[data-event-visit]').first().isVisible(),false);
 await page.locator('[data-event-archive="scourge-boss"]>summary').click();assert(await page.getByRole('heading',{name:'Scourge Prime boss event',exact:true}).isVisible());
 await page.locator('[data-event-archive="gonk-o-ween"]>summary').click();
 await page.locator('#eventTreatBalance').fill('30');await page.locator('#eventTreatBalance').dispatchEvent('change');
 assert(await page.locator('[data-event-archive="scourge-boss"]').evaluate(e=>e.open));assert(await page.locator('#eventTreatBalance').isVisible());
 await page.locator('[data-event-wish="bat-hat"]').click();await page.reload();await page.locator('.event-page').waitFor();assert.equal(await page.locator('[data-event-archive][open]').count(),0);
 await page.locator('[data-event-archive="gonk-o-ween"]>summary').click();assert.equal(await page.locator('#eventTreatBalance').inputValue(),'30');assert.equal(await page.locator('[data-event-wish="bat-hat"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-event-archive="gonk-o-ween"]>summary').click();
 for(const width of [1280,390,320]){await page.setViewportSize({width,height:950});assert(await page.locator('.event-page').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`${shell} event overflow ${width}`);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(root,`research/event-archive-${shell}-${width}.png`)});}
 await page.evaluate(()=>{Date.now=()=>Date.parse('2026-11-07T21:00:00Z');document.querySelector('.event-page').refreshTreatDay();});assert.equal(await page.locator('[data-scheduled-label]').innerText(),'Ends in');
 await page.evaluate(()=>{Date.now=()=>Date.parse('2026-11-08T21:00:00Z');document.querySelector('.event-page').refreshTreatDay();});assert.equal(await page.locator('[data-scheduled-event]').count(),0);assert.equal(await page.locator('[data-event-archive="boosted-weekend-2026-11-07"]').evaluate(e=>e.open),false);
 await page.goto(url+'#/');await page.locator('[data-event-card="boosted-weekend-2026-11-07"]').waitFor();assert.match(await page.locator('[data-event-status]').innerText(),/Starts in/i);
 assert.deepEqual(errors,[]);await context.close();console.log('PASS countdown, archive visibility, saved progress, mobile and Home:',shell);
}}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});


