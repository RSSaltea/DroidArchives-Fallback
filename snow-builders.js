// Optional cosmetic experiment. No profile, economy or planner dependencies.
// Disable EXPERIMENTAL_SNOW_BUILDERS in seasonal-snow.js to remove it entirely.
export const SNOW_DROIDS=['GONK','R7','BB','MOUSE','EG-58','EGL','ECG','PROTO-ROLLER','ORB-WALKER','SNOW MOUSE','TRI-TEK','CHOPPER','OPTI-POD'];
const snowSprites=new Map(),garlandSprite=new Image();
garlandSprite.src=new URL('./assets/snow-droids/cartoon-tinsel.webp',import.meta.url).href;
export const snowSpritesReady=Promise.all([garlandSprite.decode().catch(()=>{}),...SNOW_DROIDS.map(async name=>{
 const image=new Image();image.src=new URL(`./assets/snow-droids/${name}.webp`,import.meta.url).href;
 try{await image.decode();snowSprites.set(name,image)}catch{/* Skip unavailable sprites instead of mixing visual styles. */}
})]);
export const TINSEL_COLOURS=['gold','silver','red','green','blue','pink'];
const tintFilters={gold:'none',silver:'grayscale(1) brightness(1.35)',red:'hue-rotate(315deg)',green:'hue-rotate(75deg)',blue:'hue-rotate(175deg)',pink:'hue-rotate(270deg)'};
const tinselFrames=new Map(),tintedTinsel=new Map();
function tinselTexture(colour){
 if(!garlandSprite.complete||!garlandSprite.naturalWidth)return null;
 if(!tintedTinsel.has(colour)){
  const image=document.createElement('canvas');image.width=garlandSprite.width;image.height=garlandSprite.height;
  const ctx=image.getContext('2d');ctx.filter=tintFilters[colour]||'none';ctx.drawImage(garlandSprite,0,0);tintedTinsel.set(colour,image);
 }
 return tintedTinsel.get(colour);
}
export function createTinselPattern(random=Math.random,wraps=1){
 const colours=[...TINSEL_COLOURS],cross=wraps>1&&random()<.7,firstSlope=(random()<.5?-1:1)*(.12+random()*.16);
 return Array.from({length:wraps},(_,i)=>({
  colour:colours.splice(Math.floor(random()*colours.length),1)[0],
  slope:Number((cross?(i%2?-firstSlope:firstSlope):(random()-.5)*.5).toFixed(3)),
  level:Number((cross?-29+(random()-.5)*2:-32+(i+.5)*7/wraps+(random()-.5)).toFixed(2)),
  sag:Number((.7+random()*1.3).toFixed(2))
 }));
}
export function drawSnowTinsel(c,progress=1,wraps=1,pattern=null){
 if(progress<=0||!garlandSprite.complete||!garlandSprite.naturalWidth||!snowSprites.has('OPTI-POD'))return;
 wraps=Math.max(1,Math.min(3,Math.round(wraps)));
 const levels=wraps===1?[-29]:wraps===2?[-32,-25.5]:[-34,-29.5,-25];
 pattern=pattern||levels.map(level=>({level,slope:0,sag:1.8,colour:'gold'}));
 const step=Math.ceil(Math.min(1,progress)*wraps*32),key=JSON.stringify(pattern)+':'+step;
 let image=tinselFrames.get(key);
 if(!image){
  image=document.createElement('canvas');image.width=176;image.height=192;
  const ctx=image.getContext('2d');ctx.scale(4,4);ctx.translate(22,47);
  // Later strands lie over earlier ones, including at their crossing points.
  for(let row=0;row<wraps;row++){
   const strand=pattern[row],texture=tinselTexture(strand.colour);
   for(let i=0;i<32;i++){
    if(row*32+i>=step)continue;
    const u=i/31,x=-17+34*u,y=strand.level+Math.sin(Math.PI*u)*strand.sag+x*(strand.slope-.09);
    const thickness=1.4+1.2*Math.sin(Math.PI*u);
    ctx.drawImage(texture,i*texture.width/32,0,texture.width/32,texture.height,x,y-thickness/2,1.15,thickness);
   }
  }
  ctx.globalCompositeOperation='destination-in';ctx.drawImage(snowSprites.get('OPTI-POD'),-20,-45,40,45);
  if(tinselFrames.size>=96)tinselFrames.delete(tinselFrames.keys().next().value);
  tinselFrames.set(key,image);
 }
 c.drawImage(image,-22,-47,44,48);
}
export function fitSnowFooting(feet,bank,x){
 const [left,right]=feet,span=right.x-left.x;
 // Portrait feet are at different depths in perspective, not necessarily
 // leaning. Apply only a small correction and bury the lower contact instead.
 const terrain=span>3?Math.max(-.06,Math.min(.06,Math.atan2(bank.surface(x+right.x)-bank.surface(x+left.x),span))):0;
 const perspective=span>3?Math.atan2(right.y-left.y,span)*.2:0;
 const angle=Math.max(-.07,Math.min(.07,terrain-perspective)),cos=Math.cos(angle),sin=Math.sin(angle);
 const contacts=feet.map(p=>({x:p.x*cos-p.y*sin,y:p.x*sin+p.y*cos}));
 // A little burial hides the contact edge beneath the powdery foreground.
 const depth=Math.max(...contacts.map(p=>bank.surface(x+p.x)+4-p.y));
 return{angle,depth,contacts};
}
export function createSnowBuilders(random=Math.random){
 let scenes=[],workers=[],debris=[],started=false,age=0;
 const pick=values=>values[Math.floor(random()*values.length)];
 const outfit=()=>({coat:pick(['#d45757','#4a9b92','#8276cc','#d69838','#4c85bc','#bc6899']),hat:pick(['#e36168','#64b7a0','#e8be5c','#9b8bd6']),trousers:pick(['#26384c','#524365','#494e39']),skin:pick(['#f5cdaa','#c88d65','#87583f']),style:Math.floor(random()*3),hatStyle:Math.floor(random()*3)});
 const reset=()=>{scenes=[];workers=[];debris=[];started=false;age=0};
 function sculpture(c,type){
  const sprite=snowSprites.get(type);if(sprite)c.drawImage(sprite,-20,-45,40,45);
 }
 function structure(type){
  const canvas=document.createElement('canvas');canvas.width=44;canvas.height=48;
  const c=canvas.getContext('2d');c.translate(22,47);sculpture(c,type);
  const pixels=c.getImageData(0,0,44,48).data,cells=[];
  for(let row=0;row<24;row++)for(let col=0;col<22;col++){
   let solid=false;for(let y=0;y<2;y++)for(let x=0;x<2;x++)if(pixels[((row*2+y)*44+col*2+x)*4+3]>80)solid=true;
   if(solid)cells.push({col,row,built:false});
  }
  const bottom=Math.max(...cells.map(cell=>cell.row));
  const soles=[];
  for(let col=0;col<44;col++)for(let row=47;row>=24;row--)if(pixels[(row*44+col)*4+3]>100){soles.push({x:col-22,y:row-46});break;}
  const middle=(Math.min(...soles.map(p=>p.x))+Math.max(...soles.map(p=>p.x)))/2;
  const contact=points=>{const low=Math.max(...points.map(p=>p.y)),edge=points.filter(p=>p.y>=low-1);return{x:edge.reduce((sum,p)=>sum+p.x,0)/edge.length,y:low};};
  const feet=[contact(soles.filter(p=>p.x<=middle)),contact(soles.filter(p=>p.x>middle))];
  return{cells,bottom,feet,credit:0,built:0};
 }
 function deliver(s,amount,side){
  const model=s.structure;model.credit+=amount*model.cells.length/720;
  let allowance=Math.floor(model.credit+1e-6);model.credit-=allowance;
  while(allowance-->0&&model.built<model.cells.length){
   const occupied=new Set(model.cells.filter(cell=>cell.built).map(cell=>`${cell.col}:${cell.row}`));
   const supported=cell=>cell.row>=model.bottom-2||[-1,0,1].some(dx=>occupied.has(`${cell.col+dx}:${cell.row+1}`))
    ||[-1,1].some(dx=>occupied.has(`${cell.col+dx}:${cell.row}`))||occupied.has(`${cell.col}:${cell.row-1}`);
   const candidates=model.cells.filter(cell=>!cell.built&&supported(cell));
   // Local deliveries favour the builder's side. Keep the growing shape broad
   // and supported instead of exposing a whole horizontal slice at once.
   candidates.sort((a,b)=>{
    const score=cell=>Math.abs(cell.col-(side<0?5:16))*.8+(model.bottom-cell.row)*.7;
    return score(a)-score(b)||b.row-a.row;
   });
   if(!candidates.length){model.credit+=allowance+1;break;}
   candidates[0].built=true;model.built++;
  }
  s.snow=model.built===model.cells.length?720:Math.min(719,s.snow+amount);
 }
 function collapse(scene,y){
  // Capture only built sections. Never reveal the missing part of a droid
  // during collapse, even when its first few scoops are all that exist.
  const image=document.createElement('canvas');image.width=44;image.height=48;
  const c=image.getContext('2d');c.translate(22,47);c.beginPath();
  for(const cell of scene.structure.cells)if(cell.built)c.rect(cell.col*2-22,cell.row*2-47,2.1,2.1);
  c.clip();sculpture(c,scene.type);
  const pixels=c.getImageData(0,0,44,48).data;
  for(let sy=0;sy<48;sy+=6)for(let sx=0;sx<44;sx+=6){
   let mass=0;for(let dy=0;dy<6&&sy+dy<48;dy++)for(let dx=0;dx<6&&sx+dx<44;dx++)mass+=pixels[((sy+dy)*44+sx+dx)*4+3]/255;
   if(mass<.5)continue;
   const angle=scene.angle||0,dx=sx-19,dy=sy-44;
   debris.push({image,sx,sy,x:scene.x+dx*Math.cos(angle)-dy*Math.sin(angle),y:y+dx*Math.sin(angle)+dy*Math.cos(angle),vx:(random()-.5)*35,vy:-5-random()*12,angle,spin:(random()-.5)*7,delay:random()*.12,r:Math.max(.7,Math.sqrt(mass)/3),landed:false,fade:1});
  }
  scene.collapsed=true;scene.collapsedAt=age;scene.tinsel=0;scene.snow=720;scene.structure.built=0;
  for(const cell of scene.structure.cells)cell.built=false;
 }
 function person(c,x,y,t,side,working,carrying=false,clothes,tinsel=false,tinselColour='gold'){
  const bob=Math.sin(t*7)*.7;c.save();c.translate(x,y+bob);c.scale(side,1);c.strokeStyle=clothes.trousers;c.lineWidth=2.4;c.lineCap='round';c.beginPath();c.moveTo(-2,-5);c.lineTo(-4+Math.sin(t*6),0);c.moveTo(2,-5);c.lineTo(4-Math.sin(t*6),0);c.stroke();
  c.fillStyle=clothes.coat;c.beginPath();c.roundRect(-4,-15,8,11,3);c.fill();c.fillStyle=clothes.skin;c.beginPath();c.arc(0,-19,3.4,0,Math.PI*2);c.fill();c.fillStyle=clothes.hat;c.fillRect(-4,-23,8,3);
  if(clothes.hatStyle===0){c.beginPath();c.arc(1,-25,2,0,Math.PI*2);c.fill()}
  else if(clothes.hatStyle===1){c.fillRect(-3,-26,6,4)}
  else{c.fillRect(-5,-22,2,6);c.fillRect(3,-22,2,6)}
  c.fillStyle=clothes.hat;
  if(clothes.style===0){c.fillRect(-4,-16,8,2);c.fillRect(-3,-15,2,6)}
  else if(clothes.style===1){c.fillRect(-4,-11,8,2);c.fillRect(-4,-7,8,2)}
  else{c.fillStyle='#e1e8ed';c.fillRect(0,-14,1,8);c.fillRect(-3,-8,2,2)}
  const lift=working?Math.sin(t*7)*3:0;c.strokeStyle=clothes.skin;c.beginPath();c.moveTo(3,-13);c.lineTo(8,-11-lift);c.stroke();if(carrying){c.fillStyle='#f5fbff';c.beginPath();c.arc(10,-12-lift,4,0,Math.PI*2);c.fill()}if(tinsel&&garlandSprite.complete&&garlandSprite.naturalWidth)c.drawImage(tinselTexture(tinselColour),5,-15,10,5);c.restore();
 }
 function draw(c,{dt,width,height,bank,active}){
  age+=dt;
  const addScene=near=>{
   const positions=Array.from({length:6},(_,i)=>i).filter(slot=>!scenes.some(s=>s.position===slot));
   positions.sort((a,b)=>Math.abs((a+.5)*width/6-near)-Math.abs((b+.5)*width/6-near));
   const position=positions[0],scene={index:scenes.length,position,x:(position+.5)*width/6,type:pick(SNOW_DROIDS.filter(name=>snowSprites.has(name))),snow:0};
   scene.structure=structure(scene.type);scene.tinselWraps=1+Math.floor(random()*3);scene.tinselPattern=createTinselPattern(random,scene.tinselWraps);scenes.push(scene);return scene;
  };
  if(active&&!started&&snowSprites.size){
   started=true;addScene(0);addScene(width);
   workers=Array.from({length:4},(_,id)=>{const team=Math.floor(id/2),entrySide=team?1:-1;return{id,team,side:id%2?1:-1,entrySide,x:entrySide<0?-18-(id%2)*16:width+18+(id%2)*16,scene:scenes[team],phase:'collect',time:0,load:0,trips:0,clothes:outfit()};});
  }
  for(const s of scenes)s.x=(s.position+.5)*width/6;
  // Keep each pair together and choose the closest unoccupied building spot.
  // Both teams join the sixth job once the first five are complete.
  for(let team=0;team<2;team++){
   const pair=workers.filter(w=>w.team===team);if(!pair.length)continue;
   for(const w of pair)if(w.decoration?.collapsed){w.decoration=null;w.scene=null;w.phase='wait';}
   if(pair.some(w=>w.decoration))continue;
   const undecorated=pair.find(w=>w.scene?.type==='OPTI-POD'&&!w.scene.collapsed&&w.scene.snow>=720&&!w.scene.tinsel&&!workers.some(other=>other.decoration===w.scene));
   if(undecorated){
    const scene=undecorated.scene,runner=pair[0];
    runner.decoration=scene;runner.phase='fetch-tinsel';runner.exitSide=runner.x<width/2?-1:1;runner.time=0;
    for(const w of pair){w.scene=null;if(w!==runner)w.phase='wait';}
    continue;
   }
   if(pair.some(w=>w.scene&&w.scene.snow<720))continue;
   const near=pair.reduce((sum,w)=>sum+w.x,0)/pair.length;
   let available=null;
   const repair=scenes.filter(s=>s.collapsed&&age-s.collapsedAt>4&&bank.surface(s.x)<24).sort((a,b)=>Math.abs(a.x-near)-Math.abs(b.x-near))[0];
   if(repair){
    Object.assign(repair,{collapsed:false,snow:0,footing:null,restDepth:undefined,tinsel:0,type:pick(SNOW_DROIDS.filter(name=>snowSprites.has(name)))});
    repair.structure=structure(repair.type);repair.tinselWraps=1+Math.floor(random()*3);repair.tinselPattern=createTinselPattern(random,repair.tinselWraps);available=repair;
   }
   else if(scenes.length<5)available=addScene(near);
   else if(scenes.length===5&&scenes.every(s=>s.snow>=720&&(s.type!=='OPTI-POD'||s.tinsel>=1))&&!workers.some(w=>w.decoration))available=addScene(near);
   else if(scenes.length===6&&scenes[5].snow<720)available=scenes[5];
   for(const w of pair){
    w.scene=available;w.collect=undefined;w.time=0;
    if(available)w.phase=w.load?'deliver':'collect';
    else if(scenes.length===6&&scenes.every(s=>s.snow>=720)){
     if(w.phase!=='exit')w.exitSide=w.x<width/2?-1:1;
     w.phase='exit';
    }else w.phase='wait';
   }
  }
  for(const w of workers){
   if(w.decoration){
    const scene=w.decoration,away=w.phase==='fetch-tinsel',target=away?(w.exitSide<0?-24:width+24):scene.x+(w.exitSide<0?-21:21),delta=target-w.x;
    if(Math.abs(delta)>1){w.x+=Math.sign(delta)*Math.min(Math.abs(delta),dt*45);w.time=0;}
    else{w.time+=dt;if(away&&w.time>=1){w.phase='bring-tinsel';w.time=0;}
     else if(!away){w.phase='decorate';scene.tinsel=Math.min(1,w.time/(1.8*scene.tinselWraps));if(scene.tinsel>=1){w.decoration=null;w.phase='wait';}}}
    if(w.x>=-12&&w.x<=width+12)person(c,w.x,height-bank.canvas.height+bank.surface(w.x)+2,age+w.id,Math.sign(delta)||-w.exitSide,w.phase==='decorate',false,w.clothes,!away,scene.tinselPattern[Math.min(scene.tinselWraps-1,Math.floor((scene.tinsel||0)*scene.tinselWraps))].colour);
    continue;
   }
   const s=w.scene;
   let collect=0,drop=0;
   if(s){
    // Move to fresh patches instead of digging forever in an empty hole.
    if(w.phase==='collect'&&w.time===0){
     const points=Array.from({length:24},(_,i)=>12+(width-24)*(i+.5)/24).filter(x=>scenes.every(d=>Math.abs(x-d.x)>19));
     points.sort((a,b)=>(bank.surface(a)*12+Math.abs(a-w.x))-(bank.surface(b)*12+Math.abs(b-w.x)));
     if(w.collect===undefined||bank.surface(w.collect)>25)w.collect=points[0]??Math.max(10,Math.min(width-10,s.x+w.side*30));
    }
    collect=w.collect;drop=Math.max(8,Math.min(width-8,s.x+w.side*(21+Math.floor(w.id/2)*5)));
   }
   const target=w.phase==='exit'?(w.exitSide<0?-24:width+24):w.phase==='wait'?w.x:w.phase==='deliver'?drop:collect;
   const delta=target-w.x,moving=Math.abs(delta)>1;
   if(moving){w.x+=Math.sign(delta)*Math.min(Math.abs(delta),dt*45);w.time=0;}
   else if(s){
    w.time+=dt;
    if(w.time>=.8){w.time=0;
     if(w.phase==='collect'){w.load=bank.scoop(collect,24+random()*12);w.trips++;w.collect=undefined;if(w.load>0)w.phase='deliver';}
     else{deliver(s,w.load,w.side);w.load=0;w.phase='collect';}
    }
   }
   const y=height-bank.canvas.height+bank.surface(w.x)+2;
   if(w.x>=-12&&w.x<=width+12)person(c,w.x,y,age+w.id,moving?Math.sign(delta):w.phase==='deliver'?-w.side:w.side,!moving&&!!s,w.load>0,w.clothes);
  }
  for(const s of scenes){
   if(s.collapsed)continue;
   const progress=s.structure.built;
   if(progress&&s.restDepth===undefined){
    const fit=fitSnowFooting(s.structure.feet,bank,s.x);s.restDepth=fit.depth;s.angle=fit.angle;
    s.footXs=fit.contacts.flatMap(p=>[-2,0,2].map(dx=>p.x+dx));
   }
   const floor=(s.footXs||[-8,8]).map(dx=>bank.surface(s.x+dx));
   const y=height-bank.canvas.height+(s.restDepth??Math.max(...floor)+4);
   // A wide lost footing or a deep hole under either foot triggers collapse.
   // Capture the old resting height so it falls into the hole instead of
   // teleporting down before breaking up.
   if(progress&&s.footing){
    const lost=floor.filter((depth,i)=>depth-s.footing[i]>=6).length;
    if(lost>=2){collapse(s,s.groundY??y);continue;}
   }
   if(progress&&!s.footing)s.footing=floor;
   s.groundY=y;
   if(progress>0){c.save();c.translate(s.x,y);c.rotate(s.angle||0);c.beginPath();for(const cell of s.structure.cells)if(cell.built)c.rect(cell.col*2-22,cell.row*2-47,2.1,2.1);c.clip();sculpture(c,s.type);if(s.type==='OPTI-POD'&&s.snow>=720)drawSnowTinsel(c,s.tinsel||0,s.tinselWraps,s.tinselPattern);c.restore();}
  }
  for(const bit of debris){
   bit.delay-=dt;if(bit.delay>0)continue;
   if(!bit.landed){
    bit.vy+=125*dt;bit.x=Math.max(1,Math.min(width-2,bit.x+bit.vx*dt));bit.y+=bit.vy*dt;bit.angle+=bit.spin*dt;
    const floor=height-bank.canvas.height+bank.surface(bit.x);
    if(bit.y+bit.r>=floor){bit.y=floor;bit.landed=true;bank.deposit(bit.x,bit.r);}
   }else bit.fade-=dt*4;
   if(bit.fade>0){c.save();c.globalAlpha=Math.max(0,bit.fade);c.translate(bit.x,bit.y);c.rotate(bit.angle);c.drawImage(bit.image,bit.sx,bit.sy,Math.min(6,44-bit.sx),Math.min(6,48-bit.sy),-3,-3,6,6);c.restore();}
  }
  debris=debris.filter(bit=>bit.fade>0);

 }
 return{draw,reset,get scenes(){return scenes},get workers(){return workers},get debris(){return debris}};
}
