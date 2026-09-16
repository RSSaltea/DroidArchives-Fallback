# Optimise planning and validation

Optimise separates choosing useful jobs from finding commands that reach them.
The allocator is a heuristic: a suggested income layout is not proof that a
player can reach it, or that it is the global maximum.

## Pipeline

1. `placements()` reads the current physical base. `optimiseBase()` chooses jobs
   using the selected Protocol priority, and `optimisedPlacements()` allocates
   the target, kept copies, fusion reserves and sale candidates.
2. `normaliseProjectedForSteps()` matches identical unlocked copies to jobs,
   preferring the copy already in place. Sale and overflow candidates take part
   in that matching. Build readiness follows the original physical copy.
3. `protocolStepPlan()` is the shared occupied-slot simulator for all layouts.
   It tries legal direct commands, Lounge staging and compatible occupied swaps.
   Work follows `plannedWorkLanding()` rather than choosing an arbitrary empty
   destination. Equivalent earning slots can stay as they are. The simulator
   compares two command orders; it does not exhaustively search all routes.
4. When fusion is enabled, `withFusionSteps()` chooses batches and
   `scheduleFusionBuildSteps()` accounts for the table, build capacity, waits and
   results. Movement is planned again from that resulting physical state.
5. `resolveOptimiseProjection()` builds the preview and saved rows from the
   simulator's actual final occupants. A displaced copy cannot disappear into
   overflow merely because the allocator no longer needs it.
6. `validateOptimisePlan()` independently replays every command from the original
   base and compares every surviving copy with the projected state. Only a
   complete, validated plan can be applied.

`createOptimisePreview()` packages the steps, projection, final income and input
stamp together. Both step display styles use that same package. Apply saves its
rows and refuses a stale preview if the profile, planning settings or recorded
landings changed. Random fusion results are collected on a cloned projection;
cancelling any selection leaves the saved base untouched.

## Invariants

- Every copy has one identity (`source:unit`) and at most one physical position.
- Destinations must be unlocked, compatible and unoccupied, except for an
  explicit swap whose two destinations are both compatible.
- Locked copies and unfinished builds cannot move or be sold or fused.
- An ordinary move cannot fill an empty Build or Fusion Build position.
  A completed droid swapped into an occupied Build position remains completed.
- Identical copies do not swap with each other. Equivalent credit or Lounge
  slots do not justify extra commands; mission and locked assignments stay exact.
- Fusion consumes exactly three valid ingredients. Results occupy real Fusion
  Build capacity, including random results whose names are not known yet.
- Every initial copy must be placed, unplaced, sold or consumed exactly as the
  commands describe. Preview positions, readiness and saved rows must agree.
- A planner exception, unfinished route or failed replay blocks Apply in both
  the website and companion integration.

The validator is independent of the planner's transition logic, but uses shared
game rules for capacity, compatibility and Work destinations. Those rules still
depend on measured game behaviour. Cross-region Work predictions are labelled
in the instructions. If a recorded landing differs, the player must update Base
and regenerate; the app does not silently swap projected occupants to fit it.

## Regression checks

From the repository root:

```text
node --test tests/optimise-plan-validation.test.cjs tests/optimise-fusion-table.test.cjs tests/protocol.test.cjs tests/protocol-selling.test.cjs
node tests/optimise-movement-regression.cjs
node tests/optimise-fusion-apply-ui.cjs
node tests/full-lounge-route.cjs
node tests/session-2026-09-13/test-fusion-build-capacity.js
```

Browser checks require Playwright. Set `CHROME_PATH` to a Chromium browser for
the movement and full-Lounge tests, or `DROID_BROWSER_PATH` for the fusion UI
test. The UI tests use isolated browser profiles and local static servers.

The movement regression includes the reported four-copy Fusion Build chain:
two useful swaps, the identical RIC already on Upgrade Chip stays there, and the
displaced RIC remains physically in Fusion Build. Other checks cover full Lounge
cycles, mission slots, completed-build persistence, unreachable targets, fusion
capacity, cancellation, and blocked Apply calls.

When the current Fusion table conflicts with the proposed first batch, fusion
is deferred and the original movement and sale choices are preserved. The
fusion-table tests cover kept ingredients belonging to a later batch, mixed
table contents, protected occupants and a compatible first batch.
