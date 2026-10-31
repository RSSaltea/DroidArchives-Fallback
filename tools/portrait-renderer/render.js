// Local static material reconstruction from exported game textures.
// Global normal-response curves are calibrated against supplied reference renders.
// This is not the original Unreal shader and is not a pixel-exact reproduction.
const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true});
const vertex=`attribute vec2 p;varying vec2 uv;void main(){uv=(p+1.)*.5;gl_Position=vec4(p,0.,1.);}`;
// Compact material-response calibration. The coefficients are global, never per droid.
const toon=await(await fetch(new URL('./scourge-calibration.json',import.meta.url))).json();
const crystal=await(await fetch(new URL('./kyber-calibration.json',import.meta.url))).json();
const classic=await(await fetch(new URL('./classic-calibration.json',import.meta.url))).json();
const product=(name,powers)=>powers.flatMap((count,i)=>Array(count).fill(name+'.'+'xyz'[i])).join('*')||'1.0';
const polynomial=(model,name)=>model.powers.map((p,i)=>`(${model.coefficients[i].toFixed(9)}*${product(name,p)})`);
const toonCode=polynomial(toon,'n').join('+');
const terms=polynomial(crystal,'n');let ci=crystal.powers.length;
for(let i=0;i<3;i++)terms.push(`(${crystal.coefficients[ci++].toFixed(9)}*t.${'xyz'[i]})`);
for(let i=0;i<3;i++)for(let j=i;j<3;j++)terms.push(`(${crystal.coefficients[ci++].toFixed(9)}*t.${'xyz'[i]}*t.${'xyz'[j]})`);
for(let i=0;i<3;i++)for(let j=0;j<3;j++)terms.push(`(${crystal.coefficients[ci++].toFixed(9)}*n.${'xyz'[i]}*t.${'xyz'[j]})`);
const classicVariants=['GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR'];
const classicCode=classicVariants.map((v,i)=>`if(variant==${i+1})return ${classic.powers.map((p,j)=>`vec3(${classic.models[v][j].map(x=>x.toFixed(9)).join(',')})*(${product('n',p)})`).join('+')};`).join('\n');
const fragment=`precision highp float;
varying vec2 uv;uniform sampler2D baseTex,maskTex,normalTex,patternTex,starsTex;uniform int variant;
vec3 classicResponse(vec3 n){${classicCode}return vec3(0.);}
float toonResponse(vec3 n){return ${toonCode};}
float crystalResponse(vec3 n,vec3 t){return ${terms.join("+")};}
vec3 ramp(float x,vec3 low,vec3 mid,vec3 high){return x<.55?mix(low,mid,x/.55):mix(mid,high,(x-.55)/.45);}
void main(){
 vec2 q=vec2(uv.x,1.-uv.y);vec4 base=texture2D(baseTex,q);if(base.a<.005){gl_FragColor=vec4(0.);return;}
 vec3 mask=texture2D(maskTex,q).rgb,n=texture2D(normalTex,q).rgb*2.-1.;
 float l=dot(base.rgb,vec3(.2126,.7152,.0722));float shade=clamp(l*.7+.18+max(0.,dot(n,normalize(vec3(-.3,.5,.8))))*.3,0.,1.);
 float sheen=pow(max(0.,dot(normalize(n),normalize(vec3(-.3,.5,.8)))),18.);
 vec3 c=base.rgb;vec3 pattern=texture2D(patternTex,fract(q*2.+n.xy*.045)).rgb;
 // Surface detail comes from the exported object-space normals, not a flat colour filter.
 if(variant==0){
  c=base.rgb;
  if(base.a<.95&&c.g>c.r*1.3&&c.g>c.b*1.3)c.g=max(c.r,c.b);
 }else if(variant>=1&&variant<=6){
  vec3 surface=clamp(classicResponse(n),0.,1.);
  vec3 detail=texture2D(patternTex,fract(q+n.xy*.06)).rgb;
  float glint=pow(max(0.,dot(normalize(n),normalize(vec3(-.5,.2,.8)))),32.);
  if(variant==1||variant==2){surface*=.82+.36*dot(detail,vec3(.333));surface+=glint*.20;}
  if(variant==3){surface=texture2D(patternTex,vec2(fract(q.x*.55+q.y*.4+n.x*.18),.5)).rgb*(.35+.85*shade)+glint*.45;}
  if(variant==4)surface*=.65+.65*detail.r;
  if(variant==6)surface*=.65+.6*detail.r;
  if(variant==5||variant==6)surface+=texture2D(starsTex,fract(q*1.6+n.xy*.035)).rgb*(variant==5?vec3(.8):vec3(1.,.7,.3));
  c=mix(base.rgb,clamp(surface,0.,1.),mask.g);
  // Extracted base textures contain a green matte on antialiased edges.
  // Despill only those edge pixels; retain opaque material colours and alpha.
  if(base.a<.95&&c.g>c.r*1.3&&c.g>c.b*1.3)c.g=max(c.r,c.b);
 }else if(variant==11){
  float band=smoothstep(-.15,.15,toonResponse(n));
  c=mix(vec3(.050,.018,.073)*(.35+.65*(1.-q.y)),vec3(.269,.173,.320),band);
  float edge=clamp(base.a-texture2D(baseTex,q-vec2(1.5/512.)).a,0.,1.);
  c=mix(c,vec3(.76,.25,.85),edge);
  // Current game portrait masks encode emissive eyes in blue. Base highlights
  // are reflections, not lamps, and must not become white Scourge scratches.
  c=mix(c,vec3(1.),mask.b);
 }else{
  vec3 detail=texture2D(patternTex,fract(q*1.2+.3)).rgb*2.-1.;
  float radiance=clamp(${crystal.toneGain.toFixed(6)}*.65*pow(max(exp(crystalResponse(n,detail))-.04,.001)/.65,${crystal.toneGamma.toFixed(6)}),.02,3.84);
  // Reference-calibrated display colours; these are not claimed to be Unreal linear values.
  c=variant==8?vec3(.134,1.,0.)*radiance:variant==9?vec3(0.,.636,1.)*radiance*1.736:vec3(.519,.075,1.)*radiance*2.027;
  if(variant==7)c=vec3(.34+.45*clamp(radiance,0.,1.));
 }
 gl_FragColor=vec4(c,base.a);
}`;
function shader(type,text){const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
const cache=new Map();async function texture(file){if(cache.has(file))return cache.get(file);const im=new Image();im.src=file;await im.decode();const previous=gl.getParameter(gl.TEXTURE_BINDING_2D),t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.bindTexture(gl.TEXTURE_2D,previous);cache.set(file,t);return t;}
window.renderPortrait=async({files,variant})=>{
 for(const [i,key] of ['baseTex','maskTex','normalTex','patternTex','starsTex'].entries()){const t=await texture(files[i]);gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(gl.getUniformLocation(program,key),i);}
 gl.uniform1i(gl.getUniformLocation(program,'variant'),variant);gl.drawArrays(gl.TRIANGLES,0,6);return canvas.toDataURL('image/png');
};window.ready=true;
