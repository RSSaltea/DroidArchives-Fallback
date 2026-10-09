const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')));}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data)});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try {for(const shell of ['index.html','classic.html']) {
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.upcomingTest={state,COMING_SOON_DROIDS,requestAdd,commitOwned,addBlueprint,toggleDroidex};'}));
  await context.addInitScript(ids=>localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(ids)),JSON.parse(fs.readFileSync('data/patch-notes.json','utf8')).notes.map(n=>n.id));
  const base=`http://127.0.0.1:${server.address().port}/${shell}`;
  await page.goto(base+'#/droids');await page.locator('[data-coming-soon="WG-22"]').waitFor();
  assert.equal(await page.locator('[data-coming-soon]').count(),8);
  await page.locator('[data-coming-soon="WG-22"]').click();await page.locator('.coming-soon-detail').waitFor();
  assert.equal(await page.locator('[data-upcoming-variant]').count(),1);
  assert.match(await page.locator('.coming-soon-detail').innerText(),/2? Flawless Chance/);
  assert.equal(await page.locator('.detail-actions button:disabled').count(),3);
  await page.goto(base+'#/droid/kt');await page.locator('.coming-soon-detail').waitFor();
  assert.equal(await page.locator('[data-upcoming-variant]').count(),11);
  await page.locator('[data-upcoming-variant="KYBER_PURPLE"]').click();
  assert.match(await page.locator('tbody').innerText(),/Kyber Purple/);
  assert.equal(await page.locator('tbody .upcoming-value').count(),4);
  assert(!/\bNaN\b|\b0\/s\b/.test(await page.locator('.coming-soon-detail').innerText()));
  assert.equal(await page.evaluate(()=>upcomingTest.state.droids.some(d=>upcomingTest.COMING_SOON_DROIDS.some(u=>u.name===d.name))),false);
  const preserved=await page.evaluate(()=>{
   const t=upcomingTest,before=JSON.stringify([t.state.owned,t.state.blueprints,t.state.droidex]);
   for(const d of t.COMING_SOON_DROIDS){t.requestAdd(d.name,'DEFAULT');t.commitOwned(d.name,'DEFAULT');t.addBlueprint(d.name,'DEFAULT');t.toggleDroidex(d.name,'DEFAULT')}
   return before===JSON.stringify([t.state.owned,t.state.blueprints,t.state.droidex]);
  });assert(preserved,'Upcoming droids cannot enter gameplay or collection state');
  await page.goto(base+'#/droidex');await page.locator('#dexUpcoming [data-coming-soon]').first().waitFor();
  assert.equal(await page.locator('#dexUpcoming [data-coming-soon]').count(),8);
  await page.locator('[data-dex-variant="KYBER_PURPLE"]').click();
  assert.equal(await page.locator('#dexUpcoming [data-coming-soon]').count(),7);
  await page.locator('#dexSearch').fill('PLNK');assert.equal(await page.locator('#dexUpcoming [data-coming-soon]').count(),1);
  await page.setViewportSize({width:390,height:844});await page.goto(base+'#/droid/kt');await page.locator('.coming-soon-detail').waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Mobile page should not overflow');
  fs.mkdirSync('research/uefn/october09/ui',{recursive:true});await page.screenshot({path:`research/uefn/october09/ui/${shell}-upcoming.png`,fullPage:true});
  assert.deepEqual(errors,[]);await context.close();console.log(`${shell}: upcoming variants, disabled tracking and mobile layout passed`);
 }}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
