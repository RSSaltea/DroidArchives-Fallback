const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const droids=JSON.parse(fs.readFileSync('data/droids.json','utf8'));
test('all seven new regular droids have distinct, complete PNG artwork for all eleven forms',()=>{
 for(const name of ['EG-58','EGL','KT','MPH','JO9-4MN','PLNK','ECG']){
  const d=droids.find(d=>d.name===name),hashes=new Set();
  assert.equal(Object.keys(d.portraits).length,11);
  for(const variant of Object.keys(d.variants)){
   const image=fs.readFileSync(d.portraits[variant]);assert.equal(image.subarray(1,4).toString(),'PNG');
   assert.equal(image.readUInt32BE(16),512);assert.equal(image.readUInt32BE(20),512);assert.equal(image[25],6,'Portrait must retain RGBA transparency');
   hashes.add(crypto.createHash('sha256').update(image).digest('hex'));
  }
  assert.equal(hashes.size,11,`${name}: no quality should reuse the Default image`);
 }
 assert.deepEqual(Object.keys(droids.find(d=>d.name==='WG-22').portraits),['DEFAULT']);
});
