const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require(path.join(__dirname,'../research/tools/ui-test/node_modules/playwright')))}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data)});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.abort());
 await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
 await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.prepTest={state,route,save,validateBaseImport,baseExport,syncCantinaPackUpgrades};'}));
 await page.goto(base+'/#/base');await page.waitForFunction(()=>window.prepTest?.state.droids.length);
 for(const shell of ['index.html','classic.html']){
 await page.goto(base+'/'+shell+'#/cantina-shop');await page.waitForFunction(()=>window.prepTest?.state.droids.length);
 await page.evaluate(()=>{const s=window.prepTest.state;s.cantinaPurchases={};s.cantinaPackGrants={};s.novaUpgrades={'blueprint-storage':2,'lounge-slot':8};window.prepTest.save();window.prepTest.route();});
 await page.locator('[data-cantina-category="packs"]').click();await page.locator('[data-cantina-select="storage-lounge-pack"]').click();
 await page.locator('#cantinaOwned').check();
 const levels=()=>page.evaluate(()=>({storage:window.prepTest.state.novaUpgrades['blueprint-storage'],lounge:window.prepTest.state.novaUpgrades['lounge-slot']}));
 assert.deepEqual(await levels(),{storage:8,lounge:12});
 await page.evaluate(()=>{window.prepTest.syncCantinaPackUpgrades();window.prepTest.syncCantinaPackUpgrades();window.prepTest.save();});assert.deepEqual(await levels(),{storage:8,lounge:12});
 await page.reload();await page.waitForSelector('#cantinaOwned');assert.equal(await page.locator('#cantinaOwned').isChecked(),true);assert.deepEqual(await levels(),{storage:8,lounge:12});
 const imported=await page.evaluate(()=>window.prepTest.validateBaseImport(window.prepTest.baseExport()));assert.equal(imported.cantinaPurchases['storage-lounge-pack'],true);assert.equal(imported.novaUpgrades['blueprint-storage'],8);
 await page.locator('#cantinaOwned').uncheck();await page.locator('#cantinaOwned').check();assert.deepEqual(await levels(),{storage:8,lounge:12});assert.equal(imported.cantinaPackGrants['storage-lounge-pack'],true);
 }
 assert.deepEqual(errors,[]);console.log('PASS: Storage & Lounge Pack updates both levels, preserves higher levels, survives reload and export, and never grants repeatedly');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});


