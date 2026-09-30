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

const start=(event,visitor,version='0.5.36-Beta')=>db.query('select public.droid_companion_download_start($1,$2,$3)',[event,visitor,version]);
const downloads=async()=>(await db.query('select public.droid_companion_download_stats() as value')).rows[0].value;
const id=n=>'10000000-0000-0000-0000-'+String(n).padStart(12,'0');
await asUser('','anon');
await start(id(1),id(10));await start(id(1),id(10));
await assert.rejects(downloads,/permission denied/);
await assert.rejects(()=>db.query('select * from public.droid_companion_downloads'),/permission denied/);
await assert.rejects(()=>start(id(8),id(10),'<script>'),/Valid download/);
await asUser('00000000-0000-0000-0000-000000000002');
await start(id(2),id(10));await start(id(3),id(11));
await start(id(4),id(11),'0.5.37-Beta');
await assert.rejects(downloads,/Owner access required/);
await asUser('00000000-0000-0000-0000-000000000001');
let result=await downloads();
assert.equal(result.total,4);assert.equal(result.unique_browsers,2);assert.equal(result.unique_accounts,1);
assert.equal(result.versions.length,2);assert.equal(result.last_24h,4);
assert.equal(result.versions.find(v=>v.version==='0.5.36-Beta').total,3);
assert.equal(result.versions.find(v=>v.version==='0.5.36-Beta').unique_accounts,1);
await db.exec('reset role');await db.exec("update public.droid_companion_downloads set started_at=now()-interval '8 days'");
await asUser('00000000-0000-0000-0000-000000000001');result=await downloads();assert.equal(result.total,4);assert.equal(result.last_7d,0);
console.log('PASS download counts: idempotent events, version breakdown, persistent totals, unique browsers/accounts, time windows and access restrictions');
}finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
