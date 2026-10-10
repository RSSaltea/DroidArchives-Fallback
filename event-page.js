import {gonkArmyPanel,wireGonkArmyPanel} from './gonk-army.js?v=2026-10-10-gonk-army';
import {EVENT_ID,EVENT_ITEMS,TREAT_ICON,treatDay,nextTreatReset,normaliseEventProgress,eventRoundStatus,eventWishlistTotals} from './event-data.js?v=2026-10-08-daily-treats';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock=ms=>{const s=Math.ceil(ms/1000);return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(n=>String(n).padStart(2,'0')).join(':');};
function notificationStatus(){
  if(!('Notification' in window))return 'Browser notifications are unavailable here. Ready messages still appear on the site.';
  if(Notification.permission==='granted')return 'Browser notifications are allowed.';
  if(Notification.permission==='denied')return 'Browser notifications are blocked. Ready messages still appear on the site; change site permissions to allow desktop alerts.';
  return 'Enable ready alerts to allow browser notifications.';
}
export function eventPage({host,getProgress,setProgress}){
  let search='',category='All',onlyWishlist=false;
  const update=changes=>{setProgress(normaliseEventProgress({...normaliseEventProgress(getProgress()),...changes}));render();};
  function render(){
    const data=normaliseEventProgress(getProgress()),status=eventRoundStatus(data),totals=eventWishlistTotals(data);
    const group=(key,title)=>`<fieldset class="event-check-group"><legend>${title}<span>${data[key].filter(Boolean).length}/5</span></legend><div>${data[key].map((checked,i)=>`<label class="${checked?'checked':''}"><input type="checkbox" data-event-visit="${key}" data-index="${i}" ${checked?'checked':''}><span>Visit ${i+1}</span><small>2 Treats</small></label>`).join('')}</div></fieldset>`;
    const shown=EVENT_ITEMS.filter(item=>(category==='All'||item.category===category)&&(!onlyWishlist||data.wishlist.includes(item.id)&&!data.owned.includes(item.id))&&item.name.toLowerCase().includes(search.toLowerCase()));
    host.innerHTML=`<section class="event-page"><header class="event-hero"><img src="assets/events/gonk-o-ween/T_GOW_Pumpkin_Icon.png" alt=""><div><p class="eyebrow">Event</p><h1>Gonk-o-Ween</h1><p>Your Treat runs, Halloween shop and reward wishlist.</p></div></header>
      ${gonkArmyPanel()}<section class="event-panel"><div class="event-section-heading"><div><h2>Daily Trick or Treat Checklist</h2><p>Resets every day at <strong>00:00 UTC</strong> (${escape(new Date(nextTreatReset()).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',timeZoneName:'short'}))} in your time zone). Everyone shares the same reset; collecting does not start a 24-hour timer.</p></div><div class="event-clock"><small>Next Daily Reset</small><strong data-event-countdown>${clock(status.remainingMs)}</strong></div></div>
      <div class="event-ready" data-event-ready role="status" ${status.ready?'':'hidden'}>A new UTC day has started. Your checklist has reset and today's Treat visits are available.</div>
      <div class="event-checklists">${group('baseVisits','Player bases')}${group('outskirtsVisits','Outskirts')}</div>
      <div class="event-round-footer"><span><strong>${status.completed}/10</strong> visits recorded · <strong>${status.baseTreats}</strong> base Treats today</span><button class="btn" data-event-start>Clear Today's Checklist</button></div>
      <div class="event-reminder-settings"><button class="btn secondary" data-event-alerts aria-pressed="${data.alerts}">${data.alerts?'Disable reset alerts':'Enable reset alerts'}</button></div>
      <p class="event-help">Visits clear automatically at 00:00 UTC. Clearing the checklist does not change the reset time. Visit ticks do not change your Treat balance.</p><p class="event-help" id="eventAlertStatus">${notificationStatus()} Keep Droid Archives open for alerts; a sleeping tab checks when you return.</p></section>
      <section class="event-panel"><div class="event-section-heading"><div><h2>Shop &amp; reward wishlist</h2><p>Choose your goals and mark what you own. Shop stock rotates; this is the event catalogue.</p></div><label class="event-balance"><span><img src="${TREAT_ICON}" alt="">Your Treat balance</span><input class="form-control" type="number" min="0" step="1" id="eventTreatBalance" value="${data.treats}"></label></div>
      <div class="event-wishlist-summary"><div><small>Wishlist remaining</small><strong>${totals.count} items</strong></div><div><small>Known Treat cost</small><strong>${totals.total.toLocaleString()}</strong></div><div><small>Still needed</small><strong>${totals.shortfall.toLocaleString()} Treats</strong></div><div><small>At 20 base Treats per day</small><strong>${totals.rounds} days</strong></div></div>
      ${totals.unknown||totals.rewards?`<p class="event-help">${totals.unknown?`${totals.unknown} wishlist item(s) have an unconfirmed price and are excluded from the Treat total. `:''}${totals.rewards?`${totals.rewards} item(s) are event rewards, earned separately.`:''}</p>`:''}
      <div class="event-shop-filters"><label>Search<input id="eventShopSearch" class="form-control" placeholder="Find a costume, hat or reward…" value="${escape(search)}"></label><label>Category<select id="eventShopCategory" class="form-control">${['All',...new Set(EVENT_ITEMS.map(item=>item.category))].map(name=>`<option ${name===category?'selected':''}>${name}</option>`).join('')}</select></label><label class="event-filter-check"><input type="checkbox" id="eventWishlistOnly" ${onlyWishlist?'checked':''}>Wishlist only</label></div>
      <div class="event-shop-grid">${shown.map(item=>{const owned=data.owned.includes(item.id),wanted=data.wishlist.includes(item.id);return `<article class="event-shop-card ${owned?'event-owned':''}" data-event-item="${item.id}"><div class="event-item-art">${item.image?`<img src="${item.image}" alt="" loading="lazy">`:'<span aria-hidden="true">✦</span>'}</div><div class="event-item-content"><small>${item.category}</small><h3>${escape(item.name)}</h3><p class="event-item-price">${item.category==='Event rewards'?'Chopper event reward':item.price===null?'Price to confirm':`<img src="${TREAT_ICON}" alt="">${item.price} Treats`}</p><div class="event-item-actions"><button class="btn secondary" data-event-wish="${item.id}" aria-pressed="${wanted}" ${owned?'disabled':''}>${wanted?'On wishlist':'Add to wishlist'}</button><label><input type="checkbox" data-event-owned="${item.id}" ${owned?'checked':''}>${item.category==='Event rewards'?'Claimed':'Owned'}</label></div></div></article>`;}).join('')||'<p class="event-empty">No items match these filters.</p>'}</div>
      <p class="event-help">Owned and claimed items are removed from your remaining wishlist totals. Marking an item does not spend Treats or change your Base droids.</p></section></section>`;
    wireGonkArmyPanel(host);
    const renderedDay=treatDay();
    host.querySelector('.event-page').refreshTreatDay=()=>{if(treatDay()!==renderedDay)render();};
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
    document.querySelectorAll('a[href="#/event"]').forEach(el=>el.toggleAttribute('data-event-ready-link',status.ready));
    if(!data.alerts||!status.ready||busy)return;
    const profileKey=getProfileKey(),key=`droid-archive-event-alert:${EVENT_ID}:${profileKey}`,stamp=String(treatDay());
    const deliver=()=>{if(getProfileKey()!==profileKey||String(treatDay())!==stamp||!eventRoundStatus(getProgress()).ready||!normaliseEventProgress(getProgress()).alerts)return;if(localStorage.getItem(key)===stamp)return;const desktop='Notification' in window&&Notification.permission==='granted';if(document.hidden&&!desktop)return;let delivered=false;if(desktop){try{const notice=new Notification('Gonk-o-Ween Treats are ready',{body:'The daily reset at 00:00 UTC has passed. Check your stations in Event.',icon:TREAT_ICON,tag:key+':'+stamp});notice.onclick=()=>{window.focus();location.hash='#/event';notice.close();};delivered=true;}catch{}}if(!document.hidden){notify('Gonk-o-Ween: daily Treat visits have reset (00:00 UTC).');delivered=true;}if(delivered)localStorage.setItem(key,stamp);};
    busy=true;
    try{if(navigator.locks?.request)await navigator.locks.request(key,deliver);else deliver();}finally{busy=false;}
  }
  const interval=setInterval(()=>{tick().catch(()=>{});},1000),wake=()=>{tick().catch(()=>{});};
  window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);
  return {tick,dispose(){clearInterval(interval);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake);}};
}
