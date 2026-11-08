// Blueprint rarity is rounded from equipped non-Iconic rarity IDs.
// Lounge and Protocol stations are excluded; Mythic's ID is 5, not 4.
export const BLUEPRINT_RARITIES = ['COMMON','RARE','EPIC','LEGENDARY','MYTHIC'];
export const BLUEPRINT_POINTS = {COMMON:0,RARE:1,EPIC:2,LEGENDARY:3,MYTHIC:5};
const work = ['WORKER','ASTROMECH','BATTLE','UPGRADE_CHIP'];
export const blueprintCounted = unit => Object.hasOwn(BLUEPRINT_POINTS,unit.rarity) && Boolean(unit.station) && unit.station!=='LOUNGE' && !unit.station.startsWith('PROTOCOL');
export function blueprintSummary(units){
  const included=units.filter(blueprintCounted),count=included.length;
  const points=included.reduce((sum,u)=>sum+BLUEPRINT_POINTS[u.rarity],0),average=count?points/count:0;
  return {count,points,average,rarity:BLUEPRINT_RARITIES[Math.min(3,Math.floor(average+.5))],included};
}
export function blueprintBand(rarity){
  const rank=BLUEPRINT_RARITIES.indexOf(rarity);
  return rank>=0&&rank<=3?{min:Math.max(0,rank-.5),max:rank===3?Infinity:rank+.5}:null;
}
export function blueprintGoal(scrap,mission){
  if(scrap&&mission&&scrap!==mission)return {error:'Scrap and Missions use the same rarity average. Choose the same target to receive that rarity from both at once.'};
  const rarity=scrap||mission,band=blueprintBand(rarity);
  return band?{rarity,...band}:{error:'These blueprint rewards currently cap at Legendary. Raising your Base cannot target Mythic from these sources.'};
}
export function blueprintCounts(counts){
  let count=0,points=0;
  for(const r of BLUEPRINT_RARITIES){const n=Math.max(0,Math.min(500,Math.floor(Number(counts[r])||0)));count+=n;points+=n*BLUEPRINT_POINTS[r];}
  const average=count?points/count:0;
  return {count,points,average,rarity:BLUEPRINT_RARITIES[Math.min(3,Math.floor(average+.5))]};
}
const distance=(summary,goal)=>summary.average<goal.min?goal.min-summary.average:summary.average>=goal.max?summary.average-goal.max+.00001:0;
// Search target arrangements, never issue in-game commands or modify the save.
// Every candidate preserves physical copies, storage space and locked slots.
export function* blueprintSearch({units,slots,goal,canUse=()=>true,requireMission=false,maxDepth=units.length+1,beamWidth=24}){
  if(goal.error)return {status:'unavailable',message:goal.error};
  const initial=units.map(u=>({...u})),start=blueprintSummary(initial);
  const missionPresent=list=>!requireMission||list.some(u=>u.station==='ASTROMECH'&&[0,2,4,6,8].includes(u.slot)&&u.built!==false&&u.missionBlueprint!==false);
  if(!missionPresent(initial))return {status:'mission',message:'Record a finished droid on a normal Astromech mission first. CB-23’s special mission awards chips and Nova, not blueprints.'};
  if(start.rarity===goal.rarity)return {status:'ready',units:initial,steps:[],summary:start};
  const movable=u=>!u.lockedSlot&&!u.lockedCompanion&&!u.protected&&u.built!==false;
  const key=list=>list.map(u=>`${u.station}:${u.slot}`).join('|');
  const seen=new Set([key(initial)]);let beam=[{units:initial,steps:[],summary:start}];
  for(let depth=0;depth<maxDepth&&beam.length;depth++){
    const next=[];
    for(const node of beam){
      const list=node.units,occupied=new Set(list.map(u=>`${u.station}:${u.slot}`));
      // One representative per rarity/type/room keeps large Bases responsive.
      const representatives=predicate=>{
        const groups=new Map();
        list.forEach((u,i)=>{if(!predicate(u))return;const k=`${u.rarity}|${u.type}|${u.station}`;if(!groups.has(k))groups.set(k,i)});
        return [...groups.values()];
      };
      const active=representatives(u=>blueprintCounted(u)&&work.includes(u.station)&&movable(u));
      const stored=representatives(u=>u.station==='LOUNGE'&&Object.hasOwn(BLUEPRINT_POINTS,u.rarity)&&movable(u));
      const empty=slots.filter(s=>!occupied.has(`${s.station}:${s.slot}`));
      const offer=(a,b,to)=>{
        const copy=list.map(u=>({...u})),from={station:copy[a].station,slot:copy[a].slot};
        Object.assign(copy[a],to);
        if(b!==null)Object.assign(copy[b],from);
        if(!missionPresent(copy))return;
        const signature=key(copy);if(seen.has(signature))return;seen.add(signature);
        const summary=blueprintSummary(copy);
        next.push({units:copy,summary,steps:[...node.steps,{unit:list[a],other:b===null?null:list[b],from,to}]});
      };
      for(const a of active){
        const lounge=empty.find(s=>s.station==='LOUNGE');if(lounge)offer(a,null,lounge);
        for(const b of stored)if(list[a].rarity!==list[b].rarity&&canUse(list[b],list[a].station))offer(a,b,{station:list[b].station,slot:list[b].slot});
      }
      for(const b of stored){
        for(const station of work){const to=empty.find(s=>s.station===station&&canUse(list[b],station));if(to)offer(b,null,to);}
      }
    }
    next.sort((a,b)=>distance(a.summary,goal)-distance(b.summary,goal)||a.steps.length-b.steps.length);
    const found=next.find(n=>n.summary.rarity===goal.rarity);
    if(found)return {status:'found',...found};
    beam=next.slice(0,beamWidth);
    yield {depth:depth+1,checked:seen.size};
  }
  return {status:'not-found',message:'No matching setup found using your available Lounge copies and work slots. Try the count preview below to plan which lower- or higher-rarity droids to obtain. Locked, protected and unfinished copies stay in place.'};
}

export function blueprintPlan(options){
  const search=blueprintSearch(options);let step;
  do{step=search.next()}while(!step.done);
  return step.value;
}
