const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(__dirname,'../research/tools/ui-test/node_modules/playwright')));}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.writeHead(200,{'Content-Type':({'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream'});res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const shell of ['index.html','classic.html']){const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));if(process.env.LEGACY==='1')await context.addInitScript(()=>localStorage.setItem('droid-archive-ui-style','legacy'));await context.addInitScript(ids=>localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(ids)),JSON.parse(fs.readFileSync(path.join(root,'data/patch-notes.json'),'utf8')).notes.map(n=>n.id));await context.addInitScript(()=>{const OriginalDate=Date;globalThis.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-09-26T21:00:00Z']))}static now(){return new OriginalDate('2026-09-26T21:00:00Z').getTime()}};});await page.route('https://**/*',r=>r.abort());await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.kyberTest={state,variantRank,nextVariant,chipsToVariant,upgradeChipRate,chipSellValue,applyProfileData,validateBaseImport,baseExport,incomeForPlaced,placements,optimiseBase,optimisedPlacements,blankProfileData,recordDroidex,recordDroidexUpgrade,droidexEntry,showCardVariantModal,changeOwnedUnitVariant,fusionOutcome,route,save,hasRequirement,requirementStatus,rebirthTrackerStatus,profileRequirementReady,kyberActivationCost,profileRequirementAction,nextRebirthHoldBacks,chipSellCalculatorHtml};'}));
await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/kyber`);await page.waitForFunction(()=>window.kyberTest?.state.droids.length>0);await page.evaluate(()=>document.querySelector('#patchNotesClose')?.click());

for(const name of ['2bb','r3','eg-58','egl','kt','mph','jo9-4mn','plnk','ecg']){
 await page.evaluate(name=>{location.hash='#/droid/'+name},name);
 for(const variant of ['KYBER','KYBER_GREEN','KYBER_BLUE','KYBER_PURPLE','SCOURGE','DEFAULT',...(!['2bb','r3'].includes(name)?['GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR']:[])]){
  await page.locator(`[data-v="${variant}"]`).click();
  const portrait=page.locator('.info-image img');
  assert.match(await portrait.getAttribute('src'),new RegExp('/rendered-v3/.*_'+variant+'\\.png'));
  await portrait.evaluate(img=>img.decode());
  assert.equal(await portrait.evaluate(img=>img.naturalWidth),512);
  assert.equal(await portrait.evaluate(img=>getComputedStyle(img).filter),'none');
 }
}
assert.deepEqual(errors,[]);await context.close();}
console.log('Dedicated Kyber, Scourge and Gonk Army portraits load without colour filters in both shells');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
