const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('../research/tools/ui-test/node_modules/playwright');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
for(const shell of ['index.html','classic.html']){
 const p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>localStorage.setItem('droid-archives-site-help-v1','{"invited":true}'));
 await p.route('https://**/*',r=>r.abort());await p.route('**/data/patch-notes.json*',r=>r.fulfill({json:{notes:[]}}));
 await p.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.neededTest={state,route,chipsToVariant,fmt};'}));
 await p.goto(`http://127.0.0.1:${server.address().port}/${shell}#/base`);await p.waitForFunction(()=>window.neededTest?.state.droids.length);
 const expected=await p.evaluate(()=>{const t=window.neededTest,s=t.state;s.cycle=0;s.rebirth=25;s.superRebirthGoal=40;s.owned=[
 {name:'LEP',variant:'GOLD',qty:1,built:true,preferred:'WORKER',preferredSlot:0},
 {name:'LEP',variant:'GOLD',qty:1,built:true,preferred:'LOUNGE',preferredSlot:0},
 {name:'R2',variant:'KYBER',qty:1,built:true,preferred:'LOUNGE',preferredSlot:1},
 {name:'SNOW MOUSE',variant:'SCOURGE',qty:1,built:true,preferred:'WORKER',preferredSlot:1}];
 s.rebirths[0]=[{to:26,creditsCost:1,requiredDroids:[{droidName:'LEP',variant:'GOLD'},{droidName:'R2',variant:'KYBER'},{droidName:'SNOW MOUSE',variant:'KYBER'},{droidName:'IG',variant:'BESKAR'}]},{to:27,creditsCost:1,requiredDroids:[{droidName:'LEP',variant:'BESKAR'}]}];t.route();return t.fmt(t.chipsToVariant(s.droids.find(d=>d.name==='LEP'),'GOLD','BESKAR'))+' chips';});
 const card=(rank,name)=>p.locator(`.rebirth-group[data-rebirth="${rank}"] [data-needed-name="${name}"]`);
 assert.match(await card(26,'lep').innerText(),/Location: Worker 1; Lounge 1/);
 assert((await card(26,'lep').innerText()).includes(expected));assert.match(await card(26,'lep').innerText(),/Later Beskar/);
 assert((await card(27,'lep').innerText()).includes(expected));
 assert.match(await card(26,'r2').innerText(),/Activate.*Kyber Crystals/);assert.match(await card(26,'r2').innerText(),/Lounge 2/);
 assert.match(await card(26,'snow mouse').innerText(),/Ready/);assert.doesNotMatch(await card(26,'snow mouse').innerText(),/chips|Activate/);
 assert.match(await card(26,'ig').innerText(),/Needed/);assert.equal(await card(26,'ig').locator('.needed-location').count(),0);
 for(const width of [1440,390]){
  await p.setViewportSize({width,height:1000});await card(26,'lep').scrollIntoViewIfNeeded();
  assert(await card(26,'lep').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  assert.equal(await card(26,'lep').locator('.needed-location').evaluate(e=>getComputedStyle(e).whiteSpace),'normal');
 }
 fs.mkdirSync(path.join(root,'research/needed-cards'),{recursive:true});await card(26,'lep').screenshot({path:path.join(root,'research/needed-cards',shell+'.png')});
 assert.deepEqual(errors,[]);console.log(shell+': locations, multiple copies, later upgrade costs, activation, ready/missing and mobile passed');await p.close();
}
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
