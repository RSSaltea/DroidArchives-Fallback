// Never drop saved copies just because this browser has an older catalogue.
export async function ensureProfileCatalogue(data,{droids,refresh,canonicalName=name=>name}={}){
  const names=[...new Set(['owned','blueprints','droidex'].flatMap(key=>Array.isArray(data?.[key])?data[key].map(row=>canonicalName(row?.name)).filter(Boolean):[]))];
  const missing=list=>names.filter(name=>!list.some(d=>d.name===name));
  if(!missing(droids).length)return droids;
  let fresh;
  try{fresh=await refresh();}catch{throw Error('Signed in, but the latest droid catalogue could not be loaded. Your cloud save has not been changed. Check your connection and try again.');}
  if(!Array.isArray(fresh)||missing(fresh).length)throw Error('Signed in, but this version cannot read every droid in your profile. Your cloud save has not been changed. Refresh the site and try again.');
  return fresh;
}
