export function eventWindow(event){
  return {start:Date.parse(event.startsAt),end:Date.parse(event.endsAt)||Date.parse(event.startsAt)+(event.durationHours||24)*3600000};
}
export function scheduledEventStatus(event,now=Date.now()){
  const {start,end}=eventWindow(event);
  if(now<start)return {state:'upcoming',label:'Starts in',remainingMs:start-now};
  if(now<end)return {state:'active',label:'Ends in',remainingMs:end-now};
  return {state:'ended',label:'Ended',remainingMs:0};
}
export function eventSections(events,now=Date.now()){
  const ordered=[...events].sort((a,b)=>eventWindow(a).start-eventWindow(b).start);
  return {
    featured:ordered.filter(event=>scheduledEventStatus(event,now).state!=='ended'),
    past:ordered.filter(event=>scheduledEventStatus(event,now).state==='ended').reverse()
  };
}
export function eventCountdown(ms){
  const seconds=Math.max(0,Math.ceil(ms/1000)),days=Math.floor(seconds/86400);
  return `${days?`${days}d `:''}${String(Math.floor(seconds%86400/3600)).padStart(2,'0')}h ${String(Math.floor(seconds%3600/60)).padStart(2,'0')}m ${String(seconds%60).padStart(2,'0')}s`;
}
