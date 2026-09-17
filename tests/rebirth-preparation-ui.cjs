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
 const profile=process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2],'utf8')):null;
 await page.evaluate(profile=>{
  const t=window.prepTest;if(profile)Object.assign(t.state,t.validateBaseImport(profile));
  else{
   t.state.cycle=0;t.state.rebirth=34;t.state.superRebirthGoal=35;t.state.novaUpgrades={'chip-sell-bonus':4};
   t.state.rebirths[0]=[{to:35,requiredDroids:[{droidName:'CYCLENS',variant:'STELLAR'},{droidName:'R7',variant:'STELLAR'},{droidName:'DRFT-R',variant:'STELLAR'}]}];
   t.state.owned=[{name:'R7',variant:'STELLAR'},{name:'DRFT-R',variant:'STELLAR'},{name:'MECHA-DROID',variant:'GALACTIC'},{name:'BB9',variant:'GALACTIC'},{name:'CYCLO-GRAV',variant:'GALACTIC'},{name:'KX',variant:'BESKAR'},{name:'IG',variant:'BESKAR'},{name:'LOADLIFTER',variant:'BESKAR'}].map(u=>({...u,qty:1,built:true}));
  }
  t.state.sharedView=null;localStorage.setItem('droid-archive-chip-sell-collapsed','0');t.save();t.route();
 },profile);
 const panel=page.locator('.chip-sell-calculator'),row=panel.locator('.rebirth-fusion-option').first();
 assert.match(await panel.locator('h2').innerText(),/Rebirth preparation/);
 assert.match(await page.locator('#toggleChipSellPanel').innerText(),/Rebirth Prep/);assert.equal(await page.locator('#toggleChipSellPanel .command-icon').count(),1);
 assert.match(await panel.innerText(),/CYCLENS/);assert.match(await panel.innerText(),/Random Mythic roll/);
 const before=await page.evaluate(()=>JSON.stringify(window.prepTest.baseExport().base.owned));
 await row.locator('summary').click();await panel.locator('[data-fusion-credit-balance]').fill('1T');await row.locator('[data-fusion-credit-cost]').fill('250B');
 assert.match(await row.locator('[data-fusion-credit-status]').innerText(),/Enough credits.*750B left/);
 await panel.locator('[data-fusion-credit-balance]').fill('10B');assert.match(await row.locator('[data-fusion-credit-status]').innerText(),/240B credits short/);
 await row.locator('[data-fusion-credit-cost]').fill('bad');assert.match(await row.locator('[data-fusion-credit-status]').innerText(),/Enter a number/);
 await row.locator('[data-fusion-credit-cost]').fill('250B');
 assert.equal(await page.evaluate(()=>JSON.stringify(window.prepTest.baseExport().base.owned)),before,'scenario never consumes or sells inventory');
 await panel.screenshot({path:path.join(root,'research/rebirth-preparation-desktop.png')});
 await page.setViewportSize({width:390,height:844});await row.scrollIntoViewIfNeeded();
 assert(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 await row.screenshot({path:path.join(root,'research/rebirth-preparation-mobile.png')});
 await page.locator('#toggleChipSellPanel').click();assert.equal(await panel.isVisible(),false);
 await page.reload();await page.waitForSelector('#toggleChipSellPanel');assert.equal(await panel.isVisible(),false,'existing collapse preference persists');
 assert.deepEqual(errors,[]);console.log('PASS: rebirth preparation UI, credit comparisons, no inventory mutation, panel toggle and mobile layout');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
