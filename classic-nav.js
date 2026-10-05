const STORAGE_KEY='droid-archive-classic-shortcuts';
const DEFAULTS=['#/base','#/optimise','#/droidex','#/crit-calc'];

export function initClassicNavigation(){
  if(!document.documentElement.hasAttribute('data-classic-shell'))return;
  const nav=document.querySelector('#nav'),menu=document.querySelector('.sidebar');
  if(!nav||!menu)return;
  const settings=document.createElement('details');
  settings.className='classic-nav-settings';
  settings.innerHTML='<summary>Navigation settings</summary><p>Choose up to four top-bar shortcuts, in the order you want. All pages remain in this menu.</p><div class="classic-shortcut-fields"></div><button type="button" class="btn secondary" data-reset-shortcuts>Reset defaults</button><p class="classic-shortcut-status" role="status">Saved automatically on this browser.</p>';
  menu.querySelector('.side-title').after(settings);
  let selected;
  try{selected=JSON.parse(localStorage.getItem(STORAGE_KEY));}catch{}
  if(!Array.isArray(selected))selected=[...DEFAULTS];
  selected=Array.from({length:4},(_,i)=>typeof selected[i]==='string'?selected[i]:'');
  const links=()=>[...menu.querySelectorAll(':scope > a[href^="#/"]')].map(a=>({href:a.getAttribute('href'),label:a.textContent.trim()}));
  const updateActive=()=>{const route=(location.hash||'#/').split('?')[0];nav.querySelectorAll('a').forEach(a=>{const href=a.getAttribute('href'),active=route===href||(href!=='#/'&&route.startsWith(href+'/'));a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});};
  function render(){
    const options=links(),allowed=new Set(options.map(x=>x.href)),seen=new Set();
    selected=selected.map(href=>{if(!allowed.has(href)||seen.has(href))return '';seen.add(href);return href;});
    nav.replaceChildren();
    for(const href of selected.filter(Boolean)){const a=document.createElement('a');a.href=href;a.textContent=options.find(x=>x.href===href).label;nav.append(a);}
    nav.style.setProperty('--shortcut-count',String(selected.filter(Boolean).length||1));
    nav.classList.toggle('no-shortcuts',!selected.some(Boolean));updateActive();
    const fields=settings.querySelector('.classic-shortcut-fields');fields.replaceChildren();
    selected.forEach((value,index)=>{
      const label=document.createElement('label');label.textContent=`Shortcut ${index+1}`;
      const select=document.createElement('select');select.className='form-control';select.dataset.shortcut=String(index);
      for(const item of [{href:'',label:'None'},...options]){const option=document.createElement('option');option.value=item.href;option.textContent=item.label;select.append(option);}
      select.value=value;
      select.onchange=()=>{const previous=selected[index],other=selected.indexOf(select.value);if(select.value&&other!==-1&&other!==index)selected[other]=previous;selected[index]=select.value;persist();render();settings.querySelector(`[data-shortcut="${index}"]`).focus();};
      label.append(select);fields.append(label);
    });
  }
  function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(selected));settings.querySelector('.classic-shortcut-status').textContent='Saved automatically on this browser.';}catch{settings.querySelector('.classic-shortcut-status').textContent='Changed for this visit. Browser storage is unavailable.';}}
  settings.querySelector('[data-reset-shortcuts]').onclick=()=>{selected=[...DEFAULTS];persist();render();};
  window.addEventListener('hashchange',updateActive);
  window.addEventListener('storage',event=>{if(event.key!==STORAGE_KEY)return;try{const value=JSON.parse(event.newValue);selected=Array.isArray(value)?Array.from({length:4},(_,i)=>typeof value[i]==='string'?value[i]:''):[...DEFAULTS];render();}catch{}});
  // Private destinations can become available after account permissions load.
  new MutationObserver(render).observe(menu,{childList:true});
  render();
}
initClassicNavigation();
