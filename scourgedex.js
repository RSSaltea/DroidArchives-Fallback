import { animateVeins } from './scourge-effects.js?v=2026-11-02-vein-retract';
// Profile-owned progress. Collection in Droidex is separate from a consumed hand-in.
const integer=value=>Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,Math.floor(Number(value)||0)));
export function normaliseScourgedex(value){
  return {completed:integer(value?.completed),submitted:[...new Set((Array.isArray(value?.submitted)?value.submitted:[]).filter(x=>typeof x==='string'&&x.length<100))],handIns:integer(value?.handIns)};
}
export const scourgedexCatalogue=droids=>droids.filter(d=>d.rarity!=='ICONIC'&&d.variants?.SCOURGE);
export function recordScourgeSubmissions(value,units,catalogue){
  const next=normaliseScourgedex(value),eligible=new Set(catalogue.map(d=>d.name));
  next.submitted=next.submitted.filter(name=>eligible.has(name));
  for(const unit of units){
    if(unit.variant!=='SCOURGE'||!eligible.has(unit.name))continue;
    next.handIns++;
    if(!next.submitted.includes(unit.name))next.submitted.push(unit.name);
  }
  return {progress:next,completions:0};
}
export function completeScourgedex(value,catalogue){
  const next=normaliseScourgedex(value),names=new Set(next.submitted);
  if(!catalogue.length||!catalogue.every(d=>names.has(d.name)))return null;
  return {...next,completed:next.completed+1,submitted:[]};
}
export function scourgeSubmissionCandidates({initial,projected,atGoal,protectedKeys=new Set(),isBuilding=()=>false}){
  const key=u=>`${u.source}:${u.unit}`,destinations=new Map((projected.placed||[]).map(u=>[key(u),u]));
  const earning=u=>['WORKER','ASTROMECH','BATTLE','UPGRADE_CHIP'].includes(u?.station)||u?.station?.startsWith('PROTOCOL_');
  return (initial.placed||[]).filter(u=>u.variant==='SCOURGE'&&!isBuilding(u)&&
    (atGoal||!u.lockedSlot&&!protectedKeys.has(key(u))&&!earning(destinations.get(key(u)))&&destinations.get(key(u))?.station!=='COMPANION'));
}

// Keep the outgoing content visible while the live page underneath fades in.
function snapshotPage(host,layer){
  const bounds=host.getBoundingClientRect(),copy=host.cloneNode(true),style=getComputedStyle(host);
  for(const property of style)copy.style.setProperty(property,style.getPropertyValue(property));
  copy.removeAttribute('id');copy.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
  copy.inert=true;copy.setAttribute('aria-hidden','true');
  const originals=host.querySelectorAll('canvas');
  copy.querySelectorAll('canvas').forEach((canvas,index)=>{
    try{canvas.getContext('2d')?.drawImage(originals[index],0,0);}catch{}
  });
  Object.assign(copy.style,{position:'absolute',left:`${bounds.left}px`,top:`${bounds.top}px`,width:`${bounds.width}px`,height:`${bounds.height}px`,margin:'0',boxSizing:'border-box'});
  const snapshot=document.createElement('div');snapshot.className='scourge-page-snapshot';snapshot.append(copy);layer.prepend(snapshot);
  return snapshot;
}
let activeWipe=null;
export async function scourgeWipe(change,origin=null){
  activeWipe?.dispose();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){change();return;}
  const initialHash=location.hash,layer=document.createElement('div');layer.className='scourge-wipe';layer.setAttribute('aria-hidden','true');
  const canvas=document.createElement('canvas');canvas.className='scourge-screen-veins';layer.append(canvas);
  document.body.append(layer);activeWipe=layer;
  const stop=animateVeins(canvas),animations=[];
  layer.dispose=()=>{stop();animations.forEach(animation=>animation.cancel());layer.remove();if(activeWipe===layer)activeWipe=null;};
  try{
    await new Promise(resolve=>setTimeout(resolve,1050));
    if(activeWipe!==layer||location.hash!==initialHash)return;
    const host=document.querySelector('#app'),snapshot=host?snapshotPage(host,layer):null;
    // Both animations share a clock; the tendrils continue growing above them.
    const timing={duration:1900,easing:'ease-in-out'};
    if(snapshot)animations.push(snapshot.animate([{opacity:1},{opacity:0}],{...timing,fill:'forwards'}));
    if(host)animations.push(host.animate([{opacity:0},{opacity:1}],timing));
    change();
    await new Promise(resolve=>setTimeout(resolve,600));
    if(activeWipe!==layer)return;
    layer.classList.add('retracting');await stop.retract();
  }
  finally{layer.dispose();}
}
export function scourgedexPage({host,droids,getProgress,setProgress,picture,escape,readOnly=false}){
  const catalogue=scourgedexCatalogue(droids);let search='',filter='all';
  const render=()=>{
    const progress=normaliseScourgedex(getProgress()),done=new Set(progress.submitted),count=catalogue.filter(d=>done.has(d.name)).length;
    host.innerHTML=`<section class="scourgedex-page"><header class="scourgedex-hero"><p class="eyebrow">The collection begins again</p><h1><img src="assets/scourgedex/logo.png" alt="Scourgedex"></h1><img class="scourgedex-eyes" src="assets/scourgedex/eyes.png" alt=""><p>Feed the Hive. Grow its power.</p></header><div class="scourgedex-content"><div class="scourgedex-overview"><div><strong class="scourgedex-count">${count} <small>/ ${catalogue.length}</small></strong><p>Unique droids submitted this collection</p><progress max="${catalogue.length||1}" value="${count}" aria-label="Scourgedex progress"></progress></div><label>Completed collections<input id="scourgedexCompleted" type="number" min="0" step="1" value="${progress.completed}" ${readOnly?'disabled':''}><small>+${progress.completed} permanent Hive Mind member${progress.completed===1?'':'s'}. Kept through Super Rebirth.</small></label></div><div class="scourgedex-rewards">${[[25,'200 Nova Crystals'],[45,'Scourge Paint'],[70,'500 Nova Crystals'],[90,'Scourge Prime Paint']].map(([n,label])=>`<div class="${count>=n?'earned':''}"><strong>${n}</strong><span>${label}</span></div>`).join('')}</div><p class="scourgedex-help">Mark droids after submitting them in-game. Only Lounge droids can be submitted. Applying an Optimise plan records its hand-ins here automatically. Once all entries are submitted, complete and reset in-game, then record that reset here for +1 permanent Hive Mind member.</p><div class="scourgedex-reset"><button type="button" class="btn" id="scourgedexReset" ${readOnly||count<catalogue.length?'disabled':''}>Record completion &amp; reset</button><small>${count===catalogue.length?'Collection complete. Reset in-game, then record it here.':'Submit every unique droid to unlock the collection reset.'}</small></div><div class="scourgedex-tools"><label class="sr-only" for="scourgedexSearch">Search Scourgedex</label><input id="scourgedexSearch" type="search" placeholder="Find a droid…" value="${escape(search)}"><label class="sr-only" for="scourgedexFilter">Show droids</label><select id="scourgedexFilter"><option value="all">All droids</option><option value="missing">Still needed</option><option value="submitted">Submitted</option></select><span id="scourgedexResults" aria-live="polite"></span></div><div class="scourgedex-grid">${catalogue.map(d=>`<button type="button" class="scourgedex-card ${done.has(d.name)?'submitted':''}" data-scourgedex-name="${escape(d.name)}" aria-pressed="${done.has(d.name)}" ${readOnly?'disabled':''}>${picture(d,'SCOURGE')}<strong>${escape(d.name)}</strong><span>${done.has(d.name)?'Submitted':'Not submitted'}</span></button>`).join('')}</div><p class="scourgedex-footnote">Tracking only: marking a card here does not remove a droid from your recorded Base. Repeated hand-ins can give rewards without adding another unique entry.</p></div></section>`;
    const applyFilter=()=>{let visible=0;host.querySelectorAll('[data-scourgedex-name]').forEach(card=>{const submitted=done.has(card.dataset.scourgedexName);card.hidden=!card.dataset.scourgedexName.toLowerCase().includes(search.toLowerCase())||(filter==='missing'&&submitted)||(filter==='submitted'&&!submitted);if(!card.hidden)visible++;});host.querySelector('#scourgedexResults').textContent=`${visible} droids`;};
    const searchBox=host.querySelector('#scourgedexSearch');searchBox.oninput=()=>{search=searchBox.value;applyFilter();};
    const select=host.querySelector('#scourgedexFilter');select.value=filter;select.onchange=()=>{filter=select.value;applyFilter();};applyFilter();
    host.querySelector('#scourgedexCompleted').onchange=event=>{if(readOnly)return;setProgress({...normaliseScourgedex(getProgress()),completed:integer(event.target.value)});render();};
    host.querySelector('#scourgedexReset').onclick=()=>{
      if(readOnly)return;const next=completeScourgedex(getProgress(),catalogue);
      if(!next||!confirm('Have you completed and reset Scourgedex in-game? Record +1 permanent Hive Mind member and clear this collection?'))return;
      setProgress(next);scourgeWipe(()=>{if(location.hash.split('?')[0]==='#/scourgedex')render();});
    };
    host.querySelectorAll('[data-scourgedex-name]').forEach(card=>card.onclick=()=>{
      if(readOnly)return;const name=card.dataset.scourgedexName,current=normaliseScourgedex(getProgress());
      if(current.submitted.includes(name)){setProgress({...current,submitted:current.submitted.filter(x=>x!==name)});render();return;}
      const result=recordScourgeSubmissions(current,[{name,variant:'SCOURGE'}],catalogue);
      setProgress(result.progress);
      render();
    });
  };render();
}
