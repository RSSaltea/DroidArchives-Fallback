const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function declaration(prefix){const start=source.indexOf(prefix);assert(start>=0,prefix);return source.slice(start,source.indexOf('\n',start));}
test('Kyber requirements need activation; lower requirements accept dormant Kyber',()=>{
  const state={owned:[]};
  const ctx=vm.createContext({state,rowIsBuilding:row=>row.building===true});
  for(const prefix of ['const ALL_VARIANTS=','const OWNED_VARIANTS=','const baseVariant=','const variantRank=','const isActiveKyber=','const rebirthVariantReady=','function normalizeRebirthTracker(','function bestOwnedVariant(','function hasRequirement(','function profileBestOwnedVariant(','function profileRequirementReady('])vm.runInContext(declaration(prefix),ctx);
  for(const variant of ['KYBER','KYBER_GREEN','KYBER_BLUE','KYBER_PURPLE']){
    for(const required of ['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR','KYBER']){
      state.owned=[{name:'MOUSE',variant,qty:1}];ctx.req={droidName:'MOUSE',variant:required};
      const expected=variant!=='KYBER'||required!=='KYBER';
      assert.equal(vm.runInContext('Boolean(hasRequirement(req))',ctx),expected,`${variant} meets ${required}`);
      assert.equal(vm.runInContext('profileRequirementReady({owned:state.owned},0,1,req)',ctx),expected);
      state.owned[0].building=true;
      assert.equal(vm.runInContext('Boolean(hasRequirement(req))',ctx),false,'unfinished droids do not satisfy a requirement');
    }
  }
  ctx.req={droidName:'MOUSE',variant:'KYBER'};
  for(const variants of [['KYBER','KYBER_GREEN'],['KYBER_GREEN','KYBER'],['KYBER','KYBER_BLUE'],['KYBER','KYBER_PURPLE']]){
    state.owned=variants.map(variant=>({name:'MOUSE',variant,qty:1}));
    assert.equal(vm.runInContext('hasRequirement(req)',ctx),true,'active duplicate must win regardless of order');
    assert.equal(vm.runInContext('profileRequirementReady({owned:state.owned},0,36,req)',ctx),true);
  }
  for(const [entry,expected] of [[{variant:'KYBER'},false],[{variant:'KYBER',complete:true},false],[{variant:'KYBER',kyberActive:true},true],[{variant:'KYBER_BLUE'},true],[{complete:true,kyberActive:true},true]]){
    ctx.profile={rebirthTracker:{notUsingBase:true,entries:{'0:36:MOUSE:KYBER':entry}}};
    assert.equal(vm.runInContext('profileRequirementReady(profile,0,36,req)',ctx),expected,JSON.stringify(entry));
  }
});
