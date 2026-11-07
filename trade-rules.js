export const tradeVariantLabel=v=>({KYBER:'Kyber (inactive)',KYBER_ACTIVE:'Kyber (active ? any colour)',KYBER_GREEN:'Kyber (Green)',KYBER_BLUE:'Kyber (Blue)',KYBER_PURPLE:'Kyber (Purple)'}[v]||String(v||'').replaceAll('_',' '));
const active=['KYBER_GREEN','KYBER_BLUE','KYBER_PURPLE'];
const rank=v=>['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR','KYBER','KYBER_ACTIVE','SCOURGE'].indexOf(active.includes(v)?'KYBER_ACTIVE':v);
export function tradeVariantMatches(wanted,offered,minimum=false){
 if(!wanted)return true;
 const same=wanted==='KYBER_ACTIVE'?active.includes(offered):wanted===offered;
 return same||Boolean(minimum&&rank(offered)>=0&&rank(wanted)>=0&&rank(offered)>rank(wanted));
}
export function receivedTradeRows(listing){
 return (listing.offers||[]).filter(o=>o.status==='completed'&&(listing.mine||o.mine)).map(o=>({id:o.id,items:listing.mine?o.droid:(o.receiving||[]).map(i=>(listing.giving||[])[i]).filter(Boolean)}));
}
export function importTradeReceipts(owned,receipts,batches,droids){
 const seen=new Set(receipts||[]),rows=[...owned];let added=0;
 for(const batch of batches){
  if(seen.has(batch.id))continue;
  if(!Array.isArray(batch.items)||batch.items.some(item=>!droids.some(d=>d.name===item.name&&d.variants?.[item.variant])))continue;
  for(const item of batch.items){rows.push({name:item.name,variant:item.variant,qty:1,built:true,unallocated:true,hasBeenTraded:true,tradeReceipt:batch.id,...(item.trait!==undefined?{trait:{id:Number(item.trait),tier:item.traitTier}}:{})});added++;}
  seen.add(batch.id);
 }
 return {owned:rows,receipts:[...seen],added};
}
