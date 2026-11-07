// Read-only orientation: touring a page never applies a plan or edits a profile.
const KEY='droid-archives-site-help-v1';
const steps=[
  {id:'settings',title:'Set your progression first',route:'/base',target:'.sidebar.mobile-open #baseSidebarControls, .modern-base-settings:not(.collapsed) .modern-settings-body, #baseSidebarControls, #baseDrawerButton, #toggleCommandSettings, #menuButton',task:'Check my rebirth, cycle and credit multiplier',text:'Before adding droids, open Settings and enter your current rebirth, Super Rebirth cycle and credit multiplier. Check your slot and purchase preferences too. This makes the available slots and later calculations match your progress.'},
  {id:'base',title:'Record droids in the map',route:'/base',target:'#baseMapPanel .tm-viewport, #baseMapPanel, #toggleBaseMap',task:'Record my current droids, variants and completed builds',text:'Use Show Map if the map is hidden. Select an available empty slot to add the droid standing there in game, then choose its actual variant. Select an occupied slot to manage that copy. Mark builds complete only after they finish in game. The website records your Base; it does not control the game.'},
  {id:'cards',title:'Use cards to manage your Base',route:'/base',target:'#tmTraditionalCards .station, #tmTraditionalCards, #tmCardsToggle',task:'Try the map or cards view for managing my droids',text:'Cards are another view of the same Base, not a second collection. Use Show Cards if they are hidden, then choose an empty slot to add a droid or an occupied card to manage it. Changes appear in both views, so do not add the same copy twice. Use whichever view you find easier.'},
  {id:'optimise',title:'Review an Optimise plan',route:'/optimise',target:'.optimise-steps, .optimise-stats, #app section[role="status"]',task:'Review an Optimise plan and my protection settings',text:'Optimise suggests moves using your recorded Base and preferences. Review the plan before following it in game. Locks and Keep for fusion rules protect copies you want to save. Record steps as you perform them; a plan is not an automatic in-game action.'},
  {id:'rebirth',title:'Plan your next rebirth',route:'/rebirth',target:'.rebirth-tracker-toolbar, .rebirth-detail-group:not(.past), .rebirth-page-summary',task:'Check my next rebirth requirements',text:'Check the correct cycle and the droids, variants and credits required for your next rank. The tracker helps you see what to keep. Only record a Rebirth or Super Rebirth after doing it in game.'},
  {id:'trading',title:'Find and offer droids',route:'/trading',target:'.trading-page .trade-picker-modes',task:'Explore Trading and how to protect rebirth copies',text:'Browse listings or create one using copies from your Base cards or map. Choose wanted droids or traits, and hide protected rebirth copies before offering spares. An accepted offer opens a private conversation. Exchange droids in game, then both confirm completion. Received droids appear in Unallocated; use Update Base: choose traded slots to remove the exact copies you gave away.'},
  {id:'traits',title:'Record traits and compare bonuses',route:'/traits',target:'.trait-filters',task:'Review traits and record any I have revealed',text:'Traits lists effects, restrictions and reroll costs. Record a revealed trait on the matching droid in Base using its Trait button. A trait belongs to that copy; it is separate from the droid variant. Iconic traits persist through Super Rebirth.'},
  {id:'upgrades',title:'Keep your upgrades current',route:'/nova-shop',target:'.nova-level-control, .nova-plan-controls, .nova-iconic-unlock, .nova-category-rail',task:'Record my purchased Nova Shop levels',text:'Select an upgrade, then use its tracked-level controls to record what you actually own. In Planner, use Owned now for purchases already made and Target level for plans. For Iconic Droids, tick Unlocked permanently only after unlocking them. Planned purchases are not owned upgrades. These levels feed crafting and other calculations. Droid Calc compares droids; Crit Calc helps compare pickaxe and critical upgrades.'},
  {id:'backup',title:'Save and check your profile',route:'/base',target:'#transferBase',task:'Check my profile and export a backup',text:'Use the account control to manage sign-in and profiles. Use Base’s Import / Export controls to save a backup before large changes. Imported files replace recorded information, so check the selected profile first. Local-only data belongs to this browser.'}
];
const read=()=>{try{const value=JSON.parse(localStorage.getItem(KEY)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}};
let saved=read(),active=-1,panel=null,highlight=null,initialized=false,inviteTimer=null,spotlight=null,spotlightFrame=0,spotlightWidth=0,spotlightLayout='';
const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(saved))}catch{}};
const clearHighlight=()=>{highlight?.classList.remove('site-tour-target');highlight=null};
function attachHighlight(target){
  if(target===highlight)return false;
  clearHighlight();highlight=target;highlight?.classList.add('site-tour-target');return true;
}
function closeSettingsForPageStep(){
  if(!onStepPage()||steps[active].id==='settings')return;
  // The shell owns the drawer's blur layer and scroll lock. Close it through
  // its real control rather than hiding a backdrop or overriding its styles.
  const drawer=document.querySelector('.sidebar.mobile-open');
  if(drawer)(document.querySelector('#baseDrawerClose')||document.querySelector('#menuButton'))?.click();
}

function closeTour(){cancelAnimationFrame(spotlightFrame);spotlight?.remove();spotlight=null;clearHighlight();panel?.remove();panel=null;active=-1;document.querySelector('#siteHelpLink')?.focus({preventScroll:true})}
function stopTour(done=false){saved.invited=true;saved.tour=done?'finished':'skipped';persist();closeTour()}
const onStepPage=()=>{const path=location.hash.slice(1).split('?')[0]||'/';return path===steps[active].route||path.startsWith(steps[active].route+'/')};
const destinationName=()=>({'/base':'Base','/optimise':'Optimise','/rebirth':'Rebirth','/trading':'Trading','/traits':'Traits','/nova-shop':'Nova Shop'}[steps[active].route]);
const renderedTarget=el=>{
  const r=el.getBoundingClientRect(),style=getComputedStyle(el),drawer=el.closest('.sidebar');
  const dr=drawer?.getBoundingClientRect();
  return r.width>0&&r.height>0&&style.visibility!=='hidden'&&style.display!=='none'&&(!dr||dr.right>0&&dr.left<innerWidth);
};
const visibleTarget=el=>{const r=el.getBoundingClientRect();return renderedTarget(el)&&r.right>0&&r.left<innerWidth};
function showStep(){
  if(active<0)return;
  const step=steps[active],waiting=!onStepPage();clearHighlight();closeSettingsForPageStep();
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
    // Controls in horizontally scrolling rows still exist: reveal them rather
    // than treating them as missing (for example Base's Import / Export).
    const el=[...document.querySelectorAll(selector.trim())].find(renderedTarget);
    if(el)return el;
  }
  // Wait for the step's actual control to render. A heading is not a useful
  // substitute and can silently hide a stale selector after a page redesign.
  return null;
}
function revealTarget(target){
  if(!target||target.matches('.sidebar'))return;
  // Cancel an in-flight smooth page scroll before measuring the new target.
  window.scrollTo({left:scrollX,top:scrollY,behavior:'instant'});
  const viewport=window.visualViewport,top=viewport?.offsetTop||0,bottom=top+(viewport?.height||innerHeight);
  let safeTop=top+12;
  for(const bar of document.querySelectorAll('.site-header,.toolbar,.base-heading')){
    const style=getComputedStyle(bar),r=bar.getBoundingClientRect();
    if(['sticky','fixed'].includes(style.position)&&r.bottom>top&&r.top<bottom/2)safeTop=Math.max(safeTop,r.bottom+12);
  }
  const r=target.getBoundingClientRect();
  if(r.top>=safeTop&&r.bottom<=bottom-12&&r.left>=12&&r.right<=innerWidth-12)return;
  target.scrollIntoView({block:r.height>(bottom-safeTop)*.65?'start':'center',inline:'nearest',behavior:'instant'});
  const after=target.getBoundingClientRect();
  if(after.top<safeTop)window.scrollBy({top:after.top-safeTop,behavior:'instant'});
}
function startSpotlight(){
  cancelAnimationFrame(spotlightFrame);
  if(!spotlight){
    spotlight=document.createElement('div');spotlight.className='site-tour-spotlight';
    spotlight.innerHTML='<div class="tour-shade" aria-hidden="true"></div>'.repeat(4);
    document.body.append(spotlight);
  }
  // One containing block for the card and shading. The outline itself belongs
  // to the real control, so scrolling, wrapping and Safari zoom cannot detach it.
  spotlight.append(panel);
  spotlightWidth=0;spotlightLayout='';
  const update=()=>{
    if(active<0||!panel||!spotlight)return;
    placeSpotlight();
    spotlightFrame=requestAnimationFrame(update);
  };
  placeSpotlight();spotlightFrame=requestAnimationFrame(update);
}
function placeSpotlight(){
  // A drawer the user opens mid-step is a real occluder, not a tour blur. Point
  // at its close control until the page is available again.
  const close=document.querySelector('.sidebar.mobile-open')&&(document.querySelector('#baseDrawerClose')||document.querySelector('#menuButton'));
  const target=onStepPage()&&steps[active].id!=='settings'&&close?close:targetForStep();
  const changed=attachHighlight(target);
  const surface=spotlight.getBoundingClientRect(),w=surface.width,h=surface.height;
  if(changed||w!==spotlightWidth)revealTarget(target);
  spotlightWidth=w;
  const r=target?.getBoundingClientRect(),pad=8;
  const visible=r&&r.bottom>surface.top&&r.top<surface.bottom&&r.right>surface.left&&r.left<surface.right;
  const x=visible?Math.max(0,r.left-surface.left-pad):0,y=visible?Math.max(0,r.top-surface.top-pad):0;
  const right=visible?Math.min(w,r.right-surface.left+pad):0,bottom=visible?Math.min(h,r.bottom-surface.top+pad):0;
  const viewport=window.visualViewport,margin=12;
  const vx=Math.max(0,(viewport?.offsetLeft||0)-surface.left),vy=Math.max(0,(viewport?.offsetTop||0)-surface.top);
  const vw=Math.min(w-vx,viewport?.width||w),vh=Math.min(h-vy,viewport?.height||h);
  const layout=[x,y,right,bottom,w,h,vx,vy,vw,vh,panel.offsetWidth,panel.offsetHeight].join(',');
  if(layout===spotlightLayout)return;
  spotlightLayout=layout;
  const boxes=visible?[[0,0,w,y],[0,y,x,bottom-y],[right,y,w-right,bottom-y],[0,bottom,w,h-bottom]]:[[0,0,w,h],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  spotlight.querySelectorAll('.tour-shade').forEach((shade,i)=>{
    const [left,top,width,height]=boxes[i];
    Object.assign(shade.style,{left:left+'px',top:top+'px',width:width+'px',height:height+'px'});
  });
  panel.style.width=Math.max(0,Math.min(440,vw-margin*2))+'px';
  panel.style.maxHeight=Math.max(0,vh*(vw<=600?.44:.6))+'px';
  const ph=panel.offsetHeight,pw=panel.offsetWidth;
  let px=vx+vw-pw-margin,py=vy+vh-ph-margin;
  // Prefer a nearby position outside the target; a large map uses a docked card.
  if(visible){
    const beside=right+margin+pw<=vx+vw-margin;
    const before=x-margin-pw>=vx+margin;
    const below=bottom+margin+ph<=vy+vh-margin;
    const above=y-margin-ph>=vy+margin;
    if(vw>760&&beside){px=right+margin;py=y;}
    else if(vw>760&&before){px=x-margin-pw;py=y;}
    else if(below){px=x;py=bottom+margin;}
    else if(above){px=x;py=y-margin-ph;}
  }
  px=Math.max(vx+margin,Math.min(vx+vw-pw-margin,px));
  py=Math.max(vy+margin,Math.min(vy+vh-ph-margin,py));
  Object.assign(panel.style,{left:px+'px',top:py+'px',right:'auto',bottom:'auto'});
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
