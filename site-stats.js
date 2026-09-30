export function downloadVisitorId(storage=localStorage) {
  let visitor;
  try {
    visitor=storage.getItem('droid-site-visitor');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(visitor||'')) {
      visitor=crypto.randomUUID();storage.setItem('droid-site-visitor',visitor);
    }
  } catch {visitor=crypto.randomUUID();}
  return visitor;
}

// Analytics never delays or prevents the browser's download.
export function trackCompanionDownload(client, version, visitor=downloadVisitorId()) {
  try {return Promise.resolve(client()?.rpc('droid_companion_download_start', {
    event:crypto.randomUUID(), visitor, release_version:version
  })).catch(()=>{});} catch {return Promise.resolve();}
}

// A random browser ID merges tabs without storing an IP or browsing history.
export function startSiteActivity({client, storage=localStorage, doc=document, win=window, now=Date.now}) {
  let visitor;
  try { visitor=storage.getItem('droid-site-visitor'); if(!/^[0-9a-f-]{36}$/i.test(visitor||'')) {visitor=crypto.randomUUID();storage.setItem('droid-site-visitor',visitor);} } catch {visitor=crypto.randomUUID();}
  let dirty=true,busy=false,retryAt=0,lastIdentity;
  const touch=()=>{dirty=true;};
  const pulse=async()=>{
    const api=client();
    if(!api||doc.visibilityState!=='visible'||busy||now()<retryAt)return;
    if(!dirty)return;
    dirty=false;busy=true;
    try {const {error}=await api.rpc('droid_site_heartbeat',{visitor});if(error){dirty=true;retryAt=now()+300000;}}
    catch {dirty=true;retryAt=now()+300000;}
    finally {busy=false;}
  };
  const visible=()=>{if(doc.visibilityState==='visible'){touch();pulse();}};
  for(const event of ['pointerdown','keydown','scroll'])win.addEventListener(event,touch,{passive:true});
  doc.addEventListener('visibilitychange',visible);
  const timer=win.setInterval(pulse,60000);pulse();
  return {pulse,accountChanged(id){if(id!==lastIdentity){lastIdentity=id;touch();}pulse();},stop(){win.clearInterval(timer);for(const event of ['pointerdown','keydown','scroll'])win.removeEventListener(event,touch);doc.removeEventListener('visibilitychange',visible);}};
}

export async function showSiteStats({host,client,allowed}) {
  if(!allowed()){host.innerHTML='<h1>Site statistics</h1><p>This page is available only to the site owner.</p>';return;}
  host.innerHTML='<h1>Site statistics</h1><p role="status">Loading counts...</p>';
  const content=host.lastElementChild;
  try {
    const {data,error}=await client().rpc('droid_site_stats');
    if(!allowed()||!content.isConnected)return;
    if(error)throw error;
    const count=key=>Number.isFinite(Number(data?.[key]))?Number(data[key]).toLocaleString():'Unavailable';
    host.innerHTML=`<h1>Site statistics</h1><p><strong>${count('signed_up')}</strong> signed-up accounts &middot; <strong>${count('confirmed')}</strong> with confirmed email</p><table><thead><tr><th>Activity</th><th>Last 5 minutes</th><th>Last hour</th><th>Last 24 hours</th><th>Last 7 days</th></tr></thead><tbody><tr><th>Visitors (browsers)</th><td>${count('browsers_now')}</td><td>${count('browsers_1h')}</td><td>${count('browsers_24h')}</td><td>${count('browsers_7d')}</td></tr><tr><th>Signed-in accounts</th><td>${count('accounts_now')}</td><td>${count('accounts_1h')}</td><td>${count('accounts_24h')}</td><td>${count('accounts_7d')}</td></tr></tbody></table><p>Visitor counts include signed-out visitors. Tabs in the same browser count once; different browsers or cleared storage can count separately. Signed-in accounts are counted once across devices. These rows overlap and should not be added together.</p><p>Activity means opening or returning to a visible tab, clicking, scrolling or typing. Counts update about once a minute. Activity history starts when tracking is enabled; these are not historical traffic totals.</p><p>Updated ${new Date(data.updated_at).toLocaleString()}</p><button class="btn" id="refreshSiteStats">Refresh counts</button>`;
    host.querySelector('#refreshSiteStats').onclick=()=>showSiteStats({host,client,allowed});
    const downloads=document.createElement('section');host.append(downloads);
    await showDownloadStats(downloads,client,allowed);
  } catch(error) {
    if(!allowed()||!content.isConnected)return;
    content.textContent=['PGRST202','42883'].includes(error?.code)?'Statistics setup is pending. Run data/supabase-site-stats.sql in the Supabase SQL Editor, then refresh this page.':'Counts are unavailable. Check your connection and sign in again, then refresh.';
  }
}

async function showDownloadStats(host,client,allowed) {
  host.innerHTML='<h2>Companion downloads</h2><p>Loading download counts...</p>';
  try {
    const {data,error}=await client().rpc('droid_companion_download_stats');
    if(!host.isConnected||!allowed())return;
    if(error)throw error;
    const count=value=>Number.isFinite(Number(value))?Number(value).toLocaleString():'Unavailable';
    const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    host.innerHTML=`<h2>Companion downloads</h2><p><strong>${count(data.total)}</strong> download starts &middot; <strong>${count(data.unique_browsers)}</strong> unique browsers &middot; <strong>${count(data.unique_accounts)}</strong> unique signed-in accounts</p><p>${count(data.last_24h)} starts in the last 24 hours &middot; ${count(data.last_7d)} in the last 7 days</p><table><thead><tr><th>Version</th><th>Download starts</th><th>Unique browsers</th><th>Unique signed-in accounts</th></tr></thead><tbody>${(data.versions||[]).map(v=>`<tr><td>${escape(v.version)}</td><td>${count(v.total)}</td><td>${count(v.unique_browsers)}</td><td>${count(v.unique_accounts)}</td></tr>`).join('')||'<tr><td colspan="4">No downloads recorded yet.</td></tr>'}</tbody></table><p>Counts start when tracking is enabled and measure download-button activations on this website, not completed transfers or installations. Direct file links and app updater downloads are not included. Browsers can count separately after clearing storage or changing devices. Signed-in accounts count once across devices; browser and account totals overlap. Version totals can include the same people.</p>`;
  } catch(error) {
    if(!host.isConnected||!allowed())return;
    host.innerHTML='<h2>Companion downloads</h2><p>'+(['PGRST202','42883'].includes(error?.code)?'Download tracking setup is pending. Run the updated data/supabase-site-stats.sql in the Supabase SQL Editor, then refresh.':'Download counts are unavailable. Please refresh to try again.')+'</p>';
  }
}
