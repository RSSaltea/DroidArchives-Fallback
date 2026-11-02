const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('../research/tools/ui-test/node_modules/playwright');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
// Verify the displayed results, not just the trait aggregation helper.
function average(chance,amount,rolls,guaranteed=false){
 let result=0;
 function branch(count,probability){
  if(count===rolls){result+=probability*(1+count*amount);return;}
  const success=guaranteed&&count===1?1:Math.min(1,chance/2**(guaranteed&&count>1?count-1:count));
  result+=probability*(1-success)*(1+count*amount);
  branch(count+1,probability*success);
 }
 branch(0,1);return result;
}
const row=(name,id,tier='Rainbow',station='COMPANION')=>({name,variant:'DEFAULT',qty:1,built:true,preferred:station,trait:{id,tier,rerolls:2}});
const cases=[
 {name:'no traits',owned:[],pickaxe:0},
 {name:'Crit Chance',owned:[row('R2-D2',4)],chance:.25},
 {name:'Crit Amount',owned:[row('R2-D2',5)],amount:.5},
 {name:'two companion traits stack at their recorded tiers',owned:[row('R2-D2',4,'Gold'),row('BB-8',4,'Diamond')],chance:.25},
 {name:'Chopper Crit Expert',owned:[row('CHOPPER',18)],chopper:true,multi:1},
 {name:'Pickaxe Level on an Iconic',owned:[row('R2-D2',1)],pickaxe:10},
 {name:'Pickaxe Level on an ordinary Astromech',owned:[row('R2',1)],pickaxe:13},
 {name:'Overclocked doubles an ordinary Astromech bonus',owned:[row('R2',12)],pickaxe:6},
 {name:'Crit Expert and Pickaxe Level together',owned:[row('CHOPPER',18),row('R2',1)],chopper:true,multi:1,pickaxe:13},
 ...[1,4,5,18].map(id=>({name:`trait ${id} inactive in Lounge`,owned:[row(id===18?'CHOPPER':'R2-D2',id,'Rainbow','LOUNGE')]}))
];
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{for(const shell of ['index.html','classic.html']){
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>{localStorage.setItem('droid-archives-site-help-v1','{"invited":true}');localStorage.setItem('droid-archive-crit-perks','0');localStorage.setItem('droid-archive-crit-pickaxe','29');});
  await page.route('https://**/*',r=>r.abort());
  await page.route('**/data/patch-notes.json*',r=>r.fulfill({json:{notes:[]}}));
  await page.route('**/app.js*',r=>r.fulfill({contentType:'text/javascript',body:source+'\nwindow.critTest={state,route,placements,autoPurchaseEligibleSlots,critMultiplier,critRollBreakdown};'}));
  await page.goto(`http://127.0.0.1:${server.address().port}/${shell}#/crit-calc`);
  await page.waitForFunction(()=>window.critTest?.state.novaShop?.upgrades?.length);
  for(const test of cases){
   await page.evaluate(owned=>{
    const t=window.critTest;t.state.owned=owned;t.state.iconicTraits={};t.state.rebirth=40;t.state.party={};
    t.state.novaUpgrades={'critical-chance':10,'critical-amount':8,'multi-crit':1,'companion-slot':1,'lounge-slot':12};
    t.state.autoPurchaseSlots=true;t.autoPurchaseEligibleSlots();t.route();
   },test.owned);
   const chance=.51+(test.chopper?.5:0)+(test.chance||0),amount=1.3+(test.chopper?.5:0)+(test.amount||0),rolls=2+(test.multi||0);
   const base=1.2*(30+(test.pickaxe||0)),multiplier=average(chance,amount,rolls,Boolean(test.multi));
   assert.deepEqual(await page.locator('.crit-stats .stat>strong').allTextContents(),[base.toFixed(1)+'s',(base*multiplier).toFixed(1)+'s',(chance*100).toFixed(0)+'%',(amount*100).toFixed(0)+'%'],shell+': '+test.name);
   assert.equal(await page.locator('#critBreakdown tbody tr').count(),rolls,test.name);
   // Every next-rank preview must include the same active traits.
   const options=[['Critical Chance',chance+.05,amount,rolls,360],['Critical Amount',chance,amount+.1,rolls,510],['Multi Crit',chance,amount,rolls+1,800]].map(([name,c,a,r,cost])=>({name,hit:base*average(c,a,r,Boolean(test.multi)),gain:average(c,a,r,Boolean(test.multi))/multiplier-1,cost}));
   for(const option of options){
    const cells=await page.locator('.crit-table').first().locator('tbody tr').filter({has:page.locator('th',{hasText:option.name})}).locator('td').allTextContents();
    assert.equal(cells[2],option.hit.toFixed(1)+'sfrom '+(base*multiplier).toFixed(1)+'s',test.name+' '+option.name);
    assert.equal(cells[3],'+'+(option.gain*100).toFixed(2)+'%',test.name+' '+option.name);
   }
   options.sort((a,b)=>b.gain/b.cost-a.gain/a.cost);
   assert((await page.locator('.crit-best').innerText()).includes('Best next buy: '+options[0].name),test.name);
  }
  for(const chance of [0,.5,1,1.5,2,4])for(const rolls of [1,2,3,5]){
   const result=await page.evaluate(({chance,rolls})=>window.critTest.critMultiplier(chance,1.3,rolls,true),{chance,rolls});
   assert(Math.abs(result-average(chance,1.3,rolls,true))<1e-10,`Crit Expert ${chance}/${rolls}`);
  }
  assert.deepEqual(errors,[]);console.log(shell+': all companion trait totals, inactive traits and upgrade recommendations passed');
  await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
