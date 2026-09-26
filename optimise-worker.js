import { planOptimiseRoute, shortenOptimiseWalk } from './optimise-route.js?v=2026-09-23-background';
import { validateOptimisePlan } from './optimise-plan-validation.js?v=2026-09-23-background';
import { workerRules } from './optimise-worker-rules.js?v=2026-09-26-slot-order';

const less = (a, b) => { for (let i=0;i<a.length;i++) if(a[i]!==b[i]) return a[i]<b[i]; return false; };
self.onmessage = ({data:{id,snapshot}}) => {
  try {
    const rules = workerRules(snapshot.rules);
    let best = null;
    for (const beamWidth of [24,64,128,192]) {
      for (let index=0;index<snapshot.targets.length;index++) {
        if (best && index > best[0]) break;
        const target = snapshot.targets[index];
        const route = planOptimiseRoute({initial:snapshot.initial,target,rules,options:{beamWidth}});
        if (!route.complete) continue;
        const projected = {placed:route.finalPlaced,overflow:target.overflow || [],sell:target.sell || []};
        const valid = steps => validateOptimisePlan({initial:snapshot.initial,projected,steps,rules}).ok;
        if (!valid(route.steps)) continue;
        const shorter = shortenOptimiseWalk(route.steps,{distance:rules.distance,isValid:valid});
        Object.assign(route,shorter);
        const rank = [index,route.later.length,route.stops,route.commands,route.assumed,route.travelDistance];
        if (!best || less(rank,best)) { best=rank; self.postMessage({id,type:'result',index,route,beamWidth}); }
      }
    }
    self.postMessage({id,type:'done'});
  } catch { self.postMessage({id,type:'error'}); }
};
