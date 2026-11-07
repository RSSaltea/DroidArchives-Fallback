const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('../tools/node_modules/playwright');
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
 await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.t={state,save,applyProfileData,blankProfileData,placements,optimiseBase,incomeForPlaced,optimisedPlacements,safeOptimiseStepPlan,optimiseFusionChain,optimiseFusionBatches,showFusionKeepSettings,profileDataFromState,baseExport,validateBaseImport,autoPurchaseEligibleSlots,refreshBackgroundOptimise,optimiseInputStamp,optimiseRouteRules,validateOptimisePlan,prepareScourgeSubmissions,fusionOutcome,fusionRaritySteps,optimiseFusionExcluded,keepForFusion,readPreview:()=>optimisePreviewCache?.preview};'}));
 await page.addInitScript(notes=>localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(notes)),JSON.parse(fs.readFileSync(path.join(root,'data/patch-notes.json'))).notes.map(n=>n.id));
 const url=`http://127.0.0.1:${server.address().port}`;
 await page.goto(url);await page.waitForFunction(()=>window.t?.state.droids.length);

 const result=await page.evaluate(()=>{
  const t=window.t;t.applyProfileData(t.blankProfileData());
  Object.assign(t.state,{rebirth:40,superRebirthGoal:40,cycle:0,novaUpgrades:{'fusion-tank':2,'fusion-combine-classes':1},fusionPreferences:{goal:'rarity',mythics:'variant',recipes:true},fusionKeepRules:[{rarity:'LEGENDARY',variant:'GALACTIC'}],optimiseKeepDroidex:false});
  t.autoPurchaseEligibleSlots();
  t.state.owned=[['BB9','SCOURGE'],['R7','STELLAR'],['BB9','STELLAR']].map(([name,variant],i)=>({name,variant,qty:1,built:true,preferred:'FUSION',preferredSlot:i}));
  const base=t.placements();
  const target={placed:base.placed.map(u=>({...u,keepReason:'fusion'})),sell:[],overflow:[]};
  t.prepareScourgeSubmissions(base,target);
  const chain=t.optimiseFusionChain(target,base);
  const steps=t.safeOptimiseStepPlan(base,target);
  window.fusionFixture={base,target,steps};
  return {submissions:target.submissions,chain,steps,complete:target.planComplete,issues:target.planIssues,placed:target.placed};
 });
 assert.deepEqual(result.submissions,[],'fusion reserves are not hand-ins even at the rebirth goal');
 assert.equal(result.chain.length,1);assert.equal(result.chain[0].rarity,'MYTHIC');assert.equal(result.chain[0].variant,'SCOURGE');assert.equal(result.chain[0].requiredClass,'ASTROMECH');
 assert.equal(result.chain[0].spend.filter(p=>p.variant==='SCOURGE').reduce((n,p)=>n+p.count,0),1);
 assert.equal(result.complete,true,JSON.stringify(result.issues));assert(result.steps.some(s=>s.type==='fuse'),JSON.stringify(result.steps));
 await page.evaluate(()=>{t.save();t.refreshBackgroundOptimise();});
 await page.waitForFunction(()=>{const p=t.readPreview();return p?.inputStamp===t.optimiseInputStamp()&&p.projected.planComplete;},{},{timeout:65000});
 const worker=await page.evaluate(()=>({submissions:t.readPreview().projected.submissions,steps:t.readPreview().steps}));
 assert.equal(worker.submissions.length,0,'worker keeps fusion reserves');
 assert(worker.steps.some(s=>s.type==='fuse'&&s.fusion.variant==='SCOURGE'&&s.fusion.rarity==='MYTHIC'),'worker plans the mixed fusion');
 const incorrectOrder=await page.evaluate(()=>{
  const f=structuredClone(window.fusionFixture),swap=n=>n===0?1:n===1?0:n;
  for(const u of f.base.placed)if(u.station==='FUSION')u.slot=swap(u.slot);
  for(const step of f.steps)if(step.type==='fuse-held'){step.from.slot=swap(step.from.slot);step.toSlot=swap(step.toSlot);}
  return t.validateOptimisePlan({initial:f.base,projected:f.target,steps:f.steps,rules:t.optimiseRouteRules()});
 });
 assert.equal(incorrectOrder.ok,false,'independent replay rejects Stellar in the first table slot');
 assert(incorrectOrder.issues.some(s=>s.includes('first Fusion slot')));
 const protections=await page.evaluate(()=>{
  const base=t.placements();base.placed[0].lockedSlot=true;
  const locked=t.optimiseFusionExcluded(base).has('0:0');
  base.placed[0].lockedSlot=false;base.placed[0].station='FUSION_BUILD';base.placed[0].built=false;
  const building=t.optimiseFusionExcluded(base).has('0:0');
  return {locked,building};
 });
 assert.deepEqual(protections,{locked:true,building:true});
 const loungePlan=await page.evaluate(()=>{
  for(const [i,u] of t.state.owned.entries()){u.preferred='LOUNGE';u.preferredSlot=i;}
  const base=t.placements(),target={placed:base.placed.map(u=>({...u,keepReason:'fusion'})),sell:[],overflow:[]};
  const steps=t.safeOptimiseStepPlan(base,target);
  return {submissions:target.submissions,steps,complete:target.planComplete,issues:target.planIssues};
 });
 assert.deepEqual(loungePlan.submissions,[]);
 assert(loungePlan.complete,JSON.stringify(loungePlan.issues));
 assert(loungePlan.steps.some(s=>s.type==='fuse'),'storage inputs can be staged in the correct order');
 const noBatch=await page.evaluate(()=>{
  t.state.owned=t.state.owned.slice(0,1);t.state.owned[0].preferred='LOUNGE';
  const base=t.placements(),target={placed:base.placed.map(u=>({...u,keepReason:'fusion'})),sell:[],overflow:[]};
  t.prepareScourgeSubmissions(base,target);
  return {handIns:target.submissions.length,kept:target.placed.length,chain:t.optimiseFusionChain(target,base).length};
 });
 assert.deepEqual(noBatch,{handIns:0,kept:1,chain:0});
 const noRule=await page.evaluate(()=>{t.state.fusionKeepRules=[];const base=t.placements(),target={placed:[...base.placed],sell:[],overflow:[]};t.prepareScourgeSubmissions(base,target);return target.submissions.length;});
 assert.equal(noRule,1,'ordinary hand-ins still work without a keep rule');
 assert.deepEqual(errors,[]);console.log('PASS: Legendary Galactic+ reserves survive hand-ins; one Scourge plus two Stellar plans a class-aware Scourge Mythic; incomplete batches remain kept.');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});

