const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
test('isolated worker planner matches the current application source',()=>{
 const root=path.resolve(__dirname,'..');
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/\r\n/g,'\n');
 const generated=fs.readFileSync(path.join(root,'optimise-layout-context.js'),'utf8');
 const hash=crypto.createHash('sha256').update(app).digest('hex');
 assert.equal(generated.match(/app.js SHA256: ([a-f0-9]+)/)?.[1],hash,'Regenerate with node tools/build-optimise-layout.cjs after editing app.js');
});
