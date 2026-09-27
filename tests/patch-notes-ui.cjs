const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('../research/tools/ui-test/node_modules/playwright');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const shell of ['index.html','classic.html']){const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+`\nwindow.patchTest={refresh(value){kyberPreviewVerified=value;refreshKyberRelease()},route,seenPatchNoteIds,notes:()=>state.patchNotes};`}));
await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/base`);const modal=page.locator('.patch-notes-modal');await modal.waitFor({state:'visible'});
await page.evaluate(()=>{window.originalPatchDialog=document.querySelector('.patch-notes-modal');window.patchTest.refresh(true)});
assert.equal(await modal.count(),1,'restoring a preview-enabled account must not dismiss patch notes');
assert(await page.evaluate(()=>window.originalPatchDialog===document.querySelector('.patch-notes-modal')),'preserve the dialog and reading position');
await page.evaluate(()=>window.patchTest.refresh(false));assert(await modal.isVisible(),'sign-out/audience refresh must preserve the dialog');
await page.evaluate(()=>window.patchTest.route());assert(await modal.isVisible(),'page refresh must preserve the dialog');
assert.equal(await page.evaluate(()=>window.patchTest.seenPatchNoteIds().length),0,'background refresh must not mark notes seen');
await page.locator('#patchNotesClose').click();assert.equal(await modal.count(),0);assert((await page.evaluate(()=>window.patchTest.seenPatchNoteIds().length))>0);
await page.evaluate(()=>window.patchTest.refresh(true));assert.equal(await modal.count(),0,'dismissed notes must stay dismissed');
await page.reload();await page.waitForFunction(()=>window.patchTest?.notes().length>0);await page.waitForTimeout(150);assert.equal(await modal.count(),0,'dismissal persists after reload');
assert.deepEqual(errors,[]);console.log('PASS patch notes startup/auth refresh/dismissal:',shell);await context.close();}
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
