const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('../tools/node_modules/playwright');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  for(const shell of ['index.html','classic.html']){
   const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://**/*',r=>r.abort());
   await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.bpTest={state,applyProfileData,blankProfileData,autoPurchaseEligibleSlots,route,save};'}));
   await page.addInitScript(notes=>localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(notes)),JSON.parse(fs.readFileSync(path.join(root,'data/patch-notes.json'))).notes.map(n=>n.id));
   await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/blueprint-calc`);
   await page.waitForFunction(()=>window.bpTest?.state.droids.length);
   await page.evaluate(()=>{
    const t=bpTest;t.applyProfileData(t.blankProfileData());t.state.rebirth=40;t.autoPurchaseEligibleSlots();
    t.state.owned=[{name:'CYCLENS',variant:'DEFAULT',qty:1,built:true,preferred:'ASTROMECH',preferredSlot:0},{name:'R2',variant:'GOLD',qty:1,built:true,preferred:'LOUNGE',preferredSlot:0}];
    t.save();t.route();window.beforeBlueprint=JSON.stringify(t.state.owned);
   });
   await page.locator('[data-blueprint-plan="both"]').click();
   await page.waitForFunction(()=>document.querySelector('.blueprint-plan h2')?.textContent.includes('reach Epic'));
   assert.match(await page.locator('.blueprint-plan').innerText(),/CYCLENS/);
   assert.match(await page.locator('.blueprint-plan').innerText(),/R2/);
   assert.equal(await page.evaluate(()=>JSON.stringify(bpTest.state.owned)===beforeBlueprint),true);
   await page.locator('[data-blueprint-target="mission"]').selectOption('RARE');
   assert.equal(await page.locator('[data-blueprint-plan="both"]').isDisabled(),true);
   assert.match(await page.locator('.blueprint-combined').innerText(),/same target/);
   await page.locator('[data-blueprint-target="mission"]').selectOption('EPIC');
   await page.locator('[data-blueprint-target="scrap"]').selectOption('MYTHIC');
   await page.locator('[data-blueprint-plan="scrap"]').click();
   await page.waitForFunction(()=>document.querySelector('.blueprint-plan')?.textContent.includes('cap at Legendary'));
   await page.locator('[data-blueprint-target="scrap"]').selectOption('EPIC');
   for(const r of ['COMMON','RARE','EPIC','LEGENDARY','MYTHIC'])await page.locator(`[data-blueprint-count="${r}"]`).fill('0');
   await page.locator('[data-blueprint-count="EPIC"]').fill('1');
   await page.locator('[data-blueprint-count="RARE"]').fill('1');
   assert.match(await page.locator('[data-blueprint-count-result]').innerText(),/average 1.5 → Epic.*Scrap target: met.*Mission target: met/);
   await page.locator('[data-blueprint-plan="both"]').click();
   await page.waitForSelector('.blueprint-plan');
   for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:900});
    const spacing=await page.locator('.blueprint-calculator').evaluate(el=>{
     const outer=el.getBoundingClientRect(),first=el.querySelector('.breadcrumbs').getBoundingClientRect();
     return {left:first.left-outer.left,top:first.top-outer.top,overflow:el.scrollWidth>el.clientWidth+1};
    });
    assert(spacing.left>=16&&spacing.top>=16,`page text has padding at ${width}px`);
    assert(!spacing.overflow,`calculator fits ${width}px`);
    await page.evaluate(()=>scrollTo(0,0));
    if(process.env.BLUEPRINT_SCREENSHOT&&width===1440)await page.screenshot({path:process.env.BLUEPRINT_SCREENSHOT.replace('.png',`-desktop-${shell}.png`),fullPage:true});
   }
   await page.setViewportSize({width:390,height:844});
   assert(await page.locator('.blueprint-calculator').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'calculator fits mobile');
   await page.evaluate(()=>scrollTo(0,0));
   if(process.env.BLUEPRINT_SCREENSHOT)await page.screenshot({path:process.env.BLUEPRINT_SCREENSHOT.replace('.png',`-${shell}.png`),fullPage:true});
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS: both shells, joint Epic setup, incompatible targets, unavailable Mythic, exact copies, manual counts, mobile layout, unchanged save.');
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
