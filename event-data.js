export const EVENT_ID='gonk-o-ween-2026';
export const TREAT_DAY_MS=24*60*60*1000;
export const treatDay=(now=Date.now())=>Math.floor(now/TREAT_DAY_MS);
export const nextTreatReset=(now=Date.now())=>(treatDay(now)+1)*TREAT_DAY_MS;
const art=name=>`assets/events/gonk-o-ween/${name}.png`;
export const TREAT_ICON=art('T_Icon_Treat');
export const EVENT_ITEMS=[
  ['bat-hat','Bat hat','Hats',20,'T_Icon_DroidHat46'],
  ['candy-corn-hat','Candy Corn hat','Hats',20,'T_Icon_DroidHat48'],
  ['witch-hat','Witch hat','Hats',20,'T_Icon_DroidHat47'],
  ['werewolf-hat','Werewolf hat','Hats',20,'T_Icon_DroidHat45'],
  ['bb-b0020','BB-B0020','Costumes',60,'T_Portrait_BB_B0020'],
  ['cb-w1ch','CB-W1CH','Costumes',80,'T_Portrait_CB_W1CH'],
  ['ig-b0018','IG-B0018','Costumes',80,'T_Portrait_IG_B0018'],
  ['mister-b0025','Mister B0025','Costumes',80,'T_Portrait_Mister_B0025'],
  ['c-b0019','C-B0019','Costumes',100,'T_Portrait_C_B0019'],
  ['r2-wrwlf','R2-WRWLF','Costumes',100,'T_Portrait_R2_WRWLF'],
  ['ghostly-aura','Ghostly aura','Auras',60,'DT_IIT_Icon_GhostlyVFX'],
  ['bat-aura','Bat aura','Auras',60,'DT_IIT_Icon_BatVFX'],
  ['ghoulish-gonk','Ghoulish Gonk base paint','Base paints',160,'T_GOW_Ghostly_Offer'],
  ['fusion-token','Fusion token','Tokens',20,null],
  ['crafting-boost','Crafting Boost','Tokens',null,null],
  ['galactic-surge','Galactic Surge','Tokens',null,null],
  ['stellar-surge','Stellar Surge','Tokens',null,null],
  ['kyber-surge','Kyber Surge','Tokens',null,null],
  ['event-pass','Gonk-o-Ween pass','Pass',null,'T_GOW_Pumpkin_Icon'],
  ['c1-mnst4','C1-MNST4 Chopper costume','Event rewards',null,'T_Portrait_C1_MNST4'],
  ['reward-treats','60 Treats','Event rewards',null,'T_Icon_Treat'],
  ['pumpkin-workshop','Pumpkin Workshop Paint','Event rewards',null,'T_GOW_Pumpkin_Icon'],
  ['reward-crafting','Crafting Boost Token','Event rewards',null,null]
].map(([id,name,category,price,image])=>({id,name,category,price,image:image?art(image):id.includes('crafting')?'assets/nova-shop/CraftingBoost.png':id.includes('surge')?'assets/nova-shop/SurgeBoost.png':null}));
const ids=new Set(EVENT_ITEMS.map(item=>item.id));
const safeInt=(value,max=1000000000)=>Number.isFinite(Number(value))?Math.min(max,Math.max(0,Math.floor(Number(value)))):0;
export function normaliseEventProgress(value,now=Date.now()){
  const data=value&&typeof value==='object'&&value.eventId===EVENT_ID?value:{};
  // Migrate the old four-hour reminder using its original collection time.
  const today=treatDay(now),legacy=safeInt(data.readyAt,8640000000000000);
  const visitDay=Number.isInteger(data.visitDay)&&data.visitDay>=0?Math.min(today,data.visitDay):legacy?treatDay(legacy-4*60*60*1000):today;
  const checks=key=>Array.from({length:5},(_,i)=>visitDay===today&&data[key]?.[i]===true);
  const selection=key=>[...new Set(Array.isArray(data[key])?data[key].filter(id=>ids.has(id)):[])];
  return {eventId:EVENT_ID,baseVisits:checks('baseVisits'),outskirtsVisits:checks('outskirtsVisits'),visitDay,alerts:data.alerts===true,treats:safeInt(data.treats),wishlist:selection('wishlist'),owned:selection('owned')};
}
export function eventRoundStatus(value,now=Date.now()){
  const data=normaliseEventProgress(value,now),completed=[...data.baseVisits,...data.outskirtsVisits].filter(Boolean).length;
  return {completed,baseTreats:completed*2,remainingMs:nextTreatReset(now)-now,ready:data.visitDay<treatDay(now),started:true};
}
export function eventWishlistTotals(value){
  const data=normaliseEventProgress(value),wanted=EVENT_ITEMS.filter(item=>data.wishlist.includes(item.id)&&!data.owned.includes(item.id));
  const priced=wanted.filter(item=>item.price!==null),total=priced.reduce((sum,item)=>sum+item.price,0),shortfall=Math.max(0,total-data.treats);
  return {count:wanted.length,total,shortfall,rounds:Math.ceil(shortfall/20),unknown:wanted.filter(item=>item.price===null&&item.category!=='Event rewards').length,rewards:wanted.filter(item=>item.category==='Event rewards').length};
}
