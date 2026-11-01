const selector='#rebirthQuickBar';
const key=()=> 'droid-archive-rebirth-bar-pos';
const read=el=>{try{const p=JSON.parse(localStorage.getItem(key(el)));return Number.isFinite(p?.x)&&Number.isFinite(p?.y)?p:null}catch{return null}};
function place(el,p,save=true){
 const r=el.getBoundingClientRect(),x=Math.max(8,Math.min(p.x,innerWidth-r.width-8)),y=Math.max(8,Math.min(p.y,innerHeight-r.height-8));
 el.style.left=x+'px';el.style.top=y+'px';
 if(el.id==='rebirthQuickBar'){el.style.bottom='auto';el.style.transform='none'}
 if(save)try{localStorage.setItem(key(el),JSON.stringify({x,y}))}catch{}
 return{x,y};
}
function reset(el){try{localStorage.removeItem(key(el))}catch{}if(el.id==='rebirthQuickBar'){for(const k of ['left','top','bottom','transform'])el.style[k]=''}else place(el,{x:innerWidth-el.offsetWidth-16,y:innerHeight-el.offsetHeight-76},false);}
let pending=0,drag=null;
function scan(){pending=0;document.querySelectorAll(selector).forEach(el=>{
 el.tabIndex=0;el.title='Drag the background to move ? Arrow keys to nudge ? Home or double-click to reset';
 el.setAttribute('aria-label','Rebirth bar. Drag the background or use arrow keys to move.');
 if(!el.hidden&&el!==drag?.el){const p=read(el);if(p)place(el,p,false)}
 });}
function schedule(){if(!pending)pending=requestAnimationFrame(scan)}
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
addEventListener('resize',schedule);schedule();
document.addEventListener('pointerdown',e=>{
 const el=e.target.closest(selector);if(!el||e.button!==0)return;
 if(e.target.closest('button,a,input,select'))return;
 const r=el.getBoundingClientRect();drag={el,id:e.pointerId,x:e.clientX,y:e.clientY,start:{x:r.left,y:r.top},saved:read(el)};
 el.setPointerCapture(e.pointerId);el.classList.add('panel-dragging');e.preventDefault();e.stopPropagation();
},true);
document.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;place(drag.el,{x:drag.start.x+e.clientX-drag.x,y:drag.start.y+e.clientY-drag.y},false);e.preventDefault()}, {passive:false});
function finish(cancel=false){if(!drag)return;const {el,id,start,saved}=drag;if(cancel){if(saved)place(el,saved);else reset(el)}else{const r=el.getBoundingClientRect();place(el,{x:r.left,y:r.top})}drag=null;el.classList.remove('panel-dragging');if(el.hasPointerCapture(id))el.releasePointerCapture(id);}
document.addEventListener('pointerup',()=>finish());document.addEventListener('pointercancel',()=>finish(true));
document.addEventListener('dblclick',e=>{const el=e.target.closest(selector);if(el&&!e.target.closest('button,a,input,select'))reset(el)});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&drag){finish(true);return}
 const el=e.target;if(!el.matches(selector))return;
 if(e.key==='Home'){e.preventDefault();reset(el);return}
 const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;e.preventDefault();const r=el.getBoundingClientRect(),step=e.shiftKey?30:10;place(el,{x:r.left+delta[0]*step,y:r.top+delta[1]*step});
});
