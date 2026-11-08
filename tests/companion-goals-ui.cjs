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
 await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.t={stationSlotIndices,SLOT_RULES,setScrapStation:()=>{scrapStationLevel=10},state,blankProfileData,applyProfileData,basePageV2,showFusionKeepSettings,keepForFusion,prepareScourgeSubmissions,placements,stepHtml,mountBaseProtocolTraits,detailPage};'}));
 await page.addInitScript(notes=>localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(notes)),JSON.parse(fs.readFileSync(path.join(root,'data/patch-notes.json'))).notes.map(n=>n.id));
 const url=`http://127.0.0.1:${server.address().port}`;
 await page.goto(url);await page.waitForFunction(()=>window.t?.state.droids.length);



 for(const style of ['next','modern']){
  await page.evaluate(style=>localStorage.setItem('droid-archive-ui-style',style),style);
  await page.goto(url+'/'+(style==='next'?'index.html':'classic.html')+'#/base');await page.waitForFunction(()=>window.t?.state.droids.length);
  await page.evaluate(style=>{
   document.documentElement.dataset.uiStyle=style;t.applyProfileData(t.blankProfileData());
   t.state.rebirth=21;t.state.superRebirthGoal=30;t.state.cycle=0;
   t.state.rebirths[0]=[{to:22,creditsCost:0,requiredDroids:[{droidName:'LNG-SHOT',variant:'BESKAR'},{droidName:'B2-RP',variant:'BESKAR'},{droidName:'CYCLO-GRAV',variant:'BESKAR'}]}];
   t.basePageV2();
  },style);
  assert(await page.locator('#neededSearch').isVisible(),style+' search visible');
  await page.locator('#neededSearch').fill('ln');
  assert.deepEqual(await page.locator('#neededGroups .needed-card:visible').evaluateAll(es=>es.map(e=>e.dataset.neededName)),['lng-shot']);
  await page.locator('#neededSearch').press('Escape');assert.equal(await page.locator('#neededSearch').inputValue(),'');assert(await page.locator('#neededSearch').evaluate(e=>e===document.activeElement));
  await page.locator('#neededSearch').fill('upgrade');assert.equal(await page.locator('#neededGroups .needed-card:visible').count(),0);
  await page.locator('#clearNeededSearch').click();assert.equal(await page.locator('#neededGroups .needed-card:visible').count(),3);
  await page.evaluate(()=>{t.state.rebirth=20;t.basePageV2()});await page.waitForTimeout(100);
  assert.equal(await page.locator('#neededSearch').inputValue(),'','cleared search stays cleared after rebirth redraw');
  await page.locator('#neededSearch').fill('ln');
  await page.evaluate(()=>{location.hash='#/base'});await page.waitForTimeout(200);
  assert.equal(await page.locator('#neededSearch').inputValue(),'','removing URL filter clears saved search');
  await page.evaluate(()=>{t.state.rebirth=21;t.basePageV2()});await page.waitForTimeout(100);
  assert.equal(await page.locator('#neededSearch').inputValue(),'');

  for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.locator('#neededSearch').scrollIntoViewIfNeeded();await page.screenshot({path:'research/needed-search-'+style+'-'+width+'.png'})}
  await page.evaluate(()=>t.showFusionKeepSettings());
  await page.locator('#fusionKeepVariant').selectOption({label:'SCOURGE'});
  await page.locator('#fusionKeepRarity').selectOption('EPIC');await page.locator('#addFusionKeepRule').click();
  assert(await page.evaluate(()=>t.keepForFusion({name:t.state.droids.find(d=>d.rarity==='EPIC').name,variant:'SCOURGE'})));
  await page.evaluate(()=>document.querySelector('#modalRoot').innerHTML='');
 }
 await page.evaluate(()=>localStorage.setItem('droid-archive-ui-style','next'));
 await page.goto(url+'/index.html#/droid/r7');await page.waitForFunction(()=>window.t?.state.droids.length);await page.waitForSelector('[data-protocol-traits] .companion-trait-toggle');assert(await page.locator('[data-protocol-traits] .companion-trait-comparison').isHidden());await page.locator('[data-protocol-traits] .companion-trait-toggle button').click();
 await page.evaluate(()=>{
  document.querySelector('#app').innerHTML='<div id="comparison"></div>';
  t.state.multiplier=100;t.state.novaUpgrades={'scrap-value':1};
  t.mountBaseProtocolTraits(document.querySelector('#comparison'),t.state.droids.find(d=>d.name==='R7'),'STELLAR');
 });
 await page.locator('[data-trait-compare-goal]').selectOption('pickaxe');
 assert((await page.locator('#comparison').innerText()).includes('Overclocked'));
 assert.equal(await page.locator('[data-companion-tier]').count(),0,'tiers are compared together');
 const ranking=await page.locator('.companion-trait-result').evaluateAll(cards=>cards.map(c=>({name:(c.querySelector('th small')?c.querySelector('th small').textContent+' '+c.querySelector('th span span').childNodes[0].textContent.trim():'No trait'),value:Number(c.querySelector('td').textContent.replaceAll(',',''))})));
 assert(ranking.some(r=>r.name==='Diamond Critical Amount'));assert(ranking.some(r=>r.name==='Rainbow Pickaxe Level'));
 assert(ranking.every((r,i)=>!i||ranking[i-1].value>=r.value),'all tiers ordered by calculated gain');

 assert(!(await page.locator('.companion-trait-results').innerText()).includes('Fusion Expert'));
 const before=await page.locator('.companion-trait-results').innerText();
 await page.locator('[data-companion-fusion]').check();assert((await page.locator('.companion-trait-results').innerText()).includes('Fusion Expert'));
 const values=await page.locator('.companion-trait-result').evaluateAll(cards=>Object.fromEntries(cards.map(c=>[(c.querySelector('th small')?c.querySelector('th small').textContent+' '+c.querySelector('th span span').childNodes[0].textContent.trim():'No trait'),Number(c.querySelector('td').textContent.replaceAll(',',''))])));
 assert(Math.abs(values['Rainbow Fusion Expert']-values['No trait']*2)<0.01,'Rainbow Fusion Expert doubles fusion swing value with no other fusion traits');

 for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});assert(await page.locator('#comparison').evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.screenshot({path:'research/companion-goals-'+width+'.png',fullPage:true})}
 await page.locator('[data-companion-fusion]').uncheck();assert.equal(await page.locator('.companion-trait-results').innerText(),before);
 await page.evaluate(()=>t.mountBaseProtocolTraits(document.querySelector('#comparison'),t.state.droids.find(d=>d.name==='CHOPPER'),'DEFAULT'));
 assert.equal(await page.locator('[data-trait-compare-goal]').inputValue(),'pickaxe','goal persists across droids');assert(!(await page.locator('.companion-trait-results').innerText()).includes('Overclocked'));
 assert((await page.locator('.companion-trait-results').innerText()).includes('Critical Chance'));
 await page.evaluate(()=>t.mountBaseProtocolTraits(document.querySelector('#comparison'),t.state.droids.find(d=>d.name==='GONK'),'GOLD'));
 assert.equal(await page.locator('[data-trait-compare-goal]').inputValue(),'pickaxe','goal persists across droids');assert(!(await page.locator('.companion-trait-results').innerText()).includes('Overclocked'));
 for(const goal of ['credits','scrap','crafting','health','chips']){await page.locator('[data-trait-compare-goal]').selectOption(goal);assert(!(await page.locator('.companion-trait-results').innerText()).includes('Fusion Expert'))}
 await page.evaluate(()=>{t.state.multiplier=100;t.setScrapStation()});
 await page.locator('[data-trait-compare-goal]').selectOption('scrap');
 assert((await page.locator('.companion-trait-result.is-best').innerText()).includes('Scrap Specialist'));
 assert(!(await page.locator('.companion-trait-results').innerText()).includes('Progress / swing'));
 assert(!(await page.locator('.companion-trait-results').innerText()).includes('Pickaxe Level'));

 await page.evaluate(()=>{
  localStorage.setItem('droid-archive-map-hidden','0');
  t.state.owned=[{name:'R7',variant:'STELLAR',qty:1,built:true,preferred:'COMPANION',preferredSlot:0}];t.basePageV2();
 });
 await page.locator('.tm-slot[data-slot="COMPANION:0"]').dispatchEvent('click');
 assert.equal(await page.locator('.tm-inspector .companion-trait-comparison').count(),0);assert(await page.locator('.tm-inspector .companion-trait-toggle button').isVisible());
 assert(await page.locator('.tm-trait-panel .companion-trait-comparison').isVisible());
 await page.locator('.tm-trait-panel [data-trait-compare-goal]').selectOption('pickaxe');
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});
  const panel=page.locator('.tm-trait-panel');await panel.scrollIntoViewIfNeeded();
  assert(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  assert(await panel.evaluate(e=>e.getBoundingClientRect().top>=e.parentElement.querySelector('.tm-layout').getBoundingClientRect().bottom-1));
  assert(await panel.locator('tbody img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth>0)),'trait icons load');
  await page.screenshot({path:'research/map-trait-ranking-'+width+'.png'});
 }
 for(const action of ['work','lounge','fusion'])assert(await page.locator(`[data-action="${action}"]`).isEnabled(),action+' has a free destination');
 assert(await page.locator('[data-action="companion"]').isDisabled());
 await page.evaluate(()=>{
  for(const station of Object.keys(t.SLOT_RULES).filter(s=>!['COMPANION','BUILD','FUSION_BUILD','BLUEPRINT_STORAGE'].includes(s)))
   for(const slot of t.stationSlotIndices(station))t.state.owned.push({name:station.startsWith('PROTOCOL')?'TDA':'R7',variant:'STELLAR',qty:1,built:true,preferred:station,preferredSlot:slot});
  t.basePageV2();
 });
 await page.locator('.tm-slot[data-slot="COMPANION:0"]').dispatchEvent('click');
 for(const action of ['work','lounge','fusion','companion'])assert(await page.locator(`[data-action="${action}"]`).isDisabled(),action+' disabled without a free destination');
 await page.locator('#tmFloor').selectOption('ground');assert(await page.locator('.tm-trait-panel').isHidden());
 await page.goto(url+'/index.html#/droid/r7');await page.reload();
 await page.waitForSelector('[data-trait-compare-goal]');
 assert.equal(await page.locator('[data-trait-compare-goal]').inputValue(),'pickaxe');
 await page.locator('[data-companion-fusion]').check();
 await page.reload();await page.waitForSelector('[data-trait-compare-goal]');
 assert.equal(await page.locator('[data-trait-compare-goal]').inputValue(),'pickaxe','goal persists after reload');
 assert(await page.locator('[data-companion-fusion]').isChecked(),'fusion setting persists after reload');
 await page.locator('.companion-trait-toggle button').click();assert(await page.locator('.companion-trait-comparison').isHidden());await page.reload();await page.waitForSelector('.companion-trait-toggle button');assert(await page.locator('.companion-trait-comparison').isHidden());assert.deepEqual(errors,[]);console.log('PASS: search names/clear/Escape in all layouts, Scourge rule, all-droid companion goals and fusion gating');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
