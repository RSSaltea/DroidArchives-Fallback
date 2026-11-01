const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('../research/tools/ui-test/node_modules/playwright');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');fs.readFile(file,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
async function openTourDestination(page){
 if(await page.locator('.site-tour').getAttribute('data-tour-phase')!=='navigation')return;
 assert(await page.locator('[data-tour="next"]').isDisabled());
 const destination=await page.locator('.site-tour').getAttribute('data-tour-destination');
 let links=page.locator(`#nav a[href="#${destination}"]:visible,.sidebar a[href="#${destination}"]:visible,.toolbar a[href="#${destination}"]:visible`);
 if(!await links.count()){await page.locator('#menuButton:visible,.menu-button:visible').first().click();await links.first().waitFor();}
 await links.first().click();await page.waitForFunction(()=>document.querySelector('.site-tour')?.dataset.tourPhase==='content');
}
async function checkAttachedHighlight(page){
 await page.waitForFunction(()=>document.querySelectorAll('.site-tour-target').length===1);
 await page.waitForTimeout(100);
 const result=await page.evaluate(()=>{
  const target=document.querySelector('.site-tour-target'),r=target.getBoundingClientRect();
  const overlap=[...document.querySelectorAll('.site-tour-spotlight>.tour-shade')].some(el=>{
   const s=el.getBoundingClientRect();return Math.min(s.right,r.right-1)>Math.max(s.left,r.left+1)&&Math.min(s.bottom,r.bottom-1)>Math.max(s.top,r.top+1);
  });
  const panel=document.querySelector('.site-tour').getBoundingClientRect(),v=visualViewport;
  return {visible:r.bottom>0&&r.top<(visualViewport?.height||innerHeight)&&r.right>0&&r.left<innerWidth,target:target.id||target.className,rect:r.toJSON(),shades:[...document.querySelectorAll('.tour-shade')].map(e=>e.getBoundingClientRect().toJSON()),outline:getComputedStyle(target).outlineWidth,overlap,tag:document.querySelector('.site-tour-spotlight').tagName,
   inViewport:panel.left>=v.offsetLeft-1&&panel.top>=v.offsetTop-1&&panel.right<=v.offsetLeft+v.width+1&&panel.bottom<=v.offsetTop+v.height+1};
 });
 if(result.overlap||!result.visible)await page.screenshot({path:'research/guide/tour-overlap-failure.png'});assert(result.visible,JSON.stringify(result));assert.equal(result.outline,'3px');assert.equal(result.overlap,false,JSON.stringify(result));assert.equal(result.tag,'DIV');assert(result.inViewport,'tour card stays within visible viewport');
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const layout of ['index.html','classic.html','legacy']){
 console.log('Testing '+layout);
 const shell=layout==='legacy'?'classic.html':layout;
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(layout+': '+e.message)});
 if(layout==='legacy')await context.addInitScript(()=>localStorage.setItem('droid-archive-ui-style','legacy'));
 await page.route('https://**/*',r=>r.abort());await page.route('**/data/patch-notes.json*',r=>r.fulfill({json:{notes:[]}}));
 await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.guideTest={state,route};'}));
 await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/base`);
 await page.locator('.site-help-invite').waitFor({timeout:60000});await page.locator('[data-no]').click();
 await page.reload();await page.waitForTimeout(6500);assert.equal(await page.locator('.site-help-invite').count(),0);
 await page.locator('#siteHelpLink').click();await page.locator('#startSiteTour').waitFor();
 const before=await page.evaluate(()=>JSON.stringify(window.guideTest.state.owned));
 await page.locator('[data-help-check="base"]').check();await page.reload();await page.locator('#startSiteTour').waitFor();assert(await page.locator('[data-help-check="base"]').isChecked());
 await page.locator('#startSiteTour').click();await page.locator('.site-tour').waitFor();assert(page.url().endsWith('#/site-guide'));
 await checkAttachedHighlight(page);
 if(layout==='index.html'){
  assert.equal(await page.locator('.site-tour-target').getAttribute('href'),'#/base');
  // Mobile browser chrome can change innerHeight independently of the fixed
  // overlay. The real button outline must remain attached, with no SVG scaling.
  await page.evaluate(()=>{window.savedTourHeight=Object.getOwnPropertyDescriptor(window,'innerHeight');Object.defineProperty(window,'innerHeight',{configurable:true,get:()=>1000});});
  await page.evaluate(()=>scrollBy(0,35));await checkAttachedHighlight(page);
  await page.evaluate(()=>{Object.defineProperty(window,'innerHeight',window.savedTourHeight);delete window.savedTourHeight;});
 }
 await openTourDestination(page);
 if(layout==='index.html'){
  await page.setViewportSize({width:1720,height:1000});await page.locator('#baseDrawerButton').click();
  await page.waitForFunction(()=>!document.querySelector('#baseDrawerBackdrop').hidden);await checkAttachedHighlight(page);
 }
 assert.match(await page.locator('.site-tour').innerText(),/1 of 8/i);
 await page.locator('[data-tour="next"]').click();assert.match(await page.locator('.site-tour').innerText(),/2 of 8/i);
 await checkAttachedHighlight(page);
 if(layout==='index.html'){
  assert.equal(await page.locator('#baseDrawerBackdrop').isHidden(),true,'moving to map closes the blurring settings backdrop');
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('drawer-open')),false);
 }
 await page.setViewportSize({width:390,height:844});await checkAttachedHighlight(page);
 await page.screenshot({path:`research/guide/${layout}-spotlight-mobile.png`});
 await page.setViewportSize({width:1440,height:1000});await checkAttachedHighlight(page);await page.screenshot({path:`research/guide/${layout}-spotlight-desktop.png`});
 await page.setViewportSize({width:844,height:390});await checkAttachedHighlight(page);
 await page.setViewportSize({width:390,height:844});
 await page.locator('[data-tour="back"]').click();assert.match(await page.locator('.site-tour').innerText(),/1 of 8/i);
 await page.locator('[data-tour="skip"]').click();assert.equal(await page.locator('.site-tour').count(),0);assert.equal(await page.locator('.site-tour-spotlight').count(),0);assert.equal(await page.locator('.site-tour-target').count(),0);
 await page.locator('#siteHelpLink').click();await page.locator('[data-help-step="7"]').click();await openTourDestination(page);await page.locator('[data-tour="next"]').click();assert.equal(await page.locator('.site-tour').count(),0);assert.equal(await page.locator('.site-tour-spotlight').count(),0);assert.equal(await page.locator('.site-tour-target').count(),0);
 await page.locator('#siteHelpLink').click();await page.locator('#startSiteTour').click();await openTourDestination(page);for(let i=0;i<7;i++){await page.locator('[data-tour="next"]').click();await openTourDestination(page);await page.waitForFunction(i=>document.querySelector('.site-tour .eyebrow')?.textContent.includes(`${i+2} of 8`),i)}
 assert.equal(await page.evaluate(()=>JSON.stringify(window.guideTest.state.owned)),before);
 await page.keyboard.press('Escape');assert.equal(await page.locator('.site-tour').count(),0);assert.equal(await page.locator('.site-tour-spotlight').count(),0);assert.equal(await page.locator('.site-tour-target').count(),0);
 await page.locator('#siteHelpLink').click();assert.equal(await page.locator('.site-help-page').evaluate(el=>el.scrollWidth>el.clientWidth),false);
 assert.equal(await page.locator('.sidebar a[href="#/guide"],.toolbar a[href="#/guide"]').count(),0);
 fs.mkdirSync('research/guide',{recursive:true});await page.screenshot({path:`research/guide/${shell}-onboarding-mobile.png`});
 assert.deepEqual(errors,[]);console.log(layout+': invitation, decline persistence, checklist, back/skip/restart/finish, all routes, no droid changes and mobile passed');await context.close();
 }
 const page=await browser.newPage();await page.route('https://**/*',r=>r.abort());await page.route('**/data/patch-notes.json*',r=>r.fulfill({json:{notes:[]}}));await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);await page.locator('[data-yes]').click({timeout:60000});await page.locator('.site-tour').waitFor();assert.equal(await page.locator('.site-tour').getAttribute('data-tour-phase'),'navigation');await openTourDestination(page);console.log('Yes invitation points to Base before opening it');
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
