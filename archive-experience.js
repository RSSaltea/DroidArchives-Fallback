import { renderProgressCard } from './progress-card.js?v=2026-09-16-card-redesign';
// Profile tools share the existing planner's calculations and save path.
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = value => JSON.parse(JSON.stringify(value));
const count = rows => (rows || []).reduce((n, row) => n + (Number(row.qty) || 1), 0);
const integer = (value, max = 100000) => Number.isInteger(value) && value >= 0 && value <= max;

export function validateSharedSnapshot(value) {
  if (!value || value.version !== 1 || typeof value.title !== 'string' || value.title.length > 80 || !Number.isFinite(Date.parse(value.createdAt))) throw Error('This snapshot link is invalid.');
  const result = {version:1, title:value.title, createdAt:new Date(value.createdAt).toISOString()};
  if (value.progress) {
    const p = value.progress;
    if (!integer(p.cycle, 100) || !integer(p.rebirth, 1000) || !integer(p.goal, 1000)) throw Error('Invalid progress in snapshot.');
    result.progress = {cycle:p.cycle, rebirth:p.rebirth, goal:p.goal};
  }
  if (value.income !== undefined) {
    if (typeof value.income !== 'number' || !Number.isFinite(value.income) || value.income < 0 || value.income > 1e100) throw Error('Invalid income in snapshot.');
    result.income = value.income;
  }
  if (value.collection) {
    if (!integer(value.collection.owned) || !integer(value.collection.total) || value.collection.owned > value.collection.total) throw Error('Invalid collection in snapshot.');
    result.collection = {owned:value.collection.owned, total:value.collection.total};
  }
  for (const key of ['missing','layout']) if (value[key] !== undefined) {
    if (!Array.isArray(value[key]) || value[key].length > 200) throw Error('This snapshot has too many droids.');
    result[key] = value[key].map(row => {
      if (!row || typeof row.name !== 'string' || row.name.length > 80 || typeof row.variant !== 'string' || !['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR'].includes(row.variant)) throw Error('Invalid droid in snapshot.');
      if (key === 'missing') return {name:row.name, variant:row.variant};
      if (typeof row.station !== 'string' || row.station.length > 50 || !integer(row.slot, 1000)) throw Error('Invalid layout in snapshot.');
      return {name:row.name, variant:row.variant, station:row.station, slot:row.slot};
    });
  }
  return result;
}

export function encodeSharedSnapshot(snapshot) {
  const bytes = new TextEncoder().encode(JSON.stringify(validateSharedSnapshot(snapshot)));
  if (bytes.length > 24000) throw Error('This layout is too large for a link. Turn off the layout option or share the image.');
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replaceAll('+','-').replaceAll('/','_').replace(/=+$/, '');
}
export function decodeSharedSnapshot(encoded) {
  if (!encoded || encoded.length > 32000 || !/^[\w-]+$/.test(encoded)) throw Error('This snapshot link is invalid or too large.');
  try {
    const bytes = Uint8Array.from(atob(encoded.replaceAll('-','+').replaceAll('_','/')), c => c.charCodeAt(0));
    return validateSharedSnapshot(JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)));
  } catch { throw Error('This snapshot link is invalid or incomplete.'); }
}

export function createArchiveExperience(api) {
  const root = () => document.querySelector('#modalRoot');
  const scope = () => api.userId() || 'local';
  const historyKey = () => `droid-archive-history-v1:${scope()}`;
  let historyNotice = '';
  const readHistory = () => { try { const rows=JSON.parse(localStorage.getItem(historyKey()) || '[]'); return Array.isArray(rows)?rows:[]; } catch { return []; } };
  function checkpoint(label = 'Saved profile') {
    if (!api.ready() || api.shared() || api.restoring()) return;
    const profile = api.profile();
    if (!profile) return;
    const data = clone(api.data()), rows = readHistory();
    const previous = rows.find(row => row.profileId === profile.id);
    if (previous && previous.name === profile.name && JSON.stringify(previous.data) === JSON.stringify(data)) return;
    rows.unshift({id:crypto.randomUUID(), profileId:profile.id, name:profile.name, at:new Date().toISOString(), label, data});
    // A bounded history must never prevent the primary profile from saving.
    let kept = rows.slice(0, 60);
    while (kept.length>1 && JSON.stringify(kept).length>500000) kept.pop();
    while (kept.length) {
      try { localStorage.setItem(historyKey(), JSON.stringify(kept)); historyNotice=''; return; }
      catch { kept = kept.slice(0, Math.floor(kept.length / 2)); }
    }
    historyNotice = 'Local history could not be saved because browser storage is full. Export your profile to keep a backup.';
  }
  function releaseHistory() {
    localStorage.removeItem(historyKey());
    historyNotice='Local history was cleared to make room for your current save. Download an export to keep a separate backup.';
  }
  function modal(title, body, footer = '') {
    const opener=document.activeElement;
    root().innerHTML = `<div class="modal-backdrop"><section class="modal archive-modal" role="dialog" aria-modal="true" aria-labelledby="archiveModalTitle"><header class="archive-modal-head"><h2 id="archiveModalTitle">${escape(title)}</h2><button class="btn ghost" data-archive-close aria-label="Close dialog">✕</button></header>${body}<p class="form-error" id="archiveError" role="alert"></p>${footer}</section></div>`;
    const close=()=>{root().innerHTML='';if(opener?.isConnected)opener.focus();};
    root().querySelector('[data-archive-close]').onclick = close;
    root().querySelector('[role="dialog"]').onkeydown=event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
      if(event.key!=='Tab')return;
      const controls=[...root().querySelectorAll('button,input,select,textarea,a[href]')].filter(el=>!el.disabled&&!el.hidden&&el.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    root().querySelector('input,select,button')?.focus();
  }
  const showError = error => { const el=root().querySelector('#archiveError'); if(el)el.textContent=error.message || String(error); };
  const date = value => new Date(value).toLocaleString();
  function summary(data) {
    return `Cycle ${(Number(data.cycle)||0)+1} · Rebirth ${Number(data.rebirth)||0} · ${count(data.owned)} droids · ${(data.droidex||[]).length} collected`;
  }
  async function showHistory() {
    if (api.shared()) return;
    checkpoint('Current profile');
    const owner=scope();
    modal('Save history', '<p>Preview an earlier save and recover it as a separate profile. Your current profile stays available.</p><p id="historyStatus" role="status">Loading history…</p><div id="historyList"></div>');
    const list=root().querySelector('#historyList'), status=root().querySelector('#historyStatus');
    let rows=readHistory().map(row=>({...row, source:'This browser'}));
    function render() {
      if (!list.isConnected || scope()!==owner) return;
      rows.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
      list.innerHTML=rows.length?rows.map((row,index)=>`<article class="archive-history-row"><div><strong>${escape(row.name)}</strong><small>${escape(date(row.at))} · ${escape(row.source)}</small><span>${escape(summary(row.data))}</span></div><button class="btn secondary" data-history-preview="${index}">Preview</button></article>`).join(''):'<p>No earlier saves yet. Local checkpoints will appear as you make changes.</p>';
      list.querySelectorAll('[data-history-preview]').forEach(button=>button.onclick=()=>previewHistory(rows[Number(button.dataset.historyPreview)],owner));
    }
    render();
    if (api.userId()) {
      try { rows=rows.concat(await api.cloudHistory()); status.textContent='Showing local checkpoints and the most recent cloud history.'; }
      catch(error) { status.textContent=`Local history is available. Cloud history could not load: ${error.message}`; }
    } else status.textContent='Local checkpoints are kept in this browser. Sign in to access your cloud history.';
    if(historyNotice)status.textContent+=' '+historyNotice;
    render();
  }
  function previewHistory(row, owner) {
    modal('Preview saved profile', `<h3>${escape(row.name)}</h3><p>${escape(date(row.at))} · ${escape(row.source)}</p><p>${escape(summary(row.data))}</p><p>This recovers the full saved profile, including its Base, Droidex, upgrades and planning settings.</p><div class="archive-scroll"><ul>${(row.data.owned||[]).map(d=>`<li>${escape(d.name)} · ${escape(d.variant)} × ${escape(d.qty)}</li>`).join('')||'<li>No owned droids</li>'}</ul></div>`, '<div class="modal-actions"><button class="btn" id="restoreHistory">Restore as new profile</button><button class="btn secondary" id="backHistory">Back to history</button></div>');
    root().querySelector('#backHistory').onclick=showHistory;
    root().querySelector('#restoreHistory').onclick=async event=>{
      const button=event.currentTarget; button.disabled=true;
      try {
        if (scope()!==owner || api.shared() || api.restoring()) throw Error('Your account changed. Open history again before restoring.');
        checkpoint('Before recovery');
        api.createProfile(`Recovered · ${row.name}`.slice(0,80), clone(row.data));
        root().innerHTML=''; api.go('/base'); api.toast('Recovered as a separate profile');
      } catch(error) { showError(error); button.disabled=false; }
    };
  }
  function showSetup(sample=false) {
    if(api.shared() || api.restoring())return;
    const owner=scope(), draft=api.blank(), maxRebirth=cycle=>Math.max(0,...api.cycles()[cycle].map(r=>r.to));
    draft.superRebirthGoal=maxRebirth(0);
    let name=sample?'Sample base':'My base', step=0;
    if(sample){draft.rebirth=3;draft.owned=api.sampleDroids();}
    const draw=()=>{
      const progress=`<p class="eyebrow">Step ${step+1} of 4 · ${['Your progress','Owned upgrades','Your droids','Review'][step]}</p>`;
      let body='';
      if(step===0)body=`<p>Create a separate profile${sample?' with a small sample collection':''}. You can change everything later.</p><label class="field">Profile name<input class="form-control" id="setupName" maxlength="80" value="${escape(name)}"></label><div class="archive-fields"><label class="field">Cycle<select class="form-control" id="setupCycle">${Object.keys(api.cycles()).map(c=>`<option value="${c}" ${draft.cycle===Number(c)?'selected':''}>Cycle ${Number(c)+1}</option>`).join('')}</select></label><label class="field">Current rebirth<input class="form-control" id="setupRebirth" type="number" min="0" max="${maxRebirth(draft.cycle)}" value="${draft.rebirth}"></label><label class="field">Base multiplier<input class="form-control" id="setupMultiplier" type="number" min="0" max="1000000" step="0.1" value="${draft.multiplier}"></label></div><p class="picker-hint">Use the base multiplier shown in-game, before your Flawless bonus.</p>`;
      if(step===1)body=`<p>Record levels you already own. Leave an upgrade at zero if you have not bought it. Iconic unlocks and Cantina purchases can be recorded in their shop pages afterwards.</p><div class="archive-upgrades">${api.upgrades().map(u=>`<label class="field">${escape(u.name)}<input class="form-control" data-setup-upgrade="${escape(u.id)}" type="number" min="0" max="${u.max}" step="1" value="${draft.novaUpgrades[u.id]||0}"></label>`).join('')}</div>`;
      if(step===2)body=`<p>Add a few owned droids to get started. The planner will place them in available slots; adjust their actual positions on Base afterwards.</p><div class="archive-fields"><label class="field">Droid<select class="form-control" id="setupDroid">${api.droids().map(d=>`<option>${escape(d.name)}</option>`).join('')}</select></label><label class="field">Quality<select class="form-control" id="setupVariant"></select></label><label class="field">Quantity<input class="form-control" id="setupQty" type="number" min="1" max="50" value="1"></label></div><button class="btn secondary" id="setupAdd">Add droid</button><ul class="archive-setup-roster">${draft.owned.map((d,i)=>`<li><span>${escape(d.name)} · ${escape(d.variant)} × ${d.qty}</span><button class="btn ghost" data-setup-remove="${i}" aria-label="Remove ${escape(d.name)}">Remove</button></li>`).join('')}</ul><label class="archive-check"><input id="setupCollect" type="checkbox" ${draft.droidex.length?'checked':''}> Also mark these qualities as collected in Droidex</label>`;
      if(step===3)body=`<h3>${escape(name)}</h3><p>${escape(summary(draft))}</p><p>${Object.values(draft.novaUpgrades).filter(v=>v>0).length} upgrades recorded · ${draft.multiplier}× base multiplier</p><p>Your new profile will save ${api.userId()?'locally and sync to your signed-in account':'in this browser'}. Open Base to check placements, then Optimise or Rebirth for your next steps.</p>`;
      modal(sample?'Explore a sample base':'Set up your base', progress+body, `<div class="modal-actions">${step?'<button class="btn secondary" id="setupBack">Back</button>':''}<button class="btn" id="setupNext">${step===3?'Create profile':'Continue'}</button></div>`);
      if(step===0)root().querySelector('#setupCycle').onchange=e=>{draft.cycle=Number(e.target.value);draft.rebirth=Math.min(draft.rebirth,maxRebirth(draft.cycle));draft.superRebirthGoal=maxRebirth(draft.cycle);root().querySelector('#setupRebirth').max=maxRebirth(draft.cycle);root().querySelector('#setupRebirth').value=draft.rebirth;};
      const read=()=>{
        for(const input of root().querySelectorAll('input[type="number"]'))if(!input.reportValidity())return false;
        if(step===0){name=root().querySelector('#setupName').value.trim();if(!name)throw Error('Give your profile a name.');draft.cycle=Number(root().querySelector('#setupCycle').value);draft.rebirth=Number(root().querySelector('#setupRebirth').value);draft.multiplier=Number(root().querySelector('#setupMultiplier').value);}
        if(step===1)root().querySelectorAll('[data-setup-upgrade]').forEach(input=>draft.novaUpgrades[input.dataset.setupUpgrade]=Number(input.value));
        if(step===2)draft.droidex=root().querySelector('#setupCollect').checked?[...new Map(draft.owned.map(d=>[d.name+':'+d.variant,{name:d.name,variant:d.variant,flawless:false}])).values()]:[];
        return true;
      };
      if(step===2){
        const select=root().querySelector('#setupDroid'),variants=root().querySelector('#setupVariant');
        const sync=()=>variants.innerHTML=api.variants(select.value).map(v=>`<option>${v}</option>`).join(''); select.onchange=sync;sync();
        root().querySelector('#setupAdd').onclick=()=>{try{if(!read())return;const qty=Number(root().querySelector('#setupQty').value);if(count(draft.owned)+qty>200)throw Error('Start with up to 200 droids. You can add more from Base.');draft.owned.push({name:select.value,variant:variants.value,qty,built:true});if(root().querySelector('#setupCollect').checked)draft.droidex.push({name:select.value,variant:variants.value,flawless:false});draw();}catch(error){showError(error)}};
        root().querySelectorAll('[data-setup-remove]').forEach(button=>button.onclick=()=>{read();draft.owned.splice(Number(button.dataset.setupRemove),1);draw()});
      }
      root().querySelector('#setupBack')?.addEventListener('click',()=>{try{if(read()){step--;draw()}}catch(error){showError(error)}});
      root().querySelector('#setupNext').onclick=()=>{try{
        if(!read())return;
        if(step<3){step++;draw();return;}
        if(scope()!==owner||api.shared()||api.restoring())throw Error('Your account changed. Restart setup before creating this profile.');
        checkpoint('Before setup');api.createProfile(name,draft);root().innerHTML='';api.go('/base');api.toast('Profile created. Check your placements on Base.');
      }catch(error){showError(error)}};
    };draw();
  }
  function home() {
    checkpoint('Profile opened');
    const model=api.overview(), editable=!api.shared()&&!api.restoring();
    api.app().innerHTML=`<section class="archive-dashboard"><header class="archive-dashboard-head"><div><p class="eyebrow">Your next steps</p><h1>${escape(model.name)}</h1><p>Make the most of your next Droid Tycoon session.</p></div><div class="archive-actions">${editable?'<button class="btn secondary" data-archive-action="setup">Guided setup</button><button class="btn secondary" data-archive-action="history">Save history</button><button class="btn" data-archive-action="share">Share progress</button>':''}</div></header><div class="archive-stats"><article><small>Current progress</small><strong>Cycle ${model.cycle+1} · RB ${model.rebirth}</strong></article><article><small>Base income</small><strong>${escape(api.fmt(model.income))}/sec</strong></article><article><small>Droidex</small><strong>${model.collected} / ${model.total}</strong></article></div>${!model.owned?`<section class="archive-welcome"><h2>Start with your base</h2><p>A few droids and your current rebirth are enough to start getting useful recommendations. Your profiles save locally, with account sync when signed in.</p><div class="archive-actions"><button class="btn" data-archive-action="setup" ${editable?'':'disabled'}>Set up my base</button><button class="btn secondary" data-archive-action="sample" ${editable?'':'disabled'}>Try a sample base</button><a class="btn ghost" href="#/droids">Browse the archive</a></div></section>`:''}<div class="archive-next-grid">${model.cards.map(card=>`<a class="archive-next-card" href="#${card.path}"><span class="eyebrow">${escape(card.label)}</span><h2>${escape(card.title)}</h2><p>${escape(card.detail)}</p><span class="archive-card-link">${escape(card.action)} →</span></a>`).join('')}</div><div class="archive-dashboard-foot"><a href="#/droids">Explore all droids</a><a href="#/nova-shop">Nova Shop</a><a href="#/groups">Your groups</a><a href="https://discord.gg/droidarchives" target="_blank" rel="noopener noreferrer">Join our Discord</a></div><p class="picker-hint">Recommendations use this profile’s recorded Base and upgrades. Keep them up to date as you play.</p></section>`;
  }
  function snapshotHTML(s) {
    return `<article class="archive-share-card"><p class="eyebrow">Droid Archives · Player snapshot</p><h2>${escape(s.title)}</h2><div class="archive-stats">${s.progress?`<article><small>Progress</small><strong>Cycle ${s.progress.cycle+1} · RB ${s.progress.rebirth}</strong><span>Goal: RB ${s.progress.goal}</span></article>`:''}${s.income!==undefined?`<article><small>Base income</small><strong>${escape(api.fmt(s.income))}/sec</strong></article>`:''}${s.collection?`<article><small>Droidex</small><strong>${s.collection.owned} / ${s.collection.total}</strong></article>`:''}</div>${s.missing?`<h3>Missing for next rebirth</h3><p>${s.missing.length?s.missing.map(d=>`${escape(d.name)} (${escape(d.variant)})`).join(' · '):'No missing droid requirements'}</p>`:''}<small>Snapshot from ${escape(date(s.createdAt))} · droidarchives.co.uk</small></article>${s.layout?`<details class="archive-share-layout"><summary>View recorded layout (${s.layout.length} droids)</summary><ul>${s.layout.map(d=>`<li>${escape(d.station)} ${d.slot+1} — ${escape(d.name)} · ${escape(d.variant)}</li>`).join('')}</ul></details>`:''}`;
  }
  function showShare() {
    if(api.shared())return;
    const model=api.overview(), at=new Date().toISOString();
    modal('Share your progress', `<label class="field">Card title<input class="form-control" id="shareTitle" maxlength="80" value="${escape(model.name)}"></label><div class="archive-share-options">${[['progress','Rebirth progress',true],['income','Base income',true],['collection','Collection totals',true],['missing','Missing rebirth droids',false],['layout','Layout in the link',false]].map(([key,label,on])=>`<label class="archive-check"><input type="checkbox" data-share-field="${key}" ${on?'checked':''}>${label}</label>`).join('')}</div><p class="picker-hint">Anyone with the image or link can see the selected information. Links are fixed snapshots, contain no account details and cannot be revoked. Layout appears in the link, not on the image.</p><div class="archive-preview-label"><span>PLAYER CARD</span><span>1200 &times; 630 &middot; PNG</span></div><div id="sharePreview" aria-busy="true"></div><textarea class="form-control" id="shareLink" rows="2" readonly aria-label="Snapshot link" hidden></textarea>`, '<div class="modal-actions"><button class="btn" id="downloadProgress">Download PNG</button><button class="btn secondary" id="copyProgressLink">Copy snapshot link</button></div>');
    let current, currentCanvas=null, renderId=0;
    const update=()=>{
      const fields=new Set([...root().querySelectorAll('[data-share-field]:checked')].map(el=>el.dataset.shareField));
      current=validateSharedSnapshot({version:1,title:root().querySelector('#shareTitle').value.trim()||'My Droid Archives progress',createdAt:at,...(fields.has('progress')?{progress:{cycle:model.cycle,rebirth:model.rebirth,goal:model.goal}}:{}),...(fields.has('income')?{income:model.income}:{}),...(fields.has('collection')?{collection:{owned:model.collected,total:model.total}}:{}),...(fields.has('missing')?{missing:model.missing}:{}),...(fields.has('layout')?{layout:model.layout}: {})});
      const preview=root().querySelector('#sharePreview'),download=root().querySelector('#downloadProgress'),request=++renderId;
      download.disabled=true;preview.setAttribute('aria-busy','true');
      renderProgressCard(current,api.fmt).then(canvas=>{
        if(request!==renderId||!preview.isConnected)return;
        currentCanvas=canvas;preview.replaceChildren(canvas);preview.setAttribute('aria-busy','false');download.disabled=false;
      }).catch(error=>{if(request===renderId&&preview.isConnected){preview.setAttribute('aria-busy','false');showError(error);}});
      root().querySelector('#shareLink').hidden=true;
    };
    root().querySelector('#shareTitle').oninput=update;
    root().querySelectorAll('[data-share-field]').forEach(input=>input.onchange=update);
    root().querySelector('#downloadProgress').onclick=()=>{
      if(!currentCanvas)return;currentCanvas.toBlob(blob=>{if(!blob){showError(Error('The image could not be created.'));return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='droid-archives-progress.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);},'image/png');
    };
    root().querySelector('#copyProgressLink').onclick=async()=>{try{
      const url=new URL(api.publicUrl());url.hash='/shared?s='+encodeSharedSnapshot(current);
      const field=root().querySelector('#shareLink');field.value=url.href;field.hidden=false;
      try{await navigator.clipboard.writeText(url.href);api.toast('Snapshot link copied');}catch{field.focus();field.select();api.toast('Select and copy the link below the preview');}
    }catch(error){showError(error)}};
    update();
  }
  function sharedPage() {
    try{
      const s=decodeSharedSnapshot(new URLSearchParams(location.hash.split('?')[1]||'').get('s'));
      api.app().innerHTML=`<section class="archive-dashboard"><p class="eyebrow">Shared snapshot · Read only</p><h1>Player progress</h1><p>This is a player-provided snapshot, not a live profile. Opening it does not change your saves.</p><div class="archive-shared-art" aria-busy="true"></div>${snapshotHTML(s)}${s.missing?.length>3?`<details class="archive-share-layout"><summary>View all missing requirements (${s.missing.length})</summary><ul>${s.missing.map(d=>`<li>${escape(d.name)} &middot; ${escape(d.variant)}</li>`).join('')}</ul></details>`:''}<a class="btn secondary" href="#/">Back to my archive</a></section>`;
      const preview=api.app().querySelector('.archive-shared-art');
      renderProgressCard(s,api.fmt).then(canvas=>{
        if(!preview.isConnected)return;
        preview.replaceChildren(canvas);preview.setAttribute('aria-busy','false');
        api.app().querySelector('.archive-share-card')?.classList.add('archive-share-summary');
      }).catch(()=>{if(preview.isConnected)preview.remove();});
    }catch(error){api.app().innerHTML=`<section class="archive-dashboard"><h1>Snapshot unavailable</h1><p>${escape(error.message)}</p><a class="btn" href="#/">Back to my archive</a></section>`;}
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-archive-action]');if(!button||button.disabled)return;
    ({setup:()=>showSetup(),sample:()=>showSetup(true),history:showHistory,share:showShare})[button.dataset.archiveAction]?.();
  });
  return {home, checkpoint, releaseHistory, showHistory, showSetup, showShare, sharedPage};
}
