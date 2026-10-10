const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const droids=JSON.parse(fs.readFileSync('data/droids.json','utf8'));
test('v1.34 Gonk catalogue has usable stats, portraits and acquisition rules',()=>{
 const expected=[['EG-58','WORKER','RARE',70,160000,152.85],['EGL','WORKER','EPIC',300,2700000,556.5],['KT','WORKER','EPIC',450,4200000,819.75],['MPH','ASTROMECH','EPIC',690,6600000,1240.95],['JO9-4MN','WORKER','LEGENDARY',1300,28000000,2311.5],['PLNK','WORKER','LEGENDARY',1400,31000000,2487],['ECG','ASTROMECH','MYTHIC',6200,240000000,6480]];
 for(const [name,type,rarity,income,cost,seconds] of expected){const d=droids.find(d=>d.name===name);assert.equal(d.type,type);assert.equal(d.rarity,rarity);assert.equal(d.variants.DEFAULT.income,income);assert.equal(d.variants.DEFAULT.cost,cost);assert.equal(d.variants.DEFAULT.craftingSeconds,seconds);assert.equal(Object.keys(d.variants).length,11);assert.equal(d.acquisition.method,'sandcrawler');assert(fs.existsSync(d.portraits.DEFAULT));assert.equal(d.variants.KYBER_PURPLE.income,Math.round(d.variants.KYBER.income*3.6*1e6)/1e6);}
 const wg=droids.find(d=>d.name==='WG-22');assert.equal(wg.type,'BATTLE');assert.equal(wg.special.incomePercent,.15);assert.equal(wg.acquisition.method,'event');assert.deepEqual(Object.keys(wg.variants),['DEFAULT']);assert.match(wg.special.passive,/Flawless/);
 assert.equal(droids.find(d=>d.name==='R2').variants.DEFAULT.income,480);assert.equal(droids.find(d=>d.name==='B2 HEAVY').variants.DEFAULT.income,360);
});
test('Cycle 6 references existing droids and storage exposes all nine prices',()=>{
 const index=JSON.parse(fs.readFileSync('data/rebirth-cycles/index.json','utf8'));assert.equal(index.cycles.length,6);
 const cycle=JSON.parse(fs.readFileSync('data/rebirth-cycles/cycle-6.json','utf8'));assert.equal(cycle.length,40);
 for(const r of cycle)for(const req of r.requiredDroids)assert(droids.find(d=>d.name===req.droidName)?.variants[req.variant],JSON.stringify(req));
 const nova=JSON.parse(fs.readFileSync('data/nova-shop.json','utf8'));assert.deepEqual(nova.upgrades.find(u=>u.id==='blueprint-storage').levels.map(l=>l.cost),[10,75,150,250,350,500,650,800,1000]);
});
test('Gonk points distinguish personal pass bonuses, activation colours and invalid hand-ins',async()=>{
 const {gonkHandInPoints,GONK_REWARDS}=await import('../gonk-army.js');
 assert.equal(gonkHandInPoints('GONK'),1);assert.equal(gonkHandInPoints('ECG','KYBER_PURPLE'),12);assert.equal(gonkHandInPoints('ECG','KYBER_GREEN',true),24);assert.equal(gonkHandInPoints('WG-22'),0);assert.equal(gonkHandInPoints('FUS-3'),0);
 assert.deepEqual(GONK_REWARDS.map(r=>r.points),[200,275,400,475,600,675]);
});
