import { slotDistanceSquared } from './slot-geometry.js?v=2026-09-26-slot-order';
import { predictWorkLanding, predictStationLanding } from './optimise-route.js?v=2026-09-23-background';

// Functions cannot cross a worker boundary. Rebuild them from the exact slots,
// permissions and room costs captured by the app for this profile.
export function workerRules(data) {
  const rules = {
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
  rules.workLanding = (unit, placed) => predictWorkLanding(unit, placed, rules);
  rules.stationLanding = (unit, placed, station) => predictStationLanding(unit, placed, station, rules);
  return rules;
}
