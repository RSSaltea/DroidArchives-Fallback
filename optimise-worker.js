import { planOptimiseRoute, shortenOptimiseWalk, optimiseWalkDistance } from './optimise-route.js?v=2026-09-28-iconic-purchases';
import { validateOptimisePlan } from './optimise-plan-validation.js?v=2026-09-28-iconic-purchases';
import { workerRules } from './optimise-worker-rules.js?v=2026-09-28-iconic-purchases';

const less = (a, b) => { for (let i=0;i<a.length;i++) if(a[i]!==b[i]) return a[i]<b[i]; return false; };
self.onmessage = ({data:{id,snapshot}}) => {
  try {
    const rules = workerRules(snapshot.rules);
    let best = null;
    for (const beamWidth of [4,24,64,128,192]) {
      for (let index=0;index<snapshot.targets.length;index++) {
        if (best && index > best[0]) break;
        const target = snapshot.targets[index];
        const route = planOptimiseRoute({initial:snapshot.initial,target,rules,options:{beamWidth,firstComplete:true}});
        if (!route.complete) continue;
        const projected = {placed:route.finalPlaced,overflow:target.overflow || [],sell:target.sell || [],returns:target.returns || []};
        const valid = steps => validateOptimisePlan({initial:snapshot.initial,projected,steps,rules}).ok;
        if (!valid(route.steps)) continue;
        // Offer the verified walk before spending the remaining budget shortening it.
        // A dense base must not lose a usable route when that refinement times out.
        route.travelDistance=optimiseWalkDistance(route.steps,rules);
        Object.assign(route,shortenOptimiseWalk(route.steps,{distance:rules.distance,slotDistanceSquared:rules.slotDistanceSquared,isValid:valid,withinOnly:true,maxPasses:2}));
        const cantinaTrips=()=>new Set(route.steps.filter(step=>step.at==='ICONIC_SHOP').map(step=>step.visit)).size;
        const firstRank = [index,route.later.length,cantinaTrips(),route.commands,route.assumed,route.travelDistance,route.stops];
        if (!best || less(firstRank,best)) { best=firstRank; self.postMessage({id,type:'result',index,route,beamWidth}); }
        const shorter = shortenOptimiseWalk(route.steps,{distance:rules.distance,slotDistanceSquared:rules.slotDistanceSquared,isValid:valid});
        Object.assign(route,shorter);
        const rank = [index,route.later.length,cantinaTrips(),route.commands,route.assumed,route.travelDistance,route.stops];
        if (!best || less(rank,best)) { best=rank; self.postMessage({id,type:'result',index,route,beamWidth}); }
      }
    }
    self.postMessage({id,type:'done'});
  } catch { self.postMessage({id,type:'error'}); }
};
