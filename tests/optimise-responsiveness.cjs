// Dense layout comparisons and recommendations must never block profile edits.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')));}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.json':'application/json','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data)});
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
 const page=await browser.newPage();await page.route('https://**/*',r=>r.abort());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
 await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+`\nwindow.mainAllocations=0;const originalBase=optimiseBase;optimiseBase=function(...args){window.mainAllocations++;return originalBase(...args)};window.t={state,applyProfileData,blankProfileData,optimiseInputStamp,save,read:()=>optimisePreviewCache?.preview,job:()=>optimiseBackgroundJob,status:()=>optimiseBackgroundStatus};`}));
 await page.goto('http://127.0.0.1:'+server.address().port+'/#/optimise');await page.waitForFunction(()=>window.t?.state.droids.length);
 const profile=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/locked-companion-routing.json'),'utf8'));
 for(const integrated of [true,false]){
  await page.evaluate(({profile,integrated})=>{
   t.applyProfileData({...t.blankProfileData(),...profile});t.state.optimiseIncludeIconics=integrated;
   t.state.novaIconicUnlocks=t.state.droids.filter(d=>d.rarity==='ICONIC').map(d=>d.name);
   window.mainAllocations=0;window.beats=0;window.maxGap=0;window.lastBeat=performance.now();window.started=performance.now();
   clearInterval(window.beatTimer);window.beatTimer=setInterval(()=>{const now=performance.now();window.maxGap=Math.max(maxGap,now-lastBeat);lastBeat=now;window.beats++},20);
   t.save();
  },{profile:profile.base||profile,integrated});
  // Change inputs during the expensive layout phase. The old worker must be
  // cancelled, and its result must never replace the new profile's preview.
  await new Promise(r=>setTimeout(r,800));
  const editStart=Date.now();
  await page.evaluate(()=>{t.state.multiplier+=0.01;t.save()});
  const editMs=Date.now()-editStart;
  if(integrated){
   // Exercise the expensive multi-purchase layout. Route correctness and Apply
   // are covered separately by optimise-iconic-purchases.cjs.
   await page.waitForFunction(()=>t.job()?.stamp===t.optimiseInputStamp()&&t.job()?.targets,{},{timeout:65000});
   assert(await page.evaluate(()=>t.job().baseP.purchases.length>0));
  }else{
   await page.waitForFunction(()=>{const p=t.read();return p?.inputStamp===t.optimiseInputStamp()&&p.projected.planComplete&&Array.isArray(p.projected.iconicOptions)},{},{timeout:65000});
  }
  const result=await page.evaluate(()=>({elapsed:performance.now()-started,maxGap,beats,allocations:mainAllocations,steps:t.read()?.steps.length,complete:t.read()?.projected.planComplete,options:t.read()?.projected.iconicOptions?.length,status:t.status()}));
  assert.equal(result.allocations,0,'no allocator work runs on the UI thread, including recommendations');
  assert(result.beats>20);assert(result.maxGap<500,'UI heartbeat gap '+result.maxGap+'ms');assert(editMs<1000,'profile edit stayed responsive');
  console.log('PASS: responsive '+(integrated?'integrated Iconic planning':'Iconic recommendations')+' '+JSON.stringify({...result,editMs}));
 }
 assert.deepEqual(errors,[]);

 }finally{await browser.close();server.close()}})().catch(e=>{console.error(e);server.close();process.exitCode=1});