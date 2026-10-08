const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')))}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data)});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.abort());
 await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
 await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.prepTest={state,route,save,validateBaseImport,baseExport};'}));
 await page.goto(base+'/#/base');await page.waitForFunction(()=>window.prepTest?.state.droids.length);
 await page.goto(base+'/#/cantina-shop');
 await page.locator('[data-cantina-category="packs"]').click();
 await page.locator('[data-cantina-select="huyang-bundle"]').click();
 const detail=page.locator('.cantina-detail');
 assert.match(await detail.innerText(),/Huyang Bundle/);
 assert.match(await detail.innerText(),/1[,.]5K|1,500|1500/i);
 assert.match(await detail.innerText(),/Huyang Base Paint/);
 assert.match(await detail.innerText(),/1 Crafting Boost token/i);
 await page.locator('#cantinaOwned').check();
 assert.deepEqual(await page.evaluate(()=>({h:window.prepTest.state.novaUpgrades['huyang-hologram'],k:window.prepTest.state.novaUpgrades['kyber-droid-sell'],token:window.prepTest.state.novaUpgrades['crafting-boost-token']||0})),{h:1,k:1,token:0});
 await page.reload();await page.waitForSelector('#cantinaOwned');
 assert.equal(await page.locator('#cantinaOwned').isChecked(),true);
 assert.deepEqual(errors,[]);console.log('PASS: Huyang bundle contents, price, saved ownership, both permanent perks and no repeated token grant');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});

