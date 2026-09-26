// Real Rebirth 35 allocation and route replay, with reproducible random rosters.
// NODE_PATH must include Playwright; CHROME_PATH can select a Chromium browser.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.json':'application/json','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const reports=[];
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.abort());
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.randomTest={state,blankProfileData,applyProfileData,placements,optimiseBase,incomeForPlaced,optimisedPlacements,safeOptimiseStepPlan,optimiseRouteRules,eligibleRebirthSlots,slotPurchaseKey,stationSlotIndices,profileDataFromState,validateOptimisePlan,planOptimiseRoute,normaliseProjectedForSteps,optimiseFusionBatches};'}));
  if(process.env.ROUTE_BASELINE)await page.route('**/optimise-route.js*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.ROUTE_BASELINE,'utf8')+'\nexport function shortenOptimiseWalk(steps,{distance}){const visits=steps.filter((s,i)=>!i||s.visit!==steps[i-1].visit);return {steps,stops:visits.length,travelDistance:visits.reduce((sum,s,i)=>sum+(i?distance(visits[i-1].at,s.at):0),0)};}'}));
  else if(process.env.BEAM_WIDTH)await page.route('**/optimise-route.js*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'optimise-route.js'),'utf8').replace('options.beamWidth || 64',`options.beamWidth || ${Number(process.env.BEAM_WIDTH)}`)}));
  await page.goto(`http://127.0.0.1:${server.address().port}/#/base`);await page.waitForFunction(()=>window.randomTest?.state.droids.length);
  for(const seed of (process.env.SEEDS||'3501,3502,3503,3504,3505,3506,3507,3508').split(',').map(Number)){
   const result=await page.evaluate(({seed,stress,kyber})=>{
    const t=window.randomTest;t.applyProfileData(t.blankProfileData());
    let rng=seed;const random=()=>((rng=Math.imul(rng,1664525)+1013904223>>>0)/4294967296);
    const pick=xs=>xs[Math.floor(random()*xs.length)];
    Object.assign(t.state,{rebirth:35,cycle:0,superRebirthGoal:35,novaUpgrades:{'upgrade-chip-station':1,'companion-slot':1,'fusion-tank':2},cantinaPurchases:{},optimiseFuseFirst:false,optimiseFreeBuild:false,optimiseKeepDroidex:false,optimiseMinGainPercent:0,fusionAsLounge:false,fusionKeepRules:[]});
    t.state.purchasedSlots=t.eligibleRebirthSlots().map(x=>t.slotPurchaseKey(x.type,x.index));
    const pool=t.state.droids.filter(d=>(stress||!d.fusion)&&['LEGENDARY','MYTHIC'].includes(d.rarity)&&['WORKER','ASTROMECH','BATTLE'].includes(d.type));
    const fusionNames=['RIV-3T','LUG-G','AXI-POD','SRV-O','X-ONK','RO-TOR'];
    const rows=[];
    const add=(station,slot,d,extra={})=>{const variants=(kyber?['GALACTIC','STELLAR','KYBER','KYBER_GREEN','KYBER_BLUE','KYBER_PURPLE']:['GALACTIC','STELLAR']).filter(v=>d.variants[v]);if(!variants.length)throw Error('Missing high variants '+d.name);rows.push({name:d.name,variant:pick(variants),qty:1,preferred:station,preferredSlot:slot,built:true,...extra});};
    // Mostly working in their own room, with some cross-room occupants and
    // upgrades waiting in storage or finished tanks. Preserve real capacities.
    for(const station of ['WORKER','ASTROMECH','BATTLE'])for(const slot of t.stationSlotIndices(station)){
     if(seed%3===0&&random()<0.15)continue;
     add(station,slot,pick(random()<0.18?pool:pool.filter(d=>d.type===station)));
    }
    for(const slot of t.stationSlotIndices('LOUNGE').slice(0,5+seed%4))add('LOUNGE',slot,pick(pool));
    for(const slot of t.stationSlotIndices('BUILD').slice(0,seed%3))add('BUILD',slot,pick(pool),{built:seed%2===0});
    for(const slot of t.stationSlotIndices('FUSION_BUILD').slice(0,1+seed%3)){const name=pick(fusionNames);add('FUSION_BUILD',slot,t.state.droids.find(d=>d.name===name));}
    const protocols=t.state.droids.filter(d=>d.type==='PROTOCOL'&&d.variants.GALACTIC);
    for(const station of ['PROTOCOL_WORKER_CREDITS','PROTOCOL_ASTROMECH_CREDITS','PROTOCOL_BATTLE_CREDITS'])if(t.stationSlotIndices(station).length)add(station,0,pick(protocols));
    // A settled, locked companion keeps these scenarios focused on room travel.
    add('COMPANION',0,pick(pool),{lockedSlot:true});
    t.state.owned=rows;
    const profile=t.profileDataFromState(),base=t.placements(),before=JSON.stringify(t.state.owned),start=performance.now();
    const projected=t.optimisedPlacements(base,t.optimiseBase(base,t.incomeForPlaced(base.placed)));
    const targetBefore=structuredClone(projected),steps=t.safeOptimiseStepPlan(base,projected),ms=performance.now()-start;
    const rules=t.optimiseRouteRules(),validation=projected.planComplete?t.validateOptimisePlan({initial:base,projected,steps,rules}):null;
    const visits=steps.filter((s,i)=>!i||s.visit!==steps[i-1].visit).map(s=>s.at);
    const distance=visits.reduce((sum,r,i)=>sum+(i?rules.distance(visits[i-1],r):0),0);
    return {seed,profile,base,targetBefore,projected,steps,complete:projected.planComplete,issues:projected.planIssues,validation,unchanged:before===JSON.stringify(t.state.owned),targetIncome:t.incomeForPlaced(targetBefore.placed),finalIncome:t.incomeForPlaced(projected.placed),visits,distance,commands:steps.filter(s=>s.type!=='note').length,buffers:steps.filter(s=>s.buffer).length,assumed:steps.filter(s=>s.assumed).length,ms};
   },{seed,stress:process.env.STRESS==='1',kyber:process.env.KYBER==='1'});
   reports.push(result);
   console.log(JSON.stringify({seed,complete:result.complete,units:result.base.placed.length,stops:result.visits.length,commands:result.commands,buffers:result.buffers,assumed:result.assumed,distance:Math.round(result.distance*100)/100,ms:Math.round(result.ms),visits:result.visits,issues:result.issues}));
   assert(result.unchanged,'planning changed the roster');
   assert.equal(result.base.overflow.length,0,'random base must physically fit');
   if(result.complete){
    assert.equal(result.validation.ok,true,result.validation.issues.join('\n'));
    assert(Math.abs(result.finalIncome-result.targetIncome)<=Math.max(1,result.targetIncome)*1e-9,'routing changed the optimised income');
   }
  }
  assert.deepEqual(errors,[]);
  if(process.env.REQUIRE_COMPLETE!=='0')assert(reports.every(r=>r.complete),'some random bases could not be routed');
 }finally{
  if(process.env.REPORT_PATH)fs.writeFileSync(process.env.REPORT_PATH,JSON.stringify(reports,null,2));
  await browser.close();server.close();
 }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
