const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('../tools/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'research/uefn/november22/ui');fs.mkdirSync(out,{recursive:true});
const names=['AX-L','BI-BIT','HV-EE','MO-TRO','KL-NK','SKM-MR','TOR-Q','STRD-3','LFT-3R','ION PROBE','QUAD SENTRY'];
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data)});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{for(const shell of ['index.html','classic.html']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('droid-archives-site-help-v1','{"invited":true}'));
  await page.route('https://**/*',r=>r.abort());await page.route('**/data/patch-notes.json*',r=>r.fulfill({json:{notes:[]}}));
  await page.route('**/app.js?*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('app.js','utf8')+'\nwindow.fusionFixture={state,route,hasRequirement,rebirthNames};'}));
  const base=`http://127.0.0.1:${server.address().port}/${shell}?companion=1`;
  await page.goto(base+'#/droid/ax-l');await page.waitForSelector('#addThis');
  for(const name of names){
   await page.evaluate(name=>{location.hash='#/droid/'+name.toLowerCase().replaceAll(' ','-')},name);
   await page.waitForFunction(name=>document.querySelector('h1')?.textContent.includes(name),name);
   assert(await page.locator('#addThis').isEnabled(),name);
   for(const variant of ['DEFAULT','STELLAR','KYBER_GREEN','SCOURGE']){
    await page.locator(`[data-v="${variant}"]`).click();
    const image=page.locator(`img[src$="${name.replaceAll(' ','_')}_${variant}.png"]`).first();
    await image.waitFor();await page.waitForFunction(src=>[...document.images].some(el=>el.getAttribute('src')===src&&el.complete&&el.naturalWidth>0),await image.getAttribute('src'),{timeout:15000});
   }
  }
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>{location.hash='#/droid/kl-nk'});await page.waitForSelector('[data-v="DEFAULT"]');await page.locator('[data-v="DEFAULT"]').click();
   await page.screenshot({path:path.join(out,`${shell}-kl-nk-${width}.png`),fullPage:true});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'detail overflow');
   await page.evaluate(()=>{location.hash='#/fusion-lab'});await page.waitForSelector('[data-target]');
   await page.locator('[data-target]').fill('AX-L');await page.locator('[data-target]').press('Tab');
   await page.waitForFunction(()=>document.querySelector('[data-plan]')?.textContent.includes('MPH'));
   assert((await page.locator('[data-plan]').innerText()).includes('IG'));
   await page.screenshot({path:path.join(out,`${shell}-fusion-${width}.png`),fullPage:true});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'fusion overflow');
  }
  const ready=await page.evaluate(()=>{const t=fusionFixture;t.state.owned=[{name:'KL-NK',variant:'STELLAR',qty:1,preferred:'LOUNGE'}];return ['RIC','PZ'].every(droidName=>t.hasRequirement({droidName,variant:'GALACTIC'}));});assert(ready);
  assert.deepEqual(errors,[]);await page.close();console.log('PASS',shell,'11 droid pages, portraits, fusion target, rebirth ingredients and desktop/mobile layout');
 }}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
