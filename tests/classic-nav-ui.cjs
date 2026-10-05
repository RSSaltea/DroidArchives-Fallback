const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')));}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data)});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:950}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
  await context.addInitScript(ids=>localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(ids)),JSON.parse(fs.readFileSync('data/patch-notes.json','utf8')).notes.map(n=>n.id));
  const url=`http://127.0.0.1:${server.address().port}/classic.html#/event`;
  await page.goto(url);await page.locator('.event-page').waitFor();
  const names=()=>page.locator('#nav>a').allTextContents();
  assert.deepEqual(await names(),['Base','Optimise','Droidex','Crit Calc']);
  await page.locator('#menuButton').click();await page.locator('.classic-nav-settings summary').click();
  await page.locator('[data-shortcut="0"]').selectOption('#/event');
  await page.locator('[data-shortcut="1"]').selectOption('#/nova-shop');
  assert.deepEqual(await names(),['Event','Nova Shop','Droidex','Crit Calc']);
  assert.equal(await page.locator('#nav>a').first().getAttribute('aria-current'),'page');
  await page.locator('[data-shortcut="2"]').selectOption('#/event');
  assert.deepEqual(await names(),['Droidex','Nova Shop','Event','Crit Calc']);
  await page.locator('[data-shortcut="3"]').selectOption('');assert.equal(await page.locator('#nav>a').count(),3);
  assert(await page.locator('.sidebar>a[href="#/crit-calc"]').isVisible());
  await page.reload();await page.locator('.event-page').waitFor();assert.deepEqual(await names(),['Droidex','Nova Shop','Event']);
  await page.locator('#menuButton').click();await page.locator('.classic-nav-settings summary').click();
  for(let i=0;i<4;i++)await page.locator(`[data-shortcut="${i}"]`).selectOption('');
  assert(!(await page.locator('#nav').isVisible()));assert(await page.locator('#menuButton').isVisible());
  await page.locator('[data-reset-shortcuts]').click();assert.deepEqual(await names(),['Base','Optimise','Droidex','Crit Calc']);
  // Long labels must fit even with all four shortcut slots used.
  for(const [i,href] of ['#/cantina-shop','#/fusion-lab','#/lucky-droid','#/todo'].entries())await page.locator(`[data-shortcut="${i}"]`).selectOption(href);
  for(const width of [1920,1280,1000,650,390,320]){
   await page.setViewportSize({width,height:950});await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().top>=document.querySelector('.site-header').getBoundingClientRect().bottom-1);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow at ${width}`);
   assert(await page.locator('#nav>a').evaluateAll(links=>links.every(a=>{const r=a.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&a.scrollWidth<=a.clientWidth+1})),`shortcut overflow at ${width}`);
   assert(await page.locator('.classic-nav-settings').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  }
  fs.mkdirSync(path.join(root,'research/uefn/october04/ui'),{recursive:true});
  await page.setViewportSize({width:390,height:950});await page.screenshot({path:path.join(root,'research/uefn/october04/ui/classic-shortcuts-mobile.png')});
  await page.setViewportSize({width:1280,height:950});await page.screenshot({path:path.join(root,'research/uefn/october04/ui/classic-shortcuts-desktop.png')});
  await page.evaluate(()=>localStorage.setItem('droid-archive-classic-shortcuts','{"bad":true}'));await page.reload();await page.locator('.event-page').waitFor();assert.deepEqual(await names(),['Base','Optimise','Droidex','Crit Calc']);
  await page.evaluate(()=>localStorage.setItem('droid-archive-classic-shortcuts','["#/event","#/event","javascript:alert(1)",null,"#/base"]'));await page.reload();await page.locator('.event-page').waitFor();assert.deepEqual(await names(),['Event']);
  assert.deepEqual(errors,[]);console.log('PASS Classic shortcuts: selection, order swapping, active page, fewer/zero shortcuts, reset, persistence, invalid saved settings and narrow screens');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
