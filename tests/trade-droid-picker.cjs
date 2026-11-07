const assert=require('node:assert/strict');
const {chromium}=require('../tools/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.TEST_BROWSER_CHANNEL||'msedge'});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto((process.env.TEST_SITE_URL||'http://127.0.0.1:8765')+'/trading.css');
 await page.evaluate(async()=>{
  document.head.innerHTML='<link rel="stylesheet" href="/trading.css">';document.body.innerHTML='<main id="fixture"></main>';
  const {mountTradeDroidPicker}=await import('/trade-droid-picker.js');
  const droids=await fetch('/data/droids.json').then(r=>r.json());
  window.units=[{name:'R7',variant:'BESKAR',source:0,unit:0,station:'ASTROMECH',slot:0,trait:{id:9,tier:'Gold'}},{name:'R7',variant:'GOLD',source:1,unit:0,station:'LOUNGE',slot:2,trait:{id:0,tier:'Default'}},{name:'BB-8',variant:'DEFAULT',source:2,unit:0,station:'COMPANION',slot:0},{name:'GONK',variant:'DEFAULT',source:3,unit:0,station:'BUILD',slot:0,built:false}];
  window.before=JSON.stringify(window.units);window.result=null;
  mountTradeDroidPicker(document.querySelector('#fixture'),{droids,units:window.units,reservedCopies:new Set(['0:0']),onSelect:s=>window.result=s});
 });
 assert.equal(await page.locator('.trade-droid-card').count(),2);
 assert.equal(await page.locator('.trade-droid-card:disabled').count(),0);
 await page.locator('[data-search]').fill('mission efficiency');
 assert.equal(await page.locator('.trade-droid-card').count(),1);
 await page.locator('.trade-droid-card').click();
 assert.equal(await page.locator('[data-use]').isDisabled(),true);
 await page.locator('[data-confirm]').check();await page.locator('[data-use]').click();
 let result=await page.evaluate(()=>window.result);
 assert.equal(result.variant,'BESKAR');assert.equal(result.trait.id,9);assert.equal(result.trait.tier,'Gold');assert.equal(result.baseCopy.source,0);
 await page.locator('[data-search]').fill('');
 await page.locator('[data-reserve]').check();
 assert.equal(await page.locator('.trade-droid-card').count(),1);
 assert((await page.locator('.trade-droid-card').textContent()).includes('GOLD'));
 assert.equal(await page.locator('[data-selection]').isVisible(),false);
 await page.locator('[data-search]').fill('mission efficiency');
 assert.equal(await page.locator('.trade-droid-card').count(),0);
 await page.locator('[data-reserve]').uncheck();
 assert.equal(await page.locator('.trade-droid-card').count(),1);
 await page.locator('[data-mode=search]').click();await page.locator('[data-search]').fill('GONK');
 await page.getByRole('button',{name:/^GONK,/}).click();
 await page.locator('[data-variant]').selectOption('SCOURGE');await page.locator('[data-trait]').selectOption('0');await page.locator('[data-tier]').selectOption('Rainbow');
 assert.equal(await page.locator('[data-use]').isDisabled(),true);
 await page.locator('[data-confirm]').check();await page.locator('[data-use]').click();
 result=await page.evaluate(()=>window.result);assert.equal(result.name,'GONK');assert.equal(result.variant,'SCOURGE');assert.equal(result.trait.id,0);assert.equal(result.trait.tier,'Rainbow');assert.equal(result.baseCopy,undefined);
 assert.equal(await page.evaluate(()=>JSON.stringify(window.units)===window.before),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('[data-search]').fill('<img src=x onerror=alert(1)>');assert.equal(await page.locator('.trade-droid-card').count(),0);
 await page.screenshot({path:process.env.TEMP+'/trade-picker-mobile-test.png'});
 console.log('PASS: per-copy traits, search, blocked Iconics/builds, manual variant/trait, confirmation reset, immutable Base and mobile width.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

