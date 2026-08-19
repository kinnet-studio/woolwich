# Woolwich v2.1 — Shooting Gallery (Battle-Layer Foundation)

**Date:** 2026-08-19
**Status:** Approved
**Builds on:** v1 playground (`docs/superpowers/specs/2026-08-19-woolwich-playground-design.md`)
**Serves:** first sub-project of `docs/VISION.md` (operational battle layer)

## Purpose

Make terrain and target stands real: a "shooting gallery" page where the
player clicks a point on a procedurally generated map, the game computes a
firing solution through the real ballistics simulation, and the shell
destroys or suppresses platoon stands on impact. This slice establishes the
terrain system, the physics seams (launch origin, ground function), the
fire-solution solver, and the stand/damage model that every later battle
slice builds on.

## Scope (v2.1)

- Seeded procedural terrain heightfield, rendered in both views.
- Physics generalized to arbitrary launch origin and terrain impact.
- Click-to-fire: fire-solution solver with success / out-of-range /
  no-convergence outcomes; manual sliders remain as an advanced panel.
- Static enemy stands (infantry, armor) with strength and suppression;
  deterministic blast damage and suppression decay; wreck markers.
- New `gallery.html` page beside the untouched playground (`index.html`).
- One shell in flight at a time.

Out of scope (later slices): stand movement and orders, fog of war /
contacts, return fire and counter-battery, multiple simultaneous shells or
batteries, ECS adoption (trigger: when a second *behavior* system lands),
sound, save/load.

## Architecture

New modules alongside the v1 layout; the playground keeps working unchanged.

```
gallery.html               second page: two views + mission panel
src/
  terrain/
    prng.ts                mulberry32-style seeded PRNG
    generate.ts            value-noise heightfield generation
    terrain.ts             Terrain type + bilinear sample(x, y)
  solver/
    fireSolution.ts        solveFireMission(): vacuum guess + sim refinement
  world/
    stand.ts               Stand type, seeded placement on terrain
    damage.ts              applyBurst(), suppression decay
    world.ts               WorldState assembly (terrain, stands, battery)
  render/
    terrainTop.ts          hypsometric tint + contours (offscreen cache)
    terrainProfile.ts      side-view profile along a bearing
    standsTop.ts           stand/battery/wreck markers
  gallery/
    fireControl.ts         @ue-too/being state machine for interaction flow
    main.ts                page wiring: DOM events → state machine → render
    panel.ts               mission readout, seed control, advanced sliders
  physics/                 (modified, backward compatible — see below)
```

### Terrain (`src/terrain/`)

- `Terrain` value: square heightfield, extent 8 km × 8 km centered on the
  world origin, cell size 50 m (161 × 161 samples), elevations in meters.
- Generation: seeded PRNG (mulberry32) → 3–4 octaves of value noise,
  amplitude ≈ 120 m total relief, plus a flattened apron (radius ≈ 300 m,
  smooth blend) around the battery position so the gun sits on level ground.
  Same seed always produces the identical field.
- `sample(x, y)`: bilinear interpolation between grid samples; coordinates
  outside the extent clamp to the edge samples.

### Physics seams (`src/physics/`, backward compatible)

- `launchState(params, origin?: Vec3)` — launch from an arbitrary point;
  default remains `(0, 0, 0)`.
- `type GroundFn = (x: number, y: number) => number`. `predictPath` and
  `Simulation` accept an optional ground function; default is flat zero.
- **Impact rule (changed):** impact occurs at the first integration sample
  after launch where `z <= ground(x, y)` — the "descending only" condition
  is removed, because a shell can strike an upslope while still climbing.
  All v1 tests must still pass: on flat ground a ballistic arc only
  reaches z ≤ 0 while descending, so observable behavior there is
  unchanged.

### Fire solver (`src/solver/fireSolution.ts`)

`solveFireMission({target, muzzleSpeed, env, ground, origin})` returns
either `{ok: true, params: ShotParams, predicted: Trajectory}` or
`{ok: false, reason: "out-of-range" | "no-convergence", predicted?}`.

1. **Initial guess:** bearing from `atan2`; vacuum ballistics closed form
   for the high arc, including the launch/target height difference. A
   negative discriminant → `out-of-range`, returned immediately.
2. **Refinement:** up to 25 iterations through the real `predictPath` with
   the actual drag, wind, and terrain. Each iteration corrects azimuth by
   the angular miss and elevation by a secant step on the along-bearing
   range miss. Success when the horizontal miss distance ≤ 25 m.
3. **Non-convergence** (typically a masking ridge): return the best-effort
   trajectory so the UI can display where the shell actually ends up — the
   side view showing the arc dying on a ridge is the explanation.

The solver is deterministic and reusable (a future AI battery calls the
same function).

### Stands and damage (`src/world/`)

- `Stand = { id, kind: "infantry" | "armor", position: Vec3,
  strength: number (0–100), suppression: number (0–100) }`.
- Placement: a seeded scatter of stands (default 8) inside a target zone
  east of the battery (x ∈ [2000, 3500] m, y ∈ [−1000, 1000] m), each
  snapped to `terrain.sample`.
- `applyBurst(impact, stands)` — deterministic, no RNG:
  - Lethal radius 50 m: `strength -= 80 · (1 − d/50)`, multiplied by 1.0
    for infantry, 0.35 for armor.
  - Suppression radius 150 m: `suppression += 60 · (1 − d/150)`, clamped
    to 100, both kinds.
  - `strength ≤ 0` → destroyed; the stand remains as a wreck marker and
    ignores further bursts.
- Suppression decays at 5 points/second in the world update (driven by the
  same frame clock as the simulation).

### Gallery page (`gallery.html`, `src/gallery/`)

- Layout mirrors the playground: side view over top-down view, panel left.
- **Top view:** terrain rendered as hypsometric tint with contour lines
  every 20 m — drawn once per seed to an offscreen canvas and blitted each
  frame; battery marker (blue), stand markers (red; hollow/grey when
  destroyed), burst ring animation on impact.
- **Click-to-fire flow:** click a map point → `solveFireMission` → dashed
  solution arc in both views + mission readout (bearing, elevation, muzzle
  speed, time of flight, miss estimate) or the failure reason; the Fire
  button launches the solved shot; impact applies the burst.
- **Side view (bearing-relative):** plots distance-along-bearing `s` vs
  altitude, with the terrain profile along the current bearing filled
  beneath the arc; the shell's small lateral (cross-bearing) offset is
  ignored in this projection. Profile resamples when the bearing changes.
- **Panel:** mission readout; seed input + regenerate button (rebuilds
  terrain and stands, clears shots); destroyed/total tally; advanced
  section with the v1 environment and muzzle-speed sliders (any change
  invalidates the current solution, requiring a new click/solve).
- One shell in flight at a time; clicking during flight queues nothing —
  the click is ignored until impact.
- **Interaction flow is a finite state machine** (`@ue-too/being`, the
  azabu convention — no ad-hoc boolean interaction flags): states `READY`
  (accepts map clicks and Fire) and `IN_FLIGHT` (ignores both). Events:
  `mapClick`, `fire` (guarded — transitions to `IN_FLIGHT` only when a
  valid solution exists), `impact` (→ `READY`), `envChanged` (applies the
  environment; invalidates any current solution), `regenerate` (resets the
  world, → `READY`). Game actions (solve, launch, burst, reset) live in a
  context object of callbacks, so the machine is unit-testable headlessly.
  After impact the solution is invalidated only by `envChanged`, a new
  click, or `regenerate` — Fire may re-fire the same mission.

## Stack additions

- New dependency: `@ue-too/being` (^0.17.7), the state machine framework —
  used for the gallery's interaction flow per the azabu convention. All
  other stack choices carry over from the v1 spec (`@ue-too/board`,
  `@ue-too/math`, Bun, no UI framework).

## Error handling

- Solver failure modes are first-class results (`out-of-range`,
  `no-convergence` with best-effort trajectory), never exceptions.
- Terrain sampling outside the extent clamps; no holes, no NaN.
- Iteration caps everywhere (solver ≤ 25 refinements; `predictPath` keeps
  its `MAX_FLIGHT_TIME` truncation).
- Clicks with no valid solution leave the previous world state untouched.

## Testing

`bun test` (deterministic units):

- **Terrain:** same seed → identical field; different seed → different
  field; bilinear interpolation exact at samples and midpoints; clamping
  outside the extent.
- **Physics:** all v1 tests pass unchanged (flat default); launch from a
  non-zero origin; shell striking an ascending slope registers impact
  while `velocity.z > 0`.
- **Solver:** flat terrain + vacuum env → solution matches the closed form;
  with drag + crosswind → impact within 25 m of the target; unreachable
  range → `out-of-range`; deterministic (same inputs → identical output).
- **Damage:** falloff arithmetic at exact distances; armor multiplier;
  clamping; wreck immunity; suppression decay over simulated seconds.
- **Fire-control state machine:** exercised headlessly against a mock
  callback context — clicks solve in `READY`; `fire` is a no-op without a
  valid solution and transitions to `IN_FLIGHT` with one; clicks and fire
  are ignored in flight; `impact` returns to `READY`; `envChanged` and
  `regenerate` behave per state.

Rendering and the click-to-fire UX are verified manually in the browser,
per the v1 convention.
