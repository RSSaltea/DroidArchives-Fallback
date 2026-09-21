// Companion activities: Scrap farming, Crafting and the three World missions kinds.
// The mode reserves the right Companions before the rest of the base is planned, so
// the best perk is taken even from a droid that is working, and a locked Companion
// keeps its seat. Run with node tests/companion-activities.cjs (Playwright + Chrome).
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')));}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 const type={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)];
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':type||'application/octet-stream'});res.end(data);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
 const page=await (await browser.newContext({viewport:{width:1400,height:900}})).newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.abort());
 await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.testPlan={state,save,applyProfileData,setCompanionActivity,companionActivityPicks,createOptimisePreview};'}));
 await page.addInitScript(notes=>localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(notes)),JSON.parse(fs.readFileSync(path.join(root,'data/patch-notes.json'),'utf8')).notes.map(n=>n.id));
 const base=`http://127.0.0.1:${server.address().port}`;
 await page.goto(base);
 await page.waitForFunction(()=>window.testPlan?.state.droids.length);
 const profile=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/fusion-staged-table.json'),'utf8'));
 const run=(activity,unlock)=>page.evaluate(([profile,activity,unlock])=>{
  const d=window.testPlan,data=structuredClone(profile.base);if(unlock)for(const row of data.owned)delete row.lockedSlot;
  d.applyProfileData(data);d.save();d.setCompanionActivity(activity);
  const preview=d.createOptimisePreview(),p=preview.projected;
  return {seats:p.placed.filter(x=>x.station==='COMPANION').sort((a,b)=>a.slot-b.slot).map(x=>`${x.name} ${x.variant}`),
   labels:p.placed.filter(x=>x.station==='COMPANION').map(x=>String(x.keepDetail||'')),complete:p.planComplete,issues:p.planIssues,
   swaps:preview.steps.filter(s=>s.type==='swap').length};
 },[profile,activity,unlock]);
 // With CHOPPER locked in the first seat only the second one follows the activity.
 assert.deepEqual((await run('scrap',false)).seats,['CHOPPER DEFAULT','LOM STELLAR'],'the best Credit Multiplier, taken out of its Protocol slot');
 assert.deepEqual((await run('combat',false)).seats,['CHOPPER DEFAULT','DJ R-3X DEFAULT'],'one free seat: DJ R-3X alone');
 // Nothing locked: both seats follow the activity.
 const scrap=await run('scrap',true);
 assert.deepEqual(scrap.seats,['LOM STELLAR','SA-5 STELLAR'],'two Protocol droids, never C-3PO');
 const crafting=await run('crafting',true);
 assert.deepEqual(crafting.seats,['CHOPPER DEFAULT','TRI-TEK STELLAR'],'CHOPPER and the best pickaxe level');
 assert.equal(crafting.complete,true,JSON.stringify(crafting.issues));
 assert.ok(crafting.swaps>=1,'the Stellar TRI-TEK leaves its Build tank by a Companion swap');
 assert.ok(crafting.labels.every(label=>/crafting/.test(label)),JSON.stringify(crafting.labels));
 const combat=await run('combat',true);
 assert.deepEqual(combat.seats,['DJ R-3X DEFAULT','MISTER BONES DEFAULT']);assert.equal(combat.complete,true,JSON.stringify(combat.issues));
 const mining=await run('mining',true);
 assert.deepEqual([...mining.seats].sort(),['CHOPPER DEFAULT','DJ R-3X DEFAULT']);assert.equal(mining.complete,true,JSON.stringify(mining.issues));
 const fishing=await run('fishing',true);
 assert.deepEqual(fishing.seats,['DJ R-3X DEFAULT','BB-8 DEFAULT']);assert.equal(fishing.complete,true,JSON.stringify(fishing.issues));
 // An Iconic you do not have falls through: no MISTER BONES means the best max health.
 const noBones=await page.evaluate(([profile])=>{
  const d=window.testPlan,data=structuredClone(profile.base);for(const row of data.owned)delete row.lockedSlot;
  data.owned=data.owned.filter(row=>row.name!=='MISTER BONES');d.applyProfileData(data);d.save();d.setCompanionActivity('combat');
  const picks=d.companionActivityPicks(d.createOptimisePreview().baseP);
  return {names:picks.picks.map(x=>x.name),missing:picks.missing,types:picks.picks.map(x=>d.state.droids.find(y=>y.name===x.name).type)};
 },[profile]);
 assert.equal(noBones.names[0],'DJ R-3X');assert.deepEqual(noBones.missing,['MISTER BONES']);assert.equal(noBones.types[1],'BATTLE');
 // Off again: the player's own Companion choices are back.
 assert.deepEqual((await run(null,false)).seats,['CHOPPER DEFAULT','CYCLENS BESKAR']);
 // The buttons: World missions opens its three kinds on Combat; pressing the active one turns the mode off.
 await page.evaluate(([profile])=>{const d=window.testPlan;d.applyProfileData(profile.base);d.save();d.setCompanionActivity(null)},[profile]);
 await page.goto(base+'/#/optimise');await page.waitForSelector('[data-companion-activity="scrap"]');
 const pressed=()=>page.evaluate(()=>[...document.querySelectorAll('[data-companion-activity][aria-pressed="true"]')].map(b=>b.dataset.companionActivity));
 assert.deepEqual(await pressed(),[]);
 assert.equal(await page.locator('.companion-activity-sub').count(),0);
 await page.click('[data-companion-activity="missions"]');await page.waitForSelector('.companion-activity-sub');
 assert.deepEqual(await pressed(),['missions','combat']);
 await page.click('[data-companion-activity="fishing"]');await page.waitForFunction(()=>document.querySelector('[data-companion-activity="fishing"]')?.getAttribute('aria-pressed')==='true');
 assert.match(await page.locator('.companion-activity small').innerText(),/DJ R-3X/);
 await page.click('[data-companion-activity="scrap"]');await page.waitForFunction(()=>!document.querySelector('.companion-activity-sub'));
 assert.deepEqual(await pressed(),['scrap']);
 assert.match(await page.locator('.companion-activity small').innerText(),/LOM Stellar/);
 await page.click('[data-companion-activity="scrap"]');await page.waitForFunction(()=>!document.querySelector('[data-companion-activity][aria-pressed="true"]'));
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('companion-activities: all passed');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exit(1);});
