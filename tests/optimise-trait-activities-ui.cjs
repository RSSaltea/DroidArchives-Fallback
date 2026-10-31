const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require(path.join(__dirname,'../research/tools/ui-test/node_modules/playwright')))}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data)});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1360,height:960}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.abort());
  await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.traitTest={prepareOptimiseLayout,state,placements,companionActivityPicks,setCompanionActivity,blankProfileData,autoPurchaseEligibleSlots,companionPerkActive};'}));
  await page.goto(`http://127.0.0.1:${server.address().port}/#/traits`);
  await page.waitForFunction(()=>window.traitTest?.state.droids.length);


  const run=async(activity,trait,station='COMPANION',locked=false)=>page.evaluate(({activity,trait,station,locked})=>{
    const t=window.traitTest;Object.assign(t.state,t.blankProfileData());t.state.rebirth=40;t.state.autoPurchaseSlots=true;t.autoPurchaseEligibleSlots();t.state.companionGoals=[];
    t.state.owned=[{name:'DJ R-3X',variant:'DEFAULT',qty:1,preferred:station,preferredSlot:0,lockedSlot:locked,...(trait?{trait:{id:22,tier:'Rainbow'}}:{})},{name:'BB-8',variant:'DEFAULT',qty:1,preferred:'LOUNGE',preferredSlot:0},{name:'GONK',variant:'DEFAULT',qty:1,preferred:'WORKER',preferredSlot:0}];
    t.setCompanionActivity(activity);const base=t.placements(),choice=t.companionActivityPicks(base),plan=t.prepareOptimiseLayout();
    return {picks:choice.picks.map(u=>u.name),placed:plan.projected.placed.map(u=>({name:u.name,station:u.station,trait:u.trait})),perk:plan.projected.placed.some(u=>t.companionPerkActive(u,'DJ R-3X'))};
  },{activity,trait,station,locked});
  for(const activity of ['combat','mining','fishing']){
    for(const station of ['COMPANION','LOUNGE','WORKER']){
      const result=await run(activity,true,station);assert(!result.picks.includes('DJ R-3X'),JSON.stringify(result));assert(result.perk);assert.notEqual(result.placed.find(u=>u.name==='DJ R-3X')?.station,'COMPANION');
    }
    const plain=await run(activity,false);assert(plain.picks.includes('DJ R-3X'));assert.equal(plain.placed.find(u=>u.name==='DJ R-3X').station,'COMPANION');
  }
  const locked=await run('fishing',true,'COMPANION',true);assert.equal(locked.placed.find(u=>u.name==='DJ R-3X').station,'COMPANION');
  const both=await page.evaluate(()=>{const t=window.traitTest;t.state.owned[0].lockedSlot=false;t.state.owned[1].trait={id:21,tier:'Rainbow'};const p=t.prepareOptimiseLayout().projected.placed;return ['DJ R-3X','BB-8'].map(name=>({name,station:p.find(u=>u.name===name)?.station,active:p.some(u=>t.companionPerkActive(u,name))}));});
  assert(both.every(u=>u.active&&u.station!=='COMPANION'),JSON.stringify(both));
  assert.deepEqual(errors,[]);console.log('Activity traits: DJ works across all mission modes and starting rooms; BB-8 works; no-trait companions and explicit locks preserved.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
