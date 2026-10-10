// Game v1.34.0: event configuration and hand-in rules from revision 7374.
export const GONK_DROIDS=[
  {name:'GONK',rarity:0},{name:'EG-58',rarity:1},{name:'EGL',rarity:2},
  {name:'KT',rarity:2},{name:'MPH',rarity:2},{name:'JO9-4MN',rarity:3},
  {name:'PLNK',rarity:3},{name:'ECG',rarity:4}
];
export const GONK_QUALITIES=['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR','KYBER'];
export const GONK_REWARDS=[
  {points:200,reward:'WG-22 unlock'}, {points:275,reward:'20 Treats'},
  {points:400,reward:'1 Crafting Boost Token'}, {points:475,reward:'20 Treats'},
  {points:600,reward:'1 Crafting Boost Token'}, {points:675,reward:'20 Treats'}
];
export function gonkHandInPoints(name,variant='DEFAULT',pass=false){
  const d=GONK_DROIDS.find(d=>d.name===name),quality=GONK_QUALITIES.indexOf(variant.startsWith('KYBER_')?'KYBER':variant);
  return d&&quality>=0?(1+d.rarity+quality)*(pass?2:1):0;
}
export function gonkArmyPanel(){return `<section class="event-panel gonk-army-panel">
  <div class="gonk-army-heading"><img src="assets/events/gonk-o-ween/T_Events_Banner_Iconic_Gonk.png" alt="Gonk Army event artwork"><div><p class="eyebrow">Iconic Gonk weekend · v1.34.0</p><h2>Build the Gonk Army</h2><p>10 October, 20:00 UTC – 11 October, 20:00 UTC (21:00 BST). Event availability follows the in-game schedule.</p><p>Turn in Gonk droids to unlock <a href="#/droid/wg-22">WG-22</a>, an Iconic Battle droid with <strong>2× Flawless Chance as a companion</strong>.</p></div></div>
  <h3>Where do the new droids come from?</h3><p><strong>Sandcrawler blueprints:</strong> EG-58, EGL, KT, MPH, JO9-4MN, PLNK and ECG join the normal conveyor pool after the reveal at 20:00 UTC on 10 October. They are not fusion-exclusive. All except ECG are also eligible for Astromech blueprint finds. WG-22 is earned from this event; it does not spawn on the conveyor.</p>
  <div class="gonk-roster">${GONK_DROIDS.filter(d=>d.name!=='GONK').map(d=>`<a href="#/droid/${d.name.toLowerCase()}"><img src="assets/droids/gonk-army/${d.name}.png" alt="" loading="lazy"><strong>${d.name}</strong></a>`).join('')}</div>
  <h3>Hand-ins and personal points</h3><p>Hand in GONK or any of the seven new regular droids. Higher rarity and quality give more points: <strong>1 + rarity tier + quality tier</strong>. Common and Default start at zero. Activated Kyber colours give the same points as dormant Kyber. Hand-ins consume the droid; locked droids cannot be handed in.</p>
  <div class="gonk-calculator"><label>Droid<select class="form-control" data-gonk-droid>${GONK_DROIDS.map(d=>`<option>${d.name}</option>`).join('')}</select></label><label>Quality<select class="form-control" data-gonk-quality>${GONK_QUALITIES.map(q=>`<option>${q}</option>`).join('')}</select></label><label><input type="checkbox" data-gonk-pass> I have the WG-22 Event Pass</label><output data-gonk-points aria-live="polite"></output></div>
  <h3>Reward track</h3><div class="gonk-rewards"><table><thead><tr><th>Stage points</th><th>Total points</th><th>Reward</th></tr></thead><tbody>${GONK_REWARDS.map((r,i)=>`<tr><td>${r.points-(GONK_REWARDS[i-1]?.points||0)}</td><td>${r.points}</td><td>${r.reward}</td></tr>`).join('')}</tbody></table></div><p>After claiming all six rewards, each additional <strong>60 points earns 3 Nova Crystals</strong>. Points are spent on each stage; the total column shows the full journey from zero.</p>
  <h3>Event Pass · 300 V-Bucks</h3><p>The optional WG-22 pass doubles personal hand-in points and raises the event's Credits, Pickaxe and Crafting Speed boosts from <strong>2× to 2.5×</strong>. It applies to this WG-22 event and its reruns. It does not double reward quantities or add an exclusive reward track.</p>
  <h3>Shared Sandcrawler boost</h3><p>The shared Gonk Army target is <strong>30 droids</strong>. Reaching it activates a <strong>60-second Sandcrawler variant boost</strong>. Each donated droid counts once toward this shared target, regardless of its rarity, quality or pass bonus.</p>
  <p class="event-help">This calculator does not remove Base droids, spend points or claim in-game rewards.</p>
</section>`;}
export function wireGonkArmyPanel(host){
  const panel=host.querySelector('.gonk-army-panel');if(!panel)return;
  const calculate=()=>{panel.querySelector('[data-gonk-points]').textContent=`${gonkHandInPoints(panel.querySelector('[data-gonk-droid]').value,panel.querySelector('[data-gonk-quality]').value,panel.querySelector('[data-gonk-pass]').checked)} personal points per droid · 1 shared hand-in`;};
  panel.querySelectorAll('select,input').forEach(input=>input.addEventListener('change',calculate));calculate();
}
