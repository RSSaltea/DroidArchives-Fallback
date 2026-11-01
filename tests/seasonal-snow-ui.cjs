const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('../research/tools/ui-test/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const f=path.join(root,new URL(req.url,'http://localhost').pathname);fs.readFile(f,(err,data)=>{if(err){res.writeHead(404).end();return}res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.json':'application/json'})[path.extname(f)]||'image/png');res.end(data)})});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
 const page=await browser.newPage();await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.snowOwnerTest=value=>{kyberPreviewVerified=value;refreshKyberRelease(false)};'}));await page.route('https://**/*',r=>r.abort());await page.route('**/data/patch-notes.json*',r=>r.fulfill({contentType:'application/json',body:'{"notes":[]}'}));
 for(const [shell,style] of [['index.html','next'],['classic.html','modern'],['classic.html','legacy']]){
  await page.goto(`http://127.0.0.1:${server.address().port}/${shell}`);await page.evaluate(style=>{document.documentElement.dataset.uiStyle=style;localStorage.removeItem('droid-archives-snow')},style);
  await page.locator('#snowToggle').waitFor();
  if(await page.locator('#snowToggle').getAttribute('aria-pressed')==='false')await page.locator('#snowToggle').click();
  assert.equal(await page.locator('.seasonal-snow').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
  for(const width of [320,390,1360]){await page.setViewportSize({width,height:800});const box=await page.locator('#snowToggle').boundingBox();assert(box.x>=0&&box.x+box.width<=width+1,`${style} toggle outside viewport ${width}: ${JSON.stringify(box)}`);}
  await page.locator('#snowToggle').click();assert.equal(await page.locator('.seasonal-snow').isVisible(),false);
  await page.reload();assert.equal(await page.locator('#snowToggle').getAttribute('aria-pressed'),'false');
  console.log(shell,style,'toggle, mobile placement, click-through, remembered preference passed');
 }
 const model=await page.evaluate(async()=>{const {SnowBank}=await import('./seasonal-snow.js?v=2026-11-01-snow-v22');const b=new SnowBank(100);b.setLevel(30);const alpha=(x,y)=>b.ctx.getImageData(x,y,1,1).data[3];const coverage=b.coverage();b.wipe({x:20,y:20},{x:30,y:20},4);const after=b.surface(25);const other=alpha(75,20);b.setLevel(0);b.ctx.fillStyle='white';b.ctx.fillRect(20,0,20,5);b.settle();return {height:b.canvas.height,coverage,after,other,floating:alpha(30,0),grounded:alpha(30,29)};});
 assert.equal(model.height,30);assert.equal(model.coverage,1);assert(model.after>0);assert(model.other>0);assert.equal(model.floating,0);assert(model.grounded>0);console.log('30px cap, local wipe collapse and gravity without pointer passed');
 await page.evaluate(()=>window.snowOwnerTest(true));
 await page.locator('#snowTestSettings').evaluate(e=>e.open=true);
 await page.locator('[data-snow-depth]').evaluate(e=>{e.value=30;e.dispatchEvent(new Event('input'))});await page.waitForTimeout(300);
 assert.equal(await page.locator('.seasonal-snow').getAttribute('data-snow-rate'),'reduced');
 assert.equal(await page.locator('.seasonal-snow').getAttribute('data-snowing'),'true');
 await page.locator('[data-snow-depth]').evaluate(e=>{e.value=10;e.dispatchEvent(new Event('input'))});await page.waitForTimeout(300);
 assert.equal(await page.locator('.seasonal-snow').getAttribute('data-snowing'),'true');
 await page.locator('[data-snow-depth]').evaluate(e=>{e.value=0;e.dispatchEvent(new Event('input'))});
 await page.evaluate(()=>{
  const now=Date.now;let clock=now();Date.now=()=>clock;
  Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
  clock+=7200*1000;
  Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));
  Date.now=now;delete document.hidden;
 });
 await page.waitForTimeout(150);
 assert.equal(await page.locator('.seasonal-snow').getAttribute('data-snow-rate'),'reduced','background elapsed time fills the bank and reduces snowfall');
 console.log('Hidden-tab elapsed snow accumulation passed');
 await page.evaluate(()=>window.snowOwnerTest(false));assert.equal(await page.locator('#snowTestSettings').count(),0);
 const builders=await page.evaluate(async()=>{
  const {createSnowBuilders,snowSpritesReady}=await import('./snow-builders.js?v=2026-11-01-builders-counts');await snowSpritesReady;
  let seed=12;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  const completed=[];const b=createSnowBuilders(random,{onComplete:event=>completed.push(event)}),c=document.createElement('canvas').getContext('2d'),bank={canvas:{height:30},surface:()=>0,scoop:()=>90};
  let crewOnSixth=0,maxPeople=0,maxDroids=0,entryTogether=false,nearestExit=true,pairsTogether=true;
  const exiting=new Set();
  for(let i=0;i<16000;i++){
   b.draw(c,{dt:.05,width:1000,height:700,bank,active:true});
   if(i===0)entryTogether=b.workers.slice(0,2).every(w=>w.x<0)&&b.workers.slice(2).every(w=>w.x>1000)&&b.scenes[0].position===0&&b.scenes[1].position===5;
   for(const w of b.workers)if(w.phase==='exit'&&!exiting.has(w.id)){nearestExit&&=w.exitSide===(w.x<500?-1:1);exiting.add(w.id);}
   pairsTogether&&=b.workers[0].scene===b.workers[1].scene&&b.workers[2].scene===b.workers[3].scene;
   maxPeople=Math.max(maxPeople,b.workers.length);maxDroids=Math.max(maxDroids,b.scenes.length);
   crewOnSixth=Math.max(crewOnSixth,b.workers.filter(w=>w.scene===b.scenes[5]&&w.scene).length);
  }
  const result={counted:completed.length,unique:new Set(completed.map(e=>e.id)).size,entryTogether,nearestExit,pairsTogether,positions:b.scenes.map(s=>s.position),maxPeople,maxDroids,crewOnSixth,finished:b.scenes.filter(s=>s.snow>=720).length,exited:b.workers.every(w=>w.phase==='exit'&&(w.x<0||w.x>1000)),outfits:new Set(b.workers.map(w=>JSON.stringify(w.clothes))).size};
  b.reset();return{...result,empty:b.scenes.length,peopleAfterReset:b.workers.length};
 });
 assert.equal(builders.counted,6);assert.equal(builders.unique,6);assert(builders.entryTogether);assert(builders.nearestExit);assert(builders.pairsTogether);assert.equal(new Set(builders.positions).size,6);assert.equal(builders.maxPeople,4);assert.equal(builders.maxDroids,6);assert.equal(builders.crewOnSixth,4);assert.equal(builders.finished,6);assert(builders.exited);assert(builders.outfits>1);assert.equal(builders.empty,0);assert.equal(builders.peopleAfterReset,0);
 console.log('Four persistent builders, six droids, shared final build, varied outfits and exit/reset passed');
 const structures=await page.evaluate(async()=>{
  const {createSnowBuilders,SNOW_DROIDS,snowSpritesReady}=await import('./snow-builders.js?v=2026-11-01-builders-counts');await snowSpritesReady;
  const c=document.createElement('canvas').getContext('2d'),results=[];
  for(let type=0;type<SNOW_DROIDS.length;type++){
   const b=createSnowBuilders(()=> (type+.1)/SNOW_DROIDS.length),bank={canvas:{height:30},surface:()=>0,scoop:(_x,amount)=>amount};
   let localGrowth=false,steps=new Set();
   for(let i=0;i<22000;i++){
    b.draw(c,{dt:.2,width:390,height:200,bank,active:true});
    const model=b.scenes[0]?.structure;if(model){steps.add(model.built);const left=model.cells.filter(x=>x.built&&x.col<11),right=model.cells.filter(x=>x.built&&x.col>=11);if(left.length&&right.length&&Math.min(...left.map(x=>x.row))!==Math.min(...right.map(x=>x.row)))localGrowth=true;}
    if(b.scenes.length===6&&b.scenes.every(s=>s.snow>=720))break;
   }
   results.push({type:SNOW_DROIDS[type],complete:b.scenes.length===6&&b.scenes.every(s=>s.structure.built===s.structure.cells.length),steps:steps.size,localGrowth});
  }
  return results;
 });
 for(const row of structures){assert(row.complete,`${row.type} must finish every supported part`);assert(row.steps>15,`${row.type} needs finer construction steps`);assert(row.localGrowth,`${row.type} should grow unevenly from local deliveries`);}
 console.log('All thirteen snow-droid shapes complete with fine, local construction steps');
 const repairs=await page.evaluate(async()=>{
  const {createSnowBuilders,snowSpritesReady}=await import('./snow-builders.js?v=2026-11-01-builders-counts');await snowSpritesReady;
  const b=createSnowBuilders(()=>.999),c=document.createElement('canvas').getContext('2d');let depth=0;
  const bank={canvas:{height:30},surface:()=>depth,scoop:()=>36,deposit:()=>{}},phases=new Set();let leftScreen=false,carriedBack=false;
  const draw=()=>{b.draw(c,{dt:.2,width:390,height:200,bank,active:true});for(const w of b.workers){phases.add(w.phase);if(w.decoration&&(w.x<0||w.x>390))leftScreen=true;if(w.phase==='bring-tinsel'&&w.x>=0&&w.x<=390)carriedBack=true;}};
  for(let i=0;i<20000;i++){draw();if(b.scenes.length===6&&b.scenes.every(s=>s.tinsel>=1)&&b.workers.every(w=>w.phase==='exit'&&(w.x<0||w.x>390)))break;}
  const decorated=b.scenes.length===6&&b.scenes.every(s=>s.tinsel>=1);let rebuilt=0,maxPeople=4;
  for(let round=0;round<2;round++){
   const target=b.scenes[0],before=target.structure;depth=20;draw();depth=0;
   for(let i=0;i<20000;i++){draw();maxPeople=Math.max(maxPeople,b.workers.length);if(target.structure!==before&&!target.collapsed&&target.tinsel>=1){rebuilt++;break;}}
  }
  return{decorated,leftScreen,carriedBack,phases:[...phases],rebuilt,maxPeople,count:b.scenes.length};
 });
 assert(repairs.decorated);assert(repairs.leftScreen);assert(repairs.carriedBack);assert(repairs.phases.includes('decorate'));assert.equal(repairs.rebuilt,2);assert.equal(repairs.maxPeople,4);assert.equal(repairs.count,6);
 console.log('Offscreen tinsel collection, decoration and repeated replacement jobs passed');
 const burial=await page.evaluate(async()=>{
  const {createSnowBuilders,snowSpritesReady}=await import('./snow-builders.js?v=2026-11-01-builders-counts');await snowSpritesReady;
  let depth=18;const bank={canvas:{height:30},surface:()=>depth,scoop:()=>30,deposit:()=>{}},b=createSnowBuilders(()=>.25),c=document.createElement('canvas').getContext('2d');
  const draw=height=>b.draw(c,{dt:.1,width:390,height,bank,active:true});
  for(let i=0;i<3000;i++){draw(200);if(b.scenes[0]?.structure.built>10)break;}
  const scene=b.scenes[0],initial=scene.groundY;depth=0;draw(200);const buried=scene.groundY,standing=!scene.collapsed;
  draw(250);const resized=scene.groundY;depth=29;draw(250);
  return{initial,buried,standing,resized,collapsed:scene.collapsed};
 });
 assert.equal(burial.initial,burial.buried);assert(burial.standing);assert.equal(burial.resized,burial.initial+50);assert(burial.collapsed);
 console.log('New snow buries the fixed sculpture; only lost original footing collapses it');
 const collapseStages=await page.evaluate(async()=>{
  const {createSnowBuilders,snowSpritesReady}=await import('./snow-builders.js?v=2026-11-01-builders-counts');await snowSpritesReady;
  const c=document.createElement('canvas').getContext('2d'),results=[];
  for(const fraction of [.03,.3,.7,1]){
   let depth=0,deposits=0;const bank={canvas:{height:30},surface:()=>depth,scoop:()=>30,deposit:()=>deposits++},b=createSnowBuilders(()=>.25);
   const draw=()=>b.draw(c,{dt:.1,width:390,height:200,bank,active:true});
   for(let i=0;i<12000;i++){draw();const m=b.scenes[0]?.structure;if(m&&m.built/m.cells.length>=fraction)break;}
   const scene=b.scenes[0],built=scene.structure.built;depth=20;draw();
   const chunks=b.debris.length,old=b.debris.map(bit=>({x:bit.x,y:bit.y}));
   for(let i=0;i<3;i++)draw();
   const moved=b.debris.some((bit,i)=>old[i]&&(bit.x!==old[i].x||bit.y!==old[i].y));
   for(let i=0;i<40;i++)draw();
   results.push({fraction,built,chunks,moved,collapsed:scene.collapsed,deposits,remaining:b.debris.length});
  }
  return results;
 });
 for(const stage of collapseStages){assert(stage.built>0);assert(stage.collapsed);assert(stage.chunks>0);assert(stage.moved);assert(stage.deposits>0);assert.equal(stage.remaining,0);}
 console.log('Early, partial and completed sculptures crumble, animate and deposit snow');
 await page.evaluate(()=>localStorage.removeItem('droid-archives-snow'));await page.emulateMedia({reducedMotion:'reduce'});await page.reload();assert.equal(await page.locator('#snowToggle').getAttribute('aria-pressed'),'false');await page.locator('#snowToggle').click();assert.equal(await page.locator('#snowToggle').getAttribute('aria-pressed'),'true');console.log('Reduced-motion default and explicit opt-in passed');
}finally{await browser.close();server.close()}})().catch(e=>{console.error(e);process.exitCode=1});
