const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../optimise-plan-validation.js'), 'utf8');
  const { validateOptimisePlan } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const slots = { WORKER: [0, 1, 2], LOUNGE: [0, 1, 2], BUILD: [0], FUSION_BUILD: [0, 1], FUSION: [0, 1, 2], PROTOCOL: [0] };
  const rules = {
    slots: station => slots[station] || [],
    canUse: (unit, station) => station !== 'PROTOCOL' || unit.protocol,
    isBuilding: unit => ['BUILD', 'FUSION_BUILD'].includes(unit.station) && !unit.built,
    workLanding: (unit, placed) => {
      const slot = slots.WORKER.find(slot => !placed.some(unit => unit.station === 'WORKER' && unit.slot === slot));
      return slot === undefined ? null : { station: 'WORKER', slot };
    }
  };
  const droid = (source, name, station, slot, extra = {}) => ({ source, unit: 0, name, variant: 'DEFAULT', ...(station ? { station, slot } : {}), ...extra });
  const at = (unit, station, slot) => ({ ...unit, station, slot });
  const position = unit => ({ station: unit.station, slot: unit.slot });
  const check = (initial, projected, steps) => validateOptimisePlan({ initial: { placed: [], overflow: [], ...initial }, projected: { placed: [], overflow: [], sell: [], ...projected }, steps, rules });
  let count = 0;
  const passes = result => { count++; assert.equal(result.ok, true, result.issues.join('\n')); };
  const rejects = (result, pattern) => { count++; assert.equal(result.ok, false); assert(result.issues.some(issue => pattern.test(issue)), result.issues.join('\n')); };
  const a = droid(0, 'A', 'LOUNGE', 0), b = droid(1, 'B', 'WORKER', 0);
  const move = { type: 'move', unit: a, from: position(a), to: { station: 'WORKER', slot: 0 }, workCommand: true };
  passes(check({ placed: [a] }, { placed: [at(a, 'WORKER', 0)] }, [move]));
  passes(check({ placed: [a] }, { placed: [at(a, 'FUSION', 0)] }, [{ ...move, to: { station: 'FUSION', slot: 0 }, workCommand: false }]));
  passes(check({ placed: [a] }, { placed: [at(a, 'WORKER', 0)] }, [{ ...move, from: 'LOUNGE', fromSlot: 0, to: 'WORKER', toSlot: 0, kind: 'work' }]));
  rejects(check({ placed: [a] }, { placed: [at(a, 'WORKER', 0)] }, [{ ...move, from: { station: 'LOUNGE', slot: 1 } }]), /stale/);
  rejects(check({ placed: [a] }, { placed: [at(a, 'WORKER', 1)] }, [{ ...move, to: { station: 'WORKER', slot: 1 } }]), /work command/);
  rejects(check({ placed: [a] }, { placed: [at(a, 'WORKER', 2)] }, [move]), /position.*does not match/);
  rejects(check({ placed: [a, b] }, { placed: [at(a, 'WORKER', 0), b] }, [move]), /occupied/);
  rejects(check({ placed: [a] }, { placed: [a] }, [{ ...move, to: { station: 'BUILD', slot: 0 }, workCommand: false }]), /cannot enter a build slot/);
  rejects(check({ placed: [a] }, { placed: [a] }, [{ ...move, to: { station: 'WORKER', slot: 99 } }]), /invalid destination/);
  for (const extra of [{ lockedSlot: true }, { station: 'BUILD', slot: 0, built: false }]) {
    const fixed = { ...a, ...extra };
    rejects(check({ placed: [fixed] }, { placed: [fixed] }, [{ ...move, unit: fixed, from: position(fixed) }]), /locked or still building/);
    rejects(check({ placed: [fixed] }, { sell: [fixed] }, [{ type: 'sell', unit: fixed }]), /locked or still building/);
    rejects(check({ placed: [fixed] }, {}, [{ type: 'fuse-in', unit: fixed }]), /locked or still building/);
  }
  const swap = { type: 'swap', unit: a, from: position(a), withUnit: b, withFrom: position(b) };
  passes(check({ placed: [a, b] }, { placed: [at(a, b.station, b.slot), at(b, a.station, a.slot)] }, [swap]));
  const completed = at({ ...b, built: true }, 'FUSION_BUILD', 0);
  passes(check({ placed: [a, completed] }, { placed: [at({ ...a, built: true }, 'FUSION_BUILD', 0), at(completed, 'LOUNGE', 0)] }, [{ ...swap, withUnit: completed, withFrom: position(completed) }]));
  passes(check({ placed: [a, completed] }, { placed: [at({ ...a, built: true }, 'WORKER', 0), at(completed, 'LOUNGE', 0)] }, [
    { ...swap, withUnit: completed, withFrom: position(completed) },
    { ...move, from: { station: 'FUSION_BUILD', slot: 0 } }
  ]));
  const same = { ...b, name: a.name };
  rejects(check({ placed: [a, same] }, { placed: [a, same] }, [{ ...swap, withUnit: same }]), /identical/);
  const protocol = droid(2, 'P', 'PROTOCOL', 0, { protocol: true });
  rejects(check({ placed: [a, protocol] }, { placed: [a, protocol] }, [{ ...swap, withUnit: protocol, withFrom: position(protocol) }]), /incompatible swap/);
  rejects(check({ placed: [a, a] }, { placed: [a] }, []), /duplicate identity/);
  rejects(check({ placed: [a, at(b, 'LOUNGE', 0)] }, { placed: [a] }, []), /duplicate occupancy/);
  rejects(check({ placed: [a] }, { placed: [a, a] }, []), /duplicate identity/);
  const overflow = droid(3, 'O');
  passes(check({ overflow: [overflow] }, { sell: [overflow] }, [{ type: 'sell', unit: overflow }]));
  passes(check({ overflow: [overflow] }, { placed: [at(overflow, 'LOUNGE', 0)] }, [{ type: 'move', unit: overflow, to: { station: 'LOUNGE', slot: 0 } }]));
  rejects(check({}, {}, [{ type: 'sell', unit: overflow }]), /missing droid/);
  rejects(check({ placed: [a] }, {}, []), /unexpected droid/);
  rejects(check({ placed: [a] }, { placed: [a] }, [{ type: 'note' }]), /incomplete/);
  rejects(check({ placed: [a] }, { placed: [a] }, [null, {}, { type: 'move' }, { type: 'swap' }, { type: 'fuse-result' }, { type: 'fuse' }]), /malformed/);

  const ingredients = ['A', 'B', 'C'].map((name, i) => droid(i, name, 'LOUNGE', i));
  const out = droid('made-1', 'D', 'FUSION_BUILD', 0, { built: false, fusionResult: true, variant: 'GOLD' });
  const fusion = {
    type: 'fuse', to: 'FUSION_BUILD', toSlot: 0, unit: { name: 'D', variant: 'GOLD' }, resultUnit: out,
    fusion: { spend: ingredients.map(unit => ({ name: unit.name, variant: unit.variant, count: 1 })), out: { name: 'D', variant: 'GOLD' } }
  };
  const fusionSteps = [...ingredients.map(unit => ({ type: 'fuse-in', unit })), fusion];
  passes(check({ placed: ingredients }, { placed: [out], fusionResults: [out] }, fusionSteps));
  const original = JSON.stringify({ ingredients, out, fusionSteps });
  check({ placed: ingredients }, { placed: [out] }, fusionSteps);
  assert.equal(JSON.stringify({ ingredients, out, fusionSteps }), original, 'Replay must not mutate source or projection');
  rejects(check({ placed: [out] }, { placed: [{ ...out, built: true }] }, []), /build readiness/);
  rejects(check({ placed: [{ ...a, lockedSlot: true }] }, { placed: [a] }, []), /Projected lock/);
  passes(check({ placed: ingredients }, { placed: [{ ...out, lockedSlot: false }] }, [...fusionSteps.slice(0, 3), { ...fusion, resultUnit: { ...out, lockedSlot: true } }]));
  const tableIngredients = ingredients.map(unit => at(unit, 'FUSION', unit.slot));
  passes(check({ placed: tableIngredients }, { placed: [out] }, [...tableIngredients.map(unit => ({ type: 'fuse-held', unit })), fusion]));
  rejects(check({ placed: ingredients }, { placed: [out] }, [{ type: 'fuse-held', unit: ingredients[0] }]), /not on the table/);
  rejects(check({ placed: ingredients }, { placed: [out] }, fusionSteps.slice(1)), /exactly three/);
  rejects(check({ placed: ingredients }, { placed: [out] }, [...fusionSteps.slice(0, 3), { ...fusion, fusion: { spend: [{ name: 'X', variant: 'DEFAULT', count: 3 }] } }]), /recipe/);
  rejects(check({ placed: [...ingredients, droid(10, 'Full', 'FUSION_BUILD', 0, { built: false })] }, { placed: [out] }, fusionSteps), /free valid Fusion Build/);
  const fourth = droid(11, 'Fourth', 'WORKER', 0);
  rejects(check({ placed: [...ingredients, fourth] }, {}, [...fusionSteps.slice(0, 3), { type: 'fuse-in', unit: fourth }]), /capacity/);
  const unknown = droid('unknown', 'Fusion result', 'FUSION_BUILD', 0, { fusionUnknown: true, built: false });
  passes(check({ placed: ingredients }, { fusionResults: [unknown] }, [...fusionSteps.slice(0, 3), { ...fusion, unit: null, resultUnit: unknown, fusion: { variant: 'DEFAULT', rarity: 'RARE' } }]));
  const legacyOut = { ...out, source: 'fusion-result-0' };
  passes(check({ placed: ingredients }, { placed: [legacyOut] }, [...fusionSteps.slice(0, 3), { ...fusion, resultUnit: undefined }]));
  const extra = [droid(20, 'E', 'WORKER', 0), droid(21, 'F', 'WORKER', 1)];
  const final = droid('made-2', 'G', 'FUSION_BUILD', 0, { built: false, variant: 'GOLD' });
  const chain = [
    ...fusionSteps,
    { type: 'fuse-result', unit: { name: 'D', variant: 'GOLD', count: 1 }, waitForBuild: true },
    ...extra.map(unit => ({ type: 'fuse-in', unit })),
    { type: 'fuse', to: 'FUSION_BUILD', toSlot: 0, unit: { name: 'G', variant: 'GOLD' }, resultUnit: final }
  ];
  passes(check({ placed: [...ingredients, ...extra] }, { placed: [final] }, chain));
  rejects(check({ placed: [...ingredients, ...extra] }, { placed: [final] }, chain.map(step => step.type === 'fuse-result' ? { ...step, waitForBuild: false } : step)), /explicit build wait/);
  rejects(check({ placed: [...ingredients, ...extra] }, { placed: [final] }, chain.map(step => step.type === 'fuse-result' ? { ...step, unit: { ...step.unit, count: 2 } } : step)), /results are missing/);
  rejects(check({ placed: [out] }, {}, [{ type: 'fuse-result', unit: { name: 'D', variant: 'GOLD', count: 1 }, waitForBuild: true }]), /results are missing/);
  console.log(`PASS: ${count} independent Optimise replay cases (moves, swaps, locks, capacity, Fusion chains and projection equality)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
