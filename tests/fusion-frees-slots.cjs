// A full base: every store taken, every spare kept for fusion or a rebirth, and a
// Stellar TRI-TEK earning nothing in a finished Build tank. The search wanted it
// at work, but the droid it displaced had nowhere to go, so the layout unwound
// to the base as it stands and the page called that optimal. A fusion batch the
// walk can make consumes three kept droids and frees their slots, which lets
// the swap through. Run with node tests/fusion-frees-slots.cjs (Playwright + Chrome).
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
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.abort());
 await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.testPlan={state,save,applyProfileData,placements,optimiseBase,incomeForPlaced,optimisedPlacements,safeOptimiseStepPlan,droidIncomeAt};'}));
 await page.addInitScript(notes=>localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(notes)),JSON.parse(fs.readFileSync(path.join(root,'data/patch-notes.json'),'utf8')).notes.map(n=>n.id));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.waitForFunction(()=>window.testPlan?.state.droids.length);
 const profile=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/fusion-frees-slots.json'),'utf8'));
 const run=fuseFirst=>page.evaluate(([profile,fuseFirst])=>{
  const d=window.testPlan;d.applyProfileData(profile.base);d.state.optimiseFuseFirst=fuseFirst;d.save();
  const base=d.placements(),plan=d.optimiseBase(base,d.incomeForPlaced(base.placed)),target=d.optimisedPlacements(base,plan);
  const steps=d.safeOptimiseStepPlan(base,target);
  const key=x=>`${x.source}:${x.unit}`;
  return {gain:plan.gain,complete:target.planComplete,issues:target.planIssues,overflow:target.overflow.length,sell:target.sell.map(x=>x.name+' '+x.variant),
   income:d.incomeForPlaced(target.placed),currentIncome:d.incomeForPlaced(base.placed),
   triTek:target.placed.filter(x=>x.name==='TRI-TEK'&&x.variant==='STELLAR').map(x=>x.station),
   fusing:(target.fusing||[]).map(x=>x.name+' '+x.variant),
   steps:steps.map(s=>({type:s.type,unit:s.unit&&(s.unit.name+' '+s.unit.variant),to:s.to?.station,text:String(s.text).replace(/<[^>]+>/g,'')}))};
 },[profile,fuseFirst]);
 const result=await run(true);
 assert.equal(errors.length,0,errors.join('\n'));
 assert(result.gain>1e8,'the search still finds the better layout: '+result.gain);
 assert.equal(result.complete,true,JSON.stringify(result.issues));
 assert.equal(result.overflow,0);
 assert.deepEqual(result.sell,[],'kept droids are fused, never sold');
 assert.deepEqual(result.triTek,['ASTROMECH'],'the Stellar TRI-TEK leaves its Build tank for a credit slot');
 assert.equal(result.fusing.length,3,'one batch of three kept droids is consumed: '+result.fusing.join(', '));
 assert(result.income>result.currentIncome*1.1,'the layout the walk reaches earns the gain: '+result.income+' vs '+result.currentIncome);
 const types=result.steps.map(s=>s.type);
 assert.equal(types.filter(t=>t==='fuse-in').length,3,JSON.stringify(result.steps));
 assert.equal(types.filter(t=>t==='fuse').length,1);
 assert(!types.includes('note'),JSON.stringify(result.steps));
 assert(types.indexOf('fuse')<types.lastIndexOf('move'),'the batch clears the slots before the moves that need them');
 const toWork=result.steps.find(s=>s.type==='move'&&s.unit==='TRI-TEK STELLAR');
 assert(toWork&&toWork.to==='ASTROMECH',JSON.stringify(toWork));
 // Nothing a fusion did not take is moved into a Build tank, and no swap is asked for.
 assert(!result.steps.some(s=>s.type==='swap'||s.to==='BUILD'||s.to==='FUSION_BUILD'),JSON.stringify(result.steps));
 // With fusion switched off nothing can be fused and the Lounge is still full,
 // so the walk goes through the Companion seat instead: the card of a finished
 // droid in a tank offers Swap with a Companion slot, the Companion takes the
 // tank, is swapped into the slot the displaced droid leaves, and swaps back
 // out once that droid is the Companion. Nothing is sold and no tank is emptied.
 const off=await run(false);
 assert.equal(off.complete,true,JSON.stringify(off.issues));
 assert.equal(off.fusing.length,0);assert.deepEqual(off.sell,[]);assert.equal(off.overflow,0);
 assert.deepEqual(off.triTek,['ASTROMECH'],'the Stellar TRI-TEK still reaches a credit slot');
 assert.ok(off.steps.length>=3&&off.steps.every(s=>s.type==='swap'),JSON.stringify(off.steps));
 assert.ok(off.steps.every(s=>/press Swap, Slot/.test(s.text)),JSON.stringify(off.steps));
 assert.equal(errors.length,0,errors.join('\n'));
 // The same base a day on: rebirth 32, two droids with no further use, and the
 // three Legendary Galactics the player has already put on the Fusion table.
 // Those three are fused first, exactly as staged; the two dead ends are sold;
 // OPTI-STRIKE takes TRI-TEK's tank through the Companion; nothing is invented.
 const staged=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/fusion-staged-table.json'),'utf8'));
 const later=await page.evaluate(([profile])=>{
  const d=window.testPlan;d.applyProfileData(profile.base);d.state.optimiseFuseFirst=true;d.save();
  const base=d.placements(),plan=d.optimiseBase(base,d.incomeForPlaced(base.placed)),target=d.optimisedPlacements(base,plan);
  const steps=d.safeOptimiseStepPlan(base,target);
  return {complete:target.planComplete,issues:target.planIssues,sell:target.sell.map(x=>x.name+' '+x.variant).sort(),
   triTek:target.placed.filter(x=>x.name==='TRI-TEK'&&x.variant==='STELLAR').map(x=>x.station),
   steps:steps.map(s=>({type:s.type,unit:s.unit&&(s.unit.name+' '+s.unit.variant),from:s.from?.station,text:String(s.text).replace(/<[^>]+>/g,'')}))};
 },[staged]);
 assert.equal(later.complete,true,JSON.stringify(later.issues));
 assert.deepEqual(later.sell,['BB GALACTIC','GROUNDMECH GALACTIC']);
 assert.deepEqual(later.triTek,['ASTROMECH']);
 const held=later.steps.filter(s=>s.type==='fuse-held');
 assert.equal(held.length,3,JSON.stringify(later.steps));
 assert.ok(held.every(s=>s.from==='FUSION'),'the staged batch uses the copies on the table');
 const fuse=later.steps.find(s=>s.type==='fuse');
 assert.ok(fuse&&/already on the table/.test(fuse.text),fuse&&fuse.text);
 assert.ok(later.steps.some(s=>s.type==='swap'),'the tank swap is part of the walk');
 assert.ok(!later.steps.some(s=>s.type==='note'),JSON.stringify(later.steps));
 assert.equal(errors.length,0,errors.join('\n'));
 // Two PROTO-ROLLER Galactics already on the table and a third on the Upgrade Chip,
 // with Fusion settings on Higher rarity. The batch is the two on the table plus a
 // different Legendary Galactic, so the table copies stay put and the third copy goes
 // to the Lounge. Moving it on and an identical one off was a command for nothing.
 const copies=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/fusion-table-copies.json'),'utf8'));
 const table=await page.evaluate(([profile])=>{
  const d=window.testPlan;d.applyProfileData(profile.base);d.state.optimiseFuseFirst=true;d.save();
  const base=d.placements(),plan=d.optimiseBase(base,d.incomeForPlaced(base.placed)),target=d.optimisedPlacements(base,plan);
  const steps=d.safeOptimiseStepPlan(base,target);
  return {complete:target.planComplete,issues:target.planIssues,steps:steps.map(s=>({type:s.type,name:s.unit&&s.unit.name,from:s.from&&s.from.station,to:s.to&&(s.to.station||s.to),text:String(s.text).replace(/<[^>]+>/g,'')}))};
 },[copies]);
 assert.equal(table.complete,true,JSON.stringify(table.issues));
 assert.equal(table.steps.filter(s=>s.type==='fuse-held'&&s.name==='PROTO-ROLLER').length,2,'both copies on the table are used where they stand');
 assert.ok(!table.steps.some(s=>s.name==='PROTO-ROLLER'&&s.from==='FUSION'&&s.type==='move'),'no PROTO-ROLLER is taken off the table');
 assert.ok(table.steps.some(s=>s.type==='move'&&s.name==='PROTO-ROLLER'&&s.from==='UPGRADE_CHIP'&&s.to==='LOUNGE'),'the third copy goes straight to the Lounge');
 const rolled=table.steps.find(s=>s.type==='fuse');
 assert.ok(rolled&&/Mythic droid at Galactic/.test(rolled.text),'Higher rarity rolls a Mythic, not a Stellar PROTO-ROLLER: '+(rolled&&rolled.text));
 assert.equal(errors.length,0,errors.join(String.fromCharCode(10)));
 console.log('fusion-frees-slots: all passed');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exit(1);});
