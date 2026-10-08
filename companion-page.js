import { downloadVisitorId, trackCompanionDownload } from './site-stats.js?v=2026-09-30-downloads';
// Companion lives inside the shared application shell in both site layouts.
export function companionPage(host, client=()=>null) {
  host.innerHTML = ` <style>
.companion-page{max-width:1120px;margin:0 auto;padding:20px 0 36px;color:var(--ink)}
.companion-page p,.companion-page li{color:var(--muted);line-height:1.65}
.companion-page .companion-hero{max-width:790px;margin-bottom:30px}
.companion-page h1{font-size:clamp(28px,4vw,42px);line-height:1.15;margin:14px 0}
.companion-page h2{font-size:24px;margin:0 0 16px}
.companion-page h3{font-size:18px;margin:0 0 8px}
.companion-page .companion-eyebrow{color:var(--green);font-weight:800;font-size:12px;letter-spacing:.12em;text-transform:uppercase}
.companion-page .companion-button{display:inline-block;background:var(--green);color:var(--panel);padding:13px 23px;border-radius:6px;font-weight:750;text-decoration:none;margin-top:8px}
.companion-page .companion-button[aria-disabled="true"]{opacity:.55;cursor:wait}
.companion-page .companion-meta{font-size:13px}
.companion-page .companion-beta{padding:18px 22px;border:1px solid var(--line);border-left:4px solid var(--gold);border-radius:8px;background:var(--panel)}
.companion-page .companion-beta p{margin:6px 0 0}
.companion-page .companion-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.companion-page .companion-card{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:22px}
.companion-page .companion-card p{font-size:14px;margin-bottom:0}
.companion-page .companion-section{margin-top:32px}
.companion-page .companion-keys{display:flex;flex-wrap:wrap;gap:24px;margin-top:20px}
.companion-page kbd{padding:4px 9px;border:1px solid var(--line);border-bottom-width:3px;border-radius:5px;background:var(--paper);margin-right:6px}
.companion-page li{margin:10px 0}
@media(max-width:700px){.companion-page .companion-grid{grid-template-columns:1fr}.companion-page .companion-card{padding:18px}}
</style><div class="companion-page">
<div class="companion-hero">
<div>
<span class="companion-eyebrow">Windows Companion &middot; Open Beta</span>
<h1>Droid Archives Companion</h1>
<p>Your Archives. Alongside your game.</p>
<p>Keep useful droid alerts, blueprint countdowns and your base planner close at hand, with an overlay you can arrange around the way you play.</p>
<a class="companion-button" id="dlButton" aria-disabled="true">Download for Windows</a>
<p class="companion-meta" id="dlMeta" aria-live="polite">Loading the latest Windows release...</p>
</div>
</div>
<div class="companion-beta">
<strong>Still in Beta &middot; your feedback helps.</strong>
<p>Features are being improved and you may encounter bugs or missed detections. If something goes wrong, share what happened and the app's activity log on Discord.</p>
</div>
<section class="companion-section">
<h2>What you can do</h2>
<div class="companion-grid">
<div class="companion-card">
<h3>Droid spawn alerts</h3>
<p>Watch for spawn messages and filter alerts by quality and rarity, so you can focus on the droids you want.</p>
</div>
<div class="companion-card">
<h3>Blueprint countdowns</h3>
<p>Keep Stellar, Mythic and Kyber timers visible alongside your recent spawn alerts.</p>
</div>
<div class="companion-card">
<h3>Archives &amp; Optimise</h3>
<p>Open the Archives and Optimise panels over your game, using your existing Archives login.</p>
</div>
<div class="companion-card">
<h3>Fishing timing cues</h3>
<p>Use a countdown and sound cues to help time your input. Timing can need adjustment for your setup.</p>
</div>
<div class="companion-card">
<h3>Your overlay layout</h3>
<p>Move and resize the overlay, choose which components appear, and adjust alert sounds and volume.</p>
</div>
<div class="companion-card">
<h3>Optional phone alerts</h3>
<p>Configure phone notifications if you want alerts away from your desk. Live spawn detection needs the game and Companion running.</p>
</div>
</div>
</section>
<section class="companion-section companion-card">
<h2>Get started in a few minutes</h2>
<ol>
<li>Download the portable Windows app and run it.</li>
<li>Use Fortnite in Windowed Fullscreen so the overlay can appear.</li>
<li>Open Spawn alerts &rarr; Select on screen and mark the chat area containing spawn messages.</li>
<li>Choose your alert filters and arrange your overlay.</li>
</ol>
<div class="companion-keys">
<span>
<kbd>F8</kbd> Archives</span>
<span>
<kbd>Alt + O</kbd> Optimise</span>
<span>
<kbd>F9</kbd> Quick settings</span>
</div>
</section>
<section class="companion-section">
<h2>Found a bug?</h2>
<p>Open Overview &rarr; Activity log in the Companion and include the relevant details when reporting it in <a href="https://discord.gg/droidarchives">our Discord</a>.</p>
</section>
</div>`;
  const button = host.querySelector('#dlButton');
  const meta = host.querySelector('#dlMeta');
  fetch('data/companion-release.json', {cache:'no-store', headers:{Accept:'application/json'}})
    .then(response => { if (!response.ok) throw new Error('Release unavailable'); return response.json(); })
    .then(release => {
      const exe = !release.draft && release.assets?.find(asset => /\.exe$/i.test(asset.name));
      if (!exe || new URL(exe.browser_download_url).hostname !== 'downloads.droidarchives.co.uk') throw new Error('Release unavailable');
      button.href = exe.browser_download_url;
      button.textContent = `Download for Windows - ${release.tag_name.replace(/^v/, '')}`;
      const visitor=downloadVisitorId();let lastStart=-Infinity;
      const track=event=>{
        if(event.type==='auxclick'&&event.button!==1)return;
        const now=Date.now();if(now-lastStart<1500)return;lastStart=now;
        trackCompanionDownload(client,release.tag_name.replace(/^v/,''),visitor);
      };
      button.addEventListener('click',track);button.addEventListener('auxclick',track);
      button.removeAttribute('aria-disabled');
      meta.textContent = `${release.tag_name.replace(/^v/, '')} - ${(exe.size / 1048576).toFixed(0)} MB - portable, no installer`;
    })
    .catch(() => {
      button.textContent = 'Retry loading download';
      button.href = '#/companion';
      button.removeAttribute('aria-disabled');
      button.onclick = event => {event.preventDefault(); companionPage(host,client);};
      meta.textContent = 'The download details could not be loaded. Please try again.';
    });
}
