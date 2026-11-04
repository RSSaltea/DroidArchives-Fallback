const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')));}
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();if(file.endsWith('app.js'))data=Buffer.from(data.toString()+'\nwindow.t={state,save,route,blankProfileData,applyProfileData,normalizeProfileDoc,switchCloudProfile,setNovaLevel,critSetting,baseExport,validateBaseImport,showSuperRebirthConfirm,normalisePickaxeLevel};');res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const [shell,style] of [['index.html','next'],['classic.html','modern'],['classic.html','legacy']]){
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
 await context.addInitScript(style=>{localStorage.setItem('droid-archives-site-help-v1',JSON.stringify({invited:true}));localStorage.setItem('droid-archive-ui-style',style);if(!localStorage.getItem('droid-archive-pickaxe-level'))localStorage.setItem('droid-archive-crit-pickaxe','41');},style);
 await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
 await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/crit-calc`);await page.waitForFunction(()=>window.t?.state.novaShop?.upgrades?.length);
 const field=page.locator('#critPickaxe');assert.equal(await field.inputValue(),'41','migrate existing local value');
 await page.evaluate(()=>{
  const a={...t.blankProfileData(),novaUpgrades:{'pickaxe-mastery':1}},b={...t.blankProfileData(),novaUpgrades:{'pickaxe-mastery':13}};
  t.state.localDoc=t.normalizeProfileDoc({activeProfileId:'a',profiles:[{id:'a',name:'First',data:a},{id:'b',name:'Second',data:b}]});t.state.cloud.activeProfileId='a';t.applyProfileData(a);t.save();t.route();
 });
 assert.equal(await field.inputValue(),'5');assert.equal(await field.getAttribute('min'),'5');
 await field.fill('12');await field.dispatchEvent('change');
 await page.evaluate(()=>t.switchCloudProfile('b'));assert.equal(await field.inputValue(),'29');
 await field.fill('41');await field.dispatchEvent('change');
 await page.evaluate(()=>t.switchCloudProfile('a'));assert.equal(await field.inputValue(),'12');
 await page.evaluate(()=>{t.setNovaLevel('pickaxe-mastery',6,false);t.route();});assert.equal(await field.inputValue(),'15','higher Mastery raises current level');
 await field.fill('2');await field.dispatchEvent('change');assert.equal(await field.inputValue(),'15','cannot go below Mastery');
 await field.fill('40');await field.dispatchEvent('change');
 await page.evaluate(()=>{t.setNovaLevel('pickaxe-mastery',10,false);t.state.rebirth=24;t.save();t.route();});assert.equal(await field.inputValue(),'40','regular Rebirth and Mastery upgrades keep a higher manual level');
 const imported=await page.evaluate(()=>t.validateBaseImport(t.baseExport()).pickaxeLevel);assert.equal(imported,40);
 await page.reload();await page.waitForSelector('#critPickaxe');assert.equal(await field.inputValue(),'40');
 await page.evaluate(()=>t.showSuperRebirthConfirm(t.route));await page.locator('#confirmSuperRebirth').click();await page.locator('#confirmSuperRebirth').click();
 assert.equal(await field.inputValue(),'23');assert.equal(await page.evaluate(()=>t.state.rebirth),0);
 await page.evaluate(()=>t.switchCloudProfile('b'));assert.equal(await field.inputValue(),'41','Super Rebirth does not affect the other profile');
 await page.reload();await page.waitForSelector('#critPickaxe');assert.equal(await field.inputValue(),'41');
 await page.locator('#critReset').click();assert.equal(await field.inputValue(),'29');
 await page.evaluate(()=>t.switchCloudProfile('a'));assert.equal(await field.inputValue(),'23');
 await page.evaluate(()=>{const old=t.blankProfileData();delete old.pickaxeLevel;t.applyProfileData(old);t.route();});assert.equal(await field.inputValue(),'0','old profiles do not inherit another profile level');
 assert.deepEqual(errors,[]);await context.close();console.log('PASS Pickaxe Mastery floor, manual levels, per-profile persistence, refresh, export/import and Super Rebirth reset:',style);
}}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
