const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('../research/tools/ui-test/node_modules/@electric-sql/pglite');
(async()=>{
 const mod=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('snow-build-stats.js','utf8')).toString('base64'));
 const map=new Map(),storage={get length(){return map.size},key:i=>[...map.keys()][i],getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
 let now=Date.parse('2026-07-01T22:59:00Z'),online=false,remote=new Set();
 const client=()=>({rpc:async(name,args)=>{if(!online)throw Error('offline');if(name==='droid_snow_build_complete'){remote.add(args.event);return{error:null}}return{data:{total:remote.size,today:remote.size,days:{}}}}});
 const a=mod.createSnowCounter({storage,client,now:()=>now}),b=mod.createSnowCounter({storage,client,now:()=>now});
 a.record({id:'one',name:'BB'});a.record({id:'one',name:'BB'});b.record({id:'two',name:'R7'});
 assert.equal(a.snapshot().personal.total,2);assert.equal(b.snapshot().personal.total,2);
 now=Date.parse('2026-07-01T23:01:00Z');assert.equal(a.snapshot().personal.today,0);assert.equal(mod.snowDay(now),'2026-07-02');
 b.record({id:'three',name:'BB'});await a.refresh();assert.equal(a.snapshot().status,'offline');online=true;await a.refresh();await b.refresh();assert.equal(remote.size,3);assert.equal(a.snapshot().personal.total,3);assert.equal(a.snapshot().personal.today,1);
 const reload=mod.createSnowCounter({storage,client,now:()=>now});assert.equal(reload.snapshot().personal.total,3);
 const db=new PGlite();try{
  await db.exec('create role anon; create role authenticated;');const sql=fs.readFileSync('data/supabase-snow-builds.sql','utf8');await db.exec(sql);await db.exec(sql);
  await db.exec('set role anon');const id='00000000-0000-0000-0000-000000000001';
  for(let i=0;i<2;i++)await db.query("select public.droid_snow_build_complete($1,'BB',now())",[id]);
  let data=(await db.query('select public.droid_snow_build_stats() as counts')).rows[0].counts;assert.equal(data.total,1);assert.equal(data.today,1);
  await assert.rejects(()=>db.query('select * from public.droid_snow_builds'),/permission denied/);
  await assert.rejects(()=>db.query("select public.droid_snow_build_complete($1,'PIT',now())",[id]),/Valid snow build/);
  await assert.rejects(()=>db.query("select public.droid_snow_build_complete($1,'BB',now()+interval '1 day')",[id]),/Valid snow build/);
  await db.exec('reset role');await db.exec("update public.droid_snow_builds set completed_at=now()-interval '2 days';set role anon");data=(await db.query('select public.droid_snow_build_stats() as counts')).rows[0].counts;assert.equal(data.total,1);assert.equal(data.today,0);
 }finally{await db.close()}
 console.log('Snow counts: duplicate prevention, browser tabs/reload, UK midnight, offline replay, SQL rerun, public aggregate and private rows passed');
})().catch(e=>{console.error(e);process.exitCode=1});
