// Leaving a shared (group) profile through the profile menu, and the floating
// rebirth bar while one is open. Picking your own profile used to restore your data
// but redraw nothing when that profile was already the active one, so the shared
// base stayed on screen until a refresh; and the floating bar never appeared on a
// share you were allowed to edit. Run with node tests/shared-profile-exit-ui.cjs.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')));}
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 const type={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)];
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':type||'application/octet-stream'});res.end(data);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
 const page=await (await browser.newContext({viewport:{width:1400,height:800}})).newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.abort());
 await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.testPlan={state,save,applyProfileData,profileDataFromState,switchCloudProfile,exitSharedProfile,activeProfile,route,renderCloudHeader};'}));
 await page.addInitScript(notes=>localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(notes)),JSON.parse(fs.readFileSync(path.join(root,'data/patch-notes.json'),'utf8')).notes.map(n=>n.id));
 const base=`http://127.0.0.1:${server.address().port}`;
 await page.goto(base+'/#/base');
 await page.waitForFunction(()=>window.testPlan?.state.droids.length);
 // My own profile holds one droid at rebirth 5; the shared one holds another at rebirth 20.
 const openShared=canEdit=>page.evaluate(canEdit=>{
  const d=window.testPlan;
  d.state.owned=[{name:'MOUSE',variant:'GOLD',qty:1,preferred:'WORKER',preferredSlot:0}];d.state.rebirth=5;d.save();
  // Shared profiles only exist for a signed-in player, whose own data lives in the cloud document.
  d.state.cloud.user={id:'me'};d.state.cloud.doc={profiles:[{id:'me-1',name:'Saltea',data:structuredClone(d.profileDataFromState())}],activeProfileId:'me-1'};d.state.cloud.activeProfileId='me-1';
  const theirs={...structuredClone(d.profileDataFromState()),owned:[{name:'GONK',variant:'DIAMOND',qty:1,preferred:'WORKER',preferredSlot:0}],rebirth:20};
  d.state.sharedView={groupId:'g1',ownerId:'u2',profileId:'p2',ownerName:'Alex',profileName:'WeirdGirl529',canEdit,profile:{data:theirs,updatedAt:null}};
  d.applyProfileData(theirs);d.renderCloudHeader();location.hash='#/base';d.route();
  return d.state.cloud.activeProfileId;
 },canEdit);
 const onScreen=()=>page.evaluate(()=>({shared:Boolean(window.testPlan.state.sharedView),rebirth:window.testPlan.state.rebirth,banner:Boolean(document.querySelector('.shared-profile-banner')),gonk:/GONK/.test(document.querySelector('#app').innerText),mouse:/MOUSE/.test(document.querySelector('#app').innerText),menuShared:/Shared profile/i.test(document.querySelector('#headerCloud').innerText+document.querySelector('#cloudMenuButton')?.getAttribute('aria-label'))}));

 // 1. The floating rebirth bar exists on a share you may edit, and not on a read-only one.
 const activeId=await openShared(true);
 await page.waitForSelector('.shared-profile-banner');
 assert.equal(await page.locator('#rebirthQuickBar').count(),1,'an editable share gets the floating rebirth bar');
 let view=await onScreen();assert.equal(view.shared,true);assert.equal(view.gonk,true);

 // 2. Choosing the profile that is already my active one brings my base back without a refresh.
 await page.evaluate(id=>window.testPlan.switchCloudProfile(id),activeId);
 await page.waitForFunction(()=>!window.testPlan.state.sharedView&&!document.querySelector('.shared-profile-banner'));
 view=await onScreen();
 assert.equal(view.rebirth,5,'my own rebirth is back');assert.equal(view.mouse,true,'my own base is drawn');assert.equal(view.gonk,false,'the shared base is gone');
 assert.equal(view.menuShared,false,'the profile menu no longer says Shared profile');

 // 3. "Return to my profiles" in the menu does the same, and stays on the page I was on.
 await openShared(false);
 await page.waitForSelector('.shared-profile-banner');
 assert.equal(await page.locator('#rebirthQuickBar').count(),0,'a read-only share has nothing to step');
 await page.click('#cloudMenuButton');
 await page.click('#cloudDropdown [data-shared-exit]');
 await page.waitForFunction(()=>!window.testPlan.state.sharedView&&!document.querySelector('.shared-profile-banner'));
 view=await onScreen();
 assert.equal(view.mouse,true);assert.equal(view.gonk,false);assert.equal(view.menuShared,false);
 assert.equal(await page.evaluate(()=>location.hash),'#/base','still on the Base, not sent to Groups');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('shared-profile-exit-ui: all passed');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exit(1);});
