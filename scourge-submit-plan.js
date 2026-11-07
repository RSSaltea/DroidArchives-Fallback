import {planOptimiseRoute,shortenOptimiseWalk} from './optimise-route.js?v=2026-11-07-scourge-fusion';
import {validateOptimisePlan} from './optimise-plan-validation.js?v=2026-11-07-scourge-fusion';

// This target deliberately bypasses the income, shopping and fusion allocators.
export function planScourgeSubmissions(initial,rules){
  const key=u=>`${u.source}:${u.unit}`;
  const submissions=initial.placed.filter(u=>u.variant==='SCOURGE'&&rules.canSubmit(u));
  const consumed=new Set(submissions.map(key));
  const pending=[...initial.placed,...(initial.overflow||[])].filter(u=>u.variant==='SCOURGE'&&!consumed.has(key(u)));
  const projected={placed:initial.placed.filter(u=>!consumed.has(key(u))).map(u=>({...u})),overflow:[...(initial.overflow||[])],submissions,sell:[],returns:[],fusions:[],fusing:[],fusionResults:[],later:[]};
  const route=planOptimiseRoute({initial,target:projected,rules});
  // Keep actual landings from the replay, including any temporary Lounge clearing.
  if(route.complete)projected.placed=route.finalPlaced;
  const shorter=route.complete?shortenOptimiseWalk(route.steps,{distance:rules.distance,slotDistanceSquared:rules.slotDistanceSquared,isValid:steps=>validateOptimisePlan({initial,projected,steps,rules}).ok}):route;
  const validation=validateOptimisePlan({initial,projected,steps:shorter.steps,rules});
  projected.planComplete=route.complete&&validation.ok;
  projected.planIssues=[...route.issues,...validation.issues];
  return {projected,steps:shorter.steps,pending};
}
