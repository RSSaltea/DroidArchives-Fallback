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
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  for(const shell of ['index.html','classic.html']){
   const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://**/*',r=>r.abort());
   await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
   await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.loungeTest={state,save,route,stationSlotIndices,isSlotEligible,autoPurchaseEligibleSlots,optimiseRouteRules,prepareOptimiseWorkerJob,optimiseLayoutSnapshot,lockedSlotLabel};'}));
   await page.goto(`${base}/${shell}#/base`);await page.waitForFunction(()=>window.loungeTest?.state.droids.length);
   const rows=await page.evaluate(()=>{
    const t=window.loungeTest,s=t.state,result=[];s.owned=[];s.optimiseIncludeIconics=false;
    for(const auto of [false,true])for(const level of [0,7,8,12])for(const rebirth of [0,3,4,5,17,20]){
     s.rebirth=rebirth;s.novaUpgrades={'lounge-slot':level};s.loungePurchased=0;s.autoPurchaseSlots=auto;s.purchasedSlots=[];t.autoPurchaseEligibleSlots();
     result.push({auto,level,rebirth,slots:t.stationSlotIndices('LOUNGE'),routeSlots:t.optimiseRouteRules().slots('LOUNGE')});
    }
    // Persisted purchase flags must not bypass the tower gate after Super Rebirth.
    s.rebirth=3;s.novaUpgrades={'lounge-slot':12};s.autoPurchaseSlots=false;s.purchasedSlots=['LOUNGE:16'];
    result.push({premature:t.stationSlotIndices('LOUNGE')});t.save();t.route();return result;
   });
   for(const row of rows.slice(0,-1)){
    const expected=[0,1,2,3,4];
    if(row.auto)for(let i=5;i<9;i++)if(row.rebirth>=i+12)expected.push(i);
    for(let i=9;i<21;i++)if(row.level>=i-8&&(i<16||row.rebirth>=4))expected.push(i);
    assert.deepEqual(row.slots,expected,JSON.stringify(row));assert.deepEqual(row.routeSlots,expected);
   }
   assert(rows.at(-1).premature.every(i=>i<16));
   assert.equal(await page.locator('.tm-slot[data-slot="LOUNGE:16"]:not(.tm-locked)').count(),0);
   assert.match(await page.evaluate(()=>window.loungeTest.lockedSlotLabel('LOUNGE',16)),/Rebirth 4/);
   await page.reload();await page.waitForFunction(()=>window.loungeTest?.state.droids.length);
   assert((await page.evaluate(()=>window.loungeTest.stationSlotIndices('LOUNGE'))).every(i=>i<16));
   // Check both the main-thread job and the actual generated worker allocator.
   const jobs=await page.evaluate(async()=>{
    const t=window.loungeTest,s=t.state,result=[];
    const {createOptimiseLayoutContext}=await import('/optimise-layout-context.js');
    for(const rebirth of [3,4]){
     s.rebirth=rebirth;s.purchasedSlots=[];s.autoPurchaseSlots=false;
     const main=t.prepareOptimiseWorkerJob().snapshot.rules.slots.LOUNGE;
     const worker=createOptimiseLayoutContext(t.optimiseLayoutSnapshot()).prepareOptimiseWorkerJob().snapshot.rules.slots.LOUNGE;
     result.push({rebirth,main,worker});
    }
    t.route();return result;
   });
   for(const job of jobs){assert.deepEqual(job.main,job.worker);assert.equal(job.main.filter(i=>i>=16).length,job.rebirth===4?5:0);}
   assert.equal(await page.locator('.tm-slot[data-slot="LOUNGE:16"]:not(.tm-locked)').count(),1);
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS: Lounge R4 tower gate, all Nova tiers, manual/auto purchase modes, reload, map and generated Optimise worker');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
