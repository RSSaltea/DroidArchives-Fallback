const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  let pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/')pathname='/index.html';
  if(pathname==='/data/patch-notes.json'){res.writeHead(200,{'Content-Type':'application/json'}).end('{"notes":[]}');return;}
  const file=path.resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(error,data)=>{
    if(error){res.writeHead(404).end();return;}
    if(pathname==='/app.js')data=Buffer.from(data.toString()+`\nwindow.archiveTest={state,archiveExperience,archiveOverview,archiveDroidUsefulness,createArchiveProfile,activeProfileDoc,activeProfile,profileDataFromState,blankProfileData,applyProfileData,save,route,placements,incomeForPlaced,rebirthProtectedKeys,setClient:value=>supabaseClient=value};`);
    res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data);
  });
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const executablePath=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(file=>fs.existsSync(file));
  const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
    await context.route('https://**/*',route=>route.abort());
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);await page.waitForFunction(()=>window.archiveTest?.state.droids.length>0);
    await page.waitForSelector('.archive-dashboard');
    assert.match(await page.locator('.archive-dashboard').innerText(),/Start with your base/);
    assert.equal(await page.locator('.discord-button').getAttribute('href'),'https://discord.gg/droidarchives');
    assert.equal(await page.locator('.archive-next-card').count(),4);
    await page.getByRole('button',{name:'Try a sample base'}).click();
    await page.locator('#setupNext').click();await page.locator('#setupNext').click();
    assert((await page.locator('.archive-setup-roster li').count())>=3);
    await page.locator('#setupCollect').check();await page.locator('#setupNext').click();
    await page.locator('#setupNext').click();await page.waitForURL('**/#/base');
    assert.equal(await page.evaluate(()=>window.archiveTest.activeProfileDoc().profiles.length),2);
    assert.equal(await page.evaluate(()=>window.archiveTest.activeProfile().name),'Sample base');
    assert((await page.evaluate(()=>window.archiveTest.state.droidex.length))>=3);
    // Save history records a prior value, survives a reload, and restores separately.
    await page.evaluate(()=>{const t=window.archiveTest;t.state.rebirth=4;t.state.optimiseFuseFirst=false;t.state.fusionAsLounge=true;t.state.showRegionalProduction=false;t.save();t.state.rebirth=5;t.state.optimiseFuseFirst=true;t.state.fusionAsLounge=false;t.state.showRegionalProduction=true;t.save();});
    await page.reload();await page.waitForFunction(()=>window.archiveTest?.state.droids.length>0);
    await page.evaluate(()=>window.archiveTest.archiveExperience.showHistory());
    await page.waitForSelector('.archive-history-row');
    const old=page.locator('.archive-history-row').filter({hasText:'Rebirth 4'}).first();
    await old.getByRole('button',{name:'Preview'}).click();
    await page.locator('#restoreHistory').click();
    assert.equal(await page.evaluate(()=>window.archiveTest.state.rebirth),4);
    assert.deepEqual(await page.evaluate(()=>{const s=window.archiveTest.state;return[s.optimiseFuseFirst,s.fusionAsLounge,s.showRegionalProduction]}),[false,true,false]);
    const profiles=await page.evaluate(()=>window.archiveTest.activeProfileDoc().profiles.map(p=>({name:p.name,rebirth:p.data.rebirth})));
    assert.equal(profiles.length,3);assert.equal(profiles.find(p=>p.name==='Sample base').rebirth,5);
    assert(profiles.some(p=>p.name==='Recovered · Sample base'&&p.rebirth===4));
    await page.reload();await page.waitForFunction(()=>window.archiveTest?.state.droids.length>0);
    assert.deepEqual(await page.evaluate(()=>{const s=window.archiveTest.state;return[s.optimiseFuseFirst,s.fusionAsLounge,s.showRegionalProduction]}),[false,true,false],'recovery must retain all planning settings on reload');
    // Validation failure cannot change the active profile or any existing saves.
    assert(await page.evaluate(()=>{const t=window.archiveTest,before=JSON.stringify([t.activeProfileDoc(),t.profileDataFromState()]);try{t.createArchiveProfile('Broken',{owned:[{name:'NOT A DROID',qty:1,variant:'DEFAULT'}]})}catch{}return before===JSON.stringify([t.activeProfileDoc(),t.profileDataFromState()]);}));
    // Snapshot contents are opt-in; private account/profile fields never travel.
    await page.evaluate(()=>window.archiveTest.archiveExperience.showShare());
    await page.locator('#shareTitle').fill('Saltea’s <img src=x onerror=alert(1)>');
    await page.locator('[data-share-field="income"]').uncheck();
    await page.locator('[data-share-field="missing"]').check();
    await page.locator('[data-share-field="layout"]').check();
    await page.locator('#copyProgressLink').click();
    const url=await page.locator('#shareLink').inputValue();
    const snapshot=await page.evaluate(async url=>{const m=await import('/archive-experience.js');return m.decodeSharedSnapshot(new URLSearchParams(new URL(url).hash.split('?')[1]).get('s'));},url);
    assert(!('income'in snapshot));assert(!('userId'in snapshot));assert(!('owned'in snapshot));assert(snapshot.layout.length>0);assert.equal(snapshot.title,'Saltea’s <img src=x onerror=alert(1)>');
    const downloadPromise=page.waitForEvent('download');await page.locator('#downloadProgress').click();const download=await downloadPromise;
    const png=fs.readFileSync(await download.path());assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
    const previewPng=await page.locator('#sharePreview canvas').evaluate(canvas=>canvas.toDataURL('image/png').split(',')[1]);
    assert(png.equals(Buffer.from(previewPng,'base64')),'download must match the current preview');
    const beforeShare=await page.evaluate(()=>JSON.stringify(window.archiveTest.profileDataFromState()));
    await page.locator('[data-archive-close]').click();
    await page.goto(base+'/'+new URL(url).hash);await page.waitForSelector('.archive-share-card');
    await page.waitForSelector('.archive-shared-art canvas');
    assert.equal(await page.locator('.archive-share-card img').count(),0);
    assert.equal(await page.evaluate(()=>JSON.stringify(window.archiveTest.profileDataFromState())),beforeShare);
    assert.match(await page.locator('.archive-share-card h2').innerText(),/onerror/);
    await page.goto(base+'/#/shared?s=broken');await page.waitForSelector('.archive-dashboard h1');assert.equal(await page.locator('.archive-dashboard h1').innerText(),'Snapshot unavailable');
    // Pure share validation bounds untrusted links and strips unknown fields.
    const validation=await page.evaluate(async()=>{
      const m=await import('/archive-experience.js');let rejected=0;
      for(const value of ['', 'a'.repeat(32001), btoa('{"version":2}')])try{m.decodeSharedSnapshot(value)}catch{rejected++}
      const s=m.validateSharedSnapshot({version:1,title:'Safe',createdAt:new Date().toISOString(),secret:'do not share'});
      return{rejected,keys:Object.keys(s)};
    });assert.equal(validation.rejected,3);assert.deepEqual(validation.keys,['version','title','createdAt']);
    // Usefulness is exact-card, uses the recorded layout and never mutates it.
    const usefulness=await page.evaluate(()=>{
      const t=window.archiveTest;t.applyProfileData(t.blankProfileData());t.state.rebirth=3;
      t.state.owned=[{name:'CB',variant:'DEFAULT',qty:1,preferred:'WORKER',preferredSlot:0,built:true}];
      const before=JSON.stringify(t.profileDataFromState());const hit=t.archiveDroidUsefulness('CB','GOLD');
      return{hit,unchanged:before===JSON.stringify(t.profileDataFromState()),invalid:t.archiveDroidUsefulness('CB','WRONG')};
    });assert(usefulness.unchanged);assert(usefulness.hit.ready);assert(usefulness.hit.incomeGain>0);assert(!usefulness.invalid.ready);
    const fusion=await page.evaluate(()=>{
      const t=window.archiveTest,recipe=t.state.fusion.recipes[0];t.state.owned=recipe.inputs.slice(0,2).map(name=>({name,variant:'DEFAULT',qty:1,built:true}));
      return{target:recipe.name,result:t.archiveDroidUsefulness(recipe.inputs[2],'DEFAULT')};
    });assert(fusion.result.fusion.includes(fusion.target));
    const quality=await page.evaluate(()=>{
      const t=window.archiveTest;t.state.rebirth=35;t.state.owned=[{name:'CB',variant:'GOLD',qty:2,built:true}];
      const available=t.archiveDroidUsefulness('CB','GOLD');
      t.state.owned[0].lockedSlot=true;const locked=t.archiveDroidUsefulness('CB','GOLD');
      return{available:available.qualityFusion,locked:locked.qualityFusion};
    });assert.equal(quality.available.variant,'DIAMOND');assert.equal(quality.locked,null);
    const protectedResult=await page.evaluate(()=>{
      const t=window.archiveTest;t.state.owned=t.placements().placed.map(x=>({...x,preferred:x.station,preferredSlot:x.slot,lockedSlot:true}));
      const before=JSON.stringify(t.profileDataFromState());const result=t.archiveDroidUsefulness('CB','GALACTIC');
      return{result,unchanged:before===JSON.stringify(t.profileDataFromState())};
    });assert(protectedResult.unchanged);
    const rebirth=await page.evaluate(()=>{
      const t=window.archiveTest;t.applyProfileData(t.blankProfileData());const req=t.state.rebirths[0][0].requiredDroids[0];
      const result=t.archiveDroidUsefulness(req.droidName,req.variant);
      t.state.owned=[{name:req.droidName,variant:req.variant,qty:1,built:true}];
      return{result,owned:t.archiveDroidUsefulness(req.droidName,req.variant)};
    });assert(rebirth.result.rebirths.includes(1));assert(!rebirth.owned.rebirths.includes(1));
    // Storage pressure in the optional checkpoint must never lose a primary save.
    const quota=await page.evaluate(()=>{
      const t=window.archiveTest,set=Storage.prototype.setItem;let attempts=0;
      Storage.prototype.setItem=function(key,value){if(key==='droid-archive-local-profiles'&&attempts++===0)throw new DOMException('full','QuotaExceededError');return set.call(this,key,value)};
      try{t.state.rebirth=6;t.save();return JSON.parse(localStorage.getItem('droid-archive-local-profiles')).profiles.find(p=>p.id===t.state.cloud.activeProfileId).data.rebirth;}finally{Storage.prototype.setItem=set;}
    });assert.equal(quota,6);
    // Cloud rows are filtered by account; recovery UI offers local history if unavailable.
    await page.evaluate(()=>{
      const t=window.archiveTest;t.state.cloud.user={id:'account-a'};
      t.setClient({from(table){window.historyQuery={table};return{select(fields){window.historyQuery.fields=fields;return this},eq(key,value){window.historyQuery.filter=[key,value];return this},order(){return this},limit(){return Promise.resolve({data:[{id:10,revision:7,archived_at:new Date().toISOString(),profiles:[{id:'old',name:'Cloud old',data:t.blankProfileData()}]}]})}}}});
      t.archiveExperience.showHistory();
    });await page.getByText('Cloud old',{exact:true}).waitFor();
    assert.deepEqual(await page.evaluate(()=>window.historyQuery.filter),['user_id','account-a']);
    assert.equal(await page.evaluate(()=>window.historyQuery.table),'droid_archive_profile_history');
    await page.getByText('Cloud old',{exact:true}).locator('..').locator('..').getByRole('button',{name:'Preview'}).click();
    await page.evaluate(()=>window.archiveTest.state.cloud.user={id:'account-b'});
    await page.locator('#restoreHistory').click();assert.match(await page.locator('#archiveError').innerText(),/account changed/i);
    await page.evaluate(()=>{window.archiveTest.setClient({from:()=>({select(){return this},eq(){return this},order(){return this},limit:()=>Promise.resolve({error:{message:'History table is unavailable'}})})});window.archiveTest.archiveExperience.showHistory();});
    await page.waitForFunction(()=>document.querySelector('#historyStatus')?.textContent.includes('History table is unavailable'));
    await page.evaluate(()=>{const t=window.archiveTest;t.state.cloud.user=null;t.setClient(null);t.state.rebirth=5;t.save();document.querySelector('#modalRoot').innerHTML='';location.hash='/';});
    await page.waitForSelector('.archive-dashboard');
    fs.mkdirSync(path.join(root,'research/archive-experience'),{recursive:true});
    await page.screenshot({path:path.join(root,'research/archive-experience/home-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile homepage should fit');
    await page.waitForFunction(()=>[...document.querySelectorAll('.spawn-timer strong')].every(el=>el.scrollWidth<=el.clientWidth+1));
    await page.evaluate(()=>document.querySelector('#toast').classList.remove('show'));
    await page.screenshot({path:path.join(root,'research/archive-experience/home-mobile.png'),fullPage:true});
    await page.getByRole('button',{name:'Guided setup',exact:true}).filter({visible:true}).first().click();
    await page.locator('#setupName').fill('My mobile base');await page.locator('#setupCycle').selectOption('1');await page.locator('#setupRebirth').fill('999');
    await page.locator('#setupNext').click();assert.equal(await page.locator('#setupName').count(),1,'invalid rebirth must not advance');
    await page.locator('#setupRebirth').fill('2');await page.locator('#setupNext').click();
    assert(await page.locator('.archive-modal').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    await page.screenshot({path:path.join(root,'research/archive-experience/setup-mobile.png')});
    await page.locator('[data-archive-close]').click();
    await page.evaluate(()=>window.archiveTest.archiveExperience.showShare());
    assert(await page.locator('.archive-modal').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    await page.screenshot({path:path.join(root,'research/archive-experience/share-mobile.png')});
    await page.locator('[data-archive-close]').click();
    await page.evaluate(()=>{localStorage.setItem('droid-archive-ui-style','legacy');document.documentElement.dataset.uiStyle='legacy';window.archiveTest.route();});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'legacy mobile should fit');
    assert.deepEqual(errors,[]);
    console.log('PASS: dashboard, guided/sample setup, persistent local recovery, cloud history/account isolation, share PNG/link/privacy/XSS, usefulness, and mobile layouts');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
