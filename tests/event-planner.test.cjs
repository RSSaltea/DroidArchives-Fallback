const {test}=require('node:test'),assert=require('node:assert/strict');
test('Treat reminders last four hours across midnight and are ready at the boundary',async()=>{
 const {EVENT_ID,TREAT_COOLDOWN_MS,eventRoundStatus}=await import('../event-data.js');
 const start=Date.UTC(2026,9,5,22),data={eventId:EVENT_ID,readyAt:start+TREAT_COOLDOWN_MS,baseVisits:[true,true],outskirtsVisits:[true]};
 assert.equal(TREAT_COOLDOWN_MS,14400000);assert.equal(eventRoundStatus(data,start).remainingMs,14400000);
 assert.equal(eventRoundStatus(data,start+14400000-1).ready,false);assert.equal(eventRoundStatus(data,start+14400000).ready,true);
 assert.equal(eventRoundStatus(data,start+14400001).remainingMs,0);assert.equal(eventRoundStatus(data,start).baseTreats,6);assert.equal(eventRoundStatus().ready,false);
});
test('wishlist excludes owned items and keeps unpriced rewards separate',async()=>{
 const {EVENT_ID,eventWishlistTotals}=await import('../event-data.js');
 assert.deepEqual(eventWishlistTotals({eventId:EVENT_ID,wishlist:['bat-hat','ghoulish-gonk','event-pass','reward-treats'],owned:['bat-hat'],treats:30}),{count:3,total:160,shortfall:130,rounds:7,unknown:1,rewards:1});
 assert.equal(eventWishlistTotals({eventId:EVENT_ID,wishlist:['bat-hat'],treats:100}).shortfall,0);
});
test('imports reject unknown event fields and leave original data untouched',async()=>{
 const {EVENT_ID,normaliseEventProgress}=await import('../event-data.js');
 const input={eventId:EVENT_ID,baseVisits:[true,'true',1],readyAt:Infinity,treats:-8,wishlist:['bat-hat','bat-hat','invalid'],owned:null},before=JSON.stringify(input),result=normaliseEventProgress(input);
 assert.deepEqual(result.baseVisits,[true,false,false,false,false]);assert.deepEqual(result.wishlist,['bat-hat']);assert.equal(result.readyAt,0);assert.equal(result.treats,0);assert.equal(JSON.stringify(input),before);
 assert.equal(normaliseEventProgress({...input,eventId:'old-event'}).wishlist.length,0);
});
