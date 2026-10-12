const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('../research/tools/ui-test/node_modules/playwright');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');fs.readFile(file,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const shell of ['index.html','classic.html']){
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.abort());await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.guideTest={state,route};'}));
 await context.addInitScript(ids=>localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(ids)),JSON.parse(fs.readFileSync('data/patch-notes.json','utf8')).notes.map(n=>n.id));
 await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/guide`);await page.locator('#guideShoppingResult').waitFor();
 assert.match(await page.locator('#guide-first-steps').innerText(),/credit returns are very poor/);
 assert.match(await page.locator('#guideShoppingResult').innerText(),/91 Nova/);
 await page.locator('#guideNova').fill('91');assert.match(await page.locator('#guideShoppingResult').innerText(),/fund this milestone now/);
 await page.locator('[data-guide-read="first-steps"]').check();await page.reload();await page.locator('#guideProgressCount').waitFor();assert.equal(await page.locator('[data-guide-read="first-steps"]').isChecked(),true);
 await page.locator('[data-guide-jump="surges"]').click();await page.locator('.guide-surge-helper>summary').click();assert(await page.locator('.guide-surge-helper .guide-extra').isVisible());
 assert.equal(await page.locator('header a[href="#/guide"],.sidebar a[href="#/guide"],.toolbar a[href="#/guide"]').count(),0);
 await page.evaluate(()=>{const {state,route}=window.guideTest;state.cloud.activeProfileId='guide-other';route();});assert.equal(await page.locator('[data-guide-read="first-steps"]').isChecked(),false);
 const target=await page.evaluate(()=>{const {state,route}=window.guideTest;state.cycle=0;state.rebirth=0;state.owned=[];state.fusionKeepRules=[];route();return state.droids.find(d=>d.rarity==='EPIC'&&state.rebirths[0].some(r=>r.requiredDroids?.some(q=>q.droidName===d.name)))?.name;});
 assert(target);assert((await page.locator('.guide-droids').textContent()).includes(target));
 fs.mkdirSync(path.join(root,'research/guide'),{recursive:true});await page.screenshot({path:path.join(root,'research/guide',shell+'-desktop.png')});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('.journey-guide').evaluate(el=>el.scrollWidth>el.clientWidth),false);await page.screenshot({path:path.join(root,'research/guide',shell+'-mobile.png')});
 assert.deepEqual(errors,[]);console.log(shell+': guide, budget, persistence, profile isolation, Epic targets and mobile passed');await context.close();
 }
 const page=await browser.newPage();await page.route('https://**/*',r=>r.abort());for(const entry of ['/guide','/guide/','/guide/index.html']){await page.goto(`http://127.0.0.1:${server.address().port}${entry}`);await page.waitForURL('**/index.html#/guide');await page.locator('.journey-guide').waitFor();}console.log('/guide entry points passed');
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
