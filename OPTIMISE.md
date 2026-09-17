# Optimise planning and validation

Optimise separates choosing useful jobs from finding commands that reach them.
The allocator is a heuristic: a suggested income layout is not proof that it is
the global maximum. The route planner, on the other hand, only ever proposes
commands the game offers, and a plan is applied only after an independent
replay reaches the same layout.

## What the game lets a player do

Every command is given at the droid, from its menu: Work, Companion, Fusion,
Lounge, Customize, Sell. Nothing can be told "go to Astromech 3":

- **Work** sends the droid to the nearest free slot of its own type, measured
  from where it stands. Its own slot counts as occupied while it decides, so a
  droid whose room is full leaves for another room. Astromech mission slots
  (1, 3, 5, 7, 9) are taken before credit slots. When its own type is full it
  takes the nearest free slot of another productive type; a Worker droid was
  measured taking Battle before Astromech. The Upgrade Chip station is used only
  when everything else is full. Protocol droids go to the nearest free Protocol
  console, then overflow like the rest.
- **Lounge** stores the droid in the nearest free Lounge slot.
- **Fusion** puts it on the fusion table (three pads). **Companion** takes it
  along. **Sell** removes it.
- Build 1, 2 and 3 belong to the Worker, Astromech and Battle regions. A Build
  slot is only ever filled by crafting; it is never a move destination. Battle
  slots 6 and up are upstairs and count as their own stop.

These rules live in `optimiseRouteRules()` and are shared by the planner, the
validator and the slot log.

## Pipeline

1. `placements()` reads the current physical base.
2. `optimiseBase()` chooses jobs. It seeds from both a credit-first layout and
   the base as it stands, then runs a local search that charges every droid
   changing station a move threshold (`optimiseMinGainPercent`, default 0.5%
   of income), so equal-income reshuffles never win. Iconic candidates are
   tried as ranked prefixes rather than every subset.
3. `optimisedPlacements()` allocates the target: kept copies, fusion reserves,
   sale candidates and locked slots. A displaced droid with nowhere to go is
   sold when no rebirth needs it and nothing protects it; otherwise it stays
   in its slot and the newcomer returns to its own old slot.
   `repairReachableLayout()` then rejects cross-type placements the Work rule
   could never produce.
4. `safeOptimiseStepPlan()` normalises the projection, chooses the fusion
   batches whose three inputs are on the base now (`optimiseFusionBatches`),
   and asks `planOptimiseRoute()` in `optimise-route.js` for the walk.
5. `planOptimiseRoute()` runs a beam search over room visits. At each stop it
   issues every command that is legal now: Work when the predicted landing is
   the droid's goal, Lounge to buffer a droid whose goal is blocked, Fusion for
   batch inputs (one batch on the table at a time), Sell. Identical droids
   trade goals freely. The first pass only accepts landings the rules call
   certain; a second pass allows "assumed" landings (a Work that could reach
   more than one room) and marks them. Plans are ranked by stops, then assumed
   landings, then Lounge buffers, then commands, then walking distance. A
   layout no order of commands reaches is reported as an issue with the droids
   concerned.
6. `resolveOptimiseProjection()` rebuilds the preview and saved rows from the
   planner's final positions, and `validateOptimisePlan()` replays every
   command from the original base with the same rules. An assumed landing is
   accepted when its stated room is one of the options the rules allow.

`createOptimisePreview()` packages the steps, projection, final income and an
input stamp; it is cached until the profile, settings or recorded landings
change. Steps are grouped by stop in walking order. Ticking steps and choosing
"Apply ticked steps" replays only that prefix. The companion overlay receives
the same route grouped by room.

## Invariants

- Every copy has one identity (`source:unit`) and at most one physical position.
- A step is Sell, Work, Lounge, a fusion command or the fusion itself. There is
  no swap command and no move into a Build or Fusion Build slot.
- Locked copies and unfinished builds cannot move or be sold or fused.
- A Work step's destination is what the Work rule predicts from the droid's
  position and the occupancy at that moment, including its own slot.
- Fusion consumes exactly three inputs of one batch. Results occupy real
  Fusion Build capacity, including random results whose names are not known.
- Every initial copy is placed, sold or consumed exactly as the commands
  describe. Preview positions, readiness and saved rows must agree.
- A planner exception, unfinished route or failed replay blocks Apply in both
  the website and companion integration.

Cross-region Work predictions that depend on geometry are labelled in the
instructions. If a recorded landing differs, the player updates Base and
regenerates; the app never silently swaps projected occupants to fit.

## Base map

The Base page's map is drawn in code by `baseMapSvg()` shape for shape from the
player's traced map (`assets/map/map numbered *.png`): Astromech platform on
the left with its five landing pads, the tall Battle building top right with
its door at the bottom, the two-circle Lounge on the right, the Worker pod
ring bottom right with the Fusion lab circle against its side, the walkway
corridor between them and the small circle by the way into the base. Every
slot dot from that map keeps its measured position in `MAP_SPOTS`
(percentages of a 1136 by 992 drawing). Additions: the Upgrade Chip station
between the two stairs up to the platform, the Worker Craft console in front
of the Shipyard machine, the other Protocol consoles in front of their
region's Build slot (Battle Credits at the near end of the Battle row), Worker
Credits by the Rebirth stand, the Fusion pads and tanks, and Battle 6 and up
as a strip beside the Battle building so the whole base is one view. Every
slot stands on a floor pad in its region's colour, and the same coordinates
give the slot log its distances. Add `?mapgrid=1` to the address for a
lettered grid when describing a change.

## Regression checks

From the repository root:

```text
node --test tests/*.test.cjs
node tests/session-2026-09-13/test-protocol-optimise.js
node tests/optimise-movement-regression.cjs
node tests/optimise-fusion-apply-ui.cjs
node tests/full-lounge-route.cjs
```

`tests/optimise-route.test.cjs` covers the planner on its own: overflow
certainty, mission-first landings, a full room draining through the Lounge,
identical droids, Build never being a target, Protocol landings, fusion
batches and the validator replay. The browser checks need Playwright and
`CHROME_PATH` pointing at a Chromium browser; they use isolated profiles and
local static servers. The movement regression covers a finished Build droid
going to work with nothing swapped into its slot, identical copies needing no
commands, a Worker/Battle exchange buffering one room through the Lounge, and
an unreachable Build target being refused.
