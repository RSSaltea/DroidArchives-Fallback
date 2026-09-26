import {architecture} from './test-map-architecture.js?v=preview-5';
// Cartoon cutaway: recovered mesh placement and floor collision outlines.
// Round cutaways approximate mesh bounds; interior decoration is illustrative.
export function measuredArtwork(points,project){
 const o=project([0,0]),unit=project([1,0]),scale=Math.hypot(unit[0]-o[0],unit[1]-o[1]);
 const poly=(ps,fill,stroke='#182735',width=3)=>`<polygon points="${ps.map(p=>project(p).join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"/>`;
 const ring=(p,r,fill,stroke='#223541',w=3)=>{const [x,y]=project(p);return `<circle cx="${x}" cy="${y}" r="${r*scale}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`;};
 const inset=(r,f)=>r.outline.map(p=>p.map((n,i)=>r.center[i]+(n-r.center[i])*f));
 let out='<g class="tm-cartoon-art" pointer-events="none"><defs><pattern id="tmCartoonTiles" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="#152c36" stroke-opacity=".16" stroke-width="1.5"/></pattern></defs>';
 for(const r of [...architecture].sort((a,b)=>(a.kind==='pad')-(b.kind==='pad'))){
  const colours={astro:['#a9c8d5','#607f90'],battle:['#f0846d','#735664'],worker:['#eee4b8','#8aac89'],lounge:['#f3ddb0','#c2a776'],fusion:['#d5e8e5','#83a9ac'],pad:['#cee2e8','#4a697a']}[r.kind];
  out+=poly(r.outline.map(p=>[p[0],p[1]-65]),'#13232e','#101e29',7)+poly(r.outline,colours[0],'#203340',4)+poly(inset(r,.91),colours[1],colours[0],3)+poly(inset(r,.88),'url(#tmCartoonTiles)','none');
  if(['worker','lounge','fusion','pad'].includes(r.kind)){
   out+=poly(inset(r,.77),'none',colours[0],2);
   for(let j=0;j<12;j++){const k=Math.floor(j*r.outline.length/12),p=r.outline[k],a=p.map((n,i)=>r.center[i]+(n-r.center[i])*.82),b=p.map((n,i)=>r.center[i]+(n-r.center[i])*.95);out+=`<path d="M${project(a)}L${project(b)}" stroke="#314b57" stroke-width="3"/>`;}
  }
  if(r.kind==='worker')out+=ring(r.center,260,'#38624f','#d8e9b2',4)+ring(r.center,175,'#5d9e67','#1e443c',4)+ring(r.center,95,'#bdf294','#edffcf',3);
  if(r.kind==='pad'){
   const [x,y]=project(r.center);out+=`<g transform="translate(${x} ${y}) scale(${scale})"><path d="M0 -360L75 -100L310 100L285 190L65 100L0 330L-65 100L-285 190L-310 100L-75 -100Z" fill="#9eb9c9" stroke="#203746" stroke-width="25" stroke-linejoin="round"/><path d="M0 -190L40 50L0 115L-40 50Z" fill="#65d7ea" stroke="#294755" stroke-width="16"/></g>`;
  }
 }
 // Equipment is anchored to the actual attach points, never to the illustration.
 for(const p of points){
  const [x,y]=project(p.position);
  if(p.station==='ASTROMECH'||(p.station==='BATTLE'&&p.slot<5))out+=`<rect x="${x-20}" y="${y-23}" width="40" height="45" rx="7" fill="${p.station==='BATTLE'?'#b95551':'#497986'}" stroke="#1b3441" stroke-width="3"/><path d="M${x-12} ${y-18}h24" stroke="${p.station==='BATTLE'?'#ffc29e':'#8af0ec'}" stroke-width="3"/>`;
  if(p.station==='FUSION_BUILD'||p.station==='BUILD')out+=ring(p.position,175,'#4c919b','#d0f5e9',3)+ring(p.position,135,'#81d5d4','#234653',2);
 }
 return out+'</g>';
}
