const {test}=require('node:test'),assert=require('node:assert/strict');
const event=require('../data/events/boosted-weekend.json');
test('both Life Day weekends have artwork and move from upcoming to active to history',async()=>{
 const fs=require('node:fs'),{eventWindow,eventSections,scheduledEventStatus}=await import('../event-schedule.js');
 const events=[21,28].map(day=>require(`../data/events/life-day-${day}.json`));
 for(const [index,event] of events.entries()){
  const {start,end}=eventWindow(event);
  assert.equal(new Date(start).toISOString(),`2026-11-${index?28:21}T21:00:00.000Z`);
  assert.equal(end-start,86400000);assert(fs.existsSync(event.image));assert(fs.existsSync(event.titleImage));
  assert.equal(scheduledEventStatus(event,start-1).state,'upcoming');assert.equal(scheduledEventStatus(event,start).state,'active');
  assert(eventSections(events,end).past.includes(event));
 }
 assert.equal(eventSections(events,Date.parse('2026-11-16T00:00:00Z')).featured.length,2);
});
test('Boosted Weekend switches countdown and archives exactly at the scheduled boundaries',async()=>{
 const {eventWindow,scheduledEventStatus,eventSections,eventCountdown}=await import('../event-schedule.js');
 const {start,end}=eventWindow(event);
 assert.equal(end-start,86400000);
 assert.equal(new Date(start).toISOString(),'2026-11-14T21:00:00.000Z');
 assert.deepEqual(scheduledEventStatus(event,start-1000),{state:'upcoming',label:'Starts in',remainingMs:1000});
 assert.deepEqual(scheduledEventStatus(event,start),{state:'active',label:'Ends in',remainingMs:86400000});
 assert.equal(eventSections([event],end-1).featured.length,1);
 assert.deepEqual(eventSections([event],end),{featured:[],past:[event]});
 assert.equal(eventCountdown(-1000),'00h 00m 00s');
 assert.equal(eventCountdown(4*86400000+8*3600000+59*60000),'4d 08h 59m 00s');
});
test('current and upcoming events precede closed history in newest-first order',async()=>{
 const {eventSections}=await import('../event-schedule.js');
 const older={id:'older',startsAt:'2026-10-01T00:00:00Z',durationHours:24},recent={id:'recent',startsAt:'2026-10-31T00:00:00Z',durationHours:24};
 const list=[older,event,recent],sections=eventSections(list,Date.parse('2026-11-03T00:00:00Z'));
 assert.deepEqual(sections.featured,[event]);assert.deepEqual(sections.past,[recent,older]);assert.deepEqual(list,[older,event,recent]);
});
