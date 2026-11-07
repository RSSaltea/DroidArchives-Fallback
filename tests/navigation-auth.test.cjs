const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('app.js','utf8');
test('auth focus and token refresh do not reload the profile; a different account does',async()=>{
 let callback,loads=0,verifications=0;
 const state={cloud:{user:{id:'one'},doc:{profiles:[]},enabled:false}};
 const client={auth:{onAuthStateChange:fn=>callback=fn}};
 const context={state,clearTradingSession(){},supabaseReady:()=>true,supabaseConfig:{},window:{supabase:{createClient:()=>client}},setTimeout:fn=>fn(),verifyKyberPreview:()=>verifications++,loadSupabaseProfiles:async()=>loads++,renderCloudHeader(){},renderBaseSidebar(){},saveLocal(){},showPasswordUpdateModal(){}};
 vm.createContext(context);vm.runInContext(source.split('\n').find(l=>l.startsWith('async function initSupabase()')),context);await context.initSupabase();
 callback('SIGNED_IN',{user:{id:'one'}});callback('SIGNED_IN',{user:{id:'one'}});callback('TOKEN_REFRESHED',{user:{id:'one'}});
 assert.equal(loads,0);assert.equal(verifications,0);
 callback('SIGNED_IN',{user:{id:'two'}});await Promise.resolve();assert.equal(loads,1);assert.equal(verifications,1);
});
test('owner re-verification never temporarily removes owner privileges',async()=>{
 const start=source.indexOf('async function verifyKyberPreview()'),end=source.indexOf('\nfunction refreshKyberRelease',start);
 const changes=[];const context={previewCheck:0,kyberPreviewVerified:true,state:{cloud:{session:{}}},supabaseClient:{auth:{getUser:async()=>({data:{user:{}}})}},isKyberPreviewUser:()=>true};
 context.refreshKyberRelease=()=>changes.push(context.kyberPreviewVerified);vm.createContext(context);vm.runInContext(source.slice(start,end),context);await context.verifyKyberPreview();assert.deepEqual(changes,[true]);
});

test('cloud connection startup is shared and awaited before use',async()=>{
 let release,configs=0,inits=0;const pending=new Promise(r=>release=r);
 const context={supabaseClient:null,cloudStartupPromise:null,loadSupabaseConfig:async()=>{configs++;await pending;},initSupabaseSafe:async()=>{inits++;context.supabaseClient={};}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function ensureCloudReady()'),source.indexOf('\n}',source.indexOf('function ensureCloudReady()'))+2),context);
 const a=context.ensureCloudReady(),b=context.ensureCloudReady();assert.equal(a,b);assert.equal(configs,1);assert.equal(inits,0);release();await a;assert.equal(inits,1);await context.ensureCloudReady();assert.equal(inits,1);
 assert(!source.includes('Cloud save is not configured'));assert(!source.includes('Add your Supabase URL and anon key'));
});
test('rebirth reservation keeps one highest-quality copy, includes fusion components and ignores past requirements',()=>{
 const units=[{name:'B2',variant:'GOLD',source:0,unit:0},{name:'B2',variant:'SCOURGE',source:1,unit:0},{name:'B2',variant:'SCOURGE',source:1,unit:1},{name:'R7',variant:'GOLD',source:2,unit:0},{name:'FUSION',variant:'GOLD',source:3,unit:0}];
 const context={futureRequirements:()=>[{droidName:'B2'},{droidName:'GONK'},{droidName:'KX'}],placements:()=>({placed:units,overflow:[]}),rebirthNames:n=>n==='FUSION'?['FUSION','GONK','KX']:[n],rowIsBuilding:()=>false,variantRank:v=>v==='SCOURGE'?10:1};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function tradeReservedCopies()'),source.indexOf('function tradeRebirthNeeds()')),context);
 assert.deepEqual([...context.tradeReservedCopies()],['1:0','3:0']);
});

test('trading keeps highest variant and working copy on ties; surplus has no rebirth warning',()=>{
 const units=[{name:'B2-RP',variant:'SCOURGE',source:0,unit:0,station:'LOUNGE'},{name:'B2-RP',variant:'SCOURGE',source:1,unit:0,station:'BATTLE'},{name:'B2-RP',variant:'BESKAR',source:2,unit:0,station:'BATTLE'}];
 const context={futureRequirements:()=>[{droidName:'B2-RP',variant:'BESKAR',at:38}],placements:()=>({placed:units,overflow:[]}),rebirthNames:n=>[n],rowIsBuilding:()=>false,variantRank:v=>v==='SCOURGE'?10:4};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function tradeRebirthWarning('),source.indexOf('function tradeRebirthNeeds()')),context);
 assert.deepEqual([...context.tradeReservedCopies()],['1:0']);
 assert.equal(context.tradeRebirthWarning(units[0]),'');assert.equal(context.tradeRebirthWarning(units[2]),'');assert.equal(context.tradeRebirthWarning(units[1]),'Needed for rebirth 38');
 assert.equal(context.tradeRebirthWarning({name:'B2-RP',baseCopy:{source:0,unit:0}}),'');
 units[1].variant='BESKAR';assert.deepEqual([...context.tradeReservedCopies()],['0:0']);
});
