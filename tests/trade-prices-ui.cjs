const assert=require('node:assert/strict'),{chromium}=require('../tools/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/trading.css');
  await page.evaluate(async()=>{
   document.head.innerHTML='<link rel="stylesheet" href="/trading.css">';document.body.innerHTML='<main></main>';location.hash='#/trading/listing';
   const {tradingPage}=await import('/trading-page.js');const droids=await fetch('/data/droids.json').then(r=>r.json());
   const listing={id:'listing',mine:false,status:'open',giving:[{name:'MOUSE',variant:'GOLD'}],criteria:[],tags:[],offers:[{id:'offer',status:'pending',mine:true,droid:[{name:'MOUSE',variant:'DEFAULT'}],receiving:[0],messages:[]}]};
   tradingPage({host:document.querySelector('main'),droids,getUnits:()=>[],picture:()=>'',client:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'test'}}}})},rpc:async()=>({data:listing})})});
  });
  await page.locator('[data-thread-cost]').waitFor();
  assert.match(await page.locator('[data-thread-cost]').innerText(),/You \(offering player\) pay: 2,850 credits · 10 upgrade chips/);
  assert.match(await page.locator('.trade-item-value').first().innerText(),/3,800 credits · 10 upgrade chips/);
  await page.getByRole('button',{name:'I am interested'}).click();
  await page.locator('[name=receiving]').check();
  await page.locator('[data-mode=search]').click();
  await page.locator('[data-search]').fill('MOUSE');
  await page.getByRole('button',{name:/^MOUSE,/}).click();
  await page.locator('[data-confirm]').check();await page.locator('[data-use]').click();
  assert.match(await page.locator('[data-offer-cost]').innerText(),/You pay: 2,850 credits · 10 upgrade chips/);
  await page.locator('[name=receiving]').uncheck();
  assert.match(await page.locator('[data-offer-cost]').innerText(),/Choose the two droids/);
  assert.equal(await page.locator('[data-offer-cost]').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: existing offer prices, correct payer perspective, dynamic offer selections, clearing invalid comparisons and mobile layout.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
