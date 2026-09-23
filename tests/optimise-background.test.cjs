const {test}=require('node:test');
const assert=require('node:assert/strict');
const pause=()=>new Promise(resolve=>setTimeout(resolve,15));
test('background generations cancel stale workers, debounce edits and retain only current results',async()=>{
 const {createOptimiseBackground}=await import('../optimise-background.js');
 const workers=[],results=[];
 const createWorker=()=>{const w={postMessage(data){this.job=data},terminate(){this.stopped=true}};workers.push(w);return w;};
 const manager=createOptimiseBackground({createWorker,onResult:(data,stamp)=>results.push([data.route,stamp]),delay:1,budget:1000});
 manager.update('a',{});await pause();const first=workers[0];
 manager.update('b',{});manager.update('c',{});await pause();
 assert(first.stopped);assert.equal(workers.length,2);
 first.onmessage({data:{id:first.job.id,type:'result',route:'stale'}});
 const current=workers[1];current.onmessage({data:{id:current.job.id,type:'result',route:'best'}});
 assert.deepEqual(results,[['best','c']]);
 manager.update('c',{});await pause();assert.equal(workers.length,2,'unchanged snapshots do not restart searches');
 manager.cancel();current.onmessage({data:{id:current.job.id,type:'result',route:'cancelled'}});
 assert.equal(results.length,1);
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
