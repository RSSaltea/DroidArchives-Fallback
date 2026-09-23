// Real module worker, independent of the synchronous preview entry point.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.json':'application/json','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data)});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.abort());
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+`\nwindow.bgTest={state,save,route,validateBaseImport,optimiseInputStamp,backgroundOptimisePreview,applyOptimisedLayout,toggleTickedStep,optimiseStepKey,read:()=>({job:optimiseBackgroundJob?.stamp,status:optimiseBackgroundStatus,preview:optimisePreviewCache?.preview}),replaceCache:preview=>optimisePreviewCache={stamp:preview.inputStamp,preview}};`}));
  await page.goto(`http://127.0.0.1:${server.address().port}/#/base`);await page.waitForFunction(()=>window.bgTest?.state.droids.length);
  const profile=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/worker-routing.json'),'utf8'));
  await page.evaluate(profile=>{const t=window.bgTest;Object.assign(t.state,t.validateBaseImport(profile));window.heartbeats=0;setInterval(()=>window.heartbeats++,20);t.save()},profile);
  await page.waitForFunction(()=>{const t=window.bgTest,p=t.read().preview;return p?.inputStamp===t.optimiseInputStamp()&&p.projected.planComplete},{},{timeout:65000});
  assert((await page.evaluate(()=>window.heartbeats))>5,'main thread remains responsive while planning');
  assert.equal(await page.evaluate(()=>location.hash),'#/base','planning works away from Optimise');
  await page.evaluate(()=>{location.hash='#/optimise'});await page.waitForSelector('#optimiseBackgroundStatus');
  const frozen=await page.evaluate(()=>{
    const t=window.bgTest,preview=t.backgroundOptimisePreview(),step=preview.steps.find(s=>s.type!=='note');
    if(!step)throw Error('fixture needs moves');
    const tick=t.optimiseStepKey(step);t.toggleTickedStep(tick);
    t.replaceCache({...preview,marker:'newer'});
    const held=t.backgroundOptimisePreview();t.toggleTickedStep(tick);
    return {held:held===preview,released:t.backgroundOptimisePreview().marker==='newer'};
  });assert(frozen.held&&frozen.released,'ticked instructions stay fixed until released');
  const stale=await page.evaluate(async()=>{
    const t=window.bgTest,old=t.backgroundOptimisePreview();
    t.state.owned[0].variant='GALACTIC';t.save();t.state.protocolPriority=t.state.protocolPriority==='credits'?'crafting':'credits';t.save();
    const before=JSON.stringify(t.state.owned);await t.applyOptimisedLayout(old);
    return before===JSON.stringify(t.state.owned);
  });assert(stale,'old result cannot be applied after a base change');
  await page.waitForFunction(()=>{const t=window.bgTest,p=t.read().preview;return p?.inputStamp===t.optimiseInputStamp()&&p.projected.planComplete},{},{timeout:65000});
  assert.deepEqual(errors,[]);
  console.log('PASS: real worker warms off-page, leaves UI responsive, refreshes after edits, rejects stale Apply and freezes ticked instructions.');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
