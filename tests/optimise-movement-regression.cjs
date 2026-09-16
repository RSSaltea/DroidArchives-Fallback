// End-to-end Optimise movement regressions using the real browser-loaded app.
// Run with node tests/optimise-movement-regression.cjs (Playwright and Edge).
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')))}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data)});
});
const key=u=>`${u.source}:${u.unit}`,spot=u=>`${u.station}:${u.slot}`;
function replay({base,target,steps}){
 const current=new Map(base.placed.map(u=>[key(u),{...u}]));
 const building=u=>['BUILD','FUSION_BUILD'].includes(u.station)&&!u.built;
 const position=(value,slot)=>typeof value==='string'?{station:value,slot}:value;
 for(const step of steps){
  assert(!['note','fuse','fuse-in','fuse-held'].includes(step.type),`unexpected action: ${step.text}`);
  const unit=current.get(key(step.unit));assert(unit,`missing copy: ${step.text}`);
  const from=position(step.from,step.fromSlot);
  assert.equal(spot(unit),spot(from),`stale origin: ${step.text}`);
  assert(!unit.lockedSlot&&!building(unit),`moving a protected copy: ${step.text}`);
  if(step.type==='sell'){current.delete(key(unit));continue}
  if(step.type==='swap'){
   const other=current.get(key(step.withUnit));assert(other,`missing swap copy: ${step.text}`);
   assert.equal(spot(other),spot(step.withFrom));assert(!other.lockedSlot&&!building(other));
   assert(!(unit.name===other.name&&unit.variant===other.variant),`identical-copy swap: ${step.text}`);
   const origin={station:unit.station,slot:unit.slot};
   Object.assign(unit,{station:other.station,slot:other.slot,built:true});Object.assign(other,{...origin,built:true});
  }else{
   assert.equal(step.type,'move');const to=position(step.to,step.toSlot);
   assert(![...current.values()].some(u=>spot(u)===spot(to)),`occupied destination: ${step.text}`);
   assert(!['BUILD','FUSION_BUILD'].includes(to.station),'empty Build slots cannot be filled by an ordinary move');
   Object.assign(unit,{...to,built:true});
  }
  assert.equal(new Set([...current.values()].map(spot)).size,current.size,'duplicate physical occupancy');
 }
 // Checking only requested goals misses a displaced copy stranded in Fusion
 // Build while the preview calls it overflow. Compare the whole physical base.
 const rows=units=>units.map(u=>`${key(u)}|${u.name}|${u.variant}|${spot(u)}`).sort();
 assert.deepEqual(rows([...current.values()]),rows(target.placed),'every surviving physical copy must match the preview');
 assert.equal(target.overflow.length,0,'a full but physically placed base must not invent overflow');
 return current;
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message)});
  await page.route('https://**/*',r=>r.abort());
  await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.movementTest={state,save,route,SLOT_RULES,blankProfileData,applyProfileData,placements,optimiseBase,incomeForPlaced,optimisedPlacements,safeOptimiseStepPlan,isBuilding};'}));
  await page.goto(`http://127.0.0.1:${server.address().port}/#/base`);await page.waitForFunction(()=>window.movementTest?.state.droids.length);
  await page.evaluate(()=>{
   const t=window.movementTest;
   t.prepare=caps=>{
    t.applyProfileData(t.blankProfileData());
    Object.assign(t.state,{rebirth:34,cycle:0,superRebirthGoal:35,cantinaPurchases:{},novaUpgrades:{'upgrade-chip-station':1},purchasedSlots:[],fusionAsLounge:false,optimiseFuseFirst:false,optimiseFreeBuild:false,optimiseKeepDroidex:false,fusionKeepRules:[{rarity:'MYTHIC',variant:'BESKAR'}]});
    // Isolate occupied positions without mocking movement or the optimiser.
    // The real game's slot unlock and routing functions still run unchanged.
    for(const station of Object.keys(t.SLOT_RULES))Object.assign(t.SLOT_RULES[station],{initial:caps[station]||0,unlocks:[],costs:[]});
    localStorage.setItem('droid-archive-optimise-step-style','route');
   };
  });
  const screenshot=await page.evaluate(()=>{
   const t=window.movementTest;t.prepare({FUSION_BUILD:1,WORKER:1,LOUNGE:1,UPGRADE_CHIP:1});
   t.state.owned=[{name:'RIC-1200',variant:'GALACTIC',preferred:'FUSION_BUILD'},{name:'RIC-1200',variant:'BESKAR',preferred:'WORKER'},{name:'RIC',variant:'BESKAR',preferred:'LOUNGE'},{name:'RIC',variant:'BESKAR',preferred:'UPGRADE_CHIP'}].map(u=>({...u,qty:1,preferredSlot:0,built:true}));
   const base=t.placements();
   const target={placed:base.placed.filter(u=>u.source<3).sort((a,b)=>a.source-b.source).map((u,i)=>({...u,station:['WORKER','LOUNGE','UPGRADE_CHIP'][i],slot:0})),overflow:base.placed.filter(u=>u.source===3),sell:[]};
   const steps=t.safeOptimiseStepPlan(base,target);return{base,target,steps};
  });
  assert.equal(screenshot.steps.length,2,'reported Fusion Build chain should finish after two useful swaps');
  assert(screenshot.steps.every(s=>s.type==='swap'));
  const completed=replay(screenshot);
  assert.equal(completed.get('0:0').station,'WORKER');assert.equal(completed.get('1:0').station,'LOUNGE');
  assert.equal(completed.get('2:0').station,'FUSION_BUILD');assert.equal(completed.get('3:0').station,'UPGRADE_CHIP');
  console.log('PASS: reported Fusion Build chain has two meaningful swaps, no identical swap or phantom overflow.');
  const build=await page.evaluate(()=>{
   const t=window.movementTest;t.prepare({WORKER:1,BUILD:1});
   t.state.owned=[{name:'RIC-1200',variant:'GALACTIC',preferred:'BUILD',preferredSlot:0,qty:1,built:true},{name:'RIC',variant:'BESKAR',preferred:'WORKER',preferredSlot:0,qty:1}];
   const base=t.placements(),target=t.optimisedPlacements(base,t.optimiseBase(base,t.incomeForPlaced(base.placed))),steps=t.safeOptimiseStepPlan(base,target);
   return{base,target,steps};
  });
  assert.equal(build.steps.length,1);assert.equal(build.steps[0].type,'swap');replay(build);
  const replacement=build.target.placed.find(u=>u.station==='BUILD');assert.equal(replacement?.name,'RIC');assert.equal(replacement.built,true,'a droid already working remains completed after a Build swap');
  await page.evaluate(rows=>{const t=window.movementTest;t.state.owned=rows;t.save()},build.target.rows);
  const saved=await page.evaluate(()=>window.movementTest.state.owned);
  assert.equal(saved.find(u=>u.preferred==='BUILD').built,true,'Apply rows preserve completed status');
  await page.reload();await page.waitForFunction(()=>window.movementTest?.state.droids.length);
  const restored=await page.evaluate(()=>{const t=window.movementTest;return{owned:t.state.owned,building:t.placements().placed.filter(t.isBuilding)}});
  assert.deepEqual(restored.owned,saved);assert.equal(restored.building.length,0,'reload must not turn the displaced worker into an unfinished build');
  console.log('PASS: real allocation, saved rows and reload preserve completed status on the displaced Build droid.');
  const unchanged=await page.evaluate(()=>{
   const t=window.movementTest,out=[];
   for(const names of [['RIC','RIC'],['RIC','RIC-1200']]){
    const placed=names.map((name,source)=>({name,variant:'BESKAR',source,unit:0,station:'WORKER',slot:source,built:true}));
    const base={placed,overflow:[]},target={placed:placed.map(u=>({...u,slot:1-u.slot})),overflow:[],sell:[]};
    const steps=t.safeOptimiseStepPlan(base,target);out.push({base,target,steps});
   }
   return out;
  });
  for(const result of unchanged){assert.equal(result.steps.length,0,'equal Worker jobs should stay in their current slots');replay(result)}
  console.log('PASS: identical copies and equivalent Worker positions need no commands.');
  const unreachable=await page.evaluate(()=>{
   const t=window.movementTest,before=JSON.stringify(t.state.owned);
   const unit={name:'RIC',variant:'BESKAR',source:0,unit:0,station:'WORKER',slot:0,built:true};
   const base={placed:[unit],overflow:[]},target={placed:[{...unit,station:'BUILD',slot:0}],overflow:[],sell:[]};
   const steps=t.safeOptimiseStepPlan(base,target);
   return {complete:target.planComplete,issues:target.planIssues,steps,before,after:JSON.stringify(t.state.owned)};
  });
  assert.equal(unreachable.complete,false,'an empty Build destination is not reachable with a normal command');
  assert(unreachable.issues.length>0);assert(unreachable.steps.some(s=>s.type==='note'));
  assert.equal(unreachable.after,unreachable.before,'failed planning must preserve the live roster');
  assert.deepEqual(errors,[]);console.log('PASS: an unreachable empty Build target fails closed with the roster unchanged.');
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
