import { novaTotalCost } from './nova-levels.js?v=2026-10-07-unlimited';

// Enumerate Chance and Multi Crit. For each pair, the highest affordable
// Amount is optimal because damage increases monotonically with Amount.
// This compares complete plans, rather than repeatedly picking one rank.
export function suggestCritBudget({budget,owned,upgrades,score,multiRequiresChance=4}) {
  budget=Number.isFinite(Number(budget))?Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(Number(budget)))):0;
  const choices=key=>{
    const upgrade=upgrades[key],start=owned[key],base=novaTotalCost(upgrade,start);
    const cap=Math.max(start,upgrade.uncapped?10000:upgrade.levels.length);
    const rows=[{level:start,cost:0}];
    for(let level=start+1;level<=cap;level++){
      const cost=novaTotalCost(upgrade,level)-base;
      if(cost>budget)break;
      rows.push({level,cost});
    }
    return rows;
  };
  const chances=choices('chance'),amounts=choices('amount'),multis=choices('multi');
  let best={levels:{...owned},cost:0,score:score(owned)};
  for(const chance of chances)for(const multi of multis){
    if(multi.level>owned.multi&&chance.level<multiRequiresChance)continue;
    const remaining=budget-chance.cost-multi.cost;
    if(remaining<0)continue;
    let lo=0,hi=amounts.length-1;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(amounts[mid].cost<=remaining)lo=mid;else hi=mid-1;}
    const levels={chance:chance.level,amount:amounts[lo].level,multi:multi.level};
    const value=score(levels);
    // On a flat damage plateau, retain the cheapest Amount giving that score.
    let first=0,last=lo;
    while(first<last){const mid=Math.floor((first+last)/2);if(score({...levels,amount:amounts[mid].level})>=value)last=mid;else first=mid+1;}
    levels.amount=amounts[first].level;
    const cost=chance.cost+multi.cost+amounts[first].cost;
    if(value>best.score||value===best.score&&cost<best.cost)best={levels,cost,score:value};
  }
  return {...best,remaining:budget-best.cost};
}
