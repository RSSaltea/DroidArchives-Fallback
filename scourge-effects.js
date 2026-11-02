// Procedural veins: each interaction gets a new connected branching pattern.
const random=(min,max)=>min+Math.random()*(max-min);
function veinNetwork(width,height,button){
  const veins=[],scale=Math.min(width,height),rootCount=button?7:30;
  function branch(x,y,angle,length,thickness,start,duration,depth){
    const points=[{x,y}],steps=button?12:22,step=length/steps;
    let direction=angle,bend=random(-.12,.12);
    for(let i=1;i<=steps;i++){
      bend=bend*.65+random(-.18,.18);direction+=bend;
      x+=Math.cos(direction)*step;y+=Math.sin(direction)*step;points.push({x,y});
    }
    veins.push({points,thickness,start,duration});
    if(depth<=0)return;
    const forks=button?2:4;
    for(let i=0;i<forks;i++){
      const fraction=(i+random(.4,.9))/(forks+1),index=Math.max(1,Math.floor(steps*fraction)),p=points[index],prev=points[index-1];
      const tangent=Math.atan2(p.y-prev.y,p.x-prev.x),side=Math.random()<.5?-1:1;
      branch(p.x,p.y,tangent+side*random(.45,1.15),length*random(.25,.48),thickness*random(.35,.6),start+duration*index/steps,duration*.55,depth-1);
    }
  }
  for(let i=0;i<rootCount;i++){
    // Distributed roots avoid a repeated wheel or a single expanding blob.
    const edge=i%4,t=(Math.floor(i/4)+Math.random())/Math.ceil(rootCount/4);
    const x=edge===0?-8:edge===1?width+8:t*width,y=edge===2?-8:edge===3?height+8:t*height;
    const angle=(edge===0?0:edge===1?Math.PI:edge===2?Math.PI/2:-Math.PI/2)+random(-.5,.5);
    branch(x,y,angle,button?random(width*.65,width):random(scale*.6,scale*1.35),button?random(1.5,3):random(5,14),button?random(0,500):random(0,280),button?random(1400,2100):random(800,1100),button?1:2);
  }
  return veins;
}
export function animateVeins(canvas,{button=false}={}){
  const bounds=canvas.getBoundingClientRect(),width=bounds.width,height=bounds.height,dpr=Math.min(devicePixelRatio||1,1.5);
  canvas.width=Math.ceil(width*dpr);canvas.height=Math.ceil(height*dpr);
  const ctx=canvas.getContext('2d');if(!ctx){const stop=()=>{};stop.retract=()=>Promise.resolve();return stop;}
  ctx.scale(dpr,dpr);ctx.lineCap='round';ctx.lineJoin='round';
  const veins=veinNetwork(width,height,button),started=performance.now(),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frame=0,stopped=false,retraction=null;
  const stop=()=>{stopped=true;cancelAnimationFrame(frame);retraction?.resolve();};
  stop.retract=(duration=1900)=>{
    if(stopped)return Promise.resolve();
    if(retraction)return retraction.promise;
    const now=performance.now();
    let resolve;
    const promise=new Promise(done=>{resolve=done;});
    retraction={started:now,from:now-started,duration:reduced?0:duration,resolve,promise};
    cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);
    return promise;
  };
  function draw(now){
    if(stopped||!canvas.isConnected){stop();return;}
    const retreat=retraction?Math.min(1,(now-retraction.started)/Math.max(1,retraction.duration)):0;
    // Reverse the growth timeline so tips withdraw before their parent branches.
    const eased=retreat*retreat*(3-2*retreat);
    const elapsed=retraction?retraction.from*(1-eased):reduced?10000:now-started;
    ctx.clearRect(0,0,width,height);let pending=false;
    if(!button){ctx.fillStyle=`rgba(14,3,24,${Math.min(.56,elapsed/2400)})`;ctx.fillRect(0,0,width,height);}
    for(const vein of veins){
      const progress=Math.max(0,Math.min(1,(elapsed-vein.start)/vein.duration));if(progress<1)pending=true;if(!progress)continue;
      const reach=progress*(vein.points.length-1),last=Math.floor(reach),points=vein.points;
      const visible=points.slice(0,last+1),from=points[last],to=points[Math.min(last+1,points.length-1)],fraction=reach-last;
      visible.push({x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction});
      function ribbon(factor,offset=0){
        const left=[],right=[];
        visible.forEach((p,j)=>{
          const prev=visible[Math.max(0,j-1)],next=visible[Math.min(visible.length-1,j+1)],dx=next.x-prev.x,dy=next.y-prev.y,length=Math.hypot(dx,dy)||1;
          const taper=(1-.83*j/(points.length-1))*Math.min(1,(visible.length-1-j)/2);
          const half=vein.thickness*factor*taper,shift=offset*vein.thickness*taper;
          left.push({x:p.x-dy/length*(half+shift),y:p.y+dx/length*(half+shift)});
          right.push({x:p.x+dy/length*(half-shift),y:p.y-dx/length*(half-shift)});
        });
        const outline=[...left,...right.reverse()],shape=new Path2D();
        shape.moveTo((outline[0].x+outline.at(-1).x)/2,(outline[0].y+outline.at(-1).y)/2);
        outline.forEach((p,j)=>{const next=outline[(j+1)%outline.length];shape.quadraticCurveTo(p.x,p.y,(p.x+next.x)/2,(p.y+next.y)/2)});
        shape.closePath();return shape;
      }
      // Tapered, asymmetrically lit tubes keep the branches fleshy rather than wire-like.
      ctx.fillStyle=button?'#0a030f':'#0d0414';ctx.fill(ribbon(.85));
      ctx.fillStyle=button?'#2c0c3b':'#401a50';ctx.fill(ribbon(.53,-.12));
      ctx.fillStyle=button?'#170521':'#542660';ctx.fill(ribbon(.18,-.34));
    }
    if(retraction&&retreat>=1){stop();return;}
    if(retraction||pending)frame=requestAnimationFrame(draw);
  }
  frame=requestAnimationFrame(draw);
  return stop;
}
const hovered=new WeakMap();
function growButton(link){
  const previous=hovered.get(link);previous?.stop();previous?.canvas.remove();
  const canvas=document.createElement('canvas');canvas.className='scourge-button-veins';canvas.setAttribute('aria-hidden','true');link.append(canvas);
  const stop=animateVeins(canvas,{button:true});hovered.set(link,{canvas,stop});
}
// Delegation also covers Classic's dynamically chosen navigation shortcuts.
if(typeof document!=='undefined'){
  for(const type of ['pointerover','focusin'])document.addEventListener(type,event=>{
    const link=event.target.closest?.('a[href="#/scourgedex"]');
    if(!link||link.contains(event.relatedTarget))return;
    if(type==='focusin'&&link.matches(':hover')&&hovered.has(link))return;
    growButton(link);
  });
  for(const type of ['pointerout','focusout'])document.addEventListener(type,event=>{
    const link=event.target.closest?.('a[href="#/scourgedex"]');if(!link||link.contains(event.relatedTarget))return;
    if(link.matches(':hover,:focus-visible,.active,[aria-current="page"]'))return;
    const current=hovered.get(link);if(!current)return;current.stop();current.canvas.classList.add('leaving');
    setTimeout(()=>{current.canvas.remove();if(hovered.get(link)===current)hovered.delete(link)},350);
  });
}
