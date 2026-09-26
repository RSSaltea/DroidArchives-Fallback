const rarities=['Common','Rare','Epic','Legendary','Mythic'];
const activation=[[1,200,50],[2,400,100],[4,600,150],[7,800,200],[10,1000,250]];
const table=(head,rows)=>`<div class="kyber-table"><table><thead><tr>${head.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

export function kyberDroidDetails(d,fmt){
  if(!d.variants.KYBER)return '';
  const costs=activation[rarities.indexOf(d.rarity[0]+d.rarity.slice(1).toLowerCase())];
  return `<section class="kyber-detail"><h2>Kyber activation</h2><p>Kyber starts dormant. Activating it gives this same droid a Green, Blue or Purple colour and an income bonus. These are three possible activation results.</p><p>Build the Kyber blueprint first, then equip the dormant droid as a companion and take it to Huyang after your first Rebirth. Activation costs <strong>${costs[0]} Kyber Crystals</strong>, or ${costs[1]} Nova Crystals, or ${costs[2]} V-Bucks. These are alternative payments, separate from the blueprint cost.</p>${table(['Form','Credits / second','Credits / hour'],[['Dormant','KYBER'],['Green · 50%','KYBER_GREEN'],['Blue · 30%','KYBER_BLUE'],['Purple · 20%','KYBER_PURPLE']].map(([label,v])=>[label,fmt(d.variants[v].income),fmt(d.variants[v].income*3600)]))}<p>Income is before your player multiplier and room bonuses. Select the colour you own when adding or changing a Base droid; Optimise includes its income. Crafting costs and times refer to the dormant blueprint. Colours are activation results, not extra upgrade tiers.</p><a href="#/todo">Read the update in Patch Notes →</a></section>`;
}

export function kyberGuide({privateSections=false}={}){return `<div class="breadcrumbs"><a href="#/">Homepage</a> / Kyber update</div><article class="kyber-guide">
<p class="eyebrow">September 26 · Game v1.32.0</p><h1>How Kyber works</h1><p class="lead">Kyber is the new droid quality after Stellar. Once you have a Kyber droid, Huyang can activate it and give it a colour that increases its income.</p>
<p>The Kyber update is scheduled for September 26 at <strong>20:00 UTC / 21:00 BST</strong>. Check the in-game event screen for availability and timings.</p>
<nav class="kyber-links"><a class="btn" href="#/droids">Droid costs &amp; income</a><a class="btn secondary" href="#/rebirth">Rebirth requirements</a><a class="btn secondary" href="#/nova-shop">Nova Shop</a></nav>
<section class="kyber-intro"><h2>One Kyber quality. Three activation colours.</h2>
<p>Green, Blue and Purple describe the result of <strong>activating a Kyber droid</strong>. Your droid keeps its name and rarity: a Kyber Mouse is still Mouse after activation.</p>
<ol class="kyber-steps"><li><strong>1. Get a Kyber droid</strong><span>Obtain a Kyber blueprint from the conveyor and build it, or upgrade a Stellar droid with chips. It starts dormant: not yet activated.</span></li><li><strong>2. Visit Huyang</strong><span>Build the blueprint first. After your first Rebirth, equip the dormant Kyber droid as a companion, then take it to Huyang and pay an activation fee.</span></li><li><strong>3. Record its colour</strong><span>Activation rolls Green, Blue or Purple. Choose the result in Base so your income and Optimise calculations match your droid.</span></li></ol>
<h2>What does the colour change?</h2><p>Activating your droid changes its colour and boosts its income compared with dormant Kyber:</p>
${table(['Activation result','Roll chance','Income multiplier'],[['<span class="kyber-swatch green"></span>Green','50%','3&times;'],['<span class="kyber-swatch blue"></span>Blue','30%','3.25&times;'],['<span class="kyber-swatch purple"></span>Purple','20%','3.6&times;']])}
<p class="kyber-example"><strong>Example:</strong> if a dormant Kyber droid earns 100 credits/s, the same droid earns 300/s when Green, 325/s when Blue or 360/s when Purple, before your player and room bonuses.</p>
<p><strong>For Rebirth tracking, use the single Kyber button.</strong> The requirement tables specify Kyber without a particular colour. In Base, choose the actual activation colour because it affects earnings.</p>
<p class="kyber-evidence">Activation details still need confirmation in game. We also haven?t confirmed whether a dormant Kyber droid can meet a Rebirth requirement.</p></section>
<h2>Activation prices</h2><p>Choose one payment method. These costs are separate from crafting or upgrading the droid.</p>
${table(['Rarity','Kyber Crystals','Nova Crystals','V-Bucks'],rarities.map((r,i)=>[r,...activation[i].map(n=>n.toLocaleString('en-GB'))]))}
<p>Iconic Kyber droids are not yet confirmed, so they are not available in the planners.</p>
<h2>Blueprint costs, income and upgrade chips</h2>
${table(['Rarity','Blueprint cost vs Default','Dormant income vs Default','Stellar → Kyber chips'],rarities.map((r,i)=>[r,[36,36,4500,87000,168000][i].toLocaleString('en-GB')+'×',[35.2,35.2,88,165,137.5][i]+'×',[240,1000,12000,30000,110000][i].toLocaleString('en-GB')]))}
<p>Kyber uses a 36× crafting-time multiplier. Each droid page lists its blueprint cost, income and base crafting time. Your crafting bonuses change the time in your Base. Activated colours have the same underlying blueprint cost; Huyang's activation fee is additional.</p>
<h2>Rebirths 36–40</h2><p>All five existing paths now reach Rebirth 40. Each new level requires three Kyber droids. The first 35 requirements on every path are unchanged.</p>
${table(['Rebirth','Credits'],[[36,'1.2 quadrillion'],[37,'2.5 quadrillion'],[38,'4.5 quadrillion'],[39,'8 quadrillion'],[40,'15 quadrillion']])}
<p><a href="#/rebirth">Open the Rebirth planner</a> for the exact droids on your path. The listed requirements do not specify an activation colour. Dormant Kyber eligibility is still unconfirmed. Each new rank grants 300 regular Nova Crystals.</p>
<h2>Kyber event rewards</h2><p>Craft Kyber droids to advance. Claim each stage before progressing through the next requirement.</p>
${table(['Stage','Additional crafts','Total crafts','Reward'],[[1,1,1,'10 Kyber Crystals'],[2,5,6,'50 Nova Crystals'],[3,15,21,'50 Kyber Crystals'],[4,30,51,'250 Nova Crystals']])}
<p>After the stages, every five additional crafts earn <strong>3 Kyber Crystals</strong>, up to 50 claims. Claiming every stage and repeat reward gives <strong>210 Kyber Crystals and 300 Nova Crystals</strong>. The 50 Nova reward is a payout, not a purchase price.</p>
<p>Event blueprint drops are expected to begin 20 seconds after the event starts, then repeat every five minutes. Follow the in-game event timer; the end time has not yet been confirmed.</p>
<h2>World Missions and crystal sources</h2><p>Huyang identifies World Missions and Cantina quests as Kyber Crystal sources. World Mission rewards are listed as 5 / 10 / 15 / 20 crystals for 1 / 2 / 3 / 4 stars. Check the mission reward screen before starting; Cantina quest amounts are still unconfirmed.</p><p>World Missions are expected to run for five minutes, with a 30-minute gap between them. Use the in-game countdown for the next mission.</p>
<h2>Shop and balance changes</h2>
${table(['Surge','Nova Crystals','V-Bucks'],[['Beskar',100,200],['Galactic',150,300],['Stellar',300,400],['Kyber',450,500]])}
<p>Surges last about five minutes. Rainbow Surge is no longer available in the Nova Shop. Blueprint Scrap gains a fifth level costing 400 Nova Crystals, adding Beskar blueprints to its pool.</p><p><strong>LOW-MO</strong> now starts at <strong>11,700 credits/s</strong>, down from 12,600/s. Its variant incomes have been updated throughout the site.</p>
${privateSections?`<h2>Collection, cosmetics and lightsabers</h2><p>The in-game Droidex gains Kyber colour tracking. Kyber colours are also linked to collection and lightsaber unlocks. The exact rewards and collection requirements still need confirmation; do not assume that collecting 20 duplicates unlocks every lightsaber.</p>
<h2>More to look out for</h2><p>Gonk-O-Ween has been teased, but its date and any additional obtainable droids are not yet confirmed.</p>
`:''}
<p class="notice">Still being checked: whether activation survives resets, how rerolls work, whether fusion keeps an activated colour, and whether dormant Kyber counts for Rebirth. Until confirmed, the planner does not carry activation colours through fusion.</p>
</article>`;}
