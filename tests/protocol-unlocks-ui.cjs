const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')))}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data)});
});
const unlocks=[['WORKER','CREDITS',2,500000],['ASTROMECH','CREDITS',6,10000000],['BATTLE','CREDITS',10,400000000],['WORKER','CRAFTING',14,11000000000],['ASTROMECH','CRAFTING',18,280000000000],['BATTLE','CRAFTING',22,3900000000000]];
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.abort());await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.slotTest={state,save,route,PROTOCOL_SLOTS,SLOT_RULES,stationSlotIndices,slotUnlockRebirth,isSlotEligible,autoPurchaseEligibleSlots,placements,optimiseBase,incomeForPlaced};'}));
  await page.goto(base+'/#/base');await page.waitForFunction(()=>window.slotTest?.state.droids.length);
  for(const [region,role,rebirth,cost] of unlocks){
   const station=`PROTOCOL_${region}_${role}`;
   const result=await page.evaluate(({station,rebirth})=>{
    const t=window.slotTest,s=t.state;s.owned=[];s.purchasedSlots=[];s.autoPurchaseSlots=false;
    s.rebirth=rebirth-1;const before=t.isSlotEligible(station,0);s.purchasedSlots=[station+':0'];const premature=t.stationSlotIndices(station);
    s.rebirth=rebirth;s.purchasedSlots=[];const eligible=t.isSlotEligible(station,0),unbought=t.stationSlotIndices(station);
    t.autoPurchaseEligibleSlots();const disabledPurchase=s.purchasedSlots.includes(station+':0');t.save();t.route();
    return {before,premature,eligible,unbought,disabledPurchase,metadata:t.PROTOCOL_SLOTS[station],rule:t.SLOT_RULES[station]};
   },{station,rebirth});
   assert.equal(result.before,false);assert.deepEqual(result.premature,[],'stored purchase cannot bypass rebirth');assert(result.eligible);assert.deepEqual(result.unbought,[]);assert(!result.disabledPurchase);
   assert.equal(result.metadata.costCredits,cost);assert.deepEqual(result.rule.unlocks,[rebirth]);assert.deepEqual(result.rule.costs,[cost]);assert.equal(result.rule.initial,0);
   await page.locator(`[data-purchase-station="${station}"]`).click();
   assert.deepEqual(await page.evaluate(station=>window.slotTest.stationSlotIndices(station),station),[0]);
   await page.reload();await page.waitForFunction(()=>window.slotTest?.state.droids.length);
   assert.deepEqual(await page.evaluate(station=>window.slotTest.stationSlotIndices(station),station),[0],'manual purchase persists');
  }
  const result=await page.evaluate(()=>{
   const t=window.slotTest,s=t.state,checks=[];s.autoPurchaseSlots=true;
   s.owned=[{name:'LOM',variant:'DEFAULT',qty:6,built:true,preferred:'LOUNGE'}];
   for(let rebirth=0;rebirth<=22;rebirth++){
    s.rebirth=rebirth;s.purchasedSlots=[];t.autoPurchaseEligibleSlots();
    const p=t.placements(),plan=t.optimiseBase(p,t.incomeForPlaced(p.placed));
    checks.push({rebirth,available:Object.keys(t.PROTOCOL_SLOTS).filter(station=>t.stationSlotIndices(station).length),assigned:plan.assignments.filter(u=>u.station.startsWith('PROTOCOL_')).map(u=>u.station)});
   }
   s.owned=[];s.rebirth=0;t.save();t.route();
   const labels=[...document.querySelectorAll('.protocol-divider:not(.fusion-build-divider)')].flatMap(divider=>[divider.nextElementSibling,divider.nextElementSibling.nextElementSibling].map(el=>({text:el.innerText,disabled:el.disabled})));
   return {checks,labels,provisional:t.PROTOCOL_SLOTS.PROTOCOL_WORKER_CRAFTING.unlockRebirthProvisional};
  });
  for(const row of result.checks){const expected=unlocks.filter(u=>u[2]<=row.rebirth).map(u=>`PROTOCOL_${u[0]}_${u[1]}`).sort();assert.deepEqual(row.available.sort(),expected);assert(row.assigned.every(station=>expected.includes(station)),'Optimise must not use locked slots');}
  assert.equal(result.labels.length,6);assert(result.labels.every(label=>label.disabled&&/Unlocks at Rebirth/.test(label.text)));assert(result.provisional);
  assert.deepEqual(errors,[]);console.log('PASS: all six Protocol unlock boundaries, stored costs, manual purchase/reload, automatic purchases, Optimise availability and locked Base labels');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
