const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require(path.join(__dirname,'../research/tools/ui-test/node_modules/playwright')))}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data)});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  for(const width of [1360,390])for(const [shell,style] of [['index.html','next'],['classic.html','modern'],['classic.html','legacy']]){
   const context=await browser.newContext({viewport:{width,height:960}}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
   await context.addInitScript(style=>localStorage.setItem('droid-archive-ui-style',style),style);
   await page.route('https://**/*',r=>r.abort());
   await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
   await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.fixture={state,blankProfileData,autoPurchaseEligibleSlots,route,fusionOutcome};'}));
   await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/base`);
   await page.waitForFunction(()=>window.fixture?.state.droids.length);
   await page.evaluate(()=>{const t=window.fixture;Object.assign(t.state,t.blankProfileData());t.state.rebirth=40;t.state.autoPurchaseSlots=true;t.autoPurchaseEligibleSlots();t.state.owned=[{name:'GONK',variant:'DEFAULT',qty:1,preferred:'WORKER',preferredSlot:0}];t.route();});
   const trait=page.locator('[data-edit-trait="0"]').filter({visible:true}).first();
   await trait.click();await page.locator('#ownedTrait').selectOption('3');
   await page.locator('#saveOwnedTrait').click();
   assert.equal(await page.evaluate(()=>fixture.state.owned[0].trait.id),3,style);
   await page.locator('[data-edit-trait="0"]').filter({visible:true}).first().click();
   assert.equal(await page.locator('#ownedTrait').inputValue(),'3');
   await page.locator('#cancelOwnedTrait').click();
   const lock=page.locator('.slot-lock[data-source="0"]').filter({visible:true}).first();await lock.click();
   assert.equal(await page.evaluate(()=>fixture.state.owned[0].lockedSlot),true,style+' lock');
   await page.locator('.slot-variant[data-source="0"]').filter({visible:true}).first().click();
   assert(await page.locator('#modalRoot').innerText());
   await page.evaluate(()=>document.querySelector('#modalRoot').innerHTML='');
   await page.locator('.slot-swap[data-source="0"]').filter({visible:true}).first().click();
   assert(await page.locator('#modalRoot').innerText());
   await page.evaluate(()=>document.querySelector('#modalRoot').innerHTML='');
   await page.locator('.slot-delete[data-source="0"]').filter({visible:true}).first().click();
   assert.equal(await page.evaluate(()=>fixture.state.owned.length),0);
   for(const variant of ['KYBER_PURPLE','SCOURGE']){
    await page.evaluate(variant=>{const t=fixture;t.state.owned=['B2 HEAVY','ARG','ARG'].map((name,i)=>({name,variant,qty:1,preferred:'FUSION',preferredSlot:i}));t.route();},variant);
    await page.locator('#runFusion').click();
    const owned=await page.evaluate(()=>fixture.state.owned);
    assert.equal(owned.length,1);assert.equal(owned[0].name,'ARM-CORE');assert.equal(owned[0].variant,variant);
    assert.equal(await page.locator('#modalRoot').innerText(),'','deterministic fusion must not ask for random result');
   }
   assert.deepEqual(errors,[],style);console.log(shell,style,width,'Trait save/reopen, lock, quality, swap, delete and named Kyber/Scourge fusion passed');await context.close();
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
