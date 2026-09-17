// Plans the walk that turns the current Base into the optimised one.
//
// The game gives a droid six commands, all issued standing next to it: Work,
// Companion, Fusion, Lounge, Customize and Sell. Work is the only way into a
// Worker, Astromech or Battle slot and the player never picks the slot: the
// droid takes the nearest free slot of its own type (Astromech mission slots
// before credit slots), overflows to the nearest other type only once its own
// type is full, and lands on the Upgrade Chip only when everything is full.
// Lounge and Fusion pick their own slot too. Slots within a station earn the
// same, so a plan cares about stations, not slot numbers.
//
// A stop is a region the player walks to. The planner searches over sequences
// of stops, issuing every command that is legal in that region, and keeps the
// route with the fewest stops, then the fewest commands, then the fewest
// landings that depend on the base's geometry ("check where it lands").
//
// Pure: no globals. Everything about the base comes in through `rules`.

const PRODUCTIVE = ['WORKER', 'ASTROMECH', 'BATTLE'];
const keyOf = unit => `${unit.source}:${unit.unit}`;
const same = (a, b) => a && b && a.station === b.station && a.slot === b.slot;

// Slot bookkeeping: which slots each station has and which are taken.
function occupancy(placed, rules) {
  const used = new Map();
  for (const unit of placed) {
    if (!used.has(unit.station)) used.set(unit.station, new Set());
    used.get(unit.station).add(unit.slot);
  }
  const free = station => (rules.slots(station) || []).filter(slot => !used.get(station)?.has(slot));
  return { used, free };
}

const classOf = (station, slot, rules) => station === 'ASTROMECH' ? (rules.isMissionSlot(station, slot) ? 'mission' : 'credit') : null;

// The slot a landing is booked against. The game picks the nearest one, but
// every slot of a class earns the same, so the lowest index stands in for it.
function bookSlot(station, cls, free, rules) {
  const open = free(station);
  if (!open.length) return undefined;
  if (station !== 'ASTROMECH') return open[0];
  const mission = open.filter(slot => rules.isMissionSlot(station, slot));
  const credit = open.filter(slot => !rules.isMissionSlot(station, slot));
  if (cls === 'credit') return credit[0];
  return mission[0] ?? credit[0];
}

const regionOfUnit = (unit, rules) => unit.station ? rules.regionOf(unit.station, unit.slot) : null;

// Which of several open stations the droid reaches first. A measured order for
// the droid's room settles it; otherwise the map distance is a guess and the
// caller marks the landing "check where it lands".
function nearest(unit, choices, rules) {
  const from = regionOfUnit(unit, rules);
  const order = from && typeof rules.nearestOrder === 'function' ? rules.nearestOrder(from) : null;
  if (Array.isArray(order) && choices.every(choice => order.includes(choice.station))) {
    const pick = order.map(station => choices.find(choice => choice.station === station)).find(Boolean);
    if (pick) return { ...pick, certain: true };
  }
  let best = null, bestGap = Infinity;
  for (const choice of choices) {
    const gap = from && choice.region ? Number(rules.distance(from, choice.region)) || 0 : 0;
    if (gap < bestGap) { best = choice; bestGap = gap; }
  }
  return best && { ...best, certain: false };
}

// Where "go to work" sends `unit` given the current occupancy. Returns
// {station, slot, cls, assumed, options} or null when Work is greyed out.
// `assumed` says the game's own distance rule decides between several
// stations, so the answer is a best guess the player should check.
// The droid's own slot still counts while the game decides (measured: a
// Battle droid in a full Battle room leaves for another room), so a working
// droid whose room has no other free slot overflows rather than staying.
export function predictWorkLanding(unit, placed, rules) {
  const { free } = occupancy(placed, rules);
  const type = rules.typeOf(unit);
  const landing = (station, assumed, options) => {
    const cls = station === 'ASTROMECH' ? (free(station).some(slot => rules.isMissionSlot(station, slot)) ? 'mission' : 'credit') : null;
    const slot = bookSlot(station, cls, free, rules);
    return slot === undefined ? null : { station, slot, cls, assumed, options };
  };
  const region = station => { const slot = free(station)[0]; return slot === undefined ? null : rules.regionOf(station, slot); };
  if (type === 'PROTOCOL') {
    const open = rules.protocolStations().filter(station => free(station).length && rules.canUse(unit, station));
    if (open.length) {
      // A Protocol slot in the droid's own room is the nearest; one open slot
      // there is certain, more than one is a guess.
      const here = regionOfUnit(unit, rules), local = open.filter(station => here && region(station) === here);
      if (local.length === 1) return landing(local[0], false, open);
      const choice = nearest(unit, (local.length ? local : open).map(station => ({ station, region: region(station) })), rules);
      return landing(choice.station, open.length > 1 && !choice.certain, open);
    }
    // No Protocol slot left: it works an ordinary slot like any other droid.
  } else if (!PRODUCTIVE.includes(type)) return null;
  else if (free(type).length) return landing(type, false, [type]);
  const others = PRODUCTIVE.filter(station => station !== type && free(station).length && rules.canUse(unit, station));
  if (others.length) {
    const choice = nearest(unit, others.map(station => ({ station, region: region(station) })), rules);
    return landing(choice.station, others.length > 1 && !choice.certain, others);
  }
  if (free('UPGRADE_CHIP').length && rules.canUse(unit, 'UPGRADE_CHIP')) return landing('UPGRADE_CHIP', false, ['UPGRADE_CHIP']);
  return null;
}

// Goal for a droid from where the optimised layout puts it.
function goalFor(unit, rules) {
  return { station: unit.station, cls: classOf(unit.station, unit.slot, rules) };
}

const goalMet = (position, goal, rules) => Boolean(position) && position.station === goal.station &&
  (goal.station !== 'ASTROMECH' || classOf(position.station, position.slot, rules) === goal.cls);

export function planOptimiseRoute({ initial, target, rules, options = {} } = {}) {
  const beamWidth = options.beamWidth || 64, maxStops = options.maxStops || 24;
  const issues = [], later = [];
  const units = new Map();
  for (const unit of [...(initial?.placed || []), ...(initial?.overflow || [])]) units.set(keyOf(unit), { ...unit });

  // ---- goals -------------------------------------------------------------
  const goals = new Map();
  for (const unit of target?.placed || []) if (units.has(keyOf(unit))) goals.set(keyOf(unit), { kind: 'place', ...goalFor(unit, rules) });
  for (const unit of target?.sell || []) if (units.has(keyOf(unit))) goals.set(keyOf(unit), { kind: 'sell' });
  const fusions = [];
  for (const [index, batch] of (target?.fusions || []).entries()) {
    const inputs = (batch.inputs || []).map(keyOf);
    if (inputs.length !== 3 || inputs.some(key => !units.has(key))) { later.push({ batch, reason: 'inputs are not all on the base yet' }); continue; }
    fusions.push({ index, inputs, batch, done: false });
    for (const key of inputs) goals.set(key, { kind: 'fusion', fusion: index });
  }
  // A droid the layout could not place still stands somewhere in the game;
  // there is no command that takes it off the base.
  for (const unit of target?.overflow || []) {
    const key = keyOf(unit);
    if (units.has(key) && units.get(key).station) issues.push(`${unit.name} has no slot to go to: free a Lounge slot or sell it, then run Optimise again.`);
  }
  const fixed = key => { const unit = units.get(key); return unit.lockedSlot || rules.isBuilding(unit); };
  for (const [key, unit] of units) {
    const goal = goals.get(key);
    if (!goal) { goals.set(key, unit.station ? { kind: 'place', ...goalFor(unit, rules) } : { kind: 'stay' }); continue; }
    if (fixed(key) && (goal.kind !== 'place' || !goalMet(unit, goal, rules))) {
      issues.push(`${unit.name} is ${unit.lockedSlot ? 'locked' : 'still building'} and cannot move.`);
      goals.set(key, unit.station ? { kind: 'place', ...goalFor(unit, rules) } : { kind: 'stay' });
    }
    if (goal.kind === 'place' && ['BUILD', 'FUSION_BUILD'].includes(goal.station) && !goalMet(unit, goal, rules)) {
      issues.push(`${unit.name} cannot be moved into a Build slot; only a crafted droid appears there.`);
      goals.set(key, unit.station ? { kind: 'place', ...goalFor(unit, rules) } : { kind: 'stay' });
    }
  }

  // ---- feasibility of the target itself ----------------------------------
  const finalCount = new Map();
  const bump = (station, cls) => { const k = `${station}|${cls || ''}`; finalCount.set(k, (finalCount.get(k) || 0) + 1); };
  for (const [key, goal] of goals) if (goal.kind === 'place') bump(goal.station, goal.cls);
  const capacityOf = station => (rules.slots(station) || []).length;
  const missionCapacity = (rules.slots('ASTROMECH') || []).filter(slot => rules.isMissionSlot('ASTROMECH', slot)).length;
  const finalFull = station => station === 'ASTROMECH'
    ? (finalCount.get('ASTROMECH|mission') || 0) + (finalCount.get('ASTROMECH|credit') || 0) >= capacityOf(station)
    : (finalCount.get(`${station}|`) || 0) >= capacityOf(station);
  for (const [key, goal] of goals) {
    if (goal.kind !== 'place') continue;
    const unit = units.get(key), type = rules.typeOf(unit);
    if (goalMet(unit, goal, rules)) continue;
    if (goal.station === 'UPGRADE_CHIP' && !PRODUCTIVE.every(finalFull)) issues.push(`${unit.name} can only reach the Upgrade Chip once every Worker, Astromech and Battle slot is full, and the optimised layout leaves some empty.`);
    if (PRODUCTIVE.includes(goal.station) && PRODUCTIVE.includes(type) && goal.station !== type && !finalFull(type)) issues.push(`${unit.name} is a ${type[0] + type.slice(1).toLowerCase()} droid: Work only sends it to ${goal.station[0] + goal.station.slice(1).toLowerCase()} once every ${type[0] + type.slice(1).toLowerCase()} slot is full, and the optimised layout leaves some empty.`);
    if (goal.station === 'ASTROMECH' && goal.cls === 'credit' && (finalCount.get('ASTROMECH|mission') || 0) < missionCapacity) issues.push(`${unit.name} would take an Astromech mission slot before a credit slot, and the optimised layout leaves a mission slot empty.`);
  }

  // ---- state ---------------------------------------------------------------
  // Goals travel with the state: two identical droids can trade goals, so the
  // one whose Work landing fits takes the job.
  const start = { pos: new Map(), sold: new Set(), staged: new Map(), fused: new Set(), region: null, goals: new Map(goals) };
  for (const [key, unit] of units) if (unit.station) start.pos.set(key, { station: unit.station, slot: unit.slot });
  const clone = state => ({ pos: new Map(state.pos), sold: new Set(state.sold), staged: new Map(state.staged), fused: new Set(state.fused), region: state.region, goals: new Map(state.goals) });
  const twins = (a, b) => a.name === b.name && a.variant === b.variant;
  const placedOf = state => [...state.pos].map(([key, position]) => ({ ...units.get(key), ...position }));
  const pending = state => {
    let count = 0;
    for (const [key, goal] of state.goals) {
      if (goal.kind === 'sell') { if (!state.sold.has(key)) count++; }
      else if (goal.kind === 'fusion') { if (!state.fused.has(goal.fusion) && !state.staged.has(key)) count++; }
      else if (goal.kind === 'place') { if (!goalMet(state.pos.get(key), goal, rules)) count++; }
    }
    for (const fusion of fusions) if (!state.fused.has(fusion.index)) count++;
    return count;
  };
  const signature = state => [...state.pos].map(([key, p]) => `${key}@${p.station}:${p.slot}`).sort().join(',') + '|' + [...state.sold].sort().join(',') + '|' + [...state.staged.keys()].sort().join(',') + '|' + [...state.fused].sort().join(',');
  const regionOfKey = (state, key) => { const p = state.pos.get(key); return p ? rules.regionOf(p.station, p.slot) : null; };
  const arrivalsInto = (state, station) => {
    let count = 0;
    for (const [key, goal] of state.goals) if (goal.kind === 'place' && goal.station === station && !goalMet(state.pos.get(key), goal, rules) && !state.sold.has(key) && !state.staged.has(key)) count++;
    return count;
  };

  // One command, applied to a copied state. Returns the step or null.
  const tryCommand = (state, key, kind, allowAssumed) => {
    const unit = units.get(key), from = state.pos.get(key);
    let goal = state.goals.get(key);
    const placed = placedOf(state), { free } = occupancy(placed, rules);
    const step = { unit: { ...unit }, from: from ? { ...from } : undefined, at: from ? rules.regionOf(from.station, from.slot) : 'ANY' };
    if (kind === 'sell') { state.sold.add(key); state.pos.delete(key); return { ...step, type: 'sell' }; }
    if (kind === 'fusion') {
      const onTable = placed.filter(x => x.station === 'FUSION' && keyOf(x) !== key).length;
      if (state.staged.size + onTable >= 3) return null;
      // The table takes one batch at a time: mixing inputs of two batches
      // fills it with nothing to fuse.
      if ([...state.staged.values()].some(index => index !== goal.fusion)) return null;
      state.staged.set(key, goal.fusion); state.pos.delete(key);
      return { ...step, type: from?.station === 'FUSION' ? 'fuse-held' : 'fuse-in', to: 'FUSION' };
    }
    if (kind === 'lounge' || kind === 'buffer') {
      const slot = bookSlot('LOUNGE', null, free, rules);
      if (slot === undefined || !rules.canUse(unit, 'LOUNGE')) return null;
      state.pos.set(key, { station: 'LOUNGE', slot });
      return { ...step, type: 'move', kind: 'lounge', buffer: kind === 'buffer', to: { station: 'LOUNGE', slot } };
    }
    if (kind === 'companion') {
      const slot = bookSlot('COMPANION', null, free, rules);
      if (slot === undefined) return null;
      state.pos.set(key, { station: 'COMPANION', slot });
      return { ...step, type: 'move', kind: 'direct', to: { station: 'COMPANION', slot } };
    }
    if (kind === 'work') {
      let landing = predictWorkLanding({ ...unit, ...(from || {}) }, placed, rules);
      if (!landing) return null;
      // A guessed landing is planned towards the goal when the goal is one of
      // the rooms the game may pick; the step tells the player to check.
      if (landing.assumed && !goalMet(landing, goal, rules) && goal.kind === 'place' && (landing.options || []).includes(goal.station)) {
        const { free } = occupancy(placed, rules), cls = goal.station === 'ASTROMECH' ? (free('ASTROMECH').some(slot => rules.isMissionSlot('ASTROMECH', slot)) ? 'mission' : 'credit') : null;
        const slot = bookSlot(goal.station, cls, free, rules);
        if (slot !== undefined) landing = { ...landing, station: goal.station, slot, cls };
      }
      if (!goalMet(landing, goal, rules)) {
        // An identical droid may be waiting for exactly this landing: let the
        // two swap jobs rather than walk one past the other.
        const twin = [...state.goals].find(([other, otherGoal]) => other !== key && otherGoal.kind === 'place' && twins(units.get(other), unit) && !fixed(other) &&
          !state.sold.has(other) && !state.staged.has(other) && !goalMet(state.pos.get(other), otherGoal, rules) && goalMet(landing, otherGoal, rules));
        if (!twin) return null;
        state.goals.set(twin[0], goal); state.goals.set(key, twin[1]); goal = twin[1];
      }
      if (landing.assumed && !allowAssumed) return null;
      state.pos.set(key, { station: landing.station, slot: landing.slot });
      return { ...step, type: 'move', kind: 'work', workCommand: true, assumed: landing.assumed, options: landing.options, to: { station: landing.station, slot: landing.slot, cls: landing.cls, assumed: landing.assumed } };
    }
    return null;
  };
  const commandFor = goal => goal.kind === 'sell' ? 'sell' : goal.kind === 'fusion' ? 'fusion'
    : goal.station === 'LOUNGE' ? 'lounge' : goal.station === 'COMPANION' ? 'companion' : 'work';
  const tryFuse = (state, region) => {
    if (region !== 'FUSION') return null;
    for (const fusion of fusions) {
      if (state.fused.has(fusion.index) || !fusion.inputs.every(key => state.staged.has(key))) continue;
      const { free } = occupancy(placedOf(state), rules);
      if (placedOf(state).some(x => x.station === 'FUSION')) continue;
      const slot = free('FUSION_BUILD')[0];
      if (slot === undefined) continue;
      for (const key of fusion.inputs) { state.staged.delete(key); state.goals.set(key, { kind: 'done' }); }
      state.fused.add(fusion.index);
      const result = fusion.batch.resultUnit ? { ...fusion.batch.resultUnit, built: false } : null;
      if (result) { units.set(keyOf(result), { ...result }); state.pos.set(keyOf(result), { station: 'FUSION_BUILD', slot }); }
      return { type: 'fuse', at: 'FUSION', fusion: fusion.batch.fusion, unit: fusion.batch.unit || null, resultUnit: result, inputs: [...fusion.inputs], to: 'FUSION_BUILD', toSlot: slot, waitForBuild: false, text: fusion.batch.text };
    }
    return null;
  };

  // Everything worth doing in one region, in a sensible order, until nothing
  // else is legal. Buffers park a droid in the Lounge so its slot frees up.
  const visit = (state, region, policy) => {
    const steps = [];
    const inRegion = key => { const here = regionOfKey(state, key); return here === region || here === null && (region === 'ANY' || !state.pos.has(key) && units.get(key).station === undefined); };
    const open = () => [...state.goals].filter(([key, goal]) => !idle(goal) && !fixed(key) && inRegion(key) && !state.sold.has(key) && !state.staged.has(key) && !(goal.kind === 'place' && goalMet(state.pos.get(key), goal, rules)));
    let progress = true;
    while (progress) {
      progress = false;
      // A droid bound for another type of room can only leave while its own
      // room is full, so those go first, before anything opens a slot here.
      const order = open().sort(([a, ga], [b, gb]) => rank(ga, units.get(a)) - rank(gb, units.get(b)));
      for (const [key, goal] of order) {
        const step = tryCommand(state, key, commandFor(goal), policy.assumed);
        if (step) { steps.push(step); progress = true; }
      }
      const fuse = tryFuse(state, region);
      if (fuse) { steps.push(fuse); progress = true; }
      if (!progress && steps.filter(step => step.buffer).length < policy.buffers) {
        const { free } = occupancy(placedOf(state), rules);
        if (!free('LOUNGE').length) break;
        const candidates = open().filter(([key, goal]) => goal.kind === 'place' && state.pos.has(key) && goal.station !== 'LOUNGE')
          .filter(([key]) => { const station = state.pos.get(key).station; return arrivalsInto(state, station) > free(station).length; });
        const [pick] = candidates;
        if (pick) { const step = tryCommand(state, pick[0], 'buffer', false); if (step) { steps.push(step); progress = true; } }
      }
    }
    return steps;
  };
  // Lower bound on the stops still needed: every room with work left costs one.
  const stopsLeft = state => regionsWithWork(state).length;
  const rank = (goal, unit) => goal.kind === 'sell' ? 0 : goal.kind === 'fusion' ? 1 : goal.station === 'COMPANION' ? 2 : goal.station === 'LOUNGE' ? 3
    : goal.station === 'UPGRADE_CHIP' ? 7 : PRODUCTIVE.includes(goal.station) && goal.station !== rules.typeOf(unit) ? 4 : goal.cls === 'credit' ? 6 : 5;
  const idle = goal => goal.kind === 'stay' || goal.kind === 'done';
  const regionsWithWork = state => {
    const regions = new Set();
    for (const [key, goal] of state.goals) {
      if (idle(goal) || fixed(key) || state.sold.has(key) || state.staged.has(key)) continue;
      if (goal.kind === 'place' && goalMet(state.pos.get(key), goal, rules)) continue;
      regions.add(regionOfKey(state, key) || 'ANY');
    }
    for (const fusion of fusions) if (!state.fused.has(fusion.index)) regions.add('FUSION');
    return [...regions];
  };
  const CERTAIN_POLICIES = [{ assumed: false, buffers: 0 }, { assumed: false, buffers: 1 }, { assumed: false, buffers: 99 }];
  const ALL_POLICIES = [...CERTAIN_POLICIES, { assumed: true, buffers: 0 }, { assumed: true, buffers: 99 }];

  // ---- beam search over stops --------------------------------------------
  // Nodes at one depth have made the same number of stops, so they compare on
  // how many more they still need at least, then on what the walk costs the
  // player: parked droids, guessed landings, commands, distance. A walk with
  // no guessed landings is searched on its own as well, so a certain route is
  // never crowded out; the fewer stops win, then the fewer guesses.
  const root = { state: start, steps: [], stops: 0, commands: 0, assumed: 0, buffers: 0, walk: 0 };
  let best = null, bestPending = pending(start), found = null;
  // Parked droids already show up as work left in the Lounge, so progress
  // ranks ahead of them; a guessed landing ranks ahead too, as it can derail
  // everything after it.
  const better = (a, b) => a.stopsLeft - b.stopsLeft || a.pendingLeft - b.pendingLeft || a.assumed - b.assumed || a.buffers - b.buffers || a.commands - b.commands || a.walk - b.walk;
  if (bestPending === 0) return finish(root);
  for (const POLICIES of [CERTAIN_POLICIES, ALL_POLICIES]) {
  let beam = [root];
  const seen = new Map();
  for (let depth = 0; depth < maxStops; depth++) {
    const next = [];
    for (const node of beam) {
      for (const region of regionsWithWork(node.state)) {
        const variants = new Map();
        for (const policy of POLICIES) {
          const state = clone(node.state);
          const steps = visit(state, region, policy);
          if (!steps.length) continue;
          const sig = signature(state);
          if (variants.has(sig)) continue;
          variants.set(sig, { state, steps });
        }
        for (const [sig, { state, steps }] of variants) {
          const child = {
            state, steps: [...node.steps, ...steps.map(step => ({ ...step, at: step.at === 'ANY' ? region : step.at, stop: depth }))],
            stops: depth + 1, commands: node.commands + steps.length,
            assumed: node.assumed + steps.filter(step => step.assumed).length,
            buffers: node.buffers + steps.filter(step => step.buffer).length,
            walk: node.walk + (node.state.region ? Number(rules.distance(node.state.region, region)) || 0 : 0)
          };
          child.state.region = region;
          child.pendingLeft = pending(child.state);
          child.stopsLeft = child.pendingLeft ? stopsLeft(child.state) : 0;
          const key = sig + '#' + depth;
          if (seen.has(key) && better(seen.get(key), child) <= 0) continue;
          seen.set(key, child);
          next.push(child);
        }
      }
    }
    if (!next.length) break;
    next.sort(better);
    const complete = next.filter(node => node.pendingLeft === 0).sort((a, b) => a.assumed - b.assumed || a.buffers - b.buffers || a.commands - b.commands || a.walk - b.walk);
    if (complete.length) {
      const rank = node => [node.stops, node.assumed, node.buffers, node.commands, node.walk];
      const lexLess = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
      if (!found || lexLess(rank(complete[0]), rank(found))) found = complete[0];
      break;
    }
    if (next[0].pendingLeft < bestPending) { best = next[0]; bestPending = next[0].pendingLeft; }
    beam = next.slice(0, beamWidth);
  }
  }
  if (found) return finish(found);
  const partial = best || root;
  const blocked = [...partial.state.goals].filter(([key, goal]) => !idle(goal) && !partial.state.sold.has(key) && !partial.state.staged.has(key) && !(goal.kind === 'place' && goalMet(partial.state.pos.get(key), goal, rules)))
    .map(([key]) => units.get(key).name);
  if (blocked.length) issues.push(`No order of commands reaches the optimised layout for: ${[...new Set(blocked)].join(', ')}.`);
  return finish(partial, false);

  function finish(node, complete = true) {
    const steps = node.steps.map((step, index) => ({ ...step, index }));
    const finalPlaced = placedOf(node.state);
    // Steps issued from the Companion menu or the roster carry no room: they
    // join whichever stop they were issued in.
    let visitIndex = -1, lastStop = null;
    for (const step of steps) {
      if (step.stop !== lastStop) { visitIndex++; lastStop = step.stop; }
      step.visit = `route-${visitIndex}`;
    }
    // Goals as they ended up, after any identical droids traded jobs.
    const resolvedGoals = [...node.state.goals].filter(([, goal]) => goal.kind === 'place').map(([key, goal]) => ({ ...units.get(key), ...(node.state.pos.get(key) || { station: goal.station, slot: -1 }) }));
    return { steps, finalPlaced, resolvedGoals, complete: complete && issues.length === 0, stops: node.stops, commands: node.commands, assumed: node.assumed, issues, later,
      sold: [...node.state.sold], staged: [...node.state.staged.keys()], fused: [...node.state.fused] };
  }
}
