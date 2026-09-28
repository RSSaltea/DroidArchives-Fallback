import { slotDistanceSquared } from './slot-geometry.js?v=2026-09-26-slot-order';
import { predictWorkLanding, predictStationLanding, predictProtocolCompanionLanding, predictCompanionWorkLanding } from './optimise-route.js?v=2026-09-28-iconic-purchases';

// Functions cannot cross a worker boundary. Rebuild them from the exact slots,
// permissions and room costs captured by the app for this profile.
export function workerRules(data) {
  const rules = {
    allowTemporaryCompanionSwaps:Boolean(data.allowTemporaryCompanionSwaps),
    canPurchase: unit => Boolean(data.purchasable?.includes(unit.name) && unit.variant === 'DEFAULT' && unit.built === true && !unit.lockedSlot),
    canReturn: unit => Boolean(data.returnable?.includes(unit.name) && !unit.lockedSlot),
    slots: station => data.slots[station] || [],
    canUse: (unit, station) => Boolean(data.droids[unit.name]?.allowed.includes(station)),
    canPark: unit => Boolean(data.droids[unit.name]?.canPark),
    typeOf: unit => data.droids[unit.name]?.type || null,
    isBuilding: unit => ['BUILD', 'FUSION_BUILD'].includes(unit.station) && !unit.built,
    isMissionSlot: (station, slot) => data.missions[station]?.includes(slot) || false,
    regionOf: (station, slot) => data.regions[`${station}:${slot}`] ?? null,
    distance: (a, b) => data.distances[a]?.[b] || 0,
    protocolStations: () => data.protocol,
    slotDistanceSquared
  };
  rules.companionWorkLanding=(unit,placed,target)=>predictCompanionWorkLanding(unit,placed,target,rules);
  rules.protocolCompanionLanding = (unit, placed, target) => predictProtocolCompanionLanding(unit, placed, target, rules);
  rules.workLanding = (unit, placed) => predictWorkLanding(unit, placed, rules);
  rules.stationLanding = (unit, placed, station) => predictStationLanding(unit, placed, station, rules);
  return rules;
}
