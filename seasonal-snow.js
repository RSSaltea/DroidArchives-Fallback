const KEY='droid-archives-snow';
export const MAX_SNOW_HEIGHT=30;

// Wipes remove only the swept snow. Gravity then compacts unsupported snow
// downward and spills steep edges into neighbouring columns.
export class SnowBank{
  constructor(width){this.visual=null;this.canvas=document.createElement('canvas');this.canvas.width=width;this.canvas.height=MAX_SNOW_HEIGHT;this.ctx=this.canvas.getContext('2d',{willReadFrequently:true});}
  deposit(x,r){
    this.visual=null;
    x=Math.max(0,Math.min(this.canvas.width-1,Math.round(x)));
    const column=this.ctx.getImageData(x,0,1,MAX_SNOW_HEIGHT).data;
    let y=MAX_SNOW_HEIGHT;for(let i=0;i<MAX_SNOW_HEIGHT;i++)if(column[i*4+3]>100){y=i;break;}
    this.ctx.fillStyle='#edf7ff';this.ctx.beginPath();this.ctx.ellipse(x,y,Math.max(3,r*2),2+ r*.35,0,0,Math.PI*2);this.ctx.fill();
  }
  surface(x){const col=this.ctx.getImageData(Math.max(0,Math.min(this.canvas.width-1,Math.round(x))),0,1,MAX_SNOW_HEIGHT).data;for(let i=0;i<MAX_SNOW_HEIGHT;i++)if(col[i*4+3]>100)return i;return MAX_SNOW_HEIGHT;}
  wipe(a,b,r=17){if(Math.max(a.y,b.y)<-r||Math.min(a.y,b.y)>MAX_SNOW_HEIGHT+r)return;const c=this.ctx;c.save();c.globalCompositeOperation='destination-out';c.lineWidth=r*2;c.lineCap='round';c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.beginPath();c.arc(b.x,b.y,r,0,Math.PI*2);c.fill();c.restore();this.settle();}
  // Remove a measured scoop from the surface; builders can only carry snow
  // actually collected, and the sculpture grows only when it is delivered.
  scoop(x,amount=90){
    this.visual=null;
    let taken=0;const c=this.ctx;c.save();c.globalCompositeOperation='destination-out';
    for(let offset=-9;offset<=9;offset++){
      const col=Math.round(x+offset);if(col<0||col>=this.canvas.width)continue;
      const top=this.surface(col),depth=Math.min(MAX_SNOW_HEIGHT-top,amount/19);
      if(depth>0){c.fillRect(col,top,1,depth);taken+=depth;}
    }
    c.restore();this.settle();return taken;
  }
  setLevel(level){this.visual=null;this.ctx.clearRect(0,0,this.canvas.width,MAX_SNOW_HEIGHT);this.ctx.fillStyle='#edf7ff';const h=Math.max(0,Math.min(MAX_SNOW_HEIGHT,Number(level)||0));this.ctx.fillRect(0,MAX_SNOW_HEIGHT-h,this.canvas.width,h);}
  coverage(){const d=this.ctx.getImageData(0,0,this.canvas.width,1).data;let full=0;for(let x=0;x<this.canvas.width;x++)if(d[x*4+3]>100)full++;return full/this.canvas.width;}
  settle(){
    this.visual=null;
    const w=this.canvas.width,h=MAX_SNOW_HEIGHT,d=this.ctx.getImageData(0,0,w,h).data,levels=new Float32Array(w);
    for(let x=0;x<w;x++)for(let y=0;y<h;y++)levels[x]+=d[(y*w+x)*4+3]/255;
    for(let pass=0;pass<4;pass++)for(let i=0;i<w-1;i++){const x=pass%2?w-2-i:i,diff=levels[x]-levels[x+1];if(Math.abs(diff)>1.5){const move=(Math.abs(diff)-1.5)/2;if(diff>0){levels[x]-=move;levels[x+1]+=move}else{levels[x]+=move;levels[x+1]-=move}}}
    this.ctx.clearRect(0,0,w,h);this.ctx.fillStyle='#edf7ff';for(let x=0;x<w;x++)this.ctx.fillRect(x,h-Math.min(h,levels[x]),1,Math.min(h,levels[x]));
  }
  drawTo(ctx,x,y){
    // Keep the simulation intact; give its silhouette a soft powdery finish.
    // All decoration stays inside the same 30px strip and clears with the bank.
    if(!this.visual){
      const w=this.canvas.width,h=MAX_SNOW_HEIGHT,pixels=this.ctx.getImageData(0,0,w,h).data,tops=new Float32Array(w);
      for(let col=0;col<w;col++){tops[col]=h;for(let row=0;row<h;row++)if(pixels[(row*w+col)*4+3]>100){tops[col]=row;break;}}
      const image=document.createElement('canvas');image.width=w;image.height=h;const c=image.getContext('2d'),points=[];
      for(let col=0;col<=w;col+=2){
        let top=0,weight=0;
        for(let d=-5;d<=5;d++){const k=6-Math.abs(d);top+=tops[Math.max(0,Math.min(w-1,col+d))]*k;weight+=k;}
        const drift=1.6+1.1*Math.sin(col*.13+.7)+.6*Math.sin(col*.057)+.35*Math.sin(col*.31);
        points.push({x:col,y:Math.min(h,top/weight+Math.max(.15,drift))});
      }
      c.beginPath();c.moveTo(0,h);c.lineTo(points[0].x,points[0].y);
      for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];c.quadraticCurveTo(a.x,a.y,(a.x+b.x)/2,(a.y+b.y)/2);}
      const end=points[points.length-1];c.lineTo(w,end.y);c.lineTo(w,h);c.closePath();
      const shade=c.createLinearGradient(0,0,0,h);shade.addColorStop(0,'#ffffff');shade.addColorStop(.32,'#f2f9ff');shade.addColorStop(1,'#dbeaf5');c.fillStyle=shade;c.fill();
      c.save();c.clip();c.strokeStyle='rgba(255,255,255,.85)';c.lineWidth=2;c.beginPath();
      points.forEach((p,i)=>i?c.lineTo(p.x,p.y+1):c.moveTo(p.x,p.y+1));c.stroke();c.restore();
      this.visual=image;
    }
    ctx.drawImage(this.visual,x,y);
  }
  resize(width){this.visual=null;const old=this.canvas,copy=new SnowBank(width);copy.ctx.drawImage(old,0,0);this.canvas=copy.canvas;this.ctx=copy.ctx;}
}

// Hidden tabs may suspend animation and timers entirely. Advance the bank from
// elapsed time on return instead of trying to render invisible frames.
export function accumulateBackgroundSnow(bank,seconds,random=Math.random){
 const width=bank.canvas.width,rate=Math.min(14,width/90);
 let remaining=Math.max(0,seconds),coverage=bank.coverage();
 for(let i=0;i<width*30;i++){
  if(coverage>=1)break; // Already at the physical cap; no accumulation to replay.
  const interval=1/(rate*(coverage>=.8?1/3:1));
  if(remaining<interval)break;remaining-=interval;
  bank.deposit(random()*width,1.2+random()*4);
  if(i%64===63){bank.settle();coverage=bank.coverage();}
 }
 bank.settle();
}

// Remove this flag/import to remove only the experimental builders.
export const EXPERIMENTAL_SNOW_BUILDERS=true;
let ownerAllowed=false,snowControls=null;
export function setSnowOwner(allowed){ownerAllowed=Boolean(allowed);snowControls?.();}
export function mountSnow(){
 const header=document.querySelector('.site-header');if(!header||document.querySelector('#snowToggle'))return;
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 const read=()=>{try{return localStorage.getItem(KEY)}catch{return null}};
 let explicit=read(),enabled=explicit===null?!motion.matches:explicit==='on';
 const button=document.createElement('button');button.id='snowToggle';button.type='button';button.className='snow-toggle';header.append(button);
 const canvas=document.createElement('canvas');canvas.className='seasonal-snow';canvas.setAttribute('aria-hidden','true');document.body.append(canvas);
 const ctx=canvas.getContext('2d');if(!ctx){button.remove();canvas.remove();return}
 let width=0,height=0,bank=new SnowBank(1),flakes=[],raf=0,last=0,spawn=0,previous=null,settleTime=0,full=false,builders=null,buildersEnabled=true,hiddenAt=null;
 if(EXPERIMENTAL_SNOW_BUILDERS)import('./snow-builders.js?v=2026-11-01-builders-upright').then(m=>{builders=m.createSnowBuilders()}).catch(()=>{});
 function ownerControls(){
  const host=document.querySelector('#baseSidebarControls');
  if(!ownerAllowed){document.querySelector('#snowTestSettings')?.remove();return}
  if(!host||host.querySelector('#snowTestSettings'))return;
  const panel=document.createElement('details');panel.id='snowTestSettings';panel.className='side-group';panel.innerHTML='<summary>Snow testing (owner)</summary><label class="side-field">Snow depth (0-30px)<input data-snow-depth type="range" min="0" max="30" step="1" value="0"><output data-snow-depth-value>0px</output></label><label class="side-check"><input data-snow-builders type="checkbox" checked> Experimental snow-droid builders</label><button type="button" data-snow-reset>Clear snow and builders</button>';
  panel.querySelector('[data-snow-depth]').oninput=e=>{if(!ownerAllowed)return;bank.setLevel(e.target.value);panel.querySelector('output').textContent=e.target.value+'px';flakes=[];builders?.reset();if(!enabled){enabled=true;sync()}};
  panel.querySelector('[data-snow-builders]').checked=buildersEnabled;
  panel.querySelector('[data-snow-builders]').onchange=e=>{if(ownerAllowed){buildersEnabled=e.target.checked;builders?.reset()}};
  panel.querySelector('[data-snow-reset]').onclick=()=>{if(ownerAllowed){bank.setLevel(0);flakes=[];builders?.reset();panel.querySelector('input').value=0;panel.querySelector('output').textContent='0px'}};
  host.append(panel);
 }
 snowControls=ownerControls;new MutationObserver(ownerControls).observe(document.querySelector('#baseSidebarControls')||document.body,{childList:true});ownerControls();
 function resize(){width=innerWidth;height=innerHeight;const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);bank.resize(width);previous=null;}
 function flake(){return{x:Math.random()*width,y:-12,r:1.2+Math.random()*4,v:22+Math.random()*30,phase:Math.random()*6.28,spin:Math.random()*6.28,shape:Math.floor(Math.random()*3)};}
 function drawFlake(f,t){ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.spin+t*.16);ctx.strokeStyle='rgba(228,244,255,.8)';ctx.fillStyle='rgba(239,248,255,.8)';ctx.lineWidth=.8;if(f.shape===0){ctx.beginPath();ctx.arc(0,0,f.r*.5,0,Math.PI*2);ctx.fill()}else{for(let i=0;i<6;i++){ctx.rotate(Math.PI/3);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-f.r);if(f.shape===2){ctx.moveTo(-f.r*.35,-f.r*.6);ctx.lineTo(0,-f.r*.35);ctx.lineTo(f.r*.35,-f.r*.6)}ctx.stroke()}}ctx.restore();}
 function tick(now){raf=0;if(!enabled||document.hidden)return;if(last&&now-last<1000/30){raf=requestAnimationFrame(tick);return}const dt=last?Math.min((now-last)/1000,.1):0;last=now;settleTime+=dt;if(settleTime>.12){bank.settle();full=bank.coverage()>=.8;settleTime=0}spawn+=dt*Math.min(14,width/90)*(full?1/3:1);while(spawn>=1){if(flakes.length<160)flakes.push(flake());spawn--;}
  ctx.clearRect(0,0,width,height);
  flakes=flakes.filter(f=>{f.y+=f.v*dt;f.x+=Math.sin(now/1800+f.phase)*9*dt;if(f.x<0)f.x+=width;if(f.x>=width)f.x-=width;
   if(f.y>=height-MAX_SNOW_HEIGHT&&f.y+f.r>=height-MAX_SNOW_HEIGHT+bank.surface(f.x)){bank.deposit(f.x,f.r);return false}drawFlake(f,now/1000);return f.y<height+12;});
  bank.drawTo(ctx,0,height-MAX_SNOW_HEIGHT);if(buildersEnabled&&builders){builders.draw(ctx,{dt,width,height,bank,active:full});bank.drawTo(ctx,0,height-MAX_SNOW_HEIGHT);}canvas.dataset.snowing='true';canvas.dataset.snowRate=full?'reduced':'normal';raf=requestAnimationFrame(tick);
 }
 function sync(){
  if(!enabled)hiddenAt=null;
  else if(document.hidden){if(hiddenAt===null)hiddenAt=Date.now();}
  else if(hiddenAt!==null){accumulateBackgroundSnow(bank,(Date.now()-hiddenAt)/1000);hiddenAt=null;full=bank.coverage()>=.8;}
  button.textContent=enabled?'❄ Snow on':'❄ Snow off';button.setAttribute('aria-pressed',String(enabled));button.title=enabled?'Turn snow off · move your pointer over settled snow to clear it':'Turn snow on';canvas.hidden=!enabled;cancelAnimationFrame(raf);raf=0;last=0;previous=null;if(enabled&&!document.hidden)raf=requestAnimationFrame(tick);}
 button.addEventListener('click',()=>{enabled=!enabled;explicit=enabled?'on':'off';try{localStorage.setItem(KEY,explicit)}catch{}sync()});
 addEventListener('storage',e=>{if(e.key===KEY){explicit=e.newValue;enabled=explicit===null?!motion.matches:explicit==='on';sync()}});
 motion.addEventListener('change',()=>{if(explicit===null){enabled=!motion.matches;sync()}});
 addEventListener('resize',resize,{passive:true});document.addEventListener('visibilitychange',sync);
 addEventListener('pagehide',()=>{if(enabled&&hiddenAt===null)hiddenAt=Date.now();cancelAnimationFrame(raf);raf=0;last=0});addEventListener('pageshow',sync);
 document.addEventListener('pointermove',e=>{if(!enabled)return;const p={x:e.clientX,y:e.clientY-(height-MAX_SNOW_HEIGHT)};bank.wipe(previous||p,p);previous=p;},{passive:true});
 document.addEventListener('pointerdown',e=>{previous=null;if(enabled){const p={x:e.clientX,y:e.clientY-(height-MAX_SNOW_HEIGHT)};bank.wipe(p,p)}},{passive:true});
 document.addEventListener('pointerout',e=>{if(!e.relatedTarget)previous=null});document.addEventListener('pointerup',e=>{if(e.pointerType!=='mouse')previous=null});document.addEventListener('pointercancel',()=>previous=null);
 resize();sync();return{bank,canvas,button};
}
if(typeof document!=='undefined')mountSnow();
