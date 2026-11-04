const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')));}
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();if(file.endsWith('app.js'))data=Buffer.from(data.toString()+'\nwindow.t={state,save,route,placements,blankProfileData,autoPurchaseEligibleSlots,validateBaseImport,baseExport,optimisedRows,optimisedPlacementsPass,normaliseProjectedForSteps,optimiseInputStamp,applyOptimisedLayout,read:()=>optimisePreviewCache?.preview};');res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const [shell,style] of [['index.html','next'],['classic.html','modern'],['classic.html','legacy']]){
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route('https://**/*',r=>r.abort());
 await context.addInitScript(style=>{localStorage.setItem('droid-archives-site-help-v1',JSON.stringify({invited:true}));localStorage.setItem('droid-archive-ui-style',style);localStorage.setItem('droid-archive-map-hidden','0');},style);
 await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
 await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/base`);await page.waitForFunction(()=>window.t?.state.droids.length);
 await page.evaluate(()=>{Object.assign(t.state,t.blankProfileData(),{rebirth:40,multiplier:24,optimiseFuseFirst:false,optimiseIncludeIconics:false,optimiseKeepDroidex:false,companionGoals:[],owned:[{name:'TRI-TEK',variant:'DEFAULT',qty:12,preferred:'LOUNGE',preferredSlot:0}]});t.autoPurchaseEligibleSlots();t.save();t.route();});
 await page.locator('.tm-canvas [data-slot="LOUNGE:0"]').click();
 const keep=page.locator('.tm-inspector [data-action="noSell"]');await keep.click();
 assert.equal(await keep.getAttribute('aria-pressed'),'true');
 assert.match(await page.locator('.tm-inspector [data-action="lock"]').innerText(),/Lock for Optimise/i);
 const checks=await page.evaluate(()=>{
  const p=t.placements(),kept=p.placed.find(u=>u.noSell),key=u=>`${u.source}:${u.unit}`;
  const projected=t.optimisedPlacementsPass(p,{assignments:[]});
  const normalized=t.normaliseProjectedForSteps(p,projected);
  const imported=t.validateBaseImport(t.baseExport());
  return {protected:t.state.owned.filter(u=>u.noSell).length,individual:t.state.owned.every(u=>u.qty===1),imported:imported.owned.filter(u=>u.noSell).length,serialized:t.optimisedRows(p.placed,p.overflow).filter(u=>u.noSell).length,sales:projected.sell.length,safe:!normalized.sell.some(u=>key(u)===key(kept)),retained:normalized.placed.some(u=>u.noSell&&!u.lockedSlot)};
 });
 assert.equal(checks.protected,1);assert(checks.individual);assert.equal(checks.imported,1);assert.equal(checks.serialized,1);assert(checks.sales>0);assert(checks.safe&&checks.retained);
 await page.reload();await page.waitForFunction(()=>window.t?.state.droids.length);
 assert.equal(await page.evaluate(()=>t.state.owned.filter(u=>u.noSell).length),1);
 await page.locator('.tm-canvas [data-slot="LOUNGE:0"]').click();
 await page.locator('.tm-inspector [data-action="work"]').click();
 assert.equal(await page.evaluate(()=>t.placements().placed.find(u=>u.noSell)?.station),'ASTROMECH');
 await page.locator('#toggleBaseMap').click();
 const protectedControl=page.locator('.slot-no-sell[aria-pressed="true"]');assert(await protectedControl.isVisible());
 await protectedControl.click();assert.equal(await page.evaluate(()=>t.state.owned.filter(u=>u.noSell).length),0);
 await page.locator('.slot-no-sell').first().click();assert.equal(await page.evaluate(()=>t.state.owned.filter(u=>u.noSell).length),1);
 await page.waitForFunction(()=>{const p=t.read();return p?.inputStamp===t.optimiseInputStamp()&&p.projected.planComplete},{},{timeout:60000});
 const applied=await page.evaluate(async()=>{const p=t.read(),kept=p.baseP.placed.find(u=>u.noSell);const data={sale:p.steps.some(s=>s.type==='sell'&&s.unit.source===kept.source&&s.unit.unit===kept.unit)};await t.applyOptimisedLayout(p);data.retained=t.state.owned.filter(u=>u.noSell).length;return data;});
 assert(!applied.sale);assert.equal(applied.retained,1);
 await page.setViewportSize({width:390,height:900});assert(await page.locator('.slot-no-sell[aria-pressed="true"]').isVisible());
 await page.locator('.slot-no-sell[aria-pressed="true"]').locator('xpath=..').screenshot({path:path.join(root,`research/sale-protection-${style}.png`)});
 assert.deepEqual(errors,[]);await context.close();console.log('PASS sale protection: per copy, map/card toggles, reload, import, manual move, allocator, real worker and Apply:',style);
}}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
