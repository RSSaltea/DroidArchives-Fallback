// Announcement previews are separate from the playable catalogue. Unknown
// values must never become zero-income droids in Base or Optimise.
const qualities=['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR','KYBER','KYBER_GREEN','KYBER_BLUE','KYBER_PURPLE'];
export const COMING_SOON_DROIDS=['WG-22','KT','MPH','JO9-4MN','ECG','EG-58','EGL','PLNK'].map(name=>({
  name,comingSoon:true,type:'WORKER',rarity:name==='WG-22'?'ICONIC':null,
  variants:name==='WG-22'?['DEFAULT']:[...qualities],
  perk:name==='WG-22'?'2× Flawless Chance (Companion)':null
}));
export const isComingSoonDroid=name=>COMING_SOON_DROIDS.some(d=>d.name===name);

export function comingSoonCard(d,variantText,variant='DEFAULT'){
  return `<a class="droid-card coming-soon-droid" href="#/droid/${d.name.toLowerCase()}" data-coming-soon="${d.name}"><div class="droid-image"><span class="upcoming-portrait">Portrait coming soon</span></div><div class="card-body"><span class="badge">Coming soon</span><h3>${d.name}</h3><div class="card-meta"><span>${d.rarity||'Rarity coming soon'}</span><span>${variantText(variant)}</span></div></div></a>`;
}

export function comingSoonDetail(d,variant,variantText){
  const pending='<span class="upcoming-value">Coming soon</span>';
  return `<div class="breadcrumbs"><a href="#/">Homepage</a> / <a href="#/droids">Droids</a> / ${d.name}</div><div class="article-grid coming-soon-detail"><article><p class="eyebrow">Coming soon</p><h1>${d.name}</h1><p class="lead">This droid is coming soon. Base and collection tracking will unlock once its details are available.</p><div class="variant-tabs" aria-label="Droid variants">${d.variants.map(v=>`<button type="button" data-upcoming-variant="${v}" class="${v===variant?'active':''}" aria-pressed="${v===variant}">${variantText(v)}</button>`).join('')}</div>${d.rarity==='ICONIC'?'<p>Iconic droid · Default variant only.</p>':'<p>Kyber colours are activated forms of Kyber, not separate upgrade tiers.</p>'}<h2>Statistics</h2><div class="upcoming-stats-wrap"><table><thead><tr><th>Variant</th><th>Craft time</th><th>Blueprint cost</th><th>Credits / second</th><th>Credits / hour</th></tr></thead><tbody><tr><td>${variantText(variant)}</td>${Array.from({length:4},()=>`<td>${pending}</td>`).join('')}</tr></tbody></table></div><h2>Details</h2><p>Upgrade costs, activation costs and Rebirth uses: ${pending}.</p><div class="detail-actions"><button class="btn" disabled>Add to Base</button><button class="btn secondary" disabled>Add blueprint</button><button class="btn secondary" disabled>Add to Droidex</button></div></article><aside class="infobox"><div class="info-title">${d.name}</div><div class="info-image"><span class="upcoming-portrait">Portrait coming soon</span></div><div class="info-rows"><div class="info-row"><b>Status</b><span>Coming soon</span></div><div class="info-row"><b>Variant</b><span>${variantText(variant)}</span></div><div class="info-row"><b>Rarity</b><span>${d.rarity||'Coming soon'}</span></div><div class="info-row"><b>Type</b><span>Worker</span></div><div class="info-row"><b>Companion perk</b><span>${d.perk||'Coming soon'}</span></div><div class="info-row"><b>Portrait</b>${pending}</div></div></aside></div>`;
}
