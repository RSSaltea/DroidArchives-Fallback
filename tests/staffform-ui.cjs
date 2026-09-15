// Isolated browser test: Supabase is mocked, so no accounts/applications/posts are created.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')));}
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 let pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/staffform'){res.writeHead(301,{Location:'/staffform/'}).end();return;}
 if(pathname.endsWith('/'))pathname+='index.html';
 const file=path.resolve(root,'.'+decodeURIComponent(pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png'}[path.extname(file)]||'text/plain'});res.end(data);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.fulfill({contentType:'text/javascript',body:`
   window.formTest={calls:[],fail:true};window.supabase={createClient(){const session={user:{id:'account-one',email:'applicant@example.com'}};let cb=()=>{};return {
    auth:{onAuthStateChange(fn){cb=fn;},async getSession(){return {data:{session:null}};},async signInWithPassword(){cb('SIGNED_IN',session);return {data:{session}};},async signUp(){return {data:{session:null}};},async signOut(){cb('SIGNED_OUT',null);return {}; }},
    async rpc(name,args){formTest.calls.push({name,args});return formTest.fail?{error:{message:'Network error. Please retry.'}}:{data:{id:args.request_id}};}
   };}};`}));
  await page.goto(`http://127.0.0.1:${server.address().port}/staffform`);
  await page.waitForSelector('#login-form:not([hidden])');assert(await page.locator('#application-fields').evaluate(el=>el.disabled));
  await page.locator('[name=email]').fill('applicant@example.com');await page.locator('[name=password]').fill('example-password');await page.click('#login-submit');
  await page.waitForFunction(()=>!document.querySelector('#application-fields').disabled);
  await page.selectOption('#role','moderator');assert(await page.locator('#moderation_scenario').isVisible());
  await page.selectOption('#role','helper');assert(await page.locator('#moderation_scenario').isHidden());assert(await page.locator('#moderation_scenario').isDisabled());
  await page.locator('[name=discord_username]').fill('test.applicant');await page.locator('[name=discord_id]').fill('123456789012345678');
  for(const id of ['availability','familiarity','motivation','help_scenario','feedback_scenario'])await page.locator('#'+id).fill('I would give a clear and thoughtful answer.');
  await page.locator('[name=consent]').check();await page.click('#submit-application');
  await page.waitForFunction(()=>document.querySelector('#application-error').textContent.includes('Network error'));
  assert.equal(await page.locator('#motivation').inputValue(),'I would give a clear and thoughtful answer.');
  await page.evaluate(()=>formTest.fail=false);await page.click('#submit-application');
  await page.waitForFunction(()=>document.querySelector('#application-status').textContent.includes('Application received'));
  const calls=await page.evaluate(()=>formTest.calls);assert.equal(calls.length,2);assert.equal(calls[0].args.request_id,calls[1].args.request_id);
  assert.equal(calls[1].name,'submit_droid_staff_application');assert.equal(calls[1].args.application.role,'helper');assert(!('moderation_scenario' in calls[1].args.application.answers));
  assert(!('guild_id' in calls[1].args.application));assert(!('email' in calls[1].args.application));
  assert(await page.locator('#application-fields').evaluate(el=>el.disabled));
  await page.click('#signout');assert(await page.locator('#application-fields').evaluate(el=>el.disabled));assert.equal(await page.locator('#motivation').inputValue(),'');
  assert.equal(await page.locator('#submit-application').innerText(),'Send application');
  assert.equal(await page.locator('#motivation + small').innerText(),'0 / 600');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'research/staffform-mobile.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1280,height:1000});await page.screenshot({path:path.join(root,'research/staffform-desktop.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: direct /staffform URL, login, role-specific fields, safe retry, receipt, logout clearing, desktop/mobile layout. No live submissions.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
