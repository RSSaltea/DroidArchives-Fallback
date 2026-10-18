import { TRAITS, traitEligible } from './traits.js?v=2026-10-18-mission-tools';
const tiers=['Default','Gold','Diamond','Rainbow'];
export function traitRollPool(droid,current=null){
  const groups=tiers.map(tier=>TRAITS.filter(t=>traitEligible(t,droid)&&Object.hasOwn(t.values,tier)&&!(t.id===current?.id&&tier===current?.tier)).map(t=>({id:t.id,tier}))).filter(g=>g.length);
  return groups.flatMap(g=>g.map(t=>({...t,probability:1/groups.length/g.length})));
}
// Absorbing-state calculation: every unsuccessful roll becomes the next
// excluded combination. A fixed geometric probability would be inaccurate.
export function rerollEstimate(droid,current,target,attempts=10){
  const key=t=>`${t.id}:${t.tier}`,hit=t=>t.id===target.id&&t.tier===target.tier;
  if(current&&hit(current))return {already:true,nextChance:0,expectedRolls:0,expectedNova:0,chance:1};
  const all=traitRollPool(droid);
  if(!all.some(hit))return null;
  let dist=new Map([[current?key(current):'none',1]]),expectedRolls=0,expectedNova=0,chance=0;
  const states=new Map(all.map(t=>[key(t),t]));if(current)states.set(key(current),current);
  const transitions=new Map([...states].map(([k,t])=>[k,traitRollPool(droid,t)]));transitions.set('none',all);
  const base={COMMON:2,RARE:4,EPIC:6,LEGENDARY:8,MYTHIC:10,ICONIC:200}[droid.rarity];
  for(let n=1;n<=4000;n++){
    const remaining=[...dist.values()].reduce((a,b)=>a+b,0);
    if(remaining<1e-12){if(n<=attempts)chance=1;break;}
    expectedRolls+=remaining;
    expectedNova+=remaining*base*(droid.rarity==='ICONIC'?1:(current?.rerolls||0)+n);
    const next=new Map();
    for(const [k,mass] of dist)for(const t of transitions.get(k)||[]){if(hit(t))continue;const id=key(t);next.set(id,(next.get(id)||0)+mass*t.probability);}
    dist=next;
    if(n===attempts)chance=1-[...dist.values()].reduce((a,b)=>a+b,0);
  }
  return {nextChance:traitRollPool(droid,current).filter(hit).reduce((s,t)=>s+t.probability,0),expectedRolls,expectedNova,chance};
}
export const ICONIC_TRAIT_ADVICE=[
  ['CB-23',24,'Mission rewards','Hyperdrive triples the chip and Nova amounts in its mission reward pool. Use an Astromech mission slot.'],
  ['R2-D2',19,'Mission crates','Do not reroll for Double Crate at present: the code only rolls it for a one-crate reward, while R2-D2 already gives two. Choose a companion trait if you equip it instead.'],
  ['D-O',17,'Fusion','Fusion Master activates its companion perk while working, freeing a Companion slot.'],
  ['BB-8',21,'Upgrade chips','Upgrade Chip Master activates its companion perk while working, freeing a Companion slot.'],
  ['C-3PO',20,'Selling droids','Droid Sell Master activates its companion perk while working.'],
  ['DJ R-3X',22,'World missions','World Mission Master activates its companion perk while working.'],
  ['CHOPPER',18,'Critical hits','Crit Expert adds one Multi Crit while equipped as a companion.'],
  ['WG-22',23,'Flawless builds','Flawless Duplicator rewards a blueprint on a flawless build while equipped.'],
  ['MISTER BONES',15,'Combat','Lifesteal restores 20% of maximum health per kill while equipped.'],
  ['IG-11 MARSHAL',16,'Blueprint protection','Blueprint Protector is a utility choice while equipped.']
];
