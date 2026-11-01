// Read-only orientation: touring a page never applies a plan or edits a profile.
const KEY='droid-archives-site-help-v1';
const steps=[
  {id:'settings',title:'Set your progression first',route:'/base',target:'.sidebar, #baseDrawerButton, #toggleCommandSettings',task:'Check my rebirth, cycle and credit multiplier',text:'Before adding droids, open Settings and enter your current rebirth, Super Rebirth cycle and credit multiplier. Check your slot and purchase preferences too. This makes the available slots and later calculations match your progress.'},
  {id:'base',title:'Record droids in the map',route:'/base',target:'#baseMapPanel .tm-viewport, #baseMapPanel, #toggleBaseMap',task:'Record my current droids, variants and completed builds',text:'Use Show Map if the map is hidden. Select an available empty slot to add the droid standing there in game, then choose its actual variant. Select an occupied slot to manage that copy. Mark builds complete only after they finish in game. The website records your Base; it does not control the game.'},
  {id:'cards',title:'Use cards to manage your Base',route:'/base',target:'#tmTraditionalCards .station, #tmTraditionalCards, #tmCardsToggle',task:'Try the map or cards view for managing my droids',text:'Cards are another view of the same Base, not a second collection. Use Show Cards if they are hidden, then choose an empty slot to add a droid or an occupied card to manage it. Changes appear in both views, so do not add the same copy twice. Use whichever view you find easier.'},
  {id:'optimise',title:'Review an Optimise plan',route:'/optimise',target:'#optimiseTrack, #app .panel, #app h1',task:'Review an Optimise plan and my protection settings',text:'Optimise suggests moves using your recorded Base and preferences. Review the plan before following it in game. Locks and Keep for fusion rules protect copies you want to save. Record steps as you perform them; a plan is not an automatic in-game action.'},
  {id:'rebirth',title:'Plan your next rebirth',route:'/rebirth',target:'.rebirth-hero',task:'Check my next rebirth requirements',text:'Check the correct cycle and the droids, variants and credits required for your next rank. The tracker helps you see what to keep. Only record a Rebirth or Super Rebirth after doing it in game.'},
  {id:'traits',title:'Record traits and compare bonuses',route:'/traits',target:'.trait-filters, .traits-page h1',task:'Review traits and record any I have revealed',text:'Traits lists effects, restrictions and reroll costs. Record a revealed trait on the matching droid in Base using its Trait button. A trait belongs to that copy; it is separate from the droid variant. Iconic traits persist through Super Rebirth.'},
  {id:'upgrades',title:'Keep your upgrades current',route:'/nova-shop',target:'.nova-hero',task:'Record my purchased Nova Shop levels',text:'Enter the Nova upgrades you actually own. Planned purchases are not owned upgrades. These levels feed crafting and other calculations. Droid Calc compares droids; Crit Calc helps compare pickaxe and critical upgrades.'},
  {id:'backup',title:'Save and check your profile',route:'/base',target:'#transferBase',task:'Check my profile and export a backup',text:'Use the account control to manage sign-in and profiles. Use Base’s Import / Export controls to save a backup before large changes. Imported files replace recorded information, so check the selected profile first. Local-only data belongs to this browser.'}
];
const read=()=>{try{const value=JSON.parse(localStorage.getItem(KEY)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}};
let saved=read(),active=-1,panel=null,highlight=null,initialized=false,inviteTimer=null,spotlight=null,spotlightFrame=0;
const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(saved))}catch{}};
const clearHighlight=()=>{highlight?.classList.remove('site-tour-target');highlight=null};
function closeTour(){cancelAnimationFrame(spotlightFrame);spotlight?.remove();spotlight=null;clearHighlight();panel?.remove();panel=null;active=-1;document.querySelector('#siteHelpLink')?.focus({preventScroll:true})}
function stopTour(done=false){saved.invited=true;saved.tour=done?'finished':'skipped';persist();closeTour()}
const onStepPage=()=>{const path=location.hash.slice(1).split('?')[0]||'/';return path===steps[active].route||path.startsWith(steps[active].route+'/')};
const destinationName=()=>({'/base':'Base','/optimise':'Optimise','/rebirth':'Rebirth','/traits':'Traits','/nova-shop':'Nova Shop'}[steps[active].route]);
const visibleTarget=el=>{const r=el.getBoundingClientRect(),style=getComputedStyle(el);return r.width>0&&r.height>0&&style.visibility!=='hidden'&&style.display!=='none'&&r.right>0&&r.left<innerWidth};
function showStep(){
  if(active<0)return;
  const step=steps[active],waiting=!onStepPage();clearHighlight();
  if(!panel){panel=document.createElement('section');panel.className='site-tour';panel.setAttribute('role','region');panel.setAttribute('aria-label','Site walkthrough');document.body.append(panel)}
  panel.dataset.tourPhase=waiting?'navigation':'content';panel.dataset.tourDestination=step.route;
  panel.innerHTML=`<p class="eyebrow">Site walkthrough · ${active+1} of ${steps.length}</p><h2 tabindex="-1" id="siteTourTitle">${waiting?'Open '+destinationName():step.title}</h2><p>${waiting?'Select <strong>'+destinationName()+'</strong> in the site navigation. If it is hidden, open the highlighted menu first. Once the page opens, this walkthrough will explain what to do there.':step.text}</p><div class="site-help-actions"><button type="button" data-tour="back" ${active===0?'disabled':''}>Back</button><button type="button" data-tour="next" ${waiting?'disabled':''}>${active===steps.length-1?'Finish':'Next'}</button><button type="button" data-tour="skip">Skip tour</button></div><small>You can use the page while this guide is open. Press Escape to close.</small>`;
  panel.querySelector('[data-tour="back"]').onclick=()=>go(active-1);
  panel.querySelector('[data-tour="next"]').onclick=()=>active===steps.length-1?stopTour(true):go(active+1);
  panel.querySelector('[data-tour="skip"]').onclick=()=>stopTour();
  panel.querySelector('h2').focus({preventScroll:true});
  startSpotlight();
}
function targetForStep(){
  if(!onStepPage()){
    const links=[...document.querySelectorAll(`#nav a[href="#${steps[active].route}"],.sidebar a[href="#${steps[active].route}"],.toolbar a[href="#${steps[active].route}"]`)];
    return links.find(visibleTarget)||[...document.querySelectorAll('#menuButton,.menu-button')].find(visibleTarget)||document.querySelector('#nav');
  }
  for(const selector of steps[active].target.split(',')){
    const el=[...document.querySelectorAll(selector.trim())].find(el=>{const r=el.getBoundingClientRect(),style=getComputedStyle(el);return r.width>0&&r.height>0&&style.visibility!=='hidden'&&style.display!=='none'&&r.right>0&&r.left<innerWidth});
    if(el)return el;
  }
  return document.querySelector('#app h1');
}
function startSpotlight(){
  cancelAnimationFrame(spotlightFrame);
  if(!spotlight){
    spotlight=document.createElementNS('http://www.w3.org/2000/svg','svg');spotlight.classList.add('site-tour-spotlight');spotlight.setAttribute('aria-hidden','true');
    spotlight.innerHTML='<defs><marker id="tourArrowHead" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0 L10 5 L0 10 Z" fill="#76ffd0"/></marker></defs><path class="tour-shade" fill-rule="evenodd"/><rect class="tour-ring" rx="8"/><path class="tour-pointer" marker-end="url(#tourArrowHead)"/>';
    document.body.append(spotlight);
  }
  const target=targetForStep();
  if(target){const r=target.getBoundingClientRect();if(r.top<110||r.bottom>innerHeight-panel.offsetHeight-35)target.scrollIntoView({block:'center',behavior:'instant'});}
  let last=0;
  const update=time=>{
    if(active<0||!panel||!spotlight)return;
    if(time-last>50){last=time;placeSpotlight();}
    spotlightFrame=requestAnimationFrame(update);
  };
  placeSpotlight();spotlightFrame=requestAnimationFrame(update);
}
function placeSpotlight(){
  const target=targetForStep(),w=innerWidth,h=innerHeight;
  spotlight.setAttribute('viewBox',`0 0 ${w} ${h}`);
  const r=target?.getBoundingClientRect();
  const visible=r&&r.bottom>0&&r.top<h;
  const x=visible?Math.max(4,r.left-7):0,y=visible?Math.max(4,r.top-7):0;
  const right=visible?Math.min(w-4,r.right+7):0,bottom=visible?Math.min(h-4,r.bottom+7):0;
  const width=Math.max(0,right-x),height=Math.max(0,bottom-y);
  // A real transparent hole avoids changing the target's stacking or click behaviour.
  spotlight.querySelector('.tour-shade').setAttribute('d',`M0 0H${w}V${h}H0Z`+(visible?` M${x} ${y}H${right}V${bottom}H${x}Z`:''));
  const ring=spotlight.querySelector('.tour-ring');ring.style.display=visible?'':'none';
  for(const [key,value] of Object.entries({x,y,width,height}))ring.setAttribute(key,value);
  const ph=panel.offsetHeight,pw=panel.offsetWidth,margin=12;
  let px=w-pw-margin,py=h-ph-margin;
  // Keep the explanation clear of its target, including a Settings drawer.
  if(visible&&px<right&&px+pw>x&&py<bottom&&py+ph>y){
    if(y>ph+margin*2)py=y-ph-margin;
    else if(bottom+ph+margin<h)py=bottom+margin;
    else if(x>pw+margin*2)px=margin;
    else if(right+pw+margin<w)px=right+margin;
    else py=y>h/2?margin:h-ph-margin;
  }
  panel.style.left=`${Math.max(margin,px)}px`;panel.style.top=`${Math.max(margin,py)}px`;panel.style.right='auto';panel.style.bottom='auto';
  const arrow=spotlight.querySelector('.tour-pointer');arrow.style.display=visible?'':'none';
  if(visible){
    const cx=x+width/2,cy=y+height/2,pcx=px+pw/2,pcy=py+ph/2;
    const dx=cx-pcx,dy=cy-pcy;
    const t=1/Math.max(Math.abs(dx)/(pw/2+8),Math.abs(dy)/(ph/2+8),1);
    const end=1/Math.max(Math.abs(dx)/(width/2+10),Math.abs(dy)/(height/2+10),1);
    if(px<right&&px+pw>x&&py<bottom&&py+ph>y&&y<py-24){
      const tipX=Math.max(x+12,Math.min(right-12,pcx)),tipY=Math.min(py-24,y+height/2);
      arrow.setAttribute('d',`M${pcx} ${py-8} L${tipX} ${tipY}`);
    }else arrow.setAttribute('d',`M${pcx+dx*t} ${pcy+dy*t} L${cx-dx*end} ${cy-dy*end}`);
  }
}
function go(index){active=Math.max(0,Math.min(index,steps.length-1));saved.invited=true;persist();showStep()}
function invite(){
  if(saved.invited||active>=0||location.hash.startsWith('#/shared')||location.hash.includes('reset-password'))return;
  if(document.querySelector('#modalRoot')?.children.length||document.querySelector('dialog[open]')){inviteTimer=setTimeout(invite,3000);return}
  const dialog=document.createElement('dialog');dialog.className='site-help-invite';dialog.setAttribute('aria-labelledby','siteInviteTitle');
  dialog.innerHTML='<h2 id="siteInviteTitle">Would you like a quick tour?</h2><p>New here or already using Droid Archives? Walk through Base, Optimise, rebirth tracking and the main tools. Your saved droids will not be changed.</p><div class="site-help-actions"><button type="button" data-yes>Yes, show me</button><button type="button" data-no>No thanks</button></div><p>You can start it later from the ? help button.</p>';
  const dismiss=()=>{saved.invited=true;persist();dialog.close();dialog.remove()};
  dialog.querySelector('[data-yes]').onclick=()=>{dismiss();go(0)};dialog.querySelector('[data-no]').onclick=dismiss;dialog.oncancel=e=>{e.preventDefault();dismiss()};document.body.append(dialog);dialog.showModal();
}
export function siteHelpAfterRoute(){
  if(!initialized){initialized=true;const link=document.createElement('a');link.id='siteHelpLink';link.href='#/site-guide';link.textContent='?';link.title='How to use Droid Archives';link.setAttribute('aria-label','Help: how to use Droid Archives');document.body.append(link);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active>=0)stopTour()});inviteTimer=setTimeout(invite,6000)}
  const path=location.hash.slice(1).split('?')[0],stepIndex=steps.findIndex(s=>path===s.route||path.startsWith(s.route+'/')),host=document.querySelector('#app');
  if(stepIndex>=0&&host&&!host.querySelector('.site-context-help')){
    const tip=document.createElement('details');tip.className='site-context-help';
    tip.innerHTML=`<summary>How to use this page</summary><p>${steps[stepIndex].text}</p><button type="button">Show me this step</button>`;
    tip.querySelector('button').onclick=()=>go(stepIndex);host.prepend(tip);
  }
  if(active>=0)showStep();
}
export function siteHelpPage(host){
  if(active>=0)stopTour();
  clearTimeout(inviteTimer);saved.invited=true;persist();
  host.innerHTML=`<article class="journey-guide site-help-page"><p class="eyebrow">Using Droid Archives</p><h1>Your site starter guide</h1><p>Start with an accurate Base, then use the tools to plan your next move. Changes here record your progress; they do not change the game.</p><button type="button" id="startSiteTour">Start walkthrough</button><h2>Your setup checklist</h2><p>Tick these after doing them. Progress is saved in this browser; viewing a tour step does not complete a task.</p><p id="helpChecklistCount" aria-live="polite"></p><div class="site-help-checklist">${steps.map((s,i)=>`<section><label><input type="checkbox" data-help-check="${s.id}" ${saved.tasks?.[s.id]?'checked':''}>${s.task}</label><div><button type="button" data-help-step="${i}">Show me</button><details><summary>What does this do?</summary><p>${s.text}</p></details></div></section>`).join('')}</div><h2>Other useful tools</h2><dl><dt><a href="#/droids">Droids</a> and <a href="#/droidex">Droidex</a></dt><dd>Look up prices, income, crafting times and variants; track your collection separately from your current Base.</dd><dt><a href="#/fusion-lab">Fusion Lab</a></dt><dd>Check recipes and possible outcomes before consuming droids. Review variants and protected copies.</dd><dt><a href="#/droid-calc">Droid Calc</a> and <a href="#/crit-calc">Crit Calc</a></dt><dd>Compare droid values and critical upgrades using your recorded settings. Estimates depend on those inputs.</dd></dl><p>For the in-game journey, open the <a href="#/guide">first-droid-to-endgame guide</a>.</p></article>`;
  const count=()=>{host.querySelector('#helpChecklistCount').textContent=`${steps.filter(s=>saved.tasks?.[s.id]).length} / ${steps.length} tasks completed`};count();
  host.querySelector('#startSiteTour').onclick=()=>go(0);
  host.querySelectorAll('[data-help-step]').forEach(b=>b.onclick=()=>go(Number(b.dataset.helpStep)));
  host.querySelectorAll('[data-help-check]').forEach(input=>input.onchange=()=>{saved.tasks={...saved.tasks,[input.dataset.helpCheck]:input.checked};persist();count()});
}
