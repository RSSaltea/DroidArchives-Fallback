const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':{'.js':'text/javascript','.html':'text/html','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
 await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.t={state,save,applyProfileData,blankProfileData,placements,optimiseBase,incomeForPlaced,stationSlotIndices,purchaseRebirthSlot,isSlotUnlocked,autoPurchaseEligibleSlots,syncCantinaPackUpgrades,changeCurrentRebirth,rebirthMultiplierAt,regularRebirthMultiplier,superRebirthMultiplier,effectiveMultiplier,multiplierHelp,showSuperRebirthConfirm,baseExport,validateBaseImport};'}));
 await page.addInitScript(notes=>localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(notes)),JSON.parse(fs.readFileSync(path.join(root,'data/patch-notes.json'))).notes.map(n=>n.id));
 const url=`http://127.0.0.1:${server.address().port}`;
 await page.goto(url);await page.waitForFunction(()=>window.t?.state.droids.length);
 for(const shell of ['index.html','classic.html']){
  await page.goto(`${url}/${shell}#/base`);await page.waitForFunction(()=>window.t?.state.droids.length);
  const checks=await page.evaluate(()=>{
   const t=window.t,s=t.state;t.applyProfileData(t.blankProfileData());s.autoPurchaseSlots=false;s.rebirth=3;
   const slots=()=>({inputs:t.stationSlotIndices('FUSION'),build:t.stationSlotIndices('FUSION_BUILD')});
   const before=slots(),purchases=[];
   for(const [type,index] of [['FUSION',0],['FUSION',1],['FUSION',2],['FUSION_BUILD',0]]){
    s.purchasedSlots=[];t.purchaseRebirthSlot(type,index);purchases.push(slots());
    s.purchasedSlots=[`${type}:${index}`];purchases.push(slots()); // old partially purchased profiles
   }
   s.purchasedSlots=['FUSION:1'];s.novaUpgrades['fusion-tank']=1;const one=slots();s.novaUpgrades['fusion-tank']=2;const two=slots();
   s.rebirth=2;const early=slots();s.purchasedSlots=[];t.purchaseRebirthSlot('FUSION',0);const denied=s.purchasedSlots.length;
   s.rebirth=3;s.novaUpgrades={};s.cantinaPurchases={'fusion-tank-2':1};t.syncCantinaPackUpgrades();const vbucks=slots();
   t.purchaseRebirthSlot('FUSION_BUILD',0);const roomWithVbucks=slots();
   s.autoPurchaseSlots=true;s.purchasedSlots=[];t.autoPurchaseEligibleSlots();const auto=slots();
   s.autoPurchaseSlots=false;s.purchasedSlots=['FUSION:0'];t.save();
   return {before,purchases,one,two,early,denied,vbucks,roomWithVbucks,auto};
  });
  assert.deepEqual(checks.before,{inputs:[],build:[]});
  for(const row of checks.purchases)assert.deepEqual(row,{inputs:[0,1,2],build:[0]});
  assert.deepEqual(checks.one,{inputs:[0,1,2],build:[0,1]});assert.deepEqual(checks.two,{inputs:[0,1,2],build:[0,1,2]});
  assert.deepEqual(checks.early,{inputs:[],build:[]});assert.equal(checks.denied,0);
  assert.deepEqual(checks.vbucks.build,[1,2]);assert.deepEqual(checks.roomWithVbucks,{inputs:[0,1,2],build:[0,1,2]});assert.deepEqual(checks.auto,checks.roomWithVbucks);
  await page.reload();await page.waitForFunction(()=>window.t?.state.droids.length);
  assert.deepEqual(await page.evaluate(()=>t.stationSlotIndices('FUSION')),[0,1,2],'legacy partial room purchase survives reload');
  const maths=await page.evaluate(()=>{
   const t=window.t,s=t.state;s.multiplier=1;s.rebirth=38;
   const defaultHelp=t.multiplierHelp(),defaultSuper=t.superRebirthMultiplier();t.changeCurrentRebirth(39,()=>{});const raised=s.multiplier;t.changeCurrentRebirth(12,()=>{});const lowered=s.multiplier;
   s.multiplier=-10;const recovered=t.effectiveMultiplier();t.changeCurrentRebirth(20,()=>{});const recoveredStored=s.multiplier;
   s.multiplier=100;s.rebirth=38;const before=t.regularRebirthMultiplier(38),after=t.regularRebirthMultiplier(39);t.changeCurrentRebirth(39,()=>{});const tracked=s.multiplier;
   const imported=t.validateBaseImport({base:{rebirth:38,owned:[]}}).multiplier;
   s.multiplier=1;s.rebirth=38;s.autoPurchaseSlots=true;t.autoPurchaseEligibleSlots();s.owned=[{name:'SNOW MOUSE',variant:'STELLAR',qty:1,preferred:'WORKER',preferredSlot:0,built:true}];
   const p=t.placements(),income=t.incomeForPlaced(p.placed),plan=t.optimiseBase(p,income);
   t.showSuperRebirthConfirm(()=>{});
   return {defaultHelp,defaultSuper,raised,expectedRaised:1+t.regularRebirthMultiplier(39)-t.regularRebirthMultiplier(38),lowered,recovered,recoveredStored,expectedRecovered:1+t.regularRebirthMultiplier(20)-t.regularRebirthMultiplier(12),tracked,expectedTracked:100+after-before,imported,income,gain:plan.gain};
  });
  assert.match(maths.defaultHelp,/still increases with Rebirths/);assert(!/retained total: -/.test(maths.defaultHelp));
  for(const key of ['defaultSuper','lowered','recovered','imported'])assert.equal(maths[key],1,key);
  assert(Math.abs(maths.raised-maths.expectedRaised)<1e-6);assert(Math.abs(maths.recoveredStored-maths.expectedRecovered)<1e-6);assert(Math.abs(maths.tracked-maths.expectedTracked)<1e-6);assert(maths.income>0);assert(Number.isFinite(maths.gain));
  assert.match(await page.locator('#modalRoot').innerText(),/minimum 1x/);
  await page.locator('#confirmSuperRebirth').click();await page.locator('#confirmSuperRebirth').click();
  assert.deepEqual(await page.evaluate(()=>({rebirth:t.state.rebirth,multiplier:t.state.multiplier,owned:t.state.owned.length})),{rebirth:0,multiplier:1,owned:0},'default multiplier must not block Super Rebirth');
 }
 assert.deepEqual(errors,[]);console.log('PASS: manual room purchase opens all input slots and first tank; legacy saves; Nova/V-Bucks tanks; Auto Purchase off/on; both shells; automatic multiplier increases, valid tracked maths and Super Rebirth');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
