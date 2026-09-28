// Real background worker and Apply, using only gameplay fields from the reproduction.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')));}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.json':'application/json','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data)});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',dialog=>dialog.accept());await page.route('https://**/*',r=>r.abort());
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.t={state,save,applyProfileData,blankProfileData,placements,optimiseInputStamp,optimiseTickedProjection,toggleTickedStep,optimiseStepKey,applyOptimisedLayout,regionalIncome,read:()=>optimisePreviewCache?.preview};'}));
  await page.addInitScript(notes=>localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(notes)),JSON.parse(fs.readFileSync(path.join(root,'data/patch-notes.json'),'utf8')).notes.map(n=>n.id));
  await page.goto(`http://127.0.0.1:${server.address().port}/#/base`);await page.waitForFunction(()=>window.t?.state.droids.length);
  const profile=JSON.parse(fs.readFileSync(process.env.PROFILE_EXPORT||path.join(__dirname,'fixtures/locked-companion-routing.json'),'utf8'));
  await page.evaluate(p=>{t.applyProfileData({...t.blankProfileData(),...(p.base||p)});t.save();window.heartbeats=0;setInterval(()=>window.heartbeats++,20)},profile);
  await page.waitForFunction(()=>{const p=t.read();return p?.inputStamp===t.optimiseInputStamp()&&p.projected.planComplete},{},{timeout:65000});
  const result=await page.evaluate(async()=>{
   const p=t.read(),key=u=>`${u.source}:${u.unit}`,original=p.baseP.placed.filter(u=>u.station==='COMPANION'&&u.lockedSlot);
   const restored=units=>original.every(u=>units.some(v=>key(v)===key(u)&&v.name===u.name&&v.variant===u.variant&&v.station==='COMPANION'&&v.slot===u.slot&&v.lockedSlot));
   const i=p.steps.findIndex(s=>s.type==='swap'&&s.withUnit?.lockedSlot);
   t.toggleTickedStep(t.optimiseStepKey(p.steps[i]));const partial=t.optimiseTickedProjection(p);t.toggleTickedStep(t.optimiseStepKey(p.steps[i]));
   const strongest=p.projected.placed.filter(u=>u.variant==='KYBER_BLUE').map(u=>({name:u.name,station:u.station}));
   const data={protocolApproach:p.steps.filter(s=>s.unit?.name==='C-3PO'&&s.approachProtocol).map(s=>({from:s.from,at:s.at,to:s.to,text:s.text})),restored:restored(p.projected.placed),swap:i,partial:partial===null,gain:p.income-p.currentIncome,steps:p.steps.length,heartbeats:window.heartbeats,
    lounge:p.projected.placed.filter(u=>u.station==='LOUNGE').length,work:p.projected.placed.filter(u=>['WORKER','ASTROMECH','BATTLE'].includes(u.station)).length,
    c3po:p.projected.placed.find(u=>u.name==='C-3PO')?.station,strongest,regions:Object.fromEntries(Object.entries(t.regionalIncome(p.projected.placed)).map(([region,data])=>[region,data.total]))};
   await t.applyOptimisedLayout(p);data.savedRestored=restored(t.placements().placed);return data;
  });
  assert(result.swap>=0);assert(result.restored&&result.savedRestored,'original locked companions survive planning and Apply');assert(result.partial,'cannot save companions mid-detour');
  assert.equal(result.protocolApproach.length,1);assert.equal(result.protocolApproach[0].from.station,'COMPANION');assert.equal(result.protocolApproach[0].at,'BATTLE');assert.match(result.protocolApproach[0].text,/walk right beside Battle Protocol/);
  assert(result.heartbeats>5,'worker leaves page responsive');assert(result.gain>0);assert.equal(result.lounge,0);assert.equal(result.work,31);
  const region=result.c3po.replace('PROTOCOL_','').replace('_CREDITS','');assert(result.strongest.every(u=>u.station===region),'Kyber earner shares C-3PO support region');
  assert.deepEqual(errors,[]);console.log('PASS: locked Companion detour, restoration, Apply, idle slots and C-3PO support.',JSON.stringify(result));
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
