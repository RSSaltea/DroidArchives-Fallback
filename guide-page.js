import { GUIDE_CHAPTERS } from './guide-content.js?v=2026-10-12-guide';
import { novaTotalCost } from './nova-levels.js?v=2026-10-07-unlimited';

const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => Number(value).toLocaleString('en-GB');
export const GUIDE_MILESTONES = [
  {name:'First essentials', targets:{'rebirth-droid-alert':1,'blueprint-scrap':1,'scrap-value':2}},
  {name:'Stronger scrap', targets:{'rebirth-droid-alert':1,'blueprint-scrap':2,'scrap-value':6}},
  {name:'Second Companion', targets:{'companion-slot':1}},
  {name:'Pickaxe Mastery 10', targets:{'pickaxe-mastery':10}}
];

export function guideShoppingPlan({shop, owned = {}, milestone = 0, balance = 0, rebirth = 0}) {
  const target = GUIDE_MILESTONES[milestone] || GUIDE_MILESTONES[0];
  const rows = Object.entries(target.targets).map(([id, level]) => {
    const upgrade = shop.upgrades.find(u => u.id === id);
    const have = Math.max(0, Math.floor(Number(owned[id]) || 0));
    return {id, name:upgrade.name, level, have, cost:Math.max(0, novaTotalCost(upgrade, level) - novaTotalCost(upgrade, have))};
  });
  const cost = rows.reduce((sum, row) => sum + row.cost, 0);
  const available = Math.max(0, Number(balance) || 0);
  const rewards = shop.rebirthRewards.slice().sort((a,b) => a.rebirth-b.rebirth);
  const rank = rewards.find(r => r.rebirth >= rebirth && available + r.novaCrystals + rewards.filter(x => x.rebirth > rebirth && x.rebirth <= r.rebirth).reduce((sum,x) => sum + (x.regularNovaCrystals || 0),0) >= cost)?.rebirth ?? null;
  return {rows, cost, shortfall:Math.max(0,cost-available), rank};
}

export function guidePage({host, shop, owned, rebirth, cycle, profileKey, surgeCards}) {
  const key = `droid-archive-guide:${profileKey}`;
  let progress = {};
  try {const saved=JSON.parse(localStorage.getItem(key)||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))progress=saved;} catch {}
  const write=()=>{try{localStorage.setItem(key,JSON.stringify(progress));}catch{}};
  host.innerHTML = `<article class="journey-guide">
    <header class="guide-intro"><p class="eyebrow">Playing efficiently · Work in progress</p><h1>From your first droid to endgame</h1><p>A full journey through your early Super Rebirths, permanent upgrades and late-game runs. Follow the chapters in order, or jump to the part you need.</p><small>This guide is being expanded. Shopping estimates use your recorded upgrades; gameplay advice follows this progression strategy.</small></header>
    <nav class="guide-contents" aria-label="Guide chapters">${GUIDE_CHAPTERS.map((c,i)=>`<button type="button" data-guide-jump="${c.id}"><span>${i+1}</span>${c.title}</button>`).join('')}</nav>
    <section class="guide-shopping" aria-labelledby="guideShoppingTitle"><p class="eyebrow">Your next milestone</p><h2 id="guideShoppingTitle">Plan the next Super Rebirth</h2><p>Using the selected profile at <strong>Cycle ${number(cycle+1)} · R${number(rebirth)}</strong>. <a href="#/base">Update your Base</a> if these values are wrong.</p>
      <div class="guide-fields"><label>Shopping goal<select id="guideMilestone">${GUIDE_MILESTONES.map((m,i)=>`<option value="${i}">${m.name}</option>`).join('')}</select></label><label>Nova available now<input id="guideNova" type="number" min="0" step="1" value="0" inputmode="numeric"></label></div>
      <div id="guideShoppingResult" aria-live="polite"></div><small>Includes only regular Nova still to earn in this run and the Super Rebirth payout at the completed rank. Include any crystals already earned in your available balance. Excludes future quests, events and other spending. This does not change your Nova Planner targets.</small>
    </section>
    <p class="guide-progress"><strong id="guideProgressCount"></strong> chapters read · remembered for this profile in this browser.</p>
    <div class="guide-chapters">${GUIDE_CHAPTERS.map((c,i)=>`<details class="guide-chapter" id="guide-${c.id}" ${progress['open:'+c.id]===true||(progress['open:'+c.id]===undefined&&i===0)?'open':''}><summary><span class="guide-number">${i+1}</span><span><strong>${c.title}</strong><small>${c.goal}</small></span></summary><div class="guide-chapter-body">${c.body}${c.id==='surges'?`<details class="guide-surge-helper"><summary>Surge Guide · what to leave on the belt</summary><div class="guide-extra"><p><strong>Cycle ${number(cycle+1)} · after R${number(rebirth)}</strong>. Includes requirements through the end of this cycle, even beyond your selected Super Rebirth goal.</p><p>Leave Legendaries and Mythics. These Epics are also worth keeping available for upgrades because they have an unmet rebirth requirement or match your saved fusion rules.</p><div class="guide-droids">${surgeCards||'<p>No extra Epic targets from your recorded Base and fusion rules. Check that your Base is up to date.</p>'}</div><p>Clear lower-priority droids, but collect anything needed for your own Base first. This list cannot see the live belt; it does not identify which droid the next wave will upgrade.</p></div></details>`:''}<label class="guide-read"><input type="checkbox" data-guide-read="${c.id}" ${progress[c.id]===true?'checked':''}> I have read this chapter</label></div></details>`).join('')}</div>
  </article>`;
  const updatePlan=()=>{
    const plan=guideShoppingPlan({shop,owned,rebirth,milestone:Number(host.querySelector('#guideMilestone').value),balance:host.querySelector('#guideNova').value});
    host.querySelector('#guideShoppingResult').innerHTML=`<ul class="guide-shopping-list">${plan.rows.map(r=>`<li><span>${esc(r.name)} <small>Owned ${number(r.have)} → goal ${r.level}</small></span><strong>${r.cost?number(r.cost)+' Nova':'Owned'}</strong></li>`).join('')}</ul><p><strong>${number(plan.cost)} Nova still to spend</strong>${plan.shortfall?` · ${number(plan.shortfall)} beyond your entered balance`:' · covered by your entered balance'}</p><p>${!plan.cost?'You already own this milestone. Choose the next one.':!plan.shortfall?'You can fund this milestone now; no Super Rebirth needed to cover its cost.':plan.rank!==null?`Complete <strong>R${plan.rank}</strong>, then Super Rebirth to fund this milestone under the assumptions below.`:'This run alone does not fund the full milestone. Keep saving, earn other Nova rewards, or plan another Super Rebirth.'}</p>`;
  };
  host.querySelector('#guideMilestone').onchange=updatePlan;
  host.querySelector('#guideNova').oninput=updatePlan;updatePlan();
  const updateCount=()=>{host.querySelector('#guideProgressCount').textContent=`${GUIDE_CHAPTERS.filter(c=>progress[c.id]===true).length} / ${GUIDE_CHAPTERS.length}`;};updateCount();
  host.querySelectorAll('[data-guide-read]').forEach(input=>input.onchange=()=>{progress[input.dataset.guideRead]=input.checked;write();updateCount();});
  host.querySelectorAll('.guide-chapter').forEach(section=>section.addEventListener('toggle',()=>{if(!section.isConnected)return;progress['open:'+section.id.slice(6)]=section.open;write();}));
  host.querySelectorAll('[data-guide-jump]').forEach(button=>button.onclick=()=>{const section=host.querySelector('#guide-'+button.dataset.guideJump);section.open=true;section.scrollIntoView({block:'start',behavior:'smooth'});section.querySelector('summary').focus({preventScroll:true});});
}
