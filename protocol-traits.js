import {scrapRewards} from './economy.js?v=2026-10-18-mission-tools';

// The entered total already includes equipped Protocols. Remove only the
// companions being changed, before adding the candidate's hypothetical perk.
// CreditMulti applies (base + additive bonuses) * shared multiplicative boosts.
export function compareProtocolTraits({multiplier,creditBoost=1,removedCreditBonus=0,protocolPercent,
  otherScrapBonus=0,incomePerMultiplier=0,fixedIncome=0,seconds=0,stationLevel=null,
  quality='default',partyMultiplier=1}={}){
  if(!Number.isFinite(multiplier)||multiplier<=1)return {pending:'Record your current in-game credit multiplier in Base settings first.'};
  if(!Number.isFinite(creditBoost)||creditBoost<1)return {pending:'Enter a credit boost of at least 1×.'};
  const base=multiplier/creditBoost-removedCreditBonus,perk=protocolPercent/100;
  if(!Number.isFinite(perk)||perk<=0)return {pending:'No standard Protocol companion bonus is available for this droid.'};
  if(base<1-1e-6)return {pending:'Your recorded multiplier is lower than these companion bonuses allow. Update Base settings or the active credit boost.'};
  if(seconds<=0&&stationLevel===null)return {pending:'Record your Scrap Value level in Nova Shop, or enter a scrap station level in Base, to compare payouts.'};
  const row=(id,factor,scrapBonus)=>{
    const projectedMultiplier=(base+perk*factor)*creditBoost;
    const income=incomePerMultiplier*projectedMultiplier+fixedIncome;
    return {id,multiplier:projectedMultiplier,income,...scrapRewards({income,seconds,stationLevel,quality,
      partyMultiplier:partyMultiplier*(1+otherScrapBonus+scrapBonus)})};
  };
  const overclocked=row('overclocked',2,0),specialist=row('specialist',1,.5);
  if(Math.max(overclocked.break,specialist.break)<=0)return {pending:'Add working droids to your Base, or enter a scrap station level, to compare payouts.'};
  const difference=(a,b)=>Math.abs(a-b)<=Math.max(a,b)*1e-9?'tie':a>b?'overclocked':'specialist';
  const hitWinner=difference(overclocked.hit,specialist.hit),breakWinner=difference(overclocked.break,specialist.break);
  const winner=hitWinner==='tie'?breakWinner:breakWinner==='tie'?hitWinner:hitWinner===breakWinner?hitWinner:'mixed';
  const gain=winner==='mixed'?null:Math.min(...['hit','break'].filter(k=>Math.min(overclocked[k],specialist[k])>0)
    .map(k=>Math.max(overclocked[k],specialist[k])/Math.min(overclocked[k],specialist[k])-1));
  return {overclocked,specialist,winner,gain:Number.isFinite(gain)?gain:0};
}

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={overclocked:'Overclocked',specialist:'Rainbow Scrap Specialist'};
export function mountProtocolTraits(host,{droid,variantLabel,copies,slots,locationLabel,scenario,fmt,creditBoost=1,onBoostChange=()=>{}}){
  if(droid.type!=='PROTOCOL')return;
  host.classList.add('protocol-trait-comparison');
  if(droid.rarity==='ICONIC'){
    host.innerHTML='<h3>Companion trait comparison</h3><p>Overclocked cannot roll on Iconic droids. Rainbow Scrap Specialist is available for scrap farming while equipped.</p>';return;
  }
  let copyIndex=0,slot=copies[0]?.station==='COMPANION'?copies[0].slot:(slots.find(s=>!s.unit)||slots[0])?.slot;
  const draw=()=>{
    const unit=copies[copyIndex],data=scenario(unit,slot,creditBoost),result=data.result;
    const recommendation=result.pending?result.pending:result.winner==='tie'?'Equal scrap payouts':result.winner==='mixed'?'Depends on hits versus breaking rewards':`${names[result.winner]} is better for scrap${result.gain>0?` by ${Number((result.gain*100).toFixed(2))}%`:''}`;
    host.innerHTML=`<h3>Best companion trait for scrap</h3><p class="protocol-trait-context">${escape(droid.name)} · ${escape(variantLabel)}</p>
      ${copies.length>1?`<label>Your copy<select data-protocol-copy>${copies.map((u,i)=>`<option value="${i}" ${i===copyIndex?'selected':''}>${escape(locationLabel(u))}</option>`).join('')}</select></label>`:''}
      ${slots.length?`<label>Compare in Companion slot<select data-protocol-seat>${slots.map(s=>`<option value="${s.slot}" ${s.slot===slot?'selected':''}>${s.slot+1} · ${escape(s.unit?.name||'Empty')}</option>`).join('')}</select></label>`:''}
      <p class="protocol-trait-verdict" role="status">${escape(recommendation)}</p>
      ${result.pending?'':`<div class="protocol-trait-options">${['overclocked','specialist'].map(id=>{const row=result[id];return `<div class="protocol-trait-option ${result.winner===id?'is-best':''}"><img src="assets/traits/${id==='overclocked'?12:7}.png" alt=""><strong>${names[id]}</strong><dl><dt>Scrap / hit</dt><dd>${fmt(row.hit)}</dd><dt>Scrap / break</dt><dd>${fmt(row.break)}</dd><dt>Passive / sec</dt><dd>${fmt(row.income)}</dd></dl></div>`;}).join('')}</div>`}
      <p class="protocol-trait-context">${escape(data.note)}</p>
      <details class="protocol-trait-assumptions"><summary>Calculation settings</summary><label>Active credit boost ×<input data-protocol-boost type="number" min="1" max="100" step="any" value="${creditBoost}"></label><small>1 = no multiplicative credit boost; use 2 for a 2× credit event. Your Base multiplier must already include this boost and your current companions. Regional Protocol bonuses stay separate.</small><p>Uses your recorded Base, Scrap Value, other equipped Scrap Specialist traits and party scrap bonus. ${escape(data.rewardNote||'')} This compares traits with this droid equipped, not whether moving it out of work is worthwhile. No droids or traits are changed.</p></details>`;
    host.querySelector('[data-protocol-copy]')?.addEventListener('change',e=>{copyIndex=Number(e.target.value);if(copies[copyIndex].station==='COMPANION')slot=copies[copyIndex].slot;draw();});
    host.querySelector('[data-protocol-seat]')?.addEventListener('change',e=>{slot=Number(e.target.value);draw();});
    host.querySelector('[data-protocol-boost]')?.addEventListener('change',e=>{const n=Number(e.target.value);creditBoost=Number.isFinite(n)?Math.max(1,Math.min(100,n)):1;onBoostChange(creditBoost);draw();});
  };
  draw();
}
