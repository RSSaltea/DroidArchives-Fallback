// Read-only orientation: touring a page never applies a plan or edits a profile.
const KEY='droid-archives-site-help-v1';
const steps=[
  {id:'base',title:'Record your Base',route:'/base',target:'.base-actions',task:'Record my current droids, variants and completed builds',text:'Base is your record of the game. Add your droids to the matching slots and select their actual variants. Mark builds complete only after they finish in game. The website does not read or control your live game.'},
  {id:'settings',title:'Match your progression',route:'/base',target:'.sidebar',task:'Check my rebirth, cycle and credit multiplier',text:'Open Settings to check your rebirth, Super Rebirth cycle, credit multiplier and preferences. On mobile, use the Settings button to open the panel. Accurate inputs make the estimates and Optimise useful.'},
  {id:'optimise',title:'Review an Optimise plan',route:'/optimise',target:'#app',task:'Review an Optimise plan and my protection settings',text:'Optimise suggests moves using your recorded Base and preferences. Review the plan before following it in game. Locks and Keep for fusion rules protect copies you want to save. Record steps as you perform them; a plan is not an automatic in-game action.'},
  {id:'rebirth',title:'Plan your next rebirth',route:'/rebirth',target:'#app',task:'Check my next rebirth requirements',text:'Check the correct cycle and the droids, variants and credits required for your next rank. The tracker helps you see what to keep. Only record a Rebirth or Super Rebirth after doing it in game.'},
  {id:'traits',title:'Record traits and compare bonuses',route:'/traits',target:'#app',task:'Review traits and record any I have revealed',text:'Traits lists effects, restrictions and reroll costs. Record a revealed trait on the matching droid in Base using its Trait button. A trait belongs to that copy; it is separate from the droid variant. Iconic traits persist through Super Rebirth.'},
  {id:'upgrades',title:'Keep your upgrades current',route:'/nova-shop',target:'#app',task:'Record my purchased Nova Shop levels',text:'Enter the Nova upgrades you actually own. Planned purchases are not owned upgrades. These levels feed crafting and other calculations. Droid Calc compares droids; Crit Calc helps compare pickaxe and critical upgrades.'},
  {id:'backup',title:'Save and check your profile',route:'/base',target:'.base-actions',task:'Check my profile and export a backup',text:'Use the account control to manage sign-in and profiles. Use Base’s Import / Export controls to save a backup before large changes. Imported files replace recorded information, so check the selected profile first. Local-only data belongs to this browser.'}
];
const read=()=>{try{const value=JSON.parse(localStorage.getItem(KEY)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}};
let saved=read(),active=-1,panel=null,highlight=null,initialized=false,inviteTimer=null;
const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(saved))}catch{}};
const clearHighlight=()=>{highlight?.classList.remove('site-tour-target');highlight=null};
function closeTour(){clearHighlight();panel?.remove();panel=null;active=-1;document.querySelector('#siteHelpLink')?.focus({preventScroll:true})}
function stopTour(done=false){saved.invited=true;saved.tour=done?'finished':'skipped';persist();closeTour()}
function showStep(){
  if(active<0)return;
  const step=steps[active];clearHighlight();
  highlight=[...document.querySelectorAll(step.target)].find(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
  // The entire page should not receive a distracting outline.
  if(highlight?.id!=='app')highlight?.classList.add('site-tour-target');
  if(!panel){panel=document.createElement('section');panel.className='site-tour';panel.setAttribute('role','region');panel.setAttribute('aria-label','Site walkthrough');document.body.append(panel)}
  panel.innerHTML=`<p class="eyebrow">Site walkthrough · ${active+1} of ${steps.length}</p><h2 tabindex="-1" id="siteTourTitle">${step.title}</h2><p>${step.text}</p><div class="site-help-actions"><button type="button" data-tour="back" ${active===0?'disabled':''}>Back</button><button type="button" data-tour="next">${active===steps.length-1?'Finish':'Next'}</button><button type="button" data-tour="skip">Skip tour</button></div><small>You can use the page while this guide is open. Press Escape to close.</small>`;
  panel.querySelector('[data-tour="back"]').onclick=()=>go(active-1);
  panel.querySelector('[data-tour="next"]').onclick=()=>active===steps.length-1?stopTour(true):go(active+1);
  panel.querySelector('[data-tour="skip"]').onclick=()=>stopTour();
  panel.querySelector('h2').focus({preventScroll:true});
}
function go(index){active=Math.max(0,Math.min(index,steps.length-1));saved.invited=true;persist();const hash='#'+steps[active].route;if(location.hash===hash)showStep();else location.hash=hash}
function invite(){
  if(saved.invited||active>=0||location.hash.startsWith('#/shared')||location.hash.includes('reset-password'))return;
  if(document.querySelector('#modalRoot')?.children.length||document.querySelector('dialog[open]')){inviteTimer=setTimeout(invite,3000);return}
  const dialog=document.createElement('dialog');dialog.className='site-help-invite';dialog.setAttribute('aria-labelledby','siteInviteTitle');
  dialog.innerHTML='<h2 id="siteInviteTitle">Would you like a quick tour?</h2><p>New here or already using Droid Archives? Walk through Base, Optimise, rebirth tracking and the main tools. Your saved droids will not be changed.</p><div class="site-help-actions"><button type="button" data-yes>Yes, show me</button><button type="button" data-no>No thanks</button></div><p>You can start it later from the ? help button.</p>';
  const dismiss=()=>{saved.invited=true;persist();dialog.close();dialog.remove()};
  dialog.querySelector('[data-yes]').onclick=()=>{dismiss();go(0)};dialog.querySelector('[data-no]').onclick=dismiss;dialog.oncancel=e=>{e.preventDefault();dismiss()};document.body.append(dialog);dialog.showModal();
}
export function siteHelpAfterRoute(){
  if(!initialized){initialized=true;const link=document.createElement('a');link.id='siteHelpLink';link.href='#/site-guide';link.textContent='?';link.title='How to use Droid Archives';link.setAttribute('aria-label','Help: how to use Droid Archives');document.querySelector('.site-header')?.append(link);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active>=0)stopTour()});inviteTimer=setTimeout(invite,6000)}
  const path=location.hash.slice(1).split('?')[0],stepIndex=steps.findIndex(s=>path===s.route||path.startsWith(s.route+'/')),host=document.querySelector('#app');
  if(stepIndex>=0&&host&&!host.querySelector('.site-context-help')){
    const tip=document.createElement('details');tip.className='site-context-help';
    tip.innerHTML=`<summary>How to use this page</summary><p>${steps[stepIndex].text}</p><button type="button">Show me this step</button>`;
    tip.querySelector('button').onclick=()=>go(stepIndex);host.prepend(tip);
  }
  if(active>=0){const path=location.hash.split('?')[0],expected='#'+steps[active].route;if(path===expected||path.startsWith(expected+'/'))showStep();else stopTour()}
}
export function siteHelpPage(host){
  clearTimeout(inviteTimer);saved.invited=true;persist();
  host.innerHTML=`<article class="journey-guide site-help-page"><p class="eyebrow">Using Droid Archives</p><h1>Your site starter guide</h1><p>Start with an accurate Base, then use the tools to plan your next move. Changes here record your progress; they do not change the game.</p><button type="button" id="startSiteTour">Start walkthrough</button><h2>Your setup checklist</h2><p>Tick these after doing them. Progress is saved in this browser; viewing a tour step does not complete a task.</p><p id="helpChecklistCount" aria-live="polite"></p><div class="site-help-checklist">${steps.map((s,i)=>`<section><label><input type="checkbox" data-help-check="${s.id}" ${saved.tasks?.[s.id]?'checked':''}>${s.task}</label><div><button type="button" data-help-step="${i}">Show me</button><details><summary>What does this do?</summary><p>${s.text}</p></details></div></section>`).join('')}</div><h2>Other useful tools</h2><dl><dt><a href="#/droids">Droids</a> and <a href="#/droidex">Droidex</a></dt><dd>Look up prices, income, crafting times and variants; track your collection separately from your current Base.</dd><dt><a href="#/fusion-lab">Fusion Lab</a></dt><dd>Check recipes and possible outcomes before consuming droids. Review variants and protected copies.</dd><dt><a href="#/droid-calc">Droid Calc</a> and <a href="#/crit-calc">Crit Calc</a></dt><dd>Compare droid values and critical upgrades using your recorded settings. Estimates depend on those inputs.</dd></dl><p>For the in-game journey, open the <a href="#/guide">first-droid-to-endgame guide</a>.</p></article>`;
  const count=()=>{host.querySelector('#helpChecklistCount').textContent=`${steps.filter(s=>saved.tasks?.[s.id]).length} / ${steps.length} tasks completed`};count();
  host.querySelector('#startSiteTour').onclick=()=>go(0);
  host.querySelectorAll('[data-help-step]').forEach(b=>b.onclick=()=>go(Number(b.dataset.helpStep)));
  host.querySelectorAll('[data-help-check]').forEach(input=>input.onchange=()=>{saved.tasks={...saved.tasks,[input.dataset.helpCheck]:input.checked};persist();count()});
}
