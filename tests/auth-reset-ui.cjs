// Password reset through the real browser-loaded app, with the Supabase client
// stubbed: a dead link explains itself, a live recovery link opens the
// new-password form on the home page, and the emailed code sets a password
// without leaving the page. Run with node tests/auth-reset-ui.cjs (Playwright
// and a Chromium browser at CHROME_PATH).
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'))}catch{try{({chromium}=require('playwright-core'))}catch{({chromium}=require(path.join(process.env.LOCALAPPDATA,'DroidArchivesResearch/ui-test/node_modules/playwright')))}}
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});res.end(data)});
});
// A stand-in for supabase-js: a recovery link yields a session and the
// PASSWORD_RECOVERY event, and every auth call is recorded.
const stub=`window.__calls=[];window.supabase={createClient:()=>{const session=location.hash.includes('type=recovery')?{user:{id:'u1',email:'player@example.com'},access_token:'x'}:null;return {auth:{onAuthStateChange:cb=>{setTimeout(()=>{cb('INITIAL_SESSION',session);if(session)cb('PASSWORD_RECOVERY',session)},0);return {data:{subscription:{unsubscribe(){}}}}},getSession:async()=>({data:{session}}),resetPasswordForEmail:async(email,opts)=>{window.__calls.push(['reset',email,opts.redirectTo]);return {error:null}},verifyOtp:async(args)=>{window.__calls.push(['verifyOtp',args]);return {data:{session:{user:{id:'u1',email:args.email}}},error:null}},updateUser:async(args)=>{window.__calls.push(['updateUser',args]);return {error:null}},signOut:async()=>({error:null})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})})}}}`;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext();await context.addInitScript(stub);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message)});
  await page.route('https://**/*',r=>r.abort());await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
  // A used or expired link lands on the home page with an explanation and a way to ask again.
  await page.goto(base+'/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await page.waitForSelector('#authLinkRetry',{timeout:15000});
  assert(!(await page.locator('#app').innerText()).includes('Page not found'),'an auth link is not a missing page');
  assert((await page.locator('.auth-modal h2').innerText()).includes('expired'));
  assert.equal(await page.evaluate(()=>location.hash),'#/','tokens are cleared from the address bar');
  await page.click('#authLinkRetry');await page.waitForSelector('#authEmail');
  console.log('PASS: an expired link explains itself and offers a new email.');
  // A live recovery link opens the new-password form, which checks both fields.
  await page.goto('about:blank');await page.goto(base+'/#access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer&type=recovery');
  await page.waitForSelector('#newPassword',{timeout:15000});
  assert(!(await page.locator('#app').innerText()).includes('Page not found'));
  await page.fill('#newPassword','hunter22');await page.fill('#newPasswordAgain','hunter2');await page.click('#saveNewPassword');
  assert((await page.locator('#passwordError').innerText()).includes('do not match'));
  await page.fill('#newPasswordAgain','hunter22');await page.click('#saveNewPassword');
  await page.waitForFunction(()=>!document.querySelector('#newPassword'));
  assert.deepEqual((await page.evaluate(()=>window.__calls)).at(-1),['updateUser',{password:'hunter22'}]);
  console.log('PASS: a recovery link opens the form and updates the password.');
  // The reset address sends the email; the code from it sets a password here.
  await page.goto('about:blank');await page.goto(base+'/#/reset-password');await page.waitForSelector('#authEmail',{timeout:15000});
  await page.fill('#authEmail','player@example.com');await page.click('#authSubmit');
  await page.waitForSelector('#resetCode');
  await page.fill('#resetCode','123 456');await page.fill('#resetPassword','newpass9');await page.fill('#resetPasswordAgain','newpass9');await page.click('#resetSubmit');
  await page.waitForFunction(()=>!document.querySelector('#resetCode'));
  const calls=await page.evaluate(()=>window.__calls),reset=calls.find(c=>c[0]==='reset');
  assert(reset&&reset[1]==='player@example.com'&&reset[2]==='https://rssaltea.github.io/DroidArchives/','an unknown host sends players to the public site');
  assert.deepEqual(calls.find(c=>c[0]==='verifyOtp')[1],{email:'player@example.com',token:'123456',type:'recovery'});
  assert.deepEqual(calls.at(-1),['updateUser',{password:'newpass9'}]);
  console.log('PASS: #/reset-password sends the email and the code sets the password without leaving the page.');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
