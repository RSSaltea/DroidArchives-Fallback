const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),http=require('http');const {chromium}=require('../tools/node_modules/playwright');
const root=path.resolve(__dirname,'..');const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(p==='/'?'/index.html':p));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data)});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});try{for(const shell of ['index.html','classic.html']){
 const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
 await page.route('**/app.js?*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('app.js','utf8')+'\nwindow.fixture={state,save,syncCantinaPackUpgrades,minimumNovaLevel};'}));
 await page.goto(`http://127.0.0.1:${server.address().port}/${shell}?companion=1#/cantina-shop`);await page.waitForFunction(()=>window.fixture?.state.cantinaShop);
 await page.locator('[data-cantina-category="packs"]').click();
 for(const [id,cost] of [['fusion-pack',1800],['storage-lounge-pack',1000],['droid-tracker-pack',1200]]){
  assert.equal(await page.evaluate(id=>fixture.state.cantinaShop.items.find(i=>i.id===id).vbucksCost,id),cost);
  await page.locator(`[data-cantina-select="${id}"]`).click();assert(!(await page.locator('.cantina-detail').innerText()).includes('V-Bucks cost\n?'));
 }
 const imageErrors=await page.locator('.cantina-card-art img,.cantina-detail-head img').evaluateAll(imgs=>imgs.filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.src));assert.deepEqual(imageErrors,[]);
 await page.locator('#cantinaOwned').check();
 const levels=()=>page.evaluate(()=>['rebirth-droid-alert','droidex-notifications','variant-watch'].map(id=>fixture.state.novaUpgrades[id]));
 assert.deepEqual(await levels(),[1,5,1]);
 await page.reload();await page.waitForSelector('#cantinaOwned');assert(await page.locator('#cantinaOwned').isChecked());assert.deepEqual(await levels(),[1,5,1]);
 await page.locator('#cantinaOwned').uncheck();await page.locator('#cantinaOwned').check();assert.deepEqual(await levels(),[1,5,1]);
 await page.evaluate(()=>{fixture.state.novaUpgrades['droidex-notifications']=8;fixture.save()});await page.reload();await page.waitForSelector('#cantinaOwned');assert.deepEqual(await levels(),[1,8,1]);
 await page.evaluate(()=>{fixture.state.novaUpgrades['droidex-notifications']=2;fixture.syncCantinaPackUpgrades()});assert.deepEqual(await levels(),[1,5,1]);
 assert.equal(await page.evaluate(()=>fixture.minimumNovaLevel('droidex-notifications')),5);
 await page.screenshot({path:path.join(process.env.TEMP,'cantina-packs-'+shell+'.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);await page.close();console.log('PASS',shell,'prices, actual artwork, Tracker missing upgrades, higher levels preserved, reload/recheck idempotence, mobile');
}}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
