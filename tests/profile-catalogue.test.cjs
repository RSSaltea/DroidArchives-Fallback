const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {ensureProfileCatalogue}=require('../profile-catalogue.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const catalogue=require('../data/droids.json');
test('stale mobile catalogue refreshes EGL without changing saved copies, traits or blueprints',async()=>{
 const profile={owned:[{name:'EGL',variant:'DIAMOND',qty:2,trait:{id:9,tier:'Gold'}}],blueprints:[{name:'EGL',variant:'GOLD'}],droidex:[{name:'EGL',variant:'RAINBOW'}]};
 const original=JSON.stringify(profile);let requests=0;
 const fresh=await ensureProfileCatalogue(profile,{droids:catalogue.filter(d=>d.name!=='EGL'),refresh:async()=>{requests++;return catalogue;}});
 assert(fresh.some(d=>d.name==='EGL'));assert.equal(requests,1);assert.equal(JSON.stringify(profile),original);
 await ensureProfileCatalogue(profile,{droids:fresh,refresh:()=>assert.fail('unnecessary refresh')});
});
test('unavailable or still-old catalogue keeps profile intact and gives an actionable error',async()=>{
 const profile={owned:[{name:'EGL',variant:'DEFAULT',qty:1}]};
 for(const refresh of [async()=>{throw Error('offline')},async()=>[],async()=>({})]){
  await assert.rejects(ensureProfileCatalogue(profile,{droids:[],refresh}),/cloud save has not been changed/);
  assert.equal(profile.owned[0].name,'EGL');
 }
});
test('cloud restore blocks writes until catalogue recovery and profile application succeed',async()=>{
 let fail=true,applied=0,cached=0;
 const profile={data:{owned:[{name:'EGL',variant:'DEFAULT',qty:1}]}};
 const context=vm.createContext({state:{cloud:{user:{id:'test'},enabled:true}},cloudSaveTimer:null,clearTimeout,
  supabaseClient:{from:()=>({select(){return this},eq(){return this},async maybeSingle(){return {data:{}}}})},supabaseTable:()=>'',
  rowToCloudDoc:()=>({profiles:[profile],activeProfileId:'test'}),activeCloudProfile:()=>profile,
  refreshProfileCatalogue:async()=>{if(fail)throw Error('catalogue unavailable')},applyProfileData:()=>applied++,
  renderCloudHeader:()=>{},cacheCloudDocLocally:()=>cached++,saveLocal:()=>{},subscribeCloudChanges:()=>{},loadGroupWorkspace:async()=>{},route:()=>{}});
 for(const name of ['loadSupabaseProfiles','writeSupabaseDoc','cloudConnected']){
  const line=source.split('\n').find(line=>line.startsWith(`async function ${name}(`)||line.startsWith(`function ${name}(`));vm.runInContext(line,context);
 }
 await assert.rejects(context.loadSupabaseProfiles(),/catalogue unavailable/);
 assert.equal(applied,0);assert.equal(cached,0);assert.equal(context.cloudConnected(),false);
 await assert.rejects(context.writeSupabaseDoc(),/blocked until/);
 fail=false;await context.loadSupabaseProfiles();assert.equal(applied,1);assert.equal(cached,1);assert.equal(context.cloudConnected(),true);
});
