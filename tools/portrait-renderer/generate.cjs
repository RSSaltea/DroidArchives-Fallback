// Generate portraits from local game textures and the shared material reconstruction.
// npm ci --prefix tools
// node tools/portrait-renderer/generate.cjs --manifest <json> --out <directory>
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const args=process.argv.slice(2),arg=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1]};
const manifestPath=path.resolve(root,arg('--manifest','research/uefn/october31/portrait-renderer/manifest.json'));
const output=path.resolve(root,arg('--out','research/uefn/october31/portrait-review/generated'));
const pattern=arg('--crystal','research/uefn/october24/variant-materials/T_Variant_Kyber_Crystal.png');
const variants={GOLD:1,DIAMOND:2,RAINBOW:3,BESKAR:4,GALACTIC:5,STELLAR:6,KYBER:7,KYBER_GREEN:8,KYBER_BLUE:9,KYBER_PURPLE:10,SCOURGE:11};
const requested=arg('--variants','KYBER,KYBER_GREEN,KYBER_BLUE,KYBER_PURPLE,SCOURGE').split(',');
for(const v of requested)if(!(v in variants))throw Error('Unknown variant: '+v);
if(!output.startsWith(root+path.sep))throw Error('Output must be inside the workspace');
const inputRows=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const rows=arg('--name',null)?inputRows.filter(r=>r.name===arg('--name')):inputRows;
if(!rows.length)throw Error('No matching droids');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const localPath=p=>{const file=path.resolve(root,p.replace(/^\//,''));if(!file.startsWith(root+path.sep))throw Error('Texture outside workspace');return file};
for(const row of rows){if(!row.name||!Array.isArray(row.files)||row.files.length<3)throw Error('Invalid manifest row');for(const file of row.files.slice(0,3))fs.accessSync(localPath(file));}fs.accessSync(localPath(pattern));
const server=http.createServer((req,res)=>{let file;try{file=localPath(decodeURIComponent(new URL(req.url,'http://localhost').pathname))}catch{return res.writeHead(403).end()};fs.readFile(file,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(b)})});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 const executablePath=process.env.CHROME_PATH||['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
 browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-unsafe-swiftshader']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const origin='http://127.0.0.1:'+server.address().port;await page.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
 await page.goto(origin+'/tools/portrait-renderer/render.html');await page.waitForFunction(()=>window.ready,{},{timeout:120000});fs.mkdirSync(output,{recursive:true});const records=[],usedTextures=new Set([pattern]);
 const materials='research/uefn/october10/variant-materials/';
 const classicPatterns={GOLD:'TA_Variants_0',DIAMOND:'TA_Variants_0',RAINBOW:'TA_Variants_2',BESKAR:'TA_Variants_3',GALACTIC:'T_Atmosphere_Galactic_Wide',STELLAR:'T_Variant_Stellar_Clouds2'};
 for(const row of rows){for(const v of requested){
  const texture=classicPatterns[v]?materials+classicPatterns[v]+'.png':pattern;
  usedTextures.add(texture);if(classicPatterns[v])usedTextures.add(materials+'TA_Variants_5.png');
  const files=[...row.files.slice(0,3),'/'+texture.replace(/^\//,''),'/'+(classicPatterns[v]?materials+'TA_Variants_5.png':pattern).replace(/^\//,'')];
  const png=await page.evaluate(args=>window.renderPortrait(args),{files,variant:variants[v]});const bytes=Buffer.from(png.split(',')[1],'base64');if(bytes.readUInt32BE(16)!==512||bytes.readUInt32BE(20)!==512||bytes[25]!==6)throw Error('Invalid RGBA portrait');
  const name=row.name.replace(/[^A-Za-z0-9-]/g,'_')+'_'+v+'.png';fs.writeFileSync(path.join(output,name),bytes);records.push({name:row.name,variant:v,file:name,sha256:hash(bytes)});
 }process.stdout.write('.');}
 if(errors.length)throw Error(errors.join('\n'));
 const report={renderer:'local calibrated material reconstruction',requiresReferenceImages:false,calibrationReference:'user-supplied portrait pack, used only for material calibration',materialHashes:Object.fromEntries(['scourge-calibration.json','kyber-calibration.json','classic-calibration.json'].map(f=>[f,hash(fs.readFileSync(path.join(__dirname,f)))])),inputHashes:Object.fromEntries([...new Set([...usedTextures,...rows.flatMap(r=>r.files.slice(0,3))])].map(f=>[f,hash(fs.readFileSync(localPath(f)))])),manifestSha256:hash(fs.readFileSync(manifestPath)),shaderSha256:hash(fs.readFileSync(path.join(__dirname,'render.js'))),records};
 const reportPath=path.resolve(root,arg('--report','research/uefn/october31/portrait-review/generation.json'));fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.log('\nGenerated '+records.length+' portraits using only local game inputs.');
}finally{await browser?.close();server.close()}})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
