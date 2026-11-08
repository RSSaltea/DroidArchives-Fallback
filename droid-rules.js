export const ACTIVE_KYBER=Object.freeze(['KYBER_GREEN','KYBER_BLUE','KYBER_PURPLE']);
// Shared game rules. Keep feature-specific reward scores separate from display order.
export const DROID_TYPES=['WORKER','ASTROMECH','BATTLE','PROTOCOL'];
export const ALL_VARIANTS=['DEFAULT','GOLD','DIAMOND','RAINBOW','BESKAR','GALACTIC','STELLAR','KYBER'];
export const OWNED_VARIANTS=[...ALL_VARIANTS,...ACTIVE_KYBER,'SCOURGE'];
export const baseVariant=v=>String(v||'').startsWith('KYBER_')?'KYBER':v;
export const variantRank=v=>v==='SCOURGE'?8:ALL_VARIANTS.indexOf(baseVariant(v));
export const isActiveKyber=v=>ACTIVE_KYBER.includes(v);
export const rebirthVariantReady=(have,required,active=false)=>Boolean(have&&variantRank(have)>=variantRank(required)&&(have==='SCOURGE'||baseVariant(required)!=='KYBER'||isActiveKyber(have)||(have==='KYBER'&&active)));
export const LEGACY_DROID_NAMES={'C3-PO':'C-3PO','BU-4D':'B-U4D'};
export const canonicalDroidName=name=>LEGACY_DROID_NAMES[name]||name;
export const isIconic=d=>d?.rarity==='ICONIC'||d?.special?.onlyDefaultVariant;
export const isFusion=d=>Boolean(d?.fusion);
export const ICONIC_EFFECTS={'SCOURGE PRIME':'Work: Apply Hive Mind Bonus; credit Protocol links this region','WG-22':'2x Flawless Chance (Companion)','BB-8':'×2 Upgrade Chips on claim','MISTER BONES':'×2 Damage','IG-11 MARSHAL':'Blueprint Shield','DJ R-3X':'×2 World Quest Rewards','CB-23':'Secret Astromech Mission','R2-D2':'15% Astromech Mission Speed','C-3PO':'2× Droid Sell Value'};
export const iconicIncome=d=>isIconic(d)?(d.special?.incomePercent??0.15):0;
export const CHIP_COSTS={COMMON:{GOLD:10,DIAMOND:25,RAINBOW:40,BESKAR:80,GALACTIC:120,STELLAR:180,KYBER:240},RARE:{GOLD:30,DIAMOND:60,RAINBOW:100,BESKAR:250,GALACTIC:400,STELLAR:750,KYBER:1000},EPIC:{GOLD:120,DIAMOND:180,RAINBOW:240,BESKAR:2000,GALACTIC:5000,STELLAR:8000,KYBER:12000},LEGENDARY:{GOLD:400,DIAMOND:1200,RAINBOW:2500,BESKAR:6000,GALACTIC:16000,STELLAR:24000,KYBER:30000},MYTHIC:{GOLD:4000,DIAMOND:8000,RAINBOW:14000,BESKAR:30000,GALACTIC:60000,STELLAR:90000,KYBER:110000}};
export const UPGRADE_CHIP_RATES={
  COMMON:{DEFAULT:2,GOLD:4,DIAMOND:6,RAINBOW:8,BESKAR:10,GALACTIC:12,STELLAR:14,KYBER:16},
  RARE:{DEFAULT:4,GOLD:8,DIAMOND:12,RAINBOW:16,BESKAR:20,GALACTIC:24,STELLAR:28,KYBER:32},
  EPIC:{DEFAULT:6,GOLD:12,DIAMOND:18,RAINBOW:24,BESKAR:30,GALACTIC:36,STELLAR:42,KYBER:48},
  LEGENDARY:{DEFAULT:8,GOLD:16,DIAMOND:24,RAINBOW:32,BESKAR:40,GALACTIC:48,STELLAR:56,KYBER:64},
  MYTHIC:{DEFAULT:10,GOLD:20,DIAMOND:30,RAINBOW:40,BESKAR:50,GALACTIC:60,STELLAR:70,KYBER:80}
};
export const upgradeChipRate=(d,variant)=>UPGRADE_CHIP_RATES[d?.rarity]?.[variant==='SCOURGE'?'KYBER':baseVariant(variant)]||0;
export const CHIP_SELL_VALUES={
  COMMON:{GOLD:4,DIAMOND:7,RAINBOW:10,BESKAR:13,GALACTIC:16,STELLAR:19,KYBER:22},
  RARE:{GOLD:6,DIAMOND:9,RAINBOW:12,BESKAR:15,GALACTIC:18,STELLAR:21,KYBER:24},
  EPIC:{GOLD:30,DIAMOND:33,RAINBOW:36,BESKAR:39,GALACTIC:42,STELLAR:45,KYBER:48},
  LEGENDARY:{GOLD:84,DIAMOND:87,RAINBOW:90,BESKAR:93,GALACTIC:96,STELLAR:99,KYBER:102},
  MYTHIC:{GOLD:192,DIAMOND:195,RAINBOW:198,BESKAR:201,GALACTIC:204,STELLAR:207,KYBER:210}
};
export const baseChipSellValue=(d,variant)=>CHIP_SELL_VALUES[d?.rarity]?.[baseVariant(variant)]||0;
export const LUCKY_UPGRADE_CHANCES={COMMON:0.32,RARE:0.16,EPIC:0.08,LEGENDARY:0.04,MYTHIC:0.02};
export const luckyChance=d=>LUCKY_UPGRADE_CHANCES[d?.rarity]||0;
export const variantLabel=v=>v==='KYBER'?'Kyber':String(v).toLowerCase().replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
export const RARITY_LADDER=['COMMON','RARE','EPIC','LEGENDARY','MYTHIC'];

export const TRADE_VARIANTS=Object.freeze([...ALL_VARIANTS,'KYBER_ACTIVE',...ACTIVE_KYBER,'SCOURGE']);
export const PRODUCTIVE_STATIONS=Object.freeze(['WORKER','ASTROMECH','BATTLE']);
export const BLUEPRINT_RARITY_POINTS=Object.freeze({COMMON:0,RARE:1,EPIC:2,LEGENDARY:3,MYTHIC:5});
// Crafting power and trade crystals use consecutive rarity levels, not blueprint IDs.
export const RARITY_POWER=Object.freeze({COMMON:1,RARE:2,EPIC:3,LEGENDARY:4,MYTHIC:5});
export const KYBER_TRADE_COLOUR=Object.freeze({KYBER_GREEN:1,KYBER_BLUE:2,KYBER_PURPLE:3});
export const KYBER_ACTIVATION=Object.freeze([[1,200,50],[2,400,100],[4,600,150],[7,800,200],[10,1000,250]].map(Object.freeze));
export const kyberActivationCost=d=>d?.variants?.KYBER?KYBER_ACTIVATION[RARITY_LADDER.indexOf(String(d.rarity).toUpperCase())]?.[0]??null:null;
export const tradeVariantRank=v=>[...ALL_VARIANTS,'KYBER_ACTIVE','SCOURGE'].indexOf(isActiveKyber(v)?'KYBER_ACTIVE':v);
export const tradeVariantLabel=v=>({KYBER:'Kyber (inactive)',KYBER_ACTIVE:'Kyber (active ? any colour)',KYBER_GREEN:'Kyber (Green)',KYBER_BLUE:'Kyber (Blue)',KYBER_PURPLE:'Kyber (Purple)'}[v]||String(v||'').replaceAll('_',' '));

// Rule tables are read-only; consumers must copy arrays before sorting/filtering in place.
function freezeRules(value){if(value&&typeof value==='object'){Object.values(value).forEach(freezeRules);Object.freeze(value)}return value}
[DROID_TYPES,ALL_VARIANTS,OWNED_VARIANTS,LEGACY_DROID_NAMES,ICONIC_EFFECTS,CHIP_COSTS,UPGRADE_CHIP_RATES,CHIP_SELL_VALUES,LUCKY_UPGRADE_CHANCES,RARITY_LADDER].forEach(freezeRules);
