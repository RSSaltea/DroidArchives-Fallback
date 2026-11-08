const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('../tools/node_modules/playwright');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{const page=await browser.newPage();await page.route('https://**/*',r=>r.abort());
 await page.addInitScript(notes=>localStorage.setItem('droid-archive-seen-patch-notes',JSON.stringify(notes)),JSON.parse(fs.readFileSync(path.join(root,'data/patch-notes.json'))).notes.map(n=>n.id));
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});
 for(const route of ['/','/base','/optimise','/rebirth','/trading','/droids','/droidex','/scourgedex','/traits','/fusion-lab','/nova-shop','/cantina-shop','/droid-calc','/blueprint-calc','/crit-calc','/lucky-droid','/groups','/event','/companion','/todo','/site-guide','/droid/R2']){
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html#${route}`);await page.waitForTimeout(650);
 const found=await page.evaluate(()=>{
 const bad=[];for(const el of document.querySelectorAll('#app article,#app .panel,#app .notice')){const c=getComputedStyle(el),r=el.getBoundingClientRect();if(!r.width||!r.height||parseFloat(c.borderLeftWidth)<1)continue;
 const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){if(!n.textContent.trim()||['SCRIPT','STYLE','OPTION'].includes(n.parentElement.tagName))continue;const range=document.createRange();range.selectNodeContents(n);const b=range.getBoundingClientRect();if(!b.width||!b.height)continue;if(b.left-r.left<7&&b.right>r.left&&b.left>=r.left-1){bad.push({box:el.tagName+'.'+el.className,text:n.textContent.trim().slice(0,65),gap:Math.round(b.left-r.left)});break;}}
 }return {bad,overflow:document.documentElement.scrollWidth>innerWidth+1};});
 console.log(JSON.stringify({width,route,...found}));
 }}
 }finally{await browser.close();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
