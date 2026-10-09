const {test}=require('node:test');
const assert=require('node:assert/strict');
const pause=()=>new Promise(resolve=>setTimeout(resolve,15));
test('completed layout comparisons extend the watchdog but never the hard layout limit',async(t)=>{
 const {createOptimiseBackground}=await import('../optimise-background.js');
 t.mock.timers.enable({apis:['setTimeout']});
 let worker;const updates=[],statuses=[];
 const manager=createOptimiseBackground({createWorker:()=>worker={postMessage(x){this.job=x},terminate(){this.stopped=true}},onProgress:x=>updates.push(x),onStatus:x=>statuses.push(x),delay:0,budget:100,layoutBudget:250});
 manager.update('slow',{layout:{}});t.mock.timers.tick(0);
 const progress=n=>worker.onmessage({data:{id:worker.job.id,type:'progress',progress:{phase:'layout',comparisons:n}}});
 t.mock.timers.tick(80);progress(1);t.mock.timers.tick(80);assert(!worker.stopped);
 progress(2);progress(2);assert.equal(updates.length,2,'duplicate progress is ignored');
 t.mock.timers.tick(80);progress(3);t.mock.timers.tick(11);
 assert(worker.stopped,'hard ceiling still stops a progressing calculation');assert.equal(statuses.at(-1),'budget');
 progress(4);assert.equal(updates.length,3,'late progress cannot revive a stopped worker');manager.cancel();
});
test('Search longer supplies a larger bounded budget without changing the default',async(t)=>{
 const {createOptimiseBackground}=await import('../optimise-background.js');t.mock.timers.enable({apis:['setTimeout']});
 let worker;const manager=createOptimiseBackground({createWorker:()=>worker={postMessage(){},terminate(){this.stopped=true}},delay:0,budget:100});
 manager.update('longer',{}, {budget:200});t.mock.timers.tick(0);t.mock.timers.tick(101);assert(!worker.stopped);t.mock.timers.tick(100);assert(worker.stopped);
 manager.update('next',{});t.mock.timers.tick(0);t.mock.timers.tick(101);assert(worker.stopped,'next normal job uses the original budget');manager.cancel();
});
test('background generations cancel stale workers, debounce edits and retain only current results',async()=>{
 const {createOptimiseBackground}=await import('../optimise-background.js');
 const workers=[],results=[],prepared=[];
 const createWorker=()=>{const w={postMessage(data){this.job=data},terminate(){this.stopped=true}};workers.push(w);return w;};
 const manager=createOptimiseBackground({createWorker,onPrepared:(data,stamp)=>prepared.push([data.prepared,stamp]),onResult:(data,stamp)=>results.push([data.route,stamp]),delay:1,budget:1000});
 manager.update('a',{});await pause();const first=workers[0];
 manager.update('b',{});manager.update('c',{});await pause();
 assert(first.stopped);assert.equal(workers.length,2);
 first.onmessage({data:{id:first.job.id,type:'result',route:'stale'}});
 first.onmessage({data:{id:first.job.id,type:'prepared',prepared:'stale layout'}});
 const current=workers[1];current.onmessage({data:{id:current.job.id,type:'result',route:'best'}});
 current.onmessage({data:{id:current.job.id,type:'prepared',prepared:'current layout'}});
 assert.deepEqual(results,[['best','c']]);
 assert.deepEqual(prepared,[['current layout','c']]);
 manager.update('c',{});await pause();assert.equal(workers.length,2,'unchanged snapshots do not restart searches');
 manager.cancel();current.onmessage({data:{id:current.job.id,type:'result',route:'cancelled'}});
 current.onmessage({data:{id:current.job.id,type:'prepared',prepared:'cancelled layout'}});
 assert.equal(results.length,1);
 assert.equal(prepared.length,1);
});
test('deadline terminates computation and rejects late messages without discarding an earlier result',async()=>{
 const {createOptimiseBackground}=await import('../optimise-background.js');
 let worker;const results=[],statuses=[];
 const manager=createOptimiseBackground({createWorker:()=>worker={postMessage(x){this.job=x},terminate(){this.stopped=true}},onResult:x=>results.push(x),onStatus:x=>statuses.push(x),delay:0,budget:25});
 manager.update('base',{});await pause();
 worker.onmessage({data:{id:worker.job.id,type:'result',route:'valid'}});
 await new Promise(resolve=>setTimeout(resolve,30));assert(worker.stopped);assert(statuses.includes('budget'));
 worker.onmessage({data:{id:worker.job.id,type:'result',route:'late'}});assert.equal(results.length,1);manager.cancel();
});

test('layout completion starts a full route budget, once per generation',async(t)=>{
 const {createOptimiseBackground}=await import('../optimise-background.js');
 t.mock.timers.enable({apis:['setTimeout']});
 let worker;let preparations=0;
 const manager=createOptimiseBackground({createWorker:()=>worker={postMessage(x){this.job=x},terminate(){this.stopped=true}},onPrepared:()=>preparations++,onResult:()=>{},delay:0,budget:100});
 manager.update('base',{});t.mock.timers.tick(0);
 t.mock.timers.tick(80);
 worker.onmessage({data:{id:worker.job.id,type:'prepared',prepared:{}}});
 t.mock.timers.tick(80);assert(!worker.stopped,'layout does not consume the route budget');
 worker.onmessage({data:{id:worker.job.id,type:'prepared',prepared:{}}});
 assert.equal(preparations,1,'duplicate preparation cannot extend the deadline');
 t.mock.timers.tick(21);assert(worker.stopped);manager.cancel();
});
