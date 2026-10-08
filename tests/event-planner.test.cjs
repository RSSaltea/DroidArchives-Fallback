const {test}=require('node:test'),assert=require('node:assert/strict');
test('Treat visits expire at UTC midnight while inventory survives',async()=>{
 const {EVENT_ID,TREAT_DAY_MS,treatDay,eventRoundStatus,normaliseEventProgress}=await import('../event-data.js');
 const start=Date.UTC(2026,9,8,22),midnight=Date.UTC(2026,9,9),data={eventId:EVENT_ID,visitDay:treatDay(start),baseVisits:[true,true],outskirtsVisits:[true],treats:30,wishlist:['bat-hat'],owned:['witch-hat']};
 assert.equal(eventRoundStatus(data,start).remainingMs,2*3600000);
 assert.equal(eventRoundStatus(data,midnight-1).ready,false);
 assert.equal(eventRoundStatus(data,midnight).ready,true);
 assert.equal(eventRoundStatus(data,midnight).remainingMs,TREAT_DAY_MS);
 assert.equal(eventRoundStatus(data,start).baseTreats,6);
 assert.equal(eventRoundStatus(data,midnight).completed,0);
 const next=normaliseEventProgress(data,midnight);
 assert.equal(next.treats,30);assert.deepEqual(next.wishlist,['bat-hat']);assert.deepEqual(next.owned,['witch-hat']);
 assert.equal(eventRoundStatus(data,midnight+3*TREAT_DAY_MS).completed,0);
 assert.equal(eventRoundStatus(undefined,start).ready,false);
});
test('legacy reminders migrate without retaining a rolling deadline',async()=>{
 const {EVENT_ID,treatDay,normaliseEventProgress}=await import('../event-data.js');
 const start=Date.UTC(2026,9,8,22),data={eventId:EVENT_ID,readyAt:start+4*3600000,baseVisits:[true]};
 assert.equal(normaliseEventProgress(data,start).visitDay,treatDay(start));
 assert.equal(normaliseEventProgress(data,start).baseVisits[0],true);
 assert.equal(normaliseEventProgress(data,Date.UTC(2026,9,9)).baseVisits[0],false);
});
test('wishlist excludes owned items and keeps unpriced rewards separate',async()=>{
 const {EVENT_ID,eventWishlistTotals}=await import('../event-data.js');
 assert.deepEqual(eventWishlistTotals({eventId:EVENT_ID,wishlist:['bat-hat','ghoulish-gonk','event-pass','reward-treats'],owned:['bat-hat'],treats:30}),{count:3,total:160,shortfall:130,rounds:7,unknown:1,rewards:1});
 assert.equal(eventWishlistTotals({eventId:EVENT_ID,wishlist:['bat-hat'],treats:100}).shortfall,0);
});
test('imports reject unknown event fields and leave original data untouched',async()=>{
 const {EVENT_ID,normaliseEventProgress}=await import('../event-data.js');
 const input={eventId:EVENT_ID,baseVisits:[true,'true',1],readyAt:Infinity,treats:-8,wishlist:['bat-hat','bat-hat','invalid'],owned:null},before=JSON.stringify(input),result=normaliseEventProgress(input);
 assert.deepEqual(result.baseVisits,[true,false,false,false,false]);assert.deepEqual(result.wishlist,['bat-hat']);assert.equal('readyAt' in result,false);assert.equal(result.treats,0);assert.equal(JSON.stringify(input),before);
 assert.equal(normaliseEventProgress({...input,eventId:'old-event'}).wishlist.length,0);
});
