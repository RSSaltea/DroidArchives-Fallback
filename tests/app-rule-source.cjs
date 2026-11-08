// Legacy declaration-level tests read the production declarations from both sources.
// New feature tests should import the public modules directly instead.
const fs=require('node:fs'),path=require('node:path');
module.exports=()=>fs.readFileSync(path.join(__dirname,'../app.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../droid-rules.js'),'utf8').replace(/^export /gm,'');
