const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
test('every eligible droid has five distinct transparent Kyber/Scourge portraits',()=>{
 const droids=JSON.parse(fs.readFileSync('data/droids.json','utf8')).filter(d=>d.rarity!=='ICONIC');assert.equal(droids.length,90);
 for(const d of droids){const hashes=new Set();for(const v of ['KYBER','KYBER_GREEN','KYBER_BLUE','KYBER_PURPLE','SCOURGE']){
  assert(d.portraits[v]?.startsWith('assets/droids/rendered-v3/'),d.name+' '+v);
  const b=fs.readFileSync(d.portraits[v]);assert.equal(b.subarray(1,4).toString(),'PNG');assert.equal(b.readUInt32BE(16),512);assert.equal(b.readUInt32BE(20),512);assert.equal(b[25],6);
  hashes.add(crypto.createHash('sha256').update(b).digest('hex'));
 }assert.equal(hashes.size,5,d.name+' variants must not share a placeholder');}
});

test('the entire catalogue has freshly rendered portraits for every supported form',()=>{
 const droids=JSON.parse(fs.readFileSync('data/droids.json','utf8'));let count=0;
 for(const d of droids){const variants=d.rarity==='ICONIC'?['DEFAULT']:Object.keys(d.variants),hashes=new Set();
  assert.deepEqual(Object.keys(d.portraits),variants);
  for(const variant of variants){const file=d.portraits[variant];assert(file.startsWith('assets/droids/rendered-v3/'));const b=fs.readFileSync(file);assert.equal(b.readUInt32BE(16),512);assert.equal(b.readUInt32BE(20),512);assert.equal(b[25],6);hashes.add(crypto.createHash('sha256').update(b).digest('hex'));count++;}
  assert.equal(hashes.size,variants.length,d.name+' must have distinct variants');
 }assert.equal(count,1091);
});
