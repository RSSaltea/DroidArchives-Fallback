// NODE_PATH may point to an existing Playwright installation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'))}catch{({chromium}=require('playwright-core'))}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data)});
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://**/*',route=>route.abort());
    await page.route('**/data/patch-notes.json*',route=>route.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
    await page.route('**/app.js*',route=>route.fulfill({contentType:'text/javascript',body:source+'\nwindow.novaTest={state,save,route,blankProfileData,applyProfileData,baseExport,profileDataFromState,normalizeProfileDoc,validateBaseImport,normaliseNovaIconicUnlocks,novaIconicPurchaseOptions,placements,optimiseBase,optimisedPlacements,incomeForPlaced,stationSlotIndices,autoPurchaseEligibleSlots,showTransferModal,showSuperRebirthConfirm};'}));
    const url=`http://127.0.0.1:${server.address().port}`;
    await page.goto(url+'/#/nova-shop');
    await page.waitForFunction(()=>window.novaTest?.state.droids.length);
    await page.locator('[data-nova-category="iconic"]').click();
    await page.locator('[data-nova-select="iconic-dj-r-3x"]').click();
    await page.locator('#novaIconicUnlocked').check();
    assert.equal(await page.evaluate(()=>window.novaTest.state.owned.length),0,'unlocking does not add a copy');
    await page.reload();await page.waitForFunction(()=>window.novaTest?.state.droids.length);
    assert(await page.locator('#novaIconicUnlocked').isChecked(),'unlock survives reload');
    assert.match(await page.locator('[data-nova-select="iconic-dj-r-3x"]').innerText(),/Unlocked/);
    const persistence=await page.evaluate(()=>{
      const t=window.novaTest,exported=t.baseExport(),profile=t.profileDataFromState();
      const normalized=t.normalizeProfileDoc({profiles:[{id:'one',data:profile},{id:'two',data:t.blankProfileData()}]});
      t.applyProfileData(normalized.profiles[1].data);const blank=t.state.novaIconicUnlocks;
      t.applyProfileData(normalized.profiles[0].data);const restored=t.state.novaIconicUnlocks;
      const validated=t.validateBaseImport(exported).novaIconicUnlocks;
      const legacy=t.validateBaseImport({owned:[]}).novaIconicUnlocks;
      const invalid=t.normaliseNovaIconicUnlocks(['DJ R-3X','DJ R-3X','MOUSE',null,'bad']);
      return {exported:exported.base.novaIconicUnlocks,profile:profile.novaIconicUnlocks,blank,restored,validated,legacy,invalid};
    });
    for(const key of ['exported','profile','restored','validated','invalid'])assert.deepEqual(persistence[key],['DJ R-3X'],key);
    assert.deepEqual(persistence.blank,[]);assert.deepEqual(persistence.legacy,[]);
    console.log('PASS: checkbox, reload, profile switching/cloud document and export validation');
    const outcomes=await page.evaluate(()=>{
      const t=window.novaTest,s=t.state;
      const reset=()=>{t.applyProfileData(t.blankProfileData());s.rebirth=2;s.autoPurchaseSlots=true;s.optimiseKeepDroidex=false;t.autoPurchaseEligibleSlots();};
      const evaluate=()=>{const before=JSON.stringify(s),ref=s.owned,p=t.placements(),projected=t.optimisedPlacements(p,t.optimiseBase(p,t.incomeForPlaced(p.placed))),options=t.novaIconicPurchaseOptions(p,projected);if(JSON.stringify(s)!==before||ref!==s.owned)throw Error('Recommendation mutated profile');return options;};
      reset();s.novaIconicUnlocks=['DJ R-3X'];const empty=evaluate();
      const strong=s.droids.filter(d=>d.type==='BATTLE'&&d.rarity!=='ICONIC').sort((a,b)=>b.variants.DEFAULT.income-a.variants.DEFAULT.income)[0];
      // Give the worker station a weak incumbent, with a strong regular earner elsewhere.
      const fill=()=>{s.owned=['WORKER','ASTROMECH','BATTLE'].flatMap(station=>t.stationSlotIndices(station).map(slot=>({name:station==='WORKER'?'MOUSE':strong.name,variant:'DEFAULT',qty:1,preferred:station,preferredSlot:slot})));};
      fill();const profitable=evaluate();
      s.novaIconicUnlocks=['DJ R-3X','MISTER BONES'];const alternatives=evaluate();
      const reversed=(s.novaIconicUnlocks.reverse(),evaluate());
      s.owned.push({name:'DJ R-3X',variant:'DEFAULT',qty:1,preferred:'BUILD',built:false});const alreadyOwned=evaluate();
      reset();fill();s.novaIconicUnlocks=['DJ R-3X'];s.owned.forEach(row=>row.lockedSlot=true);const locked=evaluate();
      reset();s.novaIconicUnlocks=['C-3PO'];s.owned=[{name:strong.name,variant:'DEFAULT',qty:1,preferred:'WORKER',preferredSlot:0,lockedSlot:true}];const protocol=evaluate();
      reset();fill();s.novaIconicUnlocks=[];const notUnlocked=evaluate();
      // Every replaceable worker is strong; the other stations are locked.
      s.novaIconicUnlocks=['DJ R-3X'];s.owned.forEach(row=>{row.name=row.preferred==='WORKER'?strong.name:'MOUSE';row.lockedSlot=row.preferred!=='WORKER';});const unprofitable=evaluate();
      reset();fill();s.novaIconicUnlocks=['DJ R-3X','MISTER BONES','C-3PO'];t.save();
      return {empty,profitable,alternatives,reversed,alreadyOwned,locked,protocol,notUnlocked,unprofitable};
    });
    assert.equal(outcomes.empty[0].gain,0,'no regular income to boost');
    assert(outcomes.profitable[0].gain>0,'replacing a weak earner improves income');
    assert.deepEqual(outcomes.alternatives,outcomes.reversed,'recommendations are independent and deterministically ranked');
    assert(!outcomes.alreadyOwned.some(x=>x.name==='DJ R-3X'),'do not rebuy owned/building iconic');
    assert.equal(outcomes.locked[0].gain,0,'locked earners cannot be displaced');
    assert(outcomes.protocol[0].gain>0);assert.equal(outcomes.protocol[0].destination.station,'PROTOCOL_WORKER_CREDITS');
    assert.deepEqual(outcomes.notUnlocked,[]);assert.equal(outcomes.unprofitable[0].gain,0);
    console.log('PASS: income gains, replacement opportunity cost, empty/locked bases, owned copies, Protocol bonuses, independent alternatives and unchanged state');
    await page.goto(url+'/#/optimise');await page.locator('.nova-iconic-purchases').waitFor();
    assert.match(await page.locator('.nova-iconic-purchases').innerText(),/Buy for credit gain/);
    const images=fs.mkdtempSync(path.join(os.tmpdir(),'nova-iconics-'));
    await page.locator('.nova-iconic-purchases').screenshot({path:path.join(images,'optimise-desktop.png')});
    await page.locator('[data-manage-iconic-unlocks]').click();await page.locator('#novaIconicUnlocked').waitFor();
    await page.locator('[data-nova-select="iconic-dj-r-3x"]').click();
    await page.locator('.nova-command').screenshot({path:path.join(images,'shop-desktop.png')});
    await page.setViewportSize({width:390,height:844});
    await page.locator('.nova-detail-panel').screenshot({path:path.join(images,'shop-mobile.png')});
    await page.goto(url+'/#/optimise');await page.locator('.nova-iconic-purchases').waitFor();
    await page.locator('.nova-iconic-purchases').screenshot({path:path.join(images,'optimise-mobile.png')});
    assert(await page.locator('.nova-iconic-purchases').evaluate(el=>el.scrollWidth<=el.clientWidth),'purchase panel fits mobile');
    // Import through the real modal, rather than only calling validation.
    await page.evaluate(()=>window.novaTest.showTransferModal(()=>{}));
    await page.locator('#transferJson').fill(JSON.stringify({base:{owned:[],novaIconicUnlocks:['R2-D2']}}));
    await page.locator('#importSave').click();
    assert.deepEqual(await page.evaluate(()=>window.novaTest.state.novaIconicUnlocks),['R2-D2']);
    await page.evaluate(()=>window.novaTest.showSuperRebirthConfirm(()=>{},true));await page.locator('#confirmSuperRebirth').click();
    assert.deepEqual(await page.evaluate(()=>window.novaTest.state.novaIconicUnlocks),['R2-D2'],'permanent unlock survives super rebirth');
    await page.goto(url+'/#/nova-shop');await page.locator('[data-nova-select="iconic-r2-d2"]').click();await page.locator('#novaIconicUnlocked').uncheck();
    await page.reload();await page.waitForFunction(()=>window.novaTest?.state.droids.length);assert(!(await page.locator('#novaIconicUnlocked').isChecked()));
    assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile rendering, import modal, super rebirth and unchecking');console.log('Screenshots: '+images);
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
