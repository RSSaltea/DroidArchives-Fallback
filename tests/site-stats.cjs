const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let PGlite;try{({PGlite}=require('@electric-sql/pglite'));}catch{({PGlite}=require('../research/tools/ui-test/node_modules/@electric-sql/pglite'));}
(async()=>{
const db=new PGlite();
try{
await db.exec(`create role anon;create role authenticated;create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,is_anonymous boolean default false);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
insert into auth.users values
('00000000-0000-0000-0000-000000000001','xraffo@gmail.com',now(),null,false),
('00000000-0000-0000-0000-000000000002','other@example.com',now(),null,false),
('00000000-0000-0000-0000-000000000003','pending@example.com',null,null,false);`);
const migration=fs.readFileSync(path.join(__dirname,'../data/supabase-site-stats.sql'),'utf8');
await db.exec(migration);await db.exec(migration);
const asUser=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);};
const heartbeat=visitor=>db.query('select public.droid_site_heartbeat($1)',[visitor]);
const stats=async()=>(await db.query('select public.droid_site_stats() as value')).rows[0].value;
await asUser('','anon');await heartbeat('10000000-0000-0000-0000-000000000001');
await assert.rejects(stats,/permission denied/);
await assert.rejects(()=>db.query('select * from public.droid_site_visitors'),/permission denied/);
await asUser('00000000-0000-0000-0000-000000000002');
await heartbeat('10000000-0000-0000-0000-000000000002');await heartbeat('10000000-0000-0000-0000-000000000003');
await assert.rejects(stats,/Owner access required/);
await assert.rejects(()=>db.query('select * from public.droid_site_account_activity'),/permission denied/);
await asUser('00000000-0000-0000-0000-000000000001');
let result=await stats();assert.equal(result.signed_up,3);assert.equal(result.confirmed,2);assert.equal(result.browsers_now,3);assert.equal(result.accounts_now,1,'two devices count as one signed-in account');
await db.exec('reset role');
await db.exec("update public.droid_site_visitors set last_seen=now()-interval '2 days' where visitor_id='10000000-0000-0000-0000-000000000001'");
await asUser('00000000-0000-0000-0000-000000000001');result=await stats();assert.equal(result.browsers_now,2);assert.equal(result.browsers_24h,2);assert.equal(result.browsers_7d,3);
await db.exec('reset role');
await db.exec("update public.droid_site_visitors set last_seen=now()-interval '30 minutes' where visitor_id='10000000-0000-0000-0000-000000000002'; update public.droid_site_visitors set last_seen=now()-interval '61 minutes' where visitor_id='10000000-0000-0000-0000-000000000003'; update public.droid_site_account_activity set last_seen=now()-interval '30 minutes'");
await asUser('00000000-0000-0000-0000-000000000001');result=await stats();assert.equal(result.browsers_now,0);assert.equal(result.browsers_1h,1);assert.equal(result.browsers_24h,2);assert.equal(result.accounts_now,0);assert.equal(result.accounts_1h,1);
await db.exec('reset role');await db.exec("update public.droid_site_account_activity set last_seen=now()-interval '61 minutes'");
await asUser('00000000-0000-0000-0000-000000000001');result=await stats();assert.equal(result.accounts_1h,0);assert.equal(result.accounts_24h,1);
// Layout reporting is account-scoped, updates immediately on switches, and stays owner-only.
await asUser('00000000-0000-0000-0000-000000000002');
await db.query('select public.droid_site_heartbeat($1,$2)',['10000000-0000-0000-0000-000000000002','modern']);
await assert.rejects(()=>db.query('select public.droid_site_heartbeat($1,$2)',['10000000-0000-0000-0000-000000000002','invented']),/Invalid site layout/);
await asUser('00000000-0000-0000-0000-000000000001');result=await stats();assert.equal(result.layouts.find(x=>x.layout==='modern').accounts_now,1);
await asUser('00000000-0000-0000-0000-000000000002');
await db.query('select public.droid_site_heartbeat($1,$2)',['10000000-0000-0000-0000-000000000003','classic']);
await asUser('00000000-0000-0000-0000-000000000001');result=await stats();assert.equal(result.layouts.find(x=>x.layout==='modern').accounts_now,0);assert.equal(result.layouts.find(x=>x.layout==='classic').accounts_now,1);
await db.exec('reset role');await db.exec("update public.droid_site_account_activity set last_seen=now()-interval '30 minutes'");
await asUser('00000000-0000-0000-0000-000000000001');result=await stats();assert.equal(result.layouts.find(x=>x.layout==='classic').accounts_now,0);assert.equal(result.layouts.find(x=>x.layout==='classic').accounts_1h,1);
for(const period of ['accounts_now','accounts_1h','accounts_24h','accounts_7d'])assert.equal(result.layouts.reduce((n,row)=>n+row[period],0),result[period]);
await asUser('','anon');await db.query('select public.droid_site_heartbeat($1,$2)',['10000000-0000-0000-0000-000000000004','legacy']);
await asUser('00000000-0000-0000-0000-000000000001');result=await stats();assert.equal(result.layouts.find(x=>x.layout==='legacy').accounts_now,0,'anonymous visitors are excluded');
await asUser('00000000-0000-0000-0000-000000000002');await heartbeat('10000000-0000-0000-0000-000000000003');
await asUser('00000000-0000-0000-0000-000000000001');result=await stats();assert.equal(result.layouts.find(x=>x.layout==='unknown').accounts_now,1,'old clients are not misclassified');
await db.exec('reset role');await db.exec("update auth.users set email_confirmed_at=null where email='xraffo@gmail.com'");await asUser('00000000-0000-0000-0000-000000000001');await assert.rejects(stats,/Owner access required/);
console.log('PASS database: idempotent migration, aggregate counts, time windows, deduplication, anonymous/other/unverified owner denied, raw tables denied');
}finally{await db.close();}
const {startSiteActivity,currentSiteLayout}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(__dirname,'../site-stats.js'),'utf8')).toString('base64'));
for(const [style,expected] of [['next','modern'],['modern','classic'],['legacy','legacy'],[undefined,null]])assert.equal(currentSiteLayout({documentElement:{dataset:{uiStyle:style}}}),expected);
const handlers={},doc={visibilityState:'visible',addEventListener:(e,fn)=>handlers[e]=fn,removeEventListener:()=>{}},win={addEventListener:(e,fn)=>handlers[e]=fn,removeEventListener:()=>{},setInterval:()=>1,clearInterval:()=>{}};
let calls=0;const storage={getItem:()=>null,setItem:()=>{}};
const tracker=startSiteActivity({client:()=>({rpc:async()=>{calls++;return {error:null};}}),storage,doc,win});
await new Promise(r=>setImmediate(r));assert.equal(calls,1);await tracker.pulse();assert.equal(calls,1,'idle tabs do not keep recording activity');handlers.scroll();await tracker.pulse();assert.equal(calls,2);doc.visibilityState='hidden';handlers.keydown();await tracker.pulse();assert.equal(calls,2);doc.visibilityState='visible';await tracker.pulse();assert.equal(calls,3);tracker.stop();
let layout='classic',reported=[];
const fallback=startSiteActivity({client:()=>({rpc:async(name,args)=>{reported.push(args);return {error:'site_layout' in args?{code:'PGRST202'}:null}}}),storage,doc,win,getLayout:()=>layout});
await new Promise(r=>setImmediate(r));assert.equal(reported[0].site_layout,'classic');assert(!('site_layout' in reported[1]));fallback.stop();
let changed;win.MutationObserver=class{constructor(fn){changed=fn}observe(){}disconnect(){}};doc.documentElement={dataset:{uiStyle:'modern'}};reported=[];
const switching=startSiteActivity({client:()=>({rpc:async(name,args)=>{reported.push(args);return {error:null}}}),storage,doc,win});
await new Promise(r=>setImmediate(r));doc.documentElement.dataset.uiStyle='legacy';changed();await new Promise(r=>setImmediate(r));assert.deepEqual(reported.map(x=>x.site_layout),['classic','legacy']);switching.stop();
console.log('PASS layout labels, style switches and old database fallback');
console.log('PASS activity: first visit recorded, idle and hidden tabs excluded, interaction resumes tracking');
})().catch(e=>{console.error(e);process.exitCode=1});
