import {escapeHtml as escape} from './ui-text.js?v=2026-11-08-shared';
import { scourgePanel, scourgeBossGuide } from './scourge.js?v=2026-11-08-shared';
import {eventWindow,scheduledEventStatus,eventSections,eventCountdown} from './event-schedule.js?v=2026-11-03-event-archive';
import { update135Panel } from './update-135.js?v=2026-10-31-prime';
import {gonkArmyPanel,wireGonkArmyPanel} from './gonk-army.js?v=2026-10-18-mission-tools';
import {EVENT_ID,EVENT_ITEMS,TREAT_ICON,treatDay,nextTreatReset,normaliseEventProgress,eventRoundStatus,eventWishlistTotals} from './event-data.js?v=2026-10-31-r2-crates';

const clock=ms=>{const s=Math.ceil(ms/1000);return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(n=>String(n).padStart(2,'0')).join(':');};
function notificationStatus(){
  if(!('Notification' in window))return 'Browser notifications are unavailable here. Ready messages still appear on the site.';
  if(Notification.permission==='granted')return 'Browser notifications are allowed.';
  if(Notification.permission==='denied')return 'Browser notifications are blocked. Ready messages still appear on the site; change site permissions to allow desktop alerts.';
  return 'Enable ready alerts to allow browser notifications.';
}
const eventDates=event=>{const {start,end}=eventWindow(event),options={day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'};return `${new Date(start).toLocaleString(undefined,options)} to ${new Date(end).toLocaleString(undefined,options)}`;};
function eventDetails(event){
  const guide=event.id==='scourge-boss'?scourgeBossGuide():event.id.startsWith('wg-22')?gonkArmyPanel():'';
  return `<p>${escape(event.description||'')}</p>${guide}`;
}
function featuredEvent(event){
  const status=scheduledEventStatus(event);
  return `<section class="event-panel event-featured" data-scheduled-event="${escape(event.id)}"><div class="event-section-heading"><div class="event-featured-title">${event.image?`<img src="${escape(event.image)}" alt="">`:''}<div><p class="eyebrow" data-scheduled-state>${status.state==='active'?'Current event':'Upcoming event'}</p><h2>${escape(event.name)}</h2></div></div><div class="event-clock"><small data-scheduled-label>${status.label}</small><strong data-scheduled-countdown>${eventCountdown(status.remainingMs)}</strong></div></div><p class="event-dates">${escape(eventDates(event))}</p>${eventDetails(event)}</section>`;
}
export function eventPage({host,getProgress,setProgress,events=[]}){
  let search='',category='All',onlyWishlist=false;
  const update=changes=>{setProgress(normaliseEventProgress({...normaliseEventProgress(getProgress()),...changes}));render();};
  function render(){
    const opened=new Set([...host.querySelectorAll('[data-event-archive][open]')].map(el=>el.dataset.eventArchive));
    const archive=(id,title,subtitle,body)=>`<details class="event-archive-entry" data-event-archive="${escape(id)}" ${opened.has(id)?'open':''}><summary><span><strong>${escape(title)}</strong><small>${escape(subtitle)}</small></span><span class="event-archive-action">View details</span></summary><div class="event-archive-body">${body}</div></details>`;
    const sections=eventSections(events),phase=events.map(event=>scheduledEventStatus(event).state).join(',');
    const data=normaliseEventProgress(getProgress()),status=eventRoundStatus(data),totals=eventWishlistTotals(data);
    const group=(key,title)=>`<fieldset class="event-check-group"><legend>${title}<span>${data[key].filter(Boolean).length}/5</span></legend><div>${data[key].map((checked,i)=>`<label class="${checked?'checked':''}"><input type="checkbox" data-event-visit="${key}" data-index="${i}" ${checked?'checked':''}><span>Visit ${i+1}</span><small>2 Treats</small></label>`).join('')}</div></fieldset>`;
    const shown=EVENT_ITEMS.filter(item=>(category==='All'||item.category===category)&&(!onlyWishlist||data.wishlist.includes(item.id)&&!data.owned.includes(item.id))&&item.name.toLowerCase().includes(search.toLowerCase()));
    host.innerHTML=`<section class="event-page"><header class="event-hero"><div><p class="eyebrow">What's happening</p><h1>Events</h1><p>Current and upcoming events, with older guides below.</p></div></header>
      <div data-event-featured>${sections.featured.map(featuredEvent).join('')||'<section class="event-panel"><h2>No upcoming event announced</h2><p>You can still browse previous events below.</p></section>'}</div>
      ${archive('scourge-guide','Scourge Fridays & Scourgedex','Ongoing guide - spawns, hand-ins and Hive Mind',scourgePanel({includeBoss:false}))}
      <section class="event-history"><h2>Past events</h2><p>Choose an event to open its details. Dates, rewards and availability below describe those earlier events.</p>
      ${sections.past.map(event=>archive(event.id,event.name,eventDates(event),eventDetails(event))).join('')}
      ${archive('scourge-update','Traits, missions and the Scourge','October 2026 - v1.35 update',update135Panel())}
      <details class="event-archive-entry" data-event-archive="gonk-o-ween" ${opened.has('gonk-o-ween')?'open':''}><summary><span><strong>Gonk-o-Ween</strong><small>October 2026 - Halloween checklist, shop & wishlist</small></span><span class="event-archive-action">View details</span></summary><div class="event-archive-body"><p class="event-help">The Halloween event has ended. Your saved checklist and wishlist remain available here. Treat exchanges were scheduled to close on 7 November at 21:00 UTC.</p><section class="event-panel"><div class="event-section-heading"><div><h2>Saved Trick or Treat Checklist</h2><p>During the event, visits reset every day at <strong>00:00 UTC</strong> (${escape(new Date(nextTreatReset()).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',timeZoneName:'short'}))} in your time zone). Everyone shares the same reset; collecting does not start a 24-hour timer.</p></div><div class="event-clock"><small>Historical daily reset</small><strong data-event-countdown>${clock(status.remainingMs)}</strong></div></div>
      <div class="event-ready" data-event-ready role="status" ${status.ready?'':'hidden'}>A new UTC day has started. Your checklist has reset and today's Treat visits are available.</div>
      <div class="event-checklists">${group('baseVisits','Player bases')}${group('outskirtsVisits','Outskirts')}</div>
      <div class="event-round-footer"><span><strong>${status.completed}/10</strong> visits recorded · <strong>${status.baseTreats}</strong> base Treats today</span><button class="btn" data-event-start>Clear Today's Checklist</button></div>
      <div class="event-reminder-settings"><button class="btn secondary" data-event-alerts disabled aria-pressed="false">Treat event ended</button></div>
      <p class="event-help">This retains the old daily checklist behaviour. Visit ticks do not change your Treat balance or indicate that Treats are still available in game.</p><p class="event-help" id="eventAlertStatus">Reset alerts are inactive because this event has ended.</p></section>
      <section class="event-panel"><div class="event-section-heading"><div><h2>Shop &amp; reward wishlist</h2><p>Choose your goals and mark what you own. Shop stock rotates; this is the event catalogue.</p></div><label class="event-balance"><span><img src="${TREAT_ICON}" alt="">Your Treat balance</span><input class="form-control" type="number" min="0" step="1" id="eventTreatBalance" value="${data.treats}"></label></div>
      <div class="event-wishlist-summary"><div><small>Wishlist remaining</small><strong>${totals.count} items</strong></div><div><small>Known Treat cost</small><strong>${totals.total.toLocaleString()}</strong></div><div><small>Still needed</small><strong>${totals.shortfall.toLocaleString()} Treats</strong></div><div><small>At 20 base Treats per day</small><strong>${totals.rounds} days</strong></div></div>
      ${totals.unknown||totals.rewards?`<p class="event-help">${totals.unknown?`${totals.unknown} wishlist item(s) have an unconfirmed price and are excluded from the Treat total. `:''}${totals.rewards?`${totals.rewards} item(s) are event rewards, earned separately.`:''}</p>`:''}
      <div class="event-shop-filters"><label>Search<input id="eventShopSearch" class="form-control" placeholder="Find a costume, hat or reward…" value="${escape(search)}" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"></label><label>Category<select id="eventShopCategory" class="form-control">${['All',...new Set(EVENT_ITEMS.map(item=>item.category))].map(name=>`<option ${name===category?'selected':''}>${name}</option>`).join('')}</select></label><label class="event-filter-check"><input type="checkbox" id="eventWishlistOnly" ${onlyWishlist?'checked':''}>Wishlist only</label></div>
      <div class="event-shop-grid">${shown.map(item=>{const owned=data.owned.includes(item.id),wanted=data.wishlist.includes(item.id);return `<article class="event-shop-card ${owned?'event-owned':''}" data-event-item="${item.id}"><div class="event-item-art">${item.image?`<img src="${item.image}" alt="" loading="lazy">`:'<span aria-hidden="true">✦</span>'}</div><div class="event-item-content"><small>${item.category}</small><h3>${escape(item.name)}</h3><p class="event-item-price">${item.category==='Event rewards'?'Chopper event reward':item.price===null?'Price to confirm':`<img src="${TREAT_ICON}" alt="">${item.price} Treats`}</p><div class="event-item-actions"><button class="btn secondary" data-event-wish="${item.id}" aria-pressed="${wanted}" ${owned?'disabled':''}>${wanted?'On wishlist':'Add to wishlist'}</button><label><input type="checkbox" data-event-owned="${item.id}" ${owned?'checked':''}>${item.category==='Event rewards'?'Claimed':'Owned'}</label></div></div></article>`;}).join('')||'<p class="event-empty">No items match these filters.</p>'}</div>
      <p class="event-help">Owned and claimed items are removed from your remaining wishlist totals. Marking an item does not spend Treats or change your Base droids.</p></section></div></details></section></section>`;
    host.querySelectorAll('.gonk-army-panel').forEach(panel=>wireGonkArmyPanel(panel.parentElement));
    const renderedDay=treatDay();
    host.querySelectorAll('[data-event-archive]').forEach(el=>el.addEventListener('toggle',()=>{el.querySelector('.event-archive-action')?.replaceChildren(el.open?'Hide details':'View details');}));
    host.querySelector('.event-page').refreshTreatDay=()=>{if(treatDay()!==renderedDay||events.map(event=>scheduledEventStatus(event).state).join(',')!==phase){render();return;}host.querySelectorAll('[data-scheduled-event]').forEach(el=>{const event=events.find(event=>event.id===el.dataset.scheduledEvent),status=scheduledEventStatus(event);el.querySelector('[data-scheduled-countdown]').textContent=eventCountdown(status.remainingMs);el.querySelector('[data-scheduled-label]').textContent=status.label;});};
    host.querySelectorAll('[data-event-visit]').forEach(input=>input.onchange=()=>{const current=normaliseEventProgress(getProgress()),checks=[...current[input.dataset.eventVisit]];checks[Number(input.dataset.index)]=input.checked;update({[input.dataset.eventVisit]:checks,visitDay:treatDay()});});
    host.querySelector('[data-event-start]').onclick=()=>update({visitDay:treatDay(),baseVisits:[],outskirtsVisits:[]});
    host.querySelector('[data-event-alerts]').onclick=async()=>{if(normaliseEventProgress(getProgress()).alerts){update({alerts:false});return;}const current=getProgress();update({alerts:true,visitDay:treatDay()});if('Notification' in window&&Notification.permission==='default'){try{await Notification.requestPermission();}catch{}if(getProgress().eventId===current.eventId&&host.querySelector('.event-page'))host.querySelector('#eventAlertStatus').textContent=notificationStatus()+' Keep Droid Archives open for alerts; a sleeping tab checks when you return.';}};
    host.querySelector('#eventTreatBalance').onchange=e=>update({treats:e.target.value});
    host.querySelector('#eventShopCategory').onchange=e=>{category=e.target.value;render();};
    host.querySelector('#eventWishlistOnly').onchange=e=>{onlyWishlist=e.target.checked;render();};
    host.querySelector('#eventShopSearch').oninput=e=>{search=e.target.value;const start=e.target.selectionStart;render();const input=host.querySelector('#eventShopSearch');input.focus({preventScroll:true});input.setSelectionRange(start,start);};
    host.querySelectorAll('[data-event-wish]').forEach(button=>button.onclick=()=>{const list=normaliseEventProgress(getProgress()).wishlist,id=button.dataset.eventWish;update({wishlist:list.includes(id)?list.filter(x=>x!==id):[...list,id]});});
    host.querySelectorAll('[data-event-owned]').forEach(input=>input.onchange=()=>{const list=normaliseEventProgress(getProgress()).owned,id=input.dataset.eventOwned;update({owned:input.checked?[...list,id]:list.filter(x=>x!==id)});});
  }
  render();
}

// One scheduler for the application, including when another tab/page is open.
export function startEventReminders({getProgress,getProfileKey,notify}){
  let busy=false;
  async function tick(){
    const data=normaliseEventProgress(getProgress()),status=eventRoundStatus(data);
    document.querySelector('.event-page')?.refreshTreatDay?.();
    document.querySelectorAll('[data-event-countdown]').forEach(el=>el.textContent=clock(status.remainingMs));
    document.querySelectorAll('[data-event-ready]').forEach(el=>el.hidden=!status.ready);
    document.querySelectorAll('a[href="#/event"]').forEach(el=>el.toggleAttribute('data-event-ready-link',Date.now()<Date.parse('2026-11-01T20:00:00Z')&&status.ready));
    if(Date.now()>=Date.parse('2026-11-01T20:00:00Z')||!data.alerts||!status.ready||busy)return;
    const profileKey=getProfileKey(),key=`droid-archive-event-alert:${EVENT_ID}:${profileKey}`,stamp=String(treatDay());
    const deliver=()=>{if(getProfileKey()!==profileKey||String(treatDay())!==stamp||!eventRoundStatus(getProgress()).ready||!normaliseEventProgress(getProgress()).alerts)return;if(localStorage.getItem(key)===stamp)return;const desktop='Notification' in window&&Notification.permission==='granted';if(document.hidden&&!desktop)return;let delivered=false;if(desktop){try{const notice=new Notification('Gonk-o-Ween Treats are ready',{body:'The daily reset at 00:00 UTC has passed. Check your stations in Event.',icon:TREAT_ICON,tag:key+':'+stamp});notice.onclick=()=>{window.focus();location.hash='#/event';notice.close();};delivered=true;}catch{}}if(!document.hidden){notify('Gonk-o-Ween: daily Treat visits have reset (00:00 UTC).');delivered=true;}if(delivered)localStorage.setItem(key,stamp);};
    busy=true;
    try{if(navigator.locks?.request)await navigator.locks.request(key,deliver);else deliver();}finally{busy=false;}
  }
  const interval=setInterval(()=>{tick().catch(()=>{});},1000),wake=()=>{tick().catch(()=>{});};
  window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);
  return {tick,dispose(){clearInterval(interval);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake);}};
}
