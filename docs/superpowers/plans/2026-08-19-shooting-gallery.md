# Woolwich v2.1 Shooting Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second page (`gallery.html`) where the player clicks a point on procedurally generated terrain, the game solves a firing solution through the real ballistics sim, and the shell destroys/suppresses platoon stands on impact.

**Architecture:** Seeded heightfield terrain enters the existing physics through two backward-compatible seams (launch `origin`, `GroundFn` ground function; impact rule becomes `z <= ground(x,y)` after launch). A fire-solution solver uses the vacuum closed form as an initial guess and refines through `predictPath`. Stands and deterministic burst damage form a small `world/` layer. The playground (`index.html`) keeps working unchanged.

**Tech Stack:** Bun (dev server `bun index.html gallery.html`, `bun test`), TypeScript, `@ue-too/board` (existing dep), `@ue-too/being` ^0.17.7 (new dep — state machine framework for interaction flow).

**Spec:** `docs/superpowers/specs/2026-08-19-shooting-gallery-design.md`

## Global Constraints

- Terrain: square heightfield, extent 8 km × 8 km centered on the origin, cell size 50 m (161 × 161 samples), seeded PRNG (mulberry32), 3–4 octaves of value noise, total relief ≈ 120 m, flattened apron radius ≈ 300 m around the battery. Same seed → identical field, always. (Spec: Terrain)
- Physics changes must be backward compatible: `launchState(params, origin?)` defaults to `(0,0,0)`; `GroundFn` defaults to flat zero; **all 19 v1 tests must still pass unchanged**. (Spec: Physics seams)
- Impact rule: impact at the first integration sample after launch where `z <= ground(x, y)` — "descending only" removed. (Spec: Physics seams)
- Solver: vacuum high-arc closed form (with height difference) as initial guess; negative discriminant → `out-of-range`; ≤ 25 refinement iterations through the real `predictPath`; success = horizontal miss ≤ 25 m; non-convergence returns best-effort trajectory. Deterministic. (Spec: Fire solver)
- Damage (deterministic, no RNG): lethal radius 50 m, `strength -= 80 · (1 − d/50)`, kind multiplier infantry 1.0 / armor 0.35; suppression radius 150 m, `suppression += 60 · (1 − d/150)` clamped to 100; `strength ≤ 0` → wreck, ignores further bursts; suppression decays 5 points/second. (Spec: Stands and damage)
- Stand zone: x ∈ [2000, 3500] m, y ∈ [−1000, 1000] m, default 8 stands, snapped to terrain. (Spec: Stands and damage)
- One shell in flight at a time; clicks during flight are ignored. (Spec: Gallery page)
- Gallery interaction flow is a `@ue-too/being` finite state machine — states `READY`/`IN_FLIGHT`; `fire` guarded on a valid solution; game actions live in a callback context; no ad-hoc boolean interaction flags. After impact, Fire may re-fire the same mission until `envChanged`, a new click, or `regenerate` invalidates it. (Spec: Gallery page, Stack additions)
- Deps: `@ue-too/board`, `@ue-too/math`, plus new `@ue-too/being` ^0.17.7; no UI framework. Angle convention: degrees, 0° = +x east, CCW positive. SI units throughout.
- Deterministic units tested with `bun test`; rendering and click-to-fire UX verified manually in the browser. (Spec: Testing)

## File Structure

```
gallery.html                    new page
src/terrain/prng.ts             mulberry32
src/terrain/terrain.ts          Terrain type, sampleTerrain, groundFn
src/terrain/generate.ts         generateTerrain(seed)
src/solver/fireSolution.ts      solveFireMission()
src/world/stand.ts              Stand, placeStands
src/world/damage.ts             applyBurst, decaySuppression
src/world/world.ts              WorldState, createWorld
src/render/terrainTop.ts        buildTerrainImage, drawTerrainTop
src/render/terrainProfile.ts    sampleProfile, drawProfile
src/render/standsTop.ts         drawStandsTop, drawBattery, drawBurstRing
src/gallery/fireControl.ts      @ue-too/being interaction state machine
src/gallery/panel.ts            seed/fire/mission/tally/advanced sliders
src/gallery/main.ts             page wiring (DOM events → state machine)
src/physics/{types,shot,predict}.ts and src/sim.ts   (modified)
tests/{terrain,solver,world,fireControl}.test.ts   new; tests/physics.test.ts appended
```

---

### Task 1: Seeded PRNG

**Files:**
- Create: `src/terrain/prng.ts`
- Test: `tests/terrain.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `mulberry32(seed: number): () => number` — deterministic, values in [0, 1).

- [ ] **Step 1: Write the failing test**

Create `tests/terrain.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { mulberry32 } from "../src/terrain/prng";

describe("mulberry32", () => {
  test("same seed produces the same sequence", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });

  test("different seeds produce different sequences", () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });

  test("values stay in [0, 1)", () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/terrain.test.ts`
Expected: FAIL — cannot resolve `../src/terrain/prng`.

- [ ] **Step 3: Write the implementation**

Create `src/terrain/prng.ts`:

```typescript
/** Deterministic 32-bit PRNG (mulberry32). Returned function yields values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/terrain.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/terrain/prng.ts tests/terrain.test.ts
git commit -m "feat: seeded mulberry32 PRNG"
```

---

### Task 2: Terrain heightfield

**Files:**
- Create: `src/terrain/terrain.ts`
- Create: `src/terrain/generate.ts`
- Test: `tests/terrain.test.ts` (append)

**Interfaces:**
- Consumes: `mulberry32` (Task 1); `Vec3` not needed here.
- Produces:
  - `Terrain = { extent: number; cellSize: number; size: number; heights: Float64Array }` (row-major, index `iy * size + ix`, `ix` → +x east, `iy` → +y north; world x,y ∈ [−extent, extent])
  - `sampleTerrain(t: Terrain, x: number, y: number): number` — bilinear, clamps outside extent
  - `groundFn(t: Terrain): (x: number, y: number) => number`
  - `generateTerrain(seed: number): Terrain` — extent 4000, cellSize 50, size 161, relief ≈ ±112 m, apron radius 300 m around origin

- [ ] **Step 1: Write the failing test**

Append to `tests/terrain.test.ts`:

```typescript
import { generateTerrain } from "../src/terrain/generate";
import { sampleTerrain, type Terrain } from "../src/terrain/terrain";

describe("terrain", () => {
  test("same seed generates an identical field", () => {
    const a = generateTerrain(42);
    const b = generateTerrain(42);
    expect(a.heights).toEqual(b.heights);
  });

  test("different seeds differ", () => {
    const a = generateTerrain(1);
    const b = generateTerrain(2);
    let differs = false;
    for (let i = 0; i < a.heights.length; i++) {
      if (a.heights[i] !== b.heights[i]) { differs = true; break; }
    }
    expect(differs).toBe(true);
  });

  test("sample is exact at grid points and bilinear at midpoints", () => {
    const t: Terrain = {
      extent: 100, cellSize: 100, size: 3,
      heights: new Float64Array([0, 10, 20, 30, 40, 50, 60, 70, 80]),
    };
    // grid point (ix=1, iy=0) → world (0, -100) → height 10
    expect(sampleTerrain(t, 0, -100)).toBe(10);
    // midpoint along x between 0 and 10 at iy=0
    expect(sampleTerrain(t, -50, -100)).toBeCloseTo(5, 9);
    // midpoint along y between 10 (iy=0) and 40 (iy=1)
    expect(sampleTerrain(t, 0, -50)).toBeCloseTo(25, 9);
  });

  test("clamps outside the extent to edge values", () => {
    const t = generateTerrain(3);
    expect(sampleTerrain(t, -99999, 0)).toBe(sampleTerrain(t, -t.extent, 0));
    expect(sampleTerrain(t, 0, 99999)).toBe(sampleTerrain(t, 0, t.extent));
  });

  test("battery apron is flat near the origin", () => {
    const t = generateTerrain(42);
    const h0 = sampleTerrain(t, 0, 0);
    expect(Math.abs(sampleTerrain(t, 80, 0) - h0)).toBeLessThan(3);
    expect(Math.abs(sampleTerrain(t, 0, -80) - h0)).toBeLessThan(3);
  });

  test("relief stays within the octave amplitude budget", () => {
    const t = generateTerrain(9);
    for (const h of t.heights) expect(Math.abs(h)).toBeLessThanOrEqual(112.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/terrain.test.ts`
Expected: FAIL — cannot resolve `../src/terrain/generate`.

- [ ] **Step 3: Write terrain.ts**

Create `src/terrain/terrain.ts`:

```typescript
export type Terrain = {
  /** half-width of the square map in meters */
  extent: number;
  /** meters between grid samples */
  cellSize: number;
  /** samples per side */
  size: number;
  /** row-major; index = iy * size + ix; ix → +x (east), iy → +y (north) */
  heights: Float64Array;
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Bilinear interpolation; coordinates outside the extent clamp to the edge. */
export function sampleTerrain(t: Terrain, x: number, y: number): number {
  const gx = clamp((x + t.extent) / t.cellSize, 0, t.size - 1);
  const gy = clamp((y + t.extent) / t.cellSize, 0, t.size - 1);
  const x0 = Math.min(Math.floor(gx), t.size - 2);
  const y0 = Math.min(Math.floor(gy), t.size - 2);
  const fx = gx - x0;
  const fy = gy - y0;
  const s = t.size;
  const h00 = t.heights[y0 * s + x0]!;
  const h10 = t.heights[y0 * s + x0 + 1]!;
  const h01 = t.heights[(y0 + 1) * s + x0]!;
  const h11 = t.heights[(y0 + 1) * s + x0 + 1]!;
  return h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
}

export function groundFn(t: Terrain): (x: number, y: number) => number {
  return (x, y) => sampleTerrain(t, x, y);
}
```

- [ ] **Step 4: Write generate.ts**

Create `src/terrain/generate.ts`:

```typescript
import { mulberry32 } from "./prng";
import { sampleTerrain, type Terrain } from "./terrain";

const EXTENT = 4000;
const CELL_SIZE = 50;
const SIZE = 161; // 2 * EXTENT / CELL_SIZE + 1
const OCTAVES = [
  { spacing: 2000, amplitude: 60 },
  { spacing: 1000, amplitude: 30 },
  { spacing: 500, amplitude: 15 },
  { spacing: 250, amplitude: 7.5 },
];
const APRON_RADIUS = 300;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function generateTerrain(seed: number): Terrain {
  const heights = new Float64Array(SIZE * SIZE);
  for (let o = 0; o < OCTAVES.length; o++) {
    const { spacing, amplitude } = OCTAVES[o]!;
    const rand = mulberry32((seed * 4 + o + 1) >>> 0);
    const lattice = Math.ceil((2 * EXTENT) / spacing) + 2;
    const values = new Float64Array(lattice * lattice);
    for (let i = 0; i < values.length; i++) values[i] = rand();
    for (let iy = 0; iy < SIZE; iy++) {
      for (let ix = 0; ix < SIZE; ix++) {
        const gx = (ix * CELL_SIZE) / spacing;
        const gy = (iy * CELL_SIZE) / spacing;
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const fx = smoothstep(gx - x0);
        const fy = smoothstep(gy - y0);
        const v00 = values[y0 * lattice + x0]!;
        const v10 = values[y0 * lattice + x0 + 1]!;
        const v01 = values[(y0 + 1) * lattice + x0]!;
        const v11 = values[(y0 + 1) * lattice + x0 + 1]!;
        const n = v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
        const i = iy * SIZE + ix;
        heights[i] = heights[i]! + (n - 0.5) * 2 * amplitude;
      }
    }
  }
  const terrain: Terrain = { extent: EXTENT, cellSize: CELL_SIZE, size: SIZE, heights };
  // flatten an apron around the battery at the origin
  const h0 = sampleTerrain(terrain, 0, 0);
  for (let iy = 0; iy < SIZE; iy++) {
    for (let ix = 0; ix < SIZE; ix++) {
      const x = ix * CELL_SIZE - EXTENT;
      const y = iy * CELL_SIZE - EXTENT;
      const r = Math.hypot(x, y);
      if (r < APRON_RADIUS) {
        const i = iy * SIZE + ix;
        const t = smoothstep(r / APRON_RADIUS);
        heights[i] = h0 * (1 - t) + heights[i]! * t;
      }
    }
  }
  return terrain;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/terrain.test.ts`
Expected: PASS (all terrain tests).

- [ ] **Step 6: Commit**

```bash
git add src/terrain/terrain.ts src/terrain/generate.ts tests/terrain.test.ts
git commit -m "feat: seeded procedural terrain heightfield with bilinear sampling"
```

---

### Task 3: Physics seams — launch origin, ground function, new impact rule

**Files:**
- Modify: `src/physics/types.ts` (add `GroundFn`, `FLAT_GROUND`)
- Modify: `src/physics/shot.ts` (origin parameter)
- Modify: `src/physics/predict.ts` (options; impact rule)
- Modify: `src/sim.ts` (ground; fire origin; impact rule)
- Test: `tests/physics.test.ts` (append)

**Interfaces:**
- Consumes: existing physics modules (v1).
- Produces (backward compatible — every existing call site keeps compiling and behaving identically):
  - `type GroundFn = (x: number, y: number) => number`; `const FLAT_GROUND: GroundFn`
  - `launchState(params: ShotParams, origin?: Vec3): ProjectileState` (default `{x:0,y:0,z:0}`)
  - `type PredictOptions = { ground?: GroundFn; origin?: Vec3 }`; `predictPath(params, env, opts?: PredictOptions): Trajectory`
  - `new Simulation(env, ground?: GroundFn)`; `fire(params: ShotParams, origin?: Vec3)`
  - Impact rule everywhere: first sample after launch with `z <= ground(x, y)` (no descending requirement).

- [ ] **Step 1: Write the failing tests**

Append to `tests/physics.test.ts`:

```typescript
import type { GroundFn } from "../src/physics/types";

describe("terrain-aware physics", () => {
  test("launchState accepts a launch origin", () => {
    const s = launchState({ elevationDeg: 45, azimuthDeg: 0, muzzleSpeed: 100 }, { x: 100, y: 200, z: 50 });
    expect(s.position).toEqual({ x: 100, y: 200, z: 50 });
  });

  test("a shell hits an ascending wall while still climbing", () => {
    // vertical wall 400 m tall starting at x = 200
    const wall: GroundFn = (x) => (x > 200 ? 400 : 0);
    const shot = { elevationDeg: 30, azimuthDeg: 0, muzzleSpeed: 150 };
    const hit = predictPath(shot, CALM, { ground: wall });
    // apex of this shot is at t ≈ 7.6 s; the wall is reached at t ≈ 1.5 s, still ascending
    expect(hit.impact).not.toBeNull();
    expect(hit.impact!.x).toBeGreaterThan(200);
    expect(hit.impact!.x).toBeLessThan(215);
    expect(hit.flightTime).toBeLessThan(2);
    const flat = predictPath(shot, CALM);
    expect(flat.impact!.x).toBeGreaterThan(1500);
  });

  test("launching from altitude over flat ground lands at z <= 0 with extended flight", () => {
    const t = predictPath(
      { elevationDeg: 0, azimuthDeg: 0, muzzleSpeed: 50 },
      CALM,
      { origin: { x: 100, y: 200, z: 300 } },
    );
    const expectedFall = Math.sqrt((2 * 300) / CALM.gravity); // ≈ 7.82 s
    expect(t.impact).not.toBeNull();
    expect(t.impact!.z).toBeLessThanOrEqual(0);
    expect(t.flightTime).toBeCloseTo(expectedFall, 1);
    expect(t.impact!.x).toBeCloseTo(100 + 50 * expectedFall, -1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/physics.test.ts`
Expected: FAIL — `launchState` rejects a second argument / `predictPath` ignores options (type errors or wrong results).

- [ ] **Step 3: Implement the seams**

In `src/physics/types.ts`, append:

```typescript
/** Terrain elevation lookup; the physics treats z <= ground(x, y) as impact. */
export type GroundFn = (x: number, y: number) => number;

export const FLAT_GROUND: GroundFn = () => 0;
```

In `src/physics/shot.ts`, replace `launchState` with:

```typescript
export function launchState(
  params: ShotParams,
  origin: Vec3 = { x: 0, y: 0, z: 0 },
): ProjectileState {
  const elevation = params.elevationDeg * DEG_TO_RAD;
  const azimuth = params.azimuthDeg * DEG_TO_RAD;
  const horizontal = params.muzzleSpeed * Math.cos(elevation);
  return {
    position: { x: origin.x, y: origin.y, z: origin.z },
    velocity: {
      x: horizontal * Math.cos(azimuth),
      y: horizontal * Math.sin(azimuth),
      z: params.muzzleSpeed * Math.sin(elevation),
    },
    time: 0,
  };
}
```

(Update the `Vec3` import in shot.ts: `import { DEG_TO_RAD, type ProjectileState, type ShotParams, type Vec3 } from "./types";`)

In `src/physics/predict.ts`, replace `predictPath` with:

```typescript
import { FLAT_GROUND, type Environment, type GroundFn, type ShotParams, type Vec3 } from "./types";

export type PredictOptions = { ground?: GroundFn; origin?: Vec3 };

export function predictPath(
  params: ShotParams,
  env: Environment,
  opts: PredictOptions = {},
): Trajectory {
  const ground = opts.ground ?? FLAT_GROUND;
  let state = launchState(params, opts.origin);
  const points: Vec3[] = [state.position];
  while (state.time < MAX_FLIGHT_TIME) {
    state = stepState(state, env, FIXED_DT);
    points.push(state.position);
    if (state.position.z <= ground(state.position.x, state.position.y)) {
      return { points, impact: state.position, flightTime: state.time, truncated: false };
    }
  }
  return { points, impact: null, flightTime: state.time, truncated: true };
}
```

In `src/sim.ts`:

```typescript
import { FIXED_DT, stepState } from "./physics/integrator";
import { launchState } from "./physics/shot";
import { FLAT_GROUND, type Environment, type GroundFn, type ProjectileState, type ShotParams, type Vec3 } from "./physics/types";

export class Simulation {
  env: Environment;
  ground: GroundFn;
  state: ProjectileState | null = null;
  impact: Vec3 | null = null;
  paused = false;
  timeScale = 1;
  private accumulator = 0;

  constructor(env: Environment, ground: GroundFn = FLAT_GROUND) {
    this.env = env;
    this.ground = ground;
  }

  fire(params: ShotParams, origin?: Vec3): void {
    this.state = launchState(params, origin);
    this.impact = null;
    this.accumulator = 0;
  }

  advance(elapsedSeconds: number): void {
    if (this.paused || !this.state || this.impact) return;
    this.accumulator += elapsedSeconds * this.timeScale;
    while (this.accumulator >= FIXED_DT && !this.impact) {
      this.accumulator -= FIXED_DT;
      this.integrateOneStep();
    }
  }

  stepFrame(): void {
    if (!this.state || this.impact) return;
    this.integrateOneStep();
  }

  private integrateOneStep(): void {
    this.state = stepState(this.state!, this.env, FIXED_DT);
    if (this.state.position.z <= this.ground(this.state.position.x, this.state.position.y)) {
      this.impact = this.state.position;
    }
  }
}
```

- [ ] **Step 4: Run the FULL suite to verify new tests pass and v1 does not regress**

Run: `bun test`
Expected: PASS — every pre-existing test (19) plus the 3 new ones. If any v1 test fails, the seam is not backward compatible: stop and fix (do not edit v1 tests).

- [ ] **Step 5: Commit**

```bash
git add src/physics/types.ts src/physics/shot.ts src/physics/predict.ts src/sim.ts tests/physics.test.ts
git commit -m "feat: launch origin and terrain ground function in physics core"
```

---

### Task 4: Fire-solution solver

**Files:**
- Create: `src/solver/fireSolution.ts`
- Test: `tests/solver.test.ts`

**Interfaces:**
- Consumes: `predictPath`, `PredictOptions` (Task 3), `Trajectory` (v1), `GroundFn`, `FLAT_GROUND`, `Environment`, `ShotParams`, `Vec3`, `DEG_TO_RAD`.
- Produces:
  - `FireMission = { target: {x: number; y: number}; muzzleSpeed: number; env: Environment; ground?: GroundFn; origin?: Vec3 }`
  - `FireSolution = { ok: true; params: ShotParams; predicted: Trajectory } | { ok: false; reason: "out-of-range" | "no-convergence"; predicted?: Trajectory }`
  - `solveFireMission(mission: FireMission): FireSolution` — deterministic; tolerance 25 m; ≤ 25 iterations.

- [ ] **Step 1: Write the failing tests**

Create `tests/solver.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import type { Environment, GroundFn } from "../src/physics/types";
import { solveFireMission } from "../src/solver/fireSolution";

const VACUUM: Environment = { gravity: 9.81, dragCoefficient: 0, windSpeed: 0, windDirectionDeg: 0 };

describe("solveFireMission", () => {
  test("flat vacuum solution matches the closed form and hits within tolerance", () => {
    const r = solveFireMission({ target: { x: 2000, y: 0 }, muzzleSpeed: 150, env: VACUUM });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // closed form high arc: tanθ = (v² + √(v⁴ − g²R²)) / (gR)
    const v2 = 150 * 150;
    const g = 9.81;
    const expected = Math.atan2(v2 + Math.sqrt(v2 * v2 - g * g * 2000 * 2000), g * 2000) * (180 / Math.PI);
    expect(r.params.elevationDeg).toBeCloseTo(expected, 0);
    const miss = Math.hypot(r.predicted.impact!.x - 2000, r.predicted.impact!.y - 0);
    expect(miss).toBeLessThanOrEqual(25);
  });

  test("converges under drag and crosswind", () => {
    const env: Environment = { gravity: 9.81, dragCoefficient: 0.0003, windSpeed: 10, windDirectionDeg: 90 };
    const r = solveFireMission({ target: { x: 1800, y: 400 }, muzzleSpeed: 220, env });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const miss = Math.hypot(r.predicted.impact!.x - 1800, r.predicted.impact!.y - 400);
    expect(miss).toBeLessThanOrEqual(25);
  });

  test("reports out-of-range when the vacuum discriminant is negative", () => {
    const r = solveFireMission({ target: { x: 5000, y: 0 }, muzzleSpeed: 150, env: VACUUM });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("out-of-range");
  });

  test("reports no-convergence with a best-effort trajectory when a ridge masks the target", () => {
    const ridge: GroundFn = (x) => (x > 900 && x < 1100 ? 2000 : 0);
    const r = solveFireMission({ target: { x: 2000, y: 0 }, muzzleSpeed: 150, env: VACUUM, ground: ridge });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("no-convergence");
    expect(r.predicted?.impact?.x).toBeGreaterThan(850);
    expect(r.predicted?.impact?.x).toBeLessThan(1150);
  });

  test("is deterministic", () => {
    const env: Environment = { gravity: 9.81, dragCoefficient: 0.0003, windSpeed: 15, windDirectionDeg: -45 };
    const a = solveFireMission({ target: { x: 1500, y: -300 }, muzzleSpeed: 200, env });
    const b = solveFireMission({ target: { x: 1500, y: -300 }, muzzleSpeed: 200, env });
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/solver.test.ts`
Expected: FAIL — cannot resolve `../src/solver/fireSolution`.

- [ ] **Step 3: Write the implementation**

Create `src/solver/fireSolution.ts`:

```typescript
import { predictPath, type Trajectory } from "../physics/predict";
import { FLAT_GROUND, type Environment, type GroundFn, type ShotParams, type Vec3 } from "../physics/types";

export type FireMission = {
  target: { x: number; y: number };
  muzzleSpeed: number;
  env: Environment;
  ground?: GroundFn;
  origin?: Vec3;
};

export type FireSolution =
  | { ok: true; params: ShotParams; predicted: Trajectory }
  | { ok: false; reason: "out-of-range" | "no-convergence"; predicted?: Trajectory };

const TOLERANCE = 25; // meters, horizontal miss distance
const MAX_ITERATIONS = 25;
const MAX_STEP_DEG = 10;
const RAD_TO_DEG = 180 / Math.PI;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function solveFireMission(mission: FireMission): FireSolution {
  const ground = mission.ground ?? FLAT_GROUND;
  const origin = mission.origin ?? { x: 0, y: 0, z: 0 };
  const { target, muzzleSpeed, env } = mission;
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const range = Math.hypot(dx, dy);
  const dh = ground(target.x, target.y) - origin.z;

  // vacuum high-arc initial guess with height difference:
  // tanθ = (v² + √(v⁴ − g(gR² + 2Δh·v²))) / (gR)
  const v2 = muzzleSpeed * muzzleSpeed;
  const g = env.gravity;
  const disc = v2 * v2 - g * (g * range * range + 2 * dh * v2);
  if (g <= 0 || range === 0 || disc < 0) {
    return { ok: false, reason: "out-of-range" };
  }
  let elevationDeg = Math.atan2(v2 + Math.sqrt(disc), g * range) * RAD_TO_DEG;
  let azimuthDeg = Math.atan2(dy, dx) * RAD_TO_DEG;
  const targetBearing = Math.atan2(dy, dx);

  let prev: { elevationDeg: number; along: number } | null = null;
  let best: { trajectory: Trajectory; miss: number } | null = null;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const params: ShotParams = { elevationDeg, azimuthDeg, muzzleSpeed };
    const trajectory = predictPath(params, env, { ground, origin });
    if (!trajectory.impact) {
      return { ok: false, reason: "no-convergence", predicted: best?.trajectory ?? trajectory };
    }
    const ix = trajectory.impact.x - origin.x;
    const iy = trajectory.impact.y - origin.y;
    const miss = Math.hypot(trajectory.impact.x - target.x, trajectory.impact.y - target.y);
    if (best === null || miss < best.miss) best = { trajectory, miss };
    if (miss <= TOLERANCE) {
      return { ok: true, params, predicted: trajectory };
    }
    // azimuth: rotate by the bearing error between target and impact (as seen from the origin)
    const bearingErr = (targetBearing - Math.atan2(iy, ix)) * RAD_TO_DEG;
    azimuthDeg += clamp(bearingErr, -MAX_STEP_DEG, MAX_STEP_DEG);
    // elevation: secant step on the along-bearing distance
    // (high arc: raising elevation shortens range)
    const along = Math.hypot(ix, iy);
    let step: number;
    if (prev === null || Math.abs(along - prev.along) < 1e-6) {
      step = along < range ? -2 : 2;
    } else {
      step = ((range - along) * (elevationDeg - prev.elevationDeg)) / (along - prev.along);
    }
    prev = { elevationDeg, along };
    elevationDeg = clamp(elevationDeg + clamp(step, -MAX_STEP_DEG, MAX_STEP_DEG), 1, 89);
  }
  return { ok: false, reason: "no-convergence", predicted: best?.trajectory };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/solver.test.ts`
Expected: PASS (5 tests). If the drag+crosswind case fails to converge, do NOT widen the tolerance — report the miss distance and iteration trace as a finding.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test` — expected all suites PASS.

```bash
git add src/solver/fireSolution.ts tests/solver.test.ts
git commit -m "feat: fire-solution solver with vacuum guess and sim refinement"
```

---

### Task 5: Stands, damage, and world state

**Files:**
- Create: `src/world/stand.ts`
- Create: `src/world/damage.ts`
- Create: `src/world/world.ts`
- Test: `tests/world.test.ts`

**Interfaces:**
- Consumes: `mulberry32` (Task 1), `Terrain`/`sampleTerrain`/`groundFn` (Task 2), `generateTerrain` (Task 2), `Vec3`/`GroundFn` (Task 3).
- Produces:
  - `StandKind = "infantry" | "armor"`; `Stand = { id: string; kind: StandKind; position: Vec3; strength: number; suppression: number }`
  - `placeStands(seed: number, terrain: Terrain, count?: number): Stand[]` (default 8; zone x ∈ [2000, 3500], y ∈ [−1000, 1000]; z snapped to terrain)
  - `applyBurst(impact: Vec3, stands: Stand[]): void`; `decaySuppression(stands: Stand[], dtSeconds: number): void`; exported constants `LETHAL_RADIUS = 50`, `SUPPRESS_RADIUS = 150`, `SUPPRESSION_DECAY_PER_SECOND = 5`
  - `WorldState = { seed: number; terrain: Terrain; ground: GroundFn; stands: Stand[]; battery: { position: Vec3; muzzleSpeed: number } }`; `createWorld(seed: number, muzzleSpeed?: number): WorldState` (default muzzleSpeed 250)

- [ ] **Step 1: Write the failing tests**

Create `tests/world.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { generateTerrain } from "../src/terrain/generate";
import { sampleTerrain } from "../src/terrain/terrain";
import { applyBurst, decaySuppression } from "../src/world/damage";
import { placeStands, type Stand } from "../src/world/stand";
import { createWorld } from "../src/world/world";

function stand(kind: "infantry" | "armor", x: number, y: number): Stand {
  return { id: "t", kind, position: { x, y, z: 0 }, strength: 100, suppression: 0 };
}

describe("placeStands", () => {
  const terrain = generateTerrain(42);

  test("places stands inside the target zone, snapped to terrain, deterministically", () => {
    const a = placeStands(42, terrain);
    const b = placeStands(42, terrain);
    expect(a).toEqual(b);
    expect(a.length).toBe(8);
    for (const s of a) {
      expect(s.position.x).toBeGreaterThanOrEqual(2000);
      expect(s.position.x).toBeLessThanOrEqual(3500);
      expect(s.position.y).toBeGreaterThanOrEqual(-1000);
      expect(s.position.y).toBeLessThanOrEqual(1000);
      expect(s.position.z).toBe(sampleTerrain(terrain, s.position.x, s.position.y));
      expect(s.strength).toBe(100);
      expect(s.suppression).toBe(0);
    }
  });
});

describe("applyBurst", () => {
  test("direct hit on infantry: strength 100 → 20; on armor: 100 → 72", () => {
    const inf = stand("infantry", 0, 0);
    const arm = stand("armor", 0, 0);
    applyBurst({ x: 0, y: 0, z: 0 }, [inf, arm]);
    expect(inf.strength).toBeCloseTo(20, 9);
    expect(arm.strength).toBeCloseTo(72, 9);
  });

  test("linear falloff: infantry at 25 m loses 40", () => {
    const s = stand("infantry", 25, 0);
    applyBurst({ x: 0, y: 0, z: 0 }, [s]);
    expect(s.strength).toBeCloseTo(60, 9);
  });

  test("outside lethal but inside suppression radius: no strength loss, suppression rises", () => {
    const s = stand("infantry", 60, 0);
    applyBurst({ x: 0, y: 0, z: 0 }, [s]);
    expect(s.strength).toBe(100);
    expect(s.suppression).toBeCloseTo(60 * (1 - 60 / 150), 9);
  });

  test("suppression clamps at 100 and strength floors at 0; wrecks ignore later bursts", () => {
    const s = stand("infantry", 0, 0);
    applyBurst({ x: 0, y: 0, z: 0 }, [s]);
    applyBurst({ x: 0, y: 0, z: 0 }, [s]);
    expect(s.strength).toBe(0);
    expect(s.suppression).toBe(100);
    const wreckSuppression = s.suppression;
    applyBurst({ x: 0, y: 0, z: 0 }, [s]);
    expect(s.strength).toBe(0);
    expect(s.suppression).toBe(wreckSuppression);
  });

  test("suppression decays at 5 points per second and floors at 0", () => {
    const s = stand("infantry", 100, 0);
    applyBurst({ x: 0, y: 0, z: 0 }, [s]);
    const start = s.suppression;
    decaySuppression([s], 2);
    expect(s.suppression).toBeCloseTo(start - 10, 9);
    decaySuppression([s], 999);
    expect(s.suppression).toBe(0);
  });
});

describe("createWorld", () => {
  test("assembles terrain, stands, and a battery on the terrain surface", () => {
    const w = createWorld(7);
    expect(w.stands.length).toBe(8);
    expect(w.battery.position.z).toBe(sampleTerrain(w.terrain, 0, 0));
    expect(w.battery.muzzleSpeed).toBe(250);
    expect(w.ground(1234, -567)).toBe(sampleTerrain(w.terrain, 1234, -567));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/world.test.ts`
Expected: FAIL — cannot resolve `../src/world/damage`.

- [ ] **Step 3: Write the implementations**

Create `src/world/stand.ts`:

```typescript
import type { Vec3 } from "../physics/types";
import { mulberry32 } from "../terrain/prng";
import { sampleTerrain, type Terrain } from "../terrain/terrain";

export type StandKind = "infantry" | "armor";

export type Stand = {
  id: string;
  kind: StandKind;
  position: Vec3;
  /** 0..100; 0 = destroyed (wreck) */
  strength: number;
  /** 0..100 */
  suppression: number;
};

const ZONE = { xMin: 2000, xMax: 3500, yMin: -1000, yMax: 1000 };

export function placeStands(seed: number, terrain: Terrain, count = 8): Stand[] {
  const rand = mulberry32((seed ^ 0x5747414e) >>> 0); // decorrelated from the terrain stream
  const stands: Stand[] = [];
  for (let i = 0; i < count; i++) {
    const x = ZONE.xMin + rand() * (ZONE.xMax - ZONE.xMin);
    const y = ZONE.yMin + rand() * (ZONE.yMax - ZONE.yMin);
    stands.push({
      id: `stand-${i + 1}`,
      kind: rand() < 0.5 ? "infantry" : "armor",
      position: { x, y, z: sampleTerrain(terrain, x, y) },
      strength: 100,
      suppression: 0,
    });
  }
  return stands;
}
```

Create `src/world/damage.ts`:

```typescript
import type { Vec3 } from "../physics/types";
import type { Stand } from "./stand";

export const LETHAL_RADIUS = 50;
export const SUPPRESS_RADIUS = 150;
export const SUPPRESSION_DECAY_PER_SECOND = 5;
const MAX_STRENGTH_DAMAGE = 80;
const MAX_SUPPRESSION = 60;
const KIND_MULTIPLIER = { infantry: 1.0, armor: 0.35 } as const;

/** Deterministic burst: linear falloff, no RNG. Wrecks (strength 0) are ignored. */
export function applyBurst(impact: Vec3, stands: Stand[]): void {
  for (const stand of stands) {
    if (stand.strength <= 0) continue;
    const d = Math.hypot(stand.position.x - impact.x, stand.position.y - impact.y);
    if (d < LETHAL_RADIUS) {
      const damage = MAX_STRENGTH_DAMAGE * (1 - d / LETHAL_RADIUS) * KIND_MULTIPLIER[stand.kind];
      stand.strength = Math.max(0, stand.strength - damage);
    }
    if (d < SUPPRESS_RADIUS) {
      stand.suppression = Math.min(100, stand.suppression + MAX_SUPPRESSION * (1 - d / SUPPRESS_RADIUS));
    }
  }
}

export function decaySuppression(stands: Stand[], dtSeconds: number): void {
  for (const stand of stands) {
    stand.suppression = Math.max(0, stand.suppression - SUPPRESSION_DECAY_PER_SECOND * dtSeconds);
  }
}
```

Create `src/world/world.ts`:

```typescript
import type { GroundFn, Vec3 } from "../physics/types";
import { generateTerrain } from "../terrain/generate";
import { groundFn, sampleTerrain, type Terrain } from "../terrain/terrain";
import { placeStands, type Stand } from "./stand";

export type WorldState = {
  seed: number;
  terrain: Terrain;
  ground: GroundFn;
  stands: Stand[];
  battery: { position: Vec3; muzzleSpeed: number };
};

export function createWorld(seed: number, muzzleSpeed = 250): WorldState {
  const terrain = generateTerrain(seed);
  return {
    seed,
    terrain,
    ground: groundFn(terrain),
    stands: placeStands(seed, terrain),
    battery: { position: { x: 0, y: 0, z: sampleTerrain(terrain, 0, 0) }, muzzleSpeed },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/world.test.ts`
Expected: PASS. Note: the "direct hit" test relies on burst order — infantry at d=0 gets suppression 60 on first burst, 100 (clamped) on second.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test` — all suites PASS.

```bash
git add src/world tests/world.test.ts
git commit -m "feat: platoon stands with deterministic burst damage and suppression"
```

---

### Task 6: Terrain and stand renderers

**Files:**
- Create: `src/render/terrainTop.ts`
- Create: `src/render/terrainProfile.ts`
- Create: `src/render/standsTop.ts`
- Test: `tests/terrain.test.ts` (append — `sampleProfile` only; canvas drawing is manual-verify)

**Interfaces:**
- Consumes: `Terrain`, `sampleTerrain` (Task 2), `Stand` (Task 5), `Vec3` (Task 3).
- Produces:
  - `buildTerrainImage(terrain: Terrain): HTMLCanvasElement` — offscreen hypsometric tint + contour strokes every 20 m band; image row 0 = north edge (y = +extent)
  - `drawTerrainTop(ctx, terrain, image): void` — blits the image into world coordinates under the y-up transform
  - `ProfilePoint = { s: number; z: number }`; `sampleProfile(terrain, origin: Vec3, bearingDeg: number, maxS: number, step?: number): ProfilePoint[]` (default step 25)
  - `drawProfile(ctx, profile: ProfilePoint[], floorZ: number): void` — filled silhouette
  - `drawStandsTop(ctx, stands: Stand[]): void`; `drawBattery(ctx, position: Vec3): void`; `drawBurstRing(ctx, impact: Vec3, ageSeconds: number): void`

- [ ] **Step 1: Write the failing test for sampleProfile**

Append to `tests/terrain.test.ts`:

```typescript
import { sampleProfile } from "../src/render/terrainProfile";

describe("sampleProfile", () => {
  const flat: Terrain = {
    extent: 1000, cellSize: 1000, size: 3,
    heights: new Float64Array(9).fill(42),
  };

  test("flat terrain gives a constant profile with correct s spacing", () => {
    const p = sampleProfile(flat, { x: 0, y: 0, z: 0 }, 30, 500, 100);
    expect(p.length).toBe(6);
    expect(p[0]).toEqual({ s: 0, z: 42 });
    expect(p[5]!.s).toBe(500);
    for (const pt of p) expect(pt.z).toBe(42);
  });

  test("bearing 0 samples along +x", () => {
    const t: Terrain = {
      extent: 100, cellSize: 100, size: 3,
      heights: new Float64Array([0, 0, 0, 5, 10, 15, 0, 0, 0]), // middle row rises eastward
    };
    const p = sampleProfile(t, { x: -100, y: 0, z: 0 }, 0, 200, 100);
    expect(p.map((q) => q.z)).toEqual([5, 10, 15]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/terrain.test.ts`
Expected: FAIL — cannot resolve `../src/render/terrainProfile`.

- [ ] **Step 3: Write terrainProfile.ts**

Create `src/render/terrainProfile.ts`:

```typescript
import { DEG_TO_RAD, type Vec3 } from "../physics/types";
import { sampleTerrain, type Terrain } from "../terrain/terrain";

export type ProfilePoint = { s: number; z: number };

/** Terrain elevations along a bearing from an origin, at fixed s spacing. */
export function sampleProfile(
  terrain: Terrain,
  origin: Vec3,
  bearingDeg: number,
  maxS: number,
  step = 25,
): ProfilePoint[] {
  const rad = bearingDeg * DEG_TO_RAD;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const points: ProfilePoint[] = [];
  for (let s = 0; s <= maxS; s += step) {
    points.push({ s, z: sampleTerrain(terrain, origin.x + cos * s, origin.y + sin * s) });
  }
  return points;
}

export function drawProfile(ctx: CanvasRenderingContext2D, profile: ProfilePoint[], floorZ: number): void {
  if (profile.length < 2) return;
  ctx.save();
  ctx.fillStyle = "rgba(96, 116, 96, 0.55)";
  ctx.beginPath();
  ctx.moveTo(profile[0]!.s, floorZ);
  for (const p of profile) ctx.lineTo(p.s, p.z);
  ctx.lineTo(profile[profile.length - 1]!.s, floorZ);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/terrain.test.ts`
Expected: PASS.

- [ ] **Step 5: Write terrainTop.ts**

Create `src/render/terrainTop.ts`:

```typescript
import type { Terrain } from "../terrain/terrain";

const BAND_METERS = 20;
const PX_PER_CELL = 4;

/** Offscreen hypsometric tint with contour strokes at 20 m band boundaries. Image row 0 = north edge (y = +extent). */
export function buildTerrainImage(terrain: Terrain): HTMLCanvasElement {
  const off = document.createElement("canvas");
  off.width = terrain.size * PX_PER_CELL;
  off.height = terrain.size * PX_PER_CELL;
  const ctx = off.getContext("2d")!;
  let min = Infinity;
  let max = -Infinity;
  for (const h of terrain.heights) {
    if (h < min) min = h;
    if (h > max) max = h;
  }
  const bandOf = (h: number) => Math.floor((h - min) / BAND_METERS);
  const bandCount = bandOf(max) + 1;
  const px = (ix: number) => ix * PX_PER_CELL;
  const py = (iy: number) => (terrain.size - 1 - iy) * PX_PER_CELL;

  for (let iy = 0; iy < terrain.size; iy++) {
    for (let ix = 0; ix < terrain.size; ix++) {
      const h = terrain.heights[iy * terrain.size + ix]!;
      const t = bandCount > 1 ? bandOf(h) / (bandCount - 1) : 0;
      // dark green lowlands → pale tan highlands
      const r = Math.round(52 + t * 130);
      const g = Math.round(84 + t * 90);
      const b = Math.round(52 + t * 60);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(px(ix), py(iy), PX_PER_CELL, PX_PER_CELL);
    }
  }
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  for (let iy = 0; iy < terrain.size; iy++) {
    for (let ix = 0; ix < terrain.size - 1; ix++) {
      if (bandOf(terrain.heights[iy * terrain.size + ix]!) !== bandOf(terrain.heights[iy * terrain.size + ix + 1]!)) {
        ctx.fillRect(px(ix + 1), py(iy), 1, PX_PER_CELL);
      }
    }
  }
  for (let iy = 0; iy < terrain.size - 1; iy++) {
    for (let ix = 0; ix < terrain.size; ix++) {
      if (bandOf(terrain.heights[iy * terrain.size + ix]!) !== bandOf(terrain.heights[(iy + 1) * terrain.size + ix]!)) {
        ctx.fillRect(px(ix), py(iy), PX_PER_CELL, 1);
      }
    }
  }
  return off;
}

/** Blit the pre-rendered image into world coordinates (call under the board's y-up transform). */
export function drawTerrainTop(ctx: CanvasRenderingContext2D, terrain: Terrain, image: HTMLCanvasElement): void {
  ctx.save();
  ctx.translate(-terrain.extent, terrain.extent);
  ctx.scale(1, -1);
  ctx.drawImage(image, 0, 0, terrain.extent * 2, terrain.extent * 2);
  ctx.restore();
}
```

- [ ] **Step 6: Write standsTop.ts**

Create `src/render/standsTop.ts`:

```typescript
import type { Vec3 } from "../physics/types";
import type { Stand } from "../world/stand";
import { SUPPRESS_RADIUS } from "../world/damage";

const HALF = 40; // meters; stand marker is an 80 m square

export function drawStandsTop(ctx: CanvasRenderingContext2D, stands: Stand[]): void {
  for (const stand of stands) {
    const { x, y } = stand.position;
    ctx.save();
    if (stand.strength <= 0) {
      ctx.strokeStyle = "#8a8a8a";
      ctx.lineWidth = 6;
      ctx.strokeRect(x - HALF, y - HALF, HALF * 2, HALF * 2);
    } else {
      if (stand.suppression > 0) {
        ctx.globalAlpha = Math.min(1, stand.suppression / 100);
        ctx.strokeStyle = "#f5d76e";
        ctx.lineWidth = 10;
        ctx.strokeRect(x - HALF - 14, y - HALF - 14, HALF * 2 + 28, HALF * 2 + 28);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = stand.kind === "armor" ? "#c23b3b" : "#e06a6a";
      ctx.fillRect(x - HALF, y - HALF, HALF * 2, HALF * 2);
    }
    ctx.restore();
  }
}

export function drawBattery(ctx: CanvasRenderingContext2D, position: Vec3): void {
  ctx.save();
  ctx.fillStyle = "#4a90d9";
  ctx.fillRect(position.x - HALF, position.y - HALF, HALF * 2, HALF * 2);
  ctx.restore();
}

const BURST_DURATION = 0.6; // seconds

export function drawBurstRing(ctx: CanvasRenderingContext2D, impact: Vec3, ageSeconds: number): void {
  const t = Math.min(1, ageSeconds / BURST_DURATION);
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = "#ff9d45";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(impact.x, impact.y, SUPPRESS_RADIUS * t, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
```

- [ ] **Step 7: Typecheck, run the full suite, commit**

Run: `bunx tsc --noEmit` — clean. Run: `bun test` — all suites PASS.

```bash
git add src/render/terrainTop.ts src/render/terrainProfile.ts src/render/standsTop.ts tests/terrain.test.ts
git commit -m "feat: terrain and stand renderers for the gallery views"
```

---

### Task 7: Gallery page skeleton

**Files:**
- Create: `gallery.html`
- Create: `src/gallery/main.ts` (skeleton — terrain + stands render; Task 8 adds interaction)
- Modify: `package.json` (`"dev": "bun index.html gallery.html"`)

**Interfaces:**
- Consumes: `Board` from `@ue-too/board` (same setup pattern as `src/main.ts`); `createWorld` (Task 5); `buildTerrainImage`/`drawTerrainTop` (Task 6); `sampleProfile`/`drawProfile` (Task 6); `drawStandsTop`/`drawBattery` (Task 6).
- Produces: element ids consumed by Task 8: canvases `#g-side`, `#g-top`; containers `#mission`, `#tally`, `#advanced`; inputs/buttons `#seed`, `#regen`, `#g-fire`.

- [ ] **Step 1: Write gallery.html**

Create `gallery.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>woolwich — shooting gallery</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; background: #14181f; color: #d7dde6; font: 14px/1.4 system-ui, sans-serif; display: flex; height: 100vh; }
    #panel { width: 280px; padding: 16px; box-sizing: border-box; overflow-y: auto; background: #1b212b; }
    #views { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .view { flex: 1; position: relative; min-height: 0; }
    .view canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
    .view .label { position: absolute; top: 8px; left: 12px; opacity: 0.6; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
    button { margin: 12px 6px 0 0; padding: 6px 14px; background: #2c3440; color: inherit; border: 1px solid #3d4859; border-radius: 4px; cursor: pointer; }
    button:hover { background: #38445a; }
    #g-fire { background: #7a2e2e; border-color: #a04040; font-weight: 600; }
    #mission, #tally { margin-top: 14px; font-variant-numeric: tabular-nums; white-space: pre-line; opacity: 0.9; }
    #seed { width: 90px; background: #2c3440; color: inherit; border: 1px solid #3d4859; border-radius: 4px; padding: 4px 8px; }
    #advanced label { display: block; margin: 10px 0 2px; }
    #advanced output { float: right; opacity: 0.8; }
    #advanced input[type="range"] { width: 100%; }
    details { margin-top: 16px; }
    summary { cursor: pointer; opacity: 0.8; }
  </style>
</head>
<body>
  <div id="panel">
    <h3 style="margin-top:0">woolwich — gallery</h3>
    <div>
      <input id="seed" type="number" value="1" />
      <button id="regen">New map</button>
    </div>
    <button id="g-fire">Fire</button>
    <div id="mission">click the map to plot a fire mission</div>
    <div id="tally"></div>
    <details>
      <summary>Advanced (environment)</summary>
      <div id="advanced"></div>
    </details>
  </div>
  <div id="views">
    <div class="view"><canvas id="g-side"></canvas><span class="label">side — fire bearing</span></div>
    <div class="view"><canvas id="g-top"></canvas><span class="label">top-down</span></div>
  </div>
  <script type="module" src="./src/gallery/main.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Write the main.ts skeleton**

Create `src/gallery/main.ts`:

```typescript
import { Board } from "@ue-too/board";
import { drawProfile, sampleProfile } from "../render/terrainProfile";
import { buildTerrainImage, drawTerrainTop } from "../render/terrainTop";
import { drawBattery, drawStandsTop } from "../render/standsTop";
import { createWorld, type WorldState } from "../world/world";

function setupBoard(canvasId: string, camX: number, camY: number, zoom: number): Board {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  const board = new Board(canvas);
  board.alignCoordinateSystem = false;
  board.camera.setPosition({ x: camX, y: camY });
  board.camera.setZoomLevel(zoom);
  return board;
}

const topBoard = setupBoard("g-top", 1600, 0, 0.14);
const sideBoard = setupBoard("g-side", 1600, 300, 0.14);

let world: WorldState = createWorld(1);
let terrainImage = buildTerrainImage(world.terrain);
let bearingDeg = 0;

const seedInput = document.getElementById("seed") as HTMLInputElement;
document.getElementById("regen")!.addEventListener("click", () => {
  world = createWorld(Number(seedInput.value) || 1);
  terrainImage = buildTerrainImage(world.terrain);
});

function frame(timestamp: number) {
  topBoard.step(timestamp);
  const top = topBoard.context;
  if (top) {
    drawTerrainTop(top, world.terrain, terrainImage);
    drawBattery(top, world.battery.position);
    drawStandsTop(top, world.stands);
  }
  sideBoard.step(timestamp);
  const side = sideBoard.context;
  if (side) {
    const profile = sampleProfile(world.terrain, world.battery.position, bearingDeg, 8500);
    drawProfile(side, profile, -150);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

- [ ] **Step 3: Update the dev script**

In `package.json`, change the script to serve both pages:

```json
  "scripts": {
    "dev": "bun index.html gallery.html"
  },
```

- [ ] **Step 4: Verify**

Run: `bunx tsc --noEmit` — clean. Run: `bun test` — all suites PASS (no regressions). Start `bun run dev`, request both `/` (playground unchanged) and `/gallery` — HTTP 200, bundle serves without errors. Visual check (controller): top view shows tinted terrain with contour lines, blue battery square at origin, red stand squares in the eastern zone; side view shows the terrain profile silhouette; "New map" with a different seed changes both.

- [ ] **Step 5: Commit**

```bash
git add gallery.html src/gallery/main.ts package.json
git commit -m "feat: gallery page skeleton with terrain and stand rendering"
```

---

### Task 8: Fire-control state machine

**Files:**
- Create: `src/gallery/fireControl.ts`
- Modify: `package.json` (add `@ue-too/being`)
- Test: `tests/fireControl.test.ts`

**Interfaces:**
- Consumes: `@ue-too/being` — `BaseContext`, `CreateStateType`, `EventReactions`, `EventGuards`, `Guard`, `StateMachine`, `TemplateState`, `TemplateStateMachine`. API facts (verified): `new TemplateStateMachine(states, initialState, context)`; `machine.happens(eventName, payload?)` dispatches; `machine.currentState` reads the state; `TemplateState` subclasses define `protected _eventReactions` (`{ action, defaultTargetState }` per event), `protected _guards` (named predicates on the context), and `protected _eventGuards` (per event, `[{ guard, target }]` — evaluated after the action; first true guard wins, else `defaultTargetState`). Events with no reaction entry are ignored in that state.
- Produces:
  - `FireControlEventMapping = { mapClick: { x: number; y: number }; fire: {}; impact: {}; envChanged: {}; regenerate: { seed: number } }`
  - `FireControlContext extends BaseContext` with callbacks: `solve(target: {x,y}): void; hasValidSolution(): boolean; launch(): void; invalidateSolution(): void; applyEnvironment(): void; handleImpact(): void; resetWorld(seed: number): void`
  - `FireControlStates = "READY" | "IN_FLIGHT"`
  - `createFireControlStateMachine(context: FireControlContext)` → machine starting in `READY`.

- [ ] **Step 1: Add the dependency**

```bash
cd /Users/vincent.yy.chang/dev/woolwich/main  # or the active worktree
bun add @ue-too/being@^0.17.7
```

- [ ] **Step 2: Write the failing tests**

Create `tests/fireControl.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { createFireControlStateMachine, type FireControlContext } from "../src/gallery/fireControl";

function makeContext(valid: boolean) {
  const calls: string[] = [];
  const context: FireControlContext = {
    setup: () => {},
    cleanup: () => {},
    solve: (target) => calls.push(`solve:${target.x},${target.y}`),
    hasValidSolution: () => valid,
    launch: () => calls.push("launch"),
    invalidateSolution: () => calls.push("invalidate"),
    applyEnvironment: () => calls.push("applyEnv"),
    handleImpact: () => calls.push("impact"),
    resetWorld: (seed) => calls.push(`reset:${seed}`),
  };
  return { context, calls };
}

describe("fire-control state machine", () => {
  test("starts in READY and a map click solves", () => {
    const { context, calls } = makeContext(false);
    const sm = createFireControlStateMachine(context);
    expect(sm.currentState).toBe("READY");
    sm.happens("mapClick", { x: 100, y: 200 });
    expect(calls).toEqual(["solve:100,200"]);
    expect(sm.currentState).toBe("READY");
  });

  test("fire without a valid solution does not launch and stays READY", () => {
    const { context, calls } = makeContext(false);
    const sm = createFireControlStateMachine(context);
    sm.happens("fire", {});
    expect(calls).not.toContain("launch");
    expect(sm.currentState).toBe("READY");
  });

  test("fire with a valid solution launches and enters IN_FLIGHT", () => {
    const { context, calls } = makeContext(true);
    const sm = createFireControlStateMachine(context);
    sm.happens("fire", {});
    expect(calls).toContain("launch");
    expect(sm.currentState).toBe("IN_FLIGHT");
  });

  test("clicks and fire are ignored while IN_FLIGHT", () => {
    const { context, calls } = makeContext(true);
    const sm = createFireControlStateMachine(context);
    sm.happens("fire", {});
    calls.length = 0;
    sm.happens("mapClick", { x: 1, y: 2 });
    sm.happens("fire", {});
    expect(calls).toEqual([]);
    expect(sm.currentState).toBe("IN_FLIGHT");
  });

  test("impact applies the burst and returns to READY (mission can re-fire)", () => {
    const { context, calls } = makeContext(true);
    const sm = createFireControlStateMachine(context);
    sm.happens("fire", {});
    sm.happens("impact", {});
    expect(calls).toContain("impact");
    expect(sm.currentState).toBe("READY");
    sm.happens("fire", {});
    expect(calls.filter((c) => c === "launch").length).toBe(2);
  });

  test("envChanged applies the environment and invalidates in both states", () => {
    const ready = makeContext(false);
    const smReady = createFireControlStateMachine(ready.context);
    smReady.happens("envChanged", {});
    expect(ready.calls).toEqual(["applyEnv", "invalidate"]);
    expect(smReady.currentState).toBe("READY");

    const flight = makeContext(true);
    const smFlight = createFireControlStateMachine(flight.context);
    smFlight.happens("fire", {});
    flight.calls.length = 0;
    smFlight.happens("envChanged", {});
    expect(flight.calls).toEqual(["applyEnv", "invalidate"]);
    expect(smFlight.currentState).toBe("IN_FLIGHT");
  });

  test("regenerate resets the world from either state and lands in READY", () => {
    const { context, calls } = makeContext(true);
    const sm = createFireControlStateMachine(context);
    sm.happens("fire", {});
    sm.happens("regenerate", { seed: 9 });
    expect(calls).toContain("reset:9");
    expect(sm.currentState).toBe("READY");
  });
});
```

Note: if `BaseContext` requires members other than `setup`/`cleanup`, satisfy the type minimally in `makeContext` — check the imported type's definition rather than casting to `any`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test tests/fireControl.test.ts`
Expected: FAIL — cannot resolve `../src/gallery/fireControl`.

- [ ] **Step 4: Write the implementation**

Create `src/gallery/fireControl.ts`:

```typescript
import {
  BaseContext,
  CreateStateType,
  EventGuards,
  EventReactions,
  Guard,
  StateMachine,
  TemplateState,
  TemplateStateMachine,
} from "@ue-too/being";

export type FireControlEventMapping = {
  mapClick: { x: number; y: number };
  fire: {};
  impact: {};
  envChanged: {};
  regenerate: { seed: number };
};

/** Game actions the machine drives; the machine owns WHEN, the context owns WHAT. */
export interface FireControlContext extends BaseContext {
  solve(target: { x: number; y: number }): void;
  hasValidSolution(): boolean;
  launch(): void;
  invalidateSolution(): void;
  applyEnvironment(): void;
  handleImpact(): void;
  resetWorld(seed: number): void;
}

const FIRE_CONTROL_STATES = ["READY", "IN_FLIGHT"] as const;
export type FireControlStates = CreateStateType<typeof FIRE_CONTROL_STATES>;

export type FireControlStateMachine = StateMachine<
  FireControlEventMapping,
  FireControlContext,
  FireControlStates,
  any
>;

class ReadyState extends TemplateState<FireControlEventMapping, FireControlContext, FireControlStates> {
  protected _guards: Guard<FireControlContext, "hasValidSolution"> = {
    hasValidSolution: (ctx) => ctx.hasValidSolution(),
  };

  protected _eventGuards: Partial<
    EventGuards<FireControlEventMapping, FireControlStates, FireControlContext, Guard<FireControlContext, "hasValidSolution">>
  > = {
    fire: [{ guard: "hasValidSolution", target: "IN_FLIGHT" }],
  };

  protected _eventReactions = {
    mapClick: {
      action: (ctx: FireControlContext, payload: FireControlEventMapping["mapClick"]) => {
        ctx.solve(payload);
      },
      defaultTargetState: "READY",
    },
    fire: {
      action: (ctx: FireControlContext) => {
        if (ctx.hasValidSolution()) ctx.launch();
      },
      // guard promotes to IN_FLIGHT when a valid solution exists
      defaultTargetState: "READY",
    },
    envChanged: {
      action: (ctx: FireControlContext) => {
        ctx.applyEnvironment();
        ctx.invalidateSolution();
      },
      defaultTargetState: "READY",
    },
    regenerate: {
      action: (ctx: FireControlContext, payload: FireControlEventMapping["regenerate"]) => {
        ctx.resetWorld(payload.seed);
      },
      defaultTargetState: "READY",
    },
  } as EventReactions<FireControlEventMapping, FireControlContext, FireControlStates, any>;
}

class InFlightState extends TemplateState<FireControlEventMapping, FireControlContext, FireControlStates> {
  // mapClick and fire have no reactions here: clicks during flight are ignored
  protected _eventReactions = {
    impact: {
      action: (ctx: FireControlContext) => {
        ctx.handleImpact();
      },
      defaultTargetState: "READY",
    },
    envChanged: {
      action: (ctx: FireControlContext) => {
        ctx.applyEnvironment();
        ctx.invalidateSolution();
      },
      defaultTargetState: "IN_FLIGHT",
    },
    regenerate: {
      action: (ctx: FireControlContext, payload: FireControlEventMapping["regenerate"]) => {
        ctx.resetWorld(payload.seed);
      },
      defaultTargetState: "READY",
    },
  } as EventReactions<FireControlEventMapping, FireControlContext, FireControlStates, any>;
}

export function createFireControlStateMachine(context: FireControlContext) {
  return new TemplateStateMachine<FireControlEventMapping, FireControlContext, FireControlStates>(
    { READY: new ReadyState(), IN_FLIGHT: new InFlightState() },
    "READY",
    context,
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/fireControl.test.ts`
Expected: PASS (7 tests). If `_eventGuards` does not promote the fire transition (framework semantics differ from the documented expectation), report it as a finding rather than working around it with a boolean flag.

- [ ] **Step 6: Run the full suite and commit**

Run: `bun test` — all suites PASS.

```bash
git add src/gallery/fireControl.ts tests/fireControl.test.ts package.json bun.lock
git commit -m "feat: fire-control interaction state machine on @ue-too/being"
```

---

### Task 9: Click-to-fire, panel, and full wiring

**Files:**
- Create: `src/gallery/panel.ts`
- Modify: `src/gallery/main.ts` (full wiring, driven by the Task 8 state machine)

**Interfaces:**
- Consumes: `createFireControlStateMachine`/`FireControlContext` (Task 8), `solveFireMission`/`FireSolution` (Task 4), `Simulation` (Task 3 signature), `applyBurst`/`decaySuppression` (Task 5), `drawBurstRing` (Task 6), `drawPolyline`/`drawCircle`/`drawCross` from `src/render/draw.ts` (v1), `sampleProfile`/`drawProfile` (Task 6), element ids from Task 7, `Environment`/`Vec3`/`DEG_TO_RAD` types.
- Produces:
  - `setupAdvancedPanel(onChange: () => void): { environment(): Environment }` — gravity, drag, wind speed, wind direction sliders in `#advanced` (no elevation/azimuth/muzzle — the solver owns aiming; muzzle speed comes from the world's battery)
  - The finished gallery: click → solve → arc preview both views → Fire → flight → burst → damage → tally.

- [ ] **Step 1: Write panel.ts**

Create `src/gallery/panel.ts`:

```typescript
import type { Environment } from "../physics/types";

type SliderSpec = { id: string; label: string; min: number; max: number; step: number; value: number; unit: string };

const SLIDERS: SliderSpec[] = [
  { id: "adv-gravity", label: "Gravity", min: 1, max: 25, step: 0.01, value: 9.81, unit: " m/s²" },
  { id: "adv-drag", label: "Drag coefficient", min: 0, max: 0.002, step: 0.0001, value: 0.0003, unit: " /m" },
  { id: "adv-windspeed", label: "Wind speed", min: 0, max: 40, step: 1, value: 0, unit: " m/s" },
  { id: "adv-winddir", label: "Wind direction", min: -180, max: 180, step: 5, value: 0, unit: "°" },
];

export function setupAdvancedPanel(onChange: () => void): { environment(): Environment } {
  const container = document.getElementById("advanced")!;
  const inputs = new Map<string, HTMLInputElement>();
  for (const spec of SLIDERS) {
    const label = document.createElement("label");
    label.htmlFor = spec.id;
    label.textContent = spec.label;
    const out = document.createElement("output");
    label.appendChild(out);
    const input = document.createElement("input");
    input.type = "range";
    input.id = spec.id;
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(spec.value);
    const refresh = () => { out.textContent = `${input.value}${spec.unit}`; };
    input.addEventListener("input", () => { refresh(); onChange(); });
    refresh();
    container.appendChild(label);
    container.appendChild(input);
    inputs.set(spec.id, input);
  }
  const value = (id: string) => Number(inputs.get(id)!.value);
  return {
    environment: () => ({
      gravity: value("adv-gravity"),
      dragCoefficient: value("adv-drag"),
      windSpeed: value("adv-windspeed"),
      windDirectionDeg: value("adv-winddir"),
    }),
  };
}
```

- [ ] **Step 2: Rewrite src/gallery/main.ts with machine-driven wiring**

Replace `src/gallery/main.ts` entirely with:

```typescript
import { Board } from "@ue-too/board";
import { DEG_TO_RAD, type Vec3 } from "../physics/types";
import { drawCircle, drawCross, drawPolyline } from "../render/draw";
import { drawBattery, drawBurstRing, drawStandsTop } from "../render/standsTop";
import { drawProfile, sampleProfile, type ProfilePoint } from "../render/terrainProfile";
import { buildTerrainImage, drawTerrainTop } from "../render/terrainTop";
import { Simulation } from "../sim";
import { solveFireMission, type FireSolution } from "../solver/fireSolution";
import { applyBurst, decaySuppression } from "../world/damage";
import { createWorld, type WorldState } from "../world/world";
import { createFireControlStateMachine, type FireControlContext } from "./fireControl";
import { setupAdvancedPanel } from "./panel";

const PREDICTED = "rgba(120, 190, 255, 0.7)";
const SHELL = "#ffb347";
const IMPACT = "#e05555";

function setupBoard(canvasId: string, camX: number, camY: number, zoom: number): Board {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  const board = new Board(canvas);
  board.alignCoordinateSystem = false;
  board.camera.setPosition({ x: camX, y: camY });
  board.camera.setZoomLevel(zoom);
  return board;
}

const topBoard = setupBoard("g-top", 1600, 0, 0.14);
const sideBoard = setupBoard("g-side", 1600, 300, 0.14);
const topCanvas = document.getElementById("g-top") as HTMLCanvasElement;
const missionEl = document.getElementById("mission")!;
const tallyEl = document.getElementById("tally")!;
const seedInput = document.getElementById("seed") as HTMLInputElement;

// `machine` is declared after `panel`; the callback only fires on user input,
// long after module evaluation, so the reference is safe.
const panel = setupAdvancedPanel(() => machine.happens("envChanged", {}));

let world: WorldState = createWorld(1);
let terrainImage = buildTerrainImage(world.terrain);
let solution: FireSolution | null = null;
let bearingDeg = 0;
let profile: ProfilePoint[] = sampleProfile(world.terrain, world.battery.position, bearingDeg, 8500);
let sim = new Simulation(panel.environment(), world.ground);
let bursts: { impact: Vec3; age: number }[] = [];

const context: FireControlContext = {
  setup: () => {},
  cleanup: () => {},
  solve: (target) => {
    bearingDeg = Math.atan2(target.y - world.battery.position.y, target.x - world.battery.position.x) / DEG_TO_RAD;
    profile = sampleProfile(world.terrain, world.battery.position, bearingDeg, 8500);
    solution = solveFireMission({
      target,
      muzzleSpeed: world.battery.muzzleSpeed,
      env: panel.environment(),
      ground: world.ground,
      origin: world.battery.position,
    });
    missionEl.textContent = solution.ok
      ? [
          `bearing: ${bearingDeg.toFixed(1)}°`,
          `elevation: ${solution.params.elevationDeg.toFixed(2)}°`,
          `muzzle: ${world.battery.muzzleSpeed} m/s`,
          `time of flight: ${solution.predicted.flightTime.toFixed(1)} s`,
        ].join("\n")
      : solution.reason === "out-of-range"
        ? "OUT OF RANGE"
        : "NO SOLUTION — trajectory masked (see side view)";
  },
  hasValidSolution: () => solution?.ok === true,
  launch: () => {
    if (!solution?.ok) return;
    sim.env = panel.environment();
    sim.fire(solution.params, world.battery.position);
  },
  invalidateSolution: () => {
    if (solution) {
      solution = null;
      missionEl.textContent = "environment changed — click the map to re-target";
    }
  },
  applyEnvironment: () => {
    sim.env = panel.environment();
  },
  handleImpact: () => {
    if (!sim.impact) return;
    applyBurst(sim.impact, world.stands);
    bursts.push({ impact: sim.impact, age: 0 });
  },
  resetWorld: (seed) => {
    world = createWorld(seed);
    terrainImage = buildTerrainImage(world.terrain);
    sim = new Simulation(panel.environment(), world.ground);
    solution = null;
    bursts = [];
    profile = sampleProfile(world.terrain, world.battery.position, bearingDeg, 8500);
    missionEl.textContent = "click the map to plot a fire mission";
  },
};

const machine = createFireControlStateMachine(context);

/** Click position (CSS px) → world coordinates. Camera rotation is unused in this app (0). */
function clickToWorld(ev: MouseEvent): { x: number; y: number } {
  const rect = topCanvas.getBoundingClientRect();
  const cx = ev.clientX - rect.left - rect.width / 2;
  const cy = ev.clientY - rect.top - rect.height / 2;
  const cam = topBoard.camera;
  return { x: cam.position.x + cx / cam.zoomLevel, y: cam.position.y - cy / cam.zoomLevel };
}

topCanvas.addEventListener("click", (ev) => machine.happens("mapClick", clickToWorld(ev)));
document.getElementById("g-fire")!.addEventListener("click", () => machine.happens("fire", {}));
document.getElementById("regen")!.addEventListener("click", () =>
  machine.happens("regenerate", { seed: Number(seedInput.value) || 1 }),
);

/** Project a world point into side-view coordinates: distance along the fire bearing vs altitude. */
function toSide(p: Vec3): { x: number; y: number } {
  const rad = bearingDeg * DEG_TO_RAD;
  const s = (p.x - world.battery.position.x) * Math.cos(rad) + (p.y - world.battery.position.y) * Math.sin(rad);
  return { x: s, y: p.z };
}

function project(p: Vec3): { x: number; y: number } {
  return { x: p.x, y: p.y };
}

let lastTimestamp: number | null = null;

function frame(timestamp: number) {
  const elapsed = lastTimestamp === null ? 0 : Math.min((timestamp - lastTimestamp) / 1000, 0.25);
  lastTimestamp = timestamp;
  sim.advance(elapsed);
  decaySuppression(world.stands, elapsed);
  for (const b of bursts) b.age += elapsed;
  bursts = bursts.filter((b) => b.age < 0.6);

  // the machine is the impact latch: only IN_FLIGHT handles the event, and
  // handling it transitions to READY, so the burst applies exactly once
  if (machine.currentState === "IN_FLIGHT" && sim.impact) {
    machine.happens("impact", {});
  }

  const predicted = solution ? (solution.ok ? solution.predicted : solution.predicted ?? null) : null;

  topBoard.step(timestamp);
  const top = topBoard.context;
  if (top) {
    drawTerrainTop(top, world.terrain, terrainImage);
    drawBattery(top, world.battery.position);
    drawStandsTop(top, world.stands);
    if (predicted) drawPolyline(top, predicted.points.map(project), PREDICTED, true);
    if (predicted?.impact) drawCross(top, project(predicted.impact), 40, IMPACT);
    if (sim.state && !sim.impact) drawCircle(top, project(sim.state.position), 25, SHELL);
    for (const b of bursts) drawBurstRing(top, b.impact, b.age);
  }

  sideBoard.step(timestamp);
  const side = sideBoard.context;
  if (side) {
    drawProfile(side, profile, -150);
    if (predicted) drawPolyline(side, predicted.points.map(toSide), PREDICTED, true);
    if (sim.state && !sim.impact) drawCircle(side, toSide(sim.state.position), 25, SHELL);
  }

  const destroyed = world.stands.filter((s) => s.strength <= 0).length;
  tallyEl.textContent = `destroyed: ${destroyed} / ${world.stands.length}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

All interaction flow runs through the state machine — the DOM handlers only translate events (`machine.happens(...)`); there are no boolean interaction flags in main.ts. The machine's `IN_FLIGHT` state is both the "ignore clicks" rule and the one-shot impact latch.

- [ ] **Step 3: Typecheck and run the suite**

Run: `bunx tsc --noEmit` — clean. Run: `bun test` — all suites PASS.

- [ ] **Step 4: Manual acceptance checklist (browser)**

Start `bun run dev`, open `/gallery`:

1. Terrain tint + contours + battery + red stands visible in the top view; profile silhouette in the side view.
2. Click a reachable point → dashed arc appears in BOTH views, mission readout shows bearing/elevation/time-of-flight; the side-view arc clears (or is stopped by) the terrain profile plausibly.
3. Click far beyond range (map corner) → "OUT OF RANGE".
4. Click a target behind a tall ridge (find one; raise drag if needed) → "NO SOLUTION" and the side view shows the best-effort arc dying on the ridge.
5. Fire → shell flies both views, burst ring expands at impact, a stand near the impact loses strength (marker changes / wreck outline), tally updates. Suppression halo fades over the following seconds.
6. Clicks and Fire during flight are ignored (machine in IN_FLIGHT); after impact, Fire re-fires the same mission, and a new click re-targets cleanly.
7. Change a slider in Advanced → mission clears with "environment changed — click the map to re-target".
8. New map with a different seed → new terrain + stands, cleared mission; same seed twice → identical map.

- [ ] **Step 5: Commit**

```bash
git add src/gallery/panel.ts src/gallery/main.ts
git commit -m "feat: click-to-fire missions with burst damage in the gallery"
```
