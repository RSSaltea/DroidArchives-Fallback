import {architecture} from './test-map-architecture.js?v=preview-6';
import {measuredArtwork} from './test-map-measured-art.js?v=preview-11';
import {slotPosition,slotDistanceSquared} from './slot-geometry.js?v=2026-09-26-slot-order';

let shortcutController;

// Base map. Coordinates come from the optimiser; management uses Base callbacks.
export function testMapPage({host,slots,placed,droids,picture,label,available,escape,stationIcon,variantLabel,manage=null,ui={}}) {
  const points=slots.map(s=>({...s,mapX:s.x*12,mapY:s.y*11,slot:s.index,position:slotPosition({station:s.station,slot:s.index})})).filter(s=>s.position);
  let selected=ui.selected||null,target=null,zoom=ui.zoom||1,angle=ui.angle??32,floor=ui.floor||'all',showLocked=true,view=ui.view||'base',mode=ui.mode||'manage',moving=null;
  const colour=s=>s.startsWith('PROTOCOL')?'#f3bd58':({WORKER:'#76dc86',ASTROMECH:'#65baf0',BATTLE:'#f78b89',LOUNGE:'#c2a2f8',FUSION:'#f4ba72',FUSION_BUILD:'#f4ba72',BUILD:'#71dcd7',UPGRADE_CHIP:'#f0db72'}[s]||'#aaa');
  const key=s=>`${s.station}:${s.slot}`,name=s=>`${label(s.station)} ${s.slot+1}`;
  const upper=s=>s.station==='BATTLE'&&s.slot>=5;
  const occupant=s=>placed.find(p=>p.station===s.station&&p.slot===s.slot);
  const distances=(a,b)=>({direct:Math.sqrt(slotDistanceSquared(a,b)),flat:Math.hypot(a.position[0]-b.position[0],a.position[1]-b.position[1]),height:Math.abs(a.position[2]-b.position[2])});
  const fmt=n=>Math.round(n).toLocaleString();
  host.innerHTML=`<section class="test-map-page"><header class="tm-heading"><div><p class="eyebrow">Map workshop · local preview</p><h2>Manage your Base</h2><p>The same measured slot layout, with a cartoon base or a distance overlay.</p></div></header><div class="tm-tools">${manage?'<label>Action <select id="tmMode"><option value="manage">Manage Base</option><option value="measure">Measure distance</option></select></label>':''}<div class="tm-view-switch" role="group" aria-label="Map view"><button id="tmBaseView" class="active" aria-pressed="true">Cartoon base</button><button id="tmDistanceView" aria-pressed="false">Distance view</button></div><label>Levels <select id="tmFloor"><option value="all">Both levels</option><option value="ground">Ground slots</option><option value="upper">Upper Battle slots</option></select></label><label><input type="checkbox" id="tmLocked" checked> Show locked slots</label><label>Rotate <input id="tmAngle" type="range" min="-180" max="180" value="32"></label><div><button class="btn secondary" id="tmOut" aria-label="Zoom out">−</button> <button class="btn secondary" id="tmFit">Fit</button> <button class="btn secondary" id="tmIn" aria-label="Zoom in">+</button></div></div><div class="tm-layout"><div class="tm-viewport"><div class="tm-canvas"></div></div><aside class="tm-inspector" aria-live="polite"></aside></div><div class="tm-legend">${['WORKER','ASTROMECH','BATTLE','LOUNGE','BUILD','FUSION','PROTOCOL_WORKER_CREDITS'].map(s=>`<span><i style="background:${colour(s)}"></i>${s.startsWith('PROTOCOL')?'Protocol':label(s)}</span>`).join('')}<span>Dashed ring: upper level</span></div><p class="tm-footnote">In Cartoon base, upstairs Battle slots are shown in a separate side strip for easy access. Distance view shows their actual positions. Distances use game coordinate units, including height, with no stair detour added. Use the cards below to manage Companions and Blueprint Storage.</p></section>`;
  let suppressClick=false,hovered=null;
  const canvas=host.querySelector('.tm-canvas'),inspector=host.querySelector('.tm-inspector'),viewport=host.querySelector('.tm-viewport');
  canvas.tabIndex=-1;
  canvas.addEventListener('pointerleave',()=>{hovered=null;});
  shortcutController?.abort();shortcutController=new AbortController();
  window.addEventListener('click',event=>{
    if(!host.isConnected||suppressClick||(!selected&&!target&&!moving))return;
    // Let slot selection, move destinations, and explicit controls finish their action.
    if(event.target.closest?.('[data-slot],[data-action],[data-near],#tmClear,.tm-tools,#modalRoot'))return;
    selected=target=moving=null;
    render();
  },{signal:shortcutController.signal});
  window.addEventListener('keydown',event=>{
    if(!host.isConnected||!manage||mode!=='manage'||suppressClick||event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||event.isComposing)return;
    if(document.querySelector('#modalRoot')?.childElementCount||event.target.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]'))return;
    const focused=canvas.contains(document.activeElement),slotKey=hovered||(focused?(document.activeElement.dataset.slot||selected):null);
    if(!slotKey)return;
    const slot=points.find(p=>key(p)===slotKey);if(!slot)return;
    const unit=occupant(slot),pressed=event.key.toLowerCase();
    if(!['delete','backspace','a','v','m','l','c','escape'].includes(pressed))return;
    event.preventDefault();
    if(pressed==='escape'){moving=selected=target=null;render();canvas.focus({preventScroll:true});return;}
    if(pressed==='a'){if(!unit&&available(slot))manage.add(slot);return;}
    if(!unit)return;
    if(pressed==='m'){if(!manage.building(unit)){selected=moving=key(slot);target=null;render();canvas.focus({preventScroll:true});}return;}
    if(pressed==='c'){if(manage.building(unit))manage.complete(unit);return;}
    if(pressed==='v')manage.variant(unit);
    else if(pressed==='l')manage.lock(unit);
    else if(pressed==='delete'||pressed==='backspace')manage.remove(unit);
  },{signal:shortcutController.signal});
  canvas.addEventListener('dragstart',event=>event.preventDefault());
  canvas.addEventListener('selectstart',event=>event.preventDefault());
  function render(){
    Object.assign(ui,{selected,zoom,angle,floor,view,mode});
    const radians=angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
    const projected=points.map(p=>({...p,px:p.position[0]*c+p.position[1]*s,py:p.position[0]*s-p.position[1]*c}));
    const bounds=architecture.flatMap(r=>r.outline),xs=[...projected.map(p=>p.px),...bounds.map(p=>p[0]*c+p[1]*s)],ys=[...projected.map(p=>p.py),...bounds.map(p=>p[0]*s-p[1]*c)],minX=Math.min(...xs),minY=Math.min(...ys),scale=Math.min(880/(Math.max(...xs)-minX),780/(Math.max(...ys)-minY));
    projected.forEach(p=>{p.x=160+(p.px-minX)*scale;p.y=160+(p.py-minY)*scale;});
    const project=p=>[160+(p[0]*c+p[1]*s-minX)*scale,160+(p[0]*s-p[1]*c-minY)*scale];
    const artwork=view==='base'?measuredArtwork(points,project):'';
    canvas.classList.toggle('tm-physical',view==='base');
    const visible=projected.filter(p=>(showLocked||available(p))&&(floor==='all'||(floor==='upper')===upper(p)));
    projected.forEach(p=>{p.measuredX=p.x;p.measuredY=p.y;});
    const upstairs=visible.filter(upper),separateUpper=view==='base'&&upstairs.length>0;
    let upperPanel='';
    if(separateUpper){
      const battle=projected.filter(p=>p.station==='BATTLE'),anchorX=battle.reduce((n,p)=>n+p.x,0)/battle.length,anchorY=battle.reduce((n,p)=>n+p.y,0)/battle.length;
      const top=Math.max(100,Math.min(600,anchorY-180));
      for(const p of projected.filter(upper)){p.x=1120;p.y=top+68+(p.slot-5)*64;}
      upperPanel=`<g class="tm-upper-panel" pointer-events="none"><path d="M${anchorX} ${anchorY}L1052 ${top+225}"/><rect x="1052" y="${top}" width="136" height="438" rx="16"/></g>`;
    }
    const a=projected.find(p=>key(p)===selected),b=projected.find(p=>key(p)===target);
    const clusters=[['Worker pod',p=>p.station==='WORKER'&&p.slot<8],['Worker walkway',p=>p.station==='WORKER'&&p.slot>=8],['Astromech',p=>p.station==='ASTROMECH'],['Battle',p=>p.station==='BATTLE'&&!upper(p)],['Upper Battle',upper],['Lounge',p=>p.station==='LOUNGE'&&p.slot<5],['Lounge extension',p=>p.station==='LOUNGE'&&p.slot>=5],['Fusion',p=>['FUSION','FUSION_BUILD'].includes(p.station)]];
    const areas=clusters.map(([title,test])=>{const ps=visible.filter(test);if(title==='Upper Battle'&&separateUpper)return '';if(!ps.length)return'';const hull=convexHull(ps);return `<g class="tm-area" style="color:${colour(ps[0].station)}"><polygon points="${hull.map(p=>`${p.x},${p.y}`).join(' ')}"/></g>`;}).join('');
    const markers=visible.map(p=>{const unit=occupant(p),d=droids.find(d=>d.name===unit?.name),active=key(p)===selected||key(p)===target,locked=!available(p),buildState=unit&&['BUILD','FUSION_BUILD'].includes(p.station)?(unit.built?'tm-built':'tm-building'):'';return `<g class="tm-slot ${buildState} ${upper(p)?'tm-upper':''} ${active?'tm-selected':''} ${locked?'tm-locked':''}" style="color:${colour(p.station)}" data-slot="${key(p)}" role="button" tabindex="0" aria-label="${escape(name(p)+(unit?': '+unit.name+' - '+variantLabel(unit.variant):locked?': locked':': empty'))}" transform="translate(${p.x},${p.y})"><title>${escape(name(p))}${unit?' · '+escape(unit.name)+' - '+escape(variantLabel(unit.variant)):locked?' · Locked':' · Empty'}${upper(p)?' · Upper level':''}${locked&&manage?.price?' - '+escape(manage.price(p)):''}</title><circle r="${p.station==='FUSION'?11:19}"/>${d?`<foreignObject x="-16" y="-20" width="32" height="36"><div xmlns="http://www.w3.org/1999/xhtml" class="tm-portrait">${picture(d,unit.variant)}</div></foreignObject>`:`<foreignObject x="-14" y="-14" width="28" height="28"><div xmlns="http://www.w3.org/1999/xhtml" class="tm-empty-icon">${stationIcon(p.station)}</div></foreignObject>`}</g>`;}).join('');
    // Place labels in free space and keep their entire layer behind slot circles.
    const labelBoxes=[],overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
    const slotBoxes=visible.map(p=>({x:p.x-23,y:p.y-24,w:46,h:48}));
    const labels=visible.map(p=>{
      const text=p.station.startsWith('PROTOCOL')?(p.station.endsWith('CREDITS')?'Credits':'Craft'):p.station==='FUSION_BUILD'?'Tank '+(p.slot+1):p.station==='BUILD'?'Build '+(p.slot+1):p.station==='UPGRADE_CHIP'?'Chips':occupant(p)?String(p.slot+1):'';
      if(!text)return '';
      const w=text.length*7+6,h=16;
      for(const [dx,dy] of [[0,36],[0,-30],[36+w/2,4],[-36-w/2,4],[0,53]]){
        const box={x:p.x+dx-w/2,y:p.y+dy-12,w,h};
        if(slotBoxes.some(b=>overlap(box,b))||labelBoxes.some(b=>overlap(box,b)))continue;
        labelBoxes.push(box);return `<text class="tm-slot-label" fill="${colour(p.station)}" x="${p.x+dx}" y="${p.y+dy}">${text}</text>`;
      }
      return ''; // Full identification remains available in the tooltip.
    }).join('');
    const line=a&&b?`<g class="tm-measure"><line x1="${a.measuredX}" y1="${a.measuredY}" x2="${b.measuredX}" y2="${b.measuredY}"/><circle cx="${a.measuredX}" cy="${a.measuredY}" r="25"/><circle cx="${b.measuredX}" cy="${b.measuredY}" r="25"/></g>`:'';
    canvas.style.width=`${Math.min(viewport.clientWidth,viewport.clientHeight*1200/1100)*zoom}px`;
    const shortcutRows=[['Delete','Remove this droid'],['V','Change droid variant'],['M','Choose where to move'],['L','Toggle Optimise lock'],['A','Add to an empty slot'],['C','Mark build as complete'],['Esc','Cancel move / deselect']];
    const shortcuts=manage?`<g class="tm-key-legend" pointer-events="none"><rect class="tm-key-panel" x="20" y="20" width="336" height="344" rx="12"/><text class="tm-key-heading" x="36" y="48">KEYBOARD SHORTCUTS</text><text class="tm-key-help" x="36" y="70">${mode==='manage'?'Hover over a slot, then press a key.':'Switch to Manage Base to use these.'}</text>${shortcutRows.map(([key,action],i)=>`<g transform="translate(36 ${88+i*32})"><rect class="tm-keycap" width="72" height="25" rx="5"/><text class="tm-key-name" x="36" y="17">${key}</text><text class="tm-key-action" x="86" y="18">${action}</text></g>`).join('')}<text class="tm-key-help" x="36" y="326">Backspace also removes a droid.</text><text class="tm-key-help" x="36" y="347">Move onto an occupied slot to swap.</text></g>`:'';
    canvas.innerHTML=`<svg viewBox="0 0 1200 1100" aria-label="Measured Base slot map"><defs><pattern id="tmGrid" width="${500*scale}" height="${500*scale}" patternUnits="userSpaceOnUse"><path d="M ${500*scale} 0 L 0 0 0 ${500*scale}" fill="none" stroke="currentColor" stroke-opacity=".07"/></pattern></defs><rect width="1200" height="1100" fill="url(#tmGrid)"/>${artwork}${shortcuts}${upperPanel}${areas}${line}<g class="tm-label-layer" pointer-events="none">${labels}</g><g class="tm-slot-layer">${markers}</g><g class="tm-scale" transform="translate(${Math.ceil(65/(500*scale))*500*scale} ${Math.floor(1020/(500*scale))*500*scale})"><path d="M0 -5V5M0 0H${500*scale}M${500*scale} -5V5"/><text x="0" y="24">500 game units</text></g></svg>`;
    canvas.querySelectorAll('[data-slot]').forEach(el=>{const raise=()=>{if(el.parentNode.lastElementChild!==el)el.parentNode.appendChild(el);};el.onpointerenter=()=>{hovered=el.dataset.slot;raise();};el.onpointerleave=()=>{if(hovered===el.dataset.slot)hovered=null;};el.onfocus=raise;const pick=()=>{if(suppressClick)return;if(manage&&mode==='manage'){const dest=points.find(p=>key(p)===el.dataset.slot),from=points.find(p=>key(p)===moving);if(from&&manage.canMove(from,dest)){moving=null;manage.move(from,dest);return;}selected=el.dataset.slot;target=null;render();if(!from&&!occupant(dest)&&available(dest))manage.add(dest);return;}if(!selected||target){selected=el.dataset.slot;target=null;}else if(selected===el.dataset.slot){selected=null;}else target=el.dataset.slot;render();};el.onclick=pick;el.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();pick();}};});
    const details=p=>{const unit=occupant(p);return `<h3>${escape(name(p))}</h3><p>${unit?escape(unit.name)+' · '+escape(unit.variant.replaceAll('_',' ')):available(p)?'Empty slot':'Locked / not purchased'}${upper(p)?' · Upper level':''}</p>`;};
    inspector.innerHTML=a?`<p class="eyebrow">${b?'Distance comparison':'Selected slot'}</p>${details(a)}${b?`${details(b)}<div class="tm-distance"><strong>${fmt(distances(a,b).direct)}</strong><span>units · straight-line distance</span></div><dl><dt>Horizontal separation</dt><dd>${fmt(distances(a,b).flat)}</dd><dt>Height difference</dt><dd>${fmt(distances(a,b).height)}</dd></dl><p>No extra distance for stairs. This measures separation, not a walking route.</p>`:'<p>Select another slot to measure the distance between them.</p>'}<button class="btn secondary" id="tmClear">Clear selection</button><h3>Closest measured slots</h3><div class="tm-nearest">${visible.filter(p=>key(p)!==selected).sort((p,q)=>slotDistanceSquared(a,p)-slotDistanceSquared(a,q)).slice(0,5).map(p=>`<button data-near="${key(p)}"><span>${escape(name(p))}</span><strong>${fmt(Math.sqrt(slotDistanceSquared(a,p)))}</strong></button>`).join('')}</div>`:`<p class="eyebrow">Explore your Base</p><h2>Select a slot</h2><p>Pick a slot, then a second one to compare their distance. Droids shown here come from your current Base.</p><div class="tm-distance"><strong>${visible.length}</strong><span>measured slots shown</span></div><p>Upstairs Battle slots have a separate side strip in Cartoon base. Distance view shows their actual horizontal positions.</p><p>Choose Manage Base to edit your saved Base, or Measure distance to compare slots.</p>`;
    if(manage&&mode==='manage'){
      const unit=a&&occupant(a);
      inspector.innerHTML=a?`<p class="eyebrow">${moving?'Choose a destination':'Manage slot'}</p>${details(a)}${unit?`<div class="tm-production">${manage.production(unit)}</div><div class="tm-actions"><button class="btn" data-action="move" ${manage.building(unit)?'disabled':''}>Move / Swap</button><button class="btn secondary" data-action="variant">Change variant</button><button class="btn secondary" data-action="lock">${unit.lockedSlot?'Unlock':'Lock'} for Optimise</button>${manage.building(unit)?'<button class="btn" data-action="complete">Complete build</button>':''}<button class="btn secondary" data-action="remove">Remove droid</button></div>`:available(a)?'<button class="btn" data-action="add">Add droid</button>':`<p>${escape(manage.lockedLabel(a))}</p><p><strong>${escape(manage.price(a))}</strong></p>${manage.eligible(a)?'<button class="btn" data-action="purchase">Purchase slot</button>':''}`}<p>${moving?'Highlighted circles are valid destinations. Select an occupied one to swap.':'Drag a droid onto another circle to move or swap it.'}</p>${moving?'<button class="btn secondary" data-action="cancel">Cancel move</button>':''}`:'<p class="eyebrow">Manage your Base</p><h2>Select a circle</h2><p>Add droids to empty slots, change variants, or drag between circles to move and swap.</p><p>Changes update your saved Base and the cards below.</p>';
      inspector.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>{const action=button.dataset.action;if(action==='move'){moving=key(a);render();}else if(action==='cancel'){moving=null;render();}else if(['add','purchase'].includes(action))manage[action](a);else manage[action](unit);});
      const from=points.find(p=>key(p)===moving);
      if(from)canvas.querySelectorAll('[data-slot]').forEach(el=>el.classList.toggle('tm-valid-drop',manage.canMove(from,points.find(p=>key(p)===el.dataset.slot))));
      canvas.querySelectorAll('[data-slot]').forEach(el=>el.onpointerdown=e=>{
        const source=points.find(p=>key(p)===el.dataset.slot),unit=occupant(source);if(!unit||manage.building(unit)||e.button!==0)return;
        e.preventDefault();el.focus({preventScroll:true});
        const start=[e.clientX,e.clientY];let dragging=false;
        const move=event=>{if(!dragging&&Math.hypot(event.clientX-start[0],event.clientY-start[1])<6)return;dragging=true;suppressClick=true;event.preventDefault();canvas.querySelectorAll('[data-slot]').forEach(node=>node.classList.toggle('tm-valid-drop',manage.canMove(source,points.find(p=>key(p)===node.dataset.slot))));el.classList.add('tm-dragging');};
        const finish=event=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);const node=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-slot]'),dest=points.find(p=>key(p)===node?.dataset.slot);canvas.querySelectorAll('.tm-valid-drop,.tm-dragging').forEach(n=>n.classList.remove('tm-valid-drop','tm-dragging'));if(dragging&&event.type==='pointerup'&&dest&&manage.canMove(source,dest))manage.move(source,dest);setTimeout(()=>suppressClick=false,0);};
        window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);
      });
    }
    inspector.querySelector('#tmClear')?.addEventListener('click',()=>{selected=target=null;render();});
    inspector.querySelectorAll('[data-near]').forEach(el=>el.onclick=()=>{target=el.dataset.near;render();});
  }
  for(const [id,mode] of [['tmBaseView','base'],['tmDistanceView','distance']])host.querySelector('#'+id).onclick=()=>{view=mode;for(const button of host.querySelectorAll('.tm-view-switch button')){const active=button.id===id;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}render();};
  host.querySelector('#tmFloor').onchange=e=>{floor=e.target.value;selected=target=null;render();};
  host.querySelector('#tmLocked').onchange=e=>{showLocked=e.target.checked;selected=target=null;render();};
  host.querySelector('#tmAngle').oninput=e=>{angle=Number(e.target.value);render();};
  host.querySelector('#tmIn').onclick=()=>{zoom=Math.min(3,zoom+.35);render();};
  host.querySelector('#tmOut').onclick=()=>{zoom=Math.max(1,zoom-.35);render();};
  host.querySelector('#tmFit').onclick=()=>{zoom=1;render();viewport.scrollTo(0,0);};
  host.querySelector('#tmAngle').value=angle;host.querySelector('#tmFloor').value=floor;
  host.querySelector('#tmBaseView').classList.toggle('active',view==='base');host.querySelector('#tmBaseView').setAttribute('aria-pressed',String(view==='base'));host.querySelector('#tmDistanceView').classList.toggle('active',view==='distance');host.querySelector('#tmDistanceView').setAttribute('aria-pressed',String(view==='distance'));
  if(manage){host.querySelector('#tmMode').value=mode;host.querySelector('#tmMode').onchange=e=>{mode=e.target.value;selected=target=moving=null;render();};}
  render();
}

function convexHull(points){
  const sorted=[...points].sort((a,b)=>a.x-b.x||a.y-b.y),cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const half=list=>{const out=[];for(const p of list){while(out.length>=2&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out;};
  return half(sorted).slice(0,-1).concat(half([...sorted].reverse()).slice(0,-1));
}
