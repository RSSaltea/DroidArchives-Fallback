const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),http=require('http');const {chromium}=require('../tools/node_modules/playwright');
const root=path.resolve(__dirname,'..');const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(p==='/'?'/index.html':p));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data)});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});try{for(const shell of ['index.html','classic.html']){
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
 await page.route('**/app.js?*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('app.js','utf8')+`
 window.fixture={state,groupTradeMatches,ownGroupTrades,optimiseInputStamp,optimiseLayoutSnapshot,prepareOptimiseWorkerJob,optimiseFusionExcluded,prepareScourgeSubmissions,blankProfileData,profileDataFromState,applyProfileData,groupsPage,optimisePage};
 window.setupGroupTest=()=>{
 const ownId='test',data={...blankProfileData(),owned:[{name:'R7',variant:'BESKAR',qty:1,preferred:'LOUNGE',preferredSlot:0}],rebirth:40,cycle:0,loungePurchased:12};
 applyProfileData(data);state.cloud.user={id:ownId};state.cloud.session={user:state.cloud.user};state.cloud.enabled=true;state.cloud.activeProfileId='one';state.cloud.doc={profiles:[{id:'one',name:'My Base',data}],activeProfileId:'one'};
 state.rebirths[0]=[{to:1,requiredDroids:[{droidName:'R7',variant:'BESKAR'}]}];
 state.groups={loaded:true,loading:false,error:'',workspace:[{id:'team',name:'Test Team',ownerId:ownId,members:[{userId:ownId,displayName:'Me',role:'owner'},{userId:'friend',displayName:'Friend'}],profiles:[{ownerId:ownId,ownerName:'Me',profileId:'one',profileName:'My Base',data},{ownerId:'friend',ownerName:'Friend',profileId:'two',profileName:'Other Base',data:{...blankProfileData(),cycle:0,rebirth:0,owned:[]}}]}]};
 location.hash='#/groups';return groupsPage();
 };
 `}));
 await page.goto(`http://127.0.0.1:${server.address().port}/${shell}?companion=1#/`);await page.waitForFunction(()=>window.fixture?.state.droids.length);await page.evaluate(()=>setupGroupTest());
 await page.locator('.group-trade-card').waitFor();assert.equal(await page.locator('.group-trade-card').count(),1);assert.match(await page.locator('.group-trade-card').innerText(),/Friend/);assert(await page.locator('.group-trade-card img').count());await page.locator('.group-trading-panel').screenshot({path:path.join(process.env.TEMP,'group-trading-'+shell+'.png')});
 const result=await page.evaluate(async()=>{
  const f=fixture;f.optimiseInputStamp();const snap=f.optimiseLayoutSnapshot();
  const {createOptimiseLayoutContext}=await import('./optimise-layout-context.js');
  const prepared=createOptimiseLayoutContext(snap).prepareOptimiseWorkerJob();
  const excluded=[...f.optimiseFusionExcluded(prepared.baseP)];
  const target={placed:prepared.baseP.placed.map(x=>({...x,variant:'SCOURGE'})),sell:[],overflow:[]};
  f.prepareScourgeSubmissions({...prepared.baseP,placed:target.placed},target);
  return {keys:Object.keys(snap.state.groupTradeProtection),sell:prepared.targets.flatMap(t=>t.sell),kept:prepared.targets.every(t=>[...t.placed,...t.overflow].some(u=>u.source===0&&u.unit===0)),excluded,submissions:target.submissions};
 });
 assert.deepEqual(result.keys,['0:0']);assert.equal(result.sell.length,0);assert(result.kept);assert(result.excluded.includes('0:0'));assert.equal(result.submissions.length,0);
 await page.evaluate(()=>{location.hash='#/optimise';fixture.optimisePage()});await page.locator('#optimiseBackgroundStatus').waitFor({timeout:60000});assert.match(await page.locator('.group-trading-panel').innerText(),/Keep this to trade with Friend/);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 // A fulfilled requirement releases the automatic hold without a manual Base flag.
 const released=await page.evaluate(()=>{fixture.state.groups.workspace[0].profiles[1].data.owned=[{name:'R7',variant:'SCOURGE',qty:1}];fixture.optimiseInputStamp();return {keys:Object.keys(fixture.state.groupTradeProtection),manual:fixture.state.owned.some(u=>u.noSell)}});assert.deepEqual(released,{keys:[],manual:false});
 assert.deepEqual(errors,[]);await page.close();console.log('PASS',shell,'group cards, per-copy worker sale/fusion/submission protection, release and mobile layout');
}}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
