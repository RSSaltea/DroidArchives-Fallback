const VARIANTS=['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR'];
const GOOGLE_CLIENT_ID='639634997022-sla3g6plurr364s6liq4vouj003rcaus.apps.googleusercontent.com';
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.appdata';
const CLOUD_FILE_NAME='droid-archives-cloud-save.json';
const LOCAL_PROFILES_KEY='droid-archive-local-profiles';
const SUPABASE_CONFIG_PATH='data/supabase-config.json';
const PUBLIC_SITE_URL='https://rssaltea.github.io/DroidArchives/';
const GALACTIC_REPORTS_ENABLED=false;
function droidAttribute(d,variant='DEFAULT'){
  // Iconics have no rarity/quality scaling, so their attribute is whatever
  // passive they carry. Only some have one recorded.
  if(isIconic(d))return d?.special?.passive||'N/A';
  const rarityLevel={COMMON:1,RARE:2,EPIC:3,LEGENDARY:4,MYTHIC:5}[d?.rarity],variantLevel=Math.max(0,VARIANTS.indexOf(variant));
  if(!rarityLevel)return'N/A';
  // Crafting speed steps 0.2/sec for each rarity and each quality, so Common
  // Standard is 0.2 and Mythic Galactic is 2 — the same rarity + quality ladder
  // the Astromech pickaxe levels use. toFixed then Number drops the float noise
  // (0.2 * 3 is 0.6000000000000001) without leaving a trailing .0 on whole steps.
  if(d.type==='WORKER')return`+${Number((0.2*(rarityLevel+variantLevel)).toFixed(1))}/sec Droid Crafting`;
  if(d.type==='ASTROMECH'){const level=rarityLevel+variantLevel;return`+${level} Pickaxe Level${level===1?'':'s'}`}
  if(d.type==='BATTLE')return`+${rarityLevel*20+variantLevel*40} Max Health`;
  return'N/A'
}
const droidGameplayAttribute=(d,variant)=>`${d.name} provides <strong>${droidAttribute(d,variant)}</strong>.`;
const syncProvider=localStorage.getItem('droid-archive-sync-provider')||'local';
let supabaseConfig={url:'',anonKey:'',table:'droid_archive_profiles'};
let supabaseClient=null;
const state={droids:[],rebirths:{},images:{},events:[],novaShop:null,cantinaShop:null,owned:JSON.parse(localStorage.getItem('droid-archive-owned')||'[]'),blueprints:JSON.parse(localStorage.getItem('droid-archive-blueprints')||'[]'),droidex:JSON.parse(localStorage.getItem('droid-archive-droidex')||'[]'),novaUpgrades:JSON.parse(localStorage.getItem('droid-archive-nova-upgrades')||'{}'),cantinaPurchases:JSON.parse(localStorage.getItem('droid-archive-cantina-purchases')||'{}'),multiplier:Number(localStorage.getItem('droid-archive-multiplier')||1),cycle:Number(localStorage.getItem('droid-archive-cycle')||0),rebirth:Number(localStorage.getItem('droid-archive-rebirth')||0),superRebirthGoal:Number(localStorage.getItem('droid-archive-super-rebirth-goal')||30),optimiseFreeBuild:localStorage.getItem('droid-archive-optimise-free-build')==='1',optimiseFuseFirst:localStorage.getItem('droid-archive-optimise-fuse-first')!=='0',fusionAsLounge:localStorage.getItem('droid-archive-fusion-as-lounge')==='1',optimiseFreeBuildMode:localStorage.getItem('droid-archive-optimise-free-build-mode')||'upgrade-cost',optimiseKeepDroidex:localStorage.getItem('droid-archive-optimise-keep-droidex')!=='0',companionGoals:JSON.parse(localStorage.getItem('droid-archive-companion-goals')||'null'),preferredCompanions:JSON.parse(localStorage.getItem('droid-archive-preferred-companions')||'[]'),autoCompleteBuilds:localStorage.getItem('droid-archive-auto-complete-builds')==='1',autoPurchaseSlots:localStorage.getItem('droid-archive-auto-purchase-slots')!=='0',purchasedSlots:JSON.parse(localStorage.getItem('droid-archive-purchased-slots')||'[]'),rebirthTracker:JSON.parse(localStorage.getItem('droid-archive-rebirth-tracker')||'{"notUsingBase":false,"entries":{}}'),loungePurchased:Number(localStorage.getItem('droid-archive-lounge-purchased')||0),novaLevel:Number(localStorage.getItem('droid-archive-nova-level')||0),theme:localStorage.getItem('droid-archive-theme')||'dark',localDoc:null,groups:{workspace:[],loading:false,loaded:false,error:'',loadPromise:null},sharedView:null,cloud:{provider:'supabase',session:null,user:null,doc:null,activeProfileId:localStorage.getItem('droid-archive-active-profile')||'',enabled:syncProvider==='supabase',reconnecting:syncProvider==='supabase',syncing:false,loadPromise:null,initializingNewAccount:false,loadedProfileCount:0,allowProfileCountDecrease:false,status:syncProvider==='supabase'?'Restoring session…':'Local save',token:null,tokenExpiresAt:0,fileId:localStorage.getItem('droid-archive-cloud-file-id')||'',tokenClient:null}};
if(!localStorage.getItem('droid-archive-super-rebirth-goal'))state.superRebirthGoal=35;
if(!Array.isArray(state.purchasedSlots))state.purchasedSlots=[];
function normalizeRebirthTracker(value){const entries={};for(const [key,row] of Object.entries(value?.entries||{})){if(!row||typeof row!=='object')continue;const variant=VARIANTS.includes(row.variant)?row.variant:null;entries[key]={...(variant?{variant}:{}),complete:Boolean(row.complete)}}return{notUsingBase:Boolean(value?.notUsingBase),entries}}
state.rebirthTracker=normalizeRebirthTracker(state.rebirthTracker);
const LEGACY_DROID_NAMES={'C3-PO':'C-3PO','BU-4D':'B-U4D'};
const canonicalDroidName=name=>LEGACY_DROID_NAMES[name]||name;
const normalizeDroidRows=rows=>Array.isArray(rows)?rows.map(row=>row?.name?{...row,name:canonicalDroidName(row.name)}:row):rows;
function normalizeLoadedDroidNames(){let changed=false;for(const rows of [state.owned,state.blueprints,state.droidex])for(const row of rows){const next=canonicalDroidName(row?.name);if(row&&next!==row.name){row.name=next;changed=true}if(row?.lockedCompanion&&!row.lockedSlot){row.lockedSlot=true;delete row.lockedCompanion;changed=true}}if(changed)saveLocal()}
const app=document.querySelector('#app');
state.patchNotes=[];
let patchNotesPrompted=false;
// ── Desktop companion bridge ──────────────────────────────────────────────
// The Electron companion embeds this site with ?companion=1 and reads
// window.__companionOptimise instead of scraping the rendered DOM. Publishing
// is a no-op for normal browser visitors.
const companionMode=new URLSearchParams(location.search).get('companion')==='1';
// The companion embeds this page in a short, wide panel. Marking the document
// lets the stylesheet render a version that fits it, rather than squeezing the
// full-width site into a strip until the navigation runs off the edge.
if(companionMode)document.documentElement.classList.add('in-companion');
function publishCompanionState(optimise){
  if(!companionMode)return;
  const prev=window.__companionOptimise||{},path=location.hash.slice(1).split('?')[0]||'/';
  window.__companionOptimise={
    version:1,updatedAt:Date.now(),path,
    dataLoaded:state.droids.length>0,
    cloudEnabled:Boolean(state.cloud.enabled),
    restoring:Boolean(state.cloud.reconnecting),
    signedIn:Boolean(state.cloud.session),
    cloudStatus:String(state.cloud.status||''),
    ownedCount:state.owned.reduce((sum,x)=>sum+(Number(x.qty)||0),0),
    optimise:optimise||(path==='/optimise'?prev.optimise||null:null)
  };
}
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
const fmt=n=>{if(!n)return '—';const u=[['T',1e12],['B',1e9],['M',1e6],['K',1e3]];for(const [s,v] of u)if(n>=v)return `${(n/v).toLocaleString(undefined,{maximumFractionDigits:2})}${s}`;return n.toLocaleString()};
// Ordered to match the banners in game: Stellar, Mythic, Galactic. Offsets are
// minutes past the hour and land the same in UK time either way, since BST is a
// whole hour ahead of UTC. Stellar lands on the hour, read off a 15:07 countdown
// at 01:44:53 BST, which agrees with Mythic (10:07 to :55) and Galactic (00:07
// to :45) from the same screenshot.
// The DJ Event runs two fixed windows a week. It is anchored to UTC because it
// starts at the same instant for everyone regardless of their timezone, so the
// countdown is the whole story and no dates or day names need showing.
// The two windows are not one repeating interval, so this cannot use
// intervalMinutes/offsetMinutes like the spawn timers can.
// The game announces these in US Eastern - 10am and 8pm - so these UTC hours
// hold only while Eastern is on daylight time; they shift an hour when it ends.
const DJ_EVENT_WINDOWS=[{day:2,hour:14},{day:3,hour:0}];   // Tue 14:00, Wed 00:00 UTC
const DJ_EVENT_DURATION_MS=3*3600000;
// Candidate starts either side of this week, so a countdown near a week
// boundary still finds the window that is about to open.
function windowStarts(windows,now){const midnight=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()),day=now.getUTCDay(),starts=[];for(const w of windows)for(let week=-1;week<=1;week+=1)starts.push(midnight+(w.day-day+week*7)*86400000+w.hour*3600000);return starts.sort((a,b)=>a-b)}
function windowState(timer,now=new Date()){const t=now.getTime(),starts=windowStarts(timer.windows,now),open=starts.find(start=>t>=start&&t<start+DJ_EVENT_DURATION_MS);if(open!==undefined)return{active:true,ms:open+DJ_EVENT_DURATION_MS-t};return{active:false,ms:starts.find(start=>start>t)-t}}
const SPAWN_TIMERS=[
  {id:'stellar',name:'Stellar Spawn',intervalMinutes:60,offsetMinutes:0,note:'Every 60 minutes',image:'assets/events/stellar-spawn.png'},
  {id:'mythic',name:'Mythic Spawn',intervalMinutes:60,offsetMinutes:55,note:'Every 60 minutes',image:'assets/events/mythic-spawn.png'},
  {id:'galactic',name:'Galactic Spawn',intervalMinutes:60,offsetMinutes:45,note:'Every 60 minutes',image:'assets/events/galactic-spawn.png'},
  {id:'dj',name:'DJ Event',windows:DJ_EVENT_WINDOWS,note:'Twice a week',image:'assets/events/Dance-Party-Mini-Event.png'}
];
const activeSpawnTimers=()=>SPAWN_TIMERS.filter(timer=>timer.enabled!==false);
const padTime=n=>String(n).padStart(2,'0');
function durationParts(ms){const total=Math.max(0,Math.ceil(ms/1000)),days=Math.floor(total/86400),hours=Math.floor(total%86400/3600),minutes=Math.floor(total%3600/60),seconds=total%60;return{days,hours,minutes,seconds}}
function shortDuration(ms){const p=durationParts(ms),parts=[];if(p.days)parts.push(`${p.days}d`);if(p.hours||p.days)parts.push(`${p.hours}h`);parts.push(`${p.minutes}m`,`${p.seconds}s`);return parts.join(' ')}
// Days, hours, minutes while the wait is long, and hours, minutes, seconds once
// the event is running. Three hours is short enough for seconds to mean
// something, and the game's own sign counts down in h:m:s - reading the same way
// is what lets the two sit side by side.
// Days, hours, minutes. A window timer can be most of a week away, so folding
// days into the hours field gives "140:27:54" — a number nobody reads as five
// and a bit days. Seconds are dropped: at this range they are noise, and three
// fields keep the card the same width as the spawn timers beside it.
function windowClock(ms){const p=durationParts(ms);return `${padTime(p.days)}:${padTime(p.hours)}:${padTime(p.minutes)}`}
function clockDuration(ms){const p=durationParts(ms),hours=p.hours+p.days*24;return `${padTime(hours)}:${padTime(p.minutes)}:${padTime(p.seconds)}`}
function nextSpawn(timer,now=new Date()){const interval=timer.intervalMinutes*60000,offset=timer.offsetMinutes*60000,elapsed=now.getTime()-offset,next=Math.ceil(elapsed/interval)*interval+offset;return next<=now.getTime()?next+interval:next}
const eventRetentionMs=event=>Math.max(0,Number(event?.endedRetentionHours??2))*3600000;
function eventOccurrence(event,now=new Date()){const baseStart=Date.parse(event.startsAt),duration=(event.durationHours||24)*3600000,baseEnd=Date.parse(event.endsAt)||baseStart+duration,t=now.getTime(),retention=eventRetentionMs(event);let start=baseStart,end=baseEnd;if(Number.isFinite(Number(event.repeatGapDays))&&t>=baseEnd+retention){const period=duration+Number(event.repeatGapDays)*86400000,repeatCount=Number.isFinite(Number(event.repeatCount))?Math.max(0,Number(event.repeatCount)):Infinity;let index=Math.min(Math.floor((t-baseStart)/period),repeatCount);start=baseStart+index*period;end=start+duration;if(t>=end+retention&&index<repeatCount){start+=period;end+=period}}return{...event,start,end}}
function currentEvent(now=new Date()){const events=state.events.filter(event=>event.homepage!==false).map(event=>eventOccurrence(event,now)).sort((a,b)=>a.start-b.start),t=now.getTime(),active=events.find(event=>t>=event.start&&t<event.end),ended=events.filter(event=>t>=event.end&&t<event.end+eventRetentionMs(event)).sort((a,b)=>b.end-a.end)[0],upcoming=events.find(event=>t<event.start);return active||ended||upcoming||null}
function eventStatus(event,now=new Date()){if(!event)return null;const t=now.getTime();if(t<event.start)return{label:'Starts in',value:shortDuration(event.start-t),state:'upcoming'};if(t<event.end)return{label:'Active for',value:shortDuration(event.end-t),state:'active'};if(t<event.end+eventRetentionMs(event))return{label:'Status',value:'Ended',state:'inactive'};return null}
function timerShell(){const home=(location.hash.slice(1).split('?')[0]||'/')==='/',event=home?currentEvent():null,collapsed=localStorage.getItem('droid-archive-timers-collapsed')==='1',timers=activeSpawnTimers();return `<section class="archive-timers ${home?'home-timers':'compact-timers'} ${collapsed?'timers-collapsed':''} ${timerDock.docked?'timers-docked':''}" aria-label="UTC spawn timers"><button class="timer-toggle" type="button" aria-expanded="${collapsed?'false':'true'}">${collapsed?'Show timers':'Hide timers'}</button><div class="spawn-timers" style="--spawn-timer-count:${timers.length}">${timers.map(timer=>`<article class="spawn-timer spawn-${timer.id}" data-spawn-timer="${timer.id}"><img src="${timer.image}" alt=""><div><span>${timer.name}</span><strong>${timer.comingSoon?'Coming Soon':'--:--'}</strong><small>${timer.note}</small></div></article>`).join('')}</div></section>${event?`<article class="event-card" data-event-card="${event.id}"><div class="event-art">${event.image?`<img src="${event.image}" alt="${event.name}">`:''}</div><div><p class="eyebrow">${event.category||'Event'}</p><h2>${event.name}</h2><p>${event.description||''}</p><div class="event-status" data-event-status><span>Starts in</span><strong>--</strong></div></div></article>`:''}`}
function updateArchiveTimers(){document.querySelectorAll('.archive-timers').forEach(root=>{const now=new Date();SPAWN_TIMERS.forEach(timer=>{const node=root.querySelector(`[data-spawn-timer="${timer.id}"]`),card=node?.querySelector('strong');if(!card)return;if(timer.comingSoon){card.textContent='Coming Soon';return}if(timer.windows){const s=windowState(timer,now);card.textContent=s.active?clockDuration(s.ms):windowClock(s.ms);node.dataset.timerActive=s.active?'1':'0';const note=node.querySelector('small');if(note)note.textContent=s.active?'Active now':timer.note;return}card.textContent=clockDuration(nextSpawn(timer,now)-now.getTime())})});document.querySelectorAll('[data-event-card]').forEach(eventNode=>{const now=new Date(),event=currentEvent(now),status=eventStatus(event,now);if(!event||!status){eventNode.remove();return}eventNode.dataset.eventState=status.state;eventNode.querySelector('[data-event-status] span').textContent=status.label;eventNode.querySelector('[data-event-status] strong').textContent=status.value})}
// Any page render replaces app.innerHTML, which destroys the timer panel, and a
// MutationObserver rebuilds it. Holding the docked state on the element meant
// every click brought it back at full width until the next scroll, so it lives
// out here and timerShell paints it docked from the start.
let timerDock={docked:false,at:null};
function updateTimerDocking(){const root=app.querySelector('.archive-timers');if(!root)return;const desktop=innerWidth>=1700;if(!desktop){timerDock={docked:false,at:null};root.classList.remove('timers-docked');root.style.left='';return}const wasDocked=timerDock.docked;root.classList.toggle('timers-docked',wasDocked);if(timerDock.at===null||!wasDocked)timerDock.at=Math.round(root.getBoundingClientRect().top+scrollY+root.offsetHeight+16);root.dataset.dockAt=timerDock.at;
  // Docking makes the timers position:fixed, which takes them out of the flow and
  // shortens the page by their own height. That can pull scrollY back under the
  // threshold, undock, restore the height, and dock again — a loop that pins the
  // main thread with nothing logged. Releasing only once you are a full panel
  // height back above the mark makes the two states impossible to flip between.
  const mark=timerDock.at,release=mark-root.offsetHeight-24;
  const docked=wasDocked?scrollY>release:scrollY>mark;
  if(docked!==wasDocked){timerDock.docked=docked;root.classList.toggle('timers-docked',docked)}if(!docked){root.style.left='';return}const content=[...app.children].filter(x=>!x.classList.contains('archive-timers')&&!x.classList.contains('event-card')),contentRight=Math.max(0,...content.map(x=>x.getBoundingClientRect().right).filter(Boolean)),viewportRight=document.documentElement.clientWidth,timerWidth=root.offsetWidth,gutter=Math.max(0,viewportRight-contentRight),left=contentRight+Math.max(12,(gutter-timerWidth)/2);root.style.left=`${Math.min(left,viewportRight-timerWidth-12)}px`}
function mountArchiveTimers(){const path=location.hash.slice(1).split('?')[0]||'/';if(path==='/todo'||path==='/donate'||path==='/groups'){app.querySelector('.archive-timers')?.remove();return}if(!state.droids.length||app.querySelector('.archive-timers'))return;app.insertAdjacentHTML('afterbegin',timerShell());const toggle=app.querySelector('.timer-toggle');if(toggle)toggle.onclick=()=>{const root=app.querySelector('.archive-timers'),collapsed=!root.classList.contains('timers-collapsed');root.classList.toggle('timers-collapsed',collapsed);localStorage.setItem('droid-archive-timers-collapsed',collapsed?'1':'0');toggle.textContent=collapsed?'Show timers':'Hide timers';toggle.setAttribute('aria-expanded',collapsed?'false':'true');updateTimerDocking()};updateArchiveTimers();updateTimerDocking();settleModernTimerScroll()}
setInterval(updateArchiveTimers,1000);
addEventListener('scroll',updateTimerDocking,{passive:true});
addEventListener('resize',updateTimerDocking);
function profileDataFromState(){return{owned:state.owned,blueprints:state.blueprints,droidex:state.droidex,novaUpgrades:state.novaUpgrades,cantinaPurchases:state.cantinaPurchases,multiplier:state.multiplier,cycle:state.cycle,rebirth:state.rebirth,superRebirthGoal:state.superRebirthGoal,optimiseFreeBuild:state.optimiseFreeBuild,optimiseFuseFirst:state.optimiseFuseFirst,fusionAsLounge:state.fusionAsLounge,optimiseFreeBuildMode:state.optimiseFreeBuildMode,optimiseKeepDroidex:state.optimiseKeepDroidex,companionGoals:state.companionGoals,preferredCompanions:state.preferredCompanions,autoCompleteBuilds:state.autoCompleteBuilds,autoPurchaseSlots:state.autoPurchaseSlots,purchasedSlots:state.purchasedSlots,loungePurchased:state.loungePurchased,novaLevel:state.novaLevel,rebirthTracker:state.rebirthTracker}}
function cloneProfileData(data){return JSON.parse(JSON.stringify(data))}
function cloneProfileBaseOnly(data){const copy=cloneProfileData(data);copy.droidex=[];return copy}
function blankProfileData(){return{owned:[],blueprints:[],droidex:[],novaUpgrades:{},cantinaPurchases:{},multiplier:1,cycle:0,rebirth:0,superRebirthGoal:35,optimiseFreeBuild:false,optimiseFuseFirst:true,fusionAsLounge:false,optimiseFreeBuildMode:'upgrade-cost',optimiseKeepDroidex:true,autoCompleteBuilds:false,companionGoals:null,preferredCompanions:[],autoPurchaseSlots:true,purchasedSlots:[],loungePurchased:0,novaLevel:0,rebirthTracker:{notUsingBase:false,entries:{}}}}
function applyProfileData(data){const next=validateBaseImport({base:{owned:normalizeDroidRows(data?.owned||[]),blueprints:normalizeDroidRows(data?.blueprints||[]),droidex:normalizeDroidRows(data?.droidex||[]),novaUpgrades:data?.novaUpgrades||{},cantinaPurchases:data?.cantinaPurchases||{},multiplier:data?.multiplier,cycle:data?.cycle,rebirth:data?.rebirth,superRebirthGoal:data?.superRebirthGoal,optimiseFreeBuild:data?.optimiseFreeBuild,optimiseFuseFirst:data?.optimiseFuseFirst,fusionAsLounge:data?.fusionAsLounge,optimiseFreeBuildMode:data?.optimiseFreeBuildMode,optimiseKeepDroidex:data?.optimiseKeepDroidex,companionGoals:data?.companionGoals,preferredCompanions:data?.preferredCompanions,autoCompleteBuilds:data?.autoCompleteBuilds,autoPurchaseSlots:data?.autoPurchaseSlots,purchasedSlots:data?.purchasedSlots,loungePurchased:data?.loungePurchased,novaLevel:data?.novaLevel,rebirthTracker:data?.rebirthTracker}});state.owned=next.owned;state.blueprints=next.blueprints;state.droidex=next.droidex;state.novaUpgrades=next.novaUpgrades;state.cantinaPurchases=next.cantinaPurchases;state.multiplier=next.multiplier;state.cycle=next.cycle;state.rebirth=next.rebirth;state.superRebirthGoal=next.superRebirthGoal;state.optimiseFreeBuild=next.optimiseFreeBuild;state.optimiseFreeBuildMode=next.optimiseFreeBuildMode;state.optimiseKeepDroidex=next.optimiseKeepDroidex!==false;state.companionGoals=Array.isArray(next.companionGoals)?next.companionGoals:null;state.preferredCompanions=Array.isArray(next.preferredCompanions)?next.preferredCompanions:[];state.autoCompleteBuilds=Boolean(next.autoCompleteBuilds);state.autoPurchaseSlots=next.autoPurchaseSlots;state.purchasedSlots=next.purchasedSlots;state.loungePurchased=next.loungePurchased;state.novaLevel=next.novaLevel;state.rebirthTracker=next.rebirthTracker;syncCantinaPackUpgrades();autoPurchaseEligibleSlots()}
function saveLocal(){localStorage.setItem('droid-archive-owned',JSON.stringify(state.owned));localStorage.setItem('droid-archive-blueprints',JSON.stringify(state.blueprints));localStorage.setItem('droid-archive-droidex',JSON.stringify(state.droidex));localStorage.setItem('droid-archive-nova-upgrades',JSON.stringify(state.novaUpgrades));localStorage.setItem('droid-archive-cantina-purchases',JSON.stringify(state.cantinaPurchases));localStorage.setItem('droid-archive-multiplier',state.multiplier);localStorage.setItem('droid-archive-cycle',state.cycle);localStorage.setItem('droid-archive-rebirth',state.rebirth);localStorage.setItem('droid-archive-super-rebirth-goal',state.superRebirthGoal);localStorage.setItem('droid-archive-optimise-free-build',state.optimiseFreeBuild?'1':'0');localStorage.setItem('droid-archive-optimise-fuse-first',state.optimiseFuseFirst===false?'0':'1');localStorage.setItem('droid-archive-fusion-as-lounge',state.fusionAsLounge?'1':'0');localStorage.setItem('droid-archive-optimise-free-build-mode',state.optimiseFreeBuildMode);localStorage.setItem('droid-archive-optimise-keep-droidex',state.optimiseKeepDroidex===false?'0':'1');localStorage.setItem('droid-archive-companion-goals',JSON.stringify(state.companionGoals||null));localStorage.setItem('droid-archive-preferred-companions',JSON.stringify(state.preferredCompanions||[]));localStorage.setItem('droid-archive-auto-complete-builds',state.autoCompleteBuilds?'1':'0');localStorage.setItem('droid-archive-auto-purchase-slots',state.autoPurchaseSlots?'1':'0');localStorage.setItem('droid-archive-purchased-slots',JSON.stringify(state.purchasedSlots));localStorage.setItem('droid-archive-lounge-purchased',state.loungePurchased);localStorage.setItem('droid-archive-nova-level',state.novaLevel);localStorage.setItem('droid-archive-rebirth-tracker',JSON.stringify(state.rebirthTracker));localStorage.setItem('droid-archive-theme',state.theme);localStorage.setItem('droid-archive-active-profile',state.cloud.activeProfileId||'');localStorage.setItem('droid-archive-sync-provider',state.cloud.enabled?'supabase':'local');if(state.cloud.fileId)localStorage.setItem('droid-archive-cloud-file-id',state.cloud.fileId)}
function localDocFromCurrent(name='Main'){const id=cloudId();return{app:'Droid Archives',version:1,updatedAt:new Date().toISOString(),activeProfileId:id,profiles:[{id,name,updatedAt:new Date().toISOString(),data:profileDataFromState()}]}}
function normalizeProfileDoc(doc){if(!doc||!Array.isArray(doc.profiles)||!doc.profiles.length)return localDocFromCurrent();doc.profiles=doc.profiles.map((p,i)=>({id:p.id||`profile-${Date.now()}-${i}`,name:p.name||`Profile ${i+1}`,updatedAt:p.updatedAt||new Date().toISOString(),data:{owned:p.data?.owned||[],blueprints:p.data?.blueprints||[],droidex:p.data?.droidex||[],novaUpgrades:p.data?.novaUpgrades||{},cantinaPurchases:p.data?.cantinaPurchases||{},multiplier:p.data?.multiplier??1,cycle:p.data?.cycle??0,rebirth:p.data?.rebirth??0,superRebirthGoal:p.data?.superRebirthGoal??30,optimiseFreeBuild:Boolean(p.data?.optimiseFreeBuild),optimiseFreeBuildMode:p.data?.optimiseFreeBuildMode||'upgrade-cost',optimiseKeepDroidex:p.data?.optimiseKeepDroidex!==false,companionGoals:Array.isArray(p.data?.companionGoals)?p.data.companionGoals:null,preferredCompanions:Array.isArray(p.data?.preferredCompanions)?p.data.preferredCompanions:[],autoCompleteBuilds:Boolean(p.data?.autoCompleteBuilds),autoPurchaseSlots:p.data?.autoPurchaseSlots===undefined?true:Boolean(p.data.autoPurchaseSlots),purchasedSlots:Array.isArray(p.data?.purchasedSlots)?p.data.purchasedSlots:[],loungePurchased:p.data?.loungePurchased??0,novaLevel:p.data?.novaLevel??0,rebirthTracker:normalizeRebirthTracker(p.data?.rebirthTracker)}}));doc.activeProfileId=doc.activeProfileId&&doc.profiles.some(p=>p.id===doc.activeProfileId)?doc.activeProfileId:doc.profiles[0].id;doc.updatedAt=doc.updatedAt||new Date().toISOString();return doc}
function ensureLocalDoc(){if(!state.localDoc){try{state.localDoc=normalizeProfileDoc(JSON.parse(localStorage.getItem(LOCAL_PROFILES_KEY)||'null'))}catch{state.localDoc=localDocFromCurrent()}if(!state.cloud.activeProfileId||!state.localDoc.profiles.some(p=>p.id===state.cloud.activeProfileId))state.cloud.activeProfileId=state.localDoc.activeProfileId;writeLocalDoc()}return state.localDoc}
function writeLocalDoc(){if(!state.localDoc)return;state.localDoc.activeProfileId=state.cloud.activeProfileId;state.localDoc.updatedAt=new Date().toISOString();localStorage.setItem(LOCAL_PROFILES_KEY,JSON.stringify(state.localDoc))}
function cacheCloudDocLocally(){if(!state.cloud.doc)return;state.localDoc=normalizeProfileDoc(cloneProfileData(state.cloud.doc));state.localDoc.activeProfileId=state.cloud.activeProfileId;writeLocalDoc()}
function cloudConnected(){return Boolean(state.cloud.user&&state.cloud.doc)}
function cloudNeedsLogin(){return state.cloud.enabled&&!cloudConnected()&&!state.cloud.reconnecting}
function activeProfileDoc(){return cloudConnected()?state.cloud.doc:ensureLocalDoc()}
function activeProfile(){const doc=activeProfileDoc();return doc?.profiles?.find(x=>x.id===state.cloud.activeProfileId)||doc?.profiles?.[0]}
function updateActiveLocalProfile(){const doc=ensureLocalDoc(),profile=doc.profiles.find(x=>x.id===state.cloud.activeProfileId);if(profile&&!cloudConnected()){profile.data=profileDataFromState();profile.updatedAt=new Date().toISOString();doc.activeProfileId=profile.id;writeLocalDoc()}}
function activeCloudProfile(){return state.cloud.doc?.profiles?.find(x=>x.id===state.cloud.activeProfileId)}
function updateActiveCloudProfile(){const profile=activeCloudProfile();if(profile){profile.data=profileDataFromState();profile.updatedAt=new Date().toISOString()}}
function cloudId(){return globalThis.crypto?.randomUUID?.()||`profile-${Date.now()}-${Math.random().toString(36).slice(2)}`}
let cloudSaveTimer=null;
function markCloudSignedOut(message='SIGNED OUT — changes are local only'){unsubscribeCloudChanges();state.cloud.session=null;state.cloud.user=null;state.cloud.doc=null;state.cloud.reconnecting=false;state.cloud.syncing=false;state.cloud.status=message;saveLocal();renderCloudHeader();renderBaseSidebar(()=>route())}
function scheduleCloudSave(){if(state.cloud.enabled&&!cloudConnected()){state.cloud.status='SIGNED OUT — changes save locally only';renderCloudHeader();return}if(!cloudConnected())return;clearTimeout(cloudSaveTimer);state.cloud.status='Unsynced changes';renderCloudHeader();cloudSaveTimer=setTimeout(()=>{cloudSaveTimer=null;cloudSaveNow().catch(e=>{state.cloud.syncing=false;state.cloud.status=e.message;renderCloudHeader();route()})},900)}
const save=()=>{if(state.sharedView){state.sharedView.profile.data=profileDataFromState();state.sharedView.changeVersion=(state.sharedView.changeVersion||0)+1;if(state.sharedView.canEdit)scheduleSharedProfileSave();return}updateActiveLocalProfile();updateActiveCloudProfile();saveLocal();scheduleCloudSave()};
const isDroidFlawless=name=>state.droidex.some(x=>x.name===name&&x.flawless);
const flawlessCount=()=>new Set(state.droidex.filter(x=>x.flawless&&!isIconic(state.droids.find(d=>d.name===x.name))).map(x=>x.name)).size;
const flawlessCapacity=()=>state.droids.filter(d=>!onlyDefaultVariant(d)).length;
const effectiveMultiplier=()=>state.multiplier;
const isIconic=d=>d?.rarity==='ICONIC'||d?.special?.onlyDefaultVariant;
const isFusion=d=>Boolean(d?.fusion);
// Which droids have a DEFAULT square and nothing else. Fusion droids are NOT
// among them: they come in every quality like anything else, you just cannot
// upgrade one quality into the next. Only having a default square is a
// different thing from only having a default *route in*.
const onlyDefaultVariant=d=>isIconic(d);
const droidexCapacity=()=>state.droids.reduce((total,d)=>total+(onlyDefaultVariant(d)?1:VARIANTS.length),0);
const ICONIC_EFFECTS={'BB-8':'×2 Upgrade Chips on claim','MISTER BONES':'×2 Damage','IG-11 MARSHAL':'Blueprint Shield','DJ R-3X':'×2 World Quest Rewards','CB-23':'Secret Astromech Mission','R2-D2':'15% Astromech Mission Speed','C-3PO':'2× Droid Sell Value'};
const iconicIncome=d=>isIconic(d)?(d.special?.incomePercent??0.15):0;
// An Iconic droid earns its own percentage of the Base's total base income. That
// share is all it produces: it never increases what any other droid earns, so a
// droid's own rate is only its base income, the multiplier and its station match.
const placedBaseIncome=placed=>placed.reduce((sum,x)=>sum+(state.droids.find(y=>y.name===x.name)?.variants[x.variant]?.income||0),0);
const droidRate=(d,variant,station,baseIncome=0)=>isIconic(d)?baseIncome*iconicIncome(d)*effectiveMultiplier():(d?.variants?.[variant]?.income||0)*effectiveMultiplier()*(station===d?.type?1.1:1);
const CHIP_COSTS={COMMON:{GOLD:10,DIAMOND:25,RAINBOW:40,BESKAR:80,GALACTIC:120,STELLAR:180},RARE:{GOLD:30,DIAMOND:60,RAINBOW:100,BESKAR:250,GALACTIC:400,STELLAR:750},EPIC:{GOLD:120,DIAMOND:180,RAINBOW:240,BESKAR:2000,GALACTIC:5000,STELLAR:8000},LEGENDARY:{GOLD:400,DIAMOND:1200,RAINBOW:2500,BESKAR:6000,GALACTIC:16000,STELLAR:24000},MYTHIC:{GOLD:4000,DIAMOND:8000,RAINBOW:14000,BESKAR:30000,GALACTIC:60000,STELLAR:90000}};
const UPGRADE_CHIP_RATES={
  COMMON:{DEFAULT:2,GOLD:4,DIAMOND:6,RAINBOW:8,BESKAR:10,GALACTIC:12,STELLAR:14},
  RARE:{DEFAULT:4,GOLD:8,DIAMOND:12,RAINBOW:16,BESKAR:20,GALACTIC:24,STELLAR:28},
  EPIC:{DEFAULT:6,GOLD:12,DIAMOND:18,RAINBOW:24,BESKAR:30,GALACTIC:36,STELLAR:42},
  LEGENDARY:{DEFAULT:8,GOLD:16,DIAMOND:24,RAINBOW:32,BESKAR:40,GALACTIC:48,STELLAR:56},
  MYTHIC:{DEFAULT:10,GOLD:20,DIAMOND:30,RAINBOW:40,BESKAR:50,GALACTIC:60,STELLAR:70}
};
const upgradeChipRate=(d,variant)=>UPGRADE_CHIP_RATES[d?.rarity]?.[variant]||0;
// Upgrade Chips returned for selling a droid. Standard quality cannot be sold
// for chips, and Iconics have no quality tiers, so both fall through to 0.
const CHIP_SELL_VALUES={
  COMMON:{GOLD:4,DIAMOND:7,RAINBOW:10,BESKAR:13,GALACTIC:16,STELLAR:19},
  RARE:{GOLD:6,DIAMOND:9,RAINBOW:12,BESKAR:15,GALACTIC:18,STELLAR:21},
  EPIC:{GOLD:30,DIAMOND:33,RAINBOW:36,BESKAR:39,GALACTIC:42,STELLAR:45},
  LEGENDARY:{GOLD:84,DIAMOND:87,RAINBOW:90,BESKAR:93,GALACTIC:96,STELLAR:99},
  MYTHIC:{GOLD:192,DIAMOND:195,RAINBOW:198,BESKAR:201,GALACTIC:204,STELLAR:207}
};
const baseChipSellValue=(d,variant)=>CHIP_SELL_VALUES[d?.rarity]?.[variant]||0;
const chipSellBonusMultiplier=()=>1+Math.min(4,novaLevelFor('chip-sell-bonus'))*.5;
const chipSellValue=(d,variant)=>baseChipSellValue(d,variant)*chipSellBonusMultiplier();
const bb8CompanionActive=placed=>placed.some(x=>x.station==='COMPANION'&&x.name==='BB-8');
const LUCKY_UPGRADE_CHANCES={COMMON:0.32,RARE:0.16,EPIC:0.08,LEGENDARY:0.04,MYTHIC:0.02};
const luckyChance=d=>LUCKY_UPGRADE_CHANCES[d?.rarity]||0;
const luckyChanceLabel=d=>`${Math.round(luckyChance(d)*100)}%`;
const variantLabel=v=>v[0]+v.slice(1).toLowerCase();
const nextVariant=v=>VARIANTS[VARIANTS.indexOf(v)+1]||null;
const variantText=v=>`<span class="variant-text variant-${v.toLowerCase()}">${variantLabel(v)}</span>`;
const knownNumber=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const variantIncomeText=(d,v)=>knownNumber(d?.variants?.[v]?.income)?`${fmt(d.variants[v].income)}/s`:'Unknown';
const variantCostText=(d,v)=>knownNumber(d?.variants?.[v]?.cost)?`${fmt(d.variants[v].cost)} credits`:'Unknown';
const craftTimeText=seconds=>{const total=Math.round(Number(seconds)||0);if(!total)return '—';const hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60),secs=total%60;return [hours&&`${hours}h`,(minutes||hours)&&`${minutes}m`,`${secs}s`].filter(Boolean).join(' ')};
const rarityLabel=r=>String(r||'').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
const rarityClass=r=>`rarity-${String(r||'').toLowerCase()}`;
const rarityText=r=>`<span class="rarity-text ${rarityClass(r)}">${rarityLabel(r)}</span>`;
const rarityBadge=r=>`<span class="badge rarity-badge ${rarityClass(r)}">${rarityLabel(r)}</span>`;
const CREDIT_ICON='assets/events/Credits.png';
const creditAmount=n=>`<span class="credit-amount"><img src="${CREDIT_ICON}" alt="" loading="lazy">${fmt(n)} credits</span>`;
const maxRebirth=()=>Math.max(0,...(state.rebirths[state.cycle]||[]).map(rebirth=>Number(rebirth.to)||0),30);
const rebirthGoal=()=>Math.max(12,Math.min(maxRebirth(),Math.floor(Number(state.superRebirthGoal)||maxRebirth())));
const requirementWithinGoal=r=>Number(r.at??r.to)<=rebirthGoal();
function chipsToVariant(d,from,to){const start=VARIANTS.indexOf(from),end=VARIANTS.indexOf(to),costs=CHIP_COSTS[d.rarity]||{};if(start<0||end<=start)return 0;return VARIANTS.slice(start+1,end+1).reduce((sum,variant)=>sum+(costs[variant]||0),0)}
const OPTIMISE_FREE_BUILD_MODES=['upgrade-cost','rarity-income','unused-income'];
const optimiseFreeBuildMode=()=>OPTIMISE_FREE_BUILD_MODES.includes(state.optimiseFreeBuildMode)?state.optimiseFreeBuildMode:'upgrade-cost';
const optimiseFreeBuildModeLabel=mode=>({'upgrade-cost':'Highest upgrade cost','rarity-income':'Lowest rarity + earnings','unused-income':'No further use, lowest earnings'}[mode]||'Highest upgrade cost');
const optimiseFreeBuildModeHelp=mode=>({'upgrade-cost':'May sell droids needed for future Rebirths, starting with those that would cost the most Upgrade Chips to reach their required quality.','rarity-income':'May sell droids needed for future Rebirths, starting with the lowest-rarity and lowest-earning choices.','unused-income':'Never sells a droid that is still needed within your Super Rebirth Goal. It sells only droids with no further use, lowest earnings first; Build slots may remain occupied if safe storage is full.'}[mode]||'');
const rarityRank=d=>['COMMON','RARE','EPIC','LEGENDARY','MYTHIC','ICONIC'].indexOf(d?.rarity);
function futureUpgradeCostForUnit(unit,d){if(!d)return 0;const requirements=(state.rebirths[state.cycle]||[]).flatMap(r=>(r.requiredDroids||[]).filter(i=>i.droidName===unit.name&&r.to>state.rebirth&&r.to<=rebirthGoal()).map(i=>i.variant));if(!requirements.length)return 0;const target=requirements.reduce((best,variant)=>VARIANTS.indexOf(variant)>VARIANTS.indexOf(best)?variant:best,requirements[0]);return chipsToVariant(d,unit.variant,target)}
function optimiseStorageKeepScore(item){const d=state.droids.find(x=>x.name===item.unit.name),income=d?.variants[item.unit.variant]?.income||0;if(optimiseFreeBuildMode()==='rarity-income')return rarityRank(d)*1e9+income;if(optimiseFreeBuildMode()==='unused-income')return income;return -futureUpgradeCostForUnit(item.unit,d)}
function droidCycleStatus(d,ownedVariant,selected=true){const requirements=(state.rebirths[state.cycle]||[]).flatMap(r=>(r.requiredDroids||[]).filter(i=>i.droidName===d.name).map(i=>({at:r.to,variant:i.variant}))),future=requirements.filter(r=>r.at>state.rebirth&&requirementWithinGoal(r)),next=future.find(r=>r.at===state.rebirth+1),later=future.filter(r=>r.at>state.rebirth+1);if(!selected&&future.length)return{kind:'unused',label:'Duplicate · not used for rebirth'};if(next){const enough=VARIANTS.indexOf(ownedVariant)>=VARIANTS.indexOf(next.variant),chips=chipsToVariant(d,ownedVariant,next.variant);return enough?{kind:'current',label:`Next R: ${next.at} ${variantText(next.variant)}`}:{kind:'current-short',label:`Next R: ${next.at} · Upgrade to ${variantText(next.variant)} · ${fmt(chips)} chips`}}if(!later.length)return{kind:'unused',label:'No further rebirth use'};const max=later.reduce((best,item)=>VARIANTS.indexOf(item.variant)>VARIANTS.indexOf(best.variant)?item:best,later[0]),enough=VARIANTS.indexOf(ownedVariant)>=VARIANTS.indexOf(max.variant),chips=chipsToVariant(d,ownedVariant,max.variant),rebirths=[...new Set(later.map(item=>item.at))].join(', ');return enough?{kind:'ready',label:`Ready through R: ${max.at} ${variantText(max.variant)}`}:{kind:'upgrade',label:`R: ${rebirths} · Upgrade to ${variantText(max.variant)} · ${fmt(chips)} chips`}}
const FUSION_REBIRTH=3;
// Three Fusion Build slots, unlocked three different ways: the first comes with
// the room, the second with Fusion Tank 1, the third with Fusion Tank 2.
const FUSION_BUILD_SLOTS=3;
const SLOT_RULES={FUSION:{initial:0,unlocks:Array(3).fill(FUSION_REBIRTH)},FUSION_BUILD:{initial:0,unlocks:[FUSION_REBIRTH,99,99]},WORKER:{initial:4,unlocks:[1,4,7,10,12,14,16]},ASTROMECH:{initial:3,unlocks:[2,5,8,11,13,15]},BATTLE:{initial:2,unlocks:[3,6,9,17,18,19,20,21,22]},BUILD:{initial:1,unlocks:[1,2]},LOUNGE:{initial:5,unlocks:Array(8).fill(99)},COMPANION:{initial:2,unlocks:[]},UPGRADE_CHIP:{initial:1,unlocks:[]}};
// Astromech slots 1, 3, 5, 7 and 9 send droids on missions; the rest just earn.
// Mission slots are numbered as the Base shows them, so these are the indices.
const ASTROMECH_MISSION_SLOTS=[0,2,4,6,8];
// How the game picks a slot for you. It takes the free slot closest to where the
// droid was standing, so a station has no fill order of its own: refill the same
// station from two directions and you get near-opposite answers. The Lounge was
// swept twice to check. From Worker slots it filled 1,2,3,5,4,6,10,7,9,8; from
// Battle slots 10,9,8,7,6,4,1,5,2,3 — because Worker sits south of the Lounge and
// Battle north of it. Distance from the origin reproduces both, down to which half
// of the Lounge goes first. No single list can say that.
//
// Two things distance does not decide.
//
// Astromech puts its five mission slots — 1, 3, 5, 7 and 9 — ahead of every
// earning-only slot, from any origin. Mission slots were taken from both halves of
// the Lounge and every even slot came later regardless, so the first five
// Astromechs you send to work are the ones that go on missions.
//
// Battle is the one station distance cannot model. Both of its floors are drawn on
// the one map image, so the upstairs dots are hand-placed onto ground-floor
// coordinates and a flat gap cannot price the stairs. Scored against the slot log,
// nearest-from-origin gets 30 of 38 on the four single-floor sweeps and 3 of 10 on
// Battle. So Battle keeps the order a sweep actually produced — emptied and
// refilled a droid at a time, every landing naming the best slot still free — which
// beats a distance already known to be wrong. Plain slot order is not the fallback:
// it matches nothing that was observed. Give upstairs real coordinates and this
// entry can go.
//
//   Battle  11, 10, 5, 4, 9, 3, 8, 2, 7, 6, 1
//
// It does contradict an earlier pair test where Battle 1 and 6 were free and the
// droid took 1. No single list can explain both, and the origin is why — that pair
// test started somewhere else. Left standing rather than papered over.
//
// Companion needs no entry despite having no dots: nothing on the map is a distance
// from a slot that sits on you, so every gap comes back the same and the stable
// sort leaves slot order alone.
const MEASURED_FILL_ORDER={BATTLE:[10,9,4,3,8,2,7,1,6,5,0]};
// A station's slots in the order the game would take them for a droid arriving
// from `origin` ({station,slot}). No origin means nothing to measure from — a
// droid still in the roster has not stood anywhere yet — so slot order stands.
// The sort is stable, so equal gaps stay in slot order too.
const slotFillOrder=(station,origin)=>{
  const available=stationSlotIndices(station),measured=MEASURED_FILL_ORDER[station];
  const ordered=measured
    ?[...measured.filter(slot=>available.includes(slot)),...available.filter(slot=>!measured.includes(slot))]
    :origin
      ?available.map(slot=>({slot,gap:slotWalkGap(origin,{station,slot})})).sort((a,b)=>a.gap-b.gap).map(x=>x.slot)
      :available;
  if(station!=='ASTROMECH')return ordered;
  const mission=ordered.filter(slot=>ASTROMECH_MISSION_SLOTS.includes(slot));
  return[...mission,...ordered.filter(slot=>!ASTROMECH_MISSION_SLOTS.includes(slot))];
};
const TYPE_IMAGES={WORKER:'assets/types/Worker_Droid_-_Droid_-_Droid_Tycoon.png',ASTROMECH:'assets/types/Astromech_Droid_-_Droid_-_Droid_Tycoon.png',BATTLE:'assets/types/Battle_Droid_-_Droid_-_Droid_Tycoon.png'};
const novaLevelFor=id=>Math.max(0,Number(state.novaUpgrades?.[id]||0));
const stationName=type=>({FUSION:'Fusion',FUSION_BUILD:'Fusion Build',WORKER:'Worker',ASTROMECH:'Astromech',BATTLE:'Battle',BUILD:'Build',LOUNGE:'Lounge',COMPANION:'Companion',UPGRADE_CHIP:'Upgrade Chip',BLUEPRINT_STORAGE:'Blueprint Storage'}[type]||type);
const stationIcon=type=>TYPE_IMAGES[type]?`<img src="${TYPE_IMAGES[type]}" alt="">`:type==='UPGRADE_CHIP'?'<img src="assets/other/UpgradeChip.png" alt="">':type==='BUILD'?'⚒':type==='LOUNGE'?'◔':type==='BLUEPRINT_STORAGE'?'▣':'♟';
const loungeNovaSlots=()=>Math.max(novaLevelFor('lounge-slot'),state.loungePurchased||0);
const blueprintStorageSlots=()=>novaLevelFor('blueprint-storage');
const loungeSlotMeta=index=>index<5?{kind:'base',label:'Lounge slot'}:index<9?{kind:'rebirth',rebirth:index+12,label:`Unlocks at Rebirth ${index+12}`}:{kind:'nova',level:index-8,label:`Nova Shop Lounge Slot ${index-8}`};
const loungeSlotLabel=index=>loungeSlotMeta(index).label;
const lockedSlotLabel=(type,index)=>type==='FUSION_BUILD'&&fusionBuildTank(index)?`Needs Fusion Tank level ${fusionBuildTank(index)} — Nova Shop or Cantina`:type==='FUSION'||type==='FUSION_BUILD'?`Unlocks at Rebirth ${FUSION_REBIRTH}`:type==='COMPANION'&&index===1?'Unlock Second Companion in Nova Shop':type==='UPGRADE_CHIP'?'Unlock Upgrade Chip Station in Nova Shop':type==='LOUNGE'?loungeSlotLabel(index):`Unlocks at Rebirth ${slotUnlockRebirth(type,index)}`;
const loungeDivider=index=>index===5?'<div class="upper-level-divider"><span>Upper Level</span></div>':index===9?'<div class="upper-level-divider"><span>Nova Shop</span></div>':'';
// The Firing Range gained a second floor with the Rebirth 17-22 Battle slots.
// Battle is the only station split over two floors, so a slot number on its own
// does not tell you which one to walk to. Everything that names a Battle slot
// says the floor as well.
const BATTLE_UPSTAIRS_FROM=5;
// The eleven Worker slots stand in two places: eight on the round worker
// platform and, from the ninth unlocked onwards, three outside the main one.
const WORKER_MAIN_PLATFORM_FROM=8;
const slotFloor=(station,index)=>station==='BATTLE'?(index>=BATTLE_UPSTAIRS_FROM?'upstairs':'downstairs'):'';
const floorNote=(station,index)=>{const floor=slotFloor(station,index);return floor?` (${floor})`:''};
const stationSlotLabel=(station,index)=>`${stationName(station)} ${index+1}${floorNote(station,index)}`;
const slotDivider=(type,index)=>type==='LOUNGE'?loungeDivider(index):type==='BATTLE'&&index===BATTLE_UPSTAIRS_FROM?'<div class="upper-level-divider"><span>Second Floor</span></div>':type==='WORKER'&&index===WORKER_MAIN_PLATFORM_FROM?'<div class="upper-level-divider"><span>Outside Main Platform</span></div>':'';
const slotPurchaseKey=(type,index)=>`${type}:${index}`;
function slotUnlockRebirth(type,index){if(type==='LOUNGE'){const meta=loungeSlotMeta(index);return meta.kind==='rebirth'?meta.rebirth:null}
  // A Fusion Build slot that a tank opens is not waiting on a rebirth at all,
  // and it does not want buying twice: the tank was the purchase, whether it
  // came from the Nova Shop, a pack or V-Bucks. Returning null says both — no
  // rebirth to name, and nothing left to buy.
  if(type==='FUSION_BUILD'&&fusionBuildTank(index))return null;
  const rule=SLOT_RULES[type];return rule&&index>=rule.initial?rule.unlocks[index-rule.initial]??null:null}
// Fusion Tank is one upgrade with two levels, not two upgrades: level 1 opens
// the second Fusion Build slot and level 2 the third. The first comes with the
// room. Returns the tank level a slot needs, or 0 if it needs none.
const fusionBuildTank=index=>index;
function isSlotEligible(type,index,rebirth=state.rebirth){if(type==='FUSION'||type==='FUSION_BUILD'){
    // Nothing in the Fusion room exists before the room does.
    if(rebirth<FUSION_REBIRTH)return false;
    if(type==='FUSION')return index<3;
    const tank=fusionBuildTank(index);
    return index<FUSION_BUILD_SLOTS&&(!tank||novaLevelFor('fusion-tank')>=tank);
  }
  if(type==='LOUNGE'){const meta=loungeSlotMeta(index);return meta.kind==='base'||meta.kind==='rebirth'&&rebirth>=meta.rebirth||meta.kind==='nova'&&loungeNovaSlots()>=meta.level}if(type==='COMPANION')return index===0||index===1&&novaLevelFor('companion-slot')>=1;if(type==='UPGRADE_CHIP')return index===0&&novaLevelFor('upgrade-chip-station')>=1;const rule=SLOT_RULES[type];if(!rule)return false;if(index<rule.initial)return true;const unlock=slotUnlockRebirth(type,index);return unlock!==null&&rebirth>=unlock}
const isSlotPurchased=(type,index)=>slotUnlockRebirth(type,index)===null||state.purchasedSlots.includes(slotPurchaseKey(type,index));
const isSlotUnlocked=(type,index,rebirth=state.rebirth)=>isSlotEligible(type,index,rebirth)&&isSlotPurchased(type,index);
const stationSlotIndices=(type,rebirth=state.rebirth)=>Array.from({length:SLOT_RULES[type].initial+SLOT_RULES[type].unlocks.length},(_,i)=>i).filter(i=>isSlotUnlocked(type,i,rebirth));
const capacity=(type,rebirth=state.rebirth)=>type==='BLUEPRINT_STORAGE'?blueprintStorageSlots():stationSlotIndices(type,rebirth).length;
function eligibleRebirthSlots(rebirth=state.rebirth){return Object.keys(SLOT_RULES).flatMap(type=>Array.from({length:SLOT_RULES[type].initial+SLOT_RULES[type].unlocks.length},(_,index)=>({type,index,unlock:slotUnlockRebirth(type,index)}))).filter(x=>x.unlock!==null&&x.unlock<=rebirth)}
function autoPurchaseEligibleSlots(){if(!state.autoPurchaseSlots)return false;const bought=new Set(state.purchasedSlots),before=bought.size;eligibleRebirthSlots().forEach(x=>bought.add(slotPurchaseKey(x.type,x.index)));state.purchasedSlots=[...bought];return bought.size!==before}
function purchaseRebirthSlot(type,index,onDone){const unlock=slotUnlockRebirth(type,index);if(unlock===null||state.rebirth<unlock)return;const key=slotPurchaseKey(type,index);if(!state.purchasedSlots.includes(key))state.purchasedSlots.push(key);save();toast(`${type[0]+type.slice(1).toLowerCase()} slot purchased`);onDone?.()}
function expandedOwned(){return state.owned.flatMap((x,i)=>Array.from({length:x.qty},(_,unit)=>({...x,source:i,unit}))) }
function placements(){const occupied=Object.fromEntries(Object.keys(SLOT_RULES).map(type=>[type,new Set()])),placed=[],overflow=[],pending=[];const claim=(x,station,slot)=>{occupied[station].add(slot);placed.push({...x,station,slot})},firstFree=(station,origin)=>slotFillOrder(station,origin).find(i=>!occupied[station].has(i))??-1,standingAt=x=>{const slot=Number(x.preferredSlot);return SLOT_RULES[x.preferred]&&Number.isInteger(slot)?{station:x.preferred,slot}:null};for(const x of expandedOwned()){const station=x.preferred,slot=Number(x.preferredSlot);if(station&&SLOT_RULES[station]&&Number.isInteger(slot)&&isSlotUnlocked(station,slot)&&!occupied[station].has(slot))claim(x,station,slot);else pending.push(x)}for(const x of pending){const d=state.droids.find(y=>y.name===x.name),from=standingAt(x);let station,slot=-1;if(x.preferred&&SLOT_RULES[x.preferred]&&(slot=firstFree(x.preferred,from))>=0)station=x.preferred;else if((slot=firstFree(d.type,from))>=0)station=d.type;else if((slot=firstFree('BUILD',from))>=0)station='BUILD';station?claim(x,station,slot):overflow.push(x)}return{placed,overflow}}
function materializePlacements(p){const rows=[],indices=new Map();for(const x of [...p.placed,...p.overflow]){const index=rows.length,placed=Boolean(x.station);rows.push({name:x.name,variant:x.variant,qty:1,...(placed?{preferred:x.station,preferredSlot:x.slot}:x.preferred?{preferred:x.preferred}:{}),...(x.lockedSlot||x.lockedCompanion?{lockedSlot:true}:{}),...(x.built?{built:true}:{})});indices.set(`${x.source}:${x.unit}`,index)}state.owned=rows;return indices}
function movePlacedDroid(p,source,targetStation,targetSlot,target){const indices=materializePlacements(p),sourceRow=state.owned[indices.get(`${source.source}:${source.unit}`)];if(!sourceRow)return;const oldStation=source.station,oldSlot=source.slot;sourceRow.preferred=targetStation;sourceRow.preferredSlot=targetSlot;if(target){const targetRow=state.owned[indices.get(`${target.source}:${target.unit}`)];if(targetRow){targetRow.preferred=oldStation;targetRow.preferredSlot=oldSlot}}save()}
function toggleSlotLock(source,unit){const p=placements(),indices=materializePlacements(p),index=indices.get(`${source}:${unit}`),row=state.owned[index];if(!row)return;row.lockedSlot=!row.lockedSlot;save();toast(row.lockedSlot?'Droid slot locked for Optimise':'Droid slot unlocked')}
function moveUnitByKey(sourceKey,targetKey,onDone){const p=placements(),source=p.placed.find(x=>`${x.source}:${x.unit}`===sourceKey),target=p.placed.find(x=>`${x.source}:${x.unit}`===targetKey);if(!source||!target)return;movePlacedDroid(p,source,target.station,target.slot,target);onDone()}
function moveUnitToSlot(sourceKey,station,slot,onDone){const p=placements(),source=p.placed.find(x=>`${x.source}:${x.unit}`===sourceKey);if(!source)return;movePlacedDroid(p,source,station,slot,p.placed.find(x=>x.station===station&&x.slot===slot));onDone()}
// Dragging once locked the tab up with nothing logged, and the freeze survived a
// page refresh but not a browser restart — the mark of a drag the browser never
// finished, left running with the pointer captured. Re-rendering the Base inside
// the drop handler tore the dragged card out mid-drag and caused exactly that;
// the render is now deferred. Set to false to turn dragging off again if it
// returns — the swap button on each card does the same job.
const DRAG_AND_DROP_ENABLED=true;
// Holding Ctrl (or Cmd) turns a drag into a duplicate. Late-game bases end up
// with the same high earner standing in five slots, and filling those by hand is
// five trips through the picker: click the slot, type the name, pick the droid,
// pick the quality, confirm. Dragging one that is already placed says all of it.
const dragCopyWanted=e=>Boolean(e.ctrlKey||e.metaKey);
function copyPlacedDroid(source,station,slot,occupant){
  const d=state.droids.find(x=>x.name===source.name);if(!d)return false;
  // Copying onto an occupied slot would have to displace it, which is what a
  // plain drag already does. An empty slot is the only unambiguous target.
  if(occupant){toast('Ctrl-drag copies into an empty slot');return false}
  const limit=Number(d.special?.maxQuantity)||0;
  if(limit&&state.owned.filter(x=>x.name===d.name).reduce((sum,x)=>sum+x.qty,0)>=limit){toast(`${d.name} is limited to ${limit} in a base`);return false}
  commitOwned(d.name,source.variant,1,station,slot);
  return true;
}
function attachSlotDragAndDrop(p,rerender){if(!DRAG_AND_DROP_ENABLED)return;let dragged=null;const clear=()=>document.querySelectorAll('.base-slot,.map-pin').forEach(x=>x.classList.remove('drag-source','drag-target','drag-copy'));document.querySelectorAll('.base-slot.occupied[draggable="true"],.map-pin.filled[draggable="true"]').forEach(card=>{card.ondragstart=e=>{dragged=p.placed.find(x=>x.source===Number(card.dataset.source)&&x.unit===Number(card.dataset.unit));if(!dragged){e.preventDefault();return}card.classList.add('drag-source');e.dataTransfer.effectAllowed='copyMove';e.dataTransfer.setData('text/plain',`${dragged.source}:${dragged.unit}`)};card.ondragend=()=>{dragged=null;clear()}});document.querySelectorAll('.base-slot[data-slot-index],.map-pin[data-slot-station]').forEach(target=>{target.ondragover=e=>{if(!dragged||target.disabled)return;e.preventDefault();const copy=dragCopyWanted(e);e.dataTransfer.dropEffect=copy?'copy':'move';target.classList.add('drag-target');target.classList.toggle('drag-copy',copy)};target.ondragleave=()=>target.classList.remove('drag-target','drag-copy');target.ondrop=e=>{e.preventDefault();if(!dragged||target.disabled)return;const station=target.dataset.slotStation||target.dataset.station,index=Number(target.dataset.slotIndex);if(station===dragged.station&&index===dragged.slot){clear();return}const occupant=p.placed.find(x=>x.station===station&&x.slot===index);if(dragCopyWanted(e)){if(!copyPlacedDroid(dragged,station,index,occupant)){dragged=null;clear();return}}else movePlacedDroid(p,dragged,station,index,occupant);dragged=null;clear();
    // Re-render after the drop handler returns, never inside it. Rebuilding the
    // Base tears out the card being dragged, and if that happens before the
    // browser has finished the drag it can leave the drag running with the
    // pointer captured — the page stops responding with nothing in the console.
    setTimeout(rerender,0)}})}
const norm=s=>s.toUpperCase().replace(/[^A-Z0-9]/g,'');
function imageFor(droid,variant='DEFAULT'){
  if(variant==='STELLAR'&&droid.stellarImage)return droid.stellarImage;
  const aliases={'BU-4D':'B-U4D','LO':'L0','MONO-WALKER':'MONO-WLKR','OPTI-STRIKE':'OPTI-STRK','SENATE HOVERCAM':'SENATE HOVERCAM'}; const target=norm(aliases[droid.name]||droid.name);
  const imageVariant=variant,qualityPattern='Gold|Diamond|Rainbow|Beskar|Galactic|Stellar';
  const entries=Object.entries(state.images).filter(([k])=>norm(k.split(' - Droid')[0].replace(new RegExp(`\\(${qualityPattern}\\)`,'i'),''))===target);
  let match=entries.find(([k])=>imageVariant==='DEFAULT'?!new RegExp(`\\(${qualityPattern}\\)`,'i').test(k):new RegExp(`\\(${imageVariant}\\)`,'i').test(k));
  match ||= entries.find(([k])=>!new RegExp(`\\(${qualityPattern}\\)`,'i').test(k)) || entries[0]; return match?.[1]||'';
}
function picture(droid,variant='DEFAULT'){const src=imageFor(droid,variant);return src?`<img src="${src}" alt="${droid.name} ${variant.toLowerCase()} variant" loading="lazy">`:`<span class="fallback">${droid.name.slice(0,3)}</span>`}
function card(d){return `<a class="droid-card ${d.rarity.toLowerCase()}" href="#/droid/${slug(d.name)}"><div class="droid-image">${picture(d)}</div><div class="card-body">${rarityBadge(d.rarity)}<h3>${d.name}</h3><div class="card-meta"><span>${d.type}</span><span class="card-income">${isIconic(d)?`${iconicIncome(d)*100}%/s`:`${fmt(d.variants.DEFAULT.income)}/s`}</span></div></div></a>`}
const patchNotesSeenKey='droid-archive-seen-patch-notes';
const patchTodoTasks=()=>state.patchNotes.filter(x=>x.todo).map(x=>({id:x.todo.id||x.id,text:x.todo.text||x.title,done:x.todo.done??true,patchNote:true,date:x.date}));
function seenPatchNoteIds(){try{return JSON.parse(localStorage.getItem(patchNotesSeenKey)||'[]')}catch{return[]}}
function markPatchNotesSeen(notes){const seen=new Set(seenPatchNoteIds());notes.forEach(note=>seen.add(note.id));localStorage.setItem(patchNotesSeenKey,JSON.stringify([...seen]))}
function showPatchNotesOnce(){if(new URLSearchParams(location.search).get('companion')==='1'||patchNotesPrompted||!state.patchNotes.length)return;const seen=new Set(seenPatchNoteIds()),notes=state.patchNotes.filter(note=>note.showOnStartup!==false&&!seen.has(note.id));if(!notes.length)return;patchNotesPrompted=true;const root=document.querySelector('#modalRoot');root.innerHTML=`<div class="modal-backdrop patch-notes-backdrop"><section class="modal patch-notes-modal" role="dialog" aria-modal="true" aria-labelledby="patchNotesTitle"><p class="eyebrow">Droid Archives update</p><h2 id="patchNotesTitle">What's new?</h2><div class="patch-notes-list">${notes.map(note=>`<article><header><strong>${note.title}</strong>${note.date?`<time>${note.date}</time>`:''}</header>${note.summary?`<p>${note.summary}</p>`:''}${Array.isArray(note.changes)&&note.changes.length?`<ul>${note.changes.map(change=>`<li>${change}</li>`).join('')}</ul>`:''}</article>`).join('')}</div><div class="modal-actions"><button class="btn" id="patchNotesClose">Got it</button><a class="btn secondary" href="#/todo" id="patchNotesTodo">View To Do List</a></div></section></div>`;const close=()=>{markPatchNotesSeen(notes);root.innerHTML=''};root.querySelector('#patchNotesClose').onclick=close;root.querySelector('#patchNotesTodo').onclick=close}
function droidexEntry(name,variant){return state.droidex.find(x=>x.name===name&&x.variant===variant)}
function toggleDroidex(name,variant){const index=state.droidex.findIndex(x=>x.name===name&&x.variant===variant);index>=0?state.droidex.splice(index,1):state.droidex.push({name,variant,flawless:isDroidFlawless(name)});save()}
// Owning a droid records it in the Droidex. Recorded without saving so callers
// can batch a whole upgrade path into one write.
function recordDroidex(name,variant){if(!state.droids.some(d=>d.name===name))return false;if(droidexEntry(name,variant))return false;state.droidex.push({name,variant,flawless:isDroidFlawless(name)});return true}
// Upgrading passes through every quality on the way, and each one counts, so
// Standard to Beskar records Gold, Diamond and Rainbow as well. Downgrades
// record nothing: you never held the qualities you skipped back past.
function recordDroidexUpgrade(name,from,to){const start=VARIANTS.indexOf(from),end=VARIANTS.indexOf(to);let added=0;if(end>start)for(const variant of VARIANTS.slice(start+1,end+1))if(recordDroidex(name,variant))added++;return added}
// Build slots hold droids that are still being built. They cannot be moved and
// do not count for the Droidex until finished, so absence of the flag means
// unfinished — that way anything already sitting in Build reads as unfinished
// rather than being silently treated as done.
// A Fusion Build slot works like a Build slot: something sits in it unfinished
// until you mark it done, and while it does it must not be moved or sold.
const BUILDING_STATIONS=['BUILD','FUSION_BUILD'];
const isBuilding=x=>BUILDING_STATIONS.includes(x?.station)&&!x.built;
const rowIsBuilding=row=>row?.preferred==='BUILD'&&!row.built;
const autoCompleteBuilds=()=>Boolean(state.autoCompleteBuilds);
function toggleFlawless(name,variant){const d=state.droids.find(x=>x.name===name);if(onlyDefaultVariant(d)||!droidexEntry(name,variant))return;const flawless=!isDroidFlawless(name);state.droidex.filter(x=>x.name===name).forEach(x=>x.flawless=flawless);save()}
// The Droidex and flawless buttons join the row the page already rendered, so
// every action on a droid page sits in one flex line instead of being loose
// siblings glued together with stray text nodes. Presence of #toggleDex, not of
// the row itself, is what says these have already been added.
function addDetailDroidexControls(){if(!location.hash.startsWith('#/droid/')||document.querySelector('#toggleDex'))return;const add=document.querySelector('#addThis');if(!add)return;const row=add.parentElement,d=state.droids.find(x=>slug(x.name)===location.hash.split('/')[2]);const active=document.querySelector('.variant-tabs button.active');if(!d)return;const variant=isIconic(d)?'DEFAULT':active?.dataset.v||'DEFAULT',entry=droidexEntry(d.name,variant),flawless=isDroidFlawless(d.name);const redraw=()=>{row.querySelectorAll('#toggleDex,#toggleFlawless').forEach(node=>node.remove());addDetailDroidexControls()};row.insertAdjacentHTML('beforeend',`<button class="btn secondary" id="toggleDex">${entry?'Remove from':'Add to'} Droidex</button>${isIconic(d)?'':`<button class="flawless-toggle ${flawless?'active':''}" id="toggleFlawless" ${entry?'':'disabled'}>✦ ${flawless?'Flawless':'Mark flawless'}</button>`}`);document.querySelector('#toggleDex').onclick=()=>{toggleDroidex(d.name,variant);toast(entry?'Removed from Droidex':'Added to Droidex');redraw()};const flawlessButton=document.querySelector('#toggleFlawless');if(flawlessButton)flawlessButton.onclick=()=>{toggleFlawless(d.name,variant);redraw()}}
// ---- Fusion Lab -----------------------------------------------------------
// Three droids go in, one comes out. The recipes are data, so this page is a
// rendering of data/fusion.json rather than anything hand-maintained.
const fusionRecipes=()=>state.fusion?.recipes||[];
const fusionDroid=name=>state.droids.find(d=>d.name===String(name||'').toUpperCase());
// How many of a droid you hold, counting every variant: fusion consumes the
// droid, not a particular quality of it.
const fusionOwnedCount=name=>{const d=fusionDroid(name);return d?state.owned.filter(x=>x.name===d.name).reduce((total,x)=>total+(Number(x.qty)||1),0):0};
// A recipe needs three droids and the same one can appear twice, so what
// matters is whether you hold enough of each, not whether you hold any.
function fusionNeed(recipe){
  const wanted=new Map();
  for(const input of recipe.inputs)wanted.set(input,(wanted.get(input)||0)+1);
  const parts=[...wanted].map(([name,need])=>{const have=fusionOwnedCount(name);return{name,need,have,short:Math.max(0,need-have)}});
  return{parts,ready:parts.every(part=>part.short===0),missing:parts.filter(part=>part.short>0)};
}
// Which results you are working towards. Drives the Fusion Outlook on Base.
const FUSION_WANTED_KEY='droid-archive-fusion-wanted';
function fusionWanted(){try{return new Set(JSON.parse(localStorage.getItem(FUSION_WANTED_KEY)||'[]'))}catch{return new Set()}}
function setFusionWanted(names){localStorage.setItem(FUSION_WANTED_KEY,JSON.stringify([...names]));}
function toggleFusionWanted(name){const wanted=fusionWanted();wanted.has(name)?wanted.delete(name):wanted.add(name);setFusionWanted(wanted);return wanted.has(name)}
function fusionCardHtml(name,role,stock){
  const d=fusionDroid(name);
  const art=d?picture(d,'DEFAULT'):'<div class="fusion-blank" aria-hidden="true">?</div>';
  const rarity=d?`<em class="fusion-rarity rarity-${String(d.rarity).toLowerCase()}">${escapeAttr(d.rarity)}</em>`:'';
  const label=escapeAttr(d?d.name:name);
  // "2 of 2" reads better than a tick when a recipe wants two of the same droid.
  const held=stock?`<em class="fusion-stock ${stock.short?'is-short':'is-held'}">${stock.have} of ${stock.need}</em>`:'';
  const inner=`${rarity}<div class="fusion-art">${art}</div><strong>${label}</strong>${held}`;
  return d
    ? `<a class="fusion-card fusion-${role}" href="#/droid/${slug(d.name)}">${inner}</a>`
    : `<div class="fusion-card fusion-${role} is-unknown">${inner}</div>`;
}
// What the droids you are tracking still need. It renders even with nothing
// tracked: an empty panel that says where to pick some is findable, whereas a
// panel that only appears once you have already found the Fusion Lab is not —
// and its Hide button cannot exist before the panel does.
// Every recipe a droid is an ingredient for, with the rest of that recipe's
// ingredients and whether you hold them. Shown in the droid picker so choosing
// what to put in a Fusion slot does not mean going and looking it up.
const fusionHintsEnabled=()=>localStorage.getItem('droid-archive-picker-fusion-hints')!=='0';
function fusionUsesHtml(name){
  if(!fusionHintsEnabled())return'';
  const uses=fusionRecipes().filter(recipe=>recipe.inputs.includes(name));
  if(!uses.length)return'';
  const rows=uses.map(recipe=>{
    const need=fusionNeed(recipe);
    const others=need.parts.filter(part=>part.name!==name)
      .map(part=>`<em class="${part.short?'is-short':'is-held'}">${escapeAttr(part.name)}${part.need>1?` x${part.need}`:''}</em>`).join(' + ');
    return `<span class="fusion-use ${need.ready?'is-ready':''}"><b>${escapeAttr(recipe.name)}</b>${others?` &larr; ${others}`:''}</span>`;
  }).join('');
  return `<small class="fusion-uses">${rows}</small>`;
}

// ---- Fusing ---------------------------------------------------------------
// Three droids in the Fusion slots become one in a Fusion Build slot. A known
// recipe names the result; anything else produced an ordinary droid and we ask
// which, because that is the thing nobody has written down yet.
const fusionKey=names=>[...names].map(name=>String(name).toUpperCase()).sort().join('+');
const fusionRecipeFor=names=>{const key=fusionKey(names);return fusionRecipes().find(recipe=>fusionKey(recipe.inputs)===key)||null};
const FUSION_LOG_KEY='droid-archive-fusion-log';
function fusionLogAll(){try{const rows=JSON.parse(localStorage.getItem(FUSION_LOG_KEY)||'[]');return Array.isArray(rows)?rows:[]}catch{return[]}}
function fusionLogAdd(row){const rows=fusionLogAll();rows.push({...row,at:new Date().toISOString()});localStorage.setItem(FUSION_LOG_KEY,JSON.stringify(rows.slice(-500)));}
// What each combination has produced so far, most seen first. This is the point
// of recording them: which inputs give which result, and how often.
function fusionLogSummary(){
  const byKey=new Map();
  for(const row of fusionLogAll()){
    const key=fusionKey(row.inputs||[]);
    const entry=byKey.get(key)||{key,inputs:row.inputs||[],total:0,results:new Map()};
    entry.total++;
    const label=`${row.result?.name||'?'}${row.result?.rarity?` (${row.result.rarity})`:''}`;
    entry.results.set(label,(entry.results.get(label)||0)+1);
    byKey.set(key,entry);
  }
  return [...byKey.values()].map(entry=>({...entry,results:[...entry.results].sort((a,b)=>b[1]-a[1])}))
    .sort((a,b)=>b.total-a.total);
}
const firstFreeFusionBuildSlot=()=>{const placed=placements().placed;return stationSlotIndices('FUSION_BUILD').find(index=>!placed.some(x=>x.station==='FUSION_BUILD'&&x.slot===index))??-1};
// Everything currently sitting in the Fusion slots.
const fusionSlotUnits=()=>placements().placed.filter(x=>x.station==='FUSION').sort((a,b)=>a.slot-b.slot);
function runFusion(onDone){
  const units=fusionSlotUnits();
  if(units.length<3)return toast('Fusion needs three droids in the Fusion slots');
  const free=firstFreeFusionBuildSlot();
  if(free<0)return toast('Every Fusion Build slot is busy');
  const names=units.map(unit=>unit.name);
  const recipe=fusionRecipeFor(names);
  const finish=(result)=>{
    // Take the three out before putting the result in, so the fused droids are
    // spent whatever the outcome was.
    const indices=materializePlacements(placements());
    const rows=units.map(unit=>indices.get(`${unit.source}:${unit.unit}`)).filter(index=>Number.isInteger(index)).sort((a,b)=>b-a);
    for(const index of rows)removeOwnedUnit(index);
    commitOwned(result.name,result.variant||'DEFAULT',1,'FUSION_BUILD',free);
    fusionLogAdd({inputs:units.map(unit=>({name:unit.name,variant:unit.variant})),
      result:{name:result.name,variant:result.variant||'DEFAULT',rarity:result.rarity||state.droids.find(d=>d.name===result.name)?.rarity||''},
      matched:Boolean(recipe)});
    save();
    toast(`Fused into ${variantLabel(result.variant||'DEFAULT')} ${result.name}`);
    onDone?.();
  };
  const outcome=fusionOutcome(units);
  if(outcome&&outcome.kind==='capped')return toast(`${outcome.name} is already ${variantLabel(outcome.variant)}, the top quality`);
  if(outcome&&(outcome.kind==='recipe'||outcome.kind==='quality'))return finish({name:outcome.name,variant:outcome.variant,rarity:outcome.rarity});
  showFusionResultPrompt(names,finish,outcome);
}
// No recipe matched, so the game made something ordinary. Which one is the
// measurement, so it is asked rather than guessed.
function showFusionResultPrompt(names,onPick,outcome){
  const root=document.querySelector('#modalRoot');
  // A rarity step fixes the rarity and the quality but not which droid, so
  // only that rarity is worth offering.
  const stepped=outcome&&outcome.kind==='rarity';
  const variant=outcome?.variant||'DEFAULT';
  const choices=state.droids.filter(d=>!isFusion(d)&&(!stepped||d.rarity===outcome.rarity)).sort((a,b)=>a.name.localeCompare(b.name));
  root.innerHTML=`<div class="modal-backdrop"><section class="modal slot-picker" role="dialog" aria-modal="true">
    <p class="eyebrow">Droid Fusion</p><h2>What came out?</h2>
    <p class="picker-hint">${names.map(escapeAttr).join(' + ')} ${stepped?`rolls a ${rarityLabel(outcome.rarity)} at ${variantLabel(variant)} — the rarity and the quality are settled, the droid is not. Pick which one came out`:'is not a combination anyone has recorded. Pick what it produced'} and it goes in the log, so the next person knows.</p>
    <input id="fusionResultSearch" class="form-control picker-search" placeholder="Search droids…" autofocus>
    <div id="fusionResultList" class="picker-results"></div>
    <div class="modal-actions"><button class="btn ghost" id="fusionResultCancel" type="button">Cancel</button></div></section></div>`;
  const draw=()=>{
    const query=root.querySelector('#fusionResultSearch').value.toLowerCase();
    root.querySelector('#fusionResultList').innerHTML=choices.filter(d=>d.name.toLowerCase().includes(query))
      .map(d=>`<button class="picker-droid" data-result="${escapeAttr(d.name)}"><span>${picture(d)}</span><b>${escapeAttr(d.name)}</b><small>${rarityText(d.rarity)} &middot; ${d.type}</small></button>`).join('')||'<p class="roster-empty">No matching droids.</p>';
    root.querySelectorAll('[data-result]').forEach(button=>button.onclick=()=>{
      const d=state.droids.find(x=>x.name===button.dataset.result);
      root.innerHTML='';
      onPick({name:d.name,variant,rarity:d.rarity});
    });
  };
  root.querySelector('#fusionResultSearch').oninput=draw;
  root.querySelector('#fusionResultCancel').onclick=()=>root.innerHTML='';
  draw();
}

// ---- What a fusion produces ----------------------------------------------
// Quality is decided by the worst droid in the room: two Stellar and a Rainbow
// come out Rainbow. That is the whole reason a Fusion droid has to be fused at
// the quality you want - unlike every other droid it cannot be upgraded after.
const RARITY_LADDER=['COMMON','RARE','EPIC','LEGENDARY','MYTHIC'];
const rarityStep=rarity=>RARITY_LADDER.indexOf(String(rarity||'').toUpperCase());
const nextRarity=rarity=>RARITY_LADDER[rarityStep(rarity)+1]||'';
const variantStep=variant=>Math.max(0,VARIANTS.indexOf(variant));
const lowestVariant=variants=>variants.reduce((low,variant)=>variantStep(variant)<variantStep(low)?variant:low,variants[0]||'DEFAULT');
const droidRarity=name=>fusionDroid(name)?.rarity||'';
// Three droids in, one out. A recorded recipe wins and names its result: those
// are the combinations that make the Fusion droids, and the game special cases
// them - three different Epics normally step up to a Legendary, but the three
// N-UL wants make N-UL, which is itself an Epic.
// Everything else follows the ladder. Three of one droid at one quality give
// that same droid back a quality higher, which is the one step you can aim at.
// Three that merely share a rarity step the rarity up and hold the quality, and
// there the droid itself is a roll - only the rarity and the quality are settled.
function fusionOutcome(units){
  const rows=(units||[]).slice(0,3).map(row=>({name:row.name,variant:row.variant||'DEFAULT'}));
  if(rows.length<3)return null;
  const variant=lowestVariant(rows.map(row=>row.variant));
  const mixedQuality=rows.some(row=>row.variant!==rows[0].variant);
  const recipe=fusionRecipeFor(rows.map(row=>row.name));
  if(recipe)return{kind:'recipe',name:recipe.name,rarity:recipe.rarity,variant,mixedQuality,recipe};
  const names=[...new Set(rows.map(row=>row.name))];
  if(names.length===1){
    const d=fusionDroid(names[0]);
    // Three of one droid at three different qualities is not something anyone
    // has written down, so it is asked rather than guessed at.
    if(mixedQuality)return{kind:'unknown',variant,mixedQuality};
    if(d&&isIconic(d))return{kind:'unknown',variant,mixedQuality};
    const own=droidRarity(names[0]);
    if(nextVariant(variant))return{kind:'quality',name:names[0],rarity:own,variant:nextVariant(variant),from:variant,mixedQuality};
    // Stellar has nothing above it, so three Stellar of one droid roll a rarity
    // instead: three Legendary Stellar make a random Mythic Stellar. A Mythic
    // has no rarity above it either and rolls into another random Mythic
    // Stellar rather than being a dead end.
    if(own)return{kind:'rarity',rarity:nextRarity(own)||own,from:own,variant,mixedQuality};
    return{kind:'capped',name:names[0],rarity:own,variant,mixedQuality};
  }
  const rarities=[...new Set(rows.map(row=>droidRarity(row.name)))];
  if(rarities.length===1&&rarities[0]&&nextRarity(rarities[0]))
    return{kind:'rarity',rarity:nextRarity(rarities[0]),from:rarities[0],variant,mixedQuality};
  return{kind:'unknown',variant,mixedQuality};
}
// One line saying what the three in the slots are about to become.
function fusionOutcomeText(outcome){
  if(!outcome)return'';
  const q=variantText(outcome.variant);
  if(outcome.kind==='recipe')return `<strong>${escapeAttr(outcome.name)}</strong> &middot; ${rarityText(outcome.rarity)} &middot; ${q}`;
  if(outcome.kind==='quality')return `<strong>${escapeAttr(outcome.name)}</strong> &middot; ${rarityText(outcome.rarity)} &middot; ${q} <em>(a quality up from ${variantLabel(outcome.from)})</em>`;
  if(outcome.kind==='capped')return `<strong>${escapeAttr(outcome.name)}</strong> is already ${variantLabel(outcome.variant)}, the top quality`;
  if(outcome.kind==='rarity')return `a random ${rarityText(outcome.rarity)} droid &middot; ${q} <em>(a rarity up from ${rarityLabel(outcome.from)})</em>`;
  return `<em>No recorded result for this combination${outcome.mixedQuality?' at mixed qualities':''}. Fusing it records what comes out.</em>`;
}

// ---- What your base could fuse --------------------------------------------
// Everything you own, counted by droid and by quality, because a fusion cares
// about both.
function fusionStock(){
  const stock=new Map();
  for(const row of state.owned||[]){
    const variant=row.variant||'DEFAULT';
    if(!stock.has(row.name))stock.set(row.name,new Map());
    const byVariant=stock.get(row.name);
    byVariant.set(variant,(byVariant.get(variant)||0)+(Number(row.qty)||1));
  }
  return stock;
}
// Copies held at this quality or better. Putting a Stellar into a Gold fusion
// is allowed, just wasteful, so a better copy still counts as cover.
function fusionCountFrom(byVariant,variant){
  if(!byVariant)return 0;
  const floor=variantStep(variant);
  let total=0;
  for(const [held,count] of byVariant)if(variantStep(held)>=floor)total+=count;
  return total;
}
const fusionRecipeWants=recipe=>{const wanted=new Map();for(const input of recipe.inputs)wanted.set(input,(wanted.get(input)||0)+1);return wanted};
// The best quality a recipe could come out at: the highest one where every
// ingredient is covered at that quality or better.
function fusionBestVariant(recipe,stock){
  const wanted=fusionRecipeWants(recipe);
  for(let i=VARIANTS.length-1;i>=0;i--){
    const variant=VARIANTS[i];
    if([...wanted].every(([name,need])=>fusionCountFrom(stock.get(name),variant)>=need))return variant;
  }
  return'';
}
// Three of one droid at one quality make that droid a quality higher.
function fusionQualitySteps(stock){
  const steps=[];
  for(const [name,byVariant] of stock){
    const d=fusionDroid(name);
    if(!d||isIconic(d))continue;
    for(const [variant,count] of byVariant){
      const up=nextVariant(variant);
      if(count<3||!up)continue;
      steps.push({name,rarity:d.rarity,from:variant,to:up,sets:Math.floor(count/3),have:count});
    }
  }
  return steps.sort((a,b)=>variantStep(b.to)-variantStep(a.to)||a.name.localeCompare(b.name));
}
// Three droids that are not the same but share a rarity and a quality step the
// rarity up and keep the quality.
function fusionRaritySteps(stock){
  const groups=new Map();
  for(const [name,byVariant] of stock){
    const d=fusionDroid(name);
    if(!d||isIconic(d))continue;
    for(const [variant,count] of byVariant){
      // A Mythic only fuses at the top quality, where it rerolls into another
      // Mythic; below that it has nowhere to go.
      if(!nextRarity(d.rarity)&&nextVariant(variant))continue;
      const key=`${d.rarity}|${variant}`;
      const group=groups.get(key)||{rarity:d.rarity,variant,names:[],holdings:[],copies:0};
      group.names.push(name);
      group.holdings.push([name,count]);
      group.copies+=count;
      groups.set(key,group);
    }
  }
  return [...groups.values()].filter(group=>group.copies>=3
      // Three of one droid come out a quality higher instead - unless the
      // quality ladder has run out, and then they roll like anything else.
      &&!(group.names.length===1&&nextVariant(group.variant))
      // Only three of one droid are known to roll at the top rarity; three
      // different Mythics are not something anyone has written down.
      &&!(!nextRarity(group.rarity)&&group.names.length>1)
      &&!(group.names.length===3&&group.copies===3&&fusionRecipeFor(group.names)))
    .map(group=>({...group,to:nextRarity(group.rarity)||group.rarity,sets:Math.floor(group.copies/3),names:group.names.sort()}))
    .sort((a,b)=>rarityStep(b.rarity)-rarityStep(a.rarity)||variantStep(b.variant)-variantStep(a.variant));
}
// A Fusion droid is fused at the quality you want or not at all, so the useful
// question on the Base is not just "can I make this" but "how good a one".
// ---- Fusing what you no longer need ---------------------------------------
const droidIncomeAt=(name,variant)=>fusionDroid(name)?.variants?.[variant]?.income||0;
// A roll does not say which droid arrives, so the middle earner of that rarity
// and quality is the honest guess at what one is worth.
function typicalIncomeFor(rarity,variant){
  const rows=state.droids.filter(d=>d.rarity===rarity&&!isIconic(d)&&d.variants?.[variant]?.income>0)
    .map(d=>d.variants[variant].income).sort((a,b)=>a-b);
  return rows.length?rows[Math.floor(rows.length/2)]:0;
}
// Copies you can spend without costing yourself a rebirth: everything of a droid
// the rest of the cycle never asks for, and the duplicates of one it does. The
// best copy of anything still wanted is held back, even when it is too low a
// quality yet, because that is the copy you would be upgrading.
function fusionSpareStock(){
  const wanted=new Set(futureRequirements().map(req=>req.droidName));
  const spare=new Map();
  for(const [name,byVariant] of fusionStock()){
    let held=!wanted.has(name);
    for(const [variant,count] of [...byVariant].sort((a,b)=>variantStep(b[0])-variantStep(a[0]))){
      let free=count;
      if(!held){free--;held=true}
      if(free>0){if(!spare.has(name))spare.set(name,new Map());spare.get(name).set(variant,free)}
    }
  }
  return spare;
}
// Ways to reach a droid the cycle still wants and you cannot field. A recipe or
// three of the droid itself is a certainty; three of the rarity below is a roll
// that could land on it, which is worth knowing before those three are sold.
function fusionRoutesToNeeded(){
  const spare=fusionSpareStock(),stock=fusionStock(),routes=[];
  const wanted=new Map();
  for(const req of futureRequirements()){
    if(hasRequirement(req))continue;
    const prev=wanted.get(req.droidName);
    if(!prev||variantStep(req.variant)>variantStep(prev.variant))wanted.set(req.droidName,req);
  }
  for(const [name,req] of wanted){
    const d=fusionDroid(name);
    if(!d||isIconic(d))continue;
    const at=req.variant;
    const recipe=fusionRecipes().find(entry=>entry.name===name);
    if(recipe){
      const best=fusionBestVariant(recipe,stock);
      if(best&&variantStep(best)>=variantStep(at))routes.push({name,at,rebirth:req.at,kind:'recipe',sure:true,inputs:recipe.inputs});
    }
    // At the top rarity the roll comes from that same rarity rather than the
    // one below, because there is no rarity below to step up from.
    const rollFrom=nextRarity(d.rarity)?RARITY_LADDER[rarityStep(d.rarity)-1]:d.rarity;
    const below=VARIANTS[variantStep(at)-1];
    if(below&&(stock.get(name)?.get(below)||0)>=3)routes.push({name,at,rebirth:req.at,kind:'quality',sure:true,from:below});
    const under=rollFrom;
    if(under){
      const pool=[];
      let copies=0;
      for(const [other,byVariant] of spare){
        const od=fusionDroid(other);
        if(!od||isIconic(od)||od.rarity!==under)continue;
        const held=fusionCountFrom(byVariant,at);
        if(held>0){pool.push(other);copies+=held}
      }
      // Three of one droid only roll once the quality ladder has run out;
      // below that they would come back as that same droid a quality up.
      if(copies>=3&&(pool.length>1||!nextVariant(at)))
        routes.push({name,at,rebirth:req.at,kind:'roll',sure:false,pool:pool.sort(),rarity:d.rarity,from:under});
    }
  }
  return routes.sort((a,b)=>a.rebirth-b.rebirth||a.name.localeCompare(b.name)||(b.sure?1:0)-(a.sure?1:0));
}
// Spend the least good copies that still qualify, so a better one survives for
// whatever the next step wants.
function fusionSpendFrom(stock,name,variant,need){
  const byVariant=stock.get(name);
  if(!byVariant)return null;
  const floor=variantStep(variant);
  const options=[...byVariant].filter(([held])=>variantStep(held)>=floor).sort((a,b)=>variantStep(a[0])-variantStep(b[0]));
  const spend=[];
  let left=need;
  for(const [held,count] of options){
    if(left<=0)break;
    const use=Math.min(left,count);
    spend.push({name,variant:held,count:use});
    left-=use;
  }
  return left>0?null:spend;
}
// One fusion the pool could make right now. A result that fills a Droidex square
// wins outright: those cannot be bought back, while a better earner can. After
// that a certain result beats a roll, and then it is simply the bigger gain.
function fusionBestFrom(stock,floor,made){
  const options=[];
  const usesMade=spend=>[...new Set(spend.map(part=>made.get(part.name+'|'+part.variant)).filter(i=>i!==undefined))];
  for(const recipe of fusionRecipes()){
    const at=fusionBestVariant(recipe,stock);
    if(!at)continue;
    const spend=[];
    let ok=true;
    for(const [name,need] of fusionRecipeWants(recipe)){
      const part=fusionSpendFrom(stock,name,at,need);
      if(!part){ok=false;break}
      spend.push(...part);
    }
    if(!ok)continue;
    options.push({kind:'recipe',out:{name:recipe.name,variant:at},spend,sure:true,
      income:droidIncomeAt(recipe.name,at),fills:droidexGapFor(recipe.name,at),after:usesMade(spend)});
  }
  for(const step of fusionQualitySteps(stock)){
    const spend=[{name:step.name,variant:step.from,count:3}];
    options.push({kind:'quality',out:{name:step.name,variant:step.to},spend,sure:true,
      income:droidIncomeAt(step.name,step.to),fills:droidexGapFor(step.name,step.to),after:usesMade(spend)});
  }
  for(const group of fusionRaritySteps(stock)){
    const spend=[];
    let owed=3;
    for(const [name,count] of group.holdings){
      if(owed<=0)break;
      const use=Math.min(owed,count);
      spend.push({name,variant:group.variant,count:use});
      owed-=use;
    }
    if(owed>0)continue;
    // A roll does not say which droid arrives, so nothing goes back in the pool
    // and no Droidex square can be promised.
    options.push({kind:'rarity',out:null,rarity:group.to,variant:group.variant,from:group.rarity,pool:group.names,spend,sure:false,
      income:typicalIncomeFor(group.to,group.variant),fills:false,after:usesMade(spend)});
  }
  const worth=options.filter(option=>option.income>floor||option.fills);
  if(!worth.length)return null;
  const rank=option=>(option.fills?1e12:0)+(option.sure?1e6:0)+(option.income-floor);
  return worth.sort((a,b)=>rank(b)-rank(a))[0];
}
const droidexGapFor=(name,variant)=>{const d=fusionDroid(name);return Boolean(d)&&!isIconic(d)&&!droidexEntry(name,variant)};
// What the Sell list could become instead of being sold. Every fusion takes
// three droids out of the pool and puts one back, so a later step can spend what
// an earlier one made - which is the whole point. Three spare Diamond Mythics
// are not just a Rainbow Mythic; they are the third Rainbow that two spare ones
// were waiting for, and together those are a Beskar.
function fusionChainFromSpares(spares,placed){
  const stock=new Map();
  const add=(name,variant,count=1)=>{if(!stock.has(name))stock.set(name,new Map());const byVariant=stock.get(name);byVariant.set(variant,(byVariant.get(variant)||0)+count)};
  const take=(name,variant,count=1)=>{const byVariant=stock.get(name);if(!byVariant)return;const left=(byVariant.get(variant)||0)-count;left>0?byVariant.set(variant,left):byVariant.delete(variant);if(!byVariant.size)stock.delete(name)};
  for(const unit of spares||[])add(unit.name,unit.variant||'DEFAULT',Number(unit.qty)||1);
  if(!stock.size)return[];
  const earning=(placed||[]).filter(x=>PRODUCTIVE_STATIONS.includes(x.station)).map(x=>droidIncomeAt(x.name,x.variant));
  const slots=PRODUCTIVE_STATIONS.reduce((total,type)=>total+capacity(type),0);
  const floor=earning.length<slots?0:Math.min(...earning);
  const steps=[],made=new Map();
  // Each round re-reads the pool, so the chain stops on its own once nothing
  // left is worth more than the weakest droid already earning.
  for(let round=0;round<12;round++){
    const pick=fusionBestFrom(stock,floor,made);
    if(!pick)break;
    for(const part of pick.spend)take(part.name,part.variant,part.count);
    if(pick.out){add(pick.out.name,pick.out.variant);made.set(pick.out.name+'|'+pick.out.variant,steps.length)}
    steps.push({...pick,gain:pick.income-floor,step:steps.length+1});
  }
  return steps;
}
// The Fusion station on the Base, saying what the three in the slots are about
// to become while they can still be swapped out.
function fusionPreviewHtml(){
  const units=fusionSlotUnits();
  if(!units.length)return'';
  const held=units.map(unit=>`<span class="fusion-preview-in">${escapeAttr(unit.name)} ${variantText(unit.variant)}</span>`).join('');
  if(units.length<3)return `<div class="fusion-preview is-waiting"><span class="fusion-preview-inputs">${held}</span><em class="fusion-preview-out">Fill all three slots to see what they make.</em></div>`;
  const outcome=fusionOutcome(units);
  return `<div class="fusion-preview is-${outcome?.kind||'unknown'}"><span class="fusion-preview-inputs">${held}</span><span class="fusion-preview-out"><b>Makes</b> ${fusionOutcomeText(outcome)}</span></div>`;
}
// Expanding a ladder row. The names alone say which droids qualify but not
// which quality they are held at or where they are standing, and both decide
// whether spending them is actually free. `at` is the floor the row asks for,
// so only copies at that quality or better are worth showing.
function fusionPoolDetailHtml(names,at,label){
  if(!names.length)return'';
  const stock=fusionStock(),located=requirementLocations(),floor=variantStep(at);
  const cards=names.map(name=>{
    const d=fusionDroid(name);
    const held=[...(stock.get(name)||new Map())].filter(([variant])=>variantStep(variant)>=floor)
      .sort((a,b)=>variantStep(b[0])-variantStep(a[0]));
    const best=held[0]?.[0]||at;
    const where=[...new Set(held.map(([variant])=>located.get(`${name}:${variant}`)).filter(Boolean))];
    const counts=held.map(([variant,count])=>`${variantText(variant)}${count>1?` &times;${count}`:''}`).join(', ');
    return `<span class="fusion-pool-card">${picture(d,best)}<b>${escapeAttr(name)}</b><small>${counts||variantText(at)}</small><em>${where.length?where.join(' &middot; '):'Not placed'}</em></span>`;
  }).join('');
  return `<details class="fusion-pool"><summary>${label||`${names.length} droid${names.length===1?'':'s'} to choose from`}</summary><div class="fusion-pool-grid">${cards}</div></details>`;
}
function fusionOutlookHtml(){
  const all=fusionRecipes();
  if(!all.length)return'';
  const wanted=fusionWanted(),stock=fusionStock();
  const best=new Map(all.map(recipe=>[recipe.name,fusionBestVariant(recipe,stock)]));
  const tracked=all.filter(recipe=>wanted.has(recipe.name));
  const spare=all.filter(recipe=>!wanted.has(recipe.name)&&best.get(recipe.name));
  const quality=fusionQualitySteps(stock),rarity=fusionRaritySteps(stock),routes=fusionRoutesToNeeded();
  const recipeRow=recipe=>{
    const need=fusionNeed(recipe),at=best.get(recipe.name);
    const parts=need.parts.map(part=>`<span class="fusion-outlook-part ${part.short?'is-short':'is-held'}">${escapeAttr(part.name)} <em>${part.have}/${part.need}</em></span>`).join('');
    return `<li class="${at?'is-ready':''}"><a href="#/fusion-lab"><strong>${escapeAttr(recipe.name)}</strong></a> ${rarityText(recipe.rarity)}
      <span class="fusion-outlook-parts">${parts}</span>
      <em class="fusion-outlook-state">${at?`Ready &middot; best at ${variantText(at)}`:`Short ${need.missing.reduce((total,part)=>total+part.short,0)}`}</em></li>`;
  };
  const trackedBlock=tracked.length
    ?`<ul>${tracked.map(recipeRow).join('')}</ul>`
    :`<p class="fusion-outlook-empty">Nothing tracked yet. Pick the droids you are working towards in the <a href="#/fusion-lab">Fusion Lab</a> and what they still need shows up here.</p>`;
  const spareBlock=spare.length?`<div class="fusion-outlook-block"><h3>Also ready from what you hold</h3>
    <ul>${spare.map(recipeRow).join('')}</ul></div>`:'';
  const qualityBlock=quality.length?`<div class="fusion-outlook-block"><h3>Quality steps you could take</h3>
    <p>Three of one droid at one quality come out as that same droid, a quality higher. This is the one step where you know exactly what you get.</p>
    <ul class="fusion-ladder">${quality.map(step=>`<li><span class="fusion-ladder-spend">3 &times; <a href="#/droid/${slug(step.name)}"><strong>${escapeAttr(step.name)}</strong></a></span> ${rarityText(step.rarity)}
      <span class="fusion-ladder-step">${variantText(step.from)} <b>&rarr;</b> ${variantText(step.to)}</span>
      <em class="fusion-outlook-state">${step.have} held${step.sets>1?` &middot; ${step.sets} sets`:''}</em></li>`).join('')}</ul></div>`:'';
  const rarityBlock=rarity.length?`<div class="fusion-outlook-block"><h3>Rarity steps you could take</h3>
    <p>Three droids sharing a rarity and a quality come out one rarity higher, at that same quality &mdash; including three of the same droid once it is Stellar and has no quality left to climb. Which droid you get is a roll. If the three you pick happen to be a recorded combination, that recipe wins instead and names its result.</p>
    <ul class="fusion-ladder">${rarity.map(group=>`<li><span class="fusion-ladder-step">${rarityText(group.rarity)} <b>&rarr;</b> ${rarityText(group.to)}</span> at ${variantText(group.variant)}
      <span class="fusion-outlook-parts">${group.names.map(name=>`<span class="fusion-outlook-part is-held">${escapeAttr(name)}</span>`).join('')}</span>
      <em class="fusion-outlook-state">${group.sets} set${group.sets===1?'':'s'} of three</em>${fusionPoolDetailHtml(group.names,group.variant)}</li>`).join('')}</ul></div>`:'';
  const routeBlock=routes.length?`<div class="fusion-outlook-block"><h3>Fusion routes to a droid you still need</h3>
    <p>Rebirth wants these and you cannot field them. Spending droids the rest of the cycle never asks for is free; a roll is not a promise, but it is better than selling the three.</p>
    <ul class="fusion-ladder">${routes.map(route=>`<li class="${route.sure?'is-ready':''}"><a href="#/droid/${slug(route.name)}"><strong>${escapeAttr(route.name)}</strong></a> ${variantText(route.at)}
      <span class="fusion-outlook-parts">${route.kind==='recipe'?`<span class="fusion-outlook-part is-held">fuse ${route.inputs.map(escapeAttr).join(' + ')}</span>`
        :route.kind==='quality'?`<span class="fusion-outlook-part is-held">fuse 3 &times; ${escapeAttr(route.name)} at ${variantLabel(route.from)}</span>`
        :`<span class="fusion-outlook-part is-held">roll 3 spare ${rarityLabel(route.from)}s at ${variantLabel(route.at)} or better</span>${route.pool.map(name=>`<span class="fusion-outlook-part is-held">${escapeAttr(name)}</span>`).join('')}`}</span>
      <em class="fusion-outlook-state">R${route.rebirth} &middot; ${route.sure?'certain':'a roll'}</em>${fusionPoolDetailHtml(route.kind==='recipe'?route.inputs:route.kind==='quality'?[route.name]:route.pool,route.kind==='quality'?route.from:route.at,route.kind==='recipe'?'What it takes':route.kind==='quality'?'What it takes':'')}</li>`).join('')}</ul></div>`:'';
  const ready=all.filter(recipe=>best.get(recipe.name)).length;
  return `<section class="fusion-outlook"><header><div><p class="eyebrow">Droid Fusion</p><h2>Fusion Outlook</h2>
    <p>What your base could fuse right now. A Fusion droid comes out at the worst quality that went in and cannot be upgraded afterwards, so the quality shown is the best you could manage today. <a href="#/fusion-lab">How fusion works</a>.</p></div>
    <span class="fusion-outlook-count">${ready}/${all.length} ready</span></header>
    ${trackedBlock}${routeBlock}${spareBlock}${qualityBlock}${rarityBlock}</section>`;
}

function fusionLabPage(){
  const recipes=fusionRecipes();
  const wanted=fusionWanted();
  const held=fusionStock();
  const rows=recipes.map(recipe=>{
    const need=fusionNeed(recipe);
    // Holding the three is only half of it: which quality they are decides
    // which quality the result is stuck at for good.
    const at=fusionBestVariant(recipe,held);
    const stock=new Map(need.parts.map(part=>[part.name,part]));
    const seen=new Map();
    const inputs=recipe.inputs.map((input,index)=>{
      // Two of the same droid share one entry, so the count shown is the pair's.
      seen.set(input,(seen.get(input)||0)+1);
      return `${index?'<span class="fusion-plus" aria-hidden="true">+</span>':''}${fusionCardHtml(input,'input',stock.get(input))}`;
    }).join('');
    const short=need.missing.map(part=>`${escapeAttr(part.name)} x${part.short}`).join(', ');
    const isWanted=wanted.has(recipe.name);
    return `<article class="fusion-row ${need.ready?'fusion-ready':''} ${isWanted?'fusion-wanted':''}" data-fusion-row="${escapeAttr(recipe.name)}">
      <div class="fusion-inputs">${inputs}</div>
      <span class="fusion-equals" aria-hidden="true">=</span>
      <div class="fusion-result">${fusionCardHtml(recipe.name,'result')}
        <div class="fusion-state">${at?`<em class="fusion-have">Ready to fuse &middot; best at ${variantText(at)}</em>`:`<em class="fusion-short">Need ${short}</em>`}
        <button class="btn secondary fusion-track" type="button" data-fusion-want="${escapeAttr(recipe.name)}">${isWanted?'Tracking':'Track'}</button></div>
      </div>
    </article>`;
  }).join('');
  const ready=recipes.filter(recipe=>fusionNeed(recipe).ready).length;
  const log=fusionLogSummary();
  const logHtml=log.length?`<section class="fusion-log"><header><div><p class="eyebrow">Recorded</p><h2>What came out</h2><p>Every fusion you have run, and what it produced. Combinations with no known recipe are the ones worth adding to.</p></div><span class="fusion-outlook-count">${log.reduce((total,row)=>total+row.total,0)} fused</span></header><ul>${log.map(row=>`<li><span class="fusion-log-inputs">${row.inputs.map(input=>escapeAttr(input.name)).join(' + ')}</span><span class="fusion-log-results">${row.results.map(([label,count])=>`<em>${escapeAttr(label)}${count>1?` x${count}`:''}</em>`).join(' ')}</span></li>`).join('')}</ul></section>`:'';
  app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / Fusion Lab</div>
    <section class="dex-hero"><div><p class="eyebrow">Droid Fusion</p><h1>Fusion Lab</h1><p>Three droids go into the Fusion room and one comes out. Track the ones you are working towards and they appear in the Fusion Outlook on your Base.</p></div>
      <div class="dex-totals"><strong>${ready}/${recipes.length}</strong><span>ready to fuse</span></div></section>
    <div class="dex-toolbar"><input id="fusionSearch" class="form-control" placeholder="Search a droid or a result…">
      <div class="dex-filters"><label class="dex-switch"><input id="fusionReadyOnly" type="checkbox"><span class="dex-switch-track" aria-hidden="true"></span><span>Ready only</span></label>
      <label class="dex-switch"><input id="fusionTrackedOnly" type="checkbox"><span class="dex-switch-track" aria-hidden="true"></span><span>Tracked only</span></label></div>
      <span id="fusionCount">${recipes.length} shown</span></div>
<section class="fusion-rules"><header><p class="eyebrow">The ladder</p><h2>How fusion works</h2></header>
      <ol>
        <li><b>Three go in, one comes out.</b> The three are spent whatever the result is.</li>
        <li><b>The quality that comes out is the worst that went in.</b> Two Stellar and a Rainbow make a Rainbow, not a Stellar.</li>
        <li><b>A Fusion droid cannot be upgraded afterwards</b> the way an ordinary droid can. The quality you fuse it at is the quality it stays, so fuse it at the one you actually want.</li>
        <li><b>Three of the same droid at the same quality</b> come out as that same droid, one quality higher — three Gold R6 make a Diamond R6.</li>
        <li><b>Three droids that are not the same but share a rarity</b> come out one rarity higher, at the worst quality that went in — three different Epics at Beskar make a Legendary at Beskar.</li>
        <li><b>Otherwise the droid is a roll.</b> Three of one droid hand that droid back, but where the three are not the same the fusion settles the rarity and the quality and nothing else — which droid of that rarity arrives is chance.</li>
        <li><b>A recorded combination below beats the ladder.</b> Those are the ones that make the Fusion droids: the three N-UL wants are all Epic, and they make N-UL, which is itself an Epic rather than a Legendary.</li>
      </ol>
      <p class="fusion-rules-note">Anything not covered here has not been recorded yet. Fusing it asks what came out and adds it to the log at the foot of this page.</p></section>
    <div class="fusion-list" id="fusionList">${rows||'<div class="empty">No fusion recipes are loaded.</div>'}</div>${logHtml}`;
  const search=document.querySelector('#fusionSearch'),readyOnly=document.querySelector('#fusionReadyOnly'),trackedOnly=document.querySelector('#fusionTrackedOnly');
  const draw=()=>{
    const query=search.value.toLowerCase().trim();
    let shown=0;
    document.querySelectorAll('.fusion-row').forEach(row=>{
      const match=(!query||row.textContent.toLowerCase().includes(query))
        &&(!readyOnly.checked||row.classList.contains('fusion-ready'))
        &&(!trackedOnly.checked||row.classList.contains('fusion-wanted'));
      row.hidden=!match;
      if(match)shown++;
    });
    document.querySelector('#fusionCount').textContent=`${shown} shown`;
  };
  search.oninput=draw;readyOnly.onchange=draw;trackedOnly.onchange=draw;
  document.querySelectorAll('[data-fusion-want]').forEach(button=>button.onclick=()=>{
    const on=toggleFusionWanted(button.dataset.fusionWant);
    button.textContent=on?'Tracking':'Track';
    button.closest('.fusion-row')?.classList.toggle('fusion-wanted',on);
    draw();
  });
}
function droidexPage(){let variant='DEFAULT',missingOnly=localStorage.getItem('droid-archive-dex-missing-only')==='1',nonFlawlessOnly=localStorage.getItem('droid-archive-dex-non-flawless-only')==='1';const render=()=>{const available=state.droids.filter(d=>variant==='DEFAULT'||!onlyDefaultVariant(d)),collected=state.droidex.filter(x=>x.variant===variant).length,flawless=flawlessCount();app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / Droidex</div><section class="dex-hero"><div><p class="eyebrow">Collection tracker</p><h1>Droidex</h1><p>Collect every droid quality and mark your flawless finds.</p></div><div class="dex-totals"><strong>${state.droidex.length}/${droidexCapacity()}</strong><span>✦ ${flawless}/${flawlessCapacity()} flawless tracked</span><button class="btn secondary" id="transferDroidex">⇄ Import / Export</button></div></section><div class="variant-tabs dex-tabs">${VARIANTS.map(v=>`<button data-dex-variant="${v}" class="${v===variant?'active':''}">${variantText(v)}</button>`).join('')}</div><div class="dex-toolbar"><input id="dexSearch" class="form-control" placeholder="Search Droidex…"><div class="dex-filters"><label class="dex-switch"><input id="dexMissing" type="checkbox" ${missingOnly?'checked':''}><span class="dex-switch-track" aria-hidden="true"></span><span>Missing only</span></label><label class="dex-switch"><input id="dexNonFlawless" type="checkbox" ${nonFlawlessOnly?'checked':''}><span class="dex-switch-track" aria-hidden="true"></span><span>Non-flawless only</span></label></div><span>${collected}/${available.length} ${variantText(variant)} collected</span></div><div id="dexGrid" class="dex-grid"></div>`;const draw=()=>{const q=document.querySelector('#dexSearch').value.toLowerCase();const list=available.filter(d=>d.name.toLowerCase().includes(q)&&(!missingOnly||!droidexEntry(d.name,variant))&&(!nonFlawlessOnly||(!isIconic(d)&&!isDroidFlawless(d.name))));document.querySelector('#dexGrid').innerHTML=list.length?list.map(d=>{const entry=droidexEntry(d.name,variant),flawless=isDroidFlawless(d.name);return `<article class="dex-card ${entry?'collected':'missing'} ${flawless?'flawless':''}"><a href="#/droid/${slug(d.name)}">${picture(d,variant)}${rarityBadge(d.rarity)}<strong>${d.name}</strong></a><div><button class="dex-own" data-dex-own="${d.name}">${entry?'✓ Owned':'+ Add'}</button><button class="dex-flawless" data-dex-flawless="${d.name}" ${entry&&!isIconic(d)?'':'disabled'}>✦ ${flawless?'Flawless':'Flawless?'}</button></div></article>`}).join(''):'<p class="dex-empty">No droids match the active filters.</p>';document.querySelectorAll('[data-dex-own]').forEach(b=>b.onclick=()=>{toggleDroidex(b.dataset.dexOwn,variant);render()});document.querySelectorAll('[data-dex-flawless]').forEach(b=>b.onclick=()=>{toggleFlawless(b.dataset.dexFlawless,variant);render()})};document.querySelectorAll('[data-dex-variant]').forEach(b=>b.onclick=()=>{variant=b.dataset.dexVariant;render()});document.querySelector('#transferDroidex').onclick=()=>showDroidexTransferModal(render);document.querySelector('#dexSearch').oninput=draw;document.querySelector('#dexMissing').onchange=e=>{missingOnly=e.target.checked;localStorage.setItem('droid-archive-dex-missing-only',missingOnly?'1':'0');draw()};document.querySelector('#dexNonFlawless').onchange=e=>{nonFlawlessOnly=e.target.checked;localStorage.setItem('droid-archive-dex-non-flawless-only',nonFlawlessOnly?'1':'0');draw()};draw()};render()}
function home(){const featured=[...state.droids].sort(()=>Math.random()-.5).slice(0,4);app.innerHTML=`<section class="hero"><p class="eyebrow">Community knowledgebase</p><h1>Droid Tycoon, decoded.</h1><p class="lead">Browse every droid and variant, compare production, then build your collection and see exactly which droids to keep for later rebirths.</p></section><div class="quick-grid"><a class="quick-card" href="#/droids"><b>Explore all ${state.droids.length} droids →</b><p>Costs, income, rarity, type, attributes and every quality.</p></a><a class="quick-card" href="#/base"><b>Build your base →</b><p>Add owned droids and calculate live, minute and hourly credits.</p></a></div><h2>Featured droids</h2><div class="droid-grid">${featured.map(card).join('')}</div><h2>About this archive</h2><p class="lead">This is an unofficial companion for the Fortnite island <strong>Droid Tycoon</strong>. Your base is saved only in this browser. The visual language takes cues from classic game wikis: compact facts, readable tables and information-first pages.</p>`}
const novaUpgrade=id=>state.novaShop?.upgrades?.find(x=>x.id===id);
const cantinaPack=id=>state.cantinaShop?.items?.find(item=>item.id===id&&item.category==='packs');
const ownedCantinaPacks=()=>Object.entries(state.cantinaPurchases||{}).filter(([,owned])=>owned).map(([id])=>cantinaPack(id)).filter(Boolean);
const minimumNovaLevel=id=>ownedCantinaPacks().reduce((minimum,pack)=>Math.max(minimum,(pack.novaUnlocks||[]).includes(id)?1:0,Math.max(0,Math.floor(Number(pack.novaLevels?.[id])||0))),0);
function syncCantinaPackUpgrades(){state.cantinaPurchases=state.cantinaPurchases&&typeof state.cantinaPurchases==='object'?state.cantinaPurchases:{};for(const pack of ownedCantinaPacks()){for(const id of pack.novaUnlocks||[])state.novaUpgrades[id]=Math.max(1,novaLevelFor(id));for(const [id,level] of Object.entries(pack.novaLevels||{}))state.novaUpgrades[id]=Math.max(Math.max(0,Math.floor(Number(level)||0)),novaLevelFor(id))}}
const novaCost=(level=0)=>level?.cost===null||level?.unknown?'<span class="unknown-cost">Cost unknown</span>':`<img src="${state.novaShop?.currency?.icon||'assets/events/nova-crystal.png'}" alt=""> ${fmt(level.cost)}`;
function scrapSeconds(){const config=state.novaShop?.calculators?.scrap,upgrade=novaUpgrade(config?.upgradeId||'scrap-value'),level=novaLevelFor(config?.upgradeId||'scrap-value');if(!upgrade||!level)return 0;const configured=Number(upgrade.levels?.[level-1]?.scrapSeconds);if(Number.isFinite(configured)&&configured>0)return configured;const perLevel=Number(upgrade.rewardPerLevel);if(Number.isFinite(perLevel)&&perLevel>0)return level*perLevel;return Number(config?.defaultSeconds??1)}
function scrapPayoutsForIncome(income,quality='default'){const config=state.novaShop?.calculators?.scrap,seconds=scrapSeconds(),row=config?.qualities?.find(x=>String(x.id||x.name).toLowerCase()===String(quality).toLowerCase())||config?.qualities?.[0],drops=config?.drops||[];return Object.fromEntries(drops.map((drop,index)=>[drop.id||String(drop.name).toLowerCase(),seconds?income*seconds*Number(row?.multipliers?.[index]??1):0]))}
function scrapCalculatorHtml(placed){const config=state.novaShop?.calculators?.scrap;if(!config)return'';const income=scrapIncomeForPlaced(placed),seconds=scrapSeconds(),level=novaLevelFor(config.upgradeId),drops=config.drops||[];return `<section class="scrap-calculator"><div><p class="eyebrow">Workshop calculator</p><h2>${config.title||'Scrap calculator'}</h2><p>${config.description||''}</p><small>Scrap Value level ${level} · ${seconds||'—'} second${seconds===1?'':'s'} of current Base generation · Scrap base ${fmt(income)}/s</small></div><table><thead><tr><th>Scrap</th>${drops.map(drop=>`<th>${drop.name}</th>`).join('')}</tr></thead><tbody>${(config.qualities||[]).map(row=>`<tr><th>${row.name}</th>${drops.map((drop,i)=>`<td>${seconds?fmt(income*seconds*Number(row.multipliers?.[i]??1)):'—'}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`}
// Upgrading a droid in place fills the Droidex, so completing an entry never
// needs a spare copy — it needs the copy you already own kept alive. A droid is
// worth keeping when its name still has unrecorded qualities at or above its
// current one, since those are the only ones it can still reach.
// Companion slots exist to be swapped, so Optimise keeps them stocked with the
// best boost of each kind you asked for. The numbers mirror droidAttribute:
// Astromech gives pickaxe levels, Worker crafting speed, Battle max health.
const COMPANION_GOALS=[{id:'pickaxe',type:'ASTROMECH',label:'Highest pickaxe level',short:'Pickaxe'},{id:'crafting',type:'WORKER',label:'Highest craft speed',short:'Craft speed'},{id:'health',type:'BATTLE',label:'Highest max health',short:'Max health'}];
const companionGoals=()=>{const chosen=Array.isArray(state.companionGoals)?state.companionGoals.filter(id=>COMPANION_GOALS.some(g=>g.id===id)):null;return chosen&&chosen.length?chosen:COMPANION_GOALS.map(g=>g.id)};
// Capped at the number of Companion slots actually unlocked. Anything beyond
// that stays in the save but is not shown or used, so it comes back if you
// later unlock the second slot rather than being thrown away.
const preferredCompanions=()=>Array.isArray(state.preferredCompanions)?state.preferredCompanions.filter(name=>state.droids.some(d=>d.name===name&&isIconic(d))).slice(0,companionSlotCount()):[];
const iconicDroids=()=>state.droids.filter(isIconic);
function droidAttributeValue(d,variant){
  if(!d||isIconic(d))return 0;
  const rarityLevel={COMMON:1,RARE:2,EPIC:3,LEGENDARY:4,MYTHIC:5}[d.rarity],variantLevel=Math.max(0,VARIANTS.indexOf(variant));
  if(!rarityLevel)return 0;
  if(d.type==='ASTROMECH')return rarityLevel+variantLevel;
  if(d.type==='WORKER')return Number((0.2*(rarityLevel+variantLevel)).toFixed(1));
  if(d.type==='BATTLE')return rarityLevel*20+variantLevel*40;
  return 0;
}
// Preferred Iconics you do not own yet, so Optimise can tell you to go buy them.
const missingPreferredCompanions=()=>{const owned=new Set(state.owned.map(x=>x.name));return preferredCompanions().filter(name=>!owned.has(name))};
// There is no point naming more preferred companions than you have slots to put
// them in, so the picker stops at however many are actually unlocked.
const companionSlotCount=()=>stationSlotIndices('COMPANION').length;
const preferredCompanionsFull=()=>preferredCompanions().length>=companionSlotCount();
const droidexGapsAbove=(name,variant)=>{const d=state.droids.find(x=>x.name===name);if(!d||isIconic(d))return[];return VARIANTS.slice(VARIANTS.indexOf(variant)+1).filter(v=>!droidexEntry(name,v))};
// The next rebirth consumes 3 droids, so they are held back from the sell total.
// A requirement you have not met yet still holds one back: the copy you are
// saving chips to upgrade is the whole point of the exercise, so selling it
// would be self-defeating.
function nextRebirthHoldBacks(units){
  const next=(state.rebirths[state.cycle]||[]).find(r=>r.to===state.rebirth+1),held=new Map();
  for(const req of next?.requiredDroids||[]){
    const needed=VARIANTS.indexOf(req.variant),d=state.droids.find(x=>x.name===req.droidName);
    const owned=units.filter(u=>u.name===req.droidName&&!held.has(`${u.source}:${u.unit}`));
    // Already good enough: keep the cheapest such copy so the better ones stay
    // sellable. Otherwise keep the closest copy below the requirement, which is
    // the cheapest one to finish upgrading.
    const ready=owned.filter(u=>VARIANTS.indexOf(u.variant)>=needed).sort((a,b)=>chipSellValue(d,a.variant)-chipSellValue(d,b.variant))[0];
    const upgradable=owned.filter(u=>VARIANTS.indexOf(u.variant)<needed).sort((a,b)=>VARIANTS.indexOf(b.variant)-VARIANTS.indexOf(a.variant))[0];
    const pick=ready||upgradable;
    if(pick)held.set(`${pick.source}:${pick.unit}`,{...pick,at:next.to,required:req.variant,chipsNeeded:ready?0:chipsToVariant(d,pick.variant,req.variant)});
  }
  return held;
}
function chipSellCalculatorHtml(p){
  const units=expandedOwned();
  if(!units.length)return'';
  const held=nextRebirthHoldBacks(units),next=(state.rebirths[state.cycle]||[]).find(r=>r.to===state.rebirth+1);
  const rows=new Map();
  let total=0,sellable=0,standard=0;
  for(const unit of units){
    if(held.has(`${unit.source}:${unit.unit}`))continue;
    const d=state.droids.find(x=>x.name===unit.name),value=chipSellValue(d,unit.variant);
    if(!value){standard++;continue}
    total+=value;sellable++;
    const row=rows.get(d.rarity)||{count:0,chips:0};row.count++;row.chips+=value;rows.set(d.rarity,row);
  }
  const bb8=bb8CompanionActive(p.placed),order=['COMMON','RARE','EPIC','LEGENDARY','MYTHIC'];
  // What the held-back droids still cost to bring up to the required quality.
  const needed=[...held.values()].reduce((sum,unit)=>sum+unit.chipsNeeded,0);
  const shortfall=Math.max(0,needed-total),shortfallBb8=Math.max(0,needed-total*2);
  const breakdown=order.filter(rarity=>rows.has(rarity)).map(rarity=>{const row=rows.get(rarity);return `<tr><th>${rarityText(rarity)}</th><td>${row.count}</td><td>${fmt(row.chips)}</td><td>${fmt(row.chips*2)}</td></tr>`}).join('');
  const heldCards=[...held.values()].map(unit=>{const d=state.droids.find(x=>x.name===unit.name);return `<a class="chip-held-card ${unit.chipsNeeded?'needs-upgrade':''}" href="#/droid/${slug(d.name)}"><div>${picture(d,unit.variant)}</div><span><strong>${d.name}</strong><small>${unit.chipsNeeded?`${variantText(unit.variant)} → ${variantText(unit.required)} · ${fmt(unit.chipsNeeded)} chips`:`${variantText(unit.variant)} · ready`}</small></span></a>`}).join('');
  const missing=(next?.requiredDroids||[]).length-held.size;
  const goalStats=needed?`<div class="stat"><small>Needed for Rebirth ${next.to}</small><strong>${fmt(needed)}</strong><em>to finish upgrading ${[...held.values()].filter(u=>u.chipsNeeded).map(u=>u.name).join(', ')}</em></div><div class="stat ${shortfall?'chip-sell-short':'chip-sell-covered'}"><small>${shortfall?'Still short after selling':'Covered by selling'}</small><strong>${fmt(shortfall||total-needed)}</strong><em>${shortfall?(shortfallBb8?`${fmt(shortfallBb8)} short with BB-8`:'covered if BB-8 is your companion'):'chips left over'}</em></div>`:'';
  return `<section class="scrap-calculator chip-sell-calculator"><div><p class="eyebrow">Workshop calculator</p><h2>Upgrade Chip sell value</h2><p>What your roster is worth if you sold it for Upgrade Chips, holding back the droids your next rebirth needs — including any you are still upgrading.</p><small>${sellable} sellable droid${sellable===1?'':'s'}${standard?` · ${standard} Standard or Iconic worth nothing`:''}${next?` · holding back ${held.size} for Rebirth ${next.to}`:' · no next rebirth in this cycle'}</small></div><div class="chip-sell-totals"><div class="stat"><small>Sell everything</small><strong>${fmt(total)}</strong><em>Upgrade Chips</em></div><div class="stat chip-sell-bb8 ${bb8?'active':''}"><small>With BB-8 companion</small><strong>${fmt(total*2)}</strong><em>${bb8?'BB-8 is your companion':'Doubled — needs BB-8 as companion'}</em></div>${goalStats}</div>${breakdown?`<table><thead><tr><th>Rarity</th><th>Droids</th><th>Chips</th><th>With BB-8</th></tr></thead><tbody>${breakdown}</tbody><tfoot><tr><th>Total</th><td>${sellable}</td><td>${fmt(total)}</td><td>${fmt(total*2)}</td></tr></tfoot></table>`:'<p class="chip-sell-empty">Nothing on your roster can be sold for Upgrade Chips yet — Standard quality droids are worth nothing.</p>'}${heldCards?`<div class="chip-held"><small>Held back for Rebirth ${next.to}${missing>0?` · ${missing} still missing from your roster`:''}</small><div class="chip-held-grid">${heldCards}</div></div>`:''}</section>`
}
// Overhead map of the base. Positions are percentages of the artwork, first read
// off the colour-coded dots in the images rather than measured by eye, then
// tidied by hand where a row wanted straightening. This list is the source of
// truth, not the dots — the art can drop them whenever it likes. Slot order
// within a station is reading order: top to bottom, then left to right.
// The Battle station spans both floors: the five ground-floor dots are slots 0-4
// and the six upstairs ones are 5-10, matching the Rebirth 17-22 unlocks.
const MAP_SPOTS={
  // Each list is in slot order, not map order — position 0 is the slot you start
  // with and the rest follow the unlock sequence, so a dot always carries the
  // Rebirth its slot really needs. Taken from the numbered maps in assets/map.
  downstairs:{
    // 1, 2, 3, 4, then rb1 rb4 rb7 rb10 rb12 rb14 rb16
    WORKER:[[76.24,70.75],[80.09,79.79],[68.97,69.34],[62.82,72.97],[60.46,80.1],[63.26,88.35],[71.49,91.68],[78.51,87.64],[77.79,42.16],[75.96,40.65],[73.52,40.21]],
    // 1, 2, 3, then rb2 rb5 rb8 rb11 rb13 rb15
    ASTROMECH:[[20.1,51.32],[29.11,40.2],[20.99,40.2],[34.46,40.2],[39.8,40.2],[36.48,55.17],[45.27,55.17],[30.44,55.17],[26.19,55.17]],
    // 1, 2, then rb3 rb6 rb9 — the Rebirth 17-22 slots are upstairs
    BATTLE:[[61.04,22.98],[64.49,24.07],[67.07,22.21],[70.08,23.37],[71.96,21.61]],
    // 1, then rb1 rb2
    BUILD:[[70.03,53.47],[41.92,48.32],[67.39,32.37]],
    BLUEPRINT:[[79.46,55.57],[80.5,56.57],[81.55,57.48]],UPGRADE_CHIP:[[61.83,66.63]],
    // 1-5, then rb17 rb18 rb19 rb20. The Nova dots are unlabelled on the map, so
    // they carry on round the same arc past rb20.
    LOUNGE:[[82.13,51.54],[86.13,56.33],[92.52,56.33],[95.85,44.64],[96.02,51.22]],
    LOUNGE_REBIRTH:[[94.52,38.31],[95.06,35.42],[94.97,32.44],[93.47,29.94]],
    LOUNGE_NOVA:[[91.56,27.95],[89,26.97],[86.12,27.12],[83.58,28.62]]
  },
  // rb17 down to rb22, top to bottom.
  upstairs:{BATTLE:[[65.13,11.47],[65.48,14.69],[65.74,17.71],[66.09,20.83],[66.27,24.16],[66.53,27.68]]}
};
const MAP_FLOORS=['downstairs','upstairs'];
const baseViewIsMap=()=>localStorage.getItem('droid-archive-base-view')==='map';
const mapFloor=()=>MAP_FLOORS.includes(localStorage.getItem('droid-archive-map-floor'))?localStorage.getItem('droid-archive-map-floor'):'downstairs';
// Flattens a floor's dots into slots the Base already understands. Lounge runs
// base slots first then the Nova ones, which is the order the game unlocks them.
// Markers carry the same data attributes the list view uses, so the Base page's
// existing handlers wire them up untouched: an empty slot opens the picker, an
// occupied one opens the swap, blueprints open the blueprint picker.
// One piece of artwork serves both floors — the building is the same shape
// upstairs, so only the markers change. The floor toggle still matters: it swaps
// the five ground-floor Battle slots for the six above them.
function baseMapHtml(p){
  const floor=mapFloor(),other=floor==='downstairs'?'upstairs':'downstairs';
  const spots=mapFloorSlots(floor);
  // A spot you have not unlocked yet is not a spot. These decide what the header
  // counts, so "spots filled" is out of the slots this Base actually has.
  const available=s=>s.station==='BLUEPRINT_STORAGE'?s.index<capacity('BLUEPRINT_STORAGE'):isSlotEligible(s.station,s.index)&&isSlotPurchased(s.station,s.index);
  const filledAt=s=>s.station==='BLUEPRINT_STORAGE'?state.blueprints.some(b=>Number(b.slot)===s.index):p.placed.some(x=>x.station===s.station&&x.slot===s.index);
  const markers=spots.map(spot=>{
    const {station,index,x,y}=spot,pos=`left:${x}%;top:${y}%`;
    if(station==='BLUEPRINT_STORAGE'){
      const bp=state.blueprints.find(b=>Number(b.slot)===index),locked=index>=capacity('BLUEPRINT_STORAGE');
      if(bp){const d=state.droids.find(x=>x.name===bp.name),i=state.blueprints.indexOf(bp);
        return `<div class="map-pin" style="${pos}"><div class="map-pin-actions"><button class="slot-swap craft-blueprint" data-blueprint="${i}" title="Craft into Build">⚒</button><button class="slot-delete delete-blueprint" data-blueprint="${i}" title="Remove blueprint">×</button></div><span class="map-pin-face" title="${escapeAttr(`${bp.name} ${variantLabel(bp.variant)} blueprint`)}">${picture(d,bp.variant)}</span></div>`}
      return `<div class="map-pin" style="${pos}"><button class="map-pin-face open ${locked?'locked':''} blueprint-open" ${locked?'disabled':''} data-blueprint-slot="${index}" title="${locked?'Locked blueprint slot':'Add blueprint'}"><span class="slot-icon">${stationIcon('BLUEPRINT_STORAGE')}</span></button></div>`;
    }
    const occupant=p.placed.find(x=>x.station===station&&x.slot===index);
    if(occupant){
      const d=state.droids.find(x=>x.name===occupant.name),match=!isIconic(d)&&station===d.type,building=isBuilding(occupant),locked=Boolean(occupant.lockedSlot);
      // Same controls as the list view, stacked above the portrait so they never
      // sit on top of it or of the neighbouring slot's card.
      const actions=[
        building?`<button class="slot-complete" data-complete-source="${occupant.source}" data-complete-unit="${occupant.unit}" title="Mark as finished building">✓</button>`:'',
        isIconic(d)?'':`<button class="slot-variant" data-source="${occupant.source}" data-name="${escapeAttr(d.name)}" data-variant="${occupant.variant}" data-station="${station}" data-slot="${index}" title="Change quality">◆</button>`,
        `<button class="slot-lock ${locked?'active':''}" data-source="${occupant.source}" data-unit="${occupant.unit}" title="${locked?'Unlock':'Lock for Optimise'}">${locked?'🔒':'🔓'}</button>`,
        `<button class="slot-swap" data-source="${occupant.source}" data-unit="${occupant.unit}" title="Swap">⇄</button>`,
        `<button class="slot-delete" data-source="${occupant.source}" title="Remove">×</button>`,
      ].join('');
      // Same drag attributes the list view's cards carry, so one set of handlers
      // drives both. The portrait is a link, and links drag themselves, so it has
      // to opt out or the browser drags the URL instead of the droid.
      const drag=DRAG_AND_DROP_ENABLED?` draggable="true" data-source="${occupant.source}" data-unit="${occupant.unit}"`:'';
      return `<div class="map-pin filled ${match?'matched':''} ${building?'building':''} ${locked?'pinned':''}" style="${pos}" data-slot-station="${station}" data-slot-index="${index}"${building?'':drag}><div class="map-pin-actions">${actions}</div><a class="map-pin-face" draggable="false" href="#/droid/${slug(d.name)}" title="${escapeAttr(`${occupant.name} ${variantLabel(occupant.variant)} · ${stationName(station)} ${index+1}${building?' · still building':''}`)}">${picture(d,occupant.variant)}</a></div>`;
    }
    const eligible=isSlotEligible(station,index),purchased=isSlotPurchased(station,index);
    // Two different kinds of unavailable: not reached yet, or reached and not
    // bought. Only the second one is something you can go and do right now.
    if(!eligible||!purchased)return `<div class="map-pin" style="${pos}"><span class="map-pin-face locked ${eligible?'unbought':''}" title="${escapeAttr(eligible?`${stationName(station)} slot ${index+1} — unlocked at Rebirth ${slotUnlockRebirth(station,index)}, not bought yet`:lockedSlotLabel(station,index)||`Locked ${stationName(station)} slot`)}"><span class="slot-icon">${stationIcon(station)}</span></span></div>`;
    return `<div class="map-pin" style="${pos}" data-slot-station="${station}" data-slot-index="${index}"><button class="map-pin-face open" data-station="${station}" data-slot-index="${index}" title="${escapeAttr(`Add to ${stationName(station)} slot ${index+1}`)}"><span class="slot-icon">${stationIcon(station)}</span></button></div>`;
  }).join('');
  const usable=spots.filter(available),locked=spots.length-usable.length;
  const counts=usable.reduce((n,s)=>n+(filledAt(s)?1:0),0);
  return `<section class="base-map"><header><div><strong>${floor==='upstairs'?'Upstairs':'Downstairs'}</strong><span>${counts} of ${usable.length} spots filled${locked?` · ${locked} still locked`:''}</span></div><button class="btn secondary" id="toggleMapFloor">Go ${other}</button></header><div class="base-map-art"><img src="assets/map/map.png" alt="Overhead map of the base, ${floor}">${markers}</div></section>`;
}
function mapFloorSlots(floor){
  const spots=MAP_SPOTS[floor]||{},out=[];
  const add=(station,list,offset=0)=>(list||[]).forEach(([x,y],i)=>out.push({station,index:i+offset,x,y}));
  if(floor==='upstairs'){add('BATTLE',spots.BATTLE,5);return out}
  add('WORKER',spots.WORKER);add('ASTROMECH',spots.ASTROMECH);add('BATTLE',spots.BATTLE);
  add('BUILD',spots.BUILD);add('UPGRADE_CHIP',spots.UPGRADE_CHIP);
  // loungeSlotMeta splits the Lounge three ways: 0-4 base, 5-8 unlocked by
  // Rebirth, 9-12 bought in the Nova Shop. The four Nova ones are the
  // northernmost dots on the map.
  add('LOUNGE',spots.LOUNGE);add('LOUNGE',spots.LOUNGE_REBIRTH,5);add('LOUNGE',spots.LOUNGE_NOVA,9);
  add('BLUEPRINT_STORAGE',spots.BLUEPRINT);
  return out;
}
// ─── Critical strike model ──────────────────────────────────────────────────
// Every figure here is derived from measurements rather than guessed.
//
// Pickaxe: eight readings across levels 14-17 with and without a +7 Astromech
// fall exactly on one line, and an Astromech's levels stack onto your own, so
// 14+7 behaves identically to a native 21.
//   seconds per hit = 1.2 x (your level + astromech + 1)
//
// Critical Chance starts at 1% and gains 5% a level; Critical Amount starts at
// 50% and gains 10%. Chopper adds 50 points to each. Amount is the bonus over a
// normal hit, so 100% means a crit does double.
//
// Multi Crit: landing a crit starts a chain of extra rolls, each at half the
// previous chance, ending at the cap or the first failure. Level N buys N extra
// rolls, so the cap is N+1 including the original. Chances are not clamped: a
// 200% chance is a guaranteed roll that halves to a guaranteed 100%.
const PICKAXE_SECONDS_PER_LEVEL=1.2;
const CRIT_CHANCE_BASE=0.01,CRIT_CHANCE_PER_LEVEL=0.05;
const CRIT_AMOUNT_BASE=0.50,CRIT_AMOUNT_PER_LEVEL=0.10;
const CHOPPER_CRIT_BONUS=0.50;
const CRIT_UPGRADE_IDS={chance:'critical-chance',amount:'critical-amount',multi:'multi-crit'};
// Some rebirths hand out a permanent crit buff on top of the Nova Shop levels:
// crit chance at 23, 26 and 29, crit amount at 24, 27 and 30. Each one is listed
// against its rebirth in nova-shop.json and they stack, so the bonus is the
// running total for every rebirth you have already reached in this cycle.
function rebirthCritBonus(rebirth=state.rebirth){
  const reached=Math.max(0,Number(rebirth)||0);let chance=0,amount=0;
  for(const reward of state.novaShop?.rebirthRewards||[]){
    if((Number(reward.rebirth)||0)>reached)continue;
    chance+=(Number(reward.critChancePercent)||0)/100;
    amount+=(Number(reward.critAmountPercent)||0)/100;
  }
  return{chance,amount};
}
// Which rebirths still owe you a crit buff, for the Rebirth and Base outlooks.
function rebirthCritPerks({after=0,through=Infinity}={}){
  return (state.novaShop?.rebirthRewards||[]).filter(r=>{
    const at=Number(r.rebirth)||0;
    return at>after&&at<=through&&(r.critChancePercent||r.critAmountPercent);
  }).map(r=>({at:Number(r.rebirth)||0,chance:Number(r.critChancePercent)||0,amount:Number(r.critAmountPercent)||0}));
}
const pickaxeHitSeconds=effectiveLevel=>PICKAXE_SECONDS_PER_LEVEL*(Math.max(0,effectiveLevel)+1);
const critChanceFor=(level,chopper)=>CRIT_CHANCE_BASE+CRIT_CHANCE_PER_LEVEL*Math.max(0,level)+(chopper?CHOPPER_CRIT_BONUS:0)+rebirthCritBonus().chance;
const critAmountFor=(level,chopper)=>CRIT_AMOUNT_BASE+CRIT_AMOUNT_PER_LEVEL*Math.max(0,level)+(chopper?CHOPPER_CRIT_BONUS:0)+rebirthCritBonus().amount;
const multiCritRolls=level=>Math.max(0,level)+1;
// Average damage multiplier of a swing, relative to a non-crit hit. Follows the
// community sheet: the hit itself, plus the crit amount once per crit landed.
function critMultiplier(chance,amount,rolls){
  let onCrit=1+amount,chain=1;
  for(let k=1;k<rolls;k++){chain*=Math.min(1,chance/Math.pow(2,k));onCrit+=chain*amount}
  const p=Math.min(1,chance);
  return(1-p)+p*onCrit;
}
const critProfile=({chanceLevel=0,amountLevel=0,multiLevel=0,chopper=false,pickaxe=0,astromech=0}={})=>{
  const chance=critChanceFor(chanceLevel,chopper),amount=critAmountFor(amountLevel,chopper),rolls=multiCritRolls(multiLevel);
  const base=pickaxeHitSeconds(pickaxe+astromech),multiplier=critMultiplier(chance,amount,rolls);
  return{chance,amount,rolls,base,multiplier,perHit:base*multiplier};
};
// Pickaxe Mastery only decides how many levels survive a Super Rebirth: 5 at
// rank 1, then two more each rank, up to 25. That is the floor the calculator
// starts you at until you say otherwise.
const pickaxeMasteryLevels=()=>{const r=novaLevelFor('pickaxe-mastery');return r>0?5+2*(r-1):0};
// An Astromech companion's pickaxe levels stack onto your own.
const companionAstromechBonus=placed=>Math.max(0,...[0,...placed.filter(x=>x.station==='COMPANION').map(x=>{
  const d=state.droids.find(y=>y.name===x.name);return d?.type==='ASTROMECH'?droidAttributeValue(d,x.variant):0})]);
const critSetting=(key,fallback)=>{const v=Number(localStorage.getItem('droid-archive-crit-'+key));return Number.isFinite(v)&&localStorage.getItem('droid-archive-crit-'+key)!==null?v:fallback};
const setCritSetting=(key,value)=>localStorage.setItem('droid-archive-crit-'+key,String(value));
const novaLevelCost=(id,level)=>novaUpgrade(id)?.levels?.find(l=>Number(l.level)===level)?.cost??null;
const novaMaxLevel=id=>novaUpgrade(id)?.levels?.length??0;
// Multi Crit needs Critical Chance first, so its true price is the missing
// Critical Chance ranks plus its own.
const MULTI_CRIT_REQUIRES_CHANCE=4;
function critUpgradeOptions(current){
  const {chanceLevel,amountLevel,multiLevel}=current;
  const now=critProfile(current).multiplier;
  const gain=next=>critProfile({...current,...next}).multiplier/now-1;
  const out=[];
  if(chanceLevel<novaMaxLevel(CRIT_UPGRADE_IDS.chance)){
    const cost=novaLevelCost(CRIT_UPGRADE_IDS.chance,chanceLevel+1);
    out.push({id:CRIT_UPGRADE_IDS.chance,name:'Critical Chance',to:chanceLevel+1,cost,gain:gain({chanceLevel:chanceLevel+1}),note:''});
  }
  if(amountLevel<novaMaxLevel(CRIT_UPGRADE_IDS.amount)){
    const cost=novaLevelCost(CRIT_UPGRADE_IDS.amount,amountLevel+1);
    out.push({id:CRIT_UPGRADE_IDS.amount,name:'Critical Amount',to:amountLevel+1,cost,gain:gain({amountLevel:amountLevel+1}),note:''});
  }
  if(multiLevel<novaMaxLevel(CRIT_UPGRADE_IDS.multi)){
    // Its own price, not a bundle. If Critical Chance is not high enough yet the
    // rank is simply locked, and what it takes to unlock is stated separately.
    const cost=novaLevelCost(CRIT_UPGRADE_IDS.multi,multiLevel+1);
    let locked=false,note='';
    if(chanceLevel<MULTI_CRIT_REQUIRES_CHANCE){
      let extra=0;
      for(let l=chanceLevel+1;l<=MULTI_CRIT_REQUIRES_CHANCE;l++)extra+=novaLevelCost(CRIT_UPGRADE_IDS.chance,l)||0;
      locked=true;note=`locked · needs Critical Chance ${MULTI_CRIT_REQUIRES_CHANCE}, another ${fmt(extra)} Nova`;
    }
    out.push({id:CRIT_UPGRADE_IDS.multi,name:'Multi Crit',to:multiLevel+1,cost,gain:gain({multiLevel:multiLevel+1}),note,locked});
  }
  // Ranked by damage bought per crystal. Anything still locked sorts last, since
  // it is not actually a purchase you can make yet.
  return out.filter(x=>x.cost).map(x=>({...x,value:x.gain/x.cost*1000}))
    .sort((a,b)=>(a.locked?1:0)-(b.locked?1:0)||b.value-a.value);
}
const PRODUCTIVE_STATIONS=['WORKER','ASTROMECH','BATTLE'];
// Where the optimiser may park a droid that earns nothing. A Fusion slot holds
// one without producing, exactly as the Lounge does, so it can be storage too -
// but only on request, because anything parked there is what a Fuse consumes.
const loungeLikeStations=()=>state.fusionAsLounge?['LOUNGE','COMPANION','FUSION']:['LOUNGE','COMPANION'];
const replacementKey=x=>`${x.source}:${x.unit}`;
const replacementSettings=()=>({
  protect:localStorage.getItem('droid-archive-replacement-protect')!=='0',
  minimum:Math.max(0,Number(localStorage.getItem('droid-archive-replacement-minimum')??0)||0),
  minimumEnabled:localStorage.getItem('droid-archive-replacement-minimum-enabled')==='1',
  sort:localStorage.getItem('droid-archive-replacement-sort')||'gain',
  display:localStorage.getItem('droid-archive-replacement-display')==='1',
  view:localStorage.getItem('droid-archive-replacement-view')||'compact',
  target:localStorage.getItem('droid-archive-replacement-target')||''
});
function rebirthProtectedKeys(p){
  const required=new Set((state.rebirths[state.cycle]||[]).filter(r=>r.to>state.rebirth&&r.to<=rebirthGoal()).flatMap(r=>(r.requiredDroids||[]).map(x=>x.droidName))),best=new Map();
  for(const unit of [...p.placed,...p.overflow])if(required.has(unit.name)){const previous=best.get(unit.name);if(!previous||VARIANTS.indexOf(unit.variant)>VARIANTS.indexOf(previous.variant))best.set(unit.name,unit)}
  return new Set([...best.values()].map(replacementKey));
}
function productiveReplacementTargets(p,protect=true){
  const productive=p.placed.filter(x=>PRODUCTIVE_STATIONS.includes(x.station)),protectedKeys=protect?rebirthProtectedKeys(p):new Set(),baseIncome=placedBaseIncome(productive);
  return productive.filter(x=>!protectedKeys.has(replacementKey(x))).map(unit=>{
    const d=state.droids.find(x=>x.name===unit.name),rate=droidRate(d,unit.variant,unit.station,baseIncome);
    return{...unit,droid:d,base:d?.variants?.[unit.variant]?.income||0,adjusted:rate,hour:rate*3600,protected:false}
  }).sort((a,b)=>a.adjusted-b.adjusted)
}
function replacementThresholds(target,p){
  const productive=p.placed.filter(x=>PRODUCTIVE_STATIONS.includes(x.station)),remaining=productive.filter(x=>replacementKey(x)!==replacementKey(target)),current=incomeForPlaced(productive),remainingIncome=incomeForPlaced(remaining),iconicTotal=[...new Set(remaining.map(x=>x.name))].reduce((sum,name)=>sum+iconicIncome(state.droids.find(d=>d.name===name)),0),multiplier=effectiveMultiplier()||1;
  return PRODUCTIVE_STATIONS.map(type=>{const coefficient=(type===target.station?1.1:1)+iconicTotal,needed=Math.max(0,(current-remainingIncome)/multiplier/coefficient);return{type,needed}})
}
function replacementOwnership(d,variant,p,target){
  const placedByKey=new Map(p.placed.map(x=>[replacementKey(x),x])),units=expandedOwned().filter(x=>x.name===d.name),requiredRank=VARIANTS.indexOf(variant),suitable=units.filter(x=>VARIANTS.indexOf(x.variant)>=requiredRank&&replacementKey(x)!==replacementKey(target)),available=suitable.find(x=>{const placed=placedByKey.get(replacementKey(x));return !placed||!PRODUCTIVE_STATIONS.includes(placed.station)}),elsewhere=suitable.find(x=>placedByKey.has(replacementKey(x))),best=units.reduce((best,x)=>!best||VARIANTS.indexOf(x.variant)>VARIANTS.indexOf(best.variant)?x:best,null),dex=state.droidex.some(x=>x.name===d.name&&VARIANTS.indexOf(x.variant)>=requiredRank);
  if(available)return{kind:'available',label:`Owned · available (${variantLabel(available.variant)})`,cost:0,best};
  if(elsewhere)return{kind:'placed',label:`Owned · placed in ${placedByKey.get(replacementKey(elsewhere)).station.toLowerCase()}`,cost:0,best};
  if(best&&VARIANTS.indexOf(best.variant)<requiredRank)return{kind:'upgrade',label:`Owned ${variantLabel(best.variant)} · upgrade`,cost:chipsToVariant(d,best.variant,variant),best};
  return{kind:'missing',label:dex?'In Droidex · not owned':'Missing',cost:Infinity,best:null}
}
function replacementCandidates(target,p,minimum=0){
  const productive=p.placed.filter(x=>PRODUCTIVE_STATIONS.includes(x.station)),current=incomeForPlaced(productive),remaining=productive.filter(x=>replacementKey(x)!==replacementKey(target)),remainingBase=placedBaseIncome(remaining),targetLoss=current-incomeForPlaced(remaining);
  const variants=state.droids.flatMap(d=>Object.keys(d.variants||{}).filter(v=>VARIANTS.includes(v)&&(isIconic(d)?v==='DEFAULT':true)).map(variant=>{
    const candidate={name:d.name,variant,station:target.station,slot:target.slot},nextIncome=incomeForPlaced([...remaining,candidate]),gain=nextIncome-current,base=d.variants[variant]?.income||0,ownership=replacementOwnership(d,variant,p,target);
    return{...candidate,droid:d,nextIncome,gain,hourGain:gain*3600,base,adjusted:droidRate(d,variant,target.station,remainingBase),ownership}
  })).filter(x=>x.gain>0&&x.gain/Math.max(targetLoss,1)*100>=minimum).sort((a,b)=>a.name.localeCompare(b.name)||VARIANTS.indexOf(a.variant)-VARIANTS.indexOf(b.variant));
  const firstByDroid=new Map();
  for(const row of variants)if(!firstByDroid.has(row.name))firstByDroid.set(row.name,row);
  return[...firstByDroid.values()].map(row=>({...row,variantPlus:!isIconic(row.droid)&&VARIANTS.indexOf(row.variant)<VARIANTS.length-1}))
}
function replacementSort(rows,sort){
  const upgradeCost=x=>Number.isFinite(x.ownership.cost)?x.ownership.cost:Number.MAX_SAFE_INTEGER;
  return rows.sort((a,b)=>sort==='cost'?upgradeCost(a)-upgradeCost(b)||b.hourGain-a.hourGain:sort==='efficiency'?(b.hourGain/Math.max(upgradeCost(b),1))-(a.hourGain/Math.max(upgradeCost(a),1)):sort==='rarity'?rarityRank(a.droid)-rarityRank(b.droid)||b.hourGain-a.hourGain:sort==='alpha'?a.name.localeCompare(b.name)||VARIANTS.indexOf(a.variant)-VARIANTS.indexOf(b.variant):b.hourGain-a.hourGain)
}
function legacyBaseHealthCheckHtml(p){
  const allTargets=productiveReplacementTargets(p,replacementSettings().protect),weakest=allTargets[0],protectedKeys=rebirthProtectedKeys(p),productive=p.placed.filter(x=>PRODUCTIVE_STATIONS.includes(x.station)),misplaced=productive.filter(x=>{const d=state.droids.find(y=>y.name===x.name);return d&&!isIconic(d)&&d.type!==x.station}).map(x=>{const d=state.droids.find(y=>y.name===x.name),gain=(d.variants[x.variant]?.income||0)*effectiveMultiplier()*.1;return{x,d,gain}}).sort((a,b)=>b.gain-a.gain)[0],empty=PRODUCTIVE_STATIONS.reduce((sum,station)=>sum+capacity(station)-productive.filter(x=>x.station===station).length,0);
  return `<section class="base-health"><header><div><p class="eyebrow">Base health check</p><h2>At a glance</h2></div><span>${productive.length} productive droid${productive.length===1?'':'s'}</span></header><div class="base-health-grid"><button data-health-target="${weakest?replacementKey(weakest):''}" ${weakest?'':'disabled'}><small>Weakest earner</small><strong>${weakest?weakest.name:'None'}</strong><span>${weakest?`${fmt(weakest.adjusted)}/s · ${weakest.station} ${weakest.slot+1}`:'No productive droids'}</span></button><div><small>Largest misplaced droid</small><strong>${misplaced?misplaced.d.name:'None'}</strong><span>${misplaced?`${misplaced.x.station} · +${fmt(misplaced.gain*3600)}/h if matched`:'Every droid is type-matched'}</span></div><div><small>Empty productive slots</small><strong>${empty}</strong><span>Worker, Astromech and Battle</span></div><div><small>Protected rebirth droids</small><strong>${protectedKeys.size}</strong><span>Through Rebirth ${rebirthGoal()}</span></div></div></section>`
}
function legacyReplacementCalculatorHtml(p){
  const settings=replacementSettings(),targets=productiveReplacementTargets(p,settings.protect),target=targets.find(x=>replacementKey(x)===settings.target)||targets[0],thresholds=target?replacementThresholds(target,p):[],rows=target?replacementSort(replacementCandidates(target,p,settings.minimum),settings.sort):[];
  if(target)localStorage.setItem('droid-archive-replacement-target',replacementKey(target));
  return `<section class="replacement-calculator"><header><div><p class="eyebrow">Base calculator</p><h2>Droid Replacement Calculator</h2><p>Find the base income a droid needs to improve a productive station.</p></div><button class="btn secondary" id="compareDroids">Compare two droids</button></header><div class="replacement-controls"><label class="replacement-protect"><input type="checkbox" id="replacementProtect" ${settings.protect?'checked':''}> Protect rebirth droids</label><label>Replacement target<select id="replacementTarget" class="form-control">${targets.map(x=>`<option value="${replacementKey(x)}" ${replacementKey(x)===replacementKey(target)?'selected':''}>${x.name} ${variantLabel(x.variant)} · ${x.station} ${x.slot+1}</option>`).join('')}</select></label><label>Sort results<select id="replacementSort" class="form-control"><option value="gain" ${settings.sort==='gain'?'selected':''}>Largest credit increase</option><option value="cost" ${settings.sort==='cost'?'selected':''}>Lowest upgrade cost</option><option value="efficiency" ${settings.sort==='efficiency'?'selected':''}>Best gain per upgrade chip</option><option value="rarity" ${settings.sort==='rarity'?'selected':''}>Lowest rarity</option><option value="alpha" ${settings.sort==='alpha'?'selected':''}>Alphabetical</option></select></label><label>Minimum improvement<input id="replacementMinimum" class="form-control" type="number" min="0" step="1" value="${settings.minimum}"><span>%</span></label><button class="btn" id="displayReplacementDroids">${settings.display?'Hide droids':'Display Droids'}</button></div>${target?`<div class="replacement-target"><div class="replacement-target-card">${picture(target.droid,target.variant)}<span><small>Current weakest replaceable droid</small><strong>${target.name} ${variantText(target.variant)}</strong><em>${target.station} station · slot ${target.slot+1}</em></span></div><dl><div><dt>Base income</dt><dd>${isIconic(target.droid)?`${Math.round(iconicIncome(target.droid)*100)}%/s`:`${fmt(target.base)}/s`}</dd></div><div><dt>Adjusted income</dt><dd>${fmt(target.adjusted)}/s</dd></div><div><dt>Credits / hour</dt><dd>${fmt(target.hour)}</dd></div></dl></div><div class="replacement-thresholds">${thresholds.map(x=>`<div><span>${stationIcon(x.type)}<small>${x.type[0]+x.type.slice(1).toLowerCase()} droid</small></span><strong>${fmt(x.needed)}/s base</strong><em>${x.type===target.station?'+10% station match':'No station match'}</em></div>`).join('')}</div>${settings.display?`<div class="replacement-results-head"><strong>${rows.length} improving droid variant${rows.length===1?'':'s'}</strong><span>Compared with ${target.name} in ${target.station} ${target.slot+1}</span></div><div class="replacement-results">${rows.map(x=>`<article class="replacement-result replacement-${x.ownership.kind}"><a href="#/droid/${slug(x.name)}">${picture(x.droid,x.variant)}<span><strong>${x.name}</strong><small>${variantText(x.variant)} · ${rarityText(x.droid.rarity)}</small></span></a><dl><div><dt>Base</dt><dd>${isIconic(x.droid)?`${Math.round(iconicIncome(x.droid)*100)}%/s`:`${fmt(x.base)}/s`}</dd></div><div><dt>Adjusted</dt><dd>${fmt(x.adjusted)}/s</dd></div><div><dt>Gain / hour</dt><dd>+${fmt(x.hourGain)}</dd></div><div><dt>Upgrade cost</dt><dd>${Number.isFinite(x.ownership.cost)?`${fmt(x.ownership.cost)} chips`:'—'}</dd></div></dl><footer><span>${x.ownership.label}</span><a href="#/droid/${slug(x.name)}">Wiki page →</a></footer></article>`).join('')||'<div class="empty">No droid variants beat this target by the selected minimum improvement.</div>'}</div>`:''}`:'<div class="empty">There are no replaceable productive droids with the current protection setting.</div>'}</section>`
}
function baseHealthCheckHtml(p){
  const allTargets=productiveReplacementTargets(p,replacementSettings().protect),weakest=allTargets[0],protectedKeys=rebirthProtectedKeys(p),productive=p.placed.filter(x=>PRODUCTIVE_STATIONS.includes(x.station)),misplaced=productive.filter(x=>{const d=state.droids.find(y=>y.name===x.name);return d&&!isIconic(d)&&d.type!==x.station}).map(x=>{const d=state.droids.find(y=>y.name===x.name),gain=(d.variants[x.variant]?.income||0)*effectiveMultiplier()*.1;return{x,d,gain}}).sort((a,b)=>b.gain-a.gain)[0],empty=PRODUCTIVE_STATIONS.reduce((sum,station)=>sum+capacity(station)-productive.filter(x=>x.station===station).length,0);
  return `<section class="base-health"><header><div><p class="eyebrow">Base health check</p><h2>At a glance</h2></div><span>${productive.length} productive droid${productive.length===1?'':'s'}</span></header><div class="base-health-grid"><div><small>Weakest replaceable earner</small><strong>${weakest?weakest.name:'None'}</strong><span>${weakest?`${fmt(weakest.adjusted)}/s &middot; ${weakest.station} ${weakest.slot+1}`:'No productive droids'}</span></div><div><small>Largest misplaced droid</small><strong>${misplaced?misplaced.d.name:'None'}</strong><span>${misplaced?`${misplaced.x.station} &middot; +${fmt(misplaced.gain*3600)}/h if matched`:'Every droid is type-matched'}</span></div><div><small>Empty productive slots</small><strong>${empty}</strong><span>Worker, Astromech and Battle</span></div><div><small>Protected rebirth droids</small><strong>${protectedKeys.size}</strong><span>Through Rebirth ${rebirthGoal()}</span></div></div></section>`
}
function replacementCalculatorHtml(p,{manual=false}={}){
  const settings=replacementSettings(),targets=productiveReplacementTargets(p,settings.protect),target=manual?(targets.find(x=>replacementKey(x)===settings.target)||targets[0]):targets[0],thresholds=target?replacementThresholds(target,p):[],minimum=settings.minimumEnabled?settings.minimum:0,rows=target?replacementSort(replacementCandidates(target,p,minimum),settings.sort):[];
  if(manual&&target)localStorage.setItem('droid-archive-replacement-target',replacementKey(target));
  const targetPicker=manual?`<label>Replacement target<select id="replacementTarget" class="form-control">${targets.map(x=>`<option value="${replacementKey(x)}" ${replacementKey(x)===replacementKey(target)?'selected':''}>${x.name} ${variantLabel(x.variant)} &middot; ${x.station} ${x.slot+1}</option>`).join('')}</select></label>`:'';
  const resultCards=settings.view==='compact'?rows.map(x=>`<a class="replacement-compact-card replacement-${x.ownership.kind}" href="#/droid/${slug(x.name)}">${picture(x.droid,x.variant)}<span><strong>${x.name}</strong><small>${variantText(x.variant)}${x.variantPlus?'+':''}</small></span><span><small>Base income</small><b>${isIconic(x.droid)?`${Math.round(iconicIncome(x.droid)*100)}%/s`:`${fmt(x.base)}/s`}</b></span></a>`).join(''):rows.map(x=>{const scrapGain=scrapPayoutsForIncome(x.gain);return `<article class="replacement-result replacement-${x.ownership.kind}"><a href="#/droid/${slug(x.name)}">${picture(x.droid,x.variant)}<span><strong>${x.name}</strong><small>${variantText(x.variant)}${x.variantPlus?'+':''}</small><em>${rarityText(x.droid.rarity)}</em></span></a><dl><div><dt>Base</dt><dd>${isIconic(x.droid)?`${Math.round(iconicIncome(x.droid)*100)}%/s`:`${fmt(x.base)}/s`}</dd></div><div><dt>Adjusted</dt><dd>${fmt(x.adjusted)}/s</dd></div><div><dt>Gain / hour</dt><dd>+${fmt(x.hourGain)}</dd></div><div><dt>Upgrade cost</dt><dd>${Number.isFinite(x.ownership.cost)?`${fmt(x.ownership.cost)} chips`:'&mdash;'}</dd></div><div><dt>Scrap / hit</dt><dd>${scrapGain.hit?`+${fmt(scrapGain.hit)}`:'&mdash;'}</dd></div><div><dt>Scrap / break</dt><dd>${scrapGain.break?`+${fmt(scrapGain.break)}`:'&mdash;'}</dd></div></dl><footer><span>${x.ownership.label}</span><a href="#/droid/${slug(x.name)}">Wiki page &rarr;</a></footer></article>`}).join('');
  return `<section class="replacement-calculator"><header><div><p class="eyebrow">Base calculator</p><h2>Droid Replacement Calculator</h2><p>${manual?'Choose any productive card and compare every practical replacement.':'Automatically checks the weakest eligible earner in your productive Base.'}</p></div><div class="replacement-header-actions">${manual?'':`<a class="btn secondary" href="#/droid-calc">Open Droid Calc</a>`}<button class="btn secondary" id="compareDroids">Compare two droids</button></div></header><div class="replacement-controls ${manual?'manual':'automatic'}"><label class="replacement-protect"><input type="checkbox" id="replacementProtect" ${settings.protect?'checked':''}> Protect rebirth droids</label>${targetPicker}<label>Sort results<select id="replacementSort" class="form-control"><option value="gain" ${settings.sort==='gain'?'selected':''}>Largest credit increase</option><option value="cost" ${settings.sort==='cost'?'selected':''}>Lowest upgrade cost</option><option value="efficiency" ${settings.sort==='efficiency'?'selected':''}>Best gain per upgrade chip</option><option value="rarity" ${settings.sort==='rarity'?'selected':''}>Lowest rarity</option><option value="alpha" ${settings.sort==='alpha'?'selected':''}>Alphabetical</option></select></label><label class="replacement-minimum"><span><input type="checkbox" id="replacementMinimumEnabled" ${settings.minimumEnabled?'checked':''}> Minimum improvement</span><span><input id="replacementMinimum" class="form-control" type="number" min="0" step="1" value="${settings.minimum}" ${settings.minimumEnabled?'':'disabled'}><b>%</b></span></label><button class="btn" id="displayReplacementDroids">${settings.display?'Hide droids':'Display Droids'}</button></div>${target?`<div class="replacement-target"><div class="replacement-target-card">${picture(target.droid,target.variant)}<span><small>${manual?'Selected replacement target':'Current weakest replaceable droid'}</small><strong>${target.name} ${variantText(target.variant)}</strong><em>${target.station} station &middot; slot ${target.slot+1}</em></span></div><dl><div><dt>Base income</dt><dd>${isIconic(target.droid)?`${Math.round(iconicIncome(target.droid)*100)}%/s`:`${fmt(target.base)}/s`}</dd></div><div><dt>Adjusted income</dt><dd>${fmt(target.adjusted)}/s</dd></div><div><dt>Credits / hour</dt><dd>${fmt(target.hour)}</dd></div></dl></div><div class="replacement-threshold-intro"><strong>Break-even base income for ${target.station} ${target.slot+1}</strong><span>A replacement must exceed the shown value. A lower requirement means that candidate receives the station-match bonus.</span></div><div class="replacement-thresholds">${thresholds.map(x=>`<div><span>${stationIcon(x.type)}<small>${x.type[0]+x.type.slice(1).toLowerCase()} candidate</small></span><strong>Must exceed ${fmt(x.needed)}/s</strong><em>${x.type===target.station?'Receives +10% match bonus in this slot':'Receives no match bonus in this slot'}</em></div>`).join('')}</div>${settings.display?`<div class="replacement-results-head"><div><strong>${rows.length} improving droid${rows.length===1?'':'s'}</strong><span>Compared with ${target.name} in ${target.station} ${target.slot+1}</span></div><div class="replacement-view-toggle"><button data-replacement-view="compact" class="${settings.view==='compact'?'active':''}">Compact</button><button data-replacement-view="detailed" class="${settings.view==='detailed'?'active':''}">Detailed</button></div></div><div class="replacement-results ${settings.view}">${resultCards||`<div class="empty">No droids beat this target${settings.minimumEnabled?` by at least ${settings.minimum}%`:''}.</div>`}</div>`:''}`:'<div class="empty">There are no replaceable productive droids with the current protection setting.</div>'}</section>`
}
function attachReplacementCalculator(render){
  const rerender=()=>{const y=scrollY;render();requestAnimationFrame(()=>scrollTo(0,y))},set=(key,value)=>localStorage.setItem(key,String(value));
  document.querySelector('#replacementProtect')?.addEventListener('change',e=>{set('droid-archive-replacement-protect',e.target.checked?'1':'0');rerender()});
  document.querySelector('#replacementTarget')?.addEventListener('change',e=>{set('droid-archive-replacement-target',e.target.value);rerender()});
  document.querySelector('#replacementSort')?.addEventListener('change',e=>{set('droid-archive-replacement-sort',e.target.value);rerender()});
  document.querySelector('#replacementMinimumEnabled')?.addEventListener('change',e=>{set('droid-archive-replacement-minimum-enabled',e.target.checked?'1':'0');rerender()});
  document.querySelector('#replacementMinimum')?.addEventListener('change',e=>{set('droid-archive-replacement-minimum',Math.max(0,Number(e.target.value)||0));rerender()});
  document.querySelector('#displayReplacementDroids')?.addEventListener('click',()=>{set('droid-archive-replacement-display',replacementSettings().display?'0':'1');rerender()});
  document.querySelectorAll('[data-replacement-view]').forEach(button=>button.addEventListener('click',()=>{set('droid-archive-replacement-view',button.dataset.replacementView);rerender()}));
  document.querySelector('#compareDroids')?.addEventListener('click',()=>showDroidComparisonModal());
}
function comparisonRate(d,variant,station){return droidRate(d,variant,station,isIconic(d)?placedBaseIncome(placements().placed.filter(x=>PRODUCTIVE_STATIONS.includes(x.station))):0)}
function comparisonDroidHtml(d){const variants=Object.keys(d.variants||{}).filter(v=>VARIANTS.includes(v)&&(isIconic(d)?v==='DEFAULT':true));return `<section class="comparison-droid"><header>${picture(d,variants.at(-1)||'DEFAULT')}<div><h3>${d.name}</h3><span>${rarityText(d.rarity)} · ${d.type}</span></div></header><div class="comparison-table-wrap"><table><thead><tr><th>Variant</th><th>Base</th>${PRODUCTIVE_STATIONS.map(x=>`<th>${x[0]+x.slice(1).toLowerCase()}</th>`).join('')}</tr></thead><tbody>${variants.map(v=>`<tr><th>${variantText(v)}</th><td>${isIconic(d)?`${Math.round(iconicIncome(d)*100)}%/s`:`${fmt(d.variants[v]?.income||0)}/s`}</td>${PRODUCTIVE_STATIONS.map(station=>`<td>${fmt(comparisonRate(d,v,station))}/s</td>`).join('')}</tr>`).join('')}</tbody></table></div><a href="#/droid/${slug(d.name)}">Open wiki page →</a></section>`}
function showDroidComparisonModal(){const root=document.querySelector('#modalRoot'),options=state.droids.map(d=>`<option value="${d.name}">${d.name}</option>`).join(''),draw=(a,b)=>{const first=state.droids.find(d=>d.name===a)||state.droids[0],second=state.droids.find(d=>d.name===b)||state.droids[1]||first;root.innerHTML=`<div class="modal-backdrop"><section class="modal comparison-modal" role="dialog" aria-modal="true"><header><div><p class="eyebrow">Base comparison</p><h2>Compare droids</h2><p>Adjusted values use your current multiplier and each possible station match. Iconic rows show what their percentage earns from your Base income.</p></div><button class="icon-btn" id="closeComparison" aria-label="Close">×</button></header><div class="comparison-selects"><label>Droid one<select id="comparisonOne" class="form-control">${options}</select></label><span>versus</span><label>Droid two<select id="comparisonTwo" class="form-control">${options}</select></label></div><div class="comparison-grid">${comparisonDroidHtml(first)}${comparisonDroidHtml(second)}</div></section></div>`;root.querySelector('#comparisonOne').value=first.name;root.querySelector('#comparisonTwo').value=second.name;root.querySelector('#comparisonOne').onchange=e=>draw(e.target.value,root.querySelector('#comparisonTwo').value);root.querySelector('#comparisonTwo').onchange=e=>draw(root.querySelector('#comparisonOne').value,e.target.value);root.querySelector('#closeComparison').onclick=()=>root.innerHTML=''};draw(state.droids[0]?.name,state.droids[1]?.name)}
function attachCollapsiblePanels(){
  const actions=document.querySelector('.base-actions');
  const hasGroupOutlook=Boolean(document.querySelector('.group-outlook-panel'));
  const hasFusionOutlook=Boolean(document.querySelector('.fusion-outlook'));
  // The modern UI adds the icon itself from the button's text, via
  // modernButtonIcon, so this must not carry one of its own or it gets two.
  if(actions)actions.innerHTML=`<button class="btn secondary base-panel-toggle ${baseViewIsMap()?'active':''}" id="toggleBaseMap">${baseViewIsMap()?'Hide Map':'Show Map'}</button><button class="btn secondary base-panel-toggle" id="toggleHealthPanel">Hide Health</button><button class="btn secondary base-panel-toggle" id="toggleScrapPanel">Hide Scrap</button><button class="btn secondary base-panel-toggle" id="toggleChipSellPanel">Hide Chips</button><button class="btn secondary base-panel-toggle" id="toggleReplacementPanel">Hide Droid Calc</button><button class="btn secondary base-panel-toggle" id="toggleOutlookPanel">Hide Outlook</button>${hasGroupOutlook?'<button class="btn secondary base-panel-toggle" id="toggleGroupOutlookPanel">Hide Group Outlook</button>':''}${hasFusionOutlook?'<button class="btn secondary base-panel-toggle" id="toggleFusionOutlookPanel">Hide Fusion</button>':''}<button class="btn secondary base-panel-toggle" id="toggleBaseDetail">Hide Detail</button><button class="btn secondary" id="transferBase" title="Import or export Base">Import / Export</button>`;
  document.querySelectorAll('.slot-replacement-target').forEach(button=>button.remove());
  const outlook=document.querySelector('.rebirth-summary-box'),next=outlook?.querySelector('.outlook-next'),viewRebirths=outlook?.querySelector(':scope > a.btn');
  if(next&&viewRebirths){const label=next.querySelector(':scope > .outlook-label'),row=document.createElement('div');row.className='outlook-next-title';label?.before(row);if(label)row.append(label);row.append(viewRebirths)}
  [{selector:'.fusion-outlook',button:'#toggleFusionOutlookPanel',key:'droid-archive-fusion-outlook-collapsed',label:'Fusion'},
   {selector:'.base-health',button:'#toggleHealthPanel',key:'droid-archive-health-collapsed',label:'Health'},{selector:'.scrap-calculator:not(.chip-sell-calculator)',button:'#toggleScrapPanel',key:'droid-archive-scrap-collapsed',label:'Scrap'},{selector:'.chip-sell-calculator',button:'#toggleChipSellPanel',key:'droid-archive-chip-sell-collapsed',label:'Chips'},{selector:'.replacement-calculator',button:'#toggleReplacementPanel',key:'droid-archive-replacement-collapsed',label:'Droid Calc',defaultCollapsed:true},{selector:'.rebirth-summary-box',button:'#toggleOutlookPanel',key:'droid-archive-rebirth-outlook-collapsed',label:'Outlook'},{selector:'.group-outlook-panel',button:'#toggleGroupOutlookPanel',key:`droid-archive-group-outlook-collapsed:${state.cloud.user?.id||'local'}`,label:'Group Outlook'}].forEach(item=>{const panel=document.querySelector(item.selector),button=document.querySelector(item.button);if(!panel||!button)return;const update=collapsed=>{panel.classList.toggle('collapsed',collapsed);button.classList.toggle('active',!collapsed);button.textContent=`${collapsed?'Show':'Hide'} ${item.label}`;button.title=`${collapsed?'Show':'Hide'} ${item.label}`;button.setAttribute('aria-expanded',String(!collapsed));if(document.documentElement.dataset.uiStyle==='modern')requestAnimationFrame(()=>decorateCommandDeck('/base'))},stored=localStorage.getItem(item.key);update(stored===null?Boolean(item.defaultCollapsed):stored==='1');button.onclick=()=>{const collapsed=!panel.classList.contains('collapsed');localStorage.setItem(item.key,collapsed?'1':'0');update(collapsed)}});
  const detailButton=document.querySelector('#toggleBaseDetail'),layout=document.querySelector('.base-layout-v2'),detailKey='droid-archive-base-detail-hidden';
  if(detailButton&&layout){const update=hidden=>{layout.classList.toggle('base-details-hidden',hidden);detailButton.classList.toggle('active',!hidden);detailButton.textContent=hidden?'Show Detail':'Hide Detail';detailButton.title=hidden?'Show full droid card details':'Use compact droid cards';detailButton.setAttribute('aria-pressed',String(hidden));if(document.documentElement.dataset.uiStyle==='modern')requestAnimationFrame(()=>decorateCommandDeck('/base'))};update(localStorage.getItem(detailKey)==='1');detailButton.onclick=()=>{const hidden=!layout.classList.contains('base-details-hidden');localStorage.setItem(detailKey,hidden?'1':'0');update(hidden)}}
  document.querySelector('#chooseBaseGroupProfiles')?.addEventListener('click',showBaseGroupProfilePicker);
  attachOutlookVariantControls()
}
function setNovaLevel(id,level,notify=true){const upgrade=novaUpgrade(id);if(!upgrade||upgrade.comingSoon)return;const max=upgrade.uncapped?Infinity:upgrade.levels.length,min=minimumNovaLevel(id);state.novaUpgrades[id]=Math.max(min,Math.min(max,Number(level)||0));if(id==='lounge-slot')state.loungePurchased=state.novaUpgrades[id];save();if(notify)toast(`${upgrade.name} set to level ${state.novaUpgrades[id]}`)}
function legacyNovaShopPage(){let category='featured';const render=()=>{const shop=state.novaShop;if(!shop){app.innerHTML='<h1>Nova Shop unavailable</h1>';return}const list=shop.upgrades.filter(x=>category==='all'||x.category===category);app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / Nova Shop</div><section class="nova-hero"><div><p class="eyebrow">Nova upgrades</p><h1>Nova Shop</h1><p class="lead">Track Nova Crystal upgrades, costs, and unlocks. Upgrade levels are saved with your profile.</p></div><div class="nova-currency"><img src="${shop.currency.icon}" alt=""><strong>${shop.currency.name}s</strong></div></section><div class="variant-tabs nova-tabs"><button data-nova-cat="all" class="${category==='all'?'active':''}">All</button>${shop.categories.map(c=>`<button data-nova-cat="${c.id}" class="${category===c.id?'active':''}">${c.name}</button>`).join('')}</div><div class="nova-grid">${list.map(u=>{const level=novaLevelFor(u.id),next=u.levels[level]||{level:level+1,cost:null,unknown:true},done=!u.uncapped&&level>=u.levels.length,coming=Boolean(u.comingSoon);return `<article class="nova-card ${u.category==='featured'?'featured-upgrade':''} ${coming?'coming-soon':''}"><a href="#/nova-shop/${u.id}"><span class="nova-card-icon">${u.icon}</span><small>${shop.categories.find(c=>c.id===u.category)?.name||u.category}</small><strong>${u.name}</strong><em>${coming?'Soon':`${level}/${u.uncapped?'∞':u.levels.length}`}</em><p>${u.description}</p></a><div><button class="btn secondary" data-nova-dec="${u.id}" ${level<=0||coming?'disabled':''}>−</button><span>${coming?'Coming Soon':done?'Maxed':novaCost(next)}</span><button class="btn" data-nova-inc="${u.id}" ${coming||done?'disabled':''}>+</button></div></article>`}).join('')}</div><h2>Nova crystals from rebirths</h2><table class="nova-reward-table"><thead><tr><th>Rebirth</th><th>Nova Crystals</th><th>Credit Mult</th><th>XP Mult</th></tr></thead><tbody>${shop.rebirthRewards.map(r=>`<tr><td>RB ${r.rebirth}</td><td>${r.novaCrystals}</td><td>${r.creditMultPercent}%</td><td>${r.xpMultPercent}%</td></tr>`).join('')}</tbody></table>`;document.querySelectorAll('[data-nova-cat]').forEach(b=>b.onclick=()=>{category=b.dataset.novaCat;render()});document.querySelectorAll('[data-nova-inc]').forEach(b=>b.onclick=()=>{setNovaLevel(b.dataset.novaInc,novaLevelFor(b.dataset.novaInc)+1);render()});document.querySelectorAll('[data-nova-dec]').forEach(b=>b.onclick=()=>{setNovaLevel(b.dataset.novaDec,novaLevelFor(b.dataset.novaDec)-1);render()})};render()}
function legacyNovaDetailPage(id){const u=novaUpgrade(id);if(!u){notFound();return}const category=state.novaShop.categories.find(c=>c.id===u.category)?.name||u.category,level=novaLevelFor(u.id),knownTotal=u.levels.reduce((s,x)=>s+(Number(x.cost)||0),0),spent=u.levels.slice(0,Math.min(level,u.levels.length)).reduce((s,x)=>s+(Number(x.cost)||0),0),next=u.levels[level]||{level:level+1,cost:null,unknown:true},done=!u.uncapped&&level>=u.levels.length,coming=Boolean(u.comingSoon);app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / <a href="#/nova-shop">Nova Shop</a> / ${u.name}</div><div class="article-grid"><article><p class="eyebrow">${category}</p><h1>${u.name}</h1><p class="lead">${u.description}</p><div class="base-top"><div class="stat"><small>Current level</small><strong>${coming?'Soon':`${level}/${u.uncapped?'∞':u.levels.length}`}</strong></div><div class="stat"><small>Known spent</small><strong>${fmt(spent)}</strong></div><div class="stat"><small>Known total</small><strong>${coming?'Coming Soon':u.uncapped?`${fmt(knownTotal)}+`:fmt(knownTotal)}</strong></div><div class="stat"><small>Next cost</small><strong>${coming?'Coming Soon':done?'Maxed':next.cost===null?'Unknown':fmt(next.cost)}</strong></div></div><h2>Upgrade costs</h2><table><thead><tr><th>Level</th><th>Nova Crystal cost</th><th>Running total</th></tr></thead><tbody>${u.levels.map((x,i)=>`<tr class="${i<level?'selected-variant':''}"><td>${x.level}</td><td>${novaCost(x)}</td><td>${fmt(u.levels.slice(0,i+1).reduce((s,y)=>s+(Number(y.cost)||0),0))}</td></tr>`).join('')}${u.uncapped?`<tr><td>${u.levels.length+1}+</td><td>Cost unknown</td><td>${fmt(knownTotal)}+</td></tr>`:''}${coming?'<tr><td colspan="3">Coming Soon</td></tr>':''}</tbody></table><div class="modal-actions"><button class="btn secondary" id="novaDown" ${level<=0||coming?'disabled':''}>Decrease level</button><button class="btn" id="novaUp" ${coming||done?'disabled':''}>Increase level</button></div></article><aside class="infobox nova-info"><div class="info-title">${u.name}</div><div class="nova-big-icon">${u.icon}</div><div class="info-rows"><div class="info-row"><b>Category</b><span>${category}</span></div><div class="info-row"><b>Level</b><span>${coming?'Coming Soon':`${level}/${u.uncapped?'∞':u.levels.length}`}</span></div><div class="info-row"><b>Currency</b><span>${state.novaShop.currency.name}</span></div><div class="info-row"><b>Source</b><span>Nova Shop</span></div></div></aside></div>`;document.querySelector('#novaUp').onclick=()=>{setNovaLevel(u.id,level+1);novaDetailPage(id)};document.querySelector('#novaDown').onclick=()=>{setNovaLevel(u.id,level-1);novaDetailPage(id)}}
function droidsPage(){const q=new URLSearchParams(location.hash.split('?')[1]||'');app.innerHTML=`<div class="breadcrumbs"><a href="#/">Main page</a> / Droids</div><p class="eyebrow">Droidex</p><h1>All droids</h1><p class="lead">The complete archive. Select a droid for its dedicated page and all six quality variants.</p><div class="toolbar"><input id="droidSearch" placeholder="Filter by name…"><select id="typeFilter"><option value="">All types</option>${['WORKER','ASTROMECH','BATTLE'].map(x=>`<option ${q.get('type')===x?'selected':''}>${x}</option>`).join('')}</select><select id="rarityFilter"><option value="">All rarities</option>${['COMMON','RARE','EPIC','LEGENDARY','MYTHIC','ICONIC'].map(x=>`<option>${x}</option>`).join('')}</select></div><p id="resultCount" class="eyebrow"></p><div id="droidGrid" class="droid-grid"></div>`;const draw=()=>{let name=document.querySelector('#droidSearch').value.toLowerCase(),type=document.querySelector('#typeFilter').value,rarity=document.querySelector('#rarityFilter').value;let list=state.droids.filter(d=>d.name.toLowerCase().includes(name)&&(!type||d.type===type)&&(!rarity||d.rarity===rarity));document.querySelector('#resultCount').textContent=`${list.length} entries`;document.querySelector('#droidGrid').innerHTML=list.map(card).join('')};['droidSearch','typeFilter','rarityFilter'].forEach(id=>document.querySelector('#'+id).addEventListener('input',draw));draw()}
// Which quality you were looking at, kept per droid for the session. The page
// re-renders for reasons that have nothing to do with you - a cloud change
// landing, the timer strip remounting - and dropping back to Default every time
// made the tabs unusable if you were reading anything else.
const detailVariantChoice=new Map();
const detailOnlySelected=new Map();
// A fusion droid is made, not crafted, so its recipe is the only thing on the
// page that says where it comes from.
function detailFusionHtml(d){
  const recipe=fusionRecipes().find(entry=>entry.name===d.name);
  if(!recipe)return'';
  const need=fusionNeed(recipe);
  const parts=need.parts.map(part=>`<a class="detail-fusion-part ${part.short?'is-short':'is-held'}" href="#/droid/${slug(part.name)}">${escapeAttr(part.name)}${part.need>1?` &times;${part.need}`:''}<em>${part.have}/${part.need}</em></a>`).join('<b>+</b>');
  return `<h2>Fusion recipe</h2>
    <p class="lead">${escapeAttr(d.name)} cannot be crafted. It is fused from three droids, and comes out at the worst quality that went in.</p>
    <div class="detail-fusion ${need.ready?'is-ready':''}">${parts}<span class="detail-fusion-arrow">&rarr;</span><span class="detail-fusion-out">${escapeAttr(d.name)}</span></div>
    <p class="detail-fusion-note">${need.ready?'You hold all three.':`Still short ${need.missing.map(part=>`${part.short} &times; ${escapeAttr(part.name)}`).join(', ')}.`} <a href="#/fusion-lab">Fusion Lab</a></p>`;
}
function detailPage(id){
  const d=state.droids.find(x=>slug(x.name)===id);
  if(!d){notFound();return}
  const qualities=onlyDefaultVariant(d)?['DEFAULT']:VARIANTS.filter(x=>d.variants[x]);
  let variant=detailVariantChoice.get(d.name);
  if(!qualities.includes(variant))variant=qualities[0]||'DEFAULT';
  const render=()=>{
    detailVariantChoice.set(d.name,variant);
    const only=detailOnlySelected.get(d.name)===true;
    const v=d.variants[variant]||d.variants.DEFAULT,attribute=droidAttribute(d,variant),chips=upgradeChipRate(d,variant);
    const flawless=isDroidFlawless(d.name);
    // Every quality in one table: comparing them was a click each way before.
    const rows=qualities.filter(x=>!only||x===variant).map(x=>{
      const row=d.variants[x],owned=Boolean(droidexEntry(d.name,x));
      return `<tr class="${x===variant?'selected-variant':''} ${owned?'in-droidex':''}" data-row-variant="${x}">
        <td><strong>${variantText(x)}</strong>${owned?'<span class="dex-tick" title="In your Droidex">&#10003;</span>':''}</td>
        <td>${craftTimeText(row.craftingSeconds)}</td><td>${fmt(row.cost)}</td>
        <td>${fmt(row.income)}</td><td>${fmt(row.income*3600)}</td></tr>`;
    }).join('');
    const tabs=qualities.map(x=>`<button data-v="${x}" class="${variant===x?'active':''} ${droidexEntry(d.name,x)?'in-droidex':''}" title="${droidexEntry(d.name,x)?`${variantLabel(x)} is in your Droidex`:`${variantLabel(x)} is missing from your Droidex`}">${variantText(x)}</button>`).join('');
    const missing=qualities.filter(x=>!droidexEntry(d.name,x));
    app.innerHTML=`<div class="breadcrumbs"><a href="#/">Main page</a> / <a href="#/droids">Droids</a> / ${d.name}</div><div class="article-grid"><article><p class="eyebrow">${rarityText(d.rarity)} ${d.type} droid</p><h1>${d.name}</h1><p class="lead"><strong>${d.name}</strong> is a ${rarityText(d.rarity)} ${d.type.toLowerCase()} droid. Its base form produces ${fmt(d.variants.DEFAULT.income)} credits per second and every quality is catalogued below.</p><div class="variant-tabs">${tabs}</div>
      <div class="variant-dex-line">${qualities.length>1?`<span>${qualities.length-missing.length}/${qualities.length} in your Droidex${missing.length?` &middot; still missing ${missing.map(x=>variantText(x)).join(', ')}`:''}</span>`:'<span></span>'}${qualities.length>1?`<label class="variant-filter"><input type="checkbox" id="onlySelectedVariant" ${only?'checked':''}> Only ${variantText(variant)}</label>`:''}</div>
      <h2>Statistics</h2><table><thead><tr><th>Variant</th><th>Craft time</th><th>Crafting cost</th><th>Credits / second</th><th>Credits / hour</th></tr></thead><tbody>${rows}</tbody></table>${detailFusionHtml(d)}<h2>Gameplay</h2><p class="lead">As a ${d.type.toLowerCase()} droid, ${droidGameplayAttribute(d,variant)} Production shown in the table is before your in-game credit multiplier.</p><div class="detail-actions"><button class="btn" id="addThis">Add ${variantText(variant)} to my base</button><button class="btn secondary" id="addBlueprintThis">Add blueprint</button></div></article><aside class="infobox"><div class="info-title">${d.name}</div><div class="info-image">${picture(d,variant)}</div><div class="info-rows"><div class="info-row"><b>Quality</b><span>${variantText(variant)}</span></div><div class="info-row"><b>Rarity</b><span>${rarityText(d.rarity)}</span></div><div class="info-row"><b>Type</b><span>${d.type}</span></div><div class="info-row"><b>Attribute</b><span>${attribute}</span></div><div class="info-row"><b>Upgrade Chips</b><span>${chips?`${fmt(chips)}/min`:'N/A'}</span></div><div class="info-row"><b>Sells for</b><span>${chipSellValue(d,variant)?`${fmt(chipSellValue(d,variant))} chips${bb8CompanionActive(placements().placed)?` &middot; ${fmt(chipSellValue(d,variant)*2)} with BB-8`:''}`:'N/A'}</span></div><div class="info-row"><b>Craft time</b><span>${craftTimeText(v.craftingSeconds)}</span></div><div class="info-row"><b>Cost</b><span>${variantCostText(d,variant)}</span></div><div class="info-row"><b>Income</b><span>${variantIncomeText(d,variant)}</span></div><div class="info-row"><b>Droidex</b><span>${droidexEntry(d.name,variant)?`Tracked${flawless?' &middot; flawless':''}`:'Not tracked'}</span></div></div></aside></div>`;
    document.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{variant=b.dataset.v;render()});
    document.querySelectorAll('[data-row-variant]').forEach(row=>row.onclick=()=>{variant=row.dataset.rowVariant;render()});
    const onlyBox=document.querySelector('#onlySelectedVariant');
    if(onlyBox)onlyBox.onchange=e=>{detailOnlySelected.set(d.name,e.target.checked);render()};
    document.querySelector('#addThis').onclick=()=>requestAdd(d.name,variant);
    document.querySelector('#addBlueprintThis').onclick=()=>addBlueprint(d.name,variant);
  };
  render();
}
function commitOwned(name,variant,qty=1,preferred,preferredSlot){const slot=Number(preferredSlot),hasSlot=Number.isInteger(slot),building=BUILDING_STATIONS.includes(preferred)&&!autoCompleteBuilds(),row=state.owned.find(x=>x.name===name&&x.variant===variant&&x.preferred===preferred&&(!hasSlot||Number(x.preferredSlot)===slot)&&rowIsBuilding(x)===building);row?row.qty+=qty:state.owned.push({name,variant,qty,...(preferred?{preferred,...(hasSlot?{preferredSlot:slot}:{})}:{}),...(preferred==='BUILD'&&!building?{built:true}:{})});
  // A droid still being built is not in the Droidex yet; completing it records it.
  const logged=building?false:recordDroidex(name,variant);
  save();toast(`${name} added to your base${building?' · still building':logged?' and Droidex':''}`)}
function addBlueprint(name,variant,slot){const used=new Set(state.blueprints.map(x=>Number(x.slot))),target=Number.isInteger(Number(slot))?Number(slot):Array.from({length:capacity('BLUEPRINT_STORAGE')},(_,i)=>i).find(i=>!used.has(i));if(target===undefined||target<0||target>=capacity('BLUEPRINT_STORAGE')){toast('No Blueprint Storage slot available');return}state.blueprints.push({name,variant,slot:target});save();toast(`${name} blueprint stored`)}
function craftBlueprint(index,onDone){const blueprint=state.blueprints[index];if(!blueprint)return;const occupied=new Set(placements().placed.filter(x=>x.station==='BUILD').map(x=>x.slot)),slot=slotFillOrder('BUILD',{station:'BLUEPRINT_STORAGE',slot:Number(blueprint.slot)||0}).find(i=>!occupied.has(i));if(slot===undefined){toast('No free Build slot');return}state.blueprints.splice(index,1);const done=autoCompleteBuilds();state.owned.push({name:blueprint.name,variant:blueprint.variant,qty:1,preferred:'BUILD',preferredSlot:slot,...(done?{built:true}:{})});if(done)recordDroidex(blueprint.name,blueprint.variant);save();toast(`${blueprint.name} moved to Build${done?' and completed':' · press ✓ when it finishes building'}`);onDone?.()}
// Finishing a build unlocks the droid: it can be moved, Optimise can use it, and
// it finally counts towards the Droidex.
function completeBuild(source,unit){const p=placements(),indices=materializePlacements(p),row=state.owned[indices.get(`${source}:${unit}`)];if(!row||row.built)return;row.built=true;const logged=recordDroidex(row.name,row.variant);save();toast(`${row.name} finished building${logged?' · added to Droidex':''}`)}
function requestAdd(name,variant,qty=1,onDone){const d=state.droids.find(x=>x.name===name),p=placements();const available=capacity(d.type)-p.placed.filter(x=>x.station===d.type).length+capacity('BUILD')-p.placed.filter(x=>x.station==='BUILD').length;if(available>=qty){commitOwned(name,variant,qty);onDone?.();return}showCapacityModal({name,variant,qty,onDone})}
function showCapacityModal(pending){const root=document.querySelector('#modalRoot');const candidates=expandedOwned();root.innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><p class="eyebrow">Base capacity reached</p><h2>No compatible slots are free</h2><p><strong>${pending.name}</strong> needs a matching type slot or one of the universal Build slots.</p><div class="modal-actions"><button class="btn" id="chooseSwap">Swap a droid</button><button class="btn secondary" id="forceAdd">Force add</button><button class="btn ghost" id="cancelAdd">Cancel</button></div><div id="swapChooser"></div></section></div>`;root.querySelector('#cancelAdd').onclick=()=>root.innerHTML='';root.querySelector('#forceAdd').onclick=()=>{commitOwned(pending.name,pending.variant,pending.qty);root.innerHTML='';pending.onDone?.()};root.querySelector('#chooseSwap').onclick=()=>{root.querySelector('#swapChooser').innerHTML=`<label class="field swap-field">Choose the droid to replace<select id="swapTarget" class="form-control">${candidates.map((x,i)=>`<option value="${x.source}">${x.name} · ${x.variant}</option>`).join('')}</select></label><button class="btn" id="confirmSwap">Confirm swap</button>`;root.querySelector('#confirmSwap').onclick=()=>{const index=Number(root.querySelector('#swapTarget').value),row=state.owned[index];row.qty>1?row.qty--:state.owned.splice(index,1);commitOwned(pending.name,pending.variant,pending.qty);root.innerHTML='';pending.onDone?.()}}}
function basePage(){
  const cycles=Object.keys(state.rebirths);
  const slotCard=(type,index,p)=>{const occupant=p.placed.find(x=>x.station===type&&x.slot===index);if(occupant){const d=state.droids.find(x=>x.name===occupant.name);return `<a class="base-slot occupied" href="#/droid/${slug(d.name)}"><div>${picture(d,occupant.variant)}</div><strong>${d.name}</strong><small>${variantText(occupant.variant)} · ${fmt(d.variants[occupant.variant].income*state.multiplier)}/s</small></a>`}const rule=SLOT_RULES[type],unlock=rule.unlocks[index-rule.initial],isLocked=unlock>state.rebirth;return `<div class="base-slot ${isLocked?'locked':'open'}"><span class="slot-icon">${type==='BUILD'?'⚒':`<img src="${TYPE_IMAGES[type]}" alt="">`}</span><small>${isLocked?`Unlocks at Rebirth ${unlock}`:`${type[0]+type.slice(1).toLowerCase()} slot`}</small></div>`};
  const station=(type,p)=>{const total=SLOT_RULES[type].initial+SLOT_RULES[type].unlocks.length;const active=capacity(type);const used=p.placed.filter(x=>x.station===type).length;return `<section class="station station-${type.toLowerCase()}"><header><span>${type==='BUILD'?'⚒':`<img src="${TYPE_IMAGES[type]}" alt="">`}<strong>${type[0]+type.slice(1).toLowerCase()}</strong></span><small>${used}/${active} slots${total-active?` · ${total-active} future`:''}</small></header><div class="slot-grid">${Array.from({length:total},(_,i)=>slotCard(type,i,p)).join('')}</div></section>`};
  const render=()=>{const p=placements();const income=state.owned.reduce((sum,x)=>{const d=state.droids.find(y=>y.name===x.name);return sum+(d?.variants[x.variant]?.income||0)*x.qty},0)*state.multiplier;const future=(state.rebirths[state.cycle]||[]).filter(r=>r.to>state.rebirth).flatMap(r=>r.requiredDroids.map(req=>({...req,at:r.to})));const located=requirementLocations();const futureRows=future.map(req=>{const status=requirementStatus(req,located);return `<div class="future-item ${status.ready?'have':status.needsUpgrade?'upgrade':'missing'}"><b>Rebirth ${req.at}</b><span>${variantText(req.variant)} <a href="#/droid/${slug(req.droidName)}">${req.droidName}</a>${status.have?`<small>Best owned: ${variantText(status.have)}${status.where?` &middot; ${status.where}`:' &middot; not in your Base'}</small>`:''}</span><span>${requirementNote(status)}</span></div>`}).join('');const roster=state.owned.map((x,i)=>{const d=state.droids.find(y=>y.name===x.name);return `<div class="roster-row"><a href="#/droid/${slug(d.name)}">${picture(d,x.variant)}<span><strong>${d.name}</strong><small>${variantText(x.variant)} · ×${x.qty}</small></span></a><button class="icon-btn remove" data-i="${i}" title="Remove">×</button></div>`}).join('');
    app.innerHTML=`<div class="breadcrumbs"><a href="#/">Main page</a> / My base</div><div class="base-heading"><div><p class="eyebrow">Personal planner</p><h1>My base</h1></div><button class="btn" id="openAdd">+ Add droid</button></div><div class="base-top"><div class="stat"><small>Credits / second</small><strong>${fmt(income)}</strong></div><div class="stat"><small>Credits / minute</small><strong>${fmt(income*60)}</strong></div><div class="stat"><small>Credits / hour</small><strong>${fmt(income*3600)}</strong></div><div class="stat"><small>Droids owned</small><strong>${state.owned.reduce((s,x)=>s+x.qty,0)}</strong></div></div><section class="panel base-controls"><label class="field">Credit multiplier<input class="form-control" id="multiplier" type="number" min="0" step="0.1" value="${state.multiplier}"></label><label class="field">Super rebirth cycle<select class="form-control" id="cycle">${cycles.map(c=>`<option value="${c}" ${Number(c)===state.cycle?'selected':''}>Cycle ${Number(c)+1}</option>`).join('')}</select></label><label class="field">Current rebirth<select class="form-control" id="rebirth">${Array.from({length:maxRebirth()+1},(_,n)=>`<option ${n===state.rebirth?'selected':''}>${n}</option>`).join('')}</select></label></section><div class="base-workspace"><div class="station-board">${['WORKER','ASTROMECH','BATTLE','BUILD'].map(t=>station(t,p)).join('')}</div><aside class="roster"><header><strong>Roster</strong><span>${state.owned.reduce((s,x)=>s+x.qty,0)}</span></header>${p.overflow.length?`<div class="overflow-warning">${p.overflow.length} force-added droid${p.overflow.length>1?'s are':' is'} over capacity.</div>`:''}<div>${roster||'<p class="roster-empty">No droids yet. Add one to fill a station.</p>'}</div></aside></div><h2>Needed later in this cycle</h2><div class="notice">Green entries are already in your roster. Requirements begin after your selected current rebirth.</div><div class="future-list">${futureRows||'<div class="empty">Nothing else is required in this cycle.</div>'}</div>`;
    document.querySelector('#multiplier').onchange=e=>{state.multiplier=Number(e.target.value)||0;save();render()};document.querySelector('#cycle').onchange=e=>{state.cycle=Number(e.target.value);save();render()};document.querySelector('#rebirth').onchange=e=>{state.rebirth=Number(e.target.value);save();render()};document.querySelector('#openAdd').onclick=()=>showAddModal(render);document.querySelectorAll('.remove').forEach(b=>b.onclick=()=>{state.owned.splice(Number(b.dataset.i),1);save();render()})};render()}
function showAddModal(onDone){const root=document.querySelector('#modalRoot');root.innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><p class="eyebrow">Roster</p><h2>Add a droid</h2><div class="modal-form"><label class="field">Droid<select id="addName" class="form-control">${state.droids.map(d=>`<option>${d.name}</option>`).join('')}</select></label><label class="field" id="addVariantField">Variant<select id="addVariant" class="form-control">${VARIANTS.map(v=>`<option>${v}</option>`).join('')}</select></label><label class="field">Quantity<input id="addQty" class="form-control" type="number" min="1" value="1"></label></div><div class="modal-actions"><button class="btn" id="confirmAdd">Add to base</button><button class="btn ghost" id="cancelAdd">Cancel</button></div></section></div>`;const syncVariant=()=>{const d=state.droids.find(x=>x.name===root.querySelector('#addName').value),field=root.querySelector('#addVariantField'),select=root.querySelector('#addVariant');if(isIconic(d)){select.value='DEFAULT';field.hidden=true}else field.hidden=false};root.querySelector('#addName').onchange=syncVariant;syncVariant();root.querySelector('#cancelAdd').onclick=()=>root.innerHTML='';root.querySelector('#confirmAdd').onclick=()=>{const d=state.droids.find(x=>x.name===root.querySelector('#addName').value),data={name:root.querySelector('#addName').value,variant:isIconic(d)?'DEFAULT':root.querySelector('#addVariant').value,qty:Math.max(1,Number(root.querySelector('#addQty').value)||1)};root.innerHTML='';requestAdd(data.name,data.variant,data.qty,onDone)}}
function futureRequirements({respectGoal=true}={}){return(state.rebirths[state.cycle]||[]).filter(r=>r.to>state.rebirth&&(!respectGoal||r.to<=rebirthGoal())).flatMap(r=>r.requiredDroids.map(req=>({...req,at:r.to})))}
function bestOwnedVariant(name){let best=null;for(const row of state.owned.filter(x=>x.name===name&&!rowIsBuilding(x))){if(!best||VARIANTS.indexOf(row.variant)>VARIANTS.indexOf(best))best=row.variant}return best}
function hasRequirement(req){const have=bestOwnedVariant(req.droidName);return have&&VARIANTS.indexOf(have)>=VARIANTS.indexOf(req.variant)}
function rebirthReadiness(rebirth){const reqs=rebirth?.requiredDroids||[];return reqs.length&&reqs.every(hasRequirement)}
function fullCycleRebirthSummary({respectGoal=false}={}){const cycle=state.rebirths[state.cycle]||[],future=cycle.filter(r=>r.to>state.rebirth&&(!respectGoal||r.to<=rebirthGoal())),ready=future.filter(rebirthReadiness).map(r=>r.to),missing=future.flatMap(r=>(r.requiredDroids||[]).filter(req=>!hasRequirement(req)).map(req=>({...req,at:r.to,droid:state.droids.find(d=>d.name===req.droidName)})));const raritySet=[...new Set(missing.map(x=>x.droid?.rarity).filter(Boolean))],variantSet=[...new Set(missing.map(x=>x.variant))];return{ready,missing,rarities:raritySet,variants:variantSet}}
// What is still outstanding for one requirement: the best copy you own, what
// upgrading it costs, and where that copy is sitting. Shared so the Base's
// "Needed later" list, the Rebirth outlook and the slot cards all agree.
function requirementStatus(req,located){
  const d=state.droids.find(x=>x.name===req.droidName),have=bestOwnedVariant(req.droidName);
  const ready=hasRequirement(req),chips=have&&!ready?chipsToVariant(d,have,req.variant):0;
  // The copy you would actually upgrade is the best one you own.
  const where=(located||requirementLocations()).get(`${req.droidName}:${have}`);
  return{droid:d,have,ready,chips,needsUpgrade:Boolean(have)&&!ready,where};
}
// The best copy of each droid you own, whether it is placed or over capacity.
// The needed-list quality button acts on this card, so it has to be the same
// copy requirementStatus reports as "best owned".
function requirementUnits(p){
  const out=new Map();
  for(const unit of [...(p?.placed||[]),...(p?.overflow||[])]){
    const previous=out.get(unit.name);
    if(!previous||VARIANTS.indexOf(unit.variant)>VARIANTS.indexOf(previous.variant))out.set(unit.name,unit);
  }
  return out;
}
// One requirement card, shared by the Base "Needed later" list and the Rebirth
// page. Beyond the requirement itself it answers the three questions asked of
// it: can I add this without scrolling back up, will I need it at a higher
// quality later, and once this rebirth is done can I sell it for the slot.
function neededCardHtml(req,{located,units,rebirth,className=''}={}){
  const d=state.droids.find(x=>x.name===req.droidName);if(!d)return'';
  const at=Number(rebirth??req.at)||0,status=requirementStatus(req,located);
  const peak=requirementPeak(d.name,{after:at-1});
  const laterPeak=peak&&VARIANTS.indexOf(peak)>VARIANTS.indexOf(req.variant)?peak:null;
  const sellable=!isIconic(d)&&!d.special?.cannotSell&&at>state.rebirth&&requirementFinishesAt(d.name,at);
  const unit=units?.get(d.name);
  const stateClass=status.ready?'have':status.needsUpgrade?'upgrade':'missing';
  // A rebirth already behind you is history: there is nothing to add for it and
  // nothing it can free, so it keeps the plain card it always had.
  const done=at<=state.rebirth;
  // Owned copies get the quality button that the Base slots already use; a droid
  // you do not have yet gets the one-press add instead. The labels stay short
  // because they sit over the corner of a card whose droid name has to stay read.
  const action=done?'':unit&&!isIconic(d)
    ?`<button class="needed-action needed-variant" data-needed-variant-source="${unit.source}" data-needed-variant-name="${escapeAttr(d.name)}" data-needed-variant-current="${unit.variant}" data-needed-variant-station="${escapeAttr(unit.station||'')}" data-needed-variant-slot="${Number(unit.slot)}" title="Change the quality of your ${d.name}" aria-label="Change the quality of your ${d.name}">&#9670;</button>`
    :`<button class="needed-action needed-add" data-needed-add="${escapeAttr(d.name)}" data-needed-add-variant="${req.variant}" title="Add ${d.name} at ${variantLabel(req.variant)} to your Base" aria-label="Add ${d.name} at ${variantLabel(req.variant)} to your Base">+<span>Add</span></button>`;
  return `<article class="${['needed-card',className,stateClass,sellable?'sell-after':''].filter(Boolean).join(' ')}" data-needed-name="${d.name.toLowerCase()}"><a class="needed-card-link" href="#/droid/${slug(d.name)}"><div>${picture(d,req.variant)}</div><span><strong>${d.name}</strong><small>${variantText(req.variant)}${laterPeak?`<span class="needed-peak"> &rarr; ${variantText(laterPeak)} later</span>`:''}</small>${requirementWhere(status)}</span><b>${requirementNote(status)}</b></a>${action}${sellable?`<span class="needed-sell" title="Nothing after Rebirth ${at} needs ${d.name}, so it can be sold once this rebirth is done" aria-label="Sellable after Rebirth ${at}">$</span>`:''}</article>`;
}
// Wires the two buttons on a needed card. Called after any render that draws them.
function attachNeededCardHandlers(rerender){
  document.querySelectorAll('[data-needed-add]').forEach(button=>button.onclick=e=>{
    e.preventDefault();e.stopPropagation();
    requestAdd(button.dataset.neededAdd,button.dataset.neededAddVariant,1,rerender);
  });
  document.querySelectorAll('[data-needed-variant-source]').forEach(button=>button.onclick=e=>{
    e.preventDefault();e.stopPropagation();
    showCardVariantModal({source:Number(button.dataset.neededVariantSource),name:button.dataset.neededVariantName,variant:button.dataset.neededVariantCurrent,station:button.dataset.neededVariantStation,slot:Number(button.dataset.neededVariantSlot)},rerender);
  });
}
// Where the best owned copy of each droid is standing, keyed by name:variant.
function requirementLocations(){
  const out=new Map();
  for(const unit of placements().placed){
    const key=`${unit.name}:${unit.variant}`;
    if(!out.has(key))out.set(key,stationSlotLabel(unit.station,unit.slot));
  }
  return out;
}
const requirementNote=status=>status.ready?'&#10003; Ready':status.needsUpgrade?`Upgrade &middot; ${fmt(status.chips)} chips`:'Needed';
const requirementWhere=status=>status.have?`<em>Best owned: ${variantText(status.have)}${status.where?` &middot; ${status.where}`:' &middot; not in your Base'}</em>`:'';
// Every rebirth in this cycle that still wants a given droid, in order. Written
// once because the Base list, the Rebirth page and the sell hints all ask the
// same question: after this rebirth, is this droid finished with?
function requirementSchedule(droidName,{after=-1,through=rebirthGoal()}={}){
  return (state.rebirths[state.cycle]||[]).filter(r=>r.to>after&&r.to<=through)
    .flatMap(r=>(r.requiredDroids||[]).filter(req=>req.droidName===droidName).map(req=>({at:r.to,variant:req.variant})))
    .sort((a,b)=>a.at-b.at);
}
// The highest quality a droid is ever asked for from here on. Knowing you will
// eventually need Beskar saves upgrading to Gold now and again later.
function requirementPeak(droidName,options){
  const schedule=requirementSchedule(droidName,options);
  return schedule.reduce((best,item)=>VARIANTS.indexOf(item.variant)>VARIANTS.indexOf(best)?item.variant:best,schedule[0]?.variant||null);
}
// After this rebirth, is the droid done? Only then is it safe to sell.
function requirementFinishesAt(droidName,rebirth){
  return !requirementSchedule(droidName,{after:rebirth}).length;
}
const NOVA_ICON='assets/events/nova-crystal.png';
const novaAmount=n=>`<span class="nova-amount"><img src="${NOVA_ICON}" alt="" loading="lazy">${fmt(n)} Nova Crystals</span>`;
const rebirthReward=rebirth=>(state.novaShop?.rebirthRewards||[]).find(r=>Number(r.rebirth)===Number(rebirth))||null;
// What reaching a rebirth pays out, as chips for a group header. Nova Crystals
// and the credit multiplier always, plus a crit perk on the rebirths that carry
// one, so the Super Rebirth decision can be made without leaving the page.
function rebirthRewardHtml(rebirth){
  const reward=rebirthReward(rebirth);if(!reward)return'';
  const perks=[];
  if(reward.critChancePercent)perks.push(`+${reward.critChancePercent}% crit chance`);
  if(reward.critAmountPercent)perks.push(`+${reward.critAmountPercent}% crit amount`);
  return `<span class="rebirth-reward">${novaAmount(reward.novaCrystals)}<span class="rebirth-reward-mult">+${fmt(reward.creditMultPercent)}% credits</span>${perks.map(text=>`<span class="rebirth-reward-perk">${text}</span>`).join('')}</span>`;
}
function baseRebirthSummaryHtml(){const summary=fullCycleRebirthSummary({respectGoal:true}),cycle=state.rebirths[state.cycle]||[],goal=rebirthGoal(),nextRebirth=cycle.find(r=>r.to===state.rebirth+1&&r.to<=goal),nextReady=summary.ready.find(n=>n>state.rebirth),rarityOrder=['COMMON','RARE','EPIC','LEGENDARY','MYTHIC'],groups=new Map();for(const item of summary.missing){const rarity=item.droid?.rarity,variant=item.variant;if(!rarity||!variant)continue;const current=groups.get(rarity);if(!current||VARIANTS.indexOf(variant)<VARIANTS.indexOf(current))groups.set(rarity,variant)}const watchChips=[...groups.entries()].sort((a,b)=>rarityOrder.indexOf(a[0])-rarityOrder.indexOf(b[0])).map(([rarity,variant])=>`<span class="outlook-chip combined">${rarityText(rarity)}<span class="chip-plus">+</span> ${variantText(variant)}${variant==='GALACTIC'?'':'<span class="chip-plus">+</span>'}</span>`).join(''),cycleText=goal<maxRebirth()?`through your R: ${goal} goal`:'for the rest of this cycle',outlookPlaced=placements().placed,nextCards=nextRebirth?(nextRebirth.requiredDroids||[]).map(req=>{const d=state.droids.find(x=>x.name===req.droidName),where=droidWhereabouts(req.droidName,outlookPlaced),have=bestOwnedVariant(req.droidName),ready=have&&VARIANTS.indexOf(have)>=VARIANTS.indexOf(req.variant),needsUpgrade=have&&!ready,chips=needsUpgrade?chipsToVariant(d,have,req.variant):0,statusClass=ready?'ready':needsUpgrade?'upgrade':'missing',statusText=ready?'&#10003;':needsUpgrade?'':'!';return d?`<a class="outlook-next-card ${statusClass}" href="#/droid/${slug(d.name)}">${picture(d,req.variant)}<span><strong><span class="rarity-text ${rarityClass(d.rarity)}">${d.name}</span> <span class="outlook-dot">·</span> ${variantText(req.variant)}</strong>${needsUpgrade?`<em>${variantText(have)} <span class="outlook-arrow">→</span> ${variantText(req.variant)} <span class="outlook-dot">·</span> upgrade ${fmt(chips)} chips</em>`:''}${where?`<em class="outlook-where">${where}</em>`:''}</span>${statusText?`<b>${statusText}</b>`:''}</a>`:''}).join(''):'';return `<section class="rebirth-summary-box"><div class="rebirth-summary-copy"><p class="eyebrow">Rebirth outlook</p><strong>${nextReady?`You have all droids needed for R: ${nextReady}`:summary.missing.length?`Next goal rebirth still needs droids`:`You have every listed droid ${cycleText}`}</strong>${nextRebirth?`<div class="outlook-next"><span class="outlook-label">Next rebirth</span><div class="outlook-next-head"><b>R: ${nextRebirth.to}</b>${creditAmount(nextRebirth.creditsCost)}</div><div class="outlook-next-grid">${nextCards}</div></div>`:''}${summary.missing.length?`<div class="outlook-watch"><span class="outlook-label">Keep an eye out for</span><div class="outlook-chip-row">${watchChips||'<span class="outlook-chip muted">No extra droid checks</span>'}</div></div>`:`<span class="outlook-clean">Nothing else is missing ${cycleText}.</span>`}</div><a class="btn secondary" href="#/rebirth">View rebirths</a></section>`}
function attachOutlookVariantControls(){const locations=new Map(placements().placed.map(unit=>[`${unit.source}:${unit.unit}`,unit])),best=new Map();for(const unit of expandedOwned()){const d=state.droids.find(x=>x.name===unit.name);if(!d||isIconic(d))continue;const located=locations.get(`${unit.source}:${unit.unit}`),candidate={...unit,...(located||{})},current=best.get(unit.name),candidateRank=VARIANTS.indexOf(unit.variant),currentRank=VARIANTS.indexOf(current?.variant);if(!current||candidateRank>currentRank||candidateRank===currentRank&&located&&!current.station)best.set(unit.name,candidate)}for(const card of document.querySelectorAll('.outlook-next-card')){if(card.closest('.outlook-next-wrap'))continue;const d=state.droids.find(x=>`#/droid/${slug(x.name)}`===card.getAttribute('href')),unit=d&&best.get(d.name);if(!unit)continue;const wrap=document.createElement('div'),button=document.createElement('button');wrap.className='outlook-next-wrap';card.replaceWith(wrap);wrap.append(card);button.type='button';button.className='slot-variant outlook-variant';button.dataset.source=unit.source;button.dataset.name=d.name;button.dataset.variant=unit.variant;button.dataset.station=unit.station||'';button.dataset.slot=Number.isInteger(unit.slot)?unit.slot:'';button.title=`Change ${d.name} quality (currently ${unit.variant.toLowerCase()})`;button.setAttribute('aria-label',button.title);button.textContent='◆';wrap.append(button)}}
function requirementState(name){const req=futureRequirements().find(x=>x.droidName===name);if(!req)return null;return{...req,enough:hasRequirement(req)}}
function luckyEligible(d){return d&&!isIconic(d)&&luckyChance(d)>0}
function luckyOwnedUnits(){const p=placements(),placed=new Map(p.placed.map(x=>[`${x.source}:${x.unit}`,x]));return expandedOwned().map(unit=>{const d=state.droids.find(x=>x.name===unit.name);return{...unit,droid:d,placement:placed.get(`${unit.source}:${unit.unit}`)}}).filter(x=>luckyEligible(x.droid)&&VARIANTS.indexOf(x.variant)<VARIANTS.indexOf('BESKAR'))}
function luckyCreditGain(unit,target='BESKAR'){const d=unit.droid,baseNow=d.variants[unit.variant]?.income||0,baseTarget=d.variants[target]?.income||0,p=placements(),productive=p.placed.filter(x=>PRODUCTIVE_STATIONS.includes(x.station)),iconicRate=[...new Set(productive.map(x=>x.name))].reduce((sum,name)=>sum+iconicIncome(state.droids.find(d=>d.name===name)),0),placement=unit.placement,station=placement&&PRODUCTIVE_STATIONS.includes(placement.station)?placement.station:d.type,output=(station===d.type?1.1:1)+iconicRate;return Math.max(0,(baseTarget-baseNow)*output*effectiveMultiplier())}
function luckyRecommendations(mode='rebirth'){const reqs=futureRequirements(),bestByName=new Map();for(const unit of luckyOwnedUnits()){const previous=bestByName.get(unit.name);if(!previous||VARIANTS.indexOf(unit.variant)>VARIANTS.indexOf(previous.variant))bestByName.set(unit.name,unit)}return[...bestByName.values()].map(unit=>{const d=unit.droid,chance=luckyChance(d),target=nextVariant(unit.variant);if(!target)return null;const needed=reqs.filter(r=>r.droidName===d.name&&VARIANTS.indexOf(r.variant)>VARIANTS.indexOf(unit.variant)),chips=chipsToVariant(d,unit.variant,target),expectedChips=chips*chance,gain=luckyCreditGain(unit,target),expectedGain=gain*chance;if(mode==='rebirth'){if(!needed.length)return null;const bestNeed=needed.reduce((best,r)=>VARIANTS.indexOf(r.variant)>VARIANTS.indexOf(best.variant)?r:best,needed[0]),nextAt=Math.min(...needed.map(r=>r.at)),urgency=1/Math.max(1,nextAt-state.rebirth),score=expectedChips*(1+urgency*4);return{mode,unit,droid:d,target,neededTarget:bestNeed.variant,score,chance,chips,expectedChips,gain,expectedGain,nextAt,rebirths:[...new Set(needed.map(r=>r.at))],reason:`Needed at rebirth ${nextAt} as ${variantText(bestNeed.variant)}. Lucky only upgrades one step, so a ${luckyChanceLabel(d)} success moves it from ${variantText(unit.variant)} to ${variantText(target)} and saves ${fmt(chips)} chips (${fmt(expectedChips)} expected chips per attempt).`}}const score=expectedGain;return{mode,unit,droid:d,target,neededTarget:null,score,chance,chips,expectedChips,gain,expectedGain,nextAt:null,rebirths:reqs.filter(r=>r.droidName===d.name).map(r=>r.at),reason:`A Lucky success upgrades one step from ${variantText(unit.variant)} to ${variantText(target)}, adding about ${fmt(gain)}/s or ${fmt(gain*3600)}/h. At ${luckyChanceLabel(d)}, that is ${fmt(expectedGain*3600)}/h expected value per attempt.`}}).filter(Boolean).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,5)}
function luckyDroidPage(){let mode='rebirth',selected=0;const render=()=>{const list=luckyRecommendations(mode),pick=list[selected]||list[0];app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / Lucky Droid Recommendation</div><section class="lucky-hero"><p class="eyebrow">Daily gamble helper</p><h1>Lucky Droid Recommendation</h1><p class="lead">Every 24 hours you can gamble one Lucky Droid quality step: Default → Gold → Diamond → Rainbow → Beskar. Success chance depends on rarity: ${rarityText('COMMON')} 32%, ${rarityText('RARE')} 16%, ${rarityText('EPIC')} 8%, ${rarityText('LEGENDARY')} 4%, ${rarityText('MYTHIC')} 2%.</p><div class="variant-tabs lucky-tabs"><button data-lucky-mode="rebirth" class="${mode==='rebirth'?'active':''}">Rebirth based</button><button data-lucky-mode="credit" class="${mode==='credit'?'active':''}">Credit based</button></div></section>${list.length?`<div class="lucky-layout"><div class="lucky-list">${list.map((item,i)=>`<button class="lucky-card ${i===selected?'active':''}" data-lucky-pick="${i}"><span class="lucky-rank">${i+1}</span><div class="lucky-thumb">${picture(item.droid,item.unit.variant)}</div><div class="lucky-card-copy"><strong>${item.droid.name}</strong><div class="lucky-card-meta"><small class="lucky-step">${variantText(item.unit.variant)} <span class="variant-arrow">→</span> ${variantText(item.target)}</small><em><span>${mode==='rebirth'?'Expected chips':'Expected gain'}</span><b>${mode==='rebirth'?fmt(item.expectedChips):`+${fmt(item.expectedGain*3600)}/h`}</b><i>${luckyChanceLabel(item.droid)} chance</i></em></div></div></button>`).join('')}</div><article class="lucky-detail"><div class="article-grid"><article><p class="eyebrow">${mode==='rebirth'?'Rebirth priority':'Credit priority'}</p><h2>${pick.droid.name}</h2><p class="lead">${pick.reason}</p><table><tbody><tr><th>Current</th><td>${variantText(pick.unit.variant)}</td></tr><tr><th>Lucky target</th><td>${variantText(pick.target)}</td></tr>${pick.neededTarget?`<tr><th>Later needed as</th><td>${variantText(pick.neededTarget)}</td></tr>`:''}<tr><th>Success chance</th><td>${luckyChanceLabel(pick.droid)} per daily attempt</td></tr><tr><th>Upgrade chips saved</th><td>${fmt(pick.chips)} on success · ${fmt(pick.expectedChips)} expected</td></tr><tr><th>Credit gain</th><td>+${fmt(pick.gain)}/s · +${fmt(pick.gain*3600)}/h on success · +${fmt(pick.expectedGain*3600)}/h expected</td></tr>${pick.rebirths.length?`<tr><th>Future rebirth use</th><td>R: ${[...new Set(pick.rebirths)].join(', ')}</td></tr>`:''}</tbody></table><h3>Why this is good</h3><p>${mode==='rebirth'?`This mode favours the best expected one-step upgrade for upcoming rebirth requirements, with earlier rebirths weighted higher.`:`This mode favours the largest expected production gain from the next quality step after applying the rarity success chance.`}</p></article><aside class="infobox"><div class="info-title">${pick.droid.name}</div><div class="info-image">${picture(pick.droid,pick.target)}</div><div class="info-rows"><div class="info-row"><b>Type</b><span>${pick.droid.type}</span></div><div class="info-row"><b>Rarity</b><span>${rarityText(pick.droid.rarity)}</span></div><div class="info-row"><b>Chance</b><span>${luckyChanceLabel(pick.droid)}</span></div><div class="info-row"><b>From</b><span>${variantText(pick.unit.variant)}</span></div><div class="info-row"><b>To</b><span>${variantText(pick.target)}</span></div></div></aside></div></article></div>`:`<div class="empty">No eligible Lucky Droid recommendations yet. Add owned Common, Rare, Epic, Legendary, or Mythic droids below Beskar quality to your Base.</div>`}`;document.querySelectorAll('[data-lucky-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.luckyMode;selected=0;render()});document.querySelectorAll('[data-lucky-pick]').forEach(b=>b.onclick=()=>{selected=Number(b.dataset.luckyPick);render()})};render()}
function luckyRecommendationPool(mode='rebirth'){
  const reqs=futureRequirements(),bestByName=new Map(),items=[];
  for(const unit of luckyOwnedUnits()){const previous=bestByName.get(unit.name);if(!previous||VARIANTS.indexOf(unit.variant)>VARIANTS.indexOf(previous.variant))bestByName.set(unit.name,unit)}
  for(const unit of bestByName.values()){
    const d=unit.droid,target=nextVariant(unit.variant);if(!target)continue;
    const chance=luckyChance(d),needed=reqs.filter(r=>r.droidName===d.name&&VARIANTS.indexOf(r.variant)>VARIANTS.indexOf(unit.variant)),chips=chipsToVariant(d,unit.variant,target),expectedChips=chips*chance,gain=luckyCreditGain(unit,target),expectedGain=gain*chance;
    if(mode==='rebirth'&&!needed.length)continue;
    const bestNeed=needed.length?needed.reduce((best,r)=>VARIANTS.indexOf(r.variant)>VARIANTS.indexOf(best.variant)?r:best,needed[0]):null,nextAt=needed.length?Math.min(...needed.map(r=>r.at)):null,urgency=nextAt?1/Math.max(1,nextAt-state.rebirth):0,score=mode==='rebirth'?expectedChips*(1+urgency*4):expectedGain;
    items.push({mode,unit,droid:d,target,neededTarget:bestNeed?.variant||null,score,chance,chips,expectedChips,gain,expectedGain,nextAt,rebirths:[...new Set(needed.map(r=>r.at))],practicality:mode==='rebirth'?'upgrade':'owned',reason:mode==='rebirth'?`You already own ${d.name} as ${variantText(unit.variant)}. It is needed at rebirth ${nextAt} as ${variantText(bestNeed.variant)}; a Lucky success advances it one quality step and saves ${fmt(chips)} chips.`:`You already own this droid. A Lucky success advances it from ${variantText(unit.variant)} to ${variantText(target)}, adding about ${fmt(gain)}/s.`});
  }
  for(const d of state.droids){
    if(bestByName.has(d.name)||!luckyEligible(d)||!d.variants?.DEFAULT||!d.variants?.GOLD)continue;
    const needed=reqs.filter(r=>r.droidName===d.name);if(mode==='rebirth'&&!needed.length)continue;
    const unit={name:d.name,variant:'DEFAULT',droid:d,placement:null},target='GOLD',chance=luckyChance(d),chips=chipsToVariant(d,'DEFAULT',target),expectedChips=chips*chance,gain=luckyCreditGain(unit,target),expectedGain=gain*chance,nextAt=needed.length?Math.min(...needed.map(r=>r.at)):null,urgency=nextAt?1/Math.max(1,nextAt-state.rebirth):0;
    items.push({mode,unit,droid:d,target,neededTarget:needed[0]?.variant||null,score:mode==='rebirth'?expectedChips*(1+urgency*4):expectedGain,chance,chips,expectedChips,gain,expectedGain,nextAt,rebirths:[...new Set(needed.map(r=>r.at))],practicality:'missing',reason:`You do not currently own ${d.name}. It cannot be selected for Lucky until you find one randomly through quests, missions, or the conveyor.`});
  }
  return items.filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
}
function luckyDroidPageV2(){
  let savedFilters=['owned','upgrade','missing'];
  try{const parsed=JSON.parse(localStorage.getItem('droid-archive-lucky-practicality')||'null');if(Array.isArray(parsed)&&parsed.length)savedFilters=parsed}catch{}
  let mode='rebirth',selected=0;
  let filters=new Set(savedFilters);
  const labels={owned:'Already owned',upgrade:'Needs upgrading',missing:'Missing'};
  const render=()=>{
    const list=luckyRecommendationPool(mode).filter(x=>filters.has(x.practicality)).slice(0,5);if(selected>=list.length)selected=0;const pick=list[selected]||list[0];
    app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / Lucky Droid Recommendation</div><section class="lucky-hero"><p class="eyebrow">Daily gamble helper</p><h1>Lucky Droid Recommendation</h1><p class="lead">Every 24 hours you can gamble one owned Lucky Droid by one quality step. Droids are found randomly through quests, missions, and the conveyor; missing entries are scouting targets, not droids you can purchase directly.</p><div class="variant-tabs lucky-tabs"><button data-lucky-mode="rebirth" class="${mode==='rebirth'?'active':''}">Rebirth based</button><button data-lucky-mode="credit" class="${mode==='credit'?'active':''}">Credit based</button></div><div class="lucky-practicality" aria-label="Practicality filters">${Object.entries(labels).map(([key,label])=>`<label class="${filters.has(key)?'active':''}"><input type="checkbox" data-lucky-practicality="${key}" ${filters.has(key)?'checked':''}><span>${label}</span></label>`).join('')}</div></section>${list.length?`<div class="lucky-layout"><div class="lucky-list">${list.map((item,i)=>`<button class="lucky-card ${i===selected?'active':''} practicality-${item.practicality}" data-lucky-pick="${i}"><span class="lucky-rank">${i+1}</span><div class="lucky-thumb">${picture(item.droid,item.unit.variant)}</div><div class="lucky-card-copy"><strong>${item.droid.name}</strong><span class="lucky-practicality-badge">${labels[item.practicality]}</span><div class="lucky-card-meta"><small class="lucky-step">${variantText(item.unit.variant)} <span class="variant-arrow">→</span> ${variantText(item.target)}</small><em><span>${mode==='rebirth'?'Expected chips':'Expected gain'}</span><b>${mode==='rebirth'?fmt(item.expectedChips):`+${fmt(item.expectedGain*3600)}/h`}</b><i>${luckyChanceLabel(item.droid)} chance</i></em></div></div></button>`).join('')}</div><article class="lucky-detail"><div class="article-grid"><article><p class="eyebrow">${labels[pick.practicality]} · ${mode==='rebirth'?'Rebirth priority':'Credit priority'}</p><h2>${pick.droid.name}</h2><p class="lead">${pick.reason}</p><table><tbody><tr><th>Current</th><td>${pick.practicality==='missing'?'Not owned':variantText(pick.unit.variant)}</td></tr><tr><th>Lucky target</th><td>${pick.practicality==='missing'?'Find one first':variantText(pick.target)}</td></tr>${pick.neededTarget?`<tr><th>Later needed as</th><td>${variantText(pick.neededTarget)}</td></tr>`:''}<tr><th>Success chance</th><td>${luckyChanceLabel(pick.droid)} per daily attempt</td></tr><tr><th>Upgrade-chip value</th><td>${fmt(pick.chips)} on success · ${fmt(pick.expectedChips)} expected</td></tr><tr><th>Credit gain</th><td>+${fmt(pick.gain)}/s · +${fmt(pick.expectedGain*3600)}/h expected</td></tr>${pick.rebirths.length?`<tr><th>Future rebirth use</th><td>R: ${pick.rebirths.join(', ')}</td></tr>`:''}</tbody></table>${pick.practicality==='missing'?'<div class="notice lucky-random-note">Find this droid randomly before attempting a Lucky upgrade.</div>':''}</article><aside class="infobox"><div class="info-title">${pick.droid.name}</div><div class="info-image">${picture(pick.droid,pick.target)}</div><div class="info-rows"><div class="info-row"><b>Status</b><span>${labels[pick.practicality]}</span></div><div class="info-row"><b>Type</b><span>${pick.droid.type}</span></div><div class="info-row"><b>Rarity</b><span>${rarityText(pick.droid.rarity)}</span></div><div class="info-row"><b>Chance</b><span>${luckyChanceLabel(pick.droid)}</span></div></div></aside></div></article></div>`:'<div class="empty">No recommendations match these practicality filters.</div>'}`;
    document.querySelectorAll('[data-lucky-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.luckyMode;selected=0;render()});
    document.querySelectorAll('[data-lucky-pick]').forEach(b=>b.onclick=()=>{selected=Number(b.dataset.luckyPick);render()});
    document.querySelectorAll('[data-lucky-practicality]').forEach(input=>input.onchange=()=>{input.checked?filters.add(input.dataset.luckyPracticality):filters.delete(input.dataset.luckyPracticality);if(!filters.size){filters.add(input.dataset.luckyPracticality);input.checked=true}localStorage.setItem('droid-archive-lucky-practicality',JSON.stringify([...filters]));selected=0;render()});
  };
  render();
}
function removeOwnedUnit(index){const row=state.owned[index];if(!row)return;row.qty>1?row.qty--:state.owned.splice(index,1);save()}
function changeOwnedUnitVariant(source,variant,station,slot){const row=state.owned[source];if(!row||row.variant===variant)return;const from=row.variant;if(row.qty>1){const changed={...row,variant,qty:1,preferred:station,preferredSlot:slot};row.qty--;if(row.preferred===station&&Number(row.preferredSlot)===slot){delete row.preferred;delete row.preferredSlot}state.owned.push(changed)}else{row.variant=variant;row.preferred=station;row.preferredSlot=slot}
  // Still-building droids stay out of the Droidex until they are finished.
  const added=station==='BUILD'&&!row.built&&!autoCompleteBuilds()?0:recordDroidexUpgrade(row.name,from,variant);
  save();if(added)toast(`${added} new Droidex ${added===1?'entry':'entries'} from upgrading ${row.name}`)}
function showCardVariantModal(card,onDone){const root=document.querySelector('#modalRoot'),d=state.droids.find(x=>x.name===card.name);if(!d||isIconic(d))return;root.innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><p class="eyebrow">Change quality</p><h2>${d.name}</h2><p class="picker-hint">Choose any quality. You can upgrade or downgrade this exact card without removing it from its slot.</p><div class="variant-choice">${VARIANTS.map(v=>`<button data-card-variant="${v}" ${v===card.variant?'disabled':''}>${picture(d,v)}<strong>${variantText(v)}</strong><small>${v===card.variant?'Current quality':variantIncomeText(d,v)}</small></button>`).join('')}</div><button class="btn ghost" id="cancelVariantChange">Cancel</button></section></div>`;root.querySelectorAll('[data-card-variant]').forEach(button=>button.onclick=()=>{changeOwnedUnitVariant(card.source,button.dataset.cardVariant,card.station,card.slot);root.innerHTML='';onDone()});root.querySelector('#cancelVariantChange').onclick=()=>root.innerHTML=''}
function showSwapModal(card,onDone){const root=document.querySelector('#modalRoot'),p=placements(),source=p.placed.find(x=>x.source===card.source&&x.unit===card.unit),occupiedKey=(station,slot)=>`${station}:${slot}`,occupied=new Set(p.placed.map(x=>occupiedKey(x.station,x.slot))),items=p.placed.filter(x=>!(x.source===card.source&&x.unit===card.unit)).map(x=>({...x,targetType:'occupied'})),emptySlots=Object.keys(SLOT_RULES).filter(station=>station!=='BUILD').flatMap(station=>stationSlotIndices(station).filter(slot=>!occupied.has(occupiedKey(station,slot))).map(slot=>({targetType:'empty',station,slot,name:`Empty ${station} ${slot+1}`,variant:'DEFAULT'})));if(!source)return;root.innerHTML=`<div class="modal-backdrop"><section class="modal slot-picker" role="dialog" aria-modal="true"><p class="eyebrow">Manual swap</p><h2>Move ${source.name}</h2><p class="picker-hint">Choose another droid to swap with, or an empty unlocked non-Build slot to move into. Build slots must be swapped with an existing Build droid.</p><input id="swapSearch" class="form-control picker-search" placeholder="Search droids or slots…" autofocus><div id="swapResults" class="picker-results"></div><button class="btn ghost" id="cancelSwap">Cancel</button></section></div>`;const draw=()=>{const q=root.querySelector('#swapSearch').value.toLowerCase(),targets=[...items,...emptySlots].filter(x=>x.name.toLowerCase().includes(q)||x.station.toLowerCase().includes(q)||String(x.slot+1).includes(q));root.querySelector('#swapResults').innerHTML=targets.map(x=>{if(x.targetType==='empty')return `<button class="picker-droid empty-slot-choice" data-empty-station="${x.station}" data-empty-slot="${x.slot}"><span class="slot-icon">${stationIcon(x.station)}</span><b>${x.name}</b><small>Move into empty slot</small></button>`;const d=state.droids.find(y=>y.name===x.name);return `<button class="picker-droid" data-swap-key="${x.source}:${x.unit}"><span>${picture(d,x.variant)}</span><b>${x.name}</b><small>${variantText(x.variant)} · ${x.station} ${x.slot+1}</small></button>`}).join('')||'<p class="roster-empty">No matching droids or empty slots.</p>';root.querySelectorAll('[data-swap-key]').forEach(b=>b.onclick=()=>{moveUnitByKey(`${source.source}:${source.unit}`,b.dataset.swapKey,onDone);root.innerHTML=''});root.querySelectorAll('[data-empty-station]').forEach(b=>b.onclick=()=>{moveUnitToSlot(`${source.source}:${source.unit}`,b.dataset.emptyStation,Number(b.dataset.emptySlot),onDone);root.innerHTML=''})};root.querySelector('#swapSearch').oninput=draw;root.querySelector('#cancelSwap').onclick=()=>root.innerHTML='';draw()}
function showSuperRebirthConfirm(rerender,really=false){const root=document.querySelector('#modalRoot'),question=really?'Are you really sure you want to super rebirth?':'Are you sure you want to super rebirth?';root.innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="superRebirthTitle"><p class="eyebrow">Destructive action</p><h2 id="superRebirthTitle">${question}</h2><p>This will remove every droid from your base and reset its progression. This cannot be undone unless you exported your base first.</p><div class="modal-actions"><button class="btn danger" id="confirmSuperRebirth">Yes, super rebirth</button><button class="btn ghost" id="cancelSuperRebirth">Cancel</button></div></section></div>`;root.querySelector('#cancelSuperRebirth').onclick=()=>root.innerHTML='';root.querySelector('#confirmSuperRebirth').onclick=()=>{if(!really){showSuperRebirthConfirm(rerender,true);return}state.owned=[];state.multiplier=1;state.rebirth=0;state.purchasedSlots=[];state.loungePurchased=0;state.novaLevel=0;const cycleCount=Object.keys(state.rebirths).length;state.cycle=cycleCount?(state.cycle+1)%cycleCount:0;save();root.innerHTML='';toast(`Super rebirth complete · Cycle ${state.cycle+1}`);rerender()}}
function cloudDocFromCurrent(name='Main'){const id=cloudId();return{app:'Droid Archives',version:1,updatedAt:new Date().toISOString(),activeProfileId:id,ui:{theme:state.theme},profiles:[{id,name,updatedAt:new Date().toISOString(),data:profileDataFromState()}]}}
function normalizeCloudDoc(doc){doc=normalizeProfileDoc(doc);doc.ui=doc.ui||{};return doc}
function cloudDocFromLocalProfiles(){updateActiveLocalProfile();const local=ensureLocalDoc();return normalizeCloudDoc({...local,ui:{theme:state.theme}})}
const supabaseReady=()=>Boolean(supabaseConfig.url&&supabaseConfig.anonKey&&window.supabase);
const supabaseTable=()=>supabaseConfig.table||'droid_archive_profiles';
const authRedirectUrl=()=>PUBLIC_SITE_URL;
function rowToCloudDoc(row){if(!Array.isArray(row?.profiles)||!row.profiles.length)throw Error('Cloud profile data is empty. Sync has been stopped to protect your profiles.');const doc=normalizeCloudDoc({app:'Droid Archives',version:1,updatedAt:row.updated_at,activeProfileId:row.active_profile_id,ui:row.ui||{},profiles:row.profiles});doc._revision=Math.max(1,Number(row.revision)||1);return doc}
function cloudDocToRow(revision=state.cloud.doc?._revision){return{user_id:state.cloud.user.id,email:state.cloud.user.email||'',profiles:state.cloud.doc.profiles,active_profile_id:state.cloud.doc.activeProfileId,ui:{theme:state.theme},revision,updated_at:new Date().toISOString()}}
async function loadSupabaseConfig(){try{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3500);const response=await fetch(`${SUPABASE_CONFIG_PATH}?${Date.now()}`,{signal:controller.signal});clearTimeout(timer);if(response.ok){const config=await response.json();supabaseConfig={...supabaseConfig,url:config.url||'',anonKey:config.anonKey||config.anon_key||'',table:config.table||supabaseConfig.table}}}catch{}}
async function initSupabase(){if(!supabaseReady()){state.cloud.enabled=false;state.cloud.reconnecting=false;state.cloud.status='Local save';saveLocal();return}supabaseClient=window.supabase.createClient(supabaseConfig.url,supabaseConfig.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});supabaseClient.auth.onAuthStateChange((event,session)=>{state.cloud.session=session;state.cloud.user=session?.user||null;if(event==='PASSWORD_RECOVERY')showPasswordUpdateModal();if(!session){state.cloud.doc=null;state.cloud.reconnecting=false;state.cloud.status='SIGNED OUT — changes save locally only';renderCloudHeader();renderBaseSidebar(()=>route());return}if(!['INITIAL_SESSION','SIGNED_IN','PASSWORD_RECOVERY'].includes(event))return;loadSupabaseProfiles(true,{initializeIfMissing:state.cloud.initializingNewAccount}).then(()=>{state.cloud.initializingNewAccount=false}).catch(e=>{state.cloud.status=e.message;renderCloudHeader()})});if(state.cloud.enabled){state.cloud.reconnecting=true;state.cloud.status='Restoring Supabase session…';renderCloudHeader();const {data}=await supabaseClient.auth.getSession();state.cloud.session=data.session;state.cloud.user=data.session?.user||null;if(state.cloud.user)await loadSupabaseProfiles(true);else{state.cloud.reconnecting=false;state.cloud.status='SIGNED OUT — sign in to sync';saveLocal()}}}
async function initSupabaseSafe(){try{await Promise.race([initSupabase(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Cloud save restore timed out')),5000))])}catch(e){state.cloud.reconnecting=false;state.cloud.status='Cloud save delayed — local mode';saveLocal();renderCloudHeader()}}
async function loadSupabaseProfiles(apply=true,{initializeIfMissing=false}={}){if(!supabaseClient||!state.cloud.user)return;if(state.cloud.loadPromise)return state.cloud.loadPromise;state.cloud.loadPromise=(async()=>{state.cloud.reconnecting=false;state.cloud.status='Loading cloud profiles…';renderCloudHeader();const {data,error}=await supabaseClient.from(supabaseTable()).select('user_id,email,profiles,active_profile_id,ui,revision,updated_at').eq('user_id',state.cloud.user.id).maybeSingle();if(error)throw Error(error.message);if(!data){if(!initializeIfMissing)throw Error('No cloud save was found. Nothing was uploaded; contact support before creating a replacement.');state.cloud.doc=cloudDocFromLocalProfiles();state.cloud.doc._revision=1;state.cloud.activeProfileId=state.cloud.doc.activeProfileId;const {error:insertError}=await supabaseClient.from(supabaseTable()).insert(cloudDocToRow(1));if(insertError)throw Error(insertError.message)}else state.cloud.doc=rowToCloudDoc(data);state.cloud.activeProfileId=state.cloud.doc.activeProfileId;state.cloud.loadedProfileCount=state.cloud.doc.profiles.length;state.cloud.allowProfileCountDecrease=false;if(apply&&!state.sharedView){const profile=activeCloudProfile();if(!profile)throw Error('The active cloud profile is missing. Sync has been stopped.');applyProfileData(profile.data)}if(state.cloud.doc.ui?.theme){state.theme=state.cloud.doc.ui.theme;applyTheme()}state.cloud.enabled=true;state.cloud.reconnecting=false;state.cloud.status='Synced';cacheCloudDocLocally();saveLocal();subscribeCloudChanges();await loadGroupWorkspace().catch(()=>{});route();renderCloudHeader()})();try{return await state.cloud.loadPromise}finally{state.cloud.loadPromise=null}}
// ---- Live sync between every tab signed in to the account ------------------
//
// The site in a browser and the site inside the companion are two separate
// Chromium profiles with their own localStorage, so the only thing they share
// is the account's row in Supabase. Each writes there already; what was missing
// was either of them learning that the other had.
//
// The row carries a revision that every write increments, which makes this
// simple: a notification whose revision is no higher than the one already held
// is this tab's own write coming back, and anything higher is somebody else's.
function unsubscribeCloudChanges(){
  if(!state.cloud.channel)return;
  try{supabaseClient?.removeChannel(state.cloud.channel)}catch{}
  state.cloud.channel=null;
}
function subscribeCloudChanges(){
  if(!supabaseClient||!state.cloud.user||state.cloud.channel)return;
  const userId=state.cloud.user.id;
  state.cloud.channel=supabaseClient
    .channel(`droid-archive-profiles:${userId}`)
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:supabaseTable(),filter:`user_id=eq.${userId}`},
        payload=>{cloudDocChangedElsewhere(Number(payload?.new?.revision)||0)})
    .subscribe();
}
async function cloudDocChangedElsewhere(revision){
  if(!cloudConnected())return;
  if(revision<=(Number(state.cloud.doc._revision)||0))return;   // our own write echoing back
  // Never pull over the top of an edit that has not been written yet: the
  // debounced save is still holding it, and reloading would discard it.
  if(state.cloud.syncing||cloudSaveTimer)return;
  try{
    await loadSupabaseProfiles(true);
    route();
    toast('Updated from another device');
  }catch(e){state.cloud.status=e.message;renderCloudHeader()}
}
async function writeSupabaseDoc(){if(!supabaseClient||!state.cloud.user||!state.cloud.doc)throw Error('Supabase is not connected');const profiles=state.cloud.doc.profiles;if(!Array.isArray(profiles)||!profiles.length)throw Error('Cloud save blocked: a profile document cannot be empty.');if(state.cloud.loadedProfileCount&&profiles.length<state.cloud.loadedProfileCount&&!state.cloud.allowProfileCountDecrease)throw Error('Cloud save blocked because profiles disappeared unexpectedly. Reload before syncing.');const expectedRevision=Math.max(1,Number(state.cloud.doc._revision)||1),nextRevision=expectedRevision+1;state.cloud.doc.updatedAt=new Date().toISOString();state.cloud.doc.activeProfileId=state.cloud.activeProfileId;state.cloud.doc.ui={theme:state.theme};const {data,error}=await supabaseClient.from(supabaseTable()).update(cloudDocToRow(nextRevision)).eq('user_id',state.cloud.user.id).eq('revision',expectedRevision).select('revision,updated_at').maybeSingle();if(error)throw Error(error.message);if(!data)throw Error('Cloud save conflict: this account changed in another tab or device. Your data was not overwritten; reload before syncing.');state.cloud.doc._revision=Number(data.revision)||nextRevision;state.cloud.loadedProfileCount=profiles.length;state.cloud.allowProfileCountDecrease=false;cacheCloudDocLocally();saveLocal()}
async function cloudSaveNow(){if(state.sharedView)return state.sharedView.canEdit?saveSharedProfileNow():undefined;if(!cloudConnected())return;state.cloud.syncing=true;state.cloud.status='Syncing…';renderBaseSidebar(()=>route());renderCloudHeader();try{updateActiveCloudProfile();await writeSupabaseDoc();state.cloud.status='Synced';toast(`${activeProfile()?.name||'Profile'} changes synced`)}catch(e){state.cloud.status=e.message;throw e}finally{state.cloud.syncing=false;renderBaseSidebar(()=>route());renderCloudHeader()}}
const GROUP_OUTLOOK_KEY='droid-archive-group-outlook-profiles';
const groupProfileKey=(_groupId,ownerId,profileId)=>`${ownerId}:${profileId}`;
const defaultGroupDisplayName=()=>String(state.cloud.user?.email||'Player').split('@')[0].slice(0,40)||'Player';
const groupOutlookStorageKey=()=>`${GROUP_OUTLOOK_KEY}:${state.cloud.user?.id||'local'}`;
function groupOutlookSelection(){try{const raw=localStorage.getItem(groupOutlookStorageKey());return raw===null?null:new Set(JSON.parse(raw))}catch{return null}}
function setGroupOutlookProfile(groupId,ownerId,profileId,selected){const available=state.groups.workspace.flatMap(group=>groupAvailableProfiles(group).map(profile=>groupProfileKey(group.id,profile.ownerId,profile.profileId))),selection=groupOutlookSelection()||new Set(available),key=groupProfileKey(groupId,ownerId,profileId);selected?selection.add(key):selection.delete(key);localStorage.setItem(groupOutlookStorageKey(),JSON.stringify([...selection]))}
function groupAvailableProfiles(group){const ownId=state.cloud.user?.id||'',shared=Array.isArray(group?.profiles)?group.profiles:[],own=(state.cloud.doc?.profiles||[]).map(profile=>{const share=shared.find(item=>item.ownerId===ownId&&item.profileId===profile.id);return{ownerId:ownId,ownerName:'You',profileId:profile.id,profileName:profile.name,updatedAt:profile.updatedAt,canEdit:true,isOwn:true,shared:Boolean(share),shareCanEdit:Boolean(share?.canEdit),data:profile.data}}),others=shared.filter(profile=>profile.ownerId!==ownId).map(profile=>({...profile,isOwn:false,shared:true,shareCanEdit:Boolean(profile.canEdit)}));return[...own,...others]}
function availableGroupOutlookProfiles(){const profiles=new Map();for(const group of state.groups.workspace)for(const profile of groupAvailableProfiles(group)){const key=groupProfileKey(group.id,profile.ownerId,profile.profileId),existing=profiles.get(key);if(existing){existing.groupNames.push(group.name);continue}profiles.set(key,{...profile,key,groupId:group.id,groupNames:[group.name]})}return[...profiles.values()]}
function selectedGroupProfiles(){const selection=groupOutlookSelection(),seen=new Set(),profiles=[];for(const group of state.groups.workspace)for(const profile of groupAvailableProfiles(group)){const key=groupProfileKey(group.id,profile.ownerId,profile.profileId),identity=`${profile.ownerId}:${profile.profileId}`;if((selection===null||selection.has(key))&&!seen.has(identity)){seen.add(identity);profiles.push({...profile,groupId:group.id,groupName:group.name})}}return profiles}
async function loadGroupWorkspace({rerender=false,force=false}={}){if(!cloudConnected()){state.groups={workspace:[],loading:false,loaded:false,error:'',loadPromise:null};return[]}if(state.groups.loading){const current=await(state.groups.loadPromise||Promise.resolve(state.groups.workspace));if(!force)return current}state.groups.loading=true;state.groups.error='';if(rerender&&location.hash.startsWith('#/groups'))groupsPage();state.groups.loadPromise=(async()=>{const {data,error}=await supabaseClient.rpc('droid_archive_group_workspace');if(error)throw Error(error.message);state.groups.workspace=Array.isArray(data)?data:[];state.groups.loaded=true;return state.groups.workspace})();try{return await state.groups.loadPromise}catch(error){state.groups.workspace=[];state.groups.loaded=true;state.groups.error=error.message.includes('Could not find the function')?'The group database update has not been installed yet. Run the latest data/supabase-schema.sql in Supabase.':error.message;throw error}finally{state.groups.loading=false;state.groups.loadPromise=null;if(rerender&&location.hash.startsWith('#/groups'))groupsPage()}}
async function createArchiveGroup(name,displayName){const {error}=await supabaseClient.rpc('create_droid_archive_group',{group_name:name,member_display_name:displayName});if(error)throw Error(error.message);await loadGroupWorkspace({force:true})}
async function joinArchiveGroup(code,displayName){const {error}=await supabaseClient.rpc('join_droid_archive_group',{supplied_invite_code:code,member_display_name:displayName});if(error)throw Error(error.message);await loadGroupWorkspace({force:true})}
async function setArchiveProfileShare(groupId,profileId,shared,canEdit){clearTimeout(cloudSaveTimer);await cloudSaveNow();const {error}=await supabaseClient.rpc('set_droid_archive_profile_share',{target_group_id:groupId,target_profile_id:profileId,should_share:shared,allow_edit:canEdit});if(error)throw Error(error.message);await loadGroupWorkspace({force:true})}
async function leaveArchiveGroup(groupId){const {error}=await supabaseClient.rpc('leave_droid_archive_group',{target_group_id:groupId});if(error)throw Error(error.message);await loadGroupWorkspace({force:true})}
async function removeArchiveGroupMember(groupId,userId){const {error}=await supabaseClient.rpc('remove_droid_archive_group_member',{target_group_id:groupId,target_user_id:userId});if(error)throw Error(error.message);await loadGroupWorkspace({force:true})}
async function reviewArchiveGroupMember(groupId,userId,approved){const {error}=await supabaseClient.rpc('review_droid_archive_group_member',{target_group_id:groupId,target_user_id:userId,approve_member:approved});if(error)throw Error(error.message);await loadGroupWorkspace({force:true})}
async function deleteArchiveGroup(groupId){const {error}=await supabaseClient.from('droid_archive_groups').delete().eq('id',groupId);if(error)throw Error(error.message);await loadGroupWorkspace({force:true})}
function profileBestOwnedVariant(data,name){let best=null;for(const row of (data?.owned||[]).filter(item=>item.name===name&&!rowIsBuilding(item)))if(!best||VARIANTS.indexOf(row.variant)>VARIANTS.indexOf(best))best=row.variant;return best}
function profileRequirementReady(data,cycleIndex,rebirth,req){const tracker=normalizeRebirthTracker(data?.rebirthTracker);if(tracker.notUsingBase){const entry=tracker.entries[`${cycleIndex}:${rebirth}:${req.droidName}:${req.variant}`]||{},selected=VARIANTS.includes(entry.variant)?entry.variant:null;return Boolean(entry.complete||(selected&&VARIANTS.indexOf(selected)>=VARIANTS.indexOf(req.variant)))}const have=profileBestOwnedVariant(data,req.droidName);return Boolean(have&&VARIANTS.indexOf(have)>=VARIANTS.indexOf(req.variant))}
function groupProfileOutlookModel(profile){const data=profile.data||{},cycleIndex=Number(data.cycle)||0,cycle=state.rebirths[cycleIndex]||[],current=Math.max(0,Number(data.rebirth)||0),goal=Math.max(12,Math.min(cycle.at(-1)?.to||30,Number(data.superRebirthGoal)||cycle.at(-1)?.to||30)),future=cycle.filter(rebirth=>rebirth.to>current&&rebirth.to<=goal),ready=future.filter(rebirth=>(rebirth.requiredDroids||[]).length&&(rebirth.requiredDroids||[]).every(req=>profileRequirementReady(data,cycleIndex,rebirth.to,req))).map(rebirth=>rebirth.to),missing=future.flatMap(rebirth=>(rebirth.requiredDroids||[]).filter(req=>!profileRequirementReady(data,cycleIndex,rebirth.to,req)).map(req=>({...req,at:rebirth.to}))),next=future[0]||null;return{cycleIndex,current,goal,ready,missing,next}}
function groupOutlookCardsHtml(){const profiles=selectedGroupProfiles();if(!profiles.length)return'<div class="empty">Choose at least one profile to build a combined outlook.</div>';return`<div class="group-outlook-grid">${profiles.map(profile=>{const model=groupProfileOutlookModel(profile),requirements=model.next?.requiredDroids||[],readyCount=requirements.filter(req=>profileRequirementReady(profile.data,model.cycleIndex,model.next.to,req)).length;return`<article class="group-outlook-card"><header><span><small>${escapeAttr(profile.ownerName)} · ${escapeAttr(profile.groupName)}</small><strong>${escapeAttr(profile.profileName)}</strong></span><button class="btn secondary" data-group-view="${profile.groupId}|${profile.ownerId}|${escapeAttr(profile.profileId)}">View</button></header><div class="group-outlook-stats"><span>Cycle <b>${model.cycleIndex+1}</b></span><span>Current <b>R ${model.current}</b></span><span>Goal <b>R ${model.goal}</b></span></div>${model.next?`<div class="group-outlook-next"><strong>Next: R ${model.next.to}</strong><span>${readyCount}/${requirements.length} droids ready</span><div>${requirements.map(req=>`<em class="${profileRequirementReady(profile.data,model.cycleIndex,model.next.to,req)?'ready':'missing'}">${escapeAttr(req.droidName)} · ${variantText(req.variant)}</em>`).join('')}</div></div>`:'<p class="outlook-clean">No rebirths remain within this profile’s goal.</p>'}<footer>${model.ready.length?`Ready now: R ${model.ready.join(', R ')}`:'No future rebirth is fully ready'} · ${model.missing.length} missing requirement${model.missing.length===1?'':'s'}</footer></article>`}).join('')}</div>`}
// ---- Rebirth need-hints: which profiles to check ---------------------------
// null means every profile, which is the useful default: a new profile starts
// being checked without anyone having to opt it in.
// Your own profiles plus any shared with you through a group. groupAvailableProfiles
// lists your own back to you as well, so those are skipped here rather than
// counted twice under two different keys.
function rebirthNeedProfiles(){
  const out=[],seen=new Set();
  const add=(key,name,data,owner)=>{if(!data||seen.has(key))return;seen.add(key);out.push({key,name,data,owner})};
  for(const profile of activeProfileDoc()?.profiles||[])add(`own:${profile.id}`,profile.name||'Profile',profile.data,'');
  for(const profile of availableGroupOutlookProfiles())if(!profile.isOwn)add(`grp:${profile.ownerId}:${profile.profileId}`,profile.profileName||'Profile',profile.data,profile.ownerName||'');
  return out;
}
// The companion passes its own selection in. It cannot use the one this page
// keeps: a browser and the companion's embedded view are separate Chromium
// profiles, so a choice made in one was never visible to the other — which
// meant the picker on Base never actually applied to the companion at all.
// An absent or empty list means every profile.
function chosenNeedProfiles(keys){
  if(!Array.isArray(keys)||!keys.length)return rebirthNeedProfiles();
  const wanted=new Set(keys);
  return rebirthNeedProfiles().filter(profile=>wanted.has(profile.key));
}
// Stand state in for another profile's save just long enough to ask a question
// of it. Everything the requirement test reads is swapped and put back, so the
// loaded profile is untouched even if the body throws.
function withProfileData(data,fn){
  const saved={owned:state.owned,cycle:state.cycle,rebirth:state.rebirth,droidex:state.droidex,superRebirthGoal:state.superRebirthGoal};
  try{
    state.owned=normalizeDroidRows(data?.owned||[]);
    state.droidex=normalizeDroidRows(data?.droidex||[]);
    state.cycle=Number(data?.cycle)||0;
    state.rebirth=Number(data?.rebirth)||0;
    // Each profile stops recommending at its own goal, so the goal is part of
    // the save being read, not of whichever profile is open in the tab.
    state.superRebirthGoal=data?.superRebirthGoal;
    return fn();
  }finally{state.owned=saved.owned;state.cycle=saved.cycle;state.rebirth=saved.rebirth;state.droidex=saved.droidex;state.superRebirthGoal=saved.superRebirthGoal}
}
// The companion holds the selection now; this only has to say what exists.
window.__companionRebirthNeedProfiles=()=>rebirthNeedProfiles().map(profile=>({key:profile.key,name:profile.name,owner:profile.owner}));

function showBaseGroupProfilePicker(){const root=document.querySelector('#modalRoot'),available=availableGroupOutlookProfiles(),stored=groupOutlookSelection(),picked=new Set(stored===null?available.map(profile=>profile.key):stored);const draw=()=>{root.innerHTML=`<div class="modal-backdrop"><section class="modal group-profile-picker" role="dialog" aria-modal="true"><p class="eyebrow">Group Rebirth Outlook</p><h2>Choose profiles</h2><p class="picker-hint">Choose exactly what appears on your Base page. This selection is private to your signed-in account on this browser and does not change what anyone else sees.</p><div class="group-profile-picker-actions"><button class="btn secondary" id="groupProfilesAll" type="button">Select all</button><button class="btn secondary" id="groupProfilesNone" type="button">Select none</button></div><div class="group-profile-picker-list">${available.map(profile=>`<label><input type="checkbox" data-base-group-profile="${escapeAttr(profile.key)}" ${picked.has(profile.key)?'checked':''}><span><strong>${escapeAttr(profile.profileName)}</strong><small>${escapeAttr(profile.ownerName)} · ${escapeAttr(profile.groupNames.join(', '))}</small></span></label>`).join('')||'<div class="empty">No connected profiles are available.</div>'}</div><div class="modal-actions"><button class="btn" id="applyGroupProfiles" type="button">Apply to Base</button><button class="btn ghost" id="cancelGroupProfiles" type="button">Cancel</button></div></section></div>`;root.querySelectorAll('[data-base-group-profile]').forEach(input=>input.onchange=()=>input.checked?picked.add(input.dataset.baseGroupProfile):picked.delete(input.dataset.baseGroupProfile));root.querySelector('#groupProfilesAll').onclick=()=>{available.forEach(profile=>picked.add(profile.key));draw()};root.querySelector('#groupProfilesNone').onclick=()=>{picked.clear();draw()};root.querySelector('#applyGroupProfiles').onclick=()=>{localStorage.setItem(groupOutlookStorageKey(),JSON.stringify([...picked]));root.innerHTML='';basePageV2()};root.querySelector('#cancelGroupProfiles').onclick=()=>root.innerHTML=''};draw()}
function combinedGroupOutlookHtml(){if(!cloudConnected()||!state.groups.workspace.length)return'';return`<section class="group-outlook-panel"><header><div><p class="eyebrow">Connected accounts</p><h2>Group Rebirth Outlook</h2><p>Selected profiles from your groups, together on one page.</p></div><button class="btn secondary" id="chooseBaseGroupProfiles" type="button">Choose profiles</button></header>${groupOutlookCardsHtml()}</section>`}
async function refreshConnectedGroupOutlooks(){const path=location.hash.slice(1).split('?')[0]||'/';if(!cloudConnected()||state.sharedView||!['/base','/groups'].includes(path)||document.hidden)return;try{await loadGroupWorkspace();document.querySelectorAll('.group-outlook-panel').forEach(panel=>{const current=panel.querySelector(':scope > .group-outlook-grid, :scope > .empty'),next=groupOutlookCardsHtml();if(current)current.outerHTML=next;else panel.insertAdjacentHTML('beforeend',next)})}catch{}}
setInterval(refreshConnectedGroupOutlooks,30000);
const personalBaseRebirthSummaryHtml=baseRebirthSummaryHtml;
baseRebirthSummaryHtml=()=>`${personalBaseRebirthSummaryHtml()}${combinedGroupOutlookHtml()}${fusionOutlookHtml()}`;
let sharedProfileSaveTimer=null;
function scheduleSharedProfileSave(){clearTimeout(sharedProfileSaveTimer);sharedProfileSaveTimer=setTimeout(()=>saveSharedProfileNow().catch(error=>{toast(error.message);decorateSharedView()}),900)}
async function saveSharedProfileNow(){const view=state.sharedView;if(!view||!view.canEdit)return;clearTimeout(sharedProfileSaveTimer);if(view.saving)return view.savePromise.then(()=>state.sharedView===view?saveSharedProfileNow():undefined);view.saving=true;decorateSharedView();const profileData=profileDataFromState(),savedVersion=view.changeVersion||0;view.savePromise=(async()=>{const {data,error}=await supabaseClient.rpc('save_shared_droid_archive_profile',{target_group_id:view.groupId,target_owner_id:view.ownerId,target_profile_id:view.profileId,profile_data:profileData,expected_updated_at:view.profile.updatedAt||null});if(error)throw Error(error.message);view.profile.data=profileData;view.profile.updatedAt=data.updatedAt;view.savedVersion=savedVersion;const workspaceProfile=state.groups.workspace.find(group=>group.id===view.groupId)?.profiles?.find(profile=>profile.ownerId===view.ownerId&&profile.profileId===view.profileId);if(workspaceProfile){workspaceProfile.data=cloneProfileData(profileData);workspaceProfile.updatedAt=data.updatedAt}})();try{await view.savePromise}finally{view.saving=false;view.savePromise=null;decorateSharedView()}}
async function openGroupProfile(groupId,ownerId,profileId){if(!cloudConnected())return showAuthModal('signin');const group=state.groups.workspace.find(item=>item.id===groupId);if(!group)throw Error('That group is no longer available.');const profile=groupAvailableProfiles(group).find(item=>String(item.ownerId)===String(ownerId)&&String(item.profileId)===String(profileId));if(!profile)throw Error('That shared profile is no longer available.');if(String(profile.ownerId)===String(state.cloud.user.id)){switchCloudProfile(profile.profileId);location.hash='#/base';return}if(state.sharedView)await exitSharedProfile(false);clearTimeout(cloudSaveTimer);updateActiveCloudProfile();cacheCloudDocLocally();saveLocal();const view={groupId,groupName:group.name,ownerId:profile.ownerId,ownerName:profile.ownerName,profileId:profile.profileId,profileName:profile.profileName,profile:{...profile,data:cloneProfileData(profile.data)},canEdit:Boolean(profile.canEdit),saving:false,savePromise:null,changeVersion:0,savedVersion:0};state.sharedView=view;applyProfileData(view.profile.data);if(location.hash==='#/base')route();else location.hash='#/base';toast(`Viewing ${view.ownerName} · ${view.profileName}`)}
async function exitSharedProfile(goToGroups=true){if(!state.sharedView)return;let saveError=null;if(state.sharedView.canEdit)try{await saveSharedProfileNow()}catch(error){saveError=error}state.sharedView=null;const own=activeCloudProfile();if(own)applyProfileData(own.data);cacheCloudDocLocally();saveLocal();scheduleCloudSave();if(saveError)toast(`Shared changes were not saved: ${saveError.message}`);if(goToGroups){location.hash='#/groups';route()}}
function decorateSharedView(){const view=state.sharedView;if(!view)return;let banner=app.querySelector('.shared-profile-banner');if(!banner){app.insertAdjacentHTML('afterbegin',`<section class="shared-profile-banner ${view.canEdit?'editable':'readonly'}"><div><small>${view.canEdit?'Shared editing enabled':'Read-only shared profile'}</small><strong>${escapeAttr(view.ownerName)} · ${escapeAttr(view.profileName)}</strong><span>${view.canEdit?'Changes sync to the owner’s profile.':'The owner has not allowed changes.'}</span></div><button class="btn secondary" data-shared-exit>Return to my profiles</button></section>`);banner=app.querySelector('.shared-profile-banner')}const status=banner.querySelector('small'),statusText=view.saving?'Saving shared profile…':view.canEdit?'Shared editing enabled':'Read-only shared profile';if(status&&status.textContent!==statusText)status.textContent=statusText;banner.querySelector('[data-shared-exit]').onclick=()=>exitSharedProfile().catch(error=>toast(error.message));if(!view.canEdit){app.querySelectorAll('button:not([data-shared-exit]),input,select,textarea').forEach(control=>control.disabled=true);document.querySelectorAll('#baseSidebarControls input,#baseSidebarControls select:not(#cloudProfileSelect),#baseSidebarControls button:not([data-shared-exit])').forEach(control=>control.disabled=true)}}
function connectCloud(){showAuthModal('signin')}
async function signOutCloud(){if(state.sharedView)await exitSharedProfile(false);if(supabaseClient)await supabaseClient.auth.signOut();state.cloud.session=null;state.cloud.user=null;state.cloud.doc=null;state.groups={workspace:[],loading:false,loaded:false,error:'',loadPromise:null};state.sharedView=null;state.cloud.enabled=false;state.cloud.reconnecting=false;state.cloud.status='Local save';localStorage.setItem('droid-archive-sync-provider','local');toast('Signed out');route();renderCloudHeader()}
function showAuthModal(mode='signin'){const root=document.querySelector('#modalRoot');if(!supabaseReady()){root.innerHTML=`<div class="modal-backdrop"><section class="modal"><p class="eyebrow">Supabase setup</p><h2>Cloud save is not configured</h2><p>Add your Supabase URL and anon key to <code>data/supabase-config.json</code>, then refresh.</p><button class="btn ghost" id="closeAuth">Close</button></section></div>`;root.querySelector('#closeAuth').onclick=()=>root.innerHTML='';return}const isSignUp=mode==='signup',isReset=mode==='reset';root.innerHTML=`<div class="modal-backdrop"><section class="modal auth-modal"><p class="eyebrow">Supabase cloud save</p><h2>${isSignUp?'Create account':isReset?'Reset password':'Sign in'}</h2><p class="picker-hint">${isReset?'Enter your email and Supabase will send a password reset link.':'Your Droid Archives profiles sync to one row in Supabase.'}</p><label class="field">Email<input id="authEmail" class="form-control" type="email" autocomplete="email"></label>${isReset?'':`<label class="field">Password<input id="authPassword" class="form-control" type="password" autocomplete="${isSignUp?'new-password':'current-password'}"></label>`}<div class="modal-actions"><button class="btn" id="authSubmit">${isSignUp?'Create account':isReset?'Send reset email':'Sign in'}</button><button class="btn ghost" id="authCancel">Cancel</button></div><div class="auth-links">${isSignUp?'<button id="authSignin">Already have an account?</button>':'<button id="authSignup">Create account</button>'}${isReset?'':'<button id="authReset">Forgot password?</button>'}</div><p class="form-error" id="authError"></p></section></div>`;const error=root.querySelector('#authError'),submit=root.querySelector('#authSubmit');root.querySelector('#authCancel').onclick=()=>root.innerHTML='';root.querySelector('#authSignin')?.addEventListener('click',()=>showAuthModal('signin'));root.querySelector('#authSignup')?.addEventListener('click',()=>showAuthModal('signup'));root.querySelector('#authReset')?.addEventListener('click',()=>showAuthModal('reset'));submit.onclick=async()=>{try{submit.disabled=true;submit.textContent=isSignUp?'Creating…':isReset?'Sending…':'Signing in…';error.textContent='';const email=root.querySelector('#authEmail').value.trim(),password=root.querySelector('#authPassword')?.value||'';if(!email)throw Error('Email is required');state.cloud.status=isReset?'Sending reset…':'Signing in…';renderCloudHeader();if(isReset){const {error:e}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:authRedirectUrl()});if(e)throw e;toast('Password reset email sent');root.innerHTML='';return}state.cloud.initializingNewAccount=isSignUp;const result=isSignUp?await supabaseClient.auth.signUp({email,password,options:{emailRedirectTo:authRedirectUrl()}}):await supabaseClient.auth.signInWithPassword({email,password});if(result.error)throw result.error;state.cloud.session=result.data.session;state.cloud.user=result.data.user;if(!state.cloud.session&&isSignUp){toast('Account created. Check your email to confirm it.');root.innerHTML='';return}await loadSupabaseProfiles(true,{initializeIfMissing:isSignUp});state.cloud.initializingNewAccount=false;root.innerHTML='';toast(isSignUp?'Account ready':'Signed in')}catch(e){state.cloud.initializingNewAccount=false;error.textContent=e.message;state.cloud.status=e.message;renderCloudHeader();submit.disabled=false;submit.textContent=isSignUp?'Create account':isReset?'Send reset email':'Sign in'}}}
function showPasswordUpdateModal(){const root=document.querySelector('#modalRoot');root.innerHTML=`<div class="modal-backdrop"><section class="modal auth-modal"><p class="eyebrow">Password reset</p><h2>Choose a new password</h2><label class="field">New password<input id="newPassword" class="form-control" type="password" autocomplete="new-password"></label><div class="modal-actions"><button class="btn" id="saveNewPassword">Update password</button><button class="btn ghost" id="cancelNewPassword">Cancel</button></div><p class="form-error" id="passwordError"></p></section></div>`;root.querySelector('#cancelNewPassword').onclick=()=>root.innerHTML='';root.querySelector('#saveNewPassword').onclick=async()=>{const password=root.querySelector('#newPassword').value,error=root.querySelector('#passwordError');try{if(password.length<6)throw Error('Use at least 6 characters');const {error:e}=await supabaseClient.auth.updateUser({password});if(e)throw e;root.innerHTML='';toast('Password updated')}catch(e){error.textContent=e.message}}}
async function waitForGoogle(){for(let i=0;i<40;i++){if(window.google?.accounts?.oauth2)return;if(i===0&&!document.querySelector('script[src*="accounts.google.com/gsi/client"]')){const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;document.head.appendChild(s)}await new Promise(r=>setTimeout(r,125))}throw Error('Google sign-in did not load.')}
async function cloudAuth(promptMode,timeoutMs=12000){await waitForGoogle();return new Promise((resolve,reject)=>{let settled=false;let timer;const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);fn(value)};state.cloud.tokenClient ||= google.accounts.oauth2.initTokenClient({client_id:GOOGLE_CLIENT_ID,scope:DRIVE_SCOPE,include_granted_scopes:true,callback:res=>{if(res.error){finish(reject,Error(res.error));return}state.cloud.token=res.access_token;state.cloud.tokenExpiresAt=Date.now()+((Number(res.expires_in)||3600)-60)*1000;finish(resolve,res.access_token)}});timer=setTimeout(()=>finish(reject,Error('Google Drive import could not connect')),timeoutMs);state.cloud.tokenClient.requestAccessToken({prompt:promptMode??'consent'})})}
async function driveFetch(path,options={}){const response=await fetch(`https://www.googleapis.com/drive/v3/${path}`,{...options,headers:{Authorization:`Bearer ${state.cloud.token}`,...(options.headers||{})}});if(!response.ok)throw Error(`Google Drive import failed (${response.status})`);return response}
async function findCloudFile(){const q=encodeURIComponent(`name='${CLOUD_FILE_NAME}' and 'appDataFolder' in parents and trashed=false`),response=await driveFetch(`files?spaces=appDataFolder&fields=files(id,name,modifiedTime)&q=${q}`),data=await response.json();return data.files?.[0]||null}
function multipartBody(metadata,json){const boundary='droid-archives-boundary';return{boundary,body:`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(json,null,2)}\r\n--${boundary}--`}}
async function readCloudDoc(fileId){const response=await driveFetch(`files/${fileId}?alt=media`);return normalizeCloudDoc(await response.json())}
async function importGoogleDriveProfiles(){try{if(!cloudConnected()){toast('Sign in with Supabase first');return}state.cloud.status='Importing Google Drive profiles…';renderCloudHeader();await cloudAuth('consent',30000);const file=await findCloudFile();if(!file){toast('No Google Drive save found');return}const imported=await readCloudDoc(file.id),current=state.cloud.doc,seen=new Set(current.profiles.map(p=>p.id));imported.profiles.forEach((profile,index)=>{const id=seen.has(profile.id)?cloudId():profile.id;seen.add(id);current.profiles.push({...profile,id,name:`Google: ${profile.name||`Profile ${index+1}`}`})});if(imported.profiles.length&&!current.activeProfileId)current.activeProfileId=current.profiles[0].id;await cloudSaveNow();toast(`Imported ${imported.profiles.length} Google profile${imported.profiles.length===1?'':'s'}`)}catch(e){state.cloud.status=e.message;renderCloudHeader();toast(e.message)}}
function addCloudProfile(){const doc=activeProfileDoc(),root=document.querySelector('#modalRoot');root.innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><p class="eyebrow">Profile setup</p><h2>Create new profile</h2><p class="picker-hint">Copy your current Base/settings, or start fresh. Droidex always starts empty for a new profile.</p><label class="field">Profile name<input id="newProfileName" class="form-control" value="New profile"></label><p class="form-error" id="newProfileError"></p><div class="modal-actions"><button class="btn" id="copyProfile">Copy Base/settings</button><button class="btn secondary" id="blankProfile">Start blank profile</button><button class="btn ghost" id="cancelProfile">Cancel</button></div></section></div>`;const nameInput=root.querySelector('#newProfileName'),error=root.querySelector('#newProfileError'),create=mode=>{const name=nameInput.value.trim();if(!name){error.textContent='Profile name is required';return}if(cloudConnected())updateActiveCloudProfile();else updateActiveLocalProfile();const id=cloudId(),data=mode==='copy'?cloneProfileBaseOnly(profileDataFromState()):blankProfileData();doc.profiles.push({id,name,updatedAt:new Date().toISOString(),data});state.cloud.activeProfileId=id;doc.activeProfileId=id;applyProfileData(data);save();root.innerHTML='';route();toast(`Profile created: ${name}`)};root.querySelector('#copyProfile').onclick=()=>create('copy');root.querySelector('#blankProfile').onclick=()=>create('blank');root.querySelector('#cancelProfile').onclick=()=>root.innerHTML='';nameInput.focus();nameInput.select()}
function renameCloudProfile(){const profile=activeProfile();if(!profile)return;const name=prompt('Rename profile:',profile.name)?.trim();if(!name)return;profile.name=name;save();route();toast('Profile renamed')}
function deleteCloudProfile(){const doc=activeProfileDoc(),profile=activeProfile();if(!profile)return;if(doc.profiles.length<=1){toast('You need at least one profile');return}if(!confirm(`Delete profile "${profile.name}"? A recoverable cloud history snapshot will be retained.`))return;doc.profiles=doc.profiles.filter(p=>p.id!==profile.id);if(cloudConnected())state.cloud.allowProfileCountDecrease=true;state.cloud.activeProfileId=doc.profiles[0].id;doc.activeProfileId=state.cloud.activeProfileId;applyProfileData(activeProfile().data);save();route();toast('Profile deleted')}
function switchCloudProfile(id){if(state.sharedView){exitSharedProfile(false).then(()=>switchCloudProfile(id)).catch(error=>toast(error.message));return}const doc=activeProfileDoc();if(!doc||id===state.cloud.activeProfileId)return;if(cloudConnected())updateActiveCloudProfile();else updateActiveLocalProfile();state.cloud.activeProfileId=id;doc.activeProfileId=id;applyProfileData(activeProfile().data);save();route();toast(`Switched to ${activeProfile()?.name||'profile'}`)}
// Group profiles rendered as <optgroup>s under your own, so switching to one is
// the same gesture as switching to your own. Values are prefixed so the change
// handler can tell the two apart.
const GROUP_PROFILE_PREFIX='group:';
function groupProfileOptions(){
  if(!cloudConnected()||!state.groups.workspace.length)return'';
  return state.groups.workspace.map(group=>{
    const rows=groupAvailableProfiles(group).filter(item=>!item.isOwn);
    if(!rows.length)return'';
    const options=rows.map(item=>{
      const value=`${GROUP_PROFILE_PREFIX}${group.id}:${item.ownerId}:${item.profileId}`;
      const current=state.sharedView&&state.sharedView.profileId===item.profileId&&String(state.sharedView.ownerId)===String(item.ownerId);
      return `<option value="${escapeAttr(value)}" ${current?'selected':''}>${escapeAttr(item.ownerName)} · ${escapeAttr(item.profileName)}${item.canEdit?'':' (read only)'}</option>`;
    }).join('');
    return `<optgroup label="${escapeAttr(group.name||'Group')}">${options}</optgroup>`;
  }).join('');
}
// The profile picker. Both panels use it, so a group profile is reachable from
// inside another one and not only from your own profiles: openGroupProfile and
// switchCloudProfile each bow out of the shared view they find before opening the
// next, so hopping straight across works without a trip through Groups.
//   While a shared profile is open, none of your own options is marked selected.
// groupProfileOptions marks the open one instead, and two selected options would
// leave the control showing your last profile while somebody else's base is on
// screen.
function profileSelectHtml(){
  const doc=activeProfileDoc(),profiles=doc?.profiles||[],shared=Boolean(state.sharedView);
  const mine=profiles.map(p=>`<option value="${p.id}" ${!shared&&p.id===state.cloud.activeProfileId?'selected':''}>${p.name}</option>`).join('');
  const theirs=groupProfileOptions();
  return `<label class="side-field">Profile<select id="cloudProfileSelect">${theirs?`<optgroup label="Your profiles">${mine}</optgroup>${theirs}`:mine}</select></label>`;
}
function cloudSidebarHtml(){if(state.sharedView){const view=state.sharedView;return`<div class="cloud-panel shared-cloud-panel"><p class="side-title">Shared profile</p><strong>${escapeAttr(view.ownerName)} · ${escapeAttr(view.profileName)}</strong><small class="cloud-status">${view.saving?'Saving…':view.canEdit?'Editing allowed':'Read only'}</small>${profileSelectHtml()}<div class="cloud-actions"><button class="btn secondary" data-shared-exit>Return to my profiles</button>${view.canEdit?'<button class="btn secondary" id="cloudSyncNow">Save shared profile</button>':''}</div><div class="side-rule"></div></div>`}const connected=cloudConnected(),doc=activeProfileDoc(),profiles=doc?.profiles||[],active=activeProfile(),needsLogin=state.cloud.enabled&&!connected&&!state.cloud.reconnecting,reconnecting=state.cloud.enabled&&!connected&&state.cloud.reconnecting,setup=!supabaseReady();return `<div class="cloud-panel ${needsLogin||setup?'cloud-needs-login':''} ${reconnecting?'cloud-reconnecting':''}"><p class="side-title">${connected?'Cloud save':'Profiles'}</p>${profileSelectHtml()}<small class="cloud-status">${setup?'Supabase setup needed':connected?state.cloud.status:reconnecting?'Restoring Supabase session…':needsLogin?'SIGNED OUT — changes save locally only':'Local profiles'}${active?` · ${active.name}`:''}</small>${setup?'<div class="cloud-warning">Add data/supabase-config.json to enable account sync.</div>':needsLogin?'<div class="cloud-warning">You are signed out. Local changes will not sync until you sign in.</div>':''}<div class="cloud-actions">${connected?'<button class="btn secondary" id="cloudSyncNow">Sync now</button><button class="btn secondary" id="cloudImportGoogle">Import Google Drive profiles</button>':reconnecting?'<button class="btn secondary" disabled>Restoring…</button>':'<button class="btn secondary cloud-connect" id="cloudConnect">Sign in</button><button class="btn secondary" id="cloudCreateAccount">Create account</button><button class="btn secondary" id="cloudResetPassword">Reset password</button>'}<button class="btn secondary" id="cloudNewProfile">New profile</button><button class="btn secondary" id="cloudRenameProfile">Rename</button><button class="btn danger" id="cloudDeleteProfile">Delete</button>${connected?'<button class="btn ghost" id="cloudSignOut">Sign out</button>':''}</div><div class="side-rule"></div></div>`}
function attachCloudSidebarHandlers(root=document){root.querySelector('#cloudConnect')?.addEventListener('click',()=>showAuthModal('signin'));root.querySelector('#cloudCreateAccount')?.addEventListener('click',()=>showAuthModal('signup'));root.querySelector('#cloudResetPassword')?.addEventListener('click',()=>showAuthModal('reset'));root.querySelector('#cloudSyncNow')?.addEventListener('click',()=>cloudSaveNow().catch(e=>toast(e.message)));root.querySelector('#cloudImportGoogle')?.addEventListener('click',importGoogleDriveProfiles);root.querySelector('#cloudNewProfile')?.addEventListener('click',addCloudProfile);root.querySelector('#cloudRenameProfile')?.addEventListener('click',renameCloudProfile);root.querySelector('#cloudDeleteProfile')?.addEventListener('click',deleteCloudProfile);root.querySelector('#cloudSignOut')?.addEventListener('click',signOutCloud);root.querySelector('#cloudProfileSelect')?.addEventListener('change',async e=>{
    const value=e.target.value;
    if(!value.startsWith(GROUP_PROFILE_PREFIX))return switchCloudProfile(value);
    // group:<groupId>:<ownerId>:<profileId> — ids can contain colons, so split
    // off the first two and keep the remainder whole.
    const rest=value.slice(GROUP_PROFILE_PREFIX.length),cut=rest.indexOf(':'),groupId=rest.slice(0,cut);
    const after=rest.slice(cut+1),cut2=after.indexOf(':');
    try{await openGroupProfile(groupId,after.slice(0,cut2),after.slice(cut2+1))}
    catch(error){toast(error.message);route()}
  });root.querySelector('[data-shared-exit]')?.addEventListener('click',()=>exitSharedProfile().catch(error=>toast(error.message)))}
function renderCloudHeader(){const host=document.querySelector('#headerCloud');if(!host)return;const connected=cloudConnected(),doc=activeProfileDoc(),profiles=doc?.profiles||[],active=activeProfile(),needsLogin=state.cloud.enabled&&!connected&&!state.cloud.reconnecting,reconnecting=state.cloud.enabled&&!connected&&state.cloud.reconnecting,setup=!supabaseReady(),profileLabel=state.sharedView?state.sharedView.profileName:connected?active?.name||'Profile':'Account',menuLabel=state.sharedView?`Shared profile: ${profileLabel}`:connected?`Profiles: ${profileLabel}`:'Account and profiles';host.innerHTML=`<button class="cloud-menu-button ${connected?'connected':''} ${needsLogin||setup?'needs-login':''} ${reconnecting?'reconnecting':''}" id="cloudMenuButton" aria-label="${escapeAttr(menuLabel)}" aria-expanded="false" title="${setup?'Supabase setup needed':connected?`Active profile: ${escapeAttr(profileLabel)}`:reconnecting?'Restoring Supabase session':needsLogin?'Signed out':'Sign in or manage local profiles'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0H5Z"/></svg><strong>${escapeAttr(profileLabel)}</strong>${needsLogin||setup?'<i aria-hidden="true">!</i>':''}</button><div class="cloud-dropdown ${needsLogin||setup?'cloud-needs-login':''} ${reconnecting?'cloud-reconnecting':''}" id="cloudDropdown" hidden>${cloudSidebarHtml().replace('<div class="side-rule"></div>','')}</div>`;const button=host.querySelector('#cloudMenuButton'),dropdown=host.querySelector('#cloudDropdown');button.onclick=e=>{e.stopPropagation();document.querySelector('.sidebar').classList.remove('mobile-open');dropdown.hidden=!dropdown.hidden;button.setAttribute('aria-expanded',String(!dropdown.hidden))};dropdown.onclick=e=>e.stopPropagation();attachCloudSidebarHandlers(host);publishCompanionState()}
// Picking preferred companions from a grid of portraits rather than a listbox,
// so it reads like the rest of the Base.
function showPreferredCompanionPicker(onDone){
  const root=document.querySelector('#modalRoot'),render=()=>{
    const chosen=preferredCompanions(),slots=companionSlotCount(),full=preferredCompanionsFull();
    root.innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><p class="eyebrow">Companion slot</p><h2>Preferred companions</h2><p class="picker-hint">These take a Companion slot ahead of any boost. Optimise will tell you to buy any you do not own.</p><p class="picker-hint companion-count">${chosen.length} of ${slots} slot${slots===1?'':'s'} spoken for${full?' · remove one to swap':''}</p><div class="companion-choice">${iconicDroids().map(d=>{const owned=state.owned.some(x=>x.name===d.name),on=chosen.includes(d.name);return `<button data-pick-companion="${d.name}" class="${on?'picked':''}" ${!on&&full?'disabled':''}>${picture(d,'DEFAULT')}<strong>${d.name}</strong><small>${on?'Preferred':owned?'Owned':'Not owned yet'}</small></button>`}).join('')}</div><button class="btn ghost" id="closeCompanionPicker">Done</button></section></div>`;
    root.querySelectorAll('[data-pick-companion]').forEach(button=>button.onclick=()=>{
      const name=button.dataset.pickCompanion,list=preferredCompanions();
      if(!list.includes(name)&&preferredCompanionsFull())return;
      state.preferredCompanions=list.includes(name)?list.filter(x=>x!==name):[...list,name];
      save();render();onDone?.();
    });
    root.querySelector('#closeCompanionPicker').onclick=()=>{root.innerHTML='';onDone?.()};
  };
  render();
}
const optimiseSettingsOpen=()=>localStorage.getItem('droid-archive-optimise-settings-open')==='1';
const optimiseSettingsSummary=()=>{const boosts=companionGoals().length,preferred=preferredCompanions().length;return `${boosts} boost${boosts===1?'':'s'}${preferred?` · ${preferred} preferred`:''}`};
function renderBaseSidebar(rerender){const host=document.querySelector('#baseSidebarControls');host.innerHTML=`${cloudSidebarHtml()}<p class="side-title">Base settings</p><label class="side-field">Base multiplier<input id="sideMultiplier" type="number" min="0" step="0.1" value="${state.multiplier}"><small class="flawless-bonus">${flawlessCount()} flawless tracked · ${effectiveMultiplier().toFixed(2)}× total</small></label><label class="side-field">Super rebirth<select id="sideCycle">${Object.keys(state.rebirths).map(c=>`<option value="${c}" ${Number(c)===state.cycle?'selected':''}>Cycle ${Number(c)+1}</option>`).join('')}</select></label><label class="side-field">Current rebirth<select id="sideRebirth">${Array.from({length:maxRebirth()+1},(_,n)=>`<option ${n===state.rebirth?'selected':''}>${n}</option>`).join('')}</select></label><label class="side-field">Super rebirth goal<select id="sideRebirthGoal">${Array.from({length:Math.max(0,maxRebirth()-11)},(_,i)=>i+12).map(n=>`<option value="${n}" ${n===rebirthGoal()?'selected':''}>Rebirth ${n}</option>`).join('')}</select><small class="flawless-bonus">Base recommendations stop after this rebirth.</small></label><details class="side-group" ${optimiseSettingsOpen()?'open':''}><summary>Advanced settings<em>${optimiseSettingsSummary()}</em></summary><div class="side-group-body"><div class="side-field side-pillfield">Companion boosts<div class="side-pills">${COMPANION_GOALS.map(g=>`<label class="side-pill"><input type="checkbox" data-companion-goal="${g.id}" ${companionGoals().includes(g.id)?'checked':''}><span>${g.short}</span></label>`).join('')}</div><small class="flawless-bonus">A Companion slot is stocked for each boost picked.</small></div><div class="side-field">Preferred companions<div class="side-companions">${preferredCompanions().map(name=>{const d=state.droids.find(x=>x.name===name);return `<span class="side-companion" title="${name}">${picture(d,'DEFAULT')}<b>${name}</b><button class="side-companion-remove" data-remove-companion="${name}" title="Remove ${name}" aria-label="Remove ${name}">×</button></span>`}).join('')}${preferredCompanionsFull()?'':`<button class="side-companion-add" id="addPreferredCompanion" title="Add a preferred companion" aria-label="Add a preferred companion"><span class="slot-icon">${stationIcon('COMPANION')}</span><small>${preferredCompanions().length?'Add':'Add preferred companion'}</small></button>`}</div><small class="flawless-bonus">Taken ahead of any boost.</small></div><label class="side-check"><input id="sideKeepDroidex" type="checkbox" ${state.optimiseKeepDroidex===false?'':'checked'}> Keep droids that can fill the Droidex</label><label class="side-check"><input id="sideAutoCompleteBuilds" type="checkbox" ${state.autoCompleteBuilds?'checked':''}> Auto complete Build droids</label><label class="side-check"><input id="sideOptimiseFreeBuild" type="checkbox" ${state.optimiseFreeBuild?'checked':''}> Keep Build slots open in Optimise</label><label class="side-check"><input id="sideFusionHints" type="checkbox" ${fusionHintsEnabled()?'checked':''}> Show fusion uses in the droid picker</label><label class="side-check" title="Lets Optimise park spare droids in Fusion slots. Anything left there is what a Fuse consumes."><input id="sideFusionAsLounge" type="checkbox" ${state.fusionAsLounge?'checked':''}> Use Fusion as Lounge slots</label><label class="side-field optimise-free-build-mode" ${state.optimiseFreeBuild?'':'hidden'}>Sell priority<select id="sideOptimiseFreeBuildMode"><option value="upgrade-cost" ${optimiseFreeBuildMode()==='upgrade-cost'?'selected':''}>Highest upgrade cost</option><option value="rarity-income" ${optimiseFreeBuildMode()==='rarity-income'?'selected':''}>Lowest rarity + earnings</option></select><small class="flawless-bonus">Used when Optimise must sell stored future-use droids.</small></label></div></details><button class="btn danger super-rebirth-button" id="superRebirthButton">Super rebirth</button><div class="side-rule"></div>`;attachCloudSidebarHandlers(host);host.querySelector('#sideMultiplier').onchange=e=>{state.multiplier=Number(e.target.value)||0;save();rerender()};host.querySelector('#sideCycle').onchange=e=>{state.cycle=Number(e.target.value);save();rerender()};host.querySelector('#sideRebirth').onchange=e=>{state.rebirth=Number(e.target.value);save();rerender()};host.querySelector('#sideRebirthGoal').onchange=e=>{state.superRebirthGoal=Number(e.target.value)||maxRebirth();save();rerender()};host.querySelector('details.side-group')?.addEventListener('toggle',e=>localStorage.setItem('droid-archive-optimise-settings-open',e.target.open?'1':'0'));host.querySelectorAll('[data-companion-goal]').forEach(box=>box.onchange=()=>{state.companionGoals=[...host.querySelectorAll('[data-companion-goal]')].filter(x=>x.checked).map(x=>x.dataset.companionGoal);save();rerender()});host.querySelectorAll('[data-remove-companion]').forEach(button=>button.onclick=()=>{state.preferredCompanions=preferredCompanions().filter(name=>name!==button.dataset.removeCompanion);save();rerender()});const addCompanion=host.querySelector('#addPreferredCompanion');if(addCompanion)addCompanion.onclick=()=>showPreferredCompanionPicker(rerender);host.querySelector('#sideKeepDroidex').onchange=e=>{state.optimiseKeepDroidex=e.target.checked;save();rerender()};host.querySelector('#sideAutoCompleteBuilds').onchange=e=>{state.autoCompleteBuilds=e.target.checked;save();rerender()};host.querySelector('#sideFusionHints').onchange=e=>localStorage.setItem('droid-archive-picker-fusion-hints',e.target.checked?'1':'0');host.querySelector('#sideFusionAsLounge').onchange=e=>{state.fusionAsLounge=e.target.checked;save();rerender()};host.querySelector('#sideOptimiseFreeBuild').onchange=e=>{state.optimiseFreeBuild=e.target.checked;save();rerender()};host.querySelector('#sideOptimiseFreeBuildMode').onchange=e=>{state.optimiseFreeBuildMode=e.target.value;save();rerender()};host.querySelector('#superRebirthButton').onclick=()=>showSuperRebirthConfirm(rerender)}
const renderBaseSidebarWithoutOptimiseHelp=renderBaseSidebar;
const changeCurrentRebirth=(value,rerender)=>{state.rebirth=Math.max(0,Math.min(maxRebirth(),Number(value)||0));const changed=autoPurchaseEligibleSlots();save();if(changed)toast('Newly eligible slots purchased');rerender()};
renderBaseSidebar=rerender=>{
  renderBaseSidebarWithoutOptimiseHelp(rerender);
  const host=document.querySelector('#baseSidebarControls'),toggle=host.querySelector('#sideOptimiseFreeBuild')?.closest('label'),modeLabel=host.querySelector('.optimise-free-build-mode'),select=host.querySelector('#sideOptimiseFreeBuildMode'),mode=optimiseFreeBuildMode();
  if(toggle){toggle.insertAdjacentHTML('beforebegin',`<label class="side-check slot-auto-purchase" title="Automatically purchase every rebirth slot as soon as your selected rebirth makes it eligible."><input id="sideAutoPurchaseSlots" type="checkbox" ${state.autoPurchaseSlots?'checked':''}> Auto purchase slots</label>`);host.querySelector('#sideAutoPurchaseSlots').onchange=e=>{state.autoPurchaseSlots=e.target.checked;const changed=autoPurchaseEligibleSlots();save();toast(state.autoPurchaseSlots?changed?'Eligible slots purchased':'Auto purchase slots enabled':'Auto purchase slots disabled');rerender()}}
  const rebirthSelect=host.querySelector('#sideRebirth');if(rebirthSelect){const stepper=document.createElement('div');stepper.className='side-stepper';stepper.innerHTML=`<button type="button" data-rebirth-step="-1" aria-label="Decrease current rebirth" ${state.rebirth<=0?'disabled':''}>−</button><button type="button" data-rebirth-step="1" aria-label="Increase current rebirth" ${state.rebirth>=maxRebirth()?'disabled':''}>+</button>`;rebirthSelect.before(stepper);stepper.insertBefore(rebirthSelect,stepper.lastElementChild);rebirthSelect.onchange=e=>changeCurrentRebirth(e.target.value,rerender);stepper.querySelectorAll('[data-rebirth-step]').forEach(button=>button.onclick=()=>changeCurrentRebirth(state.rebirth+Number(button.dataset.rebirthStep),rerender))}
  if(toggle){const help='When enabled, Optimise tries to clear Build slots. Sell Priority controls which droids may be removed when safe storage is full.';toggle.title=help;toggle.insertAdjacentHTML('beforeend',`<span class="setting-help" tabindex="0" title="${help}" aria-label="${help}">?</span>`)}
  if(select){if(!select.querySelector('[value="unused-income"]'))select.insertAdjacentHTML('beforeend','<option value="unused-income">No further use, lowest earnings</option>');select.value=mode;select.title=optimiseFreeBuildModeHelp(mode);[...select.options].forEach(option=>option.title=optimiseFreeBuildModeHelp(option.value))}
  if(modeLabel){const labelHelp='Choose which droids Optimise is allowed to sell while trying to free Build slots.';modeLabel.title=labelHelp;modeLabel.insertAdjacentHTML('afterbegin',`<span class="setting-label-row"><span>Sell priority</span><span class="setting-help" tabindex="0" title="${labelHelp}" aria-label="${labelHelp}">?</span></span>`);for(const node of [...modeLabel.childNodes])if(node.nodeType===Node.TEXT_NODE&&node.textContent.trim()==='Sell priority')node.remove();const note=modeLabel.querySelector('small');if(note)note.textContent=optimiseFreeBuildModeHelp(mode)}
};
const pickerMultiAddEnabled=()=>localStorage.getItem('droid-archive-picker-multi-add')!=='0';
function showSlotPicker(station,onDone,slot){const root=document.querySelector('#modalRoot'),allowed=station==='UPGRADE_CHIP'?state.droids.filter(d=>UPGRADE_CHIP_RATES[d.rarity]):state.droids,productive=PRODUCTIVE_STATIONS.includes(station),hint=productive?'Any droid can use this station. Matching the droid’s type grants it +10% credits.':station==='UPGRADE_CHIP'?'The assigned droid produces Upgrade Chips instead of credits while you are online. The station stores up to one hour of chips.':'This workstation stores a droid without contributing to Base credit production.';root.innerHTML=`<div class="modal-backdrop"><section class="modal slot-picker" role="dialog" aria-modal="true"><p class="eyebrow">${station==='BUILD'?'Universal build':stationName(station)} slot</p><h2>Choose ${station==='UPGRADE_CHIP'?'a rated':'any'} droid</h2><p class="picker-hint">${hint}</p><label class="picker-mode"><input id="pickerMultiAdd" type="checkbox" ${pickerMultiAddEnabled()?'checked':''}><span><strong>Multi-add</strong><small>Keep this picker open until the station is full or you press Esc.</small></span></label><input id="slotSearch" class="form-control picker-search" placeholder="Search droids…" autofocus><div id="pickerResults" class="picker-results"></div><button class="btn ghost" id="cancelPicker">Cancel</button></section></div>`;const draw=()=>{const q=root.querySelector('#slotSearch').value.toLowerCase();root.querySelector('#pickerResults').innerHTML=allowed.filter(d=>d.name.toLowerCase().includes(q)).map(d=>`<button class="picker-droid ${d.type===station?'type-match':''}" data-name="${d.name}"><span>${picture(d)}</span><b>${d.name}</b><small>${rarityText(d.rarity)} &middot; ${d.type}${productive&&d.type===station?' &middot; +10%':''}</small>${fusionUsesHtml(d.name)}</button>`).join('')||'<p class="roster-empty">No matching droids.</p>';root.querySelectorAll('.picker-droid').forEach(b=>b.onclick=()=>showVariantChoice(b.dataset.name,station,onDone,slot))};root.querySelector('#pickerMultiAdd').onchange=e=>localStorage.setItem('droid-archive-picker-multi-add',e.target.checked?'1':'0');root.querySelector('#slotSearch').oninput=draw;root.querySelector('#cancelPicker').onclick=()=>root.innerHTML='';draw()}
// Every modal that has a search box behaves the same way: it takes focus the
// moment it opens, Enter picks the top result, Escape closes it. Driven off a
// mutation observer rather than each call site so new modals get it for free.
const MODAL_RESULT_SELECTOR='.picker-droid,.picker-results button,.variant-choice button,[data-pick-companion],.swap-choice button,.picker-results a';
const closeModalRoot=()=>{const root=document.querySelector('#modalRoot');if(root&&root.innerHTML)root.innerHTML=''};
function wireModalSearch(){
  const root=document.querySelector('#modalRoot');
  if(!root)return;
  const input=root.querySelector('.picker-search,.modal input[type="search"],.modal input[id$="Search"]');
  if(!input||input.dataset.searchWired)return;
  input.dataset.searchWired='1';
  input.focus({preventScroll:true});
  input.addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();root.querySelector(MODAL_RESULT_SELECTOR)?.click()}
    else if(event.key==='Escape'){event.preventDefault();closeModalRoot()}
  });
}
function attachModalBehaviour(){
  const root=document.querySelector('#modalRoot');
  if(!root||root.dataset.behaviourWired)return;
  root.dataset.behaviourWired='1';
  new MutationObserver(wireModalSearch).observe(root,{childList:true,subtree:true});
  // Escape closes a modal even when the search box does not have focus.
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModalRoot()});
  wireModalSearch();
}
// Where the copies you already own are sitting, condensed to fit on one line of
// the Rebirth outlook: "Worker ×2 · Lounge".
function droidWhereabouts(name,placed){
  const counts=new Map();
  for(const x of placed)if(x.name===name)counts.set(stationName(x.station),(counts.get(stationName(x.station))||0)+1);
  return [...counts].map(([label,n])=>n>1?`${label} ×${n}`:label).join(' · ');
}
const nextFreeSlot=station=>{const used=new Set(placements().placed.filter(x=>x.station===station).map(x=>x.slot));return slotFillOrder(station).find(i=>!used.has(i))??-1};
// Filling a station is usually several droids in a row, so the picker reopens on
// the next free slot instead of making you click back in each time. Escape or a
// full station ends it.
function afterDroidAdded(station,onDone){onDone?.();if(!pickerMultiAddEnabled())return;const next=nextFreeSlot(station);if(next>=0)showSlotPicker(station,onDone,next)}
function showVariantChoice(name,station,onDone,slot){const root=document.querySelector('#modalRoot'),d=state.droids.find(x=>x.name===name);if(isIconic(d)){commitOwned(name,'DEFAULT',1,station,slot);root.innerHTML='';afterDroidAdded(station,onDone);return}root.innerHTML=`<div class="modal-backdrop"><section class="modal"><p class="eyebrow">${station} slot</p><h2>Add ${name}</h2><div class="variant-choice">${VARIANTS.map(v=>`<button data-variant="${v}">${picture(d,v)}<strong>${variantText(v)}</strong><small>${station==='UPGRADE_CHIP'?`${fmt(upgradeChipRate(d,v))} chips/min`:variantIncomeText(d,v)}</small></button>`).join('')}</div><button class="btn ghost" id="backToPicker">Back</button></section></div>`;root.querySelectorAll('[data-variant]').forEach(b=>b.onclick=()=>{commitOwned(name,b.dataset.variant,1,station,slot);root.innerHTML='';afterDroidAdded(station,onDone)});root.querySelector('#backToPicker').onclick=()=>showSlotPicker(station,onDone,slot)}
function showBlueprintPicker(slot,onDone){const root=document.querySelector('#modalRoot');root.innerHTML=`<div class="modal-backdrop"><section class="modal slot-picker"><p class="eyebrow">Blueprint Storage</p><h2>Store a blueprint</h2><p class="picker-hint">Blueprints live here until you craft them into an open Build slot.</p><input id="blueprintSearch" class="form-control picker-search" placeholder="Search droids…" autofocus><div id="blueprintResults" class="picker-results"></div><button class="btn ghost" id="cancelBlueprint">Cancel</button></section></div>`;const draw=()=>{const q=root.querySelector('#blueprintSearch').value.toLowerCase();root.querySelector('#blueprintResults').innerHTML=state.droids.filter(d=>d.name.toLowerCase().includes(q)).map(d=>`<button class="picker-droid" data-name="${d.name}"><span>${picture(d)}</span><b>${d.name}</b><small>${rarityText(d.rarity)} &middot; blueprint</small></button>`).join('')||'<p class="roster-empty">No matching droids.</p>';root.querySelectorAll('.picker-droid').forEach(b=>b.onclick=()=>showBlueprintVariantChoice(b.dataset.name,slot,onDone))};root.querySelector('#blueprintSearch').oninput=draw;root.querySelector('#cancelBlueprint').onclick=()=>root.innerHTML='';draw()}
function showBlueprintVariantChoice(name,slot,onDone){const root=document.querySelector('#modalRoot'),d=state.droids.find(x=>x.name===name);if(isIconic(d)){addBlueprint(name,'DEFAULT',slot);root.innerHTML='';onDone();return}root.innerHTML=`<div class="modal-backdrop"><section class="modal"><p class="eyebrow">Blueprint Storage</p><h2>Store ${name} blueprint</h2><div class="variant-choice">${VARIANTS.map(v=>`<button data-variant="${v}">${picture(d,v)}<strong>${variantText(v)}</strong><small>Blueprint</small></button>`).join('')}</div><button class="btn ghost" id="backToBlueprintPicker">Back</button></section></div>`;root.querySelectorAll('[data-variant]').forEach(b=>b.onclick=()=>{addBlueprint(name,b.dataset.variant,slot);root.innerHTML='';onDone()});root.querySelector('#backToBlueprintPicker').onclick=()=>showBlueprintPicker(slot,onDone)}
function baseExport(){return{app:'Droid Archives',version:5,exportedAt:new Date().toISOString(),base:{owned:state.owned,blueprints:state.blueprints,droidex:state.droidex,novaUpgrades:state.novaUpgrades,cantinaPurchases:state.cantinaPurchases,multiplier:state.multiplier,cycle:state.cycle,rebirth:state.rebirth,superRebirthGoal:state.superRebirthGoal,optimiseFreeBuild:state.optimiseFreeBuild,optimiseFreeBuildMode:state.optimiseFreeBuildMode,optimiseKeepDroidex:state.optimiseKeepDroidex,companionGoals:state.companionGoals,preferredCompanions:state.preferredCompanions,autoCompleteBuilds:state.autoCompleteBuilds,autoPurchaseSlots:state.autoPurchaseSlots,purchasedSlots:state.purchasedSlots,loungePurchased:state.loungePurchased,novaLevel:state.novaLevel,rebirthTracker:state.rebirthTracker}}}
function droidexExport(){return{app:'Droid Archives',version:3,exportedAt:new Date().toISOString(),droidex:state.droidex}}
function validateDroidexImport(value){const rows=normalizeDroidRows(value?.droidex??value?.base?.droidex??value);if(!Array.isArray(rows))throw Error('This file does not contain a valid Droidex.');const validNames=new Set(state.droids.map(d=>d.name)),flawlessNames=new Set(rows.filter(x=>x?.flawless).map(x=>x.name)),entries=new Map();for(const row of rows){const d=state.droids.find(x=>x.name===row?.name);if(!validNames.has(row?.name)||!VARIANTS.includes(row?.variant)||isIconic(d)&&row.variant!=='DEFAULT')throw Error(`Invalid Droidex entry: ${row?.name||'unknown'}.`);entries.set(`${row.name}:${row.variant}`,{name:row.name,variant:row.variant,flawless:!isIconic(d)&&flawlessNames.has(row.name)})}return[...entries.values()]}
function showDroidexTransferModal(onDone){const root=document.querySelector('#modalRoot'),json=JSON.stringify(droidexExport(),null,2);root.innerHTML=`<div class="modal-backdrop"><section class="modal transfer-modal" role="dialog" aria-modal="true"><p class="eyebrow">Collection save</p><h2>Droidex Import / Export</h2><p class="picker-hint">Download your collected variants and flawless progress, or replace them from a Droidex or full Base export.</p><textarea id="droidexTransferJson" class="form-control transfer-json" spellcheck="false">${json}</textarea><label class="file-picker">Choose import file<input id="droidexImportFile" type="file" accept="application/json,.json"></label><p id="droidexTransferError" class="form-error" role="alert"></p><div class="modal-actions"><button class="btn" id="downloadDroidex">Download Droidex</button><button class="btn secondary" id="importDroidex">Import Droidex</button><button class="btn ghost" id="cancelDroidexTransfer">Close</button></div></section></div>`;const textarea=root.querySelector('#droidexTransferJson'),error=root.querySelector('#droidexTransferError');root.querySelector('#droidexImportFile').onchange=async e=>{const file=e.target.files[0];if(file)textarea.value=await file.text()};root.querySelector('#downloadDroidex').onclick=()=>{const blob=new Blob([JSON.stringify(droidexExport(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`droid-archives-droidex-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);toast('Droidex exported')};root.querySelector('#importDroidex').onclick=()=>{try{state.droidex=validateDroidexImport(JSON.parse(textarea.value));save();root.innerHTML='';toast('Droidex imported');onDone()}catch(e){error.textContent=e instanceof SyntaxError?'The import is not valid JSON.':e.message}};root.querySelector('#cancelDroidexTransfer').onclick=()=>root.innerHTML=''}
function validateBaseImport(value){const data=value?.base??value;if(!data||!Array.isArray(data.owned))throw Error('This file does not contain a valid Base.');data.owned=normalizeDroidRows(data.owned);data.droidex=normalizeDroidRows(data.droidex);data.blueprints=normalizeDroidRows(data.blueprints);const validNames=new Set(state.droids.map(d=>d.name));for(const row of data.owned){if(!validNames.has(row.name)||!VARIANTS.includes(row.variant)||!Number.isFinite(Number(row.qty))||Number(row.qty)<1)throw Error(`Invalid droid entry: ${row?.name||'unknown'}.`)}const droidex=Array.isArray(data.droidex)?data.droidex.filter(x=>validNames.has(x.name)&&VARIANTS.includes(x.variant)).map(x=>({name:x.name,variant:x.variant,flawless:Boolean(x.flawless)})):[],blueprints=Array.isArray(data.blueprints)?data.blueprints.filter(x=>validNames.has(x.name)&&VARIANTS.includes(x.variant)).map((x,i)=>({name:x.name,variant:x.variant,...(Number.isInteger(Number(x.slot))?{slot:Number(x.slot)}:{slot:i})})):[],upgradeIds=new Set((state.novaShop?.upgrades||[]).map(x=>x.id)),novaUpgrades={};for(const [id,level] of Object.entries(data.novaUpgrades||{}))if(!upgradeIds.size||upgradeIds.has(id))novaUpgrades[id]=Math.max(0,Math.floor(Number(level)||0));const cantinaPurchases=Object.fromEntries(Object.entries(data.cantinaPurchases||{}).filter(([,owned])=>Boolean(owned)).map(([id])=>[id,true]));return{owned:data.owned.map(x=>({name:x.name,variant:x.variant,qty:Math.floor(Number(x.qty)),...(SLOT_RULES[x.preferred]?{preferred:x.preferred,...(Number.isInteger(Number(x.preferredSlot))?{preferredSlot:Number(x.preferredSlot)}:{})}:{}),...(x.lockedSlot||x.lockedCompanion?{lockedSlot:true}:{}),...(x.built?{built:true}:{})})),blueprints,droidex,novaUpgrades,cantinaPurchases,multiplier:Number.isFinite(Number(data.multiplier))?Number(data.multiplier):1,cycle:Object.hasOwn(state.rebirths,String(Number(data.cycle)))?Number(data.cycle):0,rebirth:Math.max(0,Math.min(maxRebirth(),Math.floor(Number(data.rebirth)||0))),superRebirthGoal:Math.max(12,Math.min(maxRebirth(),Math.floor(Number(data.superRebirthGoal)||maxRebirth()))),optimiseFreeBuild:Boolean(data.optimiseFreeBuild),optimiseFreeBuildMode:['upgrade-cost','rarity-income'].includes(data.optimiseFreeBuildMode)?data.optimiseFreeBuildMode:'upgrade-cost',optimiseKeepDroidex:data.optimiseKeepDroidex!==false,companionGoals:Array.isArray(data.companionGoals)?data.companionGoals:null,preferredCompanions:Array.isArray(data.preferredCompanions)?data.preferredCompanions:[],autoCompleteBuilds:Boolean(data.autoCompleteBuilds),loungePurchased:Math.max(0,Math.min(4,Math.floor(Number(data.loungePurchased)||0))),novaLevel:Math.max(0,Math.min(4,Math.floor(Number(data.novaLevel)||0)))}}
const validateBaseImportWithoutUnusedMode=validateBaseImport;
validateBaseImport=value=>{const result=validateBaseImportWithoutUnusedMode(value),data=value?.base??value;if(OPTIMISE_FREE_BUILD_MODES.includes(data?.optimiseFreeBuildMode))result.optimiseFreeBuildMode=data.optimiseFreeBuildMode;const validSlotKeys=new Set(eligibleRebirthSlots(maxRebirth()).map(x=>slotPurchaseKey(x.type,x.index)));result.autoPurchaseSlots=data?.autoPurchaseSlots===undefined?true:Boolean(data.autoPurchaseSlots);result.purchasedSlots=[...new Set(Array.isArray(data?.purchasedSlots)?data.purchasedSlots.filter(key=>validSlotKeys.has(key)):[])];result.rebirthTracker=normalizeRebirthTracker(data?.rebirthTracker);state.rebirthTracker=result.rebirthTracker;return result};
function showTransferModal(onDone){const root=document.querySelector('#modalRoot'),json=JSON.stringify(baseExport(),null,2);root.innerHTML=`<div class="modal-backdrop"><section class="modal transfer-modal" role="dialog" aria-modal="true"><p class="eyebrow">Base save</p><h2>Import / Export</h2><p class="picker-hint">Download this Base and Droidex as a JSON file, or replace them by selecting or pasting another save.</p><textarea id="transferJson" class="form-control transfer-json" spellcheck="false">${json}</textarea><label class="file-picker">Choose import file<input id="importFile" type="file" accept="application/json,.json"></label><p id="transferError" class="form-error" role="alert"></p><div class="modal-actions"><button class="btn" id="downloadExport">Download export</button><button class="btn secondary" id="importSave">Import save</button><button class="btn ghost" id="cancelTransfer">Close</button></div></section></div>`;const textarea=root.querySelector('#transferJson'),error=root.querySelector('#transferError');root.querySelector('#importFile').onchange=async e=>{const file=e.target.files[0];if(file)textarea.value=await file.text()};root.querySelector('#downloadExport').onclick=()=>{const blob=new Blob([JSON.stringify(baseExport(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`droid-archives-base-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);toast('Base exported')};root.querySelector('#importSave').onclick=()=>{try{const next=validateBaseImport(JSON.parse(textarea.value));state.owned=next.owned;state.blueprints=next.blueprints;state.droidex=next.droidex;state.novaUpgrades=next.novaUpgrades;state.cantinaPurchases=next.cantinaPurchases;state.multiplier=next.multiplier;state.cycle=next.cycle;state.rebirth=next.rebirth;state.superRebirthGoal=next.superRebirthGoal;state.optimiseFreeBuild=next.optimiseFreeBuild;state.optimiseFreeBuildMode=next.optimiseFreeBuildMode;state.optimiseKeepDroidex=next.optimiseKeepDroidex!==false;state.companionGoals=Array.isArray(next.companionGoals)?next.companionGoals:null;state.preferredCompanions=Array.isArray(next.preferredCompanions)?next.preferredCompanions:[];state.autoCompleteBuilds=Boolean(next.autoCompleteBuilds);state.autoPurchaseSlots=next.autoPurchaseSlots;state.purchasedSlots=next.purchasedSlots;state.loungePurchased=next.loungePurchased;state.novaLevel=next.novaLevel;syncCantinaPackUpgrades();autoPurchaseEligibleSlots();save();root.innerHTML='';toast('Base imported');onDone()}catch(e){error.textContent=e instanceof SyntaxError?'The import is not valid JSON.':e.message}};root.querySelector('#cancelTransfer').onclick=()=>root.innerHTML=''}
const productiveStations=()=>['WORKER','ASTROMECH','BATTLE'].flatMap(station=>stationSlotIndices(station).map(slot=>({station,slot})));
function stabiliseAssignments(assignments,p){const current=new Map(p.placed.map(x=>[`${x.source}:${x.unit}`,x])),reserved=new Set(p.placed.filter(x=>x.lockedSlot).map(x=>`${x.station}:${x.slot}`)),byStation=new Map();for(const assignment of assignments){if(!byStation.has(assignment.station))byStation.set(assignment.station,[]);byStation.get(assignment.station).push(assignment)}return[...byStation].flatMap(([station,list])=>{const slots=stationSlotIndices(station).filter(slot=>!reserved.has(`${station}:${slot}`)),used=new Set(),kept=[],floating=[];for(const assignment of list){const old=current.get(assignment.key);if(old?.station===station&&slots.includes(old.slot)&&!used.has(old.slot)){used.add(old.slot);kept.push({...assignment,slot:old.slot})}else floating.push(assignment)}const open=slots.filter(slot=>!used.has(slot));return[...kept,...floating.map((assignment,index)=>({...assignment,slot:open[index]??assignment.slot}))]})}
function incomeForPlaced(placed){const productive=placed.filter(x=>PRODUCTIVE_STATIONS.includes(x.station)),baseIncome=productive.reduce((sum,x)=>{const d=state.droids.find(y=>y.name===x.name);return sum+(d?.variants[x.variant]?.income||0)},0),stationIncome=productive.reduce((sum,x)=>{const d=state.droids.find(y=>y.name===x.name),match=!isIconic(d)&&x.station===d.type;return sum+(d?.variants[x.variant]?.income||0)*(match?1.1:1)},0),iconicIncomeTotal=[...new Set(productive.map(x=>x.name))].reduce((sum,name)=>sum+iconicIncome(state.droids.find(d=>d.name===name)),0);return(stationIncome+baseIncome*iconicIncomeTotal)*effectiveMultiplier()}
function scrapIncomeForPlaced(placed){return incomeForPlaced(placed)}
function slotProductionHtml(d,variant,station,baseIncome,placed=[]){
  const earns=PRODUCTIVE_STATIONS.includes(station),incomeKnown=knownNumber(d.variants[variant]?.income),baseRate=incomeKnown?Number(d.variants[variant].income):0;
  if(station==='UPGRADE_CHIP'){const rate=upgradeChipRate(d,variant),stored=rate*60,bb8=bb8CompanionActive(placed);return rate?`<span>${variantText(variant)} · Base ${fmt(rate)} chips/min</span><span class="adjusted-production">Adjusted ${fmt(rate)} chips/min</span><span class="production-breakdown">Stores up to ${fmt(stored)} chips (1 hour)${bb8?` · BB-8 doubles this to ${fmt(stored*2)} when claimed`:' · no multipliers'}</span>`:`<span>${variantText(variant)}</span><span class="adjusted-production">No Upgrade Chip rate</span><span class="production-breakdown">Use a Common, Rare, Epic, Legendary or Mythic droid</span>`}
  if(station==='COMPANION'&&d.name==='BB-8'){const chipUnit=placed.find(x=>x.station==='UPGRADE_CHIP'),chipDroid=chipUnit&&state.droids.find(x=>x.name===chipUnit.name),rate=chipUnit?upgradeChipRate(chipDroid,chipUnit.variant):0;return `<span>${variantText(variant)} · Companion effect</span><span class="adjusted-production">Doubles Upgrade Chips when claimed</span><span class="production-breakdown">${rate?`Current one-hour claim: ${fmt(rate*60)} → ${fmt(rate*120)} chips`:'Place a rated droid in the Upgrade Chip slot to use this bonus'}</span>`}
  if(isIconic(d)){const rate=iconicIncome(d),baseContribution=baseIncome*rate,adjustedContribution=baseContribution*effectiveMultiplier(),label=`${variantText(variant)} · Base ${fmt(baseContribution)} (${rate*100}%)/s`;return earns?`<span>${label}</span><span class="adjusted-production">Adjusted ${fmt(adjustedContribution)}/s</span><span class="production-breakdown">×${effectiveMultiplier().toFixed(2)} base multiplier</span>`:`<span>${label}</span><span class="adjusted-production">Would earn ${fmt(adjustedContribution)}/s</span><span class="production-breakdown">No contribution here</span>`}
  if(!incomeKnown)return `<span>${variantText(variant)} · Base income unknown</span><span class="adjusted-production">Production not yet known</span><span class="production-breakdown">Excluded from credit totals until its income is confirmed</span>`;
  const match=earns&&station===d.type,adjustment=match?1.1:1,adjustedRate=baseRate*effectiveMultiplier()*adjustment,potentialRate=baseRate*effectiveMultiplier();
  return earns?`<span>${variantText(variant)} · Base ${fmt(baseRate)}/s</span><span class="adjusted-production">Adjusted ${fmt(adjustedRate)}/s</span><span class="production-breakdown">×${effectiveMultiplier().toFixed(2)} base multiplier${match?` · ×${adjustment.toFixed(2)} station match`:''}</span>`:`<span>${variantText(variant)} · Base ${fmt(baseRate)}/s</span><span class="adjusted-production">Would earn ${fmt(potentialRate)}/s</span><span class="production-breakdown">No contribution here</span>`
}
function optimiseBase(p,currentIncome){
  // A droid still being built cannot be picked up, so it is pinned exactly like
  // a locked one and never offered a productive slot.
  const locked=p.placed.filter(x=>x.lockedSlot||isBuilding(x)),lockedKeys=new Set(locked.map(x=>`${x.source}:${x.unit}`)),lockedSlots=new Set(locked.filter(x=>PRODUCTIVE_STATIONS.includes(x.station)).map(x=>`${x.station}:${x.slot}`)),slots=productiveStations().filter(slot=>!lockedSlots.has(`${slot.station}:${slot.slot}`)),currentPosition=new Map(p.placed.map(x=>[`${x.source}:${x.unit}`,x])),units=expandedOwned().map(x=>({...x,key:`${x.source}:${x.unit}`,droid:state.droids.find(d=>d.name===x.name)})).filter(x=>x.droid&&!lockedKeys.has(x.key)),iconics=units.filter(x=>iconicIncome(x.droid)>0).sort((a,b)=>iconicIncome(b.droid)-iconicIncome(a.droid)),regular=units.filter(x=>!iconicIncome(x.droid)),lockedProductive=locked.map(x=>({...x,droid:state.droids.find(d=>d.name===x.name)})).filter(x=>x.droid&&PRODUCTIVE_STATIONS.includes(x.station)),lockedIconicRate=[...new Set(lockedProductive.filter(x=>iconicIncome(x.droid)>0).map(x=>x.name))].reduce((sum,name)=>sum+iconicIncome(state.droids.find(d=>d.name===name)),0),lockedRegular=lockedProductive.filter(x=>!iconicIncome(x.droid));
  let best={income:0,assignments:[]};
  for(let mask=0;mask<(1<<iconics.length);mask++){
    const usedUnits=new Set(),usedSlots=new Set(),assignments=[],selected=iconics.filter((_,i)=>mask&(1<<i));
    let valid=true;
    for(const icon of selected){
      const open=slots.find(slot=>slot.station===icon.droid.type&&!usedSlots.has(`${slot.station}:${slot.slot}`));
      if(!open){valid=false;break}
      usedUnits.add(icon.key);usedSlots.add(`${open.station}:${open.slot}`);assignments.push({key:icon.key,name:icon.name,variant:icon.variant,station:open.station,slot:open.slot,value:0,iconic:true})
    }
    if(!valid)continue;
    const iconicRate=lockedIconicRate+assignments.reduce((sum,x)=>sum+iconicIncome(state.droids.find(d=>d.name===x.name)),0),lockedIncome=lockedRegular.reduce((sum,unit)=>{const base=unit.droid.variants[unit.variant]?.income||0;return sum+base*((unit.droid.type===unit.station?1.1:1)+iconicRate)*effectiveMultiplier()},0),stations=['WORKER','ASTROMECH','BATTLE'],available=Object.fromEntries(stations.map(station=>[station,slots.filter(slot=>slot.station===station&&!usedSlots.has(`${slot.station}:${slot.slot}`))])),caps=Object.fromEntries(stations.map(station=>[station,available[station].length])),keyFor=counts=>`${counts.WORKER},${counts.ASTROMECH},${counts.BATTLE}`;
    const tieScore=(unit,station)=>{const old=currentPosition.get(unit.key);return(old?.station===station?10000:0)+(unit.droid.type===station?1000:0)+(old&&['WORKER','ASTROMECH','BATTLE'].includes(old.station)&&station!==old.station?-10:0)};
    let dp=new Map([[keyFor({WORKER:0,ASTROMECH:0,BATTLE:0}),{value:0,stability:0,counts:{WORKER:0,ASTROMECH:0,BATTLE:0},picks:[]}]]);
    for(const unit of regular.filter(unit=>!usedUnits.has(unit.key))){
      const next=new Map(dp);
      for(const state of dp.values()){
        for(const station of stations){
          if(state.counts[station]>=caps[station])continue;
          const base=unit.droid.variants[unit.variant]?.income||0,value=base*((unit.droid.type===station?1.1:1)+iconicRate)*effectiveMultiplier(),counts={...state.counts,[station]:state.counts[station]+1},key=keyFor(counts),candidate={value:state.value+value,stability:state.stability+tieScore(unit,station),counts,picks:[...state.picks,{unit,station,value}]},previous=next.get(key);
          if(!previous||candidate.value>previous.value+1e-6||Math.abs(candidate.value-previous.value)<=1e-6&&candidate.stability>previous.stability)next.set(key,candidate)
        }
      }
      dp=next
    }
    const chosen=[...dp.values()].sort((a,b)=>(b.value-a.value)||(b.stability-a.stability))[0],stationUse={WORKER:0,ASTROMECH:0,BATTLE:0};
    for(const pick of chosen.picks){const slot=available[pick.station][stationUse[pick.station]++],slotKey=`${slot.station}:${slot.slot}`;usedUnits.add(pick.unit.key);usedSlots.add(slotKey);assignments.push({key:pick.unit.key,name:pick.unit.name,variant:pick.unit.variant,station:slot.station,slot:slot.slot,value:pick.value})}
    const income=lockedIncome+assignments.reduce((sum,x)=>sum+x.value,0);
    const stability=chosen.stability+assignments.reduce((sum,x)=>{const old=currentPosition.get(x.key);return sum+(old?.station===x.station?10000:0)+(old?.station===x.station&&old?.slot===x.slot?1000:0)},0);
    if(income>best.income+1e-6||Math.abs(income-best.income)<=1e-6&&stability>(best.stability||0))best={income,stability,assignments}
  }
  best.assignments=stabiliseAssignments(best.assignments,p);
  const current=new Map(p.placed.map(x=>[`${x.source}:${x.unit}`,x])),wanted=new Map(best.assignments.map(x=>[x.key,x])),firstOpen=(station,origin)=>slotFillOrder(station,origin).find(i=>!p.placed.some(x=>x.station===station&&x.slot===i))??-1,moves=best.assignments.filter(x=>current.get(x.key)?.station!==x.station).map(x=>{const old=current.get(x.key),sourceLabel=old?old.station:'Roster',displaced=p.placed.find(y=>y.station===x.station&&`${y.source}:${y.unit}`!==x.key&&wanted.get(`${y.source}:${y.unit}`)?.station!==x.station),open=firstOpen(x.station,old),targetSlot=displaced?displaced.slot:open>=0?open:x.slot,targetLabel=displaced?`${x.station} slot holding ${displaced.name} ${variantText(displaced.variant)}`:`empty ${x.station} slot`;return{unit:{...x,slot:targetSlot},current:sourceLabel,targetStation:x.station,targetSlot,targetLabel,displaced:displaced?{key:`${displaced.source}:${displaced.unit}`,name:displaced.name,variant:displaced.variant,target:sourceLabel}:null}});
  const gain=Math.max(0,best.income-currentIncome),actionable=gain>1&&moves.length;
  return{income:best.income,gain:actionable?gain:0,moves:actionable?moves:[],assignments:best.assignments}
}
function optimisePanel(plan){const open=localStorage.getItem('droid-archive-optimise-open')==='1',moves=plan.moves.slice(0,8).map((move,i)=>`<li><button class="optimise-apply" data-optimise-move="${i}" title="Apply this move">✓</button><strong>${move.unit.name}</strong> <span>${variantText(move.unit.variant)}</span><small>Move ${move.current} ${move.unit.name} ${variantText(move.unit.variant)} to ${move.targetLabel}</small>${move.displaced?`<em>This swaps out ${move.displaced.name} ${variantText(move.displaced.variant)}; it should move to ${move.displaced.target}.</em>`:'<em>No occupied slot needs clearing.</em>'}</li>`).join('');return `<section class="optimise-panel ${open?'open':'closed'}"><header><div><p class="eyebrow">Credit optimiser</p><h2>Optimise placements</h2></div><div class="optimise-summary"><strong>${plan.gain>1?`+${fmt(plan.gain*3600)}/h`:'Already optimised'}</strong><button class="btn secondary" id="toggleOptimise">${open?'Hide':'Show'} plan</button></div></header><div class="optimise-body" ${open?'':'hidden'}><p>${plan.gain>1?`Best estimated layout: ${fmt(plan.income*3600)} credits/hour. Put each droid into the named slot; use ✓ to apply a move.`:'Your productive slots already look best for credit/hour with the droids you own.'}</p>${moves?`<ul>${moves}</ul>`:''}</div></section>`}
// The per-rebirth list below repeats a droid once for every rebirth that wants
// it, which is right when planning one rebirth and wrong when you are staring at
// a full Base asking what is still outstanding and what can go. This is the same
// data folded the other way: one line per droid, at the highest quality it is
// ever asked for, plus the copies nothing needs any more.
function outstandingDroidsHtml(p){
  const goal=rebirthGoal(),outstanding=[...new Set(futureRequirements().map(x=>x.droidName))].map(name=>{
    const schedule=requirementSchedule(name,{after:state.rebirth,through:goal}),d=state.droids.find(x=>x.name===name);
    const peak=schedule.reduce((best,item)=>VARIANTS.indexOf(item.variant)>VARIANTS.indexOf(best)?item.variant:best,schedule[0]?.variant);
    const have=bestOwnedVariant(name),ready=Boolean(have&&VARIANTS.indexOf(have)>=VARIANTS.indexOf(peak));
    return{d,name,peak,have,ready,chips:d&&have&&!ready?chipsToVariant(d,have,peak):0,at:schedule.map(x=>x.at)};
  }).filter(row=>row.d&&!row.ready).sort((a,b)=>a.at[0]-b.at[0]||a.name.localeCompare(b.name));
  // A copy is spare when no rebirth left in this cycle names its droid. Iconics
  // and anything flagged cannotSell are left out because they cannot be sold.
  const spare=[];
  for(const unit of [...(p?.placed||[]),...(p?.overflow||[])]){
    const d=state.droids.find(x=>x.name===unit.name);
    if(!d||isIconic(d)||d.special?.cannotSell)continue;
    if(requirementSchedule(unit.name,{after:state.rebirth,through:goal}).length)continue;
    if(spare.some(x=>x.d.name===d.name&&x.unit.variant===unit.variant))continue;
    spare.push({d,unit,chips:chipSellValue(d,unit.variant)});
  }
  spare.sort((a,b)=>b.chips-a.chips);
  const open=localStorage.getItem('droid-archive-outstanding-open')!=='0';
  const findRow=row=>`<a class="outstanding-card ${row.have?'upgrade':'missing'}" href="#/droid/${slug(row.name)}">${picture(row.d,row.peak)}<span><strong>${row.name}</strong><small>${rarityText(row.d.rarity)} &middot; needs ${variantText(row.peak)}</small><em>R: ${[...new Set(row.at)].join(', ')}${row.have?` &middot; have ${variantText(row.have)} &middot; ${fmt(row.chips)} chips`:''}</em></span></a>`;
  const spareRow=row=>`<a class="outstanding-card spare" href="#/droid/${slug(row.d.name)}">${picture(row.d,row.unit.variant)}<span><strong>${row.d.name}</strong><small>${variantText(row.unit.variant)} &middot; ${stationSlotLabel(row.unit.station,row.unit.slot)}</small><em>Sells for ${fmt(row.chips)} chips</em></span></a>`;
  return `<details class="outstanding-panel" id="outstandingPanel" ${open?'open':''}><summary><span><strong>What is still left</strong><small>${outstanding.length} droid${outstanding.length===1?'':'s'} to find through R: ${goal}${spare.length?` &middot; ${spare.length} in your Base nothing needs`:''}</small></span></summary><div class="outstanding-body"><section><h4>Only these are still needed</h4><div class="outstanding-grid">${outstanding.map(findRow).join('')||'<p class="empty">Nothing is outstanding through your goal.</p>'}</div></section><section><h4>Nothing left in this cycle needs these</h4><div class="outstanding-grid">${spare.map(spareRow).join('')||'<p class="empty">Every droid in your Base is still spoken for.</p>'}</div></section></div></details>`;
}
// The Base settings box holds the rebirth controls and sits at the very top of a
// page people keep scrolled to the bottom. Once it has scrolled past, a compact
// bar takes over so a rebirth can be stepped without the round trip up and back.
function attachRebirthQuickBar(rerender){
  // A Base re-render calls this again; the previous bar has to take its
  // observer with it rather than leaving one watching a detached node.
  document.querySelector('#rebirthQuickBar')?.dispose?.();
  if(state.sharedView)return;
  const anchor=document.querySelector('.modern-base-settings')||document.querySelector('.base-top');
  if(!anchor||typeof IntersectionObserver!=='function')return;
  const bar=document.createElement('div');
  bar.id='rebirthQuickBar';bar.className='rebirth-quick-bar';bar.hidden=true;
  const step=delta=>{
    const next=Math.min(maxRebirth(),Math.max(0,state.rebirth+delta));
    if(next===state.rebirth)return;
    state.rebirth=next;save();rerender();
  };
  const draw=()=>{
    const goal=rebirthGoal(),next=(state.rebirths[state.cycle]||[]).find(r=>r.to===state.rebirth+1);
    bar.innerHTML=`<span class="quick-eyebrow">Cycle ${state.cycle+1}</span><div class="quick-step"><button type="button" data-quick-step="-1" ${state.rebirth<=0?'disabled':''} title="Down one rebirth" aria-label="Down one rebirth">&#9660;</button><b>R: ${state.rebirth}</b><button type="button" data-quick-step="1" ${state.rebirth>=maxRebirth()?'disabled':''} title="Up one rebirth" aria-label="Up one rebirth">&#9650;</button></div><span class="quick-goal">Goal R: ${goal}</span>${next?`<span class="quick-next">Next ${rebirthReadiness(next)?'<b class="ready">&#10003; ready</b>':'<b>not ready</b>'}</span>`:''}<button type="button" class="quick-top" id="rebirthQuickTop" title="Back to Base settings" aria-label="Back to Base settings">&#8593; Top</button>`;
    bar.querySelectorAll('[data-quick-step]').forEach(button=>button.onclick=()=>step(Number(button.dataset.quickStep)));
    bar.querySelector('#rebirthQuickTop').onclick=()=>anchor.scrollIntoView({behavior:'smooth',block:'start'});
  };
  draw();document.body.appendChild(bar);document.body.classList.add('has-rebirth-quick-bar');
  // Only show it once the settings box has gone past the top, never when the
  // page is simply scrolled above it.
  const observer=new IntersectionObserver(([entry])=>{
    bar.hidden=entry.isIntersecting||entry.boundingClientRect.bottom>0;
  },{threshold:0});
  observer.observe(anchor);
  // A rerender throws this bar away, so the observer has to go with it.
  bar.dispose=()=>{observer.disconnect();bar.remove();document.body.classList.remove('has-rebirth-quick-bar')};
}
function basePageV2(){
 const render=()=>{const p=placements(),future=futureRequirements(),replacementProtected=replacementSettings().protect?rebirthProtectedKeys(p):new Set(),rebirthPick=p.placed.reduce((map,x)=>{const previous=map.get(x.name);if(!previous||VARIANTS.indexOf(x.variant)>VARIANTS.indexOf(previous.variant))map.set(x.name,{variant:x.variant,key:`${x.source}:${x.unit}`});return map},new Map()),productive=p.placed.filter(x=>PRODUCTIVE_STATIONS.includes(x.station)),baseIncome=productive.reduce((sum,x)=>{const d=state.droids.find(y=>y.name===x.name);return sum+(d?.variants[x.variant]?.income||0)},0),stationIncome=productive.reduce((sum,x)=>{const d=state.droids.find(y=>y.name===x.name),match=!isIconic(d)&&x.station===d.type;return sum+(d?.variants[x.variant]?.income||0)*(match?1.1:1)},0),iconicIncomeTotal=[...new Set(productive.map(x=>x.name))].reduce((sum,name)=>sum+iconicIncome(state.droids.find(d=>d.name===name)),0),income=(stationIncome+baseIncome*iconicIncomeTotal)*effectiveMultiplier();
  const slot=(type,index)=>{const occupant=p.placed.find(x=>x.station===type&&x.slot===index);if(occupant){const d=state.droids.find(x=>x.name===occupant.name),cycleStatus=droidCycleStatus(d,occupant.variant,rebirthPick.get(d.name)?.key===`${occupant.source}:${occupant.unit}`),match=!isIconic(d)&&type===d.type,production=slotProductionHtml(d,occupant.variant,type,baseIncome,p.placed),productive=PRODUCTIVE_STATIONS.includes(type),locked=Boolean(occupant.lockedSlot),building=isBuilding(occupant);return `<div class="base-slot occupied ${match?'matched-slot':''} ${locked?'slot-pinned':''} ${building?'slot-building':''} cycle-${cycleStatus.kind}" draggable="${DRAG_AND_DROP_ENABLED&&!building?'true':'false'}" data-slot-station="${type}" data-slot-index="${index}" data-source="${occupant.source}" data-unit="${occupant.unit}"><a href="#/droid/${slug(d.name)}"><div>${picture(d,occupant.variant)}</div><strong class="slot-droid-name variant-${occupant.variant.toLowerCase()}">${d.name}</strong><small class="slot-production">${production}</small>${match?'<em class="match-bonus">+10% match</em>':''}${locked?'<em class="lock-status">Locked for Optimise</em>':''}${building?'<em class="build-status">Still building · Optimise will not move it</em>':''}<em class="cycle-status cycle-${cycleStatus.kind}">${cycleStatus.label}</em></a>${building?`<button class="slot-complete" data-complete-source="${occupant.source}" data-complete-unit="${occupant.unit}" title="Mark ${d.name} as finished building" aria-label="Mark ${d.name} as finished building">✓ Complete</button>`:''}${isIconic(d)?'':`<button class="slot-variant" data-source="${occupant.source}" data-name="${d.name}" data-variant="${occupant.variant}" data-station="${type}" data-slot="${index}" title="Change ${d.name} quality" aria-label="Change ${d.name} quality">◆</button>`}${productive?`<button class="slot-replacement-target" data-replacement-key="${replacementKey(occupant)}" title="Use ${d.name} as replacement target" aria-label="Use ${d.name} as replacement target">⌖</button>`:''}<button class="slot-lock ${locked?'active':''}" data-source="${occupant.source}" data-unit="${occupant.unit}" title="${locked?'Unlock this droid slot':'Lock this droid slot for Optimise'}" aria-label="${locked?'Unlock this droid slot':'Lock this droid slot for Optimise'}">${locked?'🔒':'🔓'}</button><button class="slot-swap" data-source="${occupant.source}" data-unit="${occupant.unit}" title="Swap ${d.name}" aria-label="Swap ${d.name}">⇄</button><button class="slot-delete" data-source="${occupant.source}" title="Remove ${d.name}" aria-label="Remove ${d.name}">×</button></div>`}const unlock=slotUnlockRebirth(type,index),eligible=isSlotEligible(type,index),purchased=isSlotPurchased(type,index),locked=!eligible||!purchased;if(eligible&&!purchased)return `<button class="base-slot locked purchasable" data-purchase-station="${type}" data-purchase-slot="${index}"><span class="slot-icon">${stationIcon(type)}</span><strong class="slot-purchase-title">Purchase slot</strong><small>${Number(unlock)>0&&Number(unlock)<50?`Unlocked at Rebirth ${unlock}`:'Available now'}</small></button>`;const label=locked?lockedSlotLabel(type,index):`Add to ${stationName(type)} slot`;return `<button class="base-slot ${locked?'locked':'open'}" ${locked?'disabled':''} ${locked?'':`data-station="${type}"`} data-slot-index="${index}"><span class="slot-icon">${stationIcon(type)}</span><small>${label}</small></button>`};
  const station=type=>{const total=SLOT_RULES[type].initial+SLOT_RULES[type].unlocks.length,active=capacity(type),eligible=Array.from({length:total},(_,i)=>i).filter(i=>isSlotEligible(type,i)).length,toPurchase=eligible-active,future=total-eligible,used=p.placed.filter(x=>x.station===type).length,slots=Array.from({length:total},(_,i)=>`${slotDivider(type,i)}${slot(type,i)}`).join('');const fusePreview=type==='FUSION'?fusionPreviewHtml():'';const fuseControl=type==='FUSION'?`<button class="btn secondary station-fuse" id="runFusion" type="button" ${used<3?'disabled':''} title="${used<3?'Fill all three Fusion slots first':'Fuse these three droids'}">Fuse</button>`:'';
    return `<section class="station station-${type.toLowerCase().replaceAll('_','-')}"><header><span>${stationIcon(type)}<strong>${stationName(type)}</strong>${fuseControl}</span><small>${used}/${active} slots${toPurchase?` · ${toPurchase} to purchase`:''}${future?` · ${future} locked`:''}</small></header><div class="slot-grid">${slots}</div>${fusePreview}</section>`};
  // One card per droid-and-quality. state.owned keeps a separate row per
  // station-and-slot preference, so two copies of one droid can sit in two rows;
  // that matters to the planner but reads as a duplicate here. The remove button
  // takes one copy off the newest row, so a group of three needs three presses.
  const rosterGroups=[];
  state.owned.forEach((x,index)=>{const group=rosterGroups.find(g=>g.name===x.name&&g.variant===x.variant);
    group?(group.qty+=x.qty,group.last=index):rosterGroups.push({name:x.name,variant:x.variant,qty:x.qty,last:index})});
  // Alphabetical, then by quality within a droid: the roster is something you
  // scan for a name, not a record of the order things were added.
  rosterGroups.sort((left,right)=>left.name.localeCompare(right.name)||VARIANTS.indexOf(left.variant)-VARIANTS.indexOf(right.variant));
  const roster=rosterGroups.map(g=>{const d=state.droids.find(y=>y.name===g.name);
    return `<div class="roster-card" data-roster-name="${d.name.toLowerCase()}"><a href="#/droid/${slug(d.name)}">${picture(d,g.variant)}<span><strong>${d.name}</strong><small>${variantText(g.variant)} &middot; &times;${g.qty}</small></span></a><button class="icon-btn roster-remove" data-i="${g.last}" title="${g.qty>1?`Remove one of ${g.qty}`:`Remove ${d.name}`}">×</button></div>`}).join('');
  const located=requirementLocations(),units=requirementUnits(p);
  const needed=[...new Set(future.map(x=>x.at))].map(rebirth=>{const rebirthInfo=(state.rebirths[state.cycle]||[]).find(r=>r.to===rebirth);return `<section class="rebirth-group" data-rebirth="${rebirth}"><h3><span>Rebirth: ${rebirth}</span><span class="rebirth-group-rewards">${rebirthRewardHtml(rebirth)}${rebirthInfo?creditAmount(rebirthInfo.creditsCost):''}</span></h3><div class="needed-grid">${future.filter(x=>x.at===rebirth).map(req=>neededCardHtml(req,{located,units,rebirth})).join('')}</div></section>`}).join('');
  const blueprintTotal=Math.max(3,capacity('BLUEPRINT_STORAGE')),blueprintSlots=Array.from({length:blueprintTotal},(_,i)=>{const bp=state.blueprints.find(x=>Number(x.slot)===i),locked=i>=capacity('BLUEPRINT_STORAGE');if(bp){const d=state.droids.find(x=>x.name===bp.name),index=state.blueprints.indexOf(bp);return `<div class="base-slot occupied blueprint-card ${locked?'locked-blueprint':''}"><a href="#/droid/${slug(d.name)}"><div>${picture(d,bp.variant)}</div><strong>${d.name}</strong><small>${variantText(bp.variant)} blueprint</small></a><button class="slot-swap craft-blueprint" data-blueprint="${index}" title="Craft into Build" aria-label="Craft ${d.name} into Build">⚒</button><button class="slot-delete delete-blueprint" data-blueprint="${index}" title="Remove blueprint" aria-label="Remove ${d.name} blueprint">×</button></div>`}return `<button class="base-slot ${locked?'locked':'open'} blueprint-open" ${locked?'disabled':''} data-blueprint-slot="${i}"><span class="slot-icon">${stationIcon('BLUEPRINT_STORAGE')}</span><small>${locked?`Unlock Blueprint Storage ${i+1} in Nova Shop`:'Add blueprint'}</small></button>`}).join('');
  app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / Base</div><div class="base-heading"><div><p class="eyebrow">${state.sharedView?'Shared base':'Personal base'}</p><h1>${state.sharedView?`${escapeAttr(state.sharedView.ownerName)} · ${escapeAttr(state.sharedView.profileName)}`:'Base'}</h1></div><div class="base-actions"><button class="btn secondary base-panel-toggle" id="toggleScrapPanel">Hide Scrap</button><button class="btn secondary base-panel-toggle" id="toggleReplacementPanel">Hide Replacements</button><button class="btn secondary base-panel-toggle" id="toggleOutlookPanel">Hide Outlook</button><button class="btn secondary" id="transferBase">Import / Export</button></div></div><div class="base-top"><div class="stat"><small>Credits / second</small><strong>${fmt(income)}</strong></div><div class="stat"><small>Credits / minute</small><strong>${fmt(income*60)}</strong></div><div class="stat"><small>Credits / hour</small><strong>${fmt(income*3600)}</strong></div><div class="stat"><small>Droids owned</small><strong>${state.owned.reduce((s,x)=>s+x.qty,0)}</strong></div></div>${baseHealthCheckHtml(p)}${scrapCalculatorHtml(p.placed)}${chipSellCalculatorHtml(p)}${replacementCalculatorHtml(p)}${baseRebirthSummaryHtml()}${baseViewIsMap()?baseMapHtml(p):''}<div class="base-layout-v2 ${baseViewIsMap()?'map-mode':''}"><div class="typed-stations">${['WORKER','ASTROMECH','BATTLE'].map(station).join('')}</div><div class="build-side">${station('BUILD')}</div><section class="roster-wide"><header><div><strong>Roster</strong><span>${state.owned.reduce((s,x)=>s+x.qty,0)} droids${p.overflow.length?` · ${p.overflow.length} over capacity`:''}</span></div><input id="rosterSearch" class="form-control" placeholder="Search roster…"></header><div id="rosterCards">${roster||'<p class="roster-empty">No droids yet. Click any empty slot to add one.</p>'}</div></section></div><div class="needed-heading"><h2>Needed later in this cycle</h2><input id="neededSearch" class="form-control" placeholder="Search needed droids…"></div>${outstandingDroidsHtml(p)}<div id="neededGroups">${needed||'<div class="empty">Nothing else is required in this cycle.</div>'}</div><p id="neededEmpty" class="empty" hidden>No requirements match that search.</p>`;
  document.querySelector('.build-side').insertAdjacentHTML('afterend',`<div class="blueprint-side"><section class="station station-blueprint"><header><span>${stationIcon('BLUEPRINT_STORAGE')}<strong>Blueprint Storage</strong></span><small>${state.blueprints.length}/${capacity('BLUEPRINT_STORAGE')} slots</small></header><div class="slot-grid">${blueprintSlots}</div></section></div><div class="special-stations">${station('LOUNGE')}${station('COMPANION')}${station('UPGRADE_CHIP')}${station('FUSION')}${station('FUSION_BUILD')}</div>`);attachCollapsiblePanels();attachReplacementCalculator(render);renderBaseSidebar(render);attachSlotDragAndDrop(p,render);attachNeededCardHandlers(render);attachRebirthQuickBar(render);document.querySelectorAll('[data-station]').forEach(b=>b.onclick=()=>showSlotPicker(b.dataset.station,render,Number(b.dataset.slotIndex)));document.querySelectorAll('[data-blueprint-slot]').forEach(b=>b.onclick=()=>showBlueprintPicker(Number(b.dataset.blueprintSlot),render));document.querySelectorAll('.craft-blueprint').forEach(b=>b.onclick=()=>craftBlueprint(Number(b.dataset.blueprint),render));document.querySelectorAll('.delete-blueprint').forEach(b=>b.onclick=()=>{state.blueprints.splice(Number(b.dataset.blueprint),1);save();render()});document.querySelectorAll('.slot-delete:not(.delete-blueprint)').forEach(b=>b.onclick=()=>{removeOwnedUnit(Number(b.dataset.source));render()});document.querySelectorAll('.slot-variant').forEach(b=>b.onclick=()=>showCardVariantModal({source:Number(b.dataset.source),name:b.dataset.name,variant:b.dataset.variant,station:b.dataset.station,slot:Number(b.dataset.slot)},render));document.querySelectorAll('.slot-replacement-target').forEach(b=>b.onclick=()=>{localStorage.setItem('droid-archive-replacement-target',b.dataset.replacementKey);localStorage.setItem('droid-archive-replacement-collapsed','0');render();requestAnimationFrame(()=>document.querySelector('.replacement-calculator')?.scrollIntoView({behavior:'smooth',block:'start'}))});document.querySelectorAll('.slot-lock').forEach(b=>b.onclick=()=>{toggleSlotLock(Number(b.dataset.source),Number(b.dataset.unit));render()});document.querySelectorAll('.slot-complete').forEach(b=>b.onclick=()=>{completeBuild(Number(b.dataset.completeSource),Number(b.dataset.completeUnit));render()});document.querySelector('#runFusion')?.addEventListener('click',()=>runFusion(render));document.querySelector('#toggleBaseMap')?.addEventListener('click',()=>{localStorage.setItem('droid-archive-base-view',baseViewIsMap()?'slots':'map');render()});document.querySelector('#toggleMapFloor')?.addEventListener('click',()=>{localStorage.setItem('droid-archive-map-floor',mapFloor()==='downstairs'?'upstairs':'downstairs');render()});document.querySelectorAll('.slot-swap:not(.craft-blueprint)').forEach(b=>b.onclick=()=>showSwapModal({source:Number(b.dataset.source),unit:Number(b.dataset.unit)},render));document.querySelectorAll('.roster-remove').forEach(b=>b.onclick=()=>{removeOwnedUnit(Number(b.dataset.i));render()});document.querySelector('#rosterSearch').oninput=e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('.roster-card').forEach(c=>c.hidden=!c.dataset.rosterName.includes(q))};document.querySelector('#neededSearch').oninput=e=>{const q=e.target.value.toLowerCase();let shown=0;document.querySelectorAll('.rebirth-group').forEach(group=>{let groupShown=0;group.querySelectorAll('.needed-card').forEach(card=>{const match=card.dataset.neededName.includes(q);card.hidden=!match;if(match){shown++;groupShown++}});group.hidden=groupShown===0});document.querySelector('#neededEmpty').hidden=shown!==0};document.querySelector('#outstandingPanel')?.addEventListener('toggle',e=>localStorage.setItem('droid-archive-outstanding-open',e.target.open?'1':'0'));document.querySelector('#transferBase').onclick=()=>showTransferModal(render)
  document.querySelectorAll('[data-purchase-station]').forEach(button=>button.onclick=()=>purchaseRebirthSlot(button.dataset.purchaseStation,Number(button.dataset.purchaseSlot),render));
  requestAnimationFrame(()=>decorateCommandDeck('/base'));
 };render()}
function stabiliseProjectedPlacements(baseP,placed){const current=new Map(baseP.placed.map(x=>[`${x.source}:${x.unit}`,x])),stations=[...new Set(placed.map(x=>x.station))],stable=[];for(const station of stations){const list=placed.filter(x=>x.station===station),slots=stationSlotIndices(station),used=new Set(),floating=[];for(const item of list){const old=current.get(`${item.source}:${item.unit}`);if(old?.station===station&&slots.includes(old.slot)&&!used.has(old.slot)){used.add(old.slot);stable.push({...item,slot:old.slot})}else floating.push(item)}const spare=new Set(slots.filter(slot=>!used.has(slot))),colliding=[];
    for(const item of floating){if(spare.has(item.slot)){spare.delete(item.slot);stable.push(item)}else colliding.push(item)}
    for(const item of colliding){
      const old=current.get(`${item.source}:${item.unit}`);
      const slot=slotFillOrder(station,old||null).find(i=>spare.has(i));
      if(slot===undefined){stable.push(item);continue}
      spare.delete(slot);stable.push({...item,slot});
    }
  }
  return stable;
}
// The saved shape of a layout. Pulled out of optimisedPlacements because
// applying recorded landings moves droids after the fact, and the rows written
// to the save have to be rebuilt from where they ended up.
const optimisedRows=(placed,overflow)=>[...placed,...overflow].map(x=>({name:x.name,variant:x.variant,qty:1,...(x.station?{preferred:x.station,preferredSlot:x.slot}:{}),...(x.lockedSlot?{lockedSlot:true}:{}),...(x.built?{built:true}:{})}));
function optimisedPlacements(baseP,plan){
  const assigned=new Map((plan.assignments||[]).map(x=>[x.key,x])),current=new Map(baseP.placed.map(x=>[`${x.source}:${x.unit}`,x])),occupied=Object.fromEntries(Object.keys(SLOT_RULES).map(type=>[type,new Set()])),placed=[],overflow=[],sell=[],units=expandedOwned();
  const claim=(unit,station,slot)=>{occupied[station].add(slot);placed.push({...unit,station,slot})},free=(station,origin)=>slotFillOrder(station,origin).find(i=>!occupied[station].has(i))??-1,canKeep=(station,slot)=>station&&stationSlotIndices(station).includes(slot)&&!occupied[station].has(slot);
  const lockedKeys=new Set(baseP.placed.filter(x=>x.lockedSlot||isBuilding(x)).map(x=>`${x.source}:${x.unit}`));
  for(const locked of baseP.placed.filter(x=>lockedKeys.has(`${x.source}:${x.unit}`)))if(canKeep(locked.station,locked.slot))claim(locked,locked.station,locked.slot);
  for(const unit of units){const key=`${unit.source}:${unit.unit}`,target=assigned.get(key);if(target)claim(unit,target.station,target.slot)}
  const bestFuture=new Map();
  for(const unit of units){if(assigned.has(`${unit.source}:${unit.unit}`))continue;const previous=bestFuture.get(unit.name);if(!previous||VARIANTS.indexOf(unit.variant)>VARIANTS.indexOf(previous.variant))bestFuture.set(unit.name,{variant:unit.variant,key:`${unit.source}:${unit.unit}`})}
  const candidates=[],droidexKeepers=new Map(),droidexKeptKeys=new Map(),keptByHand=new Map(),spared=sparedFromSelling(),keepBuildOpen=Boolean(state.optimiseFreeBuild),strictKeepBuild=keepBuildOpen&&optimiseFreeBuildMode()!=='unused-income';
  // A droid in the Upgrade Chip slot is producing, so it is claimed here, before
  // the unused-for-rebirth sell pass below. Picking afterwards meant the best
  // chip earner was sold for having no rebirth use and a weaker droid inherited
  // the slot, cutting chip output.
  const chipRateOf=unit=>upgradeChipRate(state.droids.find(x=>x.name===unit.name),unit.variant),chipPicks=new Set();
  for(const chipSlot of stationSlotIndices('UPGRADE_CHIP')){
    if(occupied.UPGRADE_CHIP.has(chipSlot))continue;
    const best=units.filter(unit=>{const key=`${unit.source}:${unit.unit}`;return !assigned.has(key)&&!lockedKeys.has(key)&&!chipPicks.has(key)&&chipRateOf(unit)>0}).sort((a,b)=>chipRateOf(b)-chipRateOf(a))[0];
    if(!best)break;
    chipPicks.add(`${best.source}:${best.unit}`);claim(best,'UPGRADE_CHIP',chipSlot);
  }
  // Companion slots are stocked before anything gets lounged or sold, so the
  // droid carrying the boost you asked for is not thrown away for earning little
  // — earning little is exactly why it is free to sit there. Preferred Iconics
  // come first, then one pick per chosen boost, cycling if you chose fewer boosts
  // than you have slots.
  const companionPicks=new Set(),companionKept=new Map(),freeCompanionSlots=stationSlotIndices('COMPANION').filter(slot=>!occupied.COMPANION.has(slot));
  if(freeCompanionSlots.length){
    const spare=()=>units.filter(u=>{const key=`${u.source}:${u.unit}`;return !assigned.has(key)&&!lockedKeys.has(key)&&!chipPicks.has(key)&&!companionPicks.has(key)});
    const queue=[...preferredCompanions()],goals=companionGoals();
    for(let i=0;queue.length<freeCompanionSlots.length&&i<freeCompanionSlots.length*2;i++)queue.push(goals[i%goals.length]);
    for(const slot of freeCompanionSlots){
      const want=queue.shift();
      if(!want)break;
      const goal=COMPANION_GOALS.find(g=>g.id===want);
      const pool=spare().filter(u=>goal?state.droids.find(d=>d.name===u.name)?.type===goal.type:u.name===want);
      // Best boost first; ties go to the lowest earner so the better earners stay
      // free for the credit stations.
      const best=pool.sort((a,b)=>{const da=state.droids.find(d=>d.name===a.name),db=state.droids.find(d=>d.name===b.name);
        return droidAttributeValue(db,b.variant)-droidAttributeValue(da,a.variant)||(da?.variants[a.variant]?.income||0)-(db?.variants[b.variant]?.income||0)})[0];
      if(!best)continue;
      const d=state.droids.find(x=>x.name===best.name);
      companionPicks.add(`${best.source}:${best.unit}`);
      companionKept.set(`${best.source}:${best.unit}`,goal?`Companion · ${goal.label.toLowerCase()} (${droidAttribute(d,best.variant)})`:'Companion · preferred pick');
      claim(best,'COMPANION',slot);
    }
  }
  // Mission slots are about mission time, not credits. R2-D2 comes back with two
  // rewards and CB-23 unlocks a mission nothing else can reach, so they take the
  // first two slots wherever they are free; then the other Astromech Iconics for
  // their mission times, then simply the best Astromechs you own.
  const missionPicks=new Set(),missionKept=new Map();
  const missionRank=unit=>{const d=state.droids.find(x=>x.name===unit.name);
    return unit.name==='R2-D2'?0:unit.name==='CB-23'?1:isIconic(d)?2:3};
  const missionWhy=['R2-D2 returns two rewards','CB-23 opens its own mission','Iconic · best mission times','Highest tier you own'];
  for(const slot of ASTROMECH_MISSION_SLOTS){
    if(!stationSlotIndices('ASTROMECH').includes(slot)||occupied.ASTROMECH.has(slot))continue;
    const pool=units.filter(u=>{const key=`${u.source}:${u.unit}`;
      return !assigned.has(key)&&!lockedKeys.has(key)&&!chipPicks.has(key)&&!companionPicks.has(key)&&!missionPicks.has(key)
        &&state.droids.find(d=>d.name===u.name)?.type==='ASTROMECH'});
    const best=pool.sort((a,b)=>{const da=state.droids.find(x=>x.name===a.name),db=state.droids.find(x=>x.name===b.name);
      return missionRank(a)-missionRank(b)||rarityRank(db)-rarityRank(da)||VARIANTS.indexOf(b.variant)-VARIANTS.indexOf(a.variant)
        ||(db?.variants[b.variant]?.income||0)-(da?.variants[a.variant]?.income||0)})[0];
    if(!best)break;
    missionPicks.add(`${best.source}:${best.unit}`);
    missionKept.set(`${best.source}:${best.unit}`,`Mission slot ${slot+1} · ${missionWhy[missionRank(best)]}`);
    claim(best,'ASTROMECH',slot);
  }
  for(const unit of units){
    const key=`${unit.source}:${unit.unit}`;
    if(assigned.has(key)||lockedKeys.has(key)||chipPicks.has(key)||companionPicks.has(key)||missionPicks.has(key))continue;
    const d=state.droids.find(x=>x.name===unit.name),cycleStatus=d?droidCycleStatus(d,unit.variant,bestFuture.get(unit.name)?.key===key):{kind:'unused'};
    if(cycleStatus.kind==='unused'&&!isIconic(d)){
      // You pressed Keep on this one in the plan, so it is stored rather than sold.
      if(spared.includes(key)){
        keptByHand.set(key,'Kept by you · you chose not to sell this one');
        candidates.push({unit,fallbacks:loungeLikeStations(),old:current.get(key),betterStorageOpen:false,kept:false,spared:true});
        continue;
      }
      // Not needed for a rebirth, but upgrading it could still complete Droidex
      // entries nothing else can reach. Keep one copy per droid, and only while
      // there is storage free — a Droidex entry is not worth an overflowing base.
      const gaps=state.optimiseKeepDroidex===false?[]:droidexGapsAbove(unit.name,unit.variant);
      if(gaps.length&&!droidexKeepers.has(unit.name)&&loungeLikeStations().some(station=>free(station)>=0)){
        droidexKeepers.set(unit.name,gaps);
        droidexKeptKeys.set(key,`Kept for Droidex · ${gaps.map(v=>variantText(v)).join(', ')} still missing`);
        candidates.push({unit,fallbacks:loungeLikeStations(),old:current.get(key),betterStorageOpen:false,kept:false});
        continue;
      }
      sell.push({...unit,sellReason:cycleStatus.label});continue;
    }
    const productiveFallback=d?.type?[d.type,...['WORKER','ASTROMECH','BATTLE'].filter(x=>x!==d.type)]:['WORKER','ASTROMECH','BATTLE'],fallbacks=[...loungeLikeStations(),'UPGRADE_CHIP',...(strictKeepBuild?[]:['BUILD']),...productiveFallback],old=current.get(key),betterStorageOpen=old?.station==='BUILD'&&(strictKeepBuild||['LOUNGE','COMPANION','UPGRADE_CHIP'].some(station=>free(station)>=0));
    candidates.push({unit,fallbacks,old,betterStorageOpen,kept:false})
  }
  if(strictKeepBuild)candidates.sort((a,b)=>optimiseStorageKeepScore(b)-optimiseStorageKeepScore(a));
  for(const item of candidates){
    if(item.kept)continue;
    const {unit,fallbacks,old,betterStorageOpen}=item;
    if(old&&fallbacks.includes(old.station)&&canKeep(old.station,old.slot)&&!betterStorageOpen){claim(unit,old.station,old.slot);item.kept=true}
  }
  for(const item of candidates){
    if(item.kept)continue;
    const {unit,fallbacks,old}=item;
    let station='',slot=-1;
    for(const fallback of fallbacks){if(fallback==='BUILD'&&old?.station!=='BUILD')continue;slot=free(fallback,old);if(slot>=0){claim(unit,fallback,slot);station=fallback;break}}
    if(!station){const d=state.droids.find(x=>x.name===unit.name);if(item.spared)overflow.push(unit);else if(strictKeepBuild&&!isIconic(d))sell.push({...unit,sellReason:`Sold to keep Build slots open · ${optimiseFreeBuildModeLabel(optimiseFreeBuildMode()).toLowerCase()} priority`});else overflow.push(unit)}
  }
  const stablePlaced=stabiliseProjectedPlacements(baseP,placed),rebirthPick=stablePlaced.reduce((map,x)=>{const previous=map.get(x.name),key=`${x.source}:${x.unit}`;if(!previous||VARIANTS.indexOf(x.variant)>VARIANTS.indexOf(previous.variant))map.set(x.name,{variant:x.variant,key});return map},new Map()),finalPlaced=[],finalSell=[...sell];
  // Upgrade Chip counts as producing here: a droid making chips is earning its
  // slot even with no rebirth use, so it is exempt from the unused sell pass.
  for(const x of stablePlaced){
    const key=`${x.source}:${x.unit}`,d=state.droids.find(y=>y.name===x.name),producing=PRODUCTIVE_STATIONS.includes(x.station)||x.station==='UPGRADE_CHIP',status=d?droidCycleStatus(d,x.variant,rebirthPick.get(x.name)?.key===key):{kind:'unused'};
    // Why a droid is being kept, so the plan can say Rebirth or Droidex rather
    // than leaving you to guess.
    const companionDetail=companionKept.get(key)||missionKept.get(key),handDetail=keptByHand.get(key),keepDetail=droidexKeptKeys.get(key);
    const reason=companionDetail?{keepReason:'companion',keepDetail:companionDetail}:handDetail?{keepReason:'manual',keepDetail:handDetail}:keepDetail?{keepReason:'droidex',keepDetail}:producing||status.kind!=='unused'?{keepReason:'rebirth',keepDetail:status.label}:{};
    const keep={...x,...reason,...(isBuilding(x)?{keepReason:'building',keepDetail:'Still being built · cannot be moved yet'}:{})};
    if(!producing&&status.kind==='unused'&&!isIconic(d)&&!x.lockedSlot&&!keepDetail&&!companionDetail&&!handDetail&&!isBuilding(x))finalSell.push({...x,sellReason:status.label});else finalPlaced.push(keep);
  }
  if(keepBuildOpen&&optimiseFreeBuildMode()==='unused-income')finalSell.sort((a,b)=>{const ad=state.droids.find(d=>d.name===a.name),bd=state.droids.find(d=>d.name===b.name);return(ad?.variants[a.variant]?.income||0)-(bd?.variants[b.variant]?.income||0)});
  const rows=optimisedRows(finalPlaced,overflow);
  return{placed:finalPlaced,overflow,sell:finalSell,rows}
}
async function applyOptimisedLayout(plan){
  if(state.sharedView&&!state.sharedView.canEdit)return toast('This shared profile is read only');
  const baseP=placements(),projected=optimisedPlacements(baseP,plan);
  // The same correction the preview makes. Without it, Apply wrote the guessed
  // slots and quietly undid what the map had just been showing.
  const steps=safeOptimiseStepPlan(baseP,projected);
  annotateLogSlots(steps);
  if(applyLoggedLandings(projected,steps))projected.rows=optimisedRows(projected.placed,projected.overflow);
  if(projected.sell.length&&!confirm(`Apply this layout and remove ${projected.sell.length} droid${projected.sell.length===1?'':'s'} from Sell?`))return;
  const previousOwned=state.owned;
  state.owned=projected.rows;
  clearOptimiseMarks();
  if(state.sharedView){
    save();
    try{
      await saveSharedProfileNow();
      location.hash='#/base';
      toast('Optimised layout applied and saved')
    }catch(error){
      state.owned=previousOwned;
      state.sharedView.profile.data=profileDataFromState();
      toast(`Optimised layout was not saved: ${error.message}`)
    }
    return
  }
  save();location.hash='#/base';toast('Optimised layout applied')
}
const unitName=x=>`${x.name} ${variantText(x.variant)}`;
// Selling and moving read alike at a glance, and mistaking one for the other
// costs you a droid, so the opening verb is colour-coded: red to sell, amber to
// shuffle into storage, green to put to work. Covers both planners' wording.
const STEP_VERB_TONE={Sell:'sell',Send:'stage',Move:'stage',Swap:'stage',Carry:'stage',Tell:'place',Make:'place',Put:'place'};
const stepTicked=text=>optimiseTickedSteps().includes(text);
function stepHtml(step,index){
  const d=state.droids.find(x=>x.name===step.unit?.name);
  const assumed=step.assumed?'<em class="step-assumed" title="More than one credit station was open, so which slot it takes depends on your base layout. Check this one.">check where it lands</em>':'';
  const tone=STEP_VERB_TONE[String(step.text||'').split(' ')[0]];
  const text=tone?String(step.text).replace(/^(\S+)/,`<b class="step-verb verb-${tone}">$1</b>`):step.text;
  const ticked=stepTicked(step.text);
  const tick=step.type==='note'?'':`<label class="step-tick" title="Mark this step as done"><input type="checkbox" data-step-tick="${escapeAttr(step.text)}" ${ticked?'checked':''}><span></span></label>`;
  // Sell steps can be waved off: the droid is spared and the plan recomputed.
  // unitName() returns markup, so it cannot go in an attribute — its quotes end
  // the attribute early and the rest spills onto the page as text.
  const skip=step.type==='sell'&&step.unit?`<button class="step-skip" data-skip-sell="${step.unit.source}:${step.unit.unit}" title="${escapeAttr(`Keep ${plainUnitName(step.unit)} and work out the plan again`)}">Keep</button>`:'';
  // Following a plan is the cheapest way to gather slot-choice data, so each
  // send-to-work step can record where the droid actually ended up.
  const free=step.freeSlots||[];
  const options=free.map(spot=>`<option value="${spot.station}:${spot.slot}" ${slotLogSame(step.logged,spot)?'selected':''}>${stationSlotLabel(spot.station,spot.slot)}</option>`).join('');
  const record=(step.kind==='work'||step.to==='LOUNGE')&&!state.sharedView&&slotLogTracking()&&slotLabAllowed()&&free.length
    ?`<label class="step-record"><small>Landed in?</small><select data-log-step="${escapeAttr(step.text)}"><option value="">${free.length} it could take…</option>${options}</select></label>`
    :'';
  return `${tick}<span class="step-thumb">${d?picture(d,step.unit.variant):''}</span><span class="step-text">${text}${assumed}</span>${record}${skip}`;
}
function normaliseProjectedForSteps(baseP,projected){const keyOf=x=>`${x.source}:${x.unit}`,groupOf=x=>`${x.name}:${x.variant}`,cloneRows=rows=>rows.map(x=>({...x})),placed=cloneRows(projected.placed),sell=cloneRows(projected.sell),overflow=cloneRows(projected.overflow);for(const group of [...new Set([...placed,...sell].map(groupOf))]){const current=baseP.placed.filter(x=>groupOf(x)===group),targets=placed.filter(x=>groupOf(x)===group),sells=sell.filter(x=>groupOf(x)===group);if(current.length<2||!sells.length)continue;const used=new Set(),take=picker=>{const row=current.find(x=>!used.has(keyOf(x))&&picker(x));if(row)used.add(keyOf(row));return row};for(const target of targets){const exact=take(x=>x.station===target.station&&x.slot===target.slot),sameStation=exact||take(x=>x.station===target.station),any=sameStation||take(()=>true);if(any){target.source=any.source;target.unit=any.unit}}for(const sold of sells){const any=take(()=>true);if(any){sold.source=any.source;sold.unit=any.unit}}}return{...projected,placed,sell,overflow}}

// ─── Route-aware step planner ───────────────────────────────────────────────
// In game you walk to the DROID and issue a command; the droid then routes
// itself to a slot. A step's travel cost is therefore where the droid currently
// stands, not where it ends up — so commands are grouped by source station and
// the visit order is searched for the fewest trips around the base.
//
// The command vocabulary is everything the game actually offers:
//   Work      — auto-routes: own type first, else the nearest credit slot,
//               Upgrade Chip last. Greyed out when no credit/chip slot is free.
//   Lounge    — its own option; never an auto-route destination.
//   Companion — swaps when the companion slots are full.
//   Sell
// Build slots are swap-only and optimisedPlacements never routes a droid *into*
// Build (see the BUILD guard in its fallback loop), so Build is exit-only here.
const escapeAttr=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// unitName() is markup for display; this is the same thing as plain text, for
// tooltips and anywhere else that must not contain tags.
const plainUnitName=x=>`${x.name} ${variantLabel(x.variant)}`;
// Ticking steps off is purely a visual aid, but a plan can take a few minutes to
// work through, so the ticks survive a reload. Keyed on the step wording, so
// they fall away by themselves once the plan changes.
const readList=key=>{try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v:[]}catch(e){return[]}};
const writeList=(key,list)=>{try{localStorage.setItem(key,JSON.stringify(list))}catch(e){}};
const optimiseTickedSteps=()=>readList('droid-archive-optimise-ticked');
const toggleTickedStep=text=>{const list=optimiseTickedSteps(),i=list.indexOf(text);i>=0?list.splice(i,1):list.push(text);writeList('droid-archive-optimise-ticked',list)};
// Droids you have told Optimise to spare. Cleared when a layout is applied,
// since the keys are positions in the roster and those shift.
const sparedFromSelling=()=>readList('droid-archive-optimise-spared');
const spareFromSelling=key=>{const list=sparedFromSelling();if(!list.includes(key))list.push(key);writeList('droid-archive-optimise-spared',list)};
const clearOptimiseMarks=()=>{slotLogSession.clear();writeList('droid-archive-optimise-spared',[]);writeList('droid-archive-optimise-ticked',[])};
const ROSTER='ROSTER',SOLD='SOLD';
const WORK_STATIONS=[...PRODUCTIVE_STATIONS,'UPGRADE_CHIP'];
const stagingStations=()=>loungeLikeStations();
// Where a droid goes when it cannot reach its own type of slot. Measured: a
// Worker droid took Battle over Astromech all three times it was offered both,
// whichever slots were free, so this is a station order rather than a per-slot
// distance. Steps that lean on it are still flagged in the plan.
const NEAREST_ORDER=['WORKER','BATTLE','ASTROMECH'];
// What happens when you tell a droid that is already working to work again.
// Confirmed in game: with its own station full, the droid leaves and takes a
// slot elsewhere, so the slot it is vacating still counts as occupied while the
// game picks a destination. That is 'reroute', and it lets a droid move straight
// between stations instead of being parked in the Lounge first.
//   'stage' is the opposite reading - the vacated slot frees up in time, so
// auto-route puts the droid straight back and relocating needs a detour. Kept
// only as a fallback; it produces longer plans that work under either reading.
const AUTO_ROUTE_MODEL='reroute';
// The exact search is worth it for an ordinary tidy-up but has no chance on a
// wholesale reshuffle, where it would only burn its budget before handing over
// to greedy() anyway — so past this many droids we skip straight to greedy.
const ROUTE_SEARCH_LIMIT=60000,ROUTE_SEARCH_MS=60,ROUTE_SEARCH_MAX_DROIDS=16;
// The middle of each station's slots on the map, used to order the walk. Build
// is spread across three rooms — slot 1 by the Worker ring, slot 2 in the
// Astromech room, slot 3 in the Battle room — so its centre sits between them
// and it is never far from wherever you already are.
const STATION_CENTRES=(()=>{
  const out={},add=(station,list)=>{if(!list||!list.length)return;
    const seen=out[station]||(out[station]=[0,0,0]);
    for(const[x,y]of list){seen[0]+=x;seen[1]+=y;seen[2]++}};
  for(const floor of MAP_FLOORS){
    const spots=MAP_SPOTS[floor]||{};
    add('WORKER',spots.WORKER);add('ASTROMECH',spots.ASTROMECH);add('BATTLE',spots.BATTLE);
    add('BUILD',spots.BUILD);add('UPGRADE_CHIP',spots.UPGRADE_CHIP);
    add('LOUNGE',spots.LOUNGE);add('LOUNGE',spots.LOUNGE_REBIRTH);add('LOUNGE',spots.LOUNGE_NOVA);
  }
  // The Companion slots are on you, not on the map, so treat them as reachable
  // from anywhere rather than pretending they sit somewhere in particular.
  return Object.fromEntries(Object.entries(out).map(([k,[x,y,n]])=>[k,[x/n,y/n]]));
})();
const stationGap=(a,b)=>{
  const p=STATION_CENTRES[a],q=STATION_CENTRES[b];
  return p&&q?Math.hypot(p[0]-q[0],p[1]-q[1]):0;
};
const placeName=station=>station===ROSTER?'Roster':stationName(station);

function optimiseRoutePlan(baseP,rawProjected){
  const projected=normaliseProjectedForSteps(baseP,rawProjected),keyOf=x=>`${x.source}:${x.unit}`;
  const units=new Map([...baseP.placed,...projected.placed,...projected.sell,...projected.overflow].map(x=>[keyOf(x),x]));
  const startAt=new Map([...units.keys()].map(key=>[key,ROSTER]));
  for(const x of baseP.placed)startAt.set(keyOf(x),x.station);
  const goalSlotAt=new Map(projected.placed.map(x=>[keyOf(x),x.slot])),startSlotAt=new Map(baseP.placed.map(x=>[keyOf(x),x.slot]));
  const goalAt=new Map(projected.placed.map(x=>[keyOf(x),x.station])),sellKeys=new Set(projected.sell.map(keyOf)),lockedKeys=new Set(baseP.placed.filter(x=>x.lockedSlot).map(keyOf));
  const capacityOf=Object.fromEntries(Object.keys(SLOT_RULES).map(type=>[type,stationSlotIndices(type).length]));
  // Only droids that actually need a command are tracked. Everything else holds
  // its slot for the whole plan, so its occupancy is a constant.
  const tracked=[...units.keys()].filter(key=>{
    if(lockedKeys.has(key))return false;
    if(sellKeys.has(key))return true;
    const goal=goalAt.get(key),start=startAt.get(key);
    if(goal==='BUILD'&&start!=='BUILD'){console.warn('Optimise: no command can move a droid into Build',key);return false}
    return Boolean(goal)&&goal!==start;
  });
  const trackedSet=new Set(tracked),staticOccupancy={};
  for(const [key,station] of startAt)if(!trackedSet.has(key)&&station!==ROSTER)staticOccupancy[station]=(staticOccupancy[station]||0)+1;
  const nativeOf=key=>state.droids.find(d=>d.name===units.get(key)?.name)?.type||'';
  const natives=tracked.map(nativeOf),goals=tracked.map(key=>goalAt.get(key)),sells=tracked.map(key=>sellKeys.has(key));
  const startState=tracked.map(key=>startAt.get(key));

  const countsFor=st=>{const counts={...staticOccupancy};for(const pos of st)if(pos&&pos!==SOLD&&pos!==ROSTER)counts[pos]=(counts[pos]||0)+1;return counts};
  // Whether the slot being vacated frees up in time to be chosen again is the
  // whole difference between the two auto-route models above.
  const roomIn=(station,counts,pos)=>((counts[station]||0)-(AUTO_ROUTE_MODEL==='stage'&&pos===station?1:0))<(capacityOf[station]||0);
  // The game's auto-route: own type first, else nearest credit slot, Upgrade
  // Chip last. `assumed` marks the case where more than one credit station was
  // open and NEAREST_ORDER had to break the tie.
  const landing=(i,st,counts)=>{
    const native=natives[i],pos=st[i];
    if(PRODUCTIVE_STATIONS.includes(native)&&roomIn(native,counts,pos))return{to:native,assumed:false};
    const open=NEAREST_ORDER.filter(station=>roomIn(station,counts,pos));
    if(open.length)return{to:open[0],assumed:open.length>1};
    return roomIn('UPGRADE_CHIP',counts,pos)?{to:'UPGRADE_CHIP',assumed:false}:null;
  };
  const satisfied=(i,st)=>sells[i]?st[i]===SOLD:st[i]===goals[i];
  const allDone=st=>{for(let i=0;i<st.length;i++)if(!satisfied(i,st))return false;return true};
  // Is anyone else still waiting on the slot this droid is sitting in?
  const wantedByAnother=(self,station,st)=>{
    for(let j=0;j<st.length;j++)if(j!==self&&goals[j]===station&&st[j]!==station&&!satisfied(j,st))return true;
    return false;
  };
  // Commands you can issue right now, standing at `here`. Roster droids are not
  // in the base, so they are reachable from anywhere.
  const actionsFor=(i,st,here,counts,allowPlace)=>{
    if(satisfied(i,st))return[];
    const pos=st[i];
    if(pos!==here&&pos!==ROSTER)return[];
    if(sells[i])return[{i,kind:'sell',to:SOLD,assumed:false}];
    const goal=goals[i];
    if(goal==='LOUNGE')return roomIn('LOUNGE',counts,pos)?[{i,kind:'lounge',to:'LOUNGE',assumed:false}]:[];
    if(goal==='COMPANION')return roomIn('COMPANION',counts,pos)?[{i,kind:'companion',to:'COMPANION',assumed:false}]:[];
    if(!WORK_STATIONS.includes(goal))return[];
    if(AUTO_ROUTE_MODEL==='reroute'||!PRODUCTIVE_STATIONS.includes(pos)){
      const land=landing(i,st,counts);
      if(land&&land.to===goal)return[{i,kind:'work',to:goal,assumed:land.assumed}];
    }
    // Auto-route would drop it somewhere else. Stepping aside out of a credit slot
    // is the way round that. Out of a storage slot it only earns its step if
    // someone else is waiting on that slot — but then it is essential, because two
    // droids swapping through the Companion and Upgrade Chip slots each hold what
    // the other one wants, and without this neither may move and the plan gives up.
    const moves=[];
    if(pos!==ROSTER&&pos!==SOLD&&(PRODUCTIVE_STATIONS.includes(pos)||wantedByAnother(i,pos,st)))
      moves.push(...stagingStations().filter(station=>station!==pos&&station!==goal&&roomIn(station,counts,pos)).map(station=>({i,kind:'stage',to:station,assumed:false})));
    // Nothing auto-route does gets it there. Usually that is because its own type
    // of station still has a free slot, so "go to work" would only send it back —
    // and freeing more credit slots makes that worse, not better. Carrying it over
    // by hand always works, so offer that rather than give up. Second pass only, so
    // any plan that needs no hand-placing is still found first.
    if(allowPlace&&roomIn(goal,counts,pos))moves.push({i,kind:'place',to:goal,assumed:false});
    return moves;
  };
  const stationsWithWork=(st,here)=>{const set=new Set();for(let i=0;i<st.length;i++){if(satisfied(i,st))continue;const pos=st[i];if(pos===ROSTER||pos===SOLD||pos===here)continue;set.add(pos)}return set};

  // Trips are the only cost, so this is A* over (droid positions, where you are
  // standing): issuing a command is free, walking to another station costs one.
  // The heuristic — how many other stations still hold work — never overshoots,
  // so the first complete plan found uses the fewest possible trips. Plans that
  // lean on the NEAREST_ORDER guess are held back behind clean ones at the same
  // cost. Big shuffles can outrun the budget, in which case greedy() takes over.
  const search=allowPlace=>{
    const clean=[],dirty=[],seen=new Map(),started=Date.now();
    const push=node=>{const f=node.g+stationsWithWork(node.st,node.here).size,into=node.assumed?dirty:clean;(into[f]||(into[f]=[])).push(node)};
    push({st:startState,here:null,g:0,assumed:0,parent:null,action:null});
    seen.set(startState.join('|')+'@null',0);
    let f=0,expansions=0;
    while(f<Math.max(clean.length,dirty.length)){
      const bucket=(clean[f]&&clean[f].length)?clean[f]:dirty[f];
      if(!bucket||!bucket.length){f++;continue}
      const node=bucket.pop();
      if(++expansions>ROUTE_SEARCH_LIMIT)return null;
      if(!(expansions&7)&&Date.now()-started>ROUTE_SEARCH_MS)return null;
      if(seen.get(node.st.join('|')+'@'+node.here)<node.g)continue;
      if(allDone(node.st))return node;
      const counts=countsFor(node.st);
      for(let i=0;i<node.st.length;i++)for(const action of actionsFor(i,node.st,node.here,counts,allowPlace)){
        const st=node.st.slice();st[action.i]=action.to;
        const childKey=st.join('|')+'@'+node.here;
        if(seen.has(childKey)&&seen.get(childKey)<=node.g)continue;
        seen.set(childKey,node.g);
        push({st,here:node.here,g:node.g,assumed:node.assumed+(action.assumed?1:0),parent:node,action});
      }
      for(const station of[...stationsWithWork(node.st,node.here)].sort((a,b)=>stationGap(node.here,b)-stationGap(node.here,a))){
        const childKey=node.st.join('|')+'@'+station;
        if(seen.has(childKey)&&seen.get(childKey)<=node.g+1)continue;
        seen.set(childKey,node.g+1);
        push({st:node.st,here:station,g:node.g+1,assumed:node.assumed,parent:node,action:{kind:'travel',to:station}});
      }
    }
    return null;
  };
  // Used when the search outruns its budget on a big shuffle. Same rules, but it
  // just clears whichever station has the most to do, finishing droids off in
  // preference to staging more of them so the Lounge cannot silt up.
  const rank={sell:0,work:1,lounge:2,companion:2,stage:3,place:4};
  const greedy=allowPlace=>{
    // Stepping the same droid aside twice never gets it closer to its goal, and
    // with storage slots able to stage into each other it would let a droid
    // shuttle between the Lounge and the Companion slot forever. One each.
    let st=startState.slice(),here=null;const trail=[],staged=new Set();
    const movesFor=(i,st,at,counts)=>actionsFor(i,st,at,counts,allowPlace).filter(a=>a.kind!=='stage'||!staged.has(a.i));
    for(let guard=0;guard<800&&!allDone(st);guard++){
      for(let acted=true;acted;){
        acted=false;
        const counts=countsFor(st);let best=null;
        for(let i=0;i<st.length;i++)for(const action of movesFor(i,st,here,counts))if(!best||rank[action.kind]<rank[best.kind])best=action;
        if(best){st=st.slice();st[best.i]=best.to;trail.push(best);if(best.kind==='stage')staged.add(best.i);acted=true}
      }
      if(allDone(st))break;
      const options=[...stationsWithWork(st,here)];
      if(!options.length)break;
      const workAt=station=>{const counts=countsFor(st);let n=0;for(let i=0;i<st.length;i++)if(movesFor(i,st,station,counts).length)n++;return n};
      const scored=options.map(station=>[station,workAt(station)]).sort((a,b)=>b[1]-a[1]||stationGap(here,a[0])-stationGap(here,b[0]));
      here=scored[0][0];
      trail.push({kind:'travel',to:here});
    }
    return{trail,complete:allDone(st)};
  };

  const trailOf=node=>{const out=[];for(;node&&node.action;node=node.parent)out.unshift(node.action);return out};
  const plan=allowPlace=>{
    const node=tracked.length<=ROUTE_SEARCH_MAX_DROIDS?search(allowPlace):null;
    return node?{trail:trailOf(node),complete:true}:greedy(allowPlace);
  };
  // A plan made only of commands the game itself would carry out is the good one,
  // so that is tried first. Only if no such plan exists is hand-placing allowed.
  let{trail,complete}=plan(false);
  if(!complete){const retry=plan(true);if(retry.complete)({trail,complete}=retry)}

  // Battle runs over two floors, so "a Battle slot" is not enough to walk to.
  const toFloor=action=>floorNote(action.to,goalSlotAt.get(tracked[action.i]));
  const fromFloor=(action,from)=>floorNote(from,startSlotAt.get(tracked[action.i]));
  const toSlot=action=>{const slot=goalSlotAt.get(tracked[action.i]);return Number.isInteger(slot)?` ${slot+1}`:''};
  const describe=(action,unit,from)=>{
    const name=unitName(unit);
    if(action.kind==='sell')return{type:'sell',text:from===ROSTER?`Sell ${name}.`:`Sell ${name} from ${placeName(from)}${fromFloor(action,from)}.`};
    if(action.kind==='work')return{type:'move',text:`Tell ${name} to go to work — it will take a ${placeName(action.to)}${toFloor(action)} slot.`};
    if(action.kind==='place')return{type:'move',text:`Swap ${name} into ${placeName(action.to)}${toSlot(action)}${toFloor(action)} — make it your companion, then swap it with whoever is in that slot. If the slot is still empty, let it fill first; a swap needs somebody to swap with, and sending ${name} to work would put it somewhere else.`};
    if(action.kind==='lounge')return{type:'move',text:`Send ${name} to the Lounge.`};
    if(action.kind==='companion')return{type:'move',text:`Make ${name} your companion.`};
    if(action.to==='COMPANION')return{type:'move',text:`Make ${name} your companion to free its ${placeName(from)}${fromFloor(action,from)} slot — you will put it to work from there.`};
    return{type:'move',text:`Send ${name} to the Lounge to free its ${placeName(from)}${fromFloor(action,from)} slot — you will put it to work from there.`};
  };
  const steps=[];let st=startState.slice(),here=null,visit=0;
  for(const action of trail){
    if(action.kind==='travel'){here=action.to;visit++;continue}
    const from=st[action.i],unit=units.get(tracked[action.i]);
    // The log needs to know where this droid started and which station it is
    // heading for; describe() only produces prose.
    steps.push({...describe(action,unit,from),unit,at:here??from,visit,assumed:Boolean(action.assumed),
      kind:action.kind,from,fromSlot:startSlotAt.get(tracked[action.i]),to:action.to});
    st[action.i]=action.to;
  }
  if(!complete){
    const stuck=tracked.filter((key,i)=>!satisfied(i,st)).map(key=>unitName(units.get(key)));
    steps.push({type:'note',unit:null,at:here??ROSTER,visit,assumed:false,
      text:`Could not route ${stuck.slice(0,4).join(', ')}${stuck.length>4?` and ${stuck.length-4} more`:''} automatically — move them by hand and reopen Optimise.`});
  }
  return steps;
}
// Consecutive steps issued at the same station are one stop on the walk round.
function optimiseVisits(steps){
  const visits=[];
  for(const step of steps){
    const last=visits[visits.length-1];
    if(last&&last.at===step.at&&last.visit===step.visit)last.steps.push(step);
    else visits.push({at:step.at,visit:step.visit,steps:[step]});
  }
  return visits;
}
// ─── Classic slot-by-slot planner ─────────────────────────────────
// The original planner, kept because some players prefer being told the exact
// slot to move into rather than being walked round the base. It shares the same
// target layout as optimiseRoutePlan, so the Upgrade Chip pick applies to both.
const stationLabel=station=>station?`${station[0]+station.slice(1).toLowerCase()} station`:'roster';
const slotLabel=p=>p?`${p.station} ${p.slot+1}${floorNote(p.station,p.slot)}`:'Roster';
const sameDroidVariant=(a,b)=>a?.name===b?.name&&a?.variant===b?.variant;
const sameSlot=(a,b)=>a?.station===b?.station&&a?.slot===b?.slot;
function cleanOptimiseSteps(steps){const cleaned=[...steps];const stationOrder=['WORKER','ASTROMECH','BATTLE','BUILD','LOUNGE','COMPANION','UPGRADE_CHIP','BLUEPRINT'];return cleaned.map((step,index)=>({...step,index})).filter(step=>!(step.type==='move'&&step.to?.station==='BUILD')&&!(step.type==='move'&&step.from?.station===step.to?.station)&&!(step.type==='swap'&&step.from?.station===step.withFrom?.station)).sort((a,b)=>a.type==='sell'&&b.type==='sell'?(stationOrder.indexOf(a.from?.station)-stationOrder.indexOf(b.from?.station))||((a.from?.slot??0)-(b.from?.slot??0))||a.index-b.index:a.type==='sell'?-1:b.type==='sell'?1:a.index-b.index)}
function optimiseStepPlan(baseP,rawProjected){const projected=normaliseProjectedForSteps(baseP,rawProjected),keyOf=x=>`${x.source}:${x.unit}`,slotKey=p=>p?`${p.station}:${p.slot}`:'',all=[...baseP.placed,...projected.placed,...projected.sell,...projected.overflow],units=new Map(all.map(x=>[keyOf(x),x])),positions=new Map(baseP.placed.map(x=>[keyOf(x),{station:x.station,slot:x.slot}])),slotOwner=new Map(baseP.placed.map(x=>[`${x.station}:${x.slot}`,keyOf(x)])),goals=new Map(projected.placed.map(x=>[keyOf(x),{station:x.station,slot:x.slot}])),steps=[];for(const sold of projected.sell){const key=keyOf(sold),pos=positions.get(key);if(pos){steps.push({type:'sell',unit:sold,from:pos,text:`Sell ${unitName(sold)} in ${stationLabel(pos.station)}.`});slotOwner.delete(slotKey(pos));positions.delete(key)}else steps.push({type:'sell',unit:sold,text:`Sell ${unitName(sold)}.`})}
// You can never pick the slot. You tell a droid to go to work and the game takes
// the free slot nearest to where it was standing, so a step naming a slot is a
// prediction rather than an instruction. When the plan needs one exact slot the
// only way in is fill-then-swap: let the slot fill, make the droid your companion,
// and swap it with whoever ended up there. Swapping needs an occupant, which is
// why the slot has to fill first.
const autoRouteLanding=(station,origin)=>slotFillOrder(station,origin).find(slot=>!slotOwner.has(`${station}:${slot}`));
const placeText=(unit,pos,goal)=>{
  const name=unitName(unit),landing=autoRouteLanding(goal.station,pos);
  if(landing===goal.slot)return `Tell ${name} in ${slotLabel(pos)} to go to work — it will take ${slotLabel(goal)}.`;
  const instead=landing===undefined?'a slot in another station':slotLabel({station:goal.station,slot:landing});
  return `Put ${name} in ${slotLabel(goal)}: let that slot fill, then make ${name} your companion and swap the two. Sending it to work from ${slotLabel(pos)} would put it in ${instead} instead.`;
};
const swapText=(unit,pos,other,otherPos)=>`Swap ${unitName(unit)} in ${slotLabel(pos)} with ${unitName(other)} in ${slotLabel(otherPos)} — make ${unitName(unit)} your companion, then swap it with ${unitName(other)}. Sending it to work would put it somewhere else.`;
const correct=(key,pos=positions.get(key),goal=goals.get(key))=>pos&&goal&&pos.station===goal.station&&pos.slot===goal.slot,unitType=key=>state.droids.find(d=>d.name===units.get(key)?.name)?.type,nativeSlotOpen=type=>['WORKER','ASTROMECH','BATTLE'].includes(type)&&stationSlotIndices(type).some(slot=>!slotOwner.has(`${type}:${slot}`)),goalOwner=pos=>pos?[...goals].find(([,goal])=>goal.station===pos.station&&goal.slot===pos.slot)?.[0]:null,autoRouteSafe=(key,goal,pos=positions.get(key))=>{const type=unitType(key);return !goal||!['WORKER','ASTROMECH','BATTLE'].includes(goal.station)||goal.station===type||pos?.station!==type&&!nativeSlotOpen(type)};for(let guard=0;guard<80;guard++){const unsafeSwap=[...goals].find(([key,goal])=>{const pos=positions.get(key);if(!pos||correct(key,pos,goal)||slotOwner.has(slotKey(goal))||autoRouteSafe(key,goal,pos))return false;const blocker=goalOwner(pos);return blocker&&blocker!==key&&positions.has(blocker)&&!correct(blocker)});if(unsafeSwap){const [key]=unsafeSwap,unit=units.get(key),pos=positions.get(key),blockerKey=goalOwner(pos),blocker=units.get(blockerKey),blockerPos=positions.get(blockerKey);if(!sameDroidVariant(unit,blocker))steps.push({type:'swap',unit,from:pos,withUnit:blocker,withFrom:blockerPos,text:swapText(unit,pos,blocker,blockerPos)});slotOwner.set(slotKey(pos),blockerKey);positions.set(blockerKey,pos);slotOwner.set(slotKey(blockerPos),key);positions.set(key,blockerPos);continue}const candidates=[...goals].filter(([key,goal])=>positions.has(key)&&!correct(key)&&!slotOwner.has(slotKey(goal))),movable=candidates.find(([key,goal])=>goal.station===unitType(key))||candidates.find(([key,goal])=>autoRouteSafe(key,goal));if(!movable)break;const [key,goal]=movable,unit=units.get(key),pos=positions.get(key);steps.push({type:'move',unit,from:pos,to:goal,text:placeText(unit,pos,goal)});slotOwner.delete(slotKey(pos));slotOwner.set(slotKey(goal),key);positions.set(key,goal)}for(let guard=0;guard<80;guard++){const start=[...goals].find(([key])=>positions.has(key)&&!correct(key));if(!start)break;let [key]=start;for(let cycleGuard=0;cycleGuard<40&&!correct(key);cycleGuard++){const unit=units.get(key),pos=positions.get(key),goal=goals.get(key),targetKey=slotOwner.get(slotKey(goal));if(!targetKey||targetKey===key)break;const target=units.get(targetKey);if(!sameDroidVariant(unit,target))steps.push({type:'swap',unit,from:pos,withUnit:target,withFrom:goal,text:swapText(unit,pos,target,goal)});slotOwner.set(slotKey(pos),targetKey);positions.set(targetKey,pos);slotOwner.set(slotKey(goal),key);positions.set(key,goal);key=targetKey}}return cleanOptimiseSteps(steps)}
const slotStationName=station=>`${station[0]+station.slice(1).toLowerCase()} station`;
const sameOwnedUnit=(a,b)=>a?.source===b?.source&&a?.unit===b?.unit;
const cleanOptimiseStepsBySlot=cleanOptimiseSteps;
cleanOptimiseSteps=steps=>{
  const cleaned=cleanOptimiseStepsBySlot(steps),conversions=[];
  for(let i=0;i<cleaned.length;i++){
    const swap=cleaned[i];
    if(swap.type!=='swap'||!swap.from||!swap.withFrom)continue;
    const fromBuild=swap.from.station==='BUILD',withBuild=swap.withFrom.station==='BUILD';
    if(fromBuild===withBuild)continue;
    const productiveUnit=fromBuild?swap.withUnit:swap.unit;
    const productiveFrom=fromBuild?swap.withFrom:swap.from;
    const buildUnit=fromBuild?swap.unit:swap.withUnit;
    const buildFrom=fromBuild?swap.from:swap.withFrom;
    const laterIndex=cleaned.findIndex((candidate,index)=>index>i&&candidate.type==='move'&&sameOwnedUnit(candidate.unit,productiveUnit)&&sameSlot(candidate.from,buildFrom)&&candidate.to?.station!=='BUILD');
    if(laterIndex<0)continue;
    conversions.push({swapIndex:i,laterIndex,productiveUnit,productiveFrom,buildUnit,buildFrom,target:cleaned[laterIndex].to});
  }
  if(!conversions.length)return cleaned;
  const first=Math.min(...conversions.map(x=>x.swapIndex)),last=Math.max(...conversions.map(x=>x.laterIndex)),used=new Set(conversions.flatMap(x=>[x.swapIndex,x.laterIndex]));
  if(cleaned.slice(first,last+1).some((_,offset)=>!used.has(first+offset)))return cleaned;
  const evacuations=conversions.map(x=>({type:'move',unit:x.productiveUnit,from:x.productiveFrom,to:x.target,text:`Put ${unitName(x.productiveUnit)} to work from ${slotStationName(x.productiveFrom.station)}; it will fill an empty ${x.target.station[0]+x.target.station.slice(1).toLowerCase()} slot.`}));
  const fills=conversions.map(x=>({type:'move',unit:x.buildUnit,from:x.buildFrom,to:x.productiveFrom,text:`Put ${unitName(x.buildUnit)} to work from Build; it will fill an empty ${x.productiveFrom.station[0]+x.productiveFrom.station.slice(1).toLowerCase()} slot.`}));
  return [...cleaned.slice(0,first),...evacuations,...fills,...cleaned.slice(last+1)];
};
// Which step style to show. Device-local like the other Optimise view prefs, not
// profile data — it changes how the same plan is presented, not the plan itself.
const OPTIMISE_STEP_STYLES=["route","classic"];
// Falls back to the default rather than throwing: without this a blocked or
// missing localStorage would trip safeOptimiseStepPlan's catch and drop the
// entire step list instead of just the preference.
const optimiseStepStyle=()=>{try{const saved=localStorage.getItem("droid-archive-optimise-step-style");return OPTIMISE_STEP_STYLES.includes(saved)?saved:"route"}catch(e){return"route"}};
// The Sell list and the step plan have to agree. Marking a card "going to
// Fusion" while the walkthrough still says "Sell it" is worse than saying
// nothing, so the sell steps for droids the chain claims are rewritten, and the
// fusions themselves are added after them.
function withFusionSteps(steps,projected){
  if(state.optimiseFuseFirst===false)return steps;
  const chain=fusionChainFromSpares(projected?.sell,projected?.placed);
  if(!chain.length)return steps;
  const owed=new Map();
  for(const step of chain)for(const part of step.spend){
    const key=`${part.name}|${part.variant}`;
    owed.set(key,(owed.get(key)||0)+part.count);
  }
  const out=steps.map(step=>{
    if(step.type!=='sell'||!step.unit)return step;
    const key=`${step.unit.name}|${step.unit.variant}`,left=owed.get(key)||0;
    if(left<=0)return step;
    owed.set(key,left-1);
    // Keep the origin the sell step worked out; only the destination changes.
    return {...step,type:'fuse-in',kind:'fuse-in',
      text:`${step.text.replace(/^Sell /,'Send ').replace(/\.\s*$/,'')} to the Fusion room instead of selling.`};
  });
  chain.forEach(step=>{
    const spend=step.spend.map(part=>`${part.count} \u00d7 ${part.name} ${variantLabel(part.variant)}`).join(' + ');
    const makes=step.out?`${step.out.name} ${variantLabel(step.out.variant)}`:`a ${rarityLabel(step.rarity)} droid at ${variantLabel(step.variant)}`;
    const why=step.fills?' It is a Droidex square you do not have.':step.gain>0?` It out-earns the weakest droid working, by about ${fmt(step.gain*3600)}/hr.`:'';
    const waits=step.after.length?' Do this one after the fusion above, which makes the copy it needs.':'';
    const roll=step.sure?'':' Which droid arrives is a roll.';
    out.push({type:'fuse',kind:'fuse',unit:step.out?{name:step.out.name,variant:step.out.variant}:null,
      text:`Fuse ${spend}. This makes ${makes}.${why}${roll}${waits}`});
  });
  return out;
}
function safeOptimiseStepPlan(baseP,projected){try{return withFusionSteps(optimiseStepStyle()==="classic"?optimiseStepPlan(baseP,projected):optimiseRoutePlan(baseP,projected),projected)}catch(e){console.warn("Optimise step plan unavailable",e);return[]}}
function critCalcPage(){
  const render=()=>{
    const placed=placements().placed;
    const autoAstro=companionAstromechBonus(placed),autoChopper=placed.some(x=>x.station==='COMPANION'&&x.name==='CHOPPER');
    const masteryFloor=pickaxeMasteryLevels();
    // The three perk levels are the real Nova Shop values, edited in place, so
    // this and the Nova Shop page never disagree. Only the pickaxe, companion
    // and Chopper inputs are local to the calculator.
    const current={
      chanceLevel:novaLevelFor(CRIT_UPGRADE_IDS.chance),
      amountLevel:novaLevelFor(CRIT_UPGRADE_IDS.amount),
      multiLevel:novaLevelFor(CRIT_UPGRADE_IDS.multi),
      chopper:Boolean(critSetting('chopper',autoChopper?1:0)),
      pickaxe:critSetting('pickaxe',masteryFloor),
      // Read straight off the Base rather than typed in — whatever Astromech is
      // in your Companion slot is the answer.
      astromech:autoAstro,
    };
    // What each perk has cost you so far, and what the next rank adds.
    const spent=id=>{const u=novaUpgrade(id);return(u?.levels||[]).filter(l=>Number(l.level)<=novaLevelFor(id)).reduce((s,l)=>s+(l.cost||0),0)};
    const totalSpent=Object.values(CRIT_UPGRADE_IDS).reduce((s,id)=>s+spent(id),0);
    const p=critProfile(current),options=critUpgradeOptions(current),best=options.find(o=>!o.locked);
    // Rebirth crit perks are not bought, so they are shown as a read-out beside
    // the Nova levels rather than as another thing to step up and down.
    const rebirthBonus=rebirthCritBonus(),nextCritPerk=rebirthCritPerks({after:state.rebirth})[0];
    const num=(id,label,value,max,hint)=>`<label class="crit-field"><span>${label}</span><input type="number" id="${id}" value="${value}" min="0" ${max?`max="${max}"`:''} step="1"><small>${hint}</small></label>`;
    // Nova perks get plus and minus buttons so levels can be pushed from here
    // rather than switching to the Nova Shop and back.
    const perk=(id,key,label,level,detail)=>{
      const max=novaMaxLevel(id),next=level<max?novaLevelCost(id,level+1):null;
      return `<div class="crit-field crit-perk"><span>${label}</span><div class="crit-step"><button class="btn secondary" data-perk-down="${id}" ${level<=0?'disabled':''}>−</button><input type="number" id="${key}" value="${level}" min="0" max="${max}" step="1"><button class="btn secondary" data-perk-up="${id}" ${level>=max?'disabled':''}>+</button></div><small>${detail} · level ${level}/${max}</small><small class="crit-cost">Spent ${fmt(spent(id))} Nova${next?` · next rank ${fmt(next)}`:' · maxed'}</small></div>`;
    };
    app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / Critical Calculator</div>
      <div class="base-heading"><div><p class="eyebrow">Pickaxe planner</p><h1>Critical Calculator</h1><p class="lead">What your pickaxe removes per swing, and which Nova crit upgrade is the best next buy.</p></div><button class="btn secondary" id="critReset">Reset to my Nova levels</button></div>
      <section class="crit-inputs">
        ${perk(CRIT_UPGRADE_IDS.chance,'critChance','Critical Chance',current.chanceLevel,`now ${(p.chance*100).toFixed(0)}% chance`)}
        ${perk(CRIT_UPGRADE_IDS.amount,'critAmount','Critical Amount',current.amountLevel,`crits do ×${(1+p.amount).toFixed(2)}`)}
        ${perk(CRIT_UPGRADE_IDS.multi,'critMulti','Multi Crit',current.multiLevel,`${p.rolls} crit roll${p.rolls===1?'':'s'} in total`)}
        ${num('critPickaxe','Pickaxe level',current.pickaxe,0,masteryFloor?`Pickaxe Mastery keeps ${masteryFloor}`:'Set Pickaxe Mastery in Nova Shop')}
        <div class="crit-field"><span>Astromech companion</span><div class="crit-readout">${autoAstro?`+${autoAstro}`:'—'}</div><small>${autoAstro?`From your Base · effective level ${current.pickaxe+autoAstro}`:'No Astromech in a Companion slot'}</small></div>
        <label class="crit-field crit-toggle"><span>Chopper</span><div class="crit-switch"><input type="checkbox" id="critChopper" ${current.chopper?'checked':''}><b>${current.chopper?'Equipped':'Not equipped'}</b></div><small>+${Math.round(CHOPPER_CRIT_BONUS*100)}% chance and amount${autoChopper?' · found in your Base':''}</small></label>
        <div class="crit-field"><span>Rebirth perks</span><div class="crit-readout">${rebirthBonus.chance||rebirthBonus.amount?`+${Math.round(rebirthBonus.chance*100)}% / +${Math.round(rebirthBonus.amount*100)}%`:'—'}</div><small>${rebirthBonus.chance||rebirthBonus.amount?`Chance and amount, banked through R: ${state.rebirth}`:'None yet · the first lands at R: 23'}</small><small class="crit-cost">${nextCritPerk?`Next at R: ${nextCritPerk.at} · +${nextCritPerk.chance||nextCritPerk.amount}% crit ${nextCritPerk.chance?'chance':'amount'}`:'Every rebirth crit perk is banked'}</small></div>
      </section>
      <div class="base-top crit-stats">
        <div class="stat"><small>Base hit</small><strong>${p.base.toFixed(1)}s</strong><em>level ${current.pickaxe}${current.astromech?` + ${current.astromech}`:''} = ${current.pickaxe+current.astromech}</em></div>
        <div class="stat"><small>Average per swing</small><strong>${p.perHit.toFixed(1)}s</strong><em>×${p.multiplier.toFixed(3)} from crits</em></div>
        <div class="stat"><small>Chance to crit</small><strong>${(p.chance*100).toFixed(0)}%</strong><em>${p.chance>1?'guaranteed, and carries into the chain':'per swing'}</em></div>
        <div class="stat"><small>Crit amount</small><strong>${(p.amount*100).toFixed(0)}%</strong><em>a crit does ×${(1+p.amount).toFixed(2)}</em></div>
      </div>
      ${best?`<div class="notice crit-best"><strong>Best next buy: ${best.name} ${best.to}</strong> — ${fmt(best.cost)} Nova for ${(best.gain*100).toFixed(2)}% more damage, working out at ${fmt(Math.round(best.cost/(best.gain*100)))} Nova for each 1%.</div>`:''}
      <section class="scrap-calculator crit-table"><div><p class="eyebrow">Next rank</p><h2>Which upgrade to buy</h2><p>The cheapest damage first: the last column is what one percent of extra damage costs you, so smaller is better. You have spent ${fmt(totalSpent)} Nova on crit perks so far.</p></div>
      <table><thead><tr><th>Upgrade</th><th>To</th><th>Cost</th><th>Seconds/hit</th><th>Extra damage</th><th>Nova per 1% damage</th></tr></thead><tbody>
      ${options.map((o,i)=>{const after=critProfile({...current,...(o.id===CRIT_UPGRADE_IDS.chance?{chanceLevel:o.to}:o.id===CRIT_UPGRADE_IDS.amount?{amountLevel:o.to}:{multiLevel:o.to})});
        return `<tr class="${o===best?String.fromCharCode(99,114,105,116,45,112,105,99,107):o.locked?String.fromCharCode(99,114,105,116,45,108,111,99,107,101,100):String()}"><th>${o.name}${o.note?`<small class="crit-note">${o.note}</small>`:''}</th><td>${o.to}</td><td>${fmt(o.cost)}</td><td>${after.perHit.toFixed(1)}s<small class="crit-note">from ${p.perHit.toFixed(1)}s</small></td><td>+${(o.gain*100).toFixed(2)}%</td><td>${fmt(Math.round(o.cost/(o.gain*100)))}</td></tr>`}).join('')||'<tr><td colspan="6">Everything is maxed.</td></tr>'}
      </tbody></table></section>
      <div class="notice"><strong>Rebirth crit buffs are not included yet.</strong> The model has a slot for them, so they will fold in once the numbers are known.</div>`;
    const bind=(id,key)=>{const el=document.querySelector('#'+id);if(el)el.onchange=()=>{setCritSetting(key,Number(el.type==='checkbox'?(el.checked?1:0):el.value)||0);render()}};
    bind('critPickaxe','pickaxe');bind('critChopper','chopper');
    // Perk levels write through to the Nova Shop itself.
    const setPerk=(id,level)=>{setNovaLevel(id,Math.max(0,level),false);save();render()};
    [['critChance',CRIT_UPGRADE_IDS.chance],['critAmount',CRIT_UPGRADE_IDS.amount],['critMulti',CRIT_UPGRADE_IDS.multi]]
      .forEach(([field,id])=>{const el=document.querySelector('#'+field);if(el)el.onchange=()=>setPerk(id,Number(el.value)||0)});
    document.querySelectorAll('[data-perk-up]').forEach(b=>b.onclick=()=>setPerk(b.dataset.perkUp,novaLevelFor(b.dataset.perkUp)+1));
    document.querySelectorAll('[data-perk-down]').forEach(b=>b.onclick=()=>setPerk(b.dataset.perkDown,novaLevelFor(b.dataset.perkDown)-1));
    document.querySelector('#critReset').onclick=()=>{['chopper','pickaxe'].forEach(k=>localStorage.removeItem('droid-archive-crit-'+k));render();toast('Pickaxe and companion reset to your Base')};
  };
  render();
}
function optimisePage(){
  const baseP=placements(),currentIncome=incomeForPlaced(baseP.placed),plan=optimiseBase(baseP,currentIncome),p=optimisedPlacements(baseP,plan),steps=safeOptimiseStepPlan(baseP,p),stepsCollapsed=localStorage.getItem('droid-archive-optimise-steps-collapsed')==='1',income=plan.income||currentIncome,gain=Math.max(0,income-currentIncome),currentScrap=scrapPayoutsForIncome(currentIncome),optimisedScrap=scrapPayoutsForIncome(income),scrapGain={hit:Math.max(0,(optimisedScrap.hit||0)-(currentScrap.hit||0)),break:Math.max(0,(optimisedScrap.break||0)-(currentScrap.break||0))},rebirthPick=p.placed.reduce((map,x)=>{const previous=map.get(x.name);if(!previous||VARIANTS.indexOf(x.variant)>VARIANTS.indexOf(previous.variant))map.set(x.name,{variant:x.variant,key:`${x.source}:${x.unit}`});return map},new Map()),currentMap=new Map(baseP.placed.map(x=>[`${x.source}:${x.unit}`,x]));
  const nothingToDo=!steps.filter(x=>x.type!=='note').length&&!p.sell.length&&gain<=1;
  annotateLogSlots(steps);
  applyLoggedLandings(p,steps);
  const classicSteps=optimiseStepStyle()==='classic',visits=classicSteps?[]:optimiseVisits(steps);
  const stepsEyebrow=classicSteps?'Slot-by-slot order':`One walk round the base · ${visits.length} stop${visits.length===1?'':'s'}`;
  const stepsList=classicSteps
    ?`<ol ${stepsCollapsed?'hidden':''}>${steps.map(step=>`<li class="${stepTicked(step.text)?String.fromCharCode(115,116,101,112,45,100,111,110,101):String()}">${stepHtml(step)}</li>`).join('')}</ol>`
    :`<ol class="optimise-visits" ${stepsCollapsed?'hidden':''}>${visits.map(v=>`<li class="optimise-visit"><h3>${placeName(v.at)}<small>${v.steps.length} droid${v.steps.length===1?'':'s'}</small></h3><ul>${v.steps.map(step=>`<li class="${stepTicked(step.text)?String.fromCharCode(115,116,101,112,45,100,111,110,101):String()}">${stepHtml(step)}</li>`).join('')}</ul></li>`).join('')}</ol>`;
  // Hidden unless the account that owns the research is signed in.
  const trackToggle=`<span class="optimise-track" id="optimiseTrack" hidden><button class="btn secondary" type="button">Track slot choices</button><small></small></span>`;
  const stepsStyleToggle=`<button class="btn secondary optimise-style-toggle" id="toggleStepStyle" title="${classicSteps?'Switch to the route-based plan that groups moves by station':'Switch to the original slot-by-slot plan'}">${classicSteps?'Use route plan':'Use classic plan'}</button>`;
  const productive=p.placed.filter(x=>PRODUCTIVE_STATIONS.includes(x.station)),baseIncome=productive.reduce((sum,x)=>{const d=state.droids.find(y=>y.name===x.name);return sum+(d?.variants[x.variant]?.income||0)},0);
  const originLabel=x=>{const origin=currentMap.get(`${x.source}:${x.unit}`);return origin?`${origin.station} ${origin.slot+1}${floorNote(origin.station,origin.slot)}`:'Roster'};
  const replacementLabel=(occupant,type,index)=>{const key=`${occupant.source}:${occupant.unit}`,origin=currentMap.get(key),original=baseP.placed.find(x=>x.station===type&&x.slot===index);if(origin?.station===type&&origin?.slot===index)return'';if(!original)return'Empty slot';if(`${original.source}:${original.unit}`===key)return'';return`${original.name} ${variantText(original.variant)}`};
  const slot=(type,index)=>{
    const occupant=p.placed.find(x=>x.station===type&&x.slot===index);
    if(occupant){const d=state.droids.find(x=>x.name===occupant.name),cycleStatus=droidCycleStatus(d,occupant.variant,rebirthPick.get(d.name)?.key===`${occupant.source}:${occupant.unit}`),match=!isIconic(d)&&type===d.type,production=slotProductionHtml(d,occupant.variant,type,baseIncome,p.placed),replace=replacementLabel(occupant,type,index);return `<div class="base-slot occupied ${match?'matched-slot':''} ${occupant.lockedSlot?'slot-pinned':''} cycle-${cycleStatus.kind} optimise-preview"><a href="#/droid/${slug(d.name)}"><div>${picture(d,occupant.variant)}</div><strong>${d.name}</strong><small class="slot-production">${production}${match?'<em class="match-bonus">+10% match</em>':''}</small>${occupant.lockedSlot?'<em class="lock-status">Locked for Optimise</em>':''}${occupant.keepDetail?`<em class="keep-status keep-${occupant.keepReason}">${occupant.keepDetail}</em>`:''}<em class="origin-status">From: ${originLabel(occupant)}</em>${replace?`<em class="origin-status">Target has: ${replace}</em>`:''}<em class="cycle-status cycle-${cycleStatus.kind}">${cycleStatus.label}</em></a></div>`}
    const eligible=isSlotEligible(type,index),purchased=isSlotPurchased(type,index),locked=!eligible||!purchased,label=eligible&&!purchased?'Purchase this slot in Base':locked?lockedSlotLabel(type,index):`${stationName(type)} slot`;
    return `<button class="base-slot ${locked?'locked':'open'}" ${locked?'disabled':''}><span class="slot-icon">${stationIcon(type)}</span><small>${label}</small></button>`
  };
  const station=type=>{const total=SLOT_RULES[type].initial+SLOT_RULES[type].unlocks.length,active=capacity(type),eligible=Array.from({length:total},(_,i)=>i).filter(i=>isSlotEligible(type,i)).length,toPurchase=eligible-active,future=total-eligible,used=p.placed.filter(x=>x.station===type).length,slots=Array.from({length:total},(_,i)=>`${slotDivider(type,i)}${slot(type,i)}`).join('');const fuseControl=type==='FUSION'?`<button class="btn secondary station-fuse" id="runFusion" type="button" ${used<3?'disabled':''} title="${used<3?'Fill all three Fusion slots first':'Fuse these three droids'}">Fuse</button>`:'';
    return `<section class="station station-${type.toLowerCase().replaceAll('_','-')}"><header><span>${stationIcon(type)}<strong>${stationName(type)}</strong>${fuseControl}</span><small>${used}/${active} slots${toPurchase?` · ${toPurchase} not purchased`:''}${future?` · ${future} locked`:''}</small></header><div class="slot-grid">${slots}</div></section>`};
  const overflow=p.overflow.map(x=>{const d=state.droids.find(y=>y.name===x.name);return `<div class="roster-card"><a href="#/droid/${slug(d.name)}">${picture(d,x.variant)}<span><strong>${d.name}</strong><small>${variantText(x.variant)} &middot; not placed</small></span></a></div>`}).join('');
  const fuseOn=state.optimiseFuseFirst!==false;
  const fuseChain=fusionChainFromSpares(p.sell,p.placed);
  // How many of each droid the chain takes out of the Sell list, so those cards
  // can say where they are really going.
  const fuseTake=new Map();
  if(fuseOn)for(const step of fuseChain)for(const part of step.spend)fuseTake.set(`${part.name}|${part.variant}`,(fuseTake.get(`${part.name}|${part.variant}`)||0)+part.count);
  const fuseSwitch=`<label class="fuse-first-switch"><input type="checkbox" id="toggleFuseFirst" ${fuseOn?'checked':''}><span>Fuse instead of selling</span></label>`;
  const fuseStep=step=>{
    const spend=step.spend.map(part=>`${part.count} &times; ${escapeAttr(part.name)} ${variantText(part.variant)}`).join(' + ');
    const out=step.out?`<strong>${escapeAttr(step.out.name)}</strong> ${variantText(step.out.variant)}`:`a ${rarityText(step.rarity)} droid ${variantText(step.variant)}`;
    const why=[step.fills?'<b>fills a Droidex square</b>':'',step.gain>0?`${step.sure?'':'about '}+${fmt(step.gain*3600)}/hr`:''].filter(Boolean).join(' &middot; ');
    return `<li class="${step.sure?'is-sure':'is-roll'}">
      <span class="fuse-first-no">${step.step}</span>
      <span class="fuse-first-in">${spend}</span>
      <span class="fuse-first-out">${out}</span>
      <em class="fuse-first-why">${why||'keeps it out of the Sell list'}</em>
      ${step.after.length?`<small class="fuse-first-after">Waits for step ${step.after.map(i=>i+1).join(' and ')} &mdash; it spends what that one makes.</small>`:''}
      ${step.sure?'':'<small class="fuse-first-after">A roll: three of one rarity come out one rarity higher, but not which droid.</small>'}</li>`;
  };
  const fuseFirst=!fuseChain.length&&fuseOn?'':`<section class="sell-wide fuse-first ${fuseOn?'':'is-off'}"><header><div><strong>Fuse before you sell</strong><span>${fuseOn?`${fuseChain.length} step${fuseChain.length===1?'':'s'} out of the Sell list alone`:'Off &mdash; everything below is sold'}</span></div>${fuseSwitch}</header>
    ${fuseOn?`<ol class="fuse-first-list">${fuseChain.map(fuseStep).join('')}</ol>
    <p class="fuse-first-note">Each step takes three droids out of the Sell list and puts one back, so a later step can spend what an earlier one made. Gains are measured against the weakest droid earning in the layout above; a rarity roll is judged on the middle earner of that rarity and quality.</p>`:'<p class="fuse-first-note">Turn this on and the Sell list is checked for fusions worth making first &mdash; a better droid, or one your Droidex is still missing.</p>'}</section>`;
  const sell=p.sell.map(x=>{const d=state.droids.find(y=>y.name===x.name);const fuseKey=`${x.name}|${x.variant}`,fuseLeft=fuseTake.get(fuseKey)||0,toFusion=fuseLeft>0;if(toFusion)fuseTake.set(fuseKey,fuseLeft-1);return `<div class="sell-card cycle-unused ${toFusion?'to-fusion':''}"><a href="#/droid/${slug(d.name)}"><div>${picture(d,x.variant)}</div><span><strong>${d.name}</strong><small>${variantText(x.variant)} · From: ${originLabel(x)}</small><em>${toFusion?'&rarr; Fusion room, not sold':(x.sellReason||'No rebirth use')}</em></span></a></div>`}).join('');
  app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / Optimise</div><div class="base-heading"><div><p class="eyebrow">Credit optimiser</p><h1>Optimise</h1><p class="lead">A preview of your Base rearranged for the best estimated credits per hour.</p></div>${nothingToDo?'<p class="optimise-settled">Already optimal.</p>':'<button class="btn" id="applyOptimised">Apply optimised layout</button>'}</div><div class="base-top optimise-stats"><div class="stat"><small>Current / hour</small><strong>${fmt(currentIncome*3600)}</strong></div><div class="stat"><small>Optimised / hour</small><strong>${fmt(income*3600)}</strong></div><div class="stat"><small>Estimated gain / hour</small><strong>${gain?`+${fmt(gain*3600)}`:'—'}</strong></div><div class="stat scrap-stat"><small>Optimised scrap / hit</small><strong>${optimisedScrap.hit?fmt(optimisedScrap.hit):'—'}</strong><em>${scrapGain.hit?`+${fmt(scrapGain.hit)} per hit`:'No change'}</em></div><div class="stat scrap-stat"><small>Optimised scrap / break</small><strong>${optimisedScrap.break?fmt(optimisedScrap.break):'—'}</strong><em>${scrapGain.break?`+${fmt(scrapGain.break)} per break`:'No change'}</em></div><div class="stat"><small>Droids owned</small><strong>${state.owned.reduce((s,x)=>s+x.qty,0)}</strong></div></div>${nothingToDo?'':'<div class="notice">This page does not change your Base until you click <strong>Apply optimised layout</strong>. Droids in Sell are excluded from the applied layout.</div>'}${missingPreferredCompanions().length?`<div class="notice companion-wanted"><strong>Buy for a Companion slot:</strong> ${missingPreferredCompanions().map(name=>`<a href="#/droid/${slug(name)}">${name}</a>`).join(', ')} — you picked ${missingPreferredCompanions().length===1?'this':'these'} as a preferred companion but ${missingPreferredCompanions().length===1?'do not':'do not'} own ${missingPreferredCompanions().length===1?'it':'them'} yet.</div>`:''}${steps.length?`<section class="optimise-steps ${stepsCollapsed?'collapsed':''}"><header><div><p class="eyebrow">${stepsEyebrow}</p><h2>Step-by-step moves</h2></div><div class="optimise-steps-actions">${trackToggle}${stepsStyleToggle}<button class="icon-btn optimise-steps-toggle" id="toggleOptimiseSteps" title="${stepsCollapsed?'Show':'Minimise'} steps">${stepsCollapsed?'+' :'−'}</button></div></header>${stepsList}</section>`:''}<div class="base-layout-v2 optimise-layout"><div class="typed-stations">${['WORKER','ASTROMECH','BATTLE'].map(station).join('')}</div><div class="build-side">${station('BUILD')}</div>${overflow?`<section class="roster-wide"><header><div><strong>Unplaced</strong><span>${p.overflow.length} over capacity</span></div></header><div id="rosterCards">${overflow}</div></section>`:''}${fuseFirst}${sell?`<section class="sell-wide"><header><div><strong>Sell</strong><span>${p.sell.length} unused or duplicate rebirth droid${p.sell.length===1?'':'s'}</span></div></header><div class="sell-grid">${sell}</div></section>`:''}</div>`;
  document.querySelector('.build-side').insertAdjacentHTML('afterend',`<div class="special-stations">${station('LOUNGE')}${station('COMPANION')}${station('UPGRADE_CHIP')}${station('FUSION')}${station('FUSION_BUILD')}</div>`);
  document.querySelector('#toggleFuseFirst')?.addEventListener('change',event=>{state.optimiseFuseFirst=event.target.checked;save();optimisePage()});document.querySelector('#toggleOptimiseSteps')?.addEventListener('click',()=>{localStorage.setItem('droid-archive-optimise-steps-collapsed',stepsCollapsed?'0':'1');optimisePage()});
  document.querySelector('#toggleStepStyle')?.addEventListener('click',()=>{localStorage.setItem('droid-archive-optimise-step-style',classicSteps?'route':'classic');optimisePage();toast(classicSteps?'Using the route plan':'Using the classic slot-by-slot plan')});
  document.querySelector('#applyOptimised')?.addEventListener('click',async event=>{const button=event.currentTarget,label=button.textContent;button.disabled=true;button.textContent='Applying…';try{await applyOptimisedLayout(plan)}finally{if(button.isConnected){button.disabled=false;button.textContent=label}}});
  // Owner only, and only on your own Base: arm tracking, then every send-to-work
  // step offers a box.
  const trackHost=document.querySelector('#optimiseTrack');
  if(trackHost&&slotLabAllowed()&&!state.sharedView){
    trackHost.hidden=false;
    const button=trackHost.querySelector('button');
    button.textContent=slotLogTracking()?'Tracking slots · on':'Track slot choices';
    button.classList.toggle('active',slotLogTracking());
    trackHost.querySelector('small').textContent=`${slotLogAll().length} landings recorded`;
    button.onclick=()=>{slotLogSetTracking(!slotLogTracking());optimisePage()};
  }

  document.querySelectorAll('[data-log-step]').forEach(picker=>{
    picker.onchange=()=>{
      const step=steps.find(x=>x.text===picker.dataset.logStep);
      if(!step||picker.value==='')return;
      const cut=picker.value.indexOf(':');
      const spot={station:picker.value.slice(0,cut),slot:Number(picker.value.slice(cut+1))};
      // The options came from the free set, so this cannot be an occupied slot.
      slotLogAdd({station:spot.station,fromStation:step.from,fromSlot:step.fromSlot,
        free:step.freeSlots,landed:spot.slot,plannedStation:step.to,
        droid:step.unit?.name||'',droidType:state.droids.find(d=>d.name===step.unit?.name)?.type||''});
      slotLogSession.set(step.text,spot);
      toast(`Recorded · ${stationSlotLabel(spot.station,spot.slot)}`);
      optimisePage();
    };
  });
  document.querySelectorAll('[data-step-tick]').forEach(box=>box.onclick=e=>{e.stopPropagation();toggleTickedStep(box.dataset.stepTick);box.closest('li')?.classList.toggle('step-done',box.checked)});
  document.querySelectorAll('[data-skip-sell]').forEach(button=>button.onclick=()=>{spareFromSelling(button.dataset.skipSell);optimisePage()});
  if(companionMode){
    // The Electron overlay triggers these from Shift+O / Ctrl+O. Unlike the
    // web button they never prompt (no confirm() in a headless webview) and
    // snapshot the current base so the apply can be undone.
    window.__companionApplyOptimise=()=>{
      try{
        const projected=optimisedPlacements(placements(),plan);
        window.__companionOptimiseUndo=state.owned.map(r=>({...r}));
        state.owned=projected.rows;save();
        return{applied:true,sold:projected.sell.length};
      }catch(e){return{applied:false,error:String(e&&e.message||e)}}
    };
    window.__companionUndoOptimise=()=>{
      if(!window.__companionOptimiseUndo)return{undone:false,reason:'nothing-to-undo'};
      state.owned=window.__companionOptimiseUndo;window.__companionOptimiseUndo=null;save();
      return{undone:true};
    };
  }
  publishCompanionState({
    computed:true,
    gainPerHour:gain*3600,currentPerHour:currentIncome*3600,optimisedPerHour:income*3600,
    gainText:gain?`+${fmt(gain*3600)}`:'—',
    scrapHitText:optimisedScrap.hit?fmt(optimisedScrap.hit):'—',
    scrapHitGainText:scrapGain.hit?`+${fmt(scrapGain.hit)} per hit`:'No change',
    scrapBreakText:optimisedScrap.break?fmt(optimisedScrap.break):'—',
    scrapBreakGainText:scrapGain.break?`+${fmt(scrapGain.break)} per break`:'No change',
    steps:steps.map(step=>String(step.text||'').replace(/<[^>]*>/g,''))
  })
}
function rebirthCheapestPaths(cycle){
  const productiveMultiplier=(d)=>effectiveMultiplier()*(d?.type==='WORKER'?1.1:d?.type==='ASTROMECH'?1.1:d?.type==='BATTLE'?1.1:1);
  const requirements=cycle.filter(r=>r.to>state.rebirth&&r.to<=rebirthGoal()).flatMap(r=>(r.requiredDroids||[]).map(req=>({...req,at:r.to})));
  const seen=new Set(),paths=[];
  for(const req of requirements){
    const key=`${req.droidName}:${req.variant}`;
    if(seen.has(key)||hasRequirement(req))continue;
    seen.add(key);
    const d=state.droids.find(x=>x.name===req.droidName),have=bestOwnedVariant(req.droidName);
    if(!d){continue}
    if(!have){paths.push({droid:d,requirement:req,kind:'missing',cost:Infinity,efficiency:0});continue}
    const cost=chipsToVariant(d,have,req.variant),fromIncome=d.variants?.[have]?.income||0,toIncome=d.variants?.[req.variant]?.income||0,gainHour=Math.max(0,toIncome-fromIncome)*productiveMultiplier(d)*3600;
    paths.push({droid:d,requirement:req,kind:'upgrade',have,cost,gainHour,efficiency:cost?gainHour/cost:gainHour});
  }
  return paths.sort((a,b)=>(a.kind==='missing')-(b.kind==='missing')||a.cost-b.cost||b.efficiency-a.efficiency||a.requirement.at-b.requirement.at);
}
function rebirthCheapestPathsHtml(cycle){
  const paths=rebirthCheapestPaths(cycle),upgrades=paths.filter(x=>x.kind==='upgrade').slice(0,6),missing=paths.filter(x=>x.kind==='missing').slice(0,6);
  if(!paths.length)return'';
  const placedByUnit=new Map(placements().placed.map(unit=>[`${unit.source}:${unit.unit}`,unit]));
  const upgradeCards=upgrades.map(x=>{
    const candidates=expandedOwned().filter(unit=>unit.name===x.droid.name&&unit.variant===x.have).map(unit=>({...unit,...(placedByUnit.get(`${unit.source}:${unit.unit}`)||{})}));
    const unit=candidates.find(candidate=>candidate.station)||candidates[0];
    const control=unit&&!isIconic(x.droid)?`<button type="button" class="slot-variant rebirth-path-variant" data-source="${unit.source}" data-name="${x.droid.name}" data-variant="${unit.variant}" data-station="${unit.station||''}" data-slot="${Number.isInteger(unit.slot)?unit.slot:''}" title="Change ${x.droid.name} quality (currently ${unit.variant.toLowerCase()})" aria-label="Change ${x.droid.name} quality (currently ${unit.variant.toLowerCase()})">&#9670;</button>`:'';
    return `<div class="rebirth-path-card-wrap"><a class="rebirth-path-card upgrade" href="#/droid/${slug(x.droid.name)}"><span>${picture(x.droid,x.requirement.variant)}</span><div><strong>${x.droid.name}</strong><small>R ${x.requirement.at} · ${variantText(x.have)} → ${variantText(x.requirement.variant)}</small><b>${fmt(x.cost)} chips</b><em>${x.efficiency?`${fmt(x.efficiency)}/h gained per chip`:'Cheapest owned route'}</em></div></a>${control}</div>`;
  }).join('');
  const missingCards=missing.map(x=>`<a class="rebirth-path-card missing" href="#/droid/${slug(x.droid.name)}"><span>${picture(x.droid,x.requirement.variant)}</span><div><strong>${x.droid.name}</strong><small>R ${x.requirement.at} · ${variantText(x.requirement.variant)}</small><b>Missing</b><em>Find randomly from quests, missions, or the conveyor</em></div></a>`).join('');
  return `<section class="rebirth-paths"><div class="rebirth-paths-head"><div><p class="eyebrow">Upgrade efficiency</p><h2>Cheapest paths to your goal</h2></div><p>Owned upgrades are ordered by chip cost, then credits gained per chip.</p></div>${upgradeCards?`<div class="rebirth-path-group"><h3>Upgrade these first</h3><div class="rebirth-path-grid">${upgradeCards}</div></div>`:''}${missingCards?`<div class="rebirth-path-group"><h3>Still to find</h3><div class="rebirth-path-grid">${missingCards}</div></div>`:''}</section>`;
}
function rebirthTrackerKey(rebirth,req){return`${state.cycle}:${rebirth}:${req.droidName}:${req.variant}`}
function rebirthTrackerStatus(rebirth,req){
  const d=state.droids.find(x=>x.name===req.droidName),entry=state.rebirthTracker.entries[rebirthTrackerKey(rebirth,req)]||{},selected=d&&entry.variant&&d.variants?.[entry.variant]?entry.variant:null,ready=Boolean(entry.complete||(selected&&VARIANTS.indexOf(selected)>=VARIANTS.indexOf(req.variant))),chips=d&&selected&&!ready?chipsToVariant(d,selected,req.variant):0;
  return{d,entry,selected,ready,chips}
}
function manualRebirthChecked(rebirth){const requirements=rebirth.requiredDroids||[];return Boolean(requirements.length&&requirements.every(req=>rebirthTrackerStatus(rebirth.to,req).entry.complete))}
function manualRebirthReady(rebirth){const requirements=rebirth.requiredDroids||[];return Boolean(requirements.length&&requirements.every(req=>rebirthTrackerStatus(rebirth.to,req).ready))}
function manualRebirthSummary(cycle){const ready=[],missing=[];for(const rebirth of cycle){if(manualRebirthReady(rebirth))ready.push(rebirth.to);for(const req of rebirth.requiredDroids||[])if(!rebirthTrackerStatus(rebirth.to,req).ready)missing.push({...req,at:rebirth.to})}return{ready,missing}}
function manualQualityStrip(rebirth,req,d,selected){return `<div class="rebirth-quality-strip" aria-label="Owned quality for ${d.name}">${VARIANTS.filter(variant=>d.variants?.[variant]).map(variant=>`<button class="rebirth-quality-option quality-${variant.toLowerCase()} ${selected===variant?'active':''}" type="button" data-manual-variant="${encodeURIComponent(rebirthTrackerKey(rebirth,req))}" data-variant="${variant}" title="Set ${d.name} to ${variant}" aria-pressed="${selected===variant}">${variant}</button>`).join('')}</div>`}
// Manual mode's answer to "what have I actually got, and what can go". One row
// per ticked droid rather than one per rebirth that wants it: the quality you
// recorded, whether a later rebirth wants it higher and what that upgrade costs,
// or that nothing in the cycle wants it any more and the slot can be freed.
function manualTrackedPanelHtml(){
  const cycle=state.rebirths[state.cycle]||[],here=manualCurrentRebirth(),rows=new Map();
  for(const rebirth of cycle)for(const req of rebirth.requiredDroids||[]){
    const status=rebirthTrackerStatus(rebirth.to,req);
    if(!status.d||!(status.entry.complete||status.selected))continue;
    const row=rows.get(req.droidName)||{d:status.d,have:null,at:[]};
    // A tick without a quality still tells you the droid met that rebirth.
    const held=status.selected||(status.entry.complete?req.variant:null);
    if(held&&(!row.have||VARIANTS.indexOf(held)>VARIANTS.indexOf(row.have)))row.have=held;
    row.at.push(rebirth.to);rows.set(req.droidName,row);
  }
  const tracked=[...rows.values()].map(row=>{
    const later=requirementPeak(row.d.name,{after:here});
    const short=Boolean(later&&row.have&&VARIANTS.indexOf(later)>VARIANTS.indexOf(row.have));
    return{...row,later,short,chips:short?chipsToVariant(row.d,row.have,later):0,sellable:!later&&!isIconic(row.d)&&!row.d.special?.cannotSell};
  }).sort((a,b)=>Number(b.short)-Number(a.short)||a.d.name.localeCompare(b.d.name));
  if(!tracked.length)return `<section class="outstanding-panel manual-tracked empty-tracked"><p class="empty">Tick a droid below and it will be summarised here: what you have, what still needs upgrading, and what is safe to sell.</p></section>`;
  const upgrades=tracked.filter(x=>x.short),spare=tracked.filter(x=>x.sellable),settled=tracked.filter(x=>!x.short&&!x.sellable);
  const chipTotal=upgrades.reduce((sum,x)=>sum+x.chips,0);
  const row=x=>`<a class="outstanding-card ${x.short?'upgrade':x.sellable?'spare':'have'}" href="#/droid/${slug(x.d.name)}">${picture(x.d,x.have||'DEFAULT')}<span><strong>${x.d.name}</strong><small>${x.have?`You have ${variantText(x.have)}`:'Ticked'} &middot; ${rarityText(x.d.rarity)}</small><em>${x.short?`Needs ${variantText(x.later)} by R: ${requirementSchedule(x.d.name,{after:here}).find(s=>s.variant===x.later)?.at??'?'} &middot; ${fmt(x.chips)} chips`:x.sellable?`Nothing after R: ${here} needs it &middot; sells for ${fmt(chipSellValue(x.d,x.have||'DEFAULT'))} chips`:`Covered through R: ${rebirthGoal()}`}</em></span></a>`;
  const group=(title,list,note)=>list.length?`<section><h4>${title}</h4><div class="outstanding-grid">${list.map(row).join('')}</div>${note?`<small class="outstanding-note">${note}</small>`:''}</section>`:'';
  const open=localStorage.getItem('droid-archive-manual-tracked-open')!=='0';
  return `<details class="outstanding-panel manual-tracked" id="manualTrackedPanel" ${open?'open':''}><summary><span><strong>What you have ticked</strong><small>${tracked.length} droid${tracked.length===1?'':'s'} &middot; ${upgrades.length} still to upgrade${chipTotal?` (${fmt(chipTotal)} chips)`:''} &middot; ${spare.length} safe to sell</small></span></summary><div class="outstanding-body">${group('Upgrade these for a later rebirth',upgrades,`Costed from the quality you recorded, through your R: ${rebirthGoal()} max.`)}${group('Safe to sell',spare,`Counted from R: ${here}, the furthest rebirth you have completed.`)}${group('Ticked and covered',settled)}</div></details>`;
}
// The furthest rebirth ticked off in the manual tracker. Manual mode ignores the
// Base, so "where am I" cannot come from state.rebirth; it comes from the ticks.
function manualCurrentRebirth(){
  return (state.rebirths[state.cycle]||[]).filter(manualRebirthChecked).reduce((max,r)=>Math.max(max,r.to),0);
}
function manualRequirementCard(rebirth,req){
  const status=rebirthTrackerStatus(rebirth,req),{d,entry,selected,ready,chips}=status;if(!d)return'';
  const stateClass=ready?'have':selected?'upgrade':'missing',statusText=entry.complete?'&#10003; Have it':ready?'&#10003; Ready':selected?`${variantText(selected)} &rarr; ${variantText(req.variant)} &middot; ${fmt(chips)} chips`:'Select the quality you have';
  // Past this rebirth: does anything still want the droid, and at what quality?
  // Without this the tracker can only answer "is it enough for this one rebirth",
  // which is what sends people to a spreadsheet to work out what is safe to sell.
  const later=requirementPeak(d.name,{after:rebirth}),held=selected||(entry.complete?req.variant:null);
  const laterShort=later&&held&&VARIANTS.indexOf(later)>VARIANTS.indexOf(held);
  const sellable=!isIconic(d)&&!d.special?.cannotSell&&!later;
  const laterNote=later?`<em class="manual-later${laterShort?' short':''}">Later needs ${variantText(later)}${laterShort?` &middot; ${fmt(chipsToVariant(d,held,later))} chips`:held?' &middot; covered':''}</em>`:'';
  return `<div class="manual-rebirth-requirement">${manualQualityStrip(rebirth,req,d,selected)}<article class="needed-card rebirth-req-card manual ${stateClass}${sellable?' sell-after':''}" data-needed-name="${d.name.toLowerCase()}"><label class="manual-droid-check" title="Mark ${d.name} as owned"><input type="checkbox" data-manual-complete="${encodeURIComponent(rebirthTrackerKey(rebirth,req))}" ${entry.complete?'checked':''}><span aria-hidden="true">&#10003;</span></label><a class="manual-rebirth-droid" href="#/droid/${slug(d.name)}"><div>${picture(d,selected||req.variant)}</div><span><strong>${d.name}</strong><small>Needs ${variantText(req.variant)} &middot; ${rarityText(d.rarity)}</small>${laterNote}</span></a><b>${statusText}</b>${sellable?`<span class="needed-sell" title="Nothing after Rebirth ${rebirth} needs ${d.name}, so it can be sold once this rebirth is done" aria-label="Sellable after Rebirth ${rebirth}">$</span>`:''}</article></div>`
}
function legacyRebirthPage(){
  const cycle=state.rebirths[state.cycle]||[],summary=fullCycleRebirthSummary(),ownedCount=state.owned.reduce((s,x)=>s+x.qty,0),showCompleted=localStorage.getItem('droid-archive-show-completed-rebirths')!=='0',visibleCycle=showCompleted?cycle:cycle.filter(r=>r.to>state.rebirth);
  const reqCard=req=>{const d=state.droids.find(x=>x.name===req.droidName),have=bestOwnedVariant(req.droidName),ready=hasRequirement(req),needsUpgrade=have&&!ready,chips=needsUpgrade?chipsToVariant(d,have,req.variant):0;if(!d)return'';return `<a class="needed-card rebirth-req-card ${ready?'have':needsUpgrade?'upgrade':'missing'}" href="#/droid/${slug(d.name)}" data-needed-name="${d.name.toLowerCase()}"><div>${picture(d,req.variant)}</div><span><strong>${d.name}</strong><small>${variantText(req.variant)} &middot; ${rarityText(d.rarity)}</small>${have?`<em>Best owned: ${variantText(have)}</em>`:''}</span><b>${ready?'&#10003; Ready':needsUpgrade?`Upgrade · ${fmt(chips)} chips`:'Needed'}</b></a>`};
  app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / Rebirth</div><section class="rebirth-hero"><div><p class="eyebrow">Cycle ${state.cycle+1} rebirth guide</p><h1>Rebirth</h1><p class="lead">Full rebirth requirements for the selected Super Rebirth cycle. Toggle completed rebirths if you only want to see what is still ahead.</p></div><div class="rebirth-hero-stats"><strong>${ownedCount}</strong><span>droids owned</span><strong>${rebirthGoal()}</strong><span>Base goal</span></div></section><section class="rebirth-summary-box rebirth-page-summary"><div><p class="eyebrow">Your outlook</p><strong>${summary.ready.length?`Ready rebirths: R ${summary.ready.join(', R ')}`:'No future rebirth is fully ready yet'}</strong><span>${summary.missing.length?`Still missing ${summary.missing.length} requirement${summary.missing.length===1?'':'s'} across the full cycle.`:'You have every listed droid for the rest of this cycle.'}</span></div><label class="rebirth-toggle"><input id="toggleCompletedRebirths" type="checkbox" ${showCompleted?'checked':''}> Show completed rebirths</label></section>${rebirthCheapestPathsHtml(cycle)}<div class="rebirth-cycle-list">${visibleCycle.map(r=>{const ready=rebirthReadiness(r),past=r.to<=state.rebirth,overGoal=r.to>rebirthGoal();return `<section class="rebirth-detail-group ${ready?'ready':''} ${past?'past':''} ${overGoal?'over-goal':''}"><header><div><h2>Rebirth: ${r.to}</h2><small>${past?'Already completed':overGoal?'Past Base goal':'Within Base goal'}</small></div>${creditAmount(r.creditsCost)}</header><div class="needed-grid">${(r.requiredDroids||[]).map(reqCard).join('')}</div></section>`}).join('')||'<div class="empty">Completed rebirths are hidden. Toggle them back on to see earlier requirements.</div>'}</div>`;
  document.querySelector('#toggleCompletedRebirths')?.addEventListener('change',e=>{localStorage.setItem('droid-archive-show-completed-rebirths',e.target.checked?'1':'0');rebirthPage()})
}
function rebirthPage(){
  const cycle=state.rebirths[state.cycle]||[],manual=state.rebirthTracker.notUsingBase,summary=manual?manualRebirthSummary(cycle):fullCycleRebirthSummary(),ownedCount=manual?Object.entries(state.rebirthTracker.entries).filter(([key,value])=>key.startsWith(`${state.cycle}:`)&&value.complete).length:state.owned.reduce((s,x)=>s+x.qty,0),showCompleted=localStorage.getItem('droid-archive-show-completed-rebirths')!=='0',visibleCycle=showCompleted?cycle:cycle.filter(r=>manual?!manualRebirthChecked(r):r.to>state.rebirth);
  // The Base list and this page draw the same card, so an add or a quality change
  // works the same in both places. Manual mode has its own card because it tracks
  // qualities you tick rather than droids standing in your Base.
  const placedNow=manual?null:placements(),located=manual?null:requirementLocations(),units=manual?null:requirementUnits(placedNow);
  const reqCard=(req,rebirth)=>manual?manualRequirementCard(rebirth,req):neededCardHtml(req,{located,units,rebirth,className:'rebirth-req-card'});
  app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / Rebirth</div><section class="rebirth-hero"><div><p class="eyebrow">Cycle ${state.cycle+1} rebirth guide</p><h1>Rebirth</h1><p class="lead">${manual?'Manually track the droids and qualities you have without changing your Base.':'Full rebirth requirements for the selected Super Rebirth cycle. Toggle completed rebirths if you only want to see what is still ahead.'}</p></div><div class="rebirth-hero-stats"><strong>${ownedCount}</strong><span>${manual?'droids checked':'droids owned'}</span><strong>${rebirthGoal()}</strong><span>Base goal</span></div></section><section class="rebirth-summary-box rebirth-page-summary"><div><p class="eyebrow">Your outlook</p><strong>${summary.ready.length?`Ready rebirths: R ${summary.ready.join(', R ')}`:'No rebirth is fully ready yet'}</strong><span>${summary.missing.length?`Still missing ${summary.missing.length} requirement${summary.missing.length===1?'':'s'} across the full cycle.`:'You have every listed droid for this cycle.'}</span></div><div class="rebirth-summary-controls"><label class="rebirth-toggle manual-mode-toggle"><input id="toggleManualRebirth" type="checkbox" ${manual?'checked':''}> Not using Base</label><label class="rebirth-toggle"><input id="toggleCompletedRebirths" type="checkbox" ${showCompleted?'checked':''}> Show completed rebirths</label></div></section>${manual?manualTrackedPanelHtml():rebirthCheapestPathsHtml(cycle)}<div class="rebirth-cycle-list ${manual?'manual-tracker':''}">${visibleCycle.map(r=>{const ready=manual?manualRebirthReady(r):rebirthReadiness(r),completed=manual?manualRebirthChecked(r):r.to<=state.rebirth,past=manual?completed:r.to<=state.rebirth,overGoal=r.to>rebirthGoal();return `<section class="rebirth-detail-group ${ready?'ready':''} ${past?'past':''} ${overGoal?'over-goal':''}"><header><div><div class="rebirth-title-row"><h2>Rebirth: ${r.to}</h2>${manual?`<label class="rebirth-group-complete" title="Mark every droid in Rebirth ${r.to} as owned"><input type="checkbox" data-rebirth-complete="${r.to}" ${completed?'checked':''}><span>Complete rebirth</span></label>`:''}</div><small>${manual?(completed?'Completed':overGoal?'Past Base goal':'Manual tracker'):past?'Already completed':overGoal?'Past Base goal':'Within Base goal'}</small></div><span class="rebirth-group-rewards">${rebirthRewardHtml(r.to)}${creditAmount(r.creditsCost)}</span></header><div class="needed-grid">${(r.requiredDroids||[]).map(req=>reqCard(req,r.to)).join('')}</div></section>`}).join('')||'<div class="empty">Completed rebirths are hidden. Toggle them back on to see earlier requirements.</div>'}</div>`;
  // The Base sidebar already carries this setting, but the decision of how far to
  // push before a Super Rebirth is made while reading this page, so it is here too.
  document.querySelector('.rebirth-summary-controls')?.insertAdjacentHTML('afterbegin',`<label class="manual-cycle-picker"><span>Max rebirth</span><select id="rebirthGoalSelect" aria-label="Max rebirth">${Array.from({length:Math.max(0,maxRebirth()-11)},(_,i)=>i+12).map(n=>`<option value="${n}" ${n===rebirthGoal()?'selected':''}>Rebirth ${n}</option>`).join('')}</select></label>`);
  document.querySelector('#rebirthGoalSelect')?.addEventListener('change',e=>{state.superRebirthGoal=Number(e.target.value)||maxRebirth();save();rebirthPage()});
  document.querySelector('#manualTrackedPanel')?.addEventListener('toggle',e=>localStorage.setItem('droid-archive-manual-tracked-open',e.target.open?'1':'0'));
  if(manual)document.querySelector('.rebirth-summary-controls')?.insertAdjacentHTML('afterbegin',`<label class="manual-cycle-picker"><span>Super Rebirth cycle</span><select id="manualCycleSelect" aria-label="Super Rebirth cycle">${Object.keys(state.rebirths).sort((a,b)=>Number(a)-Number(b)).map(key=>`<option value="${key}" ${Number(key)===state.cycle?'selected':''}>Cycle ${Number(key)+1}</option>`).join('')}</select></label>`);
  document.querySelector('#manualCycleSelect')?.addEventListener('change',e=>{state.cycle=Number(e.target.value);save();rebirthPage()});
  document.querySelector('#toggleManualRebirth')?.addEventListener('change',e=>{state.rebirthTracker.notUsingBase=e.target.checked;save();rebirthPage()});
  document.querySelector('#toggleCompletedRebirths')?.addEventListener('change',e=>{localStorage.setItem('droid-archive-show-completed-rebirths',e.target.checked?'1':'0');rebirthPage()});
  document.querySelectorAll('[data-manual-variant]').forEach(button=>button.onclick=()=>{const key=decodeURIComponent(button.dataset.manualVariant),current=state.rebirthTracker.entries[key]||{},variant=current.variant===button.dataset.variant?null:button.dataset.variant;state.rebirthTracker.entries[key]={...current,...(variant?{variant}:{}),complete:Boolean(current.complete)};if(!variant)delete state.rebirthTracker.entries[key].variant;save();rebirthPage()});
  document.querySelectorAll('[data-manual-complete]').forEach(input=>input.onchange=()=>{const key=decodeURIComponent(input.dataset.manualComplete),current=state.rebirthTracker.entries[key]||{};state.rebirthTracker.entries[key]={...current,complete:input.checked};save();rebirthPage()});
  document.querySelectorAll('[data-rebirth-complete]').forEach(input=>input.onchange=()=>{const rebirth=cycle.find(r=>r.to===Number(input.dataset.rebirthComplete));for(const req of rebirth?.requiredDroids||[]){const key=rebirthTrackerKey(rebirth.to,req),current=state.rebirthTracker.entries[key]||{};state.rebirthTracker.entries[key]={...current,complete:input.checked}}save();rebirthPage()});
  document.querySelectorAll('.rebirth-path-variant').forEach(button=>button.onclick=()=>showCardVariantModal({source:Number(button.dataset.source),name:button.dataset.name,variant:button.dataset.variant,station:button.dataset.station,slot:Number(button.dataset.slot)},rebirthPage));
  attachNeededCardHandlers(rebirthPage);
}
async function groupsPage(){
  if(!location.hash.startsWith('#/groups'))return;
  if(state.sharedView)await exitSharedProfile(false);
  if(!location.hash.startsWith('#/groups'))return;
  if(!cloudConnected()){
    app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / Groups</div><section class="groups-hero"><div><p class="eyebrow">Connected accounts</p><h1>Groups</h1><p class="lead">Connect Droid Archives accounts, share selected profiles, and combine their Rebirth Outlooks.</p></div><button class="btn" id="groupsSignIn">Sign in to use groups</button></section><div class="notice">Groups use your Droid Archives cloud account. Local-only profiles cannot be shared until you sign in.</div>`;
    document.querySelector('#groupsSignIn').onclick=()=>showAuthModal('signin');
    return
  }
  if(!state.groups.loaded&&!state.groups.loading){app.innerHTML='<div class="loading">Loading groups…</div>';try{await loadGroupWorkspace()}catch{}if(!location.hash.startsWith('#/groups'))return;return groupsPage()}
  if(state.groups.loading){app.innerHTML='<div class="loading">Loading groups…</div>';return}
  let activeGroupId=localStorage.getItem('droid-archive-active-group')||state.groups.workspace[0]?.id||'',activeGroup=state.groups.workspace.find(group=>group.id===activeGroupId)||state.groups.workspace[0];
  if(activeGroup){activeGroupId=activeGroup.id;localStorage.setItem('droid-archive-active-group',activeGroupId)}
  const selection=groupOutlookSelection(),ownId=state.cloud.user.id,profileRows=activeGroup?(state.cloud.doc?.profiles||[]).map(profile=>{const share=activeGroup.profiles?.find(item=>item.ownerId===ownId&&item.profileId===profile.id),key=groupProfileKey(activeGroup.id,ownId,profile.id),selected=selection===null||selection.has(key);return`<article class="group-share-row"><div><strong>${escapeAttr(profile.name)}</strong><small>Updated ${profile.updatedAt?new Date(profile.updatedAt).toLocaleString():'recently'}</small></div><label><input type="checkbox" data-group-outlook-profile="${escapeAttr(profile.id)}" ${selected?'checked':''}> Outlook</label><label><input type="checkbox" data-group-share="${escapeAttr(profile.id)}" ${share?'checked':''}> Share</label><label><input type="checkbox" data-group-edit="${escapeAttr(profile.id)}" ${share?.canEdit?'checked':''} ${share?'':'disabled'}> Allow editing</label><button class="btn secondary" data-group-view-own="${escapeAttr(profile.id)}">Open</button></article>`}).join(''):'';
  const available=activeGroup?groupAvailableProfiles(activeGroup):[],sharedRows=available.map(profile=>{const key=groupProfileKey(activeGroup.id,profile.ownerId,profile.profileId),selected=selection===null||selection.has(key);return`<article class="group-profile-card ${profile.isOwn?'own':''}"><div><small>${escapeAttr(profile.ownerName)}${profile.isOwn?' · your account':''}</small><strong>${escapeAttr(profile.profileName)}</strong><span>${profile.isOwn?'Private profile available to you':profile.canEdit?'Owner allows editing':'Read only'}</span></div><label><input type="checkbox" data-group-outlook-owner="${profile.ownerId}" data-group-outlook-id="${escapeAttr(profile.profileId)}" ${selected?'checked':''}> Include in Outlook</label><button class="btn secondary" data-group-view-profile data-owner-id="${profile.ownerId}" data-profile-id="${escapeAttr(profile.profileId)}">View${profile.isOwn||profile.canEdit?' / Edit':''}</button></article>`}).join('');
  const approvedMembers=activeGroup?(activeGroup.members||[]).filter(member=>member.approvalStatus!=='pending'):[],pendingMembers=activeGroup?(activeGroup.members||[]).filter(member=>member.approvalStatus==='pending'):[];
  const memberRows=approvedMembers.map(member=>`<li><span><strong>${escapeAttr(member.displayName)}</strong><small>${member.role==='owner'?'Group owner':'Member'}</small></span>${activeGroup.ownerId===ownId&&member.userId!==ownId?`<button class="btn danger" data-group-remove-member="${member.userId}">Remove</button>`:''}</li>`).join('');
  const pendingRows=activeGroup?.ownerId===ownId?pendingMembers.map(member=>`<li class="pending"><span><strong>${escapeAttr(member.displayName)}</strong><small>Waiting for approval</small></span><span class="group-request-actions"><button class="btn" data-group-approve-member="${member.userId}">Approve</button><button class="btn danger" data-group-reject-member="${member.userId}">Reject</button></span></li>`).join(''):'';
  app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / Groups</div><section class="groups-hero"><div><p class="eyebrow">Connected accounts</p><h1>Groups</h1><p class="lead">Share one profile or several, choose who can edit, and see selected Rebirth Outlooks together.</p></div><button class="btn secondary" id="refreshGroups">Refresh</button></section>${state.groups.error?`<div class="notice todo-error">${escapeAttr(state.groups.error)}</div>`:''}<section class="group-connect-panel"><form id="createGroupForm"><h2>Create a group</h2><input id="createGroupName" class="form-control" maxlength="60" placeholder="Group name" required><input id="createGroupDisplayName" class="form-control" maxlength="40" value="${escapeAttr(defaultGroupDisplayName())}" placeholder="Your display name" required><button class="btn" type="submit">Create</button></form><form id="joinGroupForm"><h2>Request to join a group</h2><input id="joinGroupCode" class="form-control" maxlength="20" placeholder="Invite code" required><input id="joinGroupDisplayName" class="form-control" maxlength="40" value="${escapeAttr(defaultGroupDisplayName())}" placeholder="Your display name" required><button class="btn" type="submit">Request</button></form></section>${activeGroup?`<div class="group-tabs">${state.groups.workspace.map(group=>`<button data-group-tab="${group.id}" class="${group.id===activeGroup.id?'active':''}">${escapeAttr(group.name)}</button>`).join('')}</div><section class="group-dashboard"><header><div><p class="eyebrow">${activeGroup.ownerId===ownId?'Your group':'Member group'}</p><h2>${escapeAttr(activeGroup.name)}</h2><p>${approvedMembers.length} connected account${approvedMembers.length===1?'':'s'}${pendingMembers.length&&activeGroup.ownerId===ownId?` · ${pendingMembers.length} pending`:''}</p></div><button class="group-invite" id="copyGroupInvite" type="button" data-invite="${escapeAttr(activeGroup.inviteCode)}" aria-label="Reveal and copy invite code"><small>Invite code · click to copy</small><strong><span class="invite-mask">••••••••••••</span><span class="invite-value">${escapeAttr(activeGroup.inviteCode)}</span></strong></button></header><div class="group-dashboard-grid"><section>${pendingRows?`<div class="group-requests"><h3>Join requests</h3><ul class="group-member-list">${pendingRows}</ul></div>`:''}<h3>Members</h3><ul class="group-member-list">${memberRows}</ul>${activeGroup.ownerId===ownId?'<button class="btn danger" id="deleteGroup">Delete group</button>':'<button class="btn danger" id="leaveGroup">Leave group</button>'}</section><section><h3>Profiles I share</h3><p>Sharing controls visibility. Editing is always off until you enable it for that profile.</p><div class="group-share-list">${profileRows||'<div class="empty">No cloud profiles found.</div>'}</div></section></div></section><section class="group-profiles-section"><header><div><p class="eyebrow">Profile access</p><h2>Profiles in this group</h2><p>Select any combination for the shared Rebirth Outlook.</p></div></header><div class="group-profile-grid">${sharedRows||'<div class="empty">No profiles are shared with this group yet.</div>'}</div></section><section class="group-outlook-panel group-page-outlook"><header><div><p class="eyebrow">Multi-profile tracking</p><h2>Combined Rebirth Outlook</h2><p>Every checked profile appears here without switching accounts.</p></div></header>${groupOutlookCardsHtml()}</section>`:'<div class="empty group-empty">Create a group or request access with an invite code. The group owner must approve you before the group appears.</div>'}`;
  const run=async(button,action,success)=>{try{if(button){button.disabled=true;button.textContent='Working…'}await action();toast(success);groupsPage()}catch(error){toast(error.message);if(button)button.disabled=false}};
  document.querySelector('#refreshGroups').onclick=event=>run(event.currentTarget,()=>loadGroupWorkspace(), 'Groups refreshed');
  document.querySelector('#createGroupForm').onsubmit=event=>{event.preventDefault();run(event.submitter,()=>createArchiveGroup(document.querySelector('#createGroupName').value.trim(),document.querySelector('#createGroupDisplayName').value.trim()),'Group created')};
  document.querySelector('#joinGroupForm').onsubmit=event=>{event.preventDefault();run(event.submitter,()=>joinArchiveGroup(document.querySelector('#joinGroupCode').value.trim(),document.querySelector('#joinGroupDisplayName').value.trim()),'Join request sent for owner approval')};
  document.querySelectorAll('[data-group-tab]').forEach(button=>button.onclick=()=>{localStorage.setItem('droid-archive-active-group',button.dataset.groupTab);groupsPage()});
  const inviteButton=document.querySelector('#copyGroupInvite');let inviteHideTimer;
  inviteButton?.addEventListener('click',async()=>{const touchMode=!matchMedia('(hover: hover) and (pointer: fine)').matches;if(touchMode){const reveal=!inviteButton.classList.contains('revealed');inviteButton.classList.toggle('revealed',reveal);clearTimeout(inviteHideTimer);if(reveal)inviteHideTimer=setTimeout(()=>inviteButton.classList.remove('revealed'),5000)}try{await navigator.clipboard.writeText(activeGroup.inviteCode);toast('Invite code copied')}catch{toast(`Invite code: ${activeGroup.inviteCode}`)}});
  document.querySelectorAll('[data-group-share]').forEach(input=>input.onchange=()=>{const edit=document.querySelector(`[data-group-edit="${CSS.escape(input.dataset.groupShare)}"]`);run(input,()=>setArchiveProfileShare(activeGroup.id,input.dataset.groupShare,input.checked,input.checked&&edit?.checked),input.checked?'Profile shared':'Profile made private')});
  document.querySelectorAll('[data-group-edit]').forEach(input=>input.onchange=()=>run(input,()=>setArchiveProfileShare(activeGroup.id,input.dataset.groupEdit,true,input.checked),input.checked?'Editing allowed':'Editing disabled'));
  document.querySelectorAll('[data-group-outlook-profile]').forEach(input=>input.onchange=()=>{setGroupOutlookProfile(activeGroup.id,ownId,input.dataset.groupOutlookProfile,input.checked);groupsPage()});
  document.querySelectorAll('[data-group-outlook-owner]').forEach(input=>input.onchange=()=>{setGroupOutlookProfile(activeGroup.id,input.dataset.groupOutlookOwner,input.dataset.groupOutlookId,input.checked);groupsPage()});
  document.querySelectorAll('[data-group-view-own]').forEach(button=>button.onclick=()=>{switchCloudProfile(button.dataset.groupViewOwn);location.hash='#/base'});
  document.querySelectorAll('[data-group-view-profile]').forEach(button=>button.onclick=()=>openGroupProfile(activeGroup.id,button.dataset.ownerId,button.dataset.profileId).catch(error=>toast(error.message)));
  document.querySelectorAll('[data-group-approve-member]').forEach(button=>button.onclick=()=>run(button,()=>reviewArchiveGroupMember(activeGroup.id,button.dataset.groupApproveMember,true),'Member approved'));
  document.querySelectorAll('[data-group-reject-member]').forEach(button=>button.onclick=()=>{if(confirm('Reject this join request?'))run(button,()=>reviewArchiveGroupMember(activeGroup.id,button.dataset.groupRejectMember,false),'Join request rejected')});
  document.querySelectorAll('[data-group-remove-member]').forEach(button=>button.onclick=()=>{if(confirm('Remove this member and all profiles they shared with the group?'))run(button,()=>removeArchiveGroupMember(activeGroup.id,button.dataset.groupRemoveMember),'Member removed')});
  document.querySelector('#leaveGroup')?.addEventListener('click',event=>{if(confirm(`Leave ${activeGroup.name}?`))run(event.currentTarget,()=>leaveArchiveGroup(activeGroup.id),'Group left')});
  document.querySelector('#deleteGroup')?.addEventListener('click',event=>{if(confirm(`Delete ${activeGroup.name}? This disconnects every member but does not delete anyone’s profiles.`))run(event.currentTarget,()=>deleteArchiveGroup(activeGroup.id),'Group deleted')})
}
function notFound(){app.innerHTML='<h1>Page not found</h1><p class="lead">That archive entry does not exist.</p><a class="btn" href="#/droids">Browse droids</a>'}
function toast(msg){const t=document.querySelector('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
function normalizeIconicSurfaces(){if(location.hash.startsWith('#/droid/')){const d=state.droids.find(x=>slug(x.name)===location.hash.split('/')[2]);if(isIconic(d)){document.querySelector('.variant-tabs')?.remove();const statsHeading=[...document.querySelectorAll('article h2')].find(x=>x.textContent.includes('statistics'));if(statsHeading&&statsHeading.textContent!=='Statistics')statsHeading.textContent='Statistics';[...document.querySelectorAll('.info-row')].find(x=>x.querySelector('b')?.textContent==='Quality')?.remove();const add=document.querySelector('#addThis'),label=`Add ${d.name} to my base`;if(add&&add.textContent!==label)add.textContent=label}}if(location.hash.startsWith('#/droidex')){const active=document.querySelector('[data-dex-variant].active')?.dataset.dexVariant||'DEFAULT';document.querySelectorAll('[data-dex-own]').forEach(button=>{const d=state.droids.find(x=>x.name===button.dataset.dexOwn);if(isIconic(d)){if(active!=='DEFAULT')button.closest('.dex-card')?.remove();else button.closest('.dex-card')?.querySelector('.dex-flawless')?.remove()}});const validEntries=state.droidex.filter(x=>{const d=state.droids.find(y=>y.name===x.name);return d&&(x.variant==='DEFAULT'||!isIconic(d))});const total=document.querySelector('.dex-totals strong'),totalText=`${validEntries.length}/${droidexCapacity()}`;if(total&&total.textContent!==totalText)total.textContent=totalText;const available=state.droids.filter(d=>active==='DEFAULT'||!isIconic(d)),collected=validEntries.filter(x=>x.variant===active).length,summary=document.querySelector('.dex-toolbar>span'),summaryText=`${collected}/${available.length} ${active.toLowerCase()} collected`;if(summary&&summary.textContent!==summaryText)summary.textContent=summaryText}}
function decorateIconicDetail(){if(!location.hash.startsWith('#/droid/'))return;const d=state.droids.find(x=>slug(x.name)===location.hash.split('/')[2]);if(!isIconic(d))return;const income=`${iconicIncome(d)*100}%/s`,rows=document.querySelector('.info-rows'),incomeRow=rows?[...rows.querySelectorAll('.info-row')].find(x=>x.querySelector('b')?.textContent==='Income'):null;if(incomeRow&&incomeRow.querySelector('span').textContent!==income)incomeRow.querySelector('span').textContent=income;if(rows&&!rows.querySelector('.iconic-perk-row'))rows.insertAdjacentHTML('beforeend',`<div class="info-row iconic-perk-row"><b>Perk</b><span>${ICONIC_EFFECTS[d.name]||'Event bonus'}</span></div>`);const lead=document.querySelector('article .lead');if(lead&&lead.dataset.iconicIncome!==income){lead.dataset.iconicIncome=income;lead.innerHTML=`<strong>${d.name}</strong> is an iconic ${d.type.toLowerCase()} droid with <strong>${income}</strong> income.`}const table=document.querySelector('article table');if(table&&table.dataset.iconicIncome!==income){table.dataset.iconicIncome=income;table.innerHTML=`<thead><tr><th>Income</th></tr></thead><tbody><tr class="selected-variant"><td><strong>${income}</strong></td></tr></tbody>`}const gameplay=[...document.querySelectorAll('article h2')].find(x=>x.textContent==='Gameplay')?.nextElementSibling;if(gameplay&&!gameplay.classList.contains('iconic-gameplay')){gameplay.classList.add('iconic-gameplay');gameplay.innerHTML=`While placed in a productive Worker, Astromech, or Battle station, <strong>${d.name}</strong> provides <strong>${income}</strong> income from eligible droid production. Its unique perk is <strong>${ICONIC_EFFECTS[d.name]||'an event bonus'}</strong>. Build, Lounge, and Companion placements do not activate this income.`}}
function openComparisonFor(name){showDroidComparisonModal();const one=document.querySelector('#comparisonOne'),two=document.querySelector('#comparisonTwo');if(!one)return;one.value=name;if(two?.value===name){const alternative=state.droids.find(d=>d.name!==name);if(alternative)two.value=alternative.name}one.dispatchEvent(new Event('change'))}
function enhanceCompareButtons(){
  if(location.hash.startsWith('#/droid/')){const d=state.droids.find(x=>slug(x.name)===location.hash.split('/')[2]),add=document.querySelector('#addThis');if(d&&add&&!document.querySelector('[data-detail-compare]'))add.parentElement.insertAdjacentHTML('beforeend',`<button class="btn secondary" type="button" data-detail-compare data-compare-droid="${d.name}">Compare</button>`)}
  if(location.hash.startsWith('#/droidex'))document.querySelectorAll('.dex-card').forEach(card=>{const own=card.querySelector('[data-dex-own]'),actions=own?.parentElement,name=own?.dataset.dexOwn;if(actions&&name&&!actions.querySelector('[data-compare-droid]'))actions.insertAdjacentHTML('beforeend',`<button class="dex-compare" type="button" data-compare-droid="${name}">Compare</button>`)})
}
function normalizePageLabels(){document.querySelectorAll('.breadcrumbs a').forEach(a=>{if(a.textContent==='Main page')a.textContent='Homepage'});if(location.hash.startsWith('#/droids')){const title=app.querySelector('h1');if(title?.textContent==='All droids')title.textContent='Droids'}if(location.hash.startsWith('#/base')){const title=app.querySelector('h1');if(title?.textContent==='My base')title.textContent='Base';const eyebrow=app.querySelector('.eyebrow');if(eyebrow?.textContent==='Personal planner')eyebrow.textContent='Personal base'}normalizeIconicSurfaces();decorateIconicDetail();addDetailDroidexControls();enhanceCompareButtons()}
new MutationObserver(()=>{normalizePageLabels();mountArchiveTimers();decorateSharedView()}).observe(app,{childList:true,subtree:true});
app.addEventListener('click',event=>{const button=event.target.closest('[data-compare-droid]');if(!button)return;event.preventDefault();event.stopPropagation();openComparisonFor(button.dataset.compareDroid)});
app.addEventListener('click',event=>{const button=event.target.closest('[data-group-view]');if(!button)return;event.preventDefault();const [groupId,ownerId,...profileParts]=button.dataset.groupView.split('|');openGroupProfile(groupId,ownerId,profileParts.join('|')).catch(error=>toast(error.message))});
const GALACTIC_ADMIN_EMAIL='xraffo@gmail.com';
const GALACTIC_LOCAL_KEY='droid-archive-galactic-reports';
const galacticUserEmail=()=>String(state.cloud.user?.email||'').toLowerCase();
const galacticIsAdmin=()=>galacticUserEmail()===GALACTIC_ADMIN_EMAIL;
const galacticReportTable=()=>supabaseConfig.galacticReportsTable||'galactic_reports';
const galacticModsTable=()=>supabaseConfig.galacticModsTable||'galactic_report_mods';
function parseGalacticNumber(value){const text=String(value||'').trim().replace(/,/g,'');const match=text.match(/^(\d+(?:\.\d+)?)\s*([kmbt])?$/i);if(!match)throw Error('Enter a number like 12400 or 12.4k.');const multipliers={k:1e3,m:1e6,b:1e9,t:1e12},number=Number(match[1])*(multipliers[match[2]?.toLowerCase()]||1);if(!Number.isFinite(number)||number<0)throw Error('Enter a positive number.');return Math.round(number)}
function galacticLocalReports(){try{return JSON.parse(localStorage.getItem(GALACTIC_LOCAL_KEY)||'[]')}catch{return[]}}
function saveGalacticLocalReports(rows){localStorage.setItem(GALACTIC_LOCAL_KEY,JSON.stringify(rows))}
async function galacticRole(){if(!cloudConnected())return{admin:false,mod:false,shared:false};if(galacticIsAdmin())return{admin:true,mod:true,shared:true};try{const {data,error}=await supabaseClient.from(galacticModsTable()).select('email').eq('email',galacticUserEmail()).maybeSingle();if(error)throw error;return{admin:false,mod:Boolean(data),shared:true}}catch{return{admin:false,mod:false,shared:true,setupError:'Galactic report moderation table is not ready yet.'}}}
async function loadGalacticReports(role){if(!cloudConnected())return galacticLocalReports();let q=supabaseClient.from(galacticReportTable()).select('*').order('created_at',{ascending:false});if(!(role.admin||role.mod))q=q.eq('user_id',state.cloud.user.id);const {data,error}=await q;if(error)throw Error(error.message);return data||[]}
async function submitGalacticReportLegacy(payload){if(cloudConnected()){const {error}=await supabaseClient.from(galacticReportTable()).insert(payload);if(error)throw Error(error.message);return}const rows=galacticLocalReports();rows.unshift({...payload,id:cloudId(),email:'Local only',created_at:new Date().toISOString(),updated_at:new Date().toISOString()});saveGalacticLocalReports(rows)}
async function updateGalacticReport(id,valueRaw){const value=parseGalacticNumber(valueRaw);const {error}=await supabaseClient.from(galacticReportTable()).update({value_raw:valueRaw,value,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw Error(error.message)}
async function deleteGalacticReport(id){const {error}=await supabaseClient.from(galacticReportTable()).delete().eq('id',id);if(error)throw Error(error.message)}
async function addGalacticMod(email){const clean=String(email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean))throw Error('Enter a valid email address.');const {error}=await supabaseClient.from(galacticModsTable()).upsert({email:clean});if(error)throw Error(error.message)}
async function galacticReportsPageLegacy(){let role={admin:false,mod:false,shared:false},rows=[],notice='';const kindLabel=x=>x==='buy_cost'?'Buy Cost':'Earn Amount',types=[...new Set(state.droids.filter(d=>!isIconic(d)).map(d=>d.type))],droidsFor=type=>state.droids.filter(d=>!isIconic(d)&&(!type||d.type===type)).sort((a,b)=>a.name.localeCompare(b.name));const renderRows=()=>rows.map(row=>`<tr><td><strong>${row.droid_name}</strong><small>${row.droid_type}</small></td><td>${kindLabel(row.report_kind)}</td><td><strong>${fmt(Number(row.value)||0)}</strong><small>${row.value_raw||''}</small></td>${role.admin||role.mod?`<td>${row.email||''}</td>`:''}<td>${row.created_at?new Date(row.created_at).toLocaleString():''}</td>${role.admin?`<td><button class="btn secondary" data-galactic-edit="${row.id}">Edit</button><button class="btn danger" data-galactic-delete="${row.id}">Delete</button></td>`:''}</tr>`).join('')||`<tr><td colspan="${role.admin?6:role.mod?5:4}" class="empty">No Galactic reports yet.</td></tr>`;const draw=()=>{const type=document.querySelector('#galacticType'),droid=document.querySelector('#galacticDroid'),badge=document.querySelector('#galacticRoleBadge'),note=document.querySelector('#galacticReportNotice'),admin=document.querySelector('#galacticAdminTools'),head=document.querySelector('#galacticReportHead'),body=document.querySelector('#galacticRows');if(!type)return;const selectedType=type.value||types[0]||'';type.innerHTML=types.map(x=>`<option value="${x}" ${x===selectedType?'selected':''}>${x}</option>`).join('');droid.innerHTML=droidsFor(selectedType).map(x=>`<option value="${x.name}">${x.name}</option>`).join('');badge.textContent=role.admin?'Admin view':role.mod?'Mod view':cloudConnected()?'My submissions':'Local only';badge.classList.toggle('local',!cloudConnected());note.innerHTML=notice||(!cloudConnected()?`Sign in to submit shared reports. Local-only entries are stored on this device.`:role.admin||role.mod?`You can view all Galactic reports.${role.admin?' Admin controls are enabled.':' Moderator view is read-only.'}`:`Only your own submissions are shown here.`);admin.hidden=!role.admin;head.innerHTML=`<tr><th>Droid</th><th>Report</th><th>Value</th>${role.admin||role.mod?'<th>Submitted by</th>':''}<th>Submitted</th>${role.admin?'<th>Actions</th>':''}</tr>`;body.innerHTML=renderRows();body.querySelectorAll('[data-galactic-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this Galactic report?'))return;try{await deleteGalacticReport(b.dataset.galacticDelete);toast('Report deleted');await refresh()}catch(e){toast(e.message)}});body.querySelectorAll('[data-galactic-edit]').forEach(b=>b.onclick=async()=>{const current=rows.find(x=>x.id===b.dataset.galacticEdit),next=prompt('Update value',current?.value_raw||current?.value||'');if(next===null)return;try{await updateGalacticReport(b.dataset.galacticEdit,next);toast('Report updated');await refresh()}catch(e){toast(e.message)}})};const refresh=async()=>{try{role=await galacticRole();rows=await loadGalacticReports(role);notice=role.setupError||''}catch(e){rows=cloudConnected()?[]:galacticLocalReports();notice=e.message}draw()};app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / Galactic Reports</div><section class="galactic-report-hero"><div><p class="eyebrow">Community data</p><h1>Galactic Reports</h1><p class="lead">Report Galactic droid buy costs and earn amounts while the values are still being confirmed.</p></div><span id="galacticRoleBadge" class="report-badge">Loading</span></section><div id="galacticReportNotice" class="notice"></div><form id="galacticReportForm" class="galactic-report-form"><label>Type<select id="galacticType"></select></label><label>Droid<select id="galacticDroid"></select></label><label>Report<select id="galacticKind"><option value="buy_cost">Buy Cost</option><option value="earn_amount">Earn Amount</option></select></label><label>Value<input id="galacticValue" placeholder="12.4k or 12400" required></label><button class="btn" type="submit">Submit report</button></form><section id="galacticAdminTools" class="galactic-mods" hidden><h2>Moderators</h2><form id="galacticModForm"><input id="galacticModEmail" type="email" placeholder="mod@example.com" required><button class="btn secondary" type="submit">Add mod</button></form></section><section class="galactic-report-list"><h2>Reports</h2><table><thead id="galacticReportHead"></thead><tbody id="galacticRows"></tbody></table></section>`;document.querySelector('#galacticType').onchange=draw;document.querySelector('#galacticReportForm').onsubmit=async e=>{e.preventDefault();try{const valueRaw=document.querySelector('#galacticValue').value,value=parseGalacticNumber(valueRaw),droidName=document.querySelector('#galacticDroid').value,droid=state.droids.find(x=>x.name===droidName);if(cloudNeedsLogin())return showAuthModal('signin');await submitGalacticReport({user_id:state.cloud.user?.id||null,email:galacticUserEmail(),droid_name:droidName,droid_type:droid?.type||document.querySelector('#galacticType').value,report_kind:document.querySelector('#galacticKind').value,value_raw:valueRaw,value,updated_at:new Date().toISOString()});document.querySelector('#galacticValue').value='';toast('Report submitted');await refresh()}catch(error){toast(error.message)}};document.querySelector('#galacticModForm').onsubmit=async e=>{e.preventDefault();try{await addGalacticMod(document.querySelector('#galacticModEmail').value);document.querySelector('#galacticModEmail').value='';toast('Mod added');await refresh()}catch(error){toast(error.message)}};draw();await refresh()}
function validateGalacticScreenshotUrl(value){const text=String(value||'').trim();if(!text)return'';let url;try{url=new URL(text)}catch{throw Error('Screenshot must be a Gyazo or Discord image link.')}const host=url.hostname.toLowerCase();if(host.includes('imgur.com'))throw Error('Imgur links will not work as Imgur is blocked in the UK. Please use a Gyazo or Discord image link.');const gyazo=host==='gyazo.com'||host.endsWith('.gyazo.com'),discord=host==='cdn.discordapp.com'||host==='media.discordapp.net'||host.endsWith('.discordapp.net')||host.endsWith('.discordapp.com');if(!gyazo&&!discord)throw Error('Screenshot must be a Gyazo or Discord image link.');return text}
async function submitGalacticReport(payload){const items=Array.isArray(payload)?payload:[payload];if(cloudConnected()){const {error}=await supabaseClient.from(galacticReportTable()).insert(items);if(error)throw Error(error.message);return}const rows=galacticLocalReports(),now=new Date().toISOString();rows.unshift(...items.map(item=>({...item,id:cloudId(),email:'Local only',created_at:now,updated_at:now})));saveGalacticLocalReports(rows)}
function showGalacticReportModal(onDone){const root=document.querySelector('#modalRoot'),allowed=state.droids.filter(d=>!isIconic(d)).sort((a,b)=>a.name.localeCompare(b.name));let items=[],picking=false,screenshotUrl='';const rowHtml=(item,i)=>`<article class="galactic-report-row"><button class="btn danger" data-report-remove="${i}" type="button">Remove</button><div><strong>${item.name}</strong><small>${item.type}</small></div><label>Report<select data-report-kind="${i}"><option value="buy_cost" ${item.report_kind==='buy_cost'?'selected':''}>Buy Cost</option><option value="earn_amount" ${item.report_kind==='earn_amount'?'selected':''}>Earn Amount</option></select></label><label>Value<input data-report-value="${i}" placeholder="12.4k or 12400"></label></article>`;const draw=()=>{root.innerHTML=`<div class="modal-backdrop"><section class="modal galactic-report-modal" role="dialog" aria-modal="true"><p class="eyebrow">Galactic Reports</p><h2>Submit Galactic values</h2><p class="picker-hint">Add one or more droids, enter the known values, and attach an optional Gyazo or Discord image link.</p><div class="galactic-report-selected">${items.map(rowHtml).join('')||'<div class="empty">No droids selected yet.</div>'}</div><label class="field">Screenshot link<input id="galacticScreenshotUrl" class="form-control" placeholder="Gyazo or Discord image link"></label><p id="galacticReportError" class="form-error" role="alert"></p><div class="modal-actions"><button class="btn secondary" id="addGalacticReportDroid" type="button">Add droid</button><button class="btn" id="sendGalacticReport" type="button" ${items.length?'':'disabled'}>Submit report</button><button class="btn ghost" id="cancelGalacticReport" type="button">Cancel</button></div><div id="galacticReportPicker"></div></section></div>`;items.forEach((item,i)=>{root.querySelector(`[data-report-kind="${i}"]`).onchange=e=>item.report_kind=e.target.value;const valueInput=root.querySelector(`[data-report-value="${i}"]`);valueInput.value=item.value_raw||'';valueInput.oninput=e=>item.value_raw=e.target.value;root.querySelector(`[data-report-remove="${i}"]`).onclick=()=>{items.splice(i,1);draw()}});const proof=root.querySelector('#galacticScreenshotUrl');proof.value=screenshotUrl;proof.oninput=e=>screenshotUrl=e.target.value;root.querySelector('#cancelGalacticReport').onclick=()=>root.innerHTML='';root.querySelector('#addGalacticReportDroid').onclick=()=>{picking=true;drawPicker()};root.querySelector('#sendGalacticReport').onclick=async()=>{const error=root.querySelector('#galacticReportError');try{if(!items.length)throw Error('Add at least one droid.');const screenshot_url=validateGalacticScreenshotUrl(root.querySelector('#galacticScreenshotUrl').value),report_group_id=cloudId(),payload=items.map(item=>{const value=parseGalacticNumber(item.value_raw),droid=state.droids.find(x=>x.name===item.name);return{user_id:state.cloud.user?.id||null,email:galacticUserEmail(),droid_name:item.name,droid_type:droid?.type||item.type,report_kind:item.report_kind,value_raw:item.value_raw,value,screenshot_url,report_group_id,updated_at:new Date().toISOString()}});if(cloudNeedsLogin())return showAuthModal('signin');await submitGalacticReport(payload);root.innerHTML='';toast(`${payload.length} report${payload.length===1?'':'s'} submitted`);onDone?.()}catch(e){error.textContent=e.message}};if(picking)drawPicker()};const drawPicker=()=>{const picker=root.querySelector('#galacticReportPicker');picker.innerHTML=`<div class="galactic-picker"><input id="galacticPickerSearch" class="form-control picker-search" placeholder="Search droids..." autofocus><div id="galacticPickerResults" class="picker-results"></div></div>`;const render=()=>{const q=root.querySelector('#galacticPickerSearch').value.toLowerCase();root.querySelector('#galacticPickerResults').innerHTML=allowed.filter(d=>d.name.toLowerCase().includes(q)||d.type.toLowerCase().includes(q)).map(d=>`<button class="picker-droid" data-galactic-pick="${d.name}"><span>${picture(d,'GALACTIC')}</span><b>${d.name}</b><small>${rarityText(d.rarity)} · ${d.type}</small></button>`).join('')||'<p class="roster-empty">No matching droids.</p>';root.querySelectorAll('[data-galactic-pick]').forEach(b=>b.onclick=()=>{const d=state.droids.find(x=>x.name===b.dataset.galacticPick);items.push({name:d.name,type:d.type,report_kind:'buy_cost',value_raw:''});picking=false;draw()})};root.querySelector('#galacticPickerSearch').oninput=render;render()};draw()}
async function galacticReportsPage(){let role={admin:false,mod:false,shared:false},rows=[],notice='';const kindLabel=x=>x==='buy_cost'?'Buy Cost':'Earn Amount';const renderRows=()=>rows.map(row=>`<tr><td><strong>${row.droid_name}</strong><small>${row.droid_type}${row.report_group_id?` · Batch ${String(row.report_group_id).slice(0,8)}`:''}</small></td><td>${kindLabel(row.report_kind)}</td><td><strong>${fmt(Number(row.value)||0)}</strong><small>${row.value_raw||''}</small></td><td>${row.screenshot_url?`<a href="${row.screenshot_url}" target="_blank" rel="noopener">Screenshot</a>`:'-'}</td>${role.admin||role.mod?`<td>${row.email||''}</td>`:''}<td>${row.created_at?new Date(row.created_at).toLocaleString():''}</td>${role.admin?`<td><button class="btn secondary" data-galactic-edit="${row.id}">Edit</button><button class="btn danger" data-galactic-delete="${row.id}">Delete</button></td>`:''}</tr>`).join('')||`<tr><td colspan="${role.admin?7:role.mod?6:5}" class="empty">No Galactic reports yet.</td></tr>`;const draw=()=>{const badge=document.querySelector('#galacticRoleBadge'),note=document.querySelector('#galacticReportNotice'),admin=document.querySelector('#galacticAdminTools'),head=document.querySelector('#galacticReportHead'),body=document.querySelector('#galacticRows');if(!badge)return;badge.textContent=role.admin?'Admin view':role.mod?'Mod view':cloudConnected()?'My submissions':'Local only';badge.classList.toggle('local',!cloudConnected());note.innerHTML=notice||(!cloudConnected()?`Sign in to submit shared reports. Local-only entries are stored on this device.`:role.admin||role.mod?`You can view all Galactic reports.${role.admin?' Admin controls are enabled.':' Moderator view is read-only.'}`:`Only your own submissions are shown here.`);admin.hidden=!role.admin;head.innerHTML=`<tr><th>Droid</th><th>Report</th><th>Value</th><th>Proof</th>${role.admin||role.mod?'<th>Submitted by</th>':''}<th>Submitted</th>${role.admin?'<th>Actions</th>':''}</tr>`;body.innerHTML=renderRows();body.querySelectorAll('[data-galactic-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this Galactic report?'))return;try{await deleteGalacticReport(b.dataset.galacticDelete);toast('Report deleted');await refresh()}catch(e){toast(e.message)}});body.querySelectorAll('[data-galactic-edit]').forEach(b=>b.onclick=async()=>{const current=rows.find(x=>x.id===b.dataset.galacticEdit),next=prompt('Update value',current?.value_raw||current?.value||'');if(next===null)return;try{await updateGalacticReport(b.dataset.galacticEdit,next);toast('Report updated');await refresh()}catch(e){toast(e.message)}})};const refresh=async()=>{try{role=await galacticRole();rows=await loadGalacticReports(role);notice=role.setupError||''}catch(e){rows=cloudConnected()?[]:galacticLocalReports();notice=e.message}draw()};app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / Galactic Reports</div><section class="galactic-report-hero"><div><p class="eyebrow">Community data</p><h1>Galactic Reports</h1><p class="lead">Report Galactic droid buy costs and earn amounts while the values are still being confirmed.</p></div><span id="galacticRoleBadge" class="report-badge">Loading</span></section><div id="galacticReportNotice" class="notice"></div><div class="galactic-report-actions"><button class="btn" id="openGalacticReportModal">New report</button></div><section id="galacticAdminTools" class="galactic-mods" hidden><h2>Moderators</h2><form id="galacticModForm"><input id="galacticModEmail" type="email" placeholder="mod@example.com" required><button class="btn secondary" type="submit">Add mod</button></form></section><section class="galactic-report-list"><h2>Reports</h2><table><thead id="galacticReportHead"></thead><tbody id="galacticRows"></tbody></table></section>`;document.querySelector('#openGalacticReportModal').onclick=()=>showGalacticReportModal(refresh);document.querySelector('#galacticModForm').onsubmit=async e=>{e.preventDefault();try{await addGalacticMod(document.querySelector('#galacticModEmail').value);document.querySelector('#galacticModEmail').value='';toast('Mod added');await refresh()}catch(error){toast(error.message)}};draw();await refresh()}
async function todoPage(){app.querySelector('.archive-timers')?.remove();let filter='open',tasks=[];app.innerHTML='<div class="loading">Loading development list...</div>';try{const response=await fetch(`data/dev-todos.json?${Date.now()}`);if(!response.ok)throw Error('Unable to load the development list.');tasks=await response.json();if(!Array.isArray(tasks))throw Error('The development list is not valid.');tasks=[...tasks,...patchTodoTasks()]}catch(error){app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / To Do List</div><h1>To Do List</h1><div class="notice todo-error">${error.message}</div>`;return}const render=()=>{const list=tasks.filter(x=>filter==='all'||filter==='done'?filter==='all'||x.done:!x.done);app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / To Do List</div><section class="todo-head dev-todo-head"><div><p class="eyebrow">Development roadmap</p><h1>To Do List</h1><p class="lead">Planned work and completed updates for Droid Archives. This list is maintained by RSSaltea and is visible to everyone.</p></div><a class="btn secondary todo-edit" href="https://github.com/RSSaltea/DroidArchives/edit/main/data/dev-todos.json" target="_blank" rel="noopener">Edit list on GitHub</a></section><div class="todo-help"><strong>Adding a task:</strong> open the editor, copy an existing object, give it a unique ID and description, then commit the change. Patch notes can also add To Do items by including a <code>todo</code> block in <code>data/patch-notes.json</code>.</div><div class="todo-toolbar"><div>${['open','done','all'].map(x=>`<button data-todo-filter="${x}" class="${filter===x?'active':''}">${x[0].toUpperCase()+x.slice(1)}</button>`).join('')}</div><span>${tasks.filter(x=>!x.done).length} remaining</span></div><div class="todo-list">${list.map(x=>`<article class="todo-item ${x.done?'done':''} ${x.patchNote?'patch-note-task':''}"><span class="todo-status ${x.done?'done':'open'}">${x.done?'Done':'Open'}</span><span>${x.text}${x.patchNote?'<small>Patch note</small>':''}</span></article>`).join('')||'<div class="empty">No tasks in this view.</div>'}</div>`;document.querySelectorAll('[data-todo-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.todoFilter;render()})};render()}
let novaShopPage,novaDetailPage;
(function () {
  const CATEGORY_ICONS = {
    featured: 'critical-chance',
    core: 'max-health',
    workshop: 'blueprint-vendor',
    cosmetic: 'nova-crystal-base-paint',
    'lobby-boosts': 'luck-boost-token',
  };

  const iconHtml = (item, className = '') => {
    const icon = item?.icon || '';
    return /^(?:assets\/|https?:\/\/)/.test(icon)
      ? `<img class="${className}" src="${icon}" alt="">`
      : `<span class="${className}">${icon || '?'}</span>`;
  };

  const categoryIcon = category => {
    if (category.id === 'planner') return '<span class="nova-planner-icon" aria-hidden="true">Σ</span>';
    if (category.id === 'iconic') {
      const droid = state.droids.find(item => item.name === 'R2-D2') || state.droids.find(item => item.rarity === 'ICONIC');
      return droid ? picture(droid, 'DEFAULT') : '<span>★</span>';
    }
    return iconHtml(novaUpgrade(CATEGORY_ICONS[category.id]));
  };

  const upgradeTotal = (upgrade, level = upgrade.levels.length) => upgrade.repeatable
    ? (Number(upgrade.levels?.[0]?.cost) || 0) * level
    : upgrade.levels.slice(0, level).reduce((total, item) => total + (Number(item.cost) || 0), 0);

  const iconicItems = () => state.droids
    .filter(droid => droid.rarity === 'ICONIC')
    .map(droid => ({
      id: `iconic-${slug(droid.name)}`,
      name: droid.name,
      category: 'iconic',
      droid,
      description: ICONIC_EFFECTS[droid.name] || 'Limited Iconic Droid.',
      iconic: true,
      novaCrystalCost: droid.novaCrystalCost,
    }));

  const plannerStorageKey = () => `droid-archive-nova-planner:${state.cloud?.activeProfileId || 'local'}`;
  const plannerMaxRebirthKey = () => `${plannerStorageKey()}:max-rebirth`;
  const plannerMaxRebirth = shop => Math.max(12,Math.min(30,Number(localStorage.getItem(plannerMaxRebirthKey()))||30,Math.max(...shop.rebirthRewards.map(reward=>reward.rebirth))));
  const plannerTargets = () => {
    try { return JSON.parse(localStorage.getItem(plannerStorageKey()) || '{}') || {}; }
    catch { return {}; }
  };
  const savePlannerTargets = targets => localStorage.setItem(plannerStorageKey(), JSON.stringify(targets));
  const plannerUpgrades = shop => shop.upgrades.filter(upgrade => !upgrade.repeatable && !upgrade.comingSoon && upgrade.levels?.length);
  const plannerLevelCap = upgrade => upgrade.uncapped ? 10000 : upgrade.levels.length;
  const plannedLevel = (upgrade, targets) => Math.max(novaLevelFor(upgrade.id), Math.min(plannerLevelCap(upgrade), Number(targets[upgrade.id] ?? novaLevelFor(upgrade.id)) || 0));
  const plannedCost = (upgrade, target) => {let total=0;for(let level=novaLevelFor(upgrade.id);level<target;level++)total+=Number(upgrade.levels[level]?.cost ?? (Number(upgrade.costBase)||0)+(Number(upgrade.costScale)||0)*level)||0;return total};

  const renderPlanner = (shop, categories, changeCategory) => {
    const upgrades = plannerUpgrades(shop), targets = plannerTargets(), maxReach = plannerMaxRebirth(shop);
    const rows = upgrades.map(upgrade => ({upgrade, owned:novaLevelFor(upgrade.id), target:plannedLevel(upgrade, targets)}));
    const groups = categories.map(category=>({category,rows:rows.filter(row=>row.upgrade.category===category.id)})).filter(group=>group.rows.length);
    const total = rows.reduce((sum, row) => sum + plannedCost(row.upgrade, row.target), 0);
    const changed = rows.filter(row => row.target > row.owned).length;
    const options = shop.rebirthRewards.map(reward => ({...reward, runs:total ? Math.ceil(total / reward.novaCrystals) : 0}));
    const reachableOptions = options.filter(option=>option.rebirth<=maxReach);
    const ranked = [...reachableOptions].sort((a,b)=>a.runs-b.runs||b.novaCrystals-a.novaCrystals);
    const fastestRuns = ranked[0]?.runs || 0;
    const suggestions = ranked.slice(0,3);
    const stepper=(upgrade,value,field,min)=>`<div class="nova-plan-stepper"><button type="button" data-plan-step="${upgrade.id}" data-plan-field="${field}" data-plan-delta="-1" aria-label="Decrease ${upgrade.name} ${field}" ${value<=min?'disabled':''}>−</button><input type="number" min="${min}" ${upgrade.uncapped?'':`max="${upgrade.levels.length}"`} value="${value}" data-plan-${field}="${upgrade.id}" aria-label="${upgrade.name} ${field} level"><button type="button" data-plan-step="${upgrade.id}" data-plan-field="${field}" data-plan-delta="1" aria-label="Increase ${upgrade.name} ${field}" ${value>=plannerLevelCap(upgrade)?'disabled':''}>+</button></div>`;
    app.innerHTML = `<div class="breadcrumbs"><a href="#/">Homepage</a> / Nova Shop / Planner</div>
      <section class="nova-command nova-planner-command">
        <header class="nova-command-head"><div><p class="eyebrow">Nova upgrades</p><h1>Nova Shop Planner</h1><p>Choose what you own and where you want each perk to end up.</p></div><div class="nova-currency"><img src="${shop.currency.icon}" alt=""><span>${fmt(total)} needed</span></div></header>
        <div class="nova-planner-toolbar"><button class="btn secondary" data-nova-category="featured">← Back to Nova Shop</button><span>Targets and reachable rebirth are saved separately for this profile.</span><button class="btn ghost" id="resetNovaPlan" ${changed?'':'disabled'}>Reset targets</button></div>
        <div class="nova-reach-setting"><div><small>Route limit</small><strong>Highest rebirth you can reach</strong><span>The quickest option will not recommend anything above this level.</span></div><label for="novaMaxReach">Plan up to<select id="novaMaxReach">${options.map(option=>`<option value="${option.rebirth}" ${option.rebirth===maxReach?'selected':''}>RB ${option.rebirth} · ${option.novaCrystals} Nova</option>`).join('')}</select></label></div>
        <div class="nova-planner-summary"><div><small>Nova required</small><strong>${fmt(total)}</strong><span>to complete this plan</span></div><div><small>Perks changing</small><strong>${changed}</strong><span>of ${rows.length} tracked perks</span></div><div><small>Quickest option</small><strong>${total ? `RB ${ranked[0].rebirth} × ${ranked[0].runs}` : 'All done'}</strong><span>${total?`${ranked[0].novaCrystals} Nova per run`:'No Nova still needed'}</span></div></div>
        <div class="nova-planner-groups">${groups.map(({category,rows:categoryRows})=>`<section class="nova-plan-group"><header>${categoryIcon(category)}<div><h2>${category.name}</h2><span>${categoryRows.length} perk${categoryRows.length===1?'':'s'}</span></div></header><div class="nova-plan-card-grid">${categoryRows.map(({upgrade,owned,target})=>{const cost=plannedCost(upgrade,target);return `<article class="nova-plan-card ${target>owned?'planned':''}"><header>${iconHtml(upgrade)}<div><h3>${upgrade.name}</h3><span>${upgrade.uncapped?'No level cap':`${upgrade.levels.length} level${upgrade.levels.length===1?'':'s'}`}</span></div><strong>${cost?`${fmt(cost)} Nova`:'No cost'}</strong></header><div class="nova-plan-controls"><label><span>Owned now</span>${stepper(upgrade,owned,'owned',minimumNovaLevel(upgrade.id))}</label><span class="nova-plan-arrow" aria-hidden="true">→</span><label><span>Target level</span>${stepper(upgrade,target,'target',owned)}</label></div></article>`}).join('')}</div></section>`).join('')}</div>
      </section>
      <section class="nova-srb-planner"><header><div><p class="eyebrow">Super Rebirth routes</p><h2>How many runs will the plan take?</h2><p>Showing every route from RB12 to your selected limit of RB${maxReach}. Every figure is rounded up to a complete run.</p></div><strong>${fmt(total)} Nova target</strong></header>${total?`<div class="nova-route-options">${suggestions.map((option,index)=>`<article class="${index===0?'best':''}"><small>${index===0?'Quickest':'Alternative'}</small><strong>${option.runs} SRB${option.runs===1?'':'s'}</strong><span>Reach RB ${option.rebirth} · ${option.novaCrystals} Nova each</span></article>`).join('')}</div>`:'<div class="nova-plan-complete">Your owned levels already cover every target in this plan.</div>'}<h3>RB12–RB${maxReach} breakdown</h3><div class="nova-srb-levels">${reachableOptions.map(option=>`<article class="${total&&option.runs===fastestRuns?'fastest':''}"><strong>RB ${option.rebirth}</strong><span>${option.novaCrystals} Nova/run</span><b>${option.runs} SRB${option.runs===1?'':'s'}</b></article>`).join('')}</div></section>`;
    const updatePlanLevel=(upgrade,field,value)=>{const level=Math.max(field==='owned'?minimumNovaLevel(upgrade.id):novaLevelFor(upgrade.id),Math.min(plannerLevelCap(upgrade),Number(value)||0));if(field==='owned'){setNovaLevel(upgrade.id,level,false);if(Number(targets[upgrade.id])<level)targets[upgrade.id]=level}else targets[upgrade.id]=level;savePlannerTargets(targets);renderPlanner(shop,categories,changeCategory)};
    document.querySelector('[data-nova-category]')?.addEventListener('click',button=>changeCategory(button.currentTarget.dataset.novaCategory));
    document.querySelector('#novaMaxReach')?.addEventListener('change',event=>{localStorage.setItem(plannerMaxRebirthKey(),event.target.value);renderPlanner(shop,categories,changeCategory)});
    document.querySelector('#resetNovaPlan')?.addEventListener('click',()=>{savePlannerTargets({});renderPlanner(shop,categories,changeCategory)});
    document.querySelectorAll('[data-plan-owned],[data-plan-target]').forEach(input=>input.onchange=()=>{const field=input.hasAttribute('data-plan-owned')?'owned':'target',id=input.dataset.planOwned||input.dataset.planTarget;updatePlanLevel(novaUpgrade(id),field,input.value)});
    document.querySelectorAll('[data-plan-step]').forEach(button=>button.onclick=()=>{const upgrade=novaUpgrade(button.dataset.planStep),field=button.dataset.planField,current=field==='owned'?novaLevelFor(upgrade.id):plannedLevel(upgrade,targets);updatePlanLevel(upgrade,field,current+Number(button.dataset.planDelta))});
  };

  novaShopPage = function novaShopPage(selectedFromRoute) {
    let category = localStorage.getItem('droid-archive-nova-category') || 'featured';
    let selectedId = selectedFromRoute || localStorage.getItem('droid-archive-nova-selected') || '';

    const render = () => {
      const shop = state.novaShop;
      if (!shop) {
        app.innerHTML = '<h1>Nova Shop unavailable</h1>';
        return;
      }
      const categories = shop.categories;
      const categoryItems = [...categories,{id:'planner',name:'Planner'}];
      if (!categoryItems.some(item => item.id === category)) category = categories[0]?.id || 'core';
      if(category === 'planner'){
        localStorage.setItem('droid-archive-nova-category', category);
        renderPlanner(shop,categoryItems,nextCategory=>{category=nextCategory;selectedId='';render()});
        return;
      }
      const list = category === 'iconic' ? iconicItems() : shop.upgrades.filter(item => item.category === category);
      let selected = list.find(item => item.id === selectedId) || list[0];
      selectedId = selected?.id || '';
      localStorage.setItem('droid-archive-nova-category', category);
      localStorage.setItem('droid-archive-nova-selected', selectedId);

      const selectedLevel = selected && !selected.iconic ? novaLevelFor(selected.id) : 0;
      const selectedCategory = categories.find(item => item.id === category);
      const maxLabel = selected?.uncapped ? '∞' : selected?.levels?.length || 0;
      const detailRows = selected && !selected.iconic
        ? selected.repeatable
          ? `<tr class="${selectedLevel?'owned':''}"><td>Each token</td><td>${novaCost(selected.levels[0])}</td><td>${selected.levels[0]?.reward||'—'}</td><td>${fmt(upgradeTotal(selected,selectedLevel))}</td></tr>`
          : selected.levels.map((level, index) => `<tr class="${index < selectedLevel ? 'owned' : ''}"><td>Level ${level.level}</td><td>${novaCost(level)}</td><td>${level.reward || '—'}</td><td>${fmt(upgradeTotal(selected, index + 1))}</td></tr>`).join('')
        : '';

      app.innerHTML = `<div class="breadcrumbs"><a href="#/">Homepage</a> / Nova Shop</div>
        <section class="nova-command">
          <header class="nova-command-head">
            <div><p class="eyebrow">Nova upgrades</p><h1>Nova Shop</h1><p>Track every upgrade, its reward, and your current level.</p></div>
            <div class="nova-currency"><img src="${shop.currency.icon}" alt=""><span>${shop.currency.name}s</span></div>
          </header>
          <div class="nova-command-grid">
            <nav class="nova-category-rail" aria-label="Nova Shop categories">
              ${categoryItems.map(item => `<button data-nova-category="${item.id}" class="${item.id === category ? 'active' : ''}">${categoryIcon(item)}<span>${item.name}</span></button>`).join('')}
            </nav>
            <section class="nova-catalogue">
              <header><div>${categoryIcon(selectedCategory)}</div><h2>${selectedCategory?.name || category}</h2><span>${list.length} entries</span></header>
              <div class="nova-upgrade-list">${list.map(item => {
                const level = item.iconic ? 0 : novaLevelFor(item.id);
                 const progress = item.iconic ? (item.novaCrystalCost != null ? `${fmt(item.novaCrystalCost)} Nova` : 'Limited') : item.comingSoon ? 'Coming soon' : item.repeatable ? `${level} owned` : `${level}/${item.uncapped ? '∞' : item.levels.length}`;
                return `<button data-nova-select="${item.id}" class="nova-upgrade-row ${item.id === selectedId ? 'active' : ''}">${item.iconic ? picture(item.droid, 'DEFAULT') : iconHtml(item)}<span><strong>${item.name}</strong><small>${progress}</small></span></button>`;
              }).join('')}</div>
            </section>
            <aside class="nova-detail-panel">${selected ? selected.iconic ? `
              <div class="nova-detail-summary">${picture(selected.droid, 'DEFAULT')}<div><small>Iconic Droid</small><h2>${selected.name}</h2><p>${selected.description}</p></div></div>
              <dl class="nova-iconic-facts"><div><dt>Type</dt><dd>${selected.droid.type}</dd></div><div><dt>Income</dt><dd>${Math.round(iconicIncome(selected.droid) * 100)}%/s</dd></div><div><dt>Nova cost</dt><dd>${selected.novaCrystalCost != null ? `${fmt(selected.novaCrystalCost)} Nova` : 'Limited event'}</dd></div></dl>
              <a class="btn" href="#/droid/${slug(selected.name)}">Open droid page</a>` : `
               <div class="nova-detail-summary">${iconHtml(selected)}<div><small>${selected.repeatable?'Consumable token':`${maxLabel} level${maxLabel === 1 ? '' : 's'}`}</small><h2>${selected.name}</h2><p>${selected.description}</p>${selected.prerequisite ? `<em>Requires ${selected.prerequisite}</em>` : ''}</div></div>
               <div class="nova-level-control"><button class="btn secondary" id="novaLevelDown" ${selectedLevel <= minimumNovaLevel(selected.id) || selected.comingSoon ? 'disabled' : ''}>−</button><span><small>${selected.repeatable?'Owned':'Tracked level'}</small><strong>${selected.comingSoon ? 'Soon' : selected.repeatable?selectedLevel:`${selectedLevel}/${maxLabel}`}</strong></span><button class="btn" id="novaLevelUp" ${selected.comingSoon || (!selected.uncapped && selectedLevel >= selected.levels.length) ? 'disabled' : ''}>+</button></div>
              <div class="nova-level-table"><table><thead><tr><th>Level</th><th>Cost</th><th>Reward at this level</th><th>Total spent</th></tr></thead><tbody>${detailRows}</tbody></table></div>` : '<p>No entries in this category.</p>'}</aside>
          </div>
        </section>
        <details class="nova-rebirth-rewards"><summary>Nova crystals from rebirths</summary><div><table class="nova-reward-table"><thead><tr><th>Rebirth</th><th>Nova Crystals</th><th>Credit Mult</th><th>XP Mult</th></tr></thead><tbody>${shop.rebirthRewards.map(reward => `<tr><td>RB ${reward.rebirth}</td><td>${reward.novaCrystals}</td><td>${reward.creditMultPercent}%</td><td>${reward.xpMultPercent}%</td></tr>`).join('')}</tbody></table></div></details>`;

      document.querySelectorAll('[data-nova-category]').forEach(button => button.onclick = () => {
        category = button.dataset.novaCategory;
        selectedId = '';
        render();
      });
      document.querySelectorAll('[data-nova-select]').forEach(button => button.onclick = () => {
        selectedId = button.dataset.novaSelect;
        render();
      });
      document.querySelector('#novaLevelDown')?.addEventListener('click', () => {
        setNovaLevel(selected.id, selectedLevel - 1);
        render();
      });
      document.querySelector('#novaLevelUp')?.addEventListener('click', () => {
        setNovaLevel(selected.id, selectedLevel + 1);
        render();
      });
    };
    render();
  };

  novaDetailPage = function novaDetailPage(id) {
    const upgrade = novaUpgrade(id);
    if (!upgrade) {
      notFound();
      return;
    }
    localStorage.setItem('droid-archive-nova-category', upgrade.category);
    novaShopPage(id);
  };
}());

function cantinaShopPage(){
  let category=localStorage.getItem('droid-archive-cantina-category')||'boosts',selectedId=localStorage.getItem('droid-archive-cantina-selected')||'';
  const render=()=>{
    const shop=state.cantinaShop;
    if(!shop){app.innerHTML='<h1>Cantina Shop unavailable</h1>';return}
    if(!shop.categories.some(item=>item.id===category))category=shop.categories[0]?.id||'boosts';
    const list=shop.items.filter(item=>item.category===category),selected=list.find(item=>item.id===selectedId)||list[0];
    selectedId=selected?.id||'';localStorage.setItem('droid-archive-cantina-category',category);localStorage.setItem('droid-archive-cantina-selected',selectedId);
    const owned=Boolean(selected&&state.cantinaPurchases?.[selected.id]),details=(selected?.details||[]).map(detail=>`<li>${detail}</li>`).join(''),duration=selected?.durationMinutes?`${selected.durationMinutes} minutes`:'Permanent',novaUnlocks=(selected?.novaUnlocks||[]).map(id=>novaUpgrade(id)?.name||id).join(', ');
    const vbucksIcon='<img src="assets/other/VBucks.png" alt="V-Bucks">',priceHtml=item=>`<span class="cantina-vbucks">${vbucksIcon}${fmt(item.vbucksCost)}</span>${item.novaCost!=null?`<span class="cantina-nova"><img src="${state.novaShop?.currency?.icon||'assets/events/nova-crystal.png'}" alt="">${fmt(item.novaCost)} Nova</span>`:''}`;
    app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / Cantina Shop</div><section class="cantina-hero"><div><p class="eyebrow">Premium shop reference</p><h1>Cantina Shop</h1><p>Compare V-Bucks offers and the Nova Crystal tokens used by temporary lobby boosts.</p></div><span class="cantina-currency">${vbucksIcon} V-Bucks</span></section><div class="cantina-tabs">${shop.categories.map(item=>`<button data-cantina-category="${item.id}" class="${item.id===category?'active':''}">${item.name}</button>`).join('')}</div><div class="cantina-layout"><section class="cantina-grid">${list.map(item=>`<button class="cantina-card ${item.id===selectedId?'active':''} ${state.cantinaPurchases?.[item.id]?'owned':''}" data-cantina-select="${item.id}"><span class="cantina-card-art">${item.icon?`<img src="${item.icon}" alt="">`:vbucksIcon}</span><span><strong>${item.name}</strong><small>${item.durationMinutes?`${item.durationMinutes} min`:'Permanent bundle'}</small></span><span class="cantina-card-prices">${priceHtml(item)}</span>${state.cantinaPurchases?.[item.id]?'<em>Owned</em>':''}</button>`).join('')}</section><aside class="cantina-detail">${selected?`<div class="cantina-detail-head">${selected.icon?`<img src="${selected.icon}" alt="">`:vbucksIcon}<div><small>${shop.categories.find(item=>item.id===selected.category)?.name||selected.category}</small><h2>${selected.name}</h2></div></div><p>${selected.description}</p>${details?`<ul>${details}</ul>`:''}<dl><div><dt>V-Bucks cost</dt><dd><span class="cantina-vbucks">${vbucksIcon}${fmt(selected.vbucksCost)}</span></dd></div>${selected.novaCost!=null?`<div><dt>Nova token cost</dt><dd><span class="cantina-nova"><img src="${state.novaShop?.currency?.icon||'assets/events/nova-crystal.png'}" alt="">${fmt(selected.novaCost)} Nova Crystals</span></dd></div>`:''}<div><dt>Duration</dt><dd>${duration}</dd></div></dl>${selected.category==='packs'?`<label class="cantina-owned-toggle"><input id="cantinaOwned" type="checkbox" ${owned?'checked':''}><span>I own the ${selected.name}</span></label><p class="cantina-unlock-note">Owning this pack automatically tracks ${novaUnlocks} in the Nova Shop.</p>`:`<a class="btn secondary" href="#/nova-shop/${selected.novaUpgradeId}">View this token in Nova Shop</a>`}`:'<p>No item selected.</p>'}</aside></div>`;
    document.querySelectorAll('[data-cantina-category]').forEach(button=>button.onclick=()=>{category=button.dataset.cantinaCategory;selectedId='';render()});
    document.querySelectorAll('[data-cantina-select]').forEach(button=>button.onclick=()=>{selectedId=button.dataset.cantinaSelect;render()});
    document.querySelector('#cantinaOwned')?.addEventListener('change',event=>{state.cantinaPurchases[selected.id]=event.target.checked;if(!event.target.checked)delete state.cantinaPurchases[selected.id];syncCantinaPackUpgrades();save();toast(event.target.checked?`${selected.name} marked owned`:`${selected.name} marked not owned`);render()});
  };
  render()
}

const galacticReportsOpenPage=galacticReportsPage;
galacticReportsPage=()=>{app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / Galactic Reports</div><section class="galactic-report-hero"><div><p class="eyebrow">Community data</p><h1>Galactic Reports</h1><p class="lead">We have everything needed, thank you for everyone who contributed!</p></div><span class="report-badge">Complete</span></section>`};

function droidCalcPage(){
  const render=()=>{
    const p=placements();
    app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / Droid Calc</div><section class="droid-calc-hero"><p class="eyebrow">Base calculator</p><h1>Droid Calc</h1><p class="lead">Choose a productive Base card and find the first useful quality of every droid that would genuinely improve it.</p></section>${replacementCalculatorHtml(p,{manual:true})}`;
    attachReplacementCalculator(render);
    renderBaseSidebar(render)
  };
  render()
}

async function patchNotesPage(){
  app.querySelector('.archive-timers')?.remove();
  patchNotesPrompted=true;
  app.innerHTML='<div class="loading">Loading patch notes...</div>';
  const notes=state.patchNotes.length?state.patchNotes:await loadPatchNotes();
  state.patchNotes=notes;
  markPatchNotesSeen(notes);
  app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / Patch Notes</div><section class="patch-page-head"><div><p class="eyebrow">Release history</p><h1>Patch Notes</h1><p class="lead">See what has changed in Droid Archives. Select an update to read its complete list of changes.</p></div><strong>${notes.length} update${notes.length===1?'':'s'}</strong></section><div class="patch-page-list">${notes.map((note,index)=>`<details class="patch-page-entry" ${index===0?'open':''}><summary><span class="patch-page-date">${note.date||'Update'}</span><span class="patch-page-summary"><strong>${note.title}</strong>${note.summary?`<small>${note.summary}</small>`:''}</span><span class="patch-page-toggle" aria-hidden="true">+</span></summary><div class="patch-page-body"><h2>Full update</h2>${Array.isArray(note.changes)&&note.changes.length?`<ul>${note.changes.map(change=>`<li>${change}</li>`).join('')}</ul>`:'<p>No additional details were supplied for this update.</p>'}</div></details>`).join('')||'<div class="empty">No patch notes have been published yet.</div>'}</div>`;
}
const showUpdateDialogOnce=showPatchNotesOnce;
showPatchNotesOnce=()=>{showUpdateDialogOnce();const link=document.querySelector('#patchNotesTodo');if(link)link.textContent='View Patch Notes'};
todoPage=patchNotesPage;

let lastRoutePath='';
function donatePage(){app.innerHTML=`<div class="breadcrumbs"><a href="#/">Homepage</a> / Donate</div><section class="donate-hero"><div class="donate-hero-copy"><p class="eyebrow">Support the archives</p><h1>Buy me a coffee</h1><p>Droid Archives is a free community project. If it has helped you plan your base, track your collection, or prepare for rebirths, you can optionally support its continued development.</p><a class="donate-button" href="https://buymeacoffee.com/droidarchives" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">☕</span> Support Droid Archives</a></div><div class="donate-coffee" aria-hidden="true"><span>☕</span></div></section><section class="donate-content"><div class="donate-message"><p class="eyebrow">Thank you</p><h2>Your support helps keep this project going</h2><p>Donations help with the time and costs involved in maintaining droid data, images, calculators, profiles, and new features for the community.</p><div class="donate-disclaimer"><strong>Support only — no rewards or benefits</strong><p>Donating is completely voluntary. You will not receive in-game items, site features, account benefits, priority support, or anything else in return. Your donation only supports the continued upkeep and development of Droid Archives.</p></div><p class="donate-free"><strong>Droid Archives remains free for everyone.</strong></p></div><a class="donate-qr-card" href="https://buymeacoffee.com/droidarchives" target="_blank" rel="noopener noreferrer" aria-label="Open the Droid Archives Buy Me a Coffee page"><span>Scan to support</span><img src="assets/other/bmc_qr.png" alt="QR code for the Droid Archives Buy Me a Coffee page"><small>buymeacoffee.com/droidarchives</small></a></section>`}
// ─── Slot choice log ────────────────────────────────────────────────────────
// One row per observed placement: where the droid started, which slots were free
// at that moment, and which one the game gave it. Kept in its own localStorage
// key rather than in the profile — it is research data, it can get long, and
// putting it in the profile would mean touching export, import, validate and the
// cloud schema, any of which could lose a Base. Export from the Slot Lab instead.
const SLOT_LOG_KEY='droid-archive-slot-log';
// Landings you have recorded against the plan on screen. Kept in localStorage
// rather than in memory: tabbing out lets the Supabase session refresh, which
// reloads the profile, and that used to wipe every recording. The dropdowns all
// reset to their placeholder and, worse, the free-slot lists further down the
// plan silently went back to offering slots an earlier step had already taken.
//   Scoped to the profile that produced them, so switching profile shows an empty
// set without anything having to be cleared, and switching back finds them again.
const SLOT_SESSION_KEY='droid-archive-slot-session';
const SLOT_SESSION_MAX=400;
const slotSessionProfile=()=>activeProfile()?.id||'local';
const slotSessionRead=()=>{
  const empty={profileId:slotSessionProfile(),entries:{}};
  try{const store=JSON.parse(localStorage.getItem(SLOT_SESSION_KEY)||'null');
    return store&&store.entries&&store.profileId===slotSessionProfile()?store:empty}
  catch(e){return empty}
};
const slotSessionWrite=store=>{try{localStorage.setItem(SLOT_SESSION_KEY,JSON.stringify(store))}catch(e){}};
const slotLogSession={
  get:text=>slotSessionRead().entries[text]||undefined,
  set(text,spot){
    const store=slotSessionRead();
    delete store.entries[text];store.entries[text]=spot;
    // Insertion-ordered, so trimming the front drops the oldest recordings.
    const keys=Object.keys(store.entries);
    for(const stale of keys.slice(0,Math.max(0,keys.length-SLOT_SESSION_MAX)))delete store.entries[stale];
    slotSessionWrite(store);
  },
  clear(){slotSessionWrite({profileId:slotSessionProfile(),entries:{}})}
};
const slotLogAll=()=>{try{
  const stored=JSON.parse(localStorage.getItem(SLOT_LOG_KEY)||'[]');
  if(!Array.isArray(stored))return[];
  const mine=stored.filter(row=>!row.shared);
  if(mine.length!==stored.length)slotLogWrite(mine);
  return mine;
}catch(e){return[]}};
const slotLogWrite=rows=>{try{localStorage.setItem(SLOT_LOG_KEY,JSON.stringify(rows.slice(-4000)))}catch(e){}};
const slotLogClear=()=>slotLogWrite([]);
const slotLogTracking=()=>{try{return localStorage.getItem('droid-archive-slot-track')==='1'}catch(e){return false}};
const slotLogSetTracking=on=>{try{localStorage.setItem('droid-archive-slot-track',on?'1':'0')}catch(e){}};
// Which slots are free right now, ignoring any this plan has already filled —
// those are gone by the time the next droid is sent.
//   For a droid sent to work the station is part of what is being measured, so
// every station that takes a worker is offered; narrowing it to the planned one
// would throw away the answer. For a droid sent to the Lounge the station is not
// in doubt, only the slot, so the caller passes just that.
function slotLogFree(taken,freed,stations=WORK_STATIONS){
  const placed=placements().placed,out=[];
  const key=spot=>`${spot.station}:${spot.slot}`;
  const vacated=new Set((freed||[]).map(key));
  for(const station of stations){
    const occupied=new Set(placed.filter(x=>x.station===station&&!vacated.has(key(x))).map(x=>x.slot));
    for(const gone of taken||[])if(gone.station===station)occupied.add(gone.slot);
    for(const slot of stationSlotIndices(station))if(!occupied.has(slot))out.push({station,slot});
  }
  return out;
}
const slotLogSame=(a,b)=>Boolean(a)&&Boolean(b)&&a.station===b.station&&a.slot===b.slot;
// Each send-to-work step offers the slots free when its droid is sent, which
// means minus anything an earlier step in the same plan has already been
// recorded as taking.
// Move droids to the slots you actually recorded landing in.
//
// annotateLogSlots only marks a recorded slot as taken so the NEXT step offers
// the right choices; it never moved the droid, so the preview and the map went
// on showing wherever the fill-order rule had guessed. Recording that a droid
// went to Astromech 7 and then being shown it in Astromech 3 makes the
// recording look ignored, and the map is the thing you check the plan against.
//
// A recorded landing is ground truth about where the droid is, so it wins over
// the prediction. Whoever the plan had in that slot swaps into the one being
// vacated, which keeps every droid placed and the slot count unchanged.
function applyLoggedLandings(projected,steps){
  const keyOf=x=>`${x.source}:${x.unit}`;
  let moved=false;
  for(const step of steps){
    if(!step.logged||!step.unit)continue;
    const key=keyOf(step.unit),moving=projected.placed.find(x=>keyOf(x)===key);
    if(!moving)continue;                                    // sold or unplaced: nothing to move
    const {station,slot}=step.logged;
    if(moving.station===station&&moving.slot===slot)continue; // the guess was right
    const occupant=projected.placed.find(x=>x.station===station&&x.slot===slot&&keyOf(x)!==key);
    const from={station:moving.station,slot:moving.slot};
    moving.station=station;moving.slot=slot;
    if(occupant){occupant.station=from.station;occupant.slot=from.slot}
    moved=true;
  }
  return moved;
}
function annotateLogSlots(steps){
  if(state.sharedView||!slotLabAllowed()||!slotLogTracking())return;
  // Walk the plan in order. Every step empties the slot its droid was in — a
  // sell for good, a move until it lands somewhere — so by the time you reach a
  // later step the slots above it have opened up. Landings you have already
  // recorded close again; ones you have not are still unknown, and fill in as
  // you work down.
  const taken=[],freed=[],landedAt=new Map();
  const keyOf=unit=>unit?`${unit.source}:${unit.unit}`:'';
  for(const step of steps){
    const key=keyOf(step.unit);
    // Where this droid is standing as this step begins. Once a landing has been
    // recorded that is the recorded slot, not the one the plan predicted — the
    // whole point of recording it is that the two differ.
    const standingIn=landedAt.get(key);
    // Sending a droid to the Lounge is the same measurement as sending it to work:
    // you pick the droid, the game picks the slot. The station is known there, so
    // only the Lounge's own slots are offered.
    const lounge=step.to==='LOUNGE';
    if((step.kind==='work'||lounge)&&Number.isInteger(step.fromSlot)){
      step.freeSlots=slotLogFree(taken,freed,lounge?['LOUNGE']:undefined);
      step.logged=slotLogSession.get(step.text)||null;
      if(step.logged){taken.push(step.logged);landedAt.set(key,step.logged)}
    }
    // A droid that moves on gives its slot back. Without this, a slot you
    // recorded a landing in stayed marked occupied for the rest of the plan —
    // park a droid in Lounge 1, send it to work from there, and Lounge 1 was
    // still missing from the next Lounge step's choices.
    if(standingIn){
      freed.push(standingIn);
      const held=taken.findIndex(spot=>spot.station===standingIn.station&&spot.slot===standingIn.slot);
      if(held>=0)taken.splice(held,1);
      if(landedAt.get(key)===standingIn)landedAt.delete(key);
    }else if(Number.isInteger(step.fromSlot)&&step.from&&step.from!==ROSTER){
      freed.push({station:step.from,slot:step.fromSlot});
    }
  }
}
function slotLogAdd(row){
  // Only your own saves. A shared Base is somebody else's, and it moves without
  // you: slots get bought and droids get shuffled between your visits, so a row
  // from one is measuring a Base you cannot see the state of.
  if(state.sharedView)return false;
  if(!Number.isInteger(row.landed)||!row.station)return false;
  // A landing outside the free set means the Base is out of date, and a wrong row
  // is worse than no row.
  if(!row.free.some(slot=>slot.station===row.station&&slot.slot===row.landed))return false;
  const rows=slotLogAll();
  // Which of your saves this came from. Profiles differ in rebirth and unlocked
  // slots, so a row is only interpretable next to the one that produced it.
  const profile=activeProfile();
  const source={profileId:profile?.id||'local',profile:profile?.name||'Local save'};
  rows.push({...row,...source,at:new Date().toISOString(),rebirth:state.rebirth});
  slotLogWrite(rows);
  return true;
}

// ─── Scoring the rules against the log ──────────────────────────────────────
// Each rule guesses the landing from the origin and the free set. Whichever
// predicts the log best is the one Optimise should be using.
const SLOT_RULES_UNDER_TEST=[
  {id:'nearest',name:'Nearest free slot to where it started',
   pick:row=>slotLogNearest(row.free,row.fromStation,row.fromSlot)},
  {id:'mission',name:'Own station first, mission slots before the rest',
   pick:row=>{
     // Auto-route sends a droid to its own type of station when one is free.
     const home=row.free.filter(spot=>spot.station===row.droidType);
     const pool=home.length?home:row.free;
     const mission=pool.filter(spot=>spot.station==='ASTROMECH'&&ASTROMECH_MISSION_SLOTS.includes(spot.slot));
     return slotLogNearest(mission.length?mission:pool,row.fromStation,row.fromSlot);
   }},
  {id:'fixed',name:'The station order the app ships with, nearest slot inside it',
   pick:row=>{
     const home=row.free.filter(spot=>spot.station===row.droidType);
     const pool=home.length?home:row.free;
     for(const station of[...NEAREST_ORDER,'UPGRADE_CHIP','LOUNGE']){
       const here=pool.filter(spot=>spot.station===station);
       if(!here.length)continue;
       const order=slotFillOrder(station,{station:row.fromStation,slot:row.fromSlot});
       return here.slice().sort((a,b)=>order.indexOf(a.slot)-order.indexOf(b.slot))[0];
     }
     return pool[0];
   }},
];
// Distance between two slots on the map. Both floors are drawn on one image, so
// changing floor gets a flat penalty rather than real geometry.
const SLOT_FLOOR_PENALTY=12;
// A slot with no dot on the map cannot be compared with one that has, so it sorts
// last rather than poisoning the comparison with Infinity.
const SLOT_GAP_UNREACHABLE=1e6;
// The walk the game seems to measure: a straight line across the floor, plus a
// flat charge for changing floor.
function slotWalkGap(from,to){
  const a=slotLogPoint(from.station,from.slot),b=slotLogPoint(to.station,to.slot);
  if(!a||!b)return SLOT_GAP_UNREACHABLE;
  return Math.hypot(b.x-a.x,b.y-a.y)+(a.upstairs!==b.upstairs?SLOT_FLOOR_PENALTY:0);
}
function slotLogPoint(station,slot){
  for(const floor of MAP_FLOORS){
    const spots=MAP_SPOTS[floor]||{};
    const lists=station==='LOUNGE'?[spots.LOUNGE,spots.LOUNGE_REBIRTH,spots.LOUNGE_NOVA]:station==='BLUEPRINT_STORAGE'?[spots.BLUEPRINT]:[spots[station]];
    let base=0;
    for(const list of lists){
      if(list&&slot-base<list.length&&slot-base>=0)return{x:list[slot-base][0],y:list[slot-base][1],upstairs:floor==='upstairs'};
      base+=(list||[]).length;
    }
  }
  return null;
}
function slotLogNearest(free,fromStation,fromSlot){
  const start=slotLogPoint(fromStation,fromSlot);
  if(!start||!free.length)return free[0];
  const from={station:fromStation,slot:fromSlot};
  let best=null;
  for(const spot of free){
    const gap=slotWalkGap(from,spot);
    if(gap>=SLOT_GAP_UNREACHABLE)continue;
    if(!best||gap<best.gap)best={spot,gap};
  }
  return best?best.spot:free[0];
}
function slotLogScores(rows){
  return SLOT_RULES_UNDER_TEST.map(rule=>{
    const per={};let hit=0;
    for(const row of rows){
      const right=slotLogSame(rule.pick(row),{station:row.station,slot:row.landed});
      if(right)hit++;
      const bucket=per[row.station]||(per[row.station]={hit:0,n:0});
      bucket.n++;if(right)bucket.hit++;
    }
    return{...rule,hit,n:rows.length,per};
  }).sort((a,b)=>b.hit-a.hit);
}

// ─── Slot Lab ───────────────────────────────────────────────────────────────
// A guided run-through for measuring how the game itself chooses a slot. The map
// positions are placed by hand and only ever approximate, so the fill order has
// to be measured rather than read off them. Every step says what to set up, what
// to do, and how to put the base back for the next one.
//
// Personal tool, hidden unless the signed-in account owns it. This is a static
// site, so that hides the page rather than protecting it — there is nothing here
// worth protecting, only clutter worth keeping out of everyone else's way.
const SLOT_LAB_OWNERS=['xraffo@gmail.com'];
// gmail and googlemail are one account and either can be the address you signed
// in with, so compare a normalised form rather than the raw text.
const normaliseEmail=email=>String(email||'').trim().toLowerCase().replace(/@googlemail\.com$/,'@gmail.com');
const slotLabAllowed=()=>SLOT_LAB_OWNERS.includes(normaliseEmail(galacticUserEmail()));

// The point of the log: which rule actually predicts what the game does.
function slotLogFindingsHtml(){
  const rows=slotLogAll();
  if(!rows.length)return `<section class="lab-phase"><h2>Findings</h2><p class="lab-why">Nothing logged yet. Turn on <strong>Track slot choices</strong> on Optimise, then each step that sends a droid to work gets a box for where it landed. Following your normal plans is enough — no test runs needed.</p></section>`;
  const scores=slotLogScores(rows),stations=[...new Set(rows.map(r=>r.station))];
  const counts=new Map();
  for(const row of rows){const key=row.profileId||'local';
    counts.set(key,{name:row.profile||'Local save',n:(counts.get(key)?.n||0)+1})}
  const byProfile=[...counts.values()].sort((a,b)=>b.n-a.n);
  const pct=(hit,n)=>n?Math.round(hit/n*100):0;
  const head=stations.map(st=>`<th>${stationName(st)}</th>`).join('');
  const body=scores.map(rule=>`<tr><td>${rule.name}</td><td><strong>${pct(rule.hit,rule.n)}%</strong><small>${rule.hit} of ${rule.n}</small></td>${stations.map(st=>{const b=rule.per[st];return `<td>${b?pct(b.hit,b.n)+'%':'—'}<small>${b?b.n+' seen':''}</small></td>`}).join('')}</tr>`).join('');
  const best=scores[0];
  return `<section class="lab-phase"><h2>Findings</h2>
    <p class="lab-why"><strong>${rows.length}</strong> landings recorded during normal play. Each rule guesses the slot from where the droid started and which slots were free; the best one is what Optimise should be using.</p>
    <div class="lab-scores"><table><thead><tr><th>Rule</th><th>Overall</th>${head}</tr></thead><tbody>${body}</tbody></table></div>
    ${byProfile.length>1?`<p class="lab-why">Across ${byProfile.length} of your profiles: ${byProfile.map(p=>`<strong>${p.name}</strong> ${p.n}`).join(', ')}. They are pooled on purpose — how the game picks a slot is the same question whatever save you are on — but if one of them has a Base that is out of date, its rows will drag the scores down, so check its share looks sane. Group profiles are never recorded: a Base you only visit moves between visits, so its rows would be measuring a state you cannot check.</p>`:''}
    <p class="lab-why">Leading: <strong>${best.name}</strong> at ${pct(best.hit,best.n)}%. Treat anything under about 200 landings as provisional. Battle still ships a fixed order worked out from the original sweeps, so it is scoring against its own source data and will look better than it is until fresh landings come in — which is exactly what this log is for.</p>
    </section>`;
}
function slotLabPage(){
  if(!slotLabAllowed()){notFound();return}
  const rows=slotLogAll();
  const stamp=new Date().toISOString().slice(0,10);
  app.innerHTML='<div class="breadcrumbs"><a href="#/">Homepage</a> / Slot Lab</div>'+
    '<section class="base-heading"><div><p class="eyebrow">Private tool</p><h1>Slot Lab</h1>'+
    '<p class="lead">Every landing recorded during normal play, and how well each rule predicts them. Turn on <strong>Track slot choices</strong> on Optimise, then each step that sends a droid to work or to the Lounge gets a box for where it actually went.</p></div>'+
    '<div class="lab-actions"><button class="btn" id="labExport">Export</button><button class="btn secondary" id="labCopy">Copy</button><button class="btn ghost" id="labReset">Reset</button></div></section>'+
    slotLogFindingsHtml()+
    (rows.length?'<section class="lab-phase"><h2>The data</h2><p class="lab-why">'+rows.length+' landings, newest last. Export writes the same thing to a file.</p>'+
      '<textarea class="form-control lab-output" id="labOutput" readonly rows="14">'+escapeAttr(JSON.stringify(rows,null,1))+'</textarea></section>':'');

  const text=()=>JSON.stringify(slotLogAll(),null,1);
  const copy=async()=>{
    try{await navigator.clipboard.writeText(text());toast('Log copied')}
    catch(e){const box=document.querySelector('#labOutput');if(box){box.select();toast('Copy the box below')}else toast('Could not reach the clipboard')}
  };
  const reset=()=>{
    if(!confirm('Delete every recorded landing? There is no undo, so export first if you want to keep them.'))return;
    slotLogClear();slotLogSession.clear();toast('Log cleared');slotLabPage();
  };
  document.querySelector('#labExport').onclick=()=>{
    if(!slotLogAll().length){toast('Nothing recorded yet');return}
    // A file rather than the clipboard, so a long log survives being pasted
    // somewhere with a length limit.
    const blob=new Blob([text()],{type:'application/json'}),url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;link.download='droid-archives-slot-log-'+stamp+'.json';
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Exported '+slotLogAll().length+' landings');
  };
  document.querySelector('#labCopy').onclick=copy;
  document.querySelector('#labReset').onclick=reset;
}

// The link only exists for the account that owns the tool.
function syncSlotLabNav(){
  const wanted=slotLabAllowed();
  for(const host of [document.querySelector('.site-header nav'),document.querySelector('.sidebar')]){
    if(!host)continue;
    const existing=host.querySelector('[data-slot-lab-link]');
    if(!wanted){existing&&existing.remove();continue}
    if(existing)continue;
    const link=document.createElement('a');
    link.href='#/slot-lab';link.dataset.slotLabLink='1';
    link.innerHTML=host.matches('.sidebar')?'<img class="side-icon" src="assets/nav/SlotLab.png" alt=""> <span>Slot Lab</span>':'Slot Lab';
    const before=host.querySelector('[href="#/donate"]');
    if(before)before.before(link);else host.append(link);
  }
  scheduleHeaderNav(true)
}

function route(){const path=location.hash.slice(1).split('?')[0]||'/',routeChanged=path!==lastRoutePath;lastRoutePath=path;if(path==='/todo'||path==='/donate'||path==='/groups')app.querySelector('.archive-timers')?.remove();document.querySelector('.sidebar').classList.remove('mobile-open');document.querySelector('#rebirthQuickBar')?.dispose?.();renderBaseSidebar(()=>route());renderCloudHeader();syncSlotLabNav();if(path==='/')home();else if(path==='/droids')droidsPage();else if(path==='/droidex')droidexPage();else if(path==='/fusion-lab')fusionLabPage();else if(path==='/nova-shop')novaShopPage();else if(path.startsWith('/nova-shop/'))novaDetailPage(path.split('/')[2]);else if(path==='/cantina-shop')cantinaShopPage();else if(path==='/groups')groupsPage();else if(path==='/galactic-reports'&&GALACTIC_REPORTS_ENABLED)galacticReportsPage();else if(path==='/todo')todoPage();else if(path==='/donate')donatePage();else if(path==='/base')basePageV2();else if(path==='/droid-calc')droidCalcPage();else if(path==='/rebirth')rebirthPage();else if(path==='/crit-calc')critCalcPage();else if(path==='/slot-lab')slotLabPage();else if(path==='/optimise')optimisePage();else if(path==='/lucky-droid')luckyDroidPageV2();else if(path.startsWith('/droid/'))detailPage(path.split('/')[2]);else notFound();decorateSharedView();if(routeChanged){try{app.focus({preventScroll:true})}catch{app.focus()}scrollTo(0,0)}setTimeout(showPatchNotesOnce,80);publishCompanionState()}
const routeWithoutActiveNavigation=route;
const activeNavigationHref=path=>path.startsWith('/droid/')||path==='/droids'?'#/droids':path.startsWith('/nova-shop')?'#/nova-shop':`#${path}`;
const COMMAND_ART={map:'Map',health:'Health',scrap:'Scrap',chips:'Chips',calc:'DroidCalc',outlook:'Outlook',groupOutlook:'GroupOutlook',fusion:'Fusion',detail:'Detail',transfer:'ImportExport'};
const commandIcon=name=>{
  if(COMMAND_ART[name])return `<img class="command-icon command-art" src="assets/base/${COMMAND_ART[name]}.png" alt="">`;
  const paths={health:'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z',scrap:'M5 8h14l-1 11H6L5 8Zm3-3h8l1 3H7l1-3Z',chips:'M5 8h14v8H5V8Zm3-3h8v3H8V5Zm1 7h6M12 9v6',calc:'M6 3h12v18H6V3Zm3 4h6M9 11h1m4 0h1m-6 4h1m4 0h1',outlook:'M4 5h16v14H4V5Zm4-2v4m8-4v4M7 10h3m2 0h5m-10 4h5',detail:'M4 6h16M4 12h16M4 18h10',generic:'M4 6h16M4 12h16M4 18h10',map:'M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Zm0 0v13m6-10.5v13',transfer:'M7 7h12m0 0-3-3m3 3-3 3M17 17H5m0 0 3 3m-3-3 3-3',add:'M12 5v14M5 12h14',credits:'M4 7h16v10H4V7Zm3 3h5m-5 4h3',clock:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2',speed:'M5 16a8 8 0 1 1 14 0M12 12l4-4',droids:'M8 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 2a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20v-3a4 4 0 0 1 8 0v3m2 0v-3a4 4 0 0 1 8 0v3',hint:'M12 4a5 5 0 0 0-5 5v3.5L5 16h14l-2-3.5V9a5 5 0 0 0-5-5Zm-2.5 15a2.5 2.5 0 0 0 5 0',fusion:'M7 4v5l-3 5a4 4 0 0 0 4 6h8a4 4 0 0 0 4-6l-3-5V4M7 4h10M9 15h6',settings:'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-12v2m0 13v2m8.5-8.5h-2m-13 0h-2m14.5-6-1.5 1.5m-9 9L6 18m12 0-1.5-1.5m-9-9L6 6'};
  return `<svg class="command-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.generic}"/></svg>`
};
function modernMetricIcon(label){label=label.toLowerCase();if(label.includes('minute'))return'clock';if(label.includes('hour'))return'speed';if(label.includes('droid'))return'droids';if(label.includes('rebirth'))return'outlook';return'credits'}
function modernButtonIcon(button){const text=button.textContent.toLowerCase();if(text.includes('need'))return'hint';if(text.includes('fusion'))return'fusion';if(text.includes('map'))return'map';if(text.includes('health'))return'health';if(text.includes('scrap'))return'scrap';if(text.includes('chip'))return'chips';if(text.includes('droid calc')||text.includes('replacement'))return'calc';if(text.includes('group outlook'))return'groupOutlook';if(text.includes('outlook'))return'outlook';if(text.includes('import')||text.includes('export'))return'transfer';if(text.includes('add'))return'add';if(text.includes('detail'))return'detail';return'generic'}
function modernBaseSettings(){
  const heading=app.querySelector('.base-heading'),stats=app.querySelector('.base-top');
  if(!heading||!stats||app.querySelector('.modern-base-settings'))return;
  const collapsed=localStorage.getItem('droid-archive-command-settings-collapsed')==='1';
  const optimiseOpen=optimiseSettingsOpen();
  const cycles=Object.keys(state.rebirths),goals=Array.from({length:Math.max(0,maxRebirth()-11)},(_,i)=>i+12);
  const preferredHtml=preferredCompanions().map(name=>{const d=state.droids.find(x=>x.name===name);return `<span class="modern-preferred-companion" title="${escapeAttr(name)}">${d?picture(d,'DEFAULT'):''}<b>${name}</b><button type="button" data-command-remove-companion="${escapeAttr(name)}" title="Remove ${escapeAttr(name)}" aria-label="Remove ${escapeAttr(name)}">×</button></span>`}).join('');
  heading.insertAdjacentHTML('afterend',`<section class="modern-base-settings ${collapsed?'collapsed':''}"><header><span>${commandIcon('settings')}<strong>Base settings</strong><small>Profile controls</small></span><button class="panel-collapse-button" type="button" id="toggleCommandSettings" aria-expanded="${collapsed?'false':'true'}" title="${collapsed?'Expand':'Minimise'} Base settings">${collapsed?'+':'−'}</button></header><div class="modern-settings-body"><label for="commandMultiplier"><small>Base multiplier</small><span><span class="deck-stepper is-dual"><span class="deck-stepper-arrows"><button type="button" data-step="up" data-step-for="commandMultiplier" data-step-by="1" tabindex="-1" title="Up by 1" aria-label="Increase by 1">&#9650;</button><button type="button" data-step="down" data-step-for="commandMultiplier" data-step-by="1" tabindex="-1" title="Down by 1" aria-label="Decrease by 1">&#9660;</button></span><input id="commandMultiplier" type="number" min="0" step="0.1" value="${state.multiplier}"><span class="deck-stepper-arrows"><button type="button" data-step="up" data-step-for="commandMultiplier" data-step-by="0.1" tabindex="-1" title="Up by 0.1" aria-label="Increase by 0.1">&#9650;</button><button type="button" data-step="down" data-step-for="commandMultiplier" data-step-by="0.1" tabindex="-1" title="Down by 0.1" aria-label="Decrease by 0.1">&#9660;</button></span></span><b>${effectiveMultiplier().toFixed(2)}×</b></span><em>${flawlessCount()} flawless tracked</em></label><label><small>Super rebirth</small><select id="commandCycle">${cycles.map(c=>`<option value="${c}" ${Number(c)===state.cycle?'selected':''}>Cycle ${Number(c)+1}</option>`).join('')}</select></label><label for="commandRebirth"><small>Current rebirth</small><span class="deck-stepper"><input id="commandRebirth" type="number" min="0" max="${maxRebirth()}" step="1" value="${state.rebirth}"><span class="deck-stepper-arrows"><button type="button" data-step="up" data-step-for="commandRebirth" tabindex="-1" aria-label="Increase">&#9650;</button><button type="button" data-step="down" data-step-for="commandRebirth" tabindex="-1" aria-label="Decrease">&#9660;</button></span></span></label><label><small>Super rebirth goal</small><select id="commandGoal">${goals.map(n=>`<option value="${n}" ${n===rebirthGoal()?'selected':''}>Rebirth ${n}</option>`).join('')}</select><em>Recommendations stop at this rebirth</em></label><button class="modern-settings-link" type="button" id="toggleCommandOptimise" aria-expanded="${optimiseOpen?'true':'false'}"><span><strong>Advanced settings</strong><em>${optimiseSettingsSummary()}</em></span><b>${optimiseOpen?'−':'+'}</b></button></div><div class="modern-optimise-settings" ${optimiseOpen?'':'hidden'}><section class="modern-companion-settings"><div class="modern-setting-block"><small>Companion boosts</small><div class="modern-setting-pills">${COMPANION_GOALS.map(g=>`<label><input type="checkbox" data-command-companion-goal="${g.id}" ${companionGoals().includes(g.id)?'checked':''}><span>${g.short}</span></label>`).join('')}</div><em>A Companion slot is stocked for each boost picked.</em></div><div class="modern-setting-block"><small>Preferred companions</small><div class="modern-preferred-companions">${preferredHtml}${preferredCompanionsFull()?'':`<button type="button" class="modern-add-companion" id="commandAddPreferredCompanion">${stationIcon('COMPANION')}<span>${preferredCompanions().length?'Add':'Add preferred'}</span></button>`}</div><em>Taken ahead of any boost.</em></div></section><section class="modern-optimise-checks"><label><input id="commandKeepDroidex" type="checkbox" ${state.optimiseKeepDroidex===false?'':'checked'}><span>Keep droids that can fill the Droidex</span></label><label><input id="commandAutoCompleteBuilds" type="checkbox" ${state.autoCompleteBuilds?'checked':''}><span>Auto complete Build droids</span></label><label><input id="commandAutoPurchaseSlots" type="checkbox" ${state.autoPurchaseSlots?'checked':''}><span>Auto purchase slots</span></label><label title="When enabled, Optimise tries to clear Build slots. Sell Priority controls which droids may be removed when safe storage is full."><input id="commandOptimiseFreeBuild" type="checkbox" ${state.optimiseFreeBuild?'checked':''}><span>Keep Build slots open in Optimise</span><i>?</i></label><label title="Shows what each droid fuses into on its card in the droid picker."><input id="commandFusionHints" type="checkbox" ${fusionHintsEnabled()?'checked':''}><span>Show fusion uses in the droid picker</span></label><label title="Lets Optimise park spare droids in Fusion slots, the way it uses the Lounge. Anything left standing there is what a Fuse consumes."><input id="commandFusionAsLounge" type="checkbox" ${state.fusionAsLounge?'checked':''}><span>Use Fusion as Lounge slots</span><i>?</i></label></section><label class="modern-sell-priority" ${state.optimiseFreeBuild?'':'hidden'}><small>Sell priority <i title="Choose which droids Optimise is allowed to sell while trying to free Build slots.">?</i></small><select id="commandOptimiseFreeBuildMode">${OPTIMISE_FREE_BUILD_MODES.map(mode=>`<option value="${mode}" ${optimiseFreeBuildMode()===mode?'selected':''}>${optimiseFreeBuildModeLabel(mode)}</option>`).join('')}</select><em>${optimiseFreeBuildModeHelp(optimiseFreeBuildMode())}</em></label><button class="btn danger modern-super-rebirth" type="button" id="commandSuperRebirth">Super rebirth</button></div></section>`);
  const deck=app.querySelector('.modern-base-settings'),rerender=()=>{save();route()};
  deck.querySelector('#toggleCommandSettings').onclick=()=>{const next=!deck.classList.contains('collapsed'),button=deck.querySelector('#toggleCommandSettings');deck.classList.toggle('collapsed',next);localStorage.setItem('droid-archive-command-settings-collapsed',next?'1':'0');button.textContent=next?'+':'−';button.title=`${next?'Expand':'Minimise'} Base settings`;button.setAttribute('aria-expanded',next?'false':'true')};
  deck.querySelectorAll('[data-step-for]').forEach(button=>button.onclick=()=>{const input=deck.querySelector('#'+button.dataset.stepFor);if(!input)return;const by=Number(button.dataset.stepBy);if(by){const low=input.min===''?-Infinity:Number(input.min),high=input.max===''?Infinity:Number(input.max);input.value=String(Math.round(Math.min(high,Math.max(low,(Number(input.value)||0)+(button.dataset.step==='up'?by:-by)))*100)/100)}else button.dataset.step==='up'?input.stepUp():input.stepDown();input.dispatchEvent(new Event('change'))});deck.querySelector('#toggleCommandOptimise').onclick=e=>{const panel=deck.querySelector('.modern-optimise-settings'),open=panel.hidden;panel.hidden=!open;localStorage.setItem('droid-archive-optimise-settings-open',open?'1':'0');e.currentTarget.setAttribute('aria-expanded',String(open));e.currentTarget.querySelector(':scope>b').textContent=open?'−':'+'};
  deck.querySelector('#commandMultiplier').onchange=e=>{state.multiplier=Number(e.target.value)||0;rerender()};
  deck.querySelector('#commandCycle').onchange=e=>{state.cycle=Number(e.target.value);rerender()};
  deck.querySelector('#commandRebirth').onchange=e=>changeCurrentRebirth(e.target.value,route);
  deck.querySelector('#commandGoal').onchange=e=>{state.superRebirthGoal=Number(e.target.value)||maxRebirth();rerender()};
  deck.querySelectorAll('[data-command-companion-goal]').forEach(box=>box.onchange=()=>{state.companionGoals=[...deck.querySelectorAll('[data-command-companion-goal]')].filter(x=>x.checked).map(x=>x.dataset.commandCompanionGoal);rerender()});
  deck.querySelectorAll('[data-command-remove-companion]').forEach(button=>button.onclick=()=>{state.preferredCompanions=preferredCompanions().filter(name=>name!==button.dataset.commandRemoveCompanion);rerender()});
  deck.querySelector('#commandAddPreferredCompanion')?.addEventListener('click',()=>showPreferredCompanionPicker(rerender));
  deck.querySelector('#commandKeepDroidex').onchange=e=>{state.optimiseKeepDroidex=e.target.checked;rerender()};
  deck.querySelector('#commandAutoCompleteBuilds').onchange=e=>{state.autoCompleteBuilds=e.target.checked;rerender()};
  deck.querySelector('#commandAutoPurchaseSlots').onchange=e=>{state.autoPurchaseSlots=e.target.checked;const changed=autoPurchaseEligibleSlots();save();toast(state.autoPurchaseSlots?changed?'Eligible slots purchased':'Auto purchase slots enabled':'Auto purchase slots disabled');route()};
  deck.querySelector('#commandFusionHints').onchange=e=>localStorage.setItem('droid-archive-picker-fusion-hints',e.target.checked?'1':'0');deck.querySelector('#commandFusionAsLounge').onchange=e=>{state.fusionAsLounge=e.target.checked;save();route()};deck.querySelector('#commandOptimiseFreeBuild').onchange=e=>{state.optimiseFreeBuild=e.target.checked;rerender()};
  deck.querySelector('#commandOptimiseFreeBuildMode').onchange=e=>{state.optimiseFreeBuildMode=e.target.value;rerender()};
  deck.querySelector('#commandSuperRebirth').onclick=()=>showSuperRebirthConfirm(route)
}
function modernBaseStationLayout(){
  const layout=app.querySelector('.base-layout-v2');if(!layout||layout.querySelector('.modern-center-stations'))return;
  const build=layout.querySelector(':scope>.build-side'),blueprint=layout.querySelector(':scope>.blueprint-side'),special=layout.querySelector(':scope>.special-stations'),lounge=special?.querySelector('.station-lounge'),companion=special?.querySelector('.station-companion'),upgrade=special?.querySelector('.station-upgrade-chip');
  if(!build||!blueprint||!special||!lounge||!companion||!upgrade)return;
  const center=document.createElement('div'),support=document.createElement('div'),fuse=document.createElement('div');
  center.className='modern-center-stations';support.className='modern-support-row';fuse.className='modern-fuse-stations';
  layout.classList.add('modern-station-layout');
  // Build and the storage stations share one column so nothing can drift out of
  // line between them, and the Fusion pair takes the column storage used to own.
  layout.insertBefore(center,build);center.append(build,blueprint,support);support.append(companion,upgrade);
  layout.insertBefore(fuse,center.nextSibling);fuse.append(...special.querySelectorAll('.station-fusion,.station-fusion-build'));
  // Whatever is left in the special row comes with the Lounge. Naming the three
  // it knew about and dropping the container took the Fusion stations with it,
  // and would take the next one added here too.
  special.replaceWith(...special.children)
}
function modernDroidCardActions(){
  app.querySelectorAll('.base-slot.occupied').forEach(card=>{
    if(card.parentElement?.classList.contains('modern-slot-wrap'))return;
    // Keep the Build completion control inside the card. It is deliberately a
    // full-width footer action in Legacy and is clearer there than squeezed
    // into Modern's small utility-button strip.
    const controls=[...card.children].filter(node=>node.matches?.('.slot-variant,.slot-lock,.slot-swap,.slot-delete'));
    if(!controls.length)return;
    const actions=document.createElement('div'),menu=document.createElement('div');
    actions.className='slot-card-actions';menu.className='slot-card-menu';
    controls.forEach(button=>{const label=button.classList.contains('craft-blueprint')?'Craft':button.classList.contains('slot-variant')?'Change quality':button.classList.contains('slot-lock')?'Optimise lock':button.classList.contains('slot-swap')?'Swap droid':'Remove droid';button.dataset.actionLabel=label;button.title=label;menu.append(button)});
    const wrapper=document.createElement('div');wrapper.className='modern-slot-wrap';
    actions.append(menu);card.before(wrapper);wrapper.append(actions,card);
    menu.onclick=event=>event.stopPropagation()
  })
}
let modernTimerScrollFrame=0,modernTimerCompactedAt=0;
// Any render replaces app.innerHTML, and the observer rebuilds the timer strip
// from scratch - at full height, whatever the page is scrolled to. The scroll
// handler then shrinks it, so the animation replays on every re-render even
// though nothing was scrolled. Setting the state before the first paint, with
// transitions suppressed for that frame, makes a rebuild invisible.
function settleModernTimerScroll(){
  const timers=app.querySelector('.archive-timers');if(!timers)return;
  const compact=document.documentElement.dataset.uiStyle==='modern'&&scrollY>110;
  if(compact===timers.classList.contains('timers-scrolled'))return;
  timers.classList.add('timers-settling');
  timers.classList.toggle('timers-scrolled',compact);
  if(compact)modernTimerCompactedAt=performance.now();
  // One frame to paint the new state, a second to hand animation back to CSS.
  requestAnimationFrame(()=>requestAnimationFrame(()=>timers.classList.remove('timers-settling')));
}
function updateModernTimerScroll(){
  const timers=app.querySelector('.archive-timers');if(!timers)return;
  if(document.documentElement.dataset.uiStyle!=='modern'){timers.classList.remove('timers-scrolled');modernTimerCompactedAt=0;return}
  const compact=timers.classList.contains('timers-scrolled'),now=performance.now();
  // Separate enter/exit points stop the timer's own height transition from
  // moving scrollY across one shared boundary and rapidly toggling both states.
  if(!compact&&scrollY>110){timers.classList.add('timers-scrolled');modernTimerCompactedAt=now}
  else if(compact&&scrollY<=4&&now-modernTimerCompactedAt>400){timers.classList.remove('timers-scrolled');modernTimerCompactedAt=0}
}
function scheduleModernTimerScroll(){if(modernTimerScrollFrame)return;modernTimerScrollFrame=requestAnimationFrame(()=>{modernTimerScrollFrame=0;updateModernTimerScroll()})}
window.addEventListener('scroll',scheduleModernTimerScroll,{passive:true});
function decorateCommandDeck(path){
  const key=path==='/'?'home':path.startsWith('/droid/')?'droid-detail':path.replace(/^\//,'').replaceAll('/','-')||'home';
  document.documentElement.dataset.route=key;app.dataset.route=key;
  if(document.documentElement.dataset.uiStyle!=='modern')return;
  app.querySelectorAll('.base-top .stat').forEach(stat=>{if(stat.querySelector('.modern-metric-icon'))return;const label=stat.querySelector('small')?.textContent||'';stat.insertAdjacentHTML('afterbegin',`<span class="modern-metric-icon">${commandIcon(modernMetricIcon(label))}</span>`) });
  if(key==='base'){
    modernBaseStationLayout();
    modernDroidCardActions();
    const stats=app.querySelector('.base-top');
    if(stats&&!stats.querySelector('.modern-outlook-stat'))stats.insertAdjacentHTML('beforeend',`<a class="stat modern-outlook-stat" href="#/rebirth"><span class="modern-metric-icon">${commandIcon('outlook')}</span><small>Rebirth outlook</small><strong>Cycle ${state.cycle+1} · ${state.rebirth}</strong><b>›</b></a>`);
    app.querySelectorAll('.base-actions .btn').forEach(button=>{if(button.querySelector('.command-icon'))return;button.insertAdjacentHTML('afterbegin',commandIcon(modernButtonIcon(button)));const clean=button.textContent.replace(/^(Show|Hide)\s+/i,'');if(button.classList.contains('base-panel-toggle'))button.childNodes[button.childNodes.length-1].textContent=` ${clean}`});
    modernBaseSettings()
  }
  const firstHeading=app.querySelector('h1');
  if(firstHeading?.parentElement===app&&!app.querySelector('.command-page-banner')){const eyebrow=firstHeading.previousElementSibling?.classList.contains('eyebrow')?firstHeading.previousElementSibling:null,lead=firstHeading.nextElementSibling?.classList.contains('lead')?firstHeading.nextElementSibling:null,banner=document.createElement('section');banner.className='command-page-banner command-page-heading';app.insertBefore(banner,eyebrow||firstHeading);if(eyebrow)banner.append(eyebrow);banner.append(firstHeading);if(lead)banner.append(lead)}else if(firstHeading)firstHeading.closest('section,article,div')?.classList.add('command-page-heading');
  app.querySelectorAll('.btn').forEach(button=>{if(button.querySelector('.command-icon')||!/(add|apply|view|import|export|compare|save|create|join|copy|submit|track)/i.test(button.textContent))return;button.insertAdjacentHTML('afterbegin',commandIcon(modernButtonIcon(button)))});
  app.querySelectorAll('.toolbar,.dex-toolbar,.variant-tabs,.cantina-tabs').forEach(node=>node.classList.add('command-toolbar'))
  updateModernTimerScroll()
}
route=()=>{const path=location.hash.slice(1).split('?')[0]||'/',activeHref=activeNavigationHref(path);document.querySelectorAll('#nav a,.sidebar>a').forEach(link=>{const active=link.getAttribute('href')===activeHref;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current')});routeWithoutActiveNavigation();decorateCommandDeck(path);requestAnimationFrame(()=>{modernTimerCompactedAt=0;decorateCommandDeck(path)});setTimeout(()=>decorateCommandDeck(path),120);scheduleHeaderNav(true)};
function applyTheme(){document.documentElement.dataset.theme=state.theme;document.querySelector('#themeButton').textContent=state.theme==='dark'?'☀':'☾';document.querySelector('#themeButton').title=`Switch to ${state.theme==='dark'?'light':'dark'} mode`}
// The top nav has to fold into the hamburger the moment its links stop fitting,
// which is not a width anyone can hard-code: the Slot Lab link only exists for
// its owner, so the same viewport holds a different number of links for
// different people. Watch for the overflow itself instead, and leave the media
// queries as the floor beneath it.
let navFitFrame=0,navFitWidth=-1;
function syncHeaderNav(force){
  const header=document.querySelector('.site-header'),nav=document.querySelector('#nav'),root=document.documentElement;
  if(!header||!nav)return;
  // Folding the nav away leaves the header's own width untouched, so comparing
  // against it both skips redundant work and stops the observer below from
  // reacting to the fold it just caused.
  if(!force&&header.clientWidth===navFitWidth)return;
  navFitWidth=header.clientWidth;
  // Measure with the nav laid out, or a folded nav reports no width at all and
  // could never decide it has room to come back.
  root.dataset.navFit='open';
  if(getComputedStyle(nav).display==='none'){delete root.dataset.navFit;return}
  // Two ways the links stop fitting, one per interface: Modern lets the nav be
  // squashed until it clips its own links, Legacy holds the nav at full width
  // and pushes the header icons off the edge instead.
  if(nav.scrollWidth>nav.clientWidth+1||header.scrollWidth>header.clientWidth+1)root.dataset.navFit='collapsed';
}
const scheduleHeaderNav=force=>{cancelAnimationFrame(navFitFrame);navFitFrame=requestAnimationFrame(()=>syncHeaderNav(force))};
// A resize can be handled before the new width has reached layout, and neither
// a font swap nor a link appearing raises one at all, so the observer is what
// makes this reliable: it only ever fires once the header has really changed.
if(window.ResizeObserver)new ResizeObserver(()=>scheduleHeaderNav()).observe(document.querySelector('.site-header'));
window.addEventListener('resize',()=>scheduleHeaderNav(true));
document.fonts?.ready.then(()=>scheduleHeaderNav(true));
const UI_STYLE_KEY='droid-archive-ui-style';
function applyUiStyle(){const style=localStorage.getItem(UI_STYLE_KEY)==='legacy'?'legacy':'modern',button=document.querySelector('#uiStyleButton');document.documentElement.dataset.uiStyle=style;if(button){button.querySelector('strong').textContent=style==='modern'?'Modern':'Legacy';button.title=`Switch to ${style==='modern'?'Legacy':'Modern'} interface`;button.setAttribute('aria-label',button.title);button.setAttribute('aria-pressed',String(style==='modern'))}}
applyUiStyle();applyTheme();renderCloudHeader();scheduleHeaderNav(true);document.querySelector('#uiStyleButton').onclick=()=>{const next=document.documentElement.dataset.uiStyle==='modern'?'legacy':'modern';localStorage.setItem(UI_STYLE_KEY,next);applyUiStyle();route();requestAnimationFrame(updateTimerDocking);toast(`${next==='modern'?'Modern':'Legacy'} interface enabled`)};document.querySelector('#themeButton').onclick=()=>{state.theme=state.theme==='dark'?'light':'dark';save();applyTheme();renderCloudHeader()};document.querySelector('#menuButton').onclick=()=>{const sidebar=document.querySelector('.sidebar'),dropdown=document.querySelector('#cloudDropdown'),cloudButton=document.querySelector('#cloudMenuButton');if(dropdown){dropdown.hidden=true;cloudButton?.setAttribute('aria-expanded','false')}sidebar.classList.toggle('mobile-open')};document.addEventListener('click',()=>{const dropdown=document.querySelector('#cloudDropdown'),button=document.querySelector('#cloudMenuButton');if(dropdown){dropdown.hidden=true;button?.setAttribute('aria-expanded','false')}});document.querySelector('#globalSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){location.hash='#/droids';setTimeout(()=>{const s=document.querySelector('#droidSearch');if(s){s.value=e.target.value;s.dispatchEvent(new Event('input'))}},20)}});window.addEventListener('hashchange',route);
document.querySelector('#copyDiscord').onclick=async()=>{try{await navigator.clipboard.writeText('.saltea');toast('Discord username copied')}catch{toast('Discord: .saltea')}};
const DATA_VERSION='2026-08-16-nova-crit-2';
const loadJson=async path=>{const response=await fetch(`${path}${path.includes('?')?'&':'?'}v=${DATA_VERSION}`);if(!response.ok)throw Error(`Unable to load ${path}`);return response.json()};
function applyStellarData(droids,stellarStats={}){const rules=stellarStats._rules||{},images=stellarStats._images||{},round=value=>Math.round(value*1e6)/1e6;for(const droid of droids){if(droid.rarity==='ICONIC')continue;const base=droid.variants.DEFAULT,known=stellarStats[droid.name]||{},costMultiplier=rules.costMultiplier?.[droid.rarity],incomeMultiplier=rules.incomeMultiplier?.[droid.rarity],craftingMultiplier=rules.craftingMultiplier;droid.variants.STELLAR={cost:known.cost??(knownNumber(base?.cost)&&knownNumber(costMultiplier)?round(base.cost*costMultiplier):null),income:known.income??(knownNumber(base?.income)&&knownNumber(incomeMultiplier)?round(base.income*incomeMultiplier):null),craftingSeconds:known.craftingSeconds??(knownNumber(base?.craftingSeconds)&&knownNumber(craftingMultiplier)?round(base.craftingSeconds*craftingMultiplier):null)};if(images[droid.name])droid.stellarImage=`assets/droids/stellar/${images[droid.name]}`;}return droids}
async function loadEvents(){try{const index=await loadJson('data/events/index.json');if(!Array.isArray(index.events))return[];return Promise.all(index.events.map(file=>loadJson(`data/events/${file}`)))}catch{return[]}}
async function loadPatchNotes(){try{const data=await loadJson(`data/patch-notes.json?${Date.now()}`);return Array.isArray(data.notes)?data.notes:[]}catch{return[]}}
Promise.all(['data/droids.json','data/rebirth-cycles/index.json','data/image-manifest.json','data/nova-shop.json','data/cantina-shop.json','data/stellar.json','data/fusion.json'].map(loadJson)).then(async([d,cycleIndex,i,novaShop,cantinaShop,stellarStats,fusion])=>{if(!Array.isArray(cycleIndex.cycles)||!cycleIndex.cycles.length)throw Error('No Super Rebirth cycles are configured.');const [cycles,events]=await Promise.all([Promise.all(cycleIndex.cycles.map(file=>loadJson(`data/rebirth-cycles/${file}`))),loadEvents()]);state.droids=applyStellarData(d,stellarStats);state.fusion=fusion;state.rebirths=Object.fromEntries(cycles.map((cycle,index)=>[index,cycle]));state.images=i;state.novaShop=novaShop;state.cantinaShop=cantinaShop;state.events=events;normalizeLoadedDroidNames();syncCantinaPackUpgrades();if(!Object.hasOwn(state.rebirths,String(state.cycle)))state.cycle=0;autoPurchaseEligibleSlots();saveLocal();attachModalBehaviour();route();loadPatchNotes().then(notes=>{state.patchNotes=notes;showPatchNotesOnce()});loadSupabaseConfig().then(()=>initSupabaseSafe()).then(()=>renderCloudHeader())}).catch(e=>{app.innerHTML=`<h1>Archive unavailable</h1><p>${e.message}</p>`});
// ── Companion Droidex / rebirth bridges ───────────────────────────────────
// Called from the Electron companion (companion mode only); no-op for browsers.
if(companionMode){
  // Add a droid to the Droidex (idempotent), optionally marking it flawless.
  window.__companionAddToDroidex=(name,variant='DEFAULT',flawless=false)=>{
    try{
      const d=state.droids.find(x=>x.name===name);
      if(!d)return{added:false,error:'unknown-droid'};
      const v=VARIANTS.includes(variant)?variant:'DEFAULT';
      if(!droidexEntry(name,v))state.droidex.push({name,variant:v,flawless:false});
      if(flawless&&!isIconic(d))state.droidex.filter(x=>x.name===name).forEach(x=>x.flawless=true);
      save();
      return{added:true,name,variant:v,flawless:isDroidFlawless(name)};
    }catch(e){return{added:false,error:String(e&&e.message||e)}}
  };
  // ---- Signing in from the companion's own settings ------------------------
  //
  // The companion has no Supabase client of its own; this page holds the
  // session, so it does the work and reports back. The password arrives as an
  // argument, goes straight to Supabase, and is never stored, logged, or put in
  // anything returned from here.
  window.__companionAuthState=()=>{
    try{
      return{ready:supabaseReady(),signedIn:Boolean(state.cloud.user),
             email:state.cloud.user?.email||'',status:state.cloud.status||''};
    }catch(e){return{ready:false,signedIn:false,email:'',status:String(e&&e.message||e)}}
  };
  window.__companionSignIn=async(email,password,createAccount)=>{
    try{
      if(!supabaseReady())return{ok:false,error:'Cloud sync is not configured.'};
      const address=String(email||'').trim(),secret=String(password||'');
      if(!address||!secret)return{ok:false,error:'Enter an email and password.'};
      state.cloud.initializingNewAccount=Boolean(createAccount);
      const result=createAccount
        ? await supabaseClient.auth.signUp({email:address,password:secret,options:{emailRedirectTo:authRedirectUrl()}})
        : await supabaseClient.auth.signInWithPassword({email:address,password:secret});
      if(result.error)throw result.error;
      state.cloud.session=result.data.session;state.cloud.user=result.data.user;
      // Signing up with email confirmation on returns no session: there is
      // nothing to load until the link in the email has been followed.
      if(!state.cloud.session&&createAccount){
        state.cloud.initializingNewAccount=false;
        return{ok:true,confirmEmail:true,email:address};
      }
      await loadSupabaseProfiles(true,{initializeIfMissing:Boolean(createAccount)});
      state.cloud.initializingNewAccount=false;
      return{ok:true,signedIn:true,email:state.cloud.user?.email||address};
    }catch(e){
      state.cloud.initializingNewAccount=false;
      return{ok:false,error:String(e&&e.message||e)};
    }
  };
  window.__companionSignOut=async()=>{
    try{await signOutCloud();return{ok:true}}
    catch(e){return{ok:false,error:String(e&&e.message||e)}}
  };
  // Droidex slots this spawn (quality + rarity) would fill, across the same
  // profiles as the rebirth hint.
  //
  // Unlike a rebirth requirement, a Droidex slot is exact: a Galactic spawn does
  // nothing for an empty Gold square. And Iconic droids have only a DEFAULT
  // square, which is why the Droidex page hides the other tabs for them.
  window.__companionDroidexNeed=(quality,rarity,keys)=>{
    try{
      const q=String(quality||'').toUpperCase(),r=String(rarity||'').toUpperCase();
      if(!VARIANTS.includes(q))return[];
      const missing=()=>state.droids.filter(d=>String(d.rarity).toUpperCase()===r
        &&(q==='DEFAULT'||!onlyDefaultVariant(d))
        &&!droidexEntry(d.name,q)).map(d=>({droidName:d.name,variant:q}));
      const profiles=chosenNeedProfiles(keys),out=new Map();
      const passes=profiles.length?profiles:[{key:'',name:'',owner:'',data:null}];
      for(const profile of passes){
        for(const hit of profile.data?withProfileData(profile.data,missing):missing()){
          const entry=out.get(hit.droidName)||{droidName:hit.droidName,variant:hit.variant,profiles:[]};
          if(profile.key&&!entry.profiles.some(x=>x.key===profile.key))entry.profiles.push({key:profile.key,name:profile.name,owner:profile.owner});
          out.set(hit.droidName,entry);
        }
      }
      return [...out.values()].sort((left,right)=>left.droidName.localeCompare(right.droidName));
    }catch(e){return{error:String(e&&e.message||e)}}
  };
  // Future-rebirth droids this spawn (quality + rarity) could still fill.
  //
  // Checked across profiles, not just the one loaded: a spawn is worth grabbing
  // if ANY of your saves still needs it, and the alert has to say which — being
  // told you need a droid without being told where is not actionable.
  window.__companionRebirthNeed=(quality,rarity,keys)=>{
    try{
      const q=String(quality||'').toUpperCase(),r=String(rarity||'').toUpperCase(),qi=VARIANTS.indexOf(q);
      if(qi<0)return[];
      // One pass over a profile's save. Returns the droids this spawn could
      // still fill for it, and how soon each is wanted.
      const wantedBy=()=>{
        const cycle=state.rebirths?.[state.cycle]||[],found=new Map();
        for(const rb of cycle.filter(x=>x.to>state.rebirth&&x.to<=rebirthGoal()))for(const req of (rb.requiredDroids||[])){
          const d=state.droids.find(x=>x.name===req.droidName);
          if(!d||String(d.rarity).toUpperCase()!==r)continue;      // rarity must match the spawn
          if(VARIANTS.indexOf(req.variant)>qi)continue;            // this quality can satisfy the requirement
          if(hasRequirement(req))continue;                          // already owned at a good-enough quality
          const previous=found.get(req.droidName);
          if(!previous||rb.to<previous.rebirth)found.set(req.droidName,{droidName:req.droidName,variant:req.variant,rebirth:rb.to});
        }
        return [...found.values()];
      };
      const profiles=chosenNeedProfiles(keys),out=new Map();
      // No profile document at all (a shared view, say): fall back to whatever
      // is loaded, so the hint degrades to its old single-save behaviour.
      const passes=profiles.length?profiles:[{key:'',name:'',owner:'',data:null}];
      for(const profile of passes){
        for(const hit of profile.data?withProfileData(profile.data,wantedBy):wantedBy()){
          const entry=out.get(hit.droidName)||{droidName:hit.droidName,variant:hit.variant,rebirth:hit.rebirth,profiles:[]};
          if(hit.rebirth<entry.rebirth){entry.rebirth=hit.rebirth;entry.variant=hit.variant}
          if(profile.key&&!entry.profiles.some(x=>x.key===profile.key))entry.profiles.push({key:profile.key,name:profile.name,owner:profile.owner,rebirth:hit.rebirth});
          out.set(hit.droidName,entry);
        }
      }
      // Soonest-wanted first: that is the one worth acting on.
      return [...out.values()].sort((left,right)=>left.rebirth-right.rebirth);
    }catch(e){return{error:String(e&&e.message||e)}}
  };
}
