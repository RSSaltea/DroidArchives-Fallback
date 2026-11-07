export function groupTradeSettings(value={}) {
  return {enabled:value?.enabled!==false,allowWorking:value?.allowWorking===true,
    maxLossPercent:Math.max(0,Math.min(100,Number(value?.maxLossPercent)||0))};
}
export const groupCopyKey=unit=>`${unit.source}:${unit.unit}`;

// The caller supplies resolved placements and the game's rebirth/quality rules.
// Allocation is global across shared groups: one copy cannot be promised twice.
export function findGroupTrades(profiles,{names,rank,ready,blocked,working,loss}) {
  const matches=[],received=new Map(),used=new Map(),reserved=new Map();
  for(const profile of profiles){
    const keep=new Map(),needed=new Set(profile.needs.map(req=>req.droidName));
    for(const unit of profile.units)if(!unit.building)for(const name of names(unit.name))if(needed.has(name)){
      const previous=keep.get(name);
      if(!previous||rank(unit.variant)>rank(previous.variant)||
        (rank(unit.variant)===rank(previous.variant)&&working(unit)&&!working(previous)))keep.set(name,unit);
    }
    reserved.set(profile.key,new Set([...keep.values()].map(groupCopyKey)));
    used.set(profile.key,new Set());received.set(profile.key,[]);
  }
  const requests=profiles.flatMap(profile=>profile.needs.filter(req=>!profile.ready(req)).map(req=>({profile,req})))
    .sort((a,b)=>a.req.at-b.req.at||rank(b.req.variant)-rank(a.req.variant)||a.profile.key.localeCompare(b.profile.key));
  for(const {profile:recipient,req} of requests){
    if(received.get(recipient.key).some(unit=>names(unit.name).includes(req.droidName)&&ready(unit.variant,req.variant)))continue;
    const candidates=[];
    for(const donor of profiles){
      const settings=groupTradeSettings(donor.settings);
      if(!settings.enabled||donor.ownerId===recipient.ownerId||!donor.groups.some(id=>recipient.groups.includes(id)))continue;
      for(const unit of donor.units){
        const key=groupCopyKey(unit);
        if(reserved.get(donor.key).has(key)||used.get(donor.key).has(key)||blocked(unit,donor)||
          !names(unit.name).includes(req.droidName)||!ready(unit.variant,req.variant)||(!settings.allowWorking&&working(unit)))continue;
        const impact=loss(donor,new Set([...used.get(donor.key),key]));
        if(impact.percent>settings.maxLossPercent+1e-8)continue;
        candidates.push({donor,recipient,unit,req,impact});
      }
    }
    candidates.sort((a,b)=>Number(working(a.unit))-Number(working(b.unit))||a.impact.percent-b.impact.percent||
      rank(a.unit.variant)-rank(b.unit.variant)||a.donor.key.localeCompare(b.donor.key)||a.unit.source-b.unit.source||a.unit.unit-b.unit.unit);
    const match=candidates[0];if(!match)continue;
    used.get(match.donor.key).add(groupCopyKey(match.unit));received.get(recipient.key).push(match.unit);matches.push(match);
  }
  return matches;
}
