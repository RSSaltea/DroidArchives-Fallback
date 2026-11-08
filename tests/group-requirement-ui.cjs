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
 await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.t={groupRequirementTradeModel,tradeValue,tradeDifference,tradeMoney,state,groupRequirementOwners,groupRequirementHtml,refreshGroupRequirementCards,neededCardHtml};'}));
 await page.addInitScript(notes=>localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(notes)),JSON.parse(fs.readFileSync(path.join(root,'data/patch-notes.json'))).notes.map(n=>n.id));
 const url=`http://127.0.0.1:${server.address().port}`;
 await page.goto(url);await page.waitForFunction(()=>window.t?.state.droids.length);


 const result=await page.evaluate(()=>{
  const {state}=t;state.cloud.user={id:'self'};state.cloud.doc={profiles:[]};state.groups.loaded=true;
  const make=(id,name,rebirth,variant)=>({ownerId:id,ownerName:name,profileId:'base',profileName:'Main Base',data:{rebirth,cycle:0,owned:[{name:'TRI-TEK',variant,qty:1,built:true}]}});
  const first=make('one','Alex <test>',26,'RAINBOW'),second=make('two','Sam',30,'GOLD');
  state.groups.workspace=[{id:'g1',name:'Team',profiles:[first,second,make('self','You',1,'STELLAR')]},{id:'g2',name:'Other',profiles:[first]}];
  state.rebirths[0]=[{to:27,requiredDroids:[{droidName:'TRI-TEK',variant:'RAINBOW'}]},{to:29,requiredDroids:[{droidName:'TRI-TEK',variant:'BESKAR'}]}];
  window.req={droidName:'TRI-TEK',variant:'RAINBOW'};
  const owners=t.groupRequirementOwners(req);
  document.querySelector('#app').innerHTML='<h1>Rebirth requirements</h1><div class="needed-grid">'+t.neededCardHtml(req,{rebirth:27})+'</div>';
  return owners;
 });
 assert.equal(result.length,2,'same shared profile appears once; own account excluded');
 assert.deepEqual(result[0].needed,[27,29]);assert.equal(result[0].current,26);assert.equal(result[0].ready,true);
 assert.deepEqual(result[1].needed,[]);assert.equal(result[1].ready,false);
 assert.equal(await page.locator('.needed-group-owner').count(),2);
 assert((await page.locator('.needed-group-info').innerText()).includes('Alex <test>'));
 assert.equal(await page.locator('.needed-group-info test').count(),0);
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});
  assert(await page.locator('.needed-card').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await page.screenshot({path:'research/group-requirement-'+width+'.png',fullPage:true});
 }

 await page.evaluate(()=>{
  t.state.rebirth=26;t.state.cycle=0;
  t.state.owned=[
   {name:'TRI-TEK',variant:'STELLAR',qty:1,built:true,preferred:'LOUNGE',preferredSlot:0},
   {name:'TRI-TEK',variant:'RAINBOW',qty:2,built:true,preferred:'LOUNGE',preferredSlot:1},
   {name:'GONK',variant:'GOLD',qty:1,built:true,preferred:'LOUNGE',preferredSlot:3},
   {name:'PIT',variant:'GOLD',qty:1,built:true,tradedOnce:true},
   {name:'R7',variant:'GOLD',qty:1,built:true,lockedSlot:true},
   {name:'CHOPPER',variant:'DEFAULT',qty:1,built:true}
  ];
 });
 const options=await page.evaluate(()=>{
  const m=t.groupRequirementTradeModel(req,'one:base');
  return {offers:m.offers,targets:m.targets};
 });
 assert.equal(options.offers.filter(u=>u.name==='TRI-TEK').length,2,'spare duplicates retained');
 assert(!options.offers.some(u=>u.variant==='STELLAR'),'highest future rebirth copy protected');
 assert(!options.offers.some(u=>['PIT','R7','CHOPPER'].includes(u.name)));
 assert(options.targets[0].rebirthReserved,'member reservation retained');
 await page.locator('[data-group-trade-options]').first().click();
 assert.equal(await page.locator('.group-trade-option').count(),3);
 assert((await page.locator('[data-group-trade-warning]').innerText()).includes('needs to keep this copy'));
 assert((await page.locator('.group-trade-option-list').innerText()).includes('You pay'));
 assert((await page.locator('.group-trade-option-list').innerText()).includes('They pay'));

 const expected=await page.evaluate(()=>{
  const m=t.groupRequirementTradeModel(req,'one:base'),target=m.targets[0];
  return m.offers.map(u=>{const c=t.tradeDifference(t.tradeValue(m.catalogue.get(u.name),u.variant),t.tradeValue(m.catalogue.get(target.name),target.variant));return [t.tradeMoney(c.you),t.tradeMoney(c.other)]});
 });
 const text=await page.locator('[data-group-trade-results]').innerText();
 for(const costs of expected)for(const cost of costs)assert(text.includes(cost),'both sides use canonical trade costs');
 await page.locator('[data-group-trade-sort]').selectOption('chips');
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});
  assert(await page.locator('.group-trade-options').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await page.screenshot({path:'research/group-trade-options-'+width+'.png',fullPage:true});
 }
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('.group-trade-options').count(),0);
 await page.evaluate(()=>{t.state.owned=t.state.owned.slice(0,1)});
 await page.locator('[data-group-trade-options]').first().click();
 assert((await page.locator('[data-group-trade-results]').innerText()).includes('No eligible spare copies'));
 await page.keyboard.press('Escape');
 await page.evaluate(()=>{t.state.groups.workspace[0].profiles[0].data.owned[0].tradedOnce=true});
 await page.locator('[data-group-trade-options]').first().click();
 assert((await page.locator('.group-trade-options').innerText()).includes('No tradeable copies'));
 await page.keyboard.press('Escape');

 await page.evaluate(()=>{t.state.groups.workspace[0].profiles[0].data.rebirth=29;t.refreshGroupRequirementCards()});
 assert((await page.locator('.needed-group-owner').first().innerText()).includes('Rebirth 29'));
 assert((await page.locator('.needed-group-owner').first().innerText()).includes('Not needed for remaining rebirths'));
 await page.evaluate(()=>{t.state.groups.workspace=[];t.refreshGroupRequirementCards()});
 assert.equal(await page.locator('.needed-group-owner').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: group ownership, future requirements, deduplication, safe text, refresh and responsive cards');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
