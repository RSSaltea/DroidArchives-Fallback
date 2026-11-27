import { workingIncome } from './economy.js?v=2026-11-17-hive-income';
import { hiveMembership } from './scourge.js?v=2026-11-08-shared';
import { iconicProtocolBonus } from './droid-rules.js?v=2026-11-26-yellow-charge';

// Compile the fixed inputs once per layout search. Candidate scoring needs
// numbers only; building UI income breakdowns here made Iconic comparisons
// take longer than the entire worker budget.
export function createAssignmentScorer({units,slots,locked,regions,multiplier,lambda,craftSeconds,craftBaseSpeed,craftingPriority,permanentMembers=0}) {
  const fixedCredits=regions.map(()=>1),fixedCraft=regions.map(()=>0),fixedWork=[];
  let fixedBase=0;
  for(const unit of locked){
    if(unit.region>=0){fixedWork.push(unit);if(!unit.iconic)fixedBase+=unit.base;}
    if(unit.creditRegion>=0)fixedCredits[unit.creditRegion]=1+unit.creditBonus;
    if(unit.craftRegion>=0)fixedCraft[unit.craftRegion]=unit.craftBonus;
  }
  const costs=slots.map(slot=>units.map(unit=>unit.station!==slot.station&&unit.movingCosts?1:0));
  return assignment=>{
    let base=fixedBase,moveCost=0;
    const hiveSlot=slot=>slot.region>=0||slot.creditRegion>=0||slot.craftRegion>=0;
    const hiveUnits=locked.map(u=>({...u,stationed:!['COMPANION','BUILD','FUSION_BUILD','BLUEPRINT_STORAGE'].includes(u.station)}));
    const credits=[...fixedCredits],craft=[...fixedCraft],income=regions.map(()=>0);
    for(let i=0;i<assignment.length;i++){
      const index=assignment[i];if(index<0)continue;
      const unit=units[index],slot=slots[i];
      hiveUnits.push({...unit,...slot,stationed:!['COMPANION','BUILD','FUSION_BUILD','BLUEPRINT_STORAGE'].includes(slot.station)});
      if(slot.region>=0&&!unit.iconic)base+=unit.base;
      if(slot.creditRegion>=0)credits[slot.creditRegion]=1+unit.creditBonus;
      if(slot.craftRegion>=0)craft[slot.craftRegion]=unit.craftBonus;
      moveCost+=costs[i][index];
    }
    let bestCredit=0,bestCraft=0;
    for(const unit of hiveUnits)if(!unit.iconic){
      if(unit.creditRegion>=0)bestCredit=Math.max(bestCredit,unit.creditBonus);
      if(unit.craftRegion>=0)bestCraft=Math.max(bestCraft,unit.craftBonus);
    }
    for(const unit of hiveUnits)if(unit.iconic){
      if(unit.creditRegion>=0)credits[unit.creditRegion]=1+iconicProtocolBonus(unit.creditBonus,bestCredit);
      if(unit.craftRegion>=0)craft[unit.craftRegion]=iconicProtocolBonus(unit.craftBonus,bestCraft);
    }
    const membership=hiveMembership(hiveUnits,permanentMembers);
    const rate=(unit,region)=>workingIncome({base:unit.base,dynamicPercent:unit.dynamic,staticIncome:base,traitBonus:unit.traitBonus||0,matching:unit.type===regions[region],multiplier,hiveBonus:membership.bonusFor({...unit,region})}).total;
    for(const unit of fixedWork)income[unit.region]+=rate(unit,unit.region);
    for(let i=0;i<assignment.length;i++)if(assignment[i]>=0&&slots[i].region>=0)income[slots[i].region]+=rate(units[assignment[i]],slots[i].region);
    const total=income.reduce((sum,value,i)=>sum+value*credits[i],0)-lambda*moveCost;
    const craftTotal=craft.reduce((sum,value)=>sum+value,0);
    const saved=craftSeconds.reduce((sum,seconds,i)=>sum+seconds/craftBaseSpeed-seconds/(craftBaseSpeed+craft[i]),0);
    return craftingPriority?[craftTotal,saved,total]:[total,craftTotal,saved];
  };
}
