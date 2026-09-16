// One renderer for the editor preview, downloaded PNG and shared snapshot page.
// Artwork is bundled with the site; no profile image URLs or external requests.
const ART = {
  emblem:'assets/other/icon.png',
  income:'assets/events/Credits.png',
  progress:'assets/nav/Rebirth.png',
  collection:'assets/nav/Droidex.png'
};
let artwork;
function loadArtwork() {
  return artwork ||= Promise.all(Object.entries(ART).map(([key,path])=>new Promise(resolve=>{
    const image=new Image();
    image.onload=()=>resolve([key,image]);
    image.onerror=()=>resolve([key,null]);
    image.src=new URL(path,import.meta.url).href;
  }))).then(Object.fromEntries);
}

export async function renderProgressCard(snapshot, format) {
  const [art]=await Promise.all([loadArtwork(),document.fonts?.ready]);
  const canvas=document.createElement('canvas');
  canvas.width=1200;canvas.height=630;
  canvas.setAttribute('role','img');
  canvas.setAttribute('aria-label',`${snapshot.title} — Droid Archives progress card`);
  const ctx=canvas.getContext('2d');
  const text=(value,x,y,size,color='#f5f8fd',weight=700,max=1100)=>{
    ctx.font=`${weight} ${size}px Inter, Arial, sans-serif`;ctx.fillStyle=color;
    let line=String(value);
    while(ctx.measureText(line).width>max&&line.length)line=line.slice(0,-1);
    if(line!==String(value))line=line.slice(0,-1)+'…';
    ctx.fillText(line,x,y);
  };
  const line=(x1,y1,x2,y2,color,width=1)=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke();};
  const panel=(x,y,w,h,fill,stroke,radius=18)=>{
    ctx.beginPath();ctx.roundRect(x,y,w,h,radius);ctx.fillStyle=fill;ctx.fill();
    if(stroke){ctx.lineWidth=1;ctx.strokeStyle=stroke;ctx.stroke();}
  };
  const image=(source,x,y,w,h)=>{
    if(!source)return;
    const scale=Math.min(w/source.naturalWidth,h/source.naturalHeight);
    const width=source.naturalWidth*scale,height=source.naturalHeight*scale;
    ctx.drawImage(source,x+(w-width)/2,y+(h-height)/2,width,height);
  };
  const centered=(value,x,y,size,color,weight=700)=>{ctx.save();ctx.textAlign='center';text(value,x,y,size,color,weight);ctx.restore();};
  const fraction=(n,total)=>Math.max(0,Math.min(1,total?n/total:0));
  const meter=(x,y,w,ratio,color,segments=28)=>{
    const gap=4,segment=(w-gap*(segments-1))/segments;
    for(let i=0;i<segments;i++)panel(x+i*(segment+gap),y,segment,8,(i+1)/segments<=ratio+0.00001?color:'#253a48',null,2);
  };
  // Ink-blue metal, a quiet technical grid and warm/cool light behind the badge.
  const backdrop=ctx.createLinearGradient(0,0,1200,630);
  backdrop.addColorStop(0,'#08141f');backdrop.addColorStop(.62,'#112735');backdrop.addColorStop(1,'#0a1424');
  ctx.fillStyle=backdrop;ctx.fillRect(0,0,1200,630);
  const halo=ctx.createRadialGradient(1010,155,10,1010,155,480);
  halo.addColorStop(0,'#237e7866');halo.addColorStop(.6,'#13515a22');halo.addColorStop(1,'#10334400');
  ctx.fillStyle=halo;ctx.fillRect(0,0,1200,630);
  for(let x=24;x<1200;x+=48)line(x,0,x,630,'#68baa908');
  for(let y=22;y<630;y+=48)line(0,y,1200,y,'#68baa908');
  line(48,90,1152,90,'#8ab6b42b');
  line(48,564,1152,564,'#8ab6b42b');
  // Corner details keep the card recognisable even when every stat is hidden.
  for(const [x,y,dx,dy] of [[18,18,1,1],[1182,18,-1,1],[18,612,1,-1],[1182,612,-1,-1]]){
    line(x,y,x+22*dx,y,'#72e7d1',2);line(x,y,x,y+22*dy,'#72e7d1',2);
  }
  ctx.fillStyle='#65e6cd';ctx.beginPath();ctx.arc(56,52,5,0,Math.PI*2);ctx.fill();
  text('DROID ARCHIVES',74,61,25,'#ecf8f5',800);
  text('DROID TYCOON  /  PLAYER CARD',778,58,15,'#9fb9c5',600,374);
  // The established Archives mascot is the hero, rather than an invented avatar.
  const cx=1025,cy=190,r=105;
  ctx.save();ctx.shadowColor='#43d7be66';ctx.shadowBlur=35;
  ctx.beginPath();ctx.arc(cx,cy,r+4,0,Math.PI*2);ctx.lineWidth=1;ctx.strokeStyle='#56ccb688';ctx.stroke();ctx.restore();
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();
  image(art.emblem,cx-r,cy-r,r*2,r*2);ctx.restore();
  if(!art.emblem){image(art.collection,cx-58,cy-58,116,116);}
  ctx.beginPath();ctx.arc(cx,cy,r+14,-Math.PI*.58,Math.PI*.16);ctx.lineWidth=3;ctx.strokeStyle='#e9c576';ctx.stroke();
  text('MY ARCHIVE',50,137,14,'#69d7c5',700);
  let titleSize=70;
  while(titleSize>35){ctx.font=`800 ${titleSize}px Inter, Arial, sans-serif`;if(ctx.measureText(snapshot.title).width<=800)break;titleSize--;}
  text(snapshot.title,46,212,titleSize,'#f5f8fd',800,800);
  text('A collection worth building.',50,252,19,'#9fb8c6',500);

  const metrics=[...(snapshot.income!==undefined?['income']:[]),...(snapshot.progress?['progress']:[]),...(snapshot.collection?['collection']:[])];
  const y=300,h=snapshot.missing?166:240,gap=16,w=metrics.length?(1104-gap*(metrics.length-1))/metrics.length:1104;
  const colors={income:'#f0cf83',progress:'#80ddc5',collection:'#acb7ff'};
  for(const [index,key] of metrics.entries()){
    const x=48+index*(w+gap),color=colors[key];
    const fill=ctx.createLinearGradient(x,y,x+w,y+h);fill.addColorStop(0,'#172b3b');fill.addColorStop(1,'#10212e');
    panel(x,y,w,h,fill,'#72929e44');
    line(x+22,y+1,x+Math.min(w-22,102),y+1,color,3);
    if(key!=='collection')image(art[key],x+w-75,y+17,52,52);
    text({income:'BASE INCOME',progress:'REBIRTH',collection:'DROIDEX'}[key],x+24,y+36,13,color,700,w-100);
    if(key==='income'){
      const size=w>500?74:52;
      text(format(snapshot.income),x+22,y+(h<200?96:113),size,'#fff5df',800,w-45);
      text('credits / second',x+25,y+(h<200?122:144),15,'#adbcca',500,w-48);
      if(h>=200){line(x+24,y+170,x+w-24,y+170,'#dfbc7130');text(`${format(snapshot.income*3600)} / hour`,x+24,y+h-25,19,'#edcf8c',600,w-48);}
    }else if(key==='progress'){
      const {cycle,rebirth,goal}=snapshot.progress;
      text(String(rebirth).padStart(2,'0'),x+22,y+(h<200?96:113),w>500?74:60,'#e6fff5',800,w-48);
      text(`CYCLE ${String(cycle+1).padStart(2,'0')}`,x+(w>500?146:125),y+(h<200?90:105),18,color,700,w-154);
      meter(x+24,y+h-50,w-48,fraction(rebirth,goal),color);
      text(rebirth>=goal?'Goal reached':`Working towards RB ${goal}`,x+24,y+h-20,14,'#b2c9cc',500,w-48);
    }else{
      const {owned,total}=snapshot.collection,ratio=fraction(owned,total),radius=h<200?39:53;
      const ringX=x+80,ringY=y+(h<200?101:129);
      ctx.lineWidth=9;ctx.strokeStyle='#2a3b54';ctx.beginPath();ctx.arc(ringX,ringY,radius,0,Math.PI*2);ctx.stroke();
      if(ratio>0){ctx.strokeStyle=color;ctx.lineCap='round';ctx.beginPath();ctx.arc(ringX,ringY,radius,-Math.PI/2,-Math.PI/2+Math.PI*2*ratio);ctx.stroke();ctx.lineCap='butt';}
      centered(`${Math.round(ratio*100)}%`,ringX,ringY+7,h<200?21:26,'#ecedff',800);
      text(format(owned),x+151,ringY+1,w>500?60:43,'#f2f0ff',800,w-174);
      text(`/ ${format(total)} qualities`,x+153,ringY+28,15,'#b4bfda',500,w-173);
      if(h>=200)text(owned>=total?'Collection complete':`${total-owned} still to discover`,x+24,y+h-25,15,'#bdc7e7',500,w-48);
    }
  }
  if(!metrics.length){
    panel(48,y,1104,h,'#102332','#72929e44');
    const iconSize=h<200?98:118,iconY=y+(h-iconSize)/2;
    image(art.collection,79,iconY,iconSize,iconSize);image(art.progress,958,iconY,iconSize,iconSize);
    text('Build. Collect. Rebirth.',235,y+h/2-13,40,'#f3fafb',800,680);
    text('My journey through Droid Tycoon',238,y+h/2+25,22,'#9eb8c8',500,680);
  }
  if(snapshot.missing){
    const missing=snapshot.missing;
    text('NEXT REBIRTH',50,495,12,'#80ddc5',700);
    text(missing.length?`${missing.length} missing requirement${missing.length===1?'':'s'}`:'All required droids recorded',210,495,14,'#c8d8e4',500,700);
    if(missing.length>3)text(`+${missing.length-3} more in link`,960,495,12,'#98adbc',500,190);
    for(const [i,droid] of missing.slice(0,3).entries()){
      const x=48+i*373;panel(x,510,358,36,'#192c39','#4c667a55',8);
      text(droid.name,x+13,534,14,'#eaf2fb',700,210);
      text(droid.variant,x+226,533,11,'#b5d8cd',600,120);
    }
  }
  text('droidarchives.co.uk',50,602,20,'#dcf3ee',700,440);
  ctx.save();ctx.textAlign='right';text(new Date(snapshot.createdAt).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}),1150,602,14,'#9cb5c1',500,330);ctx.restore();
  return canvas;
}
