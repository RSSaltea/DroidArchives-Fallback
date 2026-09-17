// End-to-end Optimise movement regressions using the real browser-loaded app.
// Run with node tests/optimise-movement-regression.cjs (Playwright and Edge).
// The game offers a droid only Work, Lounge, Fusion, Companion and Sell, so a
// plan may contain nothing else; every step is replayed against occupancy.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')))}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data)});
});
const key=u=>`${u.source}:${u.unit}`,spot=u=>`${u.station}:${u.slot}`;
const COMMANDS=['sell','move','fuse-in','fuse-held','fuse'];
function replay({base,target,steps}){
 const current=new Map(base.placed.map(u=>[key(u),{...u}]));
 const building=u=>['BUILD','FUSION_BUILD'].includes(u.station)&&!u.built;
 const position=(value,slot)=>typeof value==='string'?{station:value,slot}:value;
 for(const step of steps){
  assert(COMMANDS.includes(step.type),`not a command the game offers: ${step.type} ${step.text}`);
  assert(step.at&&step.visit,`every step belongs to a stop: ${step.text}`);
  if(step.type==='fuse')continue;
  const unit=current.get(key(step.unit));assert(unit,`missing copy: ${step.text}`);
  const from=position(step.from,step.fromSlot);
  assert.equal(spot(unit),spot(from),`stale origin: ${step.text}`);
  assert(!unit.lockedSlot&&!building(unit),`moving a protected copy: ${step.text}`);
  if(step.type==='sell'||step.type==='fuse-in'||step.type==='fuse-held'){current.delete(key(unit));continue}
  const to=position(step.to,step.toSlot);
  assert(![...current.values()].some(u=>spot(u)===spot(to)),`occupied destination: ${step.text}`);
  assert(!['BUILD','FUSION_BUILD'].includes(to.station),'nothing can be moved into a Build slot');
  Object.assign(unit,{...to});
  assert.equal(new Set([...current.values()].map(spot)).size,current.size,'duplicate physical occupancy');
 }
 const rows=units=>units.filter(u=>!u.fusionResult).map(u=>`${key(u)}|${u.name}|${u.variant}|${spot(u)}`).sort();
 assert.deepEqual(rows([...current.values()]),rows(target.placed),'every surviving physical copy must match the preview');
 return current;
}
const stops=steps=>steps.reduce((n,s,i)=>n+(i===0||s.visit!==steps[i-1].visit?1:0),0);
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message)});
  await page.route('https://**/*',r=>r.abort());
  await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.movementTest={state,save,route,SLOT_RULES,blankProfileData,applyProfileData,placements,optimiseBase,incomeForPlaced,optimisedPlacements,safeOptimiseStepPlan,isBuilding};'}));
  await page.goto(`http://127.0.0.1:${server.address().port}/#/base`);await page.waitForFunction(()=>window.movementTest?.state.droids.length);
  const install=()=>page.evaluate(()=>{
   const t=window.movementTest;
   t.prepare=caps=>{
    t.applyProfileData(t.blankProfileData());
    Object.assign(t.state,{rebirth:34,cycle:0,superRebirthGoal:35,cantinaPurchases:{},novaUpgrades:{'upgrade-chip-station':1},purchasedSlots:[],fusionAsLounge:false,optimiseFuseFirst:false,optimiseFreeBuild:false,optimiseKeepDroidex:false,optimiseMinGainPercent:0,fusionKeepRules:[{rarity:'MYTHIC',variant:'BESKAR'}]});
    // Isolate occupied positions without mocking movement or the optimiser.
    for(const station of Object.keys(t.SLOT_RULES))Object.assign(t.SLOT_RULES[station],{initial:caps[station]||0,unlocks:[],costs:[]});
    localStorage.setItem('droid-archive-optimise-step-style','route');
   };
   t.plan=()=>{const base=t.placements(),target=t.optimisedPlacements(base,t.optimiseBase(base,t.incomeForPlaced(base.placed))),steps=t.safeOptimiseStepPlan(base,target);return {base,target,steps,complete:target.planComplete,issues:target.planIssues}};
  });await install();
  // A finished droid in Fusion Build goes to work; nothing is ever swapped into
  // the build slot it leaves behind.
  const fusionBuild=await page.evaluate(()=>{
   const t=window.movementTest;t.prepare({FUSION_BUILD:1,WORKER:1,LOUNGE:1,UPGRADE_CHIP:1});
   t.state.owned=[{name:'RIC-1200',variant:'GALACTIC',preferred:'FUSION_BUILD'},{name:'RIC-1200',variant:'GOLD',preferred:'WORKER'},{name:'RIC',variant:'BESKAR',preferred:'LOUNGE'},{name:'RIC',variant:'BESKAR',preferred:'UPGRADE_CHIP'}].map(u=>({...u,qty:1,preferredSlot:0,built:true}));
   return t.plan();
  });
  assert.equal(fusionBuild.complete,true,JSON.stringify(fusionBuild.issues));
  const after=replay(fusionBuild);
  assert.equal(after.get('0:0').station,'WORKER','the finished Fusion Build droid works');
  assert(fusionBuild.steps.some(s=>s.type==='sell'&&s.unit.variant==='GOLD'),'the weaker copy with nowhere to go is sold');
  assert(!fusionBuild.steps.some(s=>s.type==='move'&&s.to?.station==='FUSION_BUILD'));
  assert(fusionBuild.steps.filter(s=>s.type==='move').every(s=>s.kind==='work'||s.kind==='lounge'));
  console.log('PASS: a finished Fusion Build droid is sent to work; the slot it leaves stays empty.');
  const build=await page.evaluate(()=>{
   const t=window.movementTest;t.prepare({WORKER:1,BUILD:1});
   t.state.owned=[{name:'RIC-1200',variant:'GALACTIC',preferred:'BUILD',preferredSlot:0,qty:1,built:true},{name:'RIC',variant:'GOLD',preferred:'WORKER',preferredSlot:0,qty:1}];
   return t.plan();
  });
  assert.equal(build.complete,true,JSON.stringify(build.issues));replay(build);
  assert(!build.target.placed.some(u=>u.station==='BUILD'),'the completed Build droid leaves and nothing replaces it');
  assert(build.steps.some(s=>s.kind==='work'&&s.from.station==='BUILD'));
  await page.evaluate(rows=>{const t=window.movementTest;t.state.owned=rows;t.save()},build.target.rows);
  await page.reload();await page.waitForFunction(()=>window.movementTest?.state.droids.length);await install();
  const restored=await page.evaluate(()=>{const t=window.movementTest;return{building:t.placements().placed.filter(t.isBuilding).length,build:t.placements().placed.filter(u=>u.station==='BUILD').length}});
  assert.equal(restored.building,0,'reload must not turn anything into an unfinished build');assert.equal(restored.build,0);
  console.log('PASS: real allocation, saved rows and reload agree after a Build droid goes to work.');
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
  // A full two-room exchange: Worker droids into Battle and Battle droids into
  // Worker. A droid's own slot counts as occupied, so nothing can leave a full
  // room directly: one room buffers through the Lounge, three stops in all.
  const exchange=await page.evaluate(()=>{
   const t=window.movementTest;t.prepare({WORKER:3,BATTLE:3,ASTROMECH:0,LOUNGE:3});
   t.state.droids.push({name:'TEST WORKER',type:'WORKER',rarity:'COMMON',variants:{DEFAULT:{income:1}}},{name:'TEST BATTLE',type:'BATTLE',rarity:'COMMON',variants:{DEFAULT:{income:1}}});
   const base={placed:Array.from({length:6},(_,i)=>({name:i<3?'TEST WORKER':'TEST BATTLE',variant:'DEFAULT',source:i,unit:0,station:i<3?'BATTLE':'WORKER',slot:i%3,built:true})),overflow:[]};
   const target={placed:base.placed.map(u=>({...u,station:u.station==='WORKER'?'BATTLE':'WORKER'})),overflow:[],sell:[]};
   const steps=t.safeOptimiseStepPlan(base,target);return {base,target,steps,complete:target.planComplete,issues:target.planIssues};
  });
  assert.equal(exchange.complete,true,JSON.stringify(exchange.issues));replay(exchange);
  assert.equal(stops(exchange.steps),3,'two rooms plus one Lounge buffer');assert(exchange.steps.every(s=>s.kind==='work'||s.kind==='lounge'));
  console.log('PASS: a Worker/Battle exchange buffers one room through the Lounge in three stops.');
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
