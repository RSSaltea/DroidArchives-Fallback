import {isIconic,rawProtocolBonus,placedProtocolBonus} from './droid-rules.js?v=2026-11-27-protocol';

// At most three open regional slots. Within each kind, a weaker raw bonus
// cannot improve this credit-only comparison. Check the top N of each kind
// together so a supporting non-Iconic is never dropped for a fixed-value Iconic.
export function bestProtocolCredits({pool,open,fixed=[],regions,droids}){
  const count=open.length;
  const candidates=[false,true].flatMap(iconic=>pool.filter(u=>Boolean(isIconic(droids.find(d=>d.name===u.name)))===iconic)
    .sort((a,b)=>rawProtocolBonus(droids.find(d=>d.name===b.name),b.variant,'CREDITS')-rawProtocolBonus(droids.find(d=>d.name===a.name),a.variant,'CREDITS')).slice(0,count));
  let best={income:-Infinity,placed:fixed};
  const evaluate=chosen=>{
    let placed=[...fixed,...chosen.map((u,i)=>({...u,station:`PROTOCOL_${open[i]}_CREDITS`,slot:0}))];
    const value=u=>placedProtocolBonus(droids.find(d=>d.name===u.name),u.variant,'CREDITS',placed,droids);
    const ordered=placed.slice(fixed.length).sort((a,b)=>value(b)-value(a));
    placed=[...fixed,...ordered.map((u,i)=>({...u,station:`PROTOCOL_${open[i]}_CREDITS`}))];
    const income=Object.entries(regions).reduce((sum,[region,row])=>{
      const u=placed.find(u=>u.station===`PROTOCOL_${region}_CREDITS`);
      return sum+row.beforeBonus*(1+(u?value(u):0)/100);
    },0);
    if(income>best.income)best={income,placed};
  };
  const choose=(picked,start)=>{
    if(picked.length===Math.min(count,candidates.length)){evaluate(picked);return;}
    for(let i=start;i<candidates.length;i++)choose([...picked,candidates[i]],i+1);
  };
  choose([],0);return best;
}
