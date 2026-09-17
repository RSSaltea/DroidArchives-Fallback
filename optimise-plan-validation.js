// Replay instructions independently of the planner before offering an Apply action.
// Inputs are copied; a rejected step never changes the simulated base.
export function validateOptimisePlan({ initial, projected, steps, rules } = {}) {
  const issues = [], units = new Map(), positions = new Map(), staged = new Map();
  const generated = new Set(), seen = new Set(), sold = new Set();
  const issue = message => issues.push(message);
  const keyOf = unit => unit && (typeof unit.source === 'string' || Number.isFinite(unit.source)) &&
    Number.isInteger(unit.unit) && unit.unit >= 0 ? `${unit.source}:${unit.unit}` : null;
  const samePlace = (a, b) => Boolean(a && b && a.station === b.station && a.slot === b.slot);
  const sameDroid = (a, b) => a.name === b.name && a.variant === b.variant;
  const buildStation = station => station === 'BUILD' || station === 'FUSION_BUILD';
  const array = (value, label, optional = false) => {
    if (value === undefined && optional) return [];
    if (!Array.isArray(value)) { issue(`${label} must be an array.`); return []; }
    return value;
  };
  if (!initial || !projected) issue('Both the initial and projected base are required.');
  for (const name of ['slots', 'canUse', 'isBuilding', 'workLanding']) {
    if (typeof rules?.[name] !== 'function') issue(`Missing ${name} rule.`);
  }
  const rule = (name, ...args) => {
    try { return rules?.[name]?.(...args); }
    catch { issue(`The ${name} rule could not validate this plan.`); return undefined; }
  };
  const validPlace = place => {
    if (!place || typeof place.station !== 'string' || !Number.isInteger(place.slot)) return false;
    const slots = rule('slots', place.station);
    return Array.isArray(slots) && slots.includes(place.slot);
  };
  const placed = () => [...positions].map(([key, position]) => ({ ...units.get(key), ...position }));
  const occupant = place => [...positions].find(([, position]) => samePlace(position, place))?.[0];
  const current = key => ({ ...units.get(key), ...(positions.get(key) || {}) });
  const movable = (key, label) => {
    const unit = current(key);
    if (unit.lockedSlot || rule('isBuilding', unit)) {
      issue(`${label}: ${key} is locked or still building.`); return false;
    }
    return true;
  };
  const resolve = (unit, label) => {
    const key = keyOf(unit);
    if (!key || !units.has(key)) { issue(`${label}: missing droid ${key || 'identity'}.`); return null; }
    if (!sameDroid(unit, units.get(key))) { issue(`${label}: droid identity ${key} does not match its name and variant.`); return null; }
    return key;
  };
  const positionOf = (step, field) => typeof step[field] === 'string'
    ? { station: step[field], slot: step[`${field}Slot`] }
    : step[field];
  const checkFrom = (key, from, label, required = false) => {
    const actual = positions.get(key);
    if (!actual && (!from || from.station === 'ROSTER' || from.station === 'OVERFLOW')) return true;
    if (!from && !required) return true;
    if (!samePlace(actual, from)) { issue(`${label}: stale or missing source position for ${key}.`); return false; }
    return true;
  };
  const remove = key => { units.delete(key); positions.delete(key); };
  const initialPlaced = array(initial?.placed, 'Initial placements');
  const initialOverflow = array(initial?.overflow, 'Initial overflow', true);
  for (const [items, positioned] of [[initialPlaced, true], [initialOverflow, false]]) {
    for (const input of items) {
      const key = keyOf(input);
      if (!key) { issue('Initial base contains a droid without an identity.'); continue; }
      if (seen.has(key)) { issue(`Initial base contains duplicate identity ${key}.`); continue; }
      seen.add(key);
      const { station, slot, ...unit } = input;
      units.set(key, { ...unit });
      if (positioned) {
        const place = { station, slot };
        if (!validPlace(place)) issue(`Initial base contains an invalid slot for ${key}.`);
        if (occupant(place)) issue(`Initial base contains duplicate occupancy at ${station}:${slot}.`);
        positions.set(key, place);
      }
    }
  }
  let prefixIndex = 0, batchStart = null;
  const plan = array(steps, 'Plan steps');
  for (let index = 0; index < plan.length; index++) {
    const step = plan[index], label = `Step ${index + 1}`;
    if (!step || typeof step !== 'object') { issue(`${label}: malformed instruction.`); continue; }
    const prefix = ['sell', 'fuse-in', 'fuse-held', 'fuse-result', 'fuse'].includes(step.type);
    if (prefix && step.type !== 'sell' && batchStart === null) batchStart = prefixIndex;
    if (prefix) prefixIndex++;
    if (step.fusionBlocked || step.partial || step.type === 'note' || step.type === 'fuse-deferred') {
      issue(`${label}: incomplete or blocked plan.`); continue;
    }
    if (step.type === 'move') {
      const key = resolve(step.unit, label), from = positionOf(step, 'from'), to = positionOf(step, 'to');
      if (!key || !checkFrom(key, from, label, true) || !movable(key, label)) continue;
      if (!validPlace(to)) { issue(`${label}: invalid destination slot.`); continue; }
      if (buildStation(to.station)) {
        issue(`${label}: ordinary moves cannot enter a build slot.`); continue;
      }
      if (occupant(to)) { issue(`${label}: destination is occupied.`); continue; }
      if (!rule('canUse', current(key), to.station)) { issue(`${label}: incompatible destination station.`); continue; }
      if (step.workCommand || step.kind === 'work') {
        const landing = rule('workLanding', current(key), placed());
        // When the game's own distance rule decides between rooms, the plan
        // may state any of them; the player checks where it lands.
        const guessed = Boolean(step.assumed) && Array.isArray(landing?.options) && landing.options.includes(to.station);
        if (!guessed && !samePlace(landing, to)) { issue(`${label}: work command cannot reach the stated destination.`); continue; }
      }
      positions.set(key, { station: to.station, slot: to.slot });
    } else if (step.type === 'swap') {
      const key = resolve(step.unit, label), other = resolve(step.withUnit, label);
      const from = positionOf(step, 'from'), withFrom = positionOf(step, 'withFrom');
      if (!key || !other || !checkFrom(key, from, label, true) || !checkFrom(other, withFrom, label, true)) continue;
      if (key === other || sameDroid(units.get(key), units.get(other))) {
        issue(`${label}: swapping identical droids has no effect.`); continue;
      }
      if (!positions.has(key) || !positions.has(other) || !validPlace(from) || !validPlace(withFrom)) {
        issue(`${label}: a swap requires two occupied valid slots.`); continue;
      }
      if (!movable(key, label) || !movable(other, label)) continue;
      if (!rule('canUse', current(key), withFrom.station) || !rule('canUse', current(other), from.station)) {
        issue(`${label}: incompatible swap, including the return destination.`); continue;
      }
      // A completed droid swapped into a build slot does not start building again.
      if (buildStation(withFrom.station)) units.set(key, { ...units.get(key), built: true });
      if (buildStation(from.station)) units.set(other, { ...units.get(other), built: true });
      positions.set(key, { station: withFrom.station, slot: withFrom.slot });
      positions.set(other, { station: from.station, slot: from.slot });
    } else if (step.type === 'sell') {
      const key = resolve(step.unit, label);
      if (!key || !checkFrom(key, positionOf(step, 'from'), label) || !movable(key, label)) continue;
      sold.add(key); remove(key);
    } else if (step.type === 'fuse-in' || step.type === 'fuse-held') {
      const key = resolve(step.unit, label);
      if (!key || !checkFrom(key, positionOf(step, 'from'), label) || !movable(key, label)) continue;
      if (step.type === 'fuse-held' && positions.get(key)?.station !== 'FUSION') {
        issue(`${label}: a held Fusion input is not on the table.`); continue;
      }
      const onTable = [...positions].filter(([other, position]) => other !== key && position.station === 'FUSION').length;
      if (staged.size + onTable >= 3) { issue(`${label}: Fusion table capacity exceeded.`); continue; }
      staged.set(key, current(key)); remove(key);
    } else if (step.type === 'fuse-result') {
      const count = step.unit?.count;
      if (!step.waitForBuild) { issue(`${label}: chained Fusion result needs an explicit build wait.`); continue; }
      if (!Number.isInteger(count) || count < 1 || count > 3) { issue(`${label}: invalid chained Fusion input count.`); continue; }
      const matches = [...units].filter(([key, unit]) => generated.has(key) && positions.get(key)?.station === 'FUSION_BUILD' &&
        sameDroid(unit, step.unit)).slice(0, count);
      if (matches.length !== count) { issue(`${label}: earlier Fusion results are missing.`); continue; }
      const onTable = [...positions.values()].filter(position => position.station === 'FUSION').length;
      if (staged.size + onTable + count > 3) { issue(`${label}: Fusion table capacity exceeded.`); continue; }
      for (const [key, unit] of matches) { staged.set(key, { ...unit, built: true }); remove(key); }
    } else if (step.type === 'fuse') {
      if (staged.size !== 3 || [...positions.values()].some(position => position.station === 'FUSION')) {
        issue(`${label}: Fusion requires exactly three staged inputs and a clear table.`); continue;
      }
      if (Array.isArray(step.fusion?.spend)) {
        const expected = new Map(), actual = new Map();
        for (const part of step.fusion.spend) expected.set(`${part?.name}|${part?.variant}`, (expected.get(`${part?.name}|${part?.variant}`) || 0) + part?.count);
        for (const input of staged.values()) actual.set(`${input.name}|${input.variant}`, (actual.get(`${input.name}|${input.variant}`) || 0) + 1);
        if (expected.size !== actual.size || [...actual].some(([key, count]) => expected.get(key) !== count)) {
          issue(`${label}: staged droids do not match the Fusion recipe.`); continue;
        }
      }
      const to = positionOf(step, 'to');
      if (!validPlace(to) || to.station !== 'FUSION_BUILD' || occupant(to)) {
        issue(`${label}: Fusion result needs a free valid Fusion Build slot.`); continue;
      }
      let result = step.resultUnit;
      if (!result) {
        const match = typeof step.resultKey === 'string' && /^(.*):(\d+)$/.exec(step.resultKey);
        result = { source: match ? match[1] : step.resultKey ?? `fusion-result-${batchStart}`, unit: match ? Number(match[2]) : 0,
          name: step.unit?.name || 'Fusion result', variant: step.unit?.variant || step.fusion?.variant,
          fusionUnknown: !step.unit?.name, rarity: step.fusion?.rarity };
      }
      const key = keyOf(result), known = step.fusion?.out || step.unit;
      if (!key || seen.has(key)) { issue(`${label}: Fusion result has a missing or duplicate identity.`); continue; }
      if (result.built || (known?.name && !sameDroid(result, known))) {
        issue(`${label}: Fusion result metadata does not match the recipe.`); continue;
      }
      if (result.station !== undefined && !samePlace(result, to)) {
        issue(`${label}: Fusion result metadata has the wrong destination.`); continue;
      }
      const { station, slot, ...metadata } = result;
      units.set(key, { ...metadata, built: false, fusionResult: true }); positions.set(key, { station: to.station, slot: to.slot });
      generated.add(key); seen.add(key); staged.clear(); batchStart = null;
    } else issue(`${label}: unsupported instruction ${String(step.type)}.`);
  }
  if (staged.size) issue('The plan leaves unfinished inputs on the Fusion table.');

  const targetUnits = new Map(), targetPositions = new Map(), targetSpots = new Set(), targetSold = new Set();
  const targetPlaced = array(projected?.placed, 'Projected placements');
  const targetOverflow = array(projected?.overflow, 'Projected overflow', true);
  const fusionResults = array(projected?.fusionResults, 'Projected Fusion results', true);
  const targets = [...targetPlaced.map(unit => [unit, true]), ...targetOverflow.map(unit => [unit, false])];
  // Known results are also in placed. Unknown rolls still occupy a real build slot.
  for (const result of fusionResults) {
    const matching = targetPlaced.find(unit => keyOf(unit) === keyOf(result));
    if (matching) {
      if (!sameDroid(matching, result) || !samePlace(matching, result)) issue('Projected Fusion result disagrees with its placement.');
    } else targets.push([result, true]);
  }
  for (const [unit, positioned] of targets) {
    const key = keyOf(unit);
    if (!key || targetUnits.has(key)) { issue(`Projected base contains a missing or duplicate identity ${key || ''}.`); continue; }
    targetUnits.set(key, unit);
    if (positioned) {
      if (!validPlace(unit)) issue(`Projected base contains an invalid slot for ${key}.`);
      const spot = `${unit.station}:${unit.slot}`;
      if (targetSpots.has(spot)) issue(`Projected base contains duplicate occupancy at ${spot}.`);
      targetSpots.add(spot); targetPositions.set(key, { station: unit.station, slot: unit.slot });
    }
  }
  for (const unit of array(projected?.sell, 'Projected sales', true)) {
    const key = keyOf(unit);
    if (!key || targetSold.has(key) || targetUnits.has(key)) issue(`Projected sales contain a missing or duplicate identity ${key || ''}.`);
    else targetSold.add(key);
  }
  for (const [key, unit] of targetUnits) {
    if (!units.has(key)) { issue(`Projected droid ${key} is missing after replay.`); continue; }
    const replayed = units.get(key);
    if (!sameDroid(unit, replayed)) issue(`Projected droid ${key} has different result metadata.`);
    if (Boolean(unit.built) !== Boolean(replayed.built)) issue(`Projected build readiness for ${key} does not match the replay.`);
    // New results carry a temporary scheduler lock. It is deliberately absent
    // from the saved layout; user locks on existing droids must survive.
    if (!generated.has(key) && Boolean(unit.lockedSlot) !== Boolean(replayed.lockedSlot)) {
      issue(`Projected lock for ${key} does not match the replay.`);
    }
    const expected = targetPositions.get(key), actual = positions.get(key);
    if ((expected || actual) && !samePlace(expected, actual)) issue(`Projected position for ${key} does not match the replay.`);
  }
  for (const key of units.keys()) if (!targetUnits.has(key)) issue(`Replay leaves an unexpected droid ${key}.`);
  for (const key of targetSold) if (!sold.has(key)) issue(`Projected sale ${key} was not performed.`);
  for (const key of sold) if (!targetSold.has(key)) issue(`Replay sells an unexpected droid ${key}.`);
  return { ok: issues.length === 0, issues, placed: placed() };
}
