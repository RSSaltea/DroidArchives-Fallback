const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function declaration(prefix){const start=source.indexOf(prefix);assert(start>=0,prefix);return source.slice(start,source.indexOf('\n',start));}
test('all Kyber forms meet every lower-tier requirement in Base and shared profiles',()=>{
  const state={owned:[]};
  const ctx=vm.createContext({state,rowIsBuilding:row=>row.building===true});
  for(const prefix of ['const ALL_VARIANTS=','const OWNED_VARIANTS=','const baseVariant=','const variantRank=','function normalizeRebirthTracker(','function bestOwnedVariant(','function hasRequirement(','function profileBestOwnedVariant(','function profileRequirementReady('])vm.runInContext(declaration(prefix),ctx);
  for(const variant of ['KYBER','KYBER_GREEN','KYBER_BLUE','KYBER_PURPLE']){
    for(const required of ['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR','KYBER']){
      state.owned=[{name:'MOUSE',variant,qty:1}];ctx.req={droidName:'MOUSE',variant:required};
      assert.equal(vm.runInContext('Boolean(hasRequirement(req))',ctx),true,`${variant} meets ${required}`);
      assert.equal(vm.runInContext('profileRequirementReady({owned:state.owned},0,1,req)',ctx),true);
      state.owned[0].building=true;
      assert.equal(vm.runInContext('Boolean(hasRequirement(req))',ctx),false,'unfinished droids do not satisfy a requirement');
    }
  }
});
