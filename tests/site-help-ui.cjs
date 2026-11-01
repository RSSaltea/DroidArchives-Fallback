const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('../research/tools/ui-test/node_modules/playwright');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');fs.readFile(file,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const layout of ['index.html','classic.html','legacy']){
 const shell=layout==='legacy'?'classic.html':layout;
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(layout==='legacy')await context.addInitScript(()=>localStorage.setItem('droid-archive-ui-style','legacy'));
 await page.route('https://**/*',r=>r.abort());await page.route('**/data/patch-notes.json*',r=>r.fulfill({json:{notes:[]}}));
 await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.guideTest={state,route};'}));
 await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/base`);
 await page.locator('.site-help-invite').waitFor({timeout:15000});await page.locator('[data-no]').click();
 await page.reload();await page.waitForTimeout(6500);assert.equal(await page.locator('.site-help-invite').count(),0);
 await page.locator('#siteHelpLink').click();await page.locator('#startSiteTour').waitFor();
 const before=await page.evaluate(()=>JSON.stringify(window.guideTest.state.owned));
 await page.locator('[data-help-check="base"]').check();await page.reload();await page.locator('#startSiteTour').waitFor();assert(await page.locator('[data-help-check="base"]').isChecked());
 await page.locator('#startSiteTour').click();await page.locator('.site-tour').waitFor();assert.match(await page.locator('.site-tour').innerText(),/1 of 7/i);
 await page.locator('[data-tour="next"]').click();assert.match(await page.locator('.site-tour').innerText(),/2 of 7/i);
 await page.locator('[data-tour="back"]').click();assert.match(await page.locator('.site-tour').innerText(),/1 of 7/i);
 await page.locator('[data-tour="skip"]').click();assert.equal(await page.locator('.site-tour').count(),0);
 await page.locator('#siteHelpLink').click();await page.locator('[data-help-step="6"]').click();await page.locator('[data-tour="next"]').click();assert.equal(await page.locator('.site-tour').count(),0);
 await page.locator('#siteHelpLink').click();await page.locator('#startSiteTour').click();for(let i=0;i<6;i++){await page.locator('[data-tour="next"]').click();await page.waitForFunction(i=>document.querySelector('.site-tour .eyebrow')?.textContent.includes(`${i+2} of 7`),i)}
 assert.equal(await page.evaluate(()=>JSON.stringify(window.guideTest.state.owned)),before);
 await page.keyboard.press('Escape');assert.equal(await page.locator('.site-tour').count(),0);
 await page.locator('#siteHelpLink').click();assert.equal(await page.locator('.site-help-page').evaluate(el=>el.scrollWidth>el.clientWidth),false);
 assert.equal(await page.locator('.sidebar a[href="#/guide"],.toolbar a[href="#/guide"]').count(),0);
 fs.mkdirSync('research/guide',{recursive:true});await page.screenshot({path:`research/guide/${shell}-onboarding-mobile.png`});
 assert.deepEqual(errors,[]);console.log(layout+': invitation, decline persistence, checklist, back/skip/restart/finish, all routes, no droid changes and mobile passed');await context.close();
 }
 const page=await browser.newPage();await page.route('https://**/*',r=>r.abort());await page.route('**/data/patch-notes.json*',r=>r.fulfill({json:{notes:[]}}));await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);await page.locator('[data-yes]').click({timeout:15000});await page.locator('.site-tour').waitFor();console.log('Yes invitation starts tour');
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
