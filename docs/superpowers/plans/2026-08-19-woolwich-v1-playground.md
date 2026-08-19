# Woolwich v1 Playground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An interactive artillery physics playground: set launch/environment parameters with sliders, preview the predicted trajectory, fire, and watch the flight in synchronized side and top-down views.

**Architecture:** A pure, deterministic 3D physics core (gravity + quadratic drag + wind, semi-implicit Euler at fixed 1/120 s timestep) shared by both the live simulation and `predictPath`. Two canvases wrapped in `@ue-too/board` render the same world as two projections (side: downrange/altitude; top-down: east/north). Plain-DOM controls drive it; no framework.

**Tech Stack:** Bun (runtime, dev server via `bun index.html`, `bun test`), TypeScript, `@ue-too/board` (^0.17.7), `@ue-too/math` (^0.17.7).

**Spec:** `docs/superpowers/specs/2026-08-19-woolwich-playground-design.md`

## Global Constraints

- Coordinate system: x = east, y = north, z = up; launcher at origin. (Spec: "Physics core")
- Fixed physics timestep: 1/120 s, semi-implicit Euler, deterministic. (Spec: "Physics core")
- Prediction max simulated flight time cap so degenerate parameters cannot loop forever. (Spec: "Error handling")
- Dependencies limited to `@ue-too/board` and `@ue-too/math`; no UI framework. (Spec: "Stack")
- Angle convention (plan decision, use everywhere): angles in degrees at API boundaries, 0° = +x (east), counterclockwise positive (90° = +y north). Wind direction = direction the wind blows **toward**.
- All physics units SI: meters, seconds, m/s, m/s².
- Rendering and UI are verified manually in the browser; physics and sim are unit-tested with `bun test`. (Spec: "Testing")

## File Structure

```
index.html                     page: two canvases + control panel + module script
src/
  physics/types.ts             Vec3, ShotParams, Environment, ProjectileState
  physics/shot.ts              launchState()
  physics/forces.ts            windVector(), acceleration()
  physics/integrator.ts        FIXED_DT, stepState()
  physics/predict.ts           Trajectory, MAX_FLIGHT_TIME, predictPath()
  sim.ts                       Simulation class (accumulator, pause/slow-mo/step)
  render/draw.ts               drawGrid, drawPolyline, drawCircle, drawCross
  render/scene.ts              Scene type + projections (downrange)
  render/sideView.ts           renderSideView()
  render/topView.ts            renderTopView()
  ui/controls.ts               slider panel, fire/time buttons, readouts
  main.ts                      wiring: boards, sim, controls, rAF loop
tests/
  physics.test.ts
  sim.test.ts
```

---

### Task 1: Physics types and launch state

**Files:**
- Create: `src/physics/types.ts`
- Create: `src/physics/shot.ts`
- Test: `tests/physics.test.ts`

**Interfaces:**
- Consumes: `Point` type from `@ue-too/math` (has `x: number; y: number; z?: number`). Not installed yet — this task installs both runtime deps.
- Produces:
  - `Vec3 = { x: number; y: number; z: number }`
  - `ShotParams = { elevationDeg: number; azimuthDeg: number; muzzleSpeed: number }`
  - `Environment = { gravity: number; dragCoefficient: number; windSpeed: number; windDirectionDeg: number }`
  - `ProjectileState = { position: Vec3; velocity: Vec3; time: number }`
  - `launchState(params: ShotParams): ProjectileState`

- [ ] **Step 1: Install runtime dependencies**

```bash
cd /Users/vincent.yy.chang/dev/woolwich/main
bun add @ue-too/board@^0.17.7 @ue-too/math@^0.17.7
```

- [ ] **Step 2: Write the failing test**

Create `tests/physics.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { launchState } from "../src/physics/shot";

describe("launchState", () => {
  test("45° elevation due east splits speed between x and z", () => {
    const s = launchState({ elevationDeg: 45, azimuthDeg: 0, muzzleSpeed: 100 });
    expect(s.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(s.time).toBe(0);
    expect(s.velocity.x).toBeCloseTo(100 * Math.SQRT1_2, 6);
    expect(s.velocity.y).toBeCloseTo(0, 6);
    expect(s.velocity.z).toBeCloseTo(100 * Math.SQRT1_2, 6);
  });

  test("azimuth 90° points north", () => {
    const s = launchState({ elevationDeg: 0, azimuthDeg: 90, muzzleSpeed: 50 });
    expect(s.velocity.x).toBeCloseTo(0, 6);
    expect(s.velocity.y).toBeCloseTo(50, 6);
    expect(s.velocity.z).toBeCloseTo(0, 6);
  });

  test("90° elevation is straight up", () => {
    const s = launchState({ elevationDeg: 90, azimuthDeg: 30, muzzleSpeed: 80 });
    expect(s.velocity.x).toBeCloseTo(0, 6);
    expect(s.velocity.y).toBeCloseTo(0, 6);
    expect(s.velocity.z).toBeCloseTo(80, 6);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/physics.test.ts`
Expected: FAIL — cannot resolve `../src/physics/shot`.

- [ ] **Step 4: Write the implementation**

Create `src/physics/types.ts`:

```typescript
export type Vec3 = { x: number; y: number; z: number };

/** Angles in degrees: 0° = +x (east), counterclockwise positive (90° = +y north). */
export type ShotParams = {
  elevationDeg: number;
  azimuthDeg: number;
  /** m/s */
  muzzleSpeed: number;
};

export type Environment = {
  /** m/s², acts along -z */
  gravity: number;
  /** quadratic drag coefficient k in a = -k·|v_air|·v_air (1/m) */
  dragCoefficient: number;
  /** m/s, horizontal */
  windSpeed: number;
  /** direction the wind blows toward, degrees, 0° = east, CCW */
  windDirectionDeg: number;
};

export type ProjectileState = {
  position: Vec3;
  velocity: Vec3;
  /** seconds since launch */
  time: number;
};

export const DEG_TO_RAD = Math.PI / 180;
```

Create `src/physics/shot.ts`:

```typescript
import { DEG_TO_RAD, type ProjectileState, type ShotParams } from "./types";

export function launchState(params: ShotParams): ProjectileState {
  const elevation = params.elevationDeg * DEG_TO_RAD;
  const azimuth = params.azimuthDeg * DEG_TO_RAD;
  const horizontal = params.muzzleSpeed * Math.cos(elevation);
  return {
    position: { x: 0, y: 0, z: 0 },
    velocity: {
      x: horizontal * Math.cos(azimuth),
      y: horizontal * Math.sin(azimuth),
      z: params.muzzleSpeed * Math.sin(elevation),
    },
    time: 0,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/physics.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock src/physics/types.ts src/physics/shot.ts tests/physics.test.ts
git commit -m "feat: physics types and launch state"
```

---

### Task 2: Forces — wind and acceleration

**Files:**
- Create: `src/physics/forces.ts`
- Test: `tests/physics.test.ts` (append)

**Interfaces:**
- Consumes: `Vec3`, `Environment`, `DEG_TO_RAD` from `src/physics/types.ts` (Task 1).
- Produces:
  - `windVector(env: Environment): Vec3`
  - `acceleration(velocity: Vec3, env: Environment): Vec3`

- [ ] **Step 1: Write the failing test**

Append to `tests/physics.test.ts`:

```typescript
import { acceleration, windVector } from "../src/physics/forces";
import type { Environment } from "../src/physics/types";

const CALM: Environment = { gravity: 9.81, dragCoefficient: 0, windSpeed: 0, windDirectionDeg: 0 };

describe("forces", () => {
  test("windVector converts speed+direction to a horizontal vector", () => {
    const w = windVector({ ...CALM, windSpeed: 10, windDirectionDeg: 90 });
    expect(w.x).toBeCloseTo(0, 6);
    expect(w.y).toBeCloseTo(10, 6);
    expect(w.z).toBe(0);
  });

  test("with zero drag, acceleration is pure gravity", () => {
    const a = acceleration({ x: 40, y: 5, z: 30 }, CALM);
    expect(a.x).toBeCloseTo(0, 12);
    expect(a.y).toBeCloseTo(0, 12);
    expect(a.z).toBeCloseTo(-9.81, 12);
  });

  test("drag opposes air-relative velocity, quadratically", () => {
    const env: Environment = { ...CALM, dragCoefficient: 0.01 };
    const a = acceleration({ x: 50, y: 0, z: 0 }, env);
    // |v_air| = 50, a_x = -0.01 * 50 * 50 = -25
    expect(a.x).toBeCloseTo(-25, 6);
    expect(a.y).toBeCloseTo(0, 6);
    expect(a.z).toBeCloseTo(-9.81, 6);
  });

  test("a tailwind matching projectile velocity produces zero drag", () => {
    const env: Environment = { ...CALM, dragCoefficient: 0.01, windSpeed: 50, windDirectionDeg: 0 };
    const a = acceleration({ x: 50, y: 0, z: 0 }, env);
    expect(a.x).toBeCloseTo(0, 6);
    expect(a.z).toBeCloseTo(-9.81, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/physics.test.ts`
Expected: FAIL — cannot resolve `../src/physics/forces`.

- [ ] **Step 3: Write the implementation**

Create `src/physics/forces.ts`:

```typescript
import { DEG_TO_RAD, type Environment, type Vec3 } from "./types";

export function windVector(env: Environment): Vec3 {
  const direction = env.windDirectionDeg * DEG_TO_RAD;
  return {
    x: env.windSpeed * Math.cos(direction),
    y: env.windSpeed * Math.sin(direction),
    z: 0,
  };
}

/** Gravity plus quadratic drag on the air-relative velocity. */
export function acceleration(velocity: Vec3, env: Environment): Vec3 {
  const wind = windVector(env);
  const rel = { x: velocity.x - wind.x, y: velocity.y - wind.y, z: velocity.z };
  const airSpeed = Math.hypot(rel.x, rel.y, rel.z);
  const k = env.dragCoefficient;
  return {
    x: -k * airSpeed * rel.x,
    y: -k * airSpeed * rel.y,
    z: -env.gravity - k * airSpeed * rel.z,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/physics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/physics/forces.ts tests/physics.test.ts
git commit -m "feat: gravity, quadratic drag, and wind forces"
```

---

### Task 3: Fixed-timestep integrator

**Files:**
- Create: `src/physics/integrator.ts`
- Test: `tests/physics.test.ts` (append)

**Interfaces:**
- Consumes: `acceleration` (Task 2), `ProjectileState`, `Environment` (Task 1).
- Produces:
  - `FIXED_DT = 1 / 120` (seconds)
  - `stepState(state: ProjectileState, env: Environment, dt: number): ProjectileState` — semi-implicit Euler, returns a new state (no mutation).

- [ ] **Step 1: Write the failing test**

Append to `tests/physics.test.ts`:

```typescript
import { FIXED_DT, stepState } from "../src/physics/integrator";

describe("stepState", () => {
  test("semi-implicit Euler: velocity updates first, then position uses new velocity", () => {
    const s0 = { position: { x: 0, y: 0, z: 100 }, velocity: { x: 10, y: 0, z: 0 }, time: 0 };
    const s1 = stepState(s0, CALM, 0.5);
    // vz' = 0 - 9.81*0.5 = -4.905 ; z' = 100 + (-4.905)*0.5 = 97.5475
    expect(s1.velocity.z).toBeCloseTo(-4.905, 6);
    expect(s1.position.z).toBeCloseTo(97.5475, 6);
    expect(s1.position.x).toBeCloseTo(5, 6);
    expect(s1.time).toBeCloseTo(0.5, 6);
    // input state is not mutated
    expect(s0.position.z).toBe(100);
    expect(s0.velocity.z).toBe(0);
  });

  test("FIXED_DT is 1/120", () => {
    expect(FIXED_DT).toBeCloseTo(1 / 120, 12);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/physics.test.ts`
Expected: FAIL — cannot resolve `../src/physics/integrator`.

- [ ] **Step 3: Write the implementation**

Create `src/physics/integrator.ts`:

```typescript
import { acceleration } from "./forces";
import type { Environment, ProjectileState } from "./types";

export const FIXED_DT = 1 / 120;

/** Semi-implicit Euler: v += a·dt, then x += v·dt. */
export function stepState(state: ProjectileState, env: Environment, dt: number): ProjectileState {
  const a = acceleration(state.velocity, env);
  const velocity = {
    x: state.velocity.x + a.x * dt,
    y: state.velocity.y + a.y * dt,
    z: state.velocity.z + a.z * dt,
  };
  const position = {
    x: state.position.x + velocity.x * dt,
    y: state.position.y + velocity.y * dt,
    z: state.position.z + velocity.z * dt,
  };
  return { position, velocity, time: state.time + dt };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/physics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/physics/integrator.ts tests/physics.test.ts
git commit -m "feat: semi-implicit Euler fixed-timestep integrator"
```

---

### Task 4: predictPath and physics validation

**Files:**
- Create: `src/physics/predict.ts`
- Test: `tests/physics.test.ts` (append)

**Interfaces:**
- Consumes: `launchState` (Task 1), `stepState`, `FIXED_DT` (Task 3), types (Task 1).
- Produces:
  - `MAX_FLIGHT_TIME = 120` (seconds)
  - `Trajectory = { points: Vec3[]; impact: Vec3 | null; flightTime: number; truncated: boolean }`
  - `predictPath(params: ShotParams, env: Environment): Trajectory` — impact when `z <= 0` while descending; truncates at `MAX_FLIGHT_TIME`.

- [ ] **Step 1: Write the failing test**

Append to `tests/physics.test.ts`:

```typescript
import { predictPath } from "../src/physics/predict";

describe("predictPath", () => {
  const SHOT = { elevationDeg: 45, azimuthDeg: 0, muzzleSpeed: 100 };

  test("drag-free shot matches the closed-form parabola", () => {
    const t = predictPath(SHOT, CALM);
    const g = CALM.gravity;
    const v = 100 * Math.SQRT1_2;
    const expectedFlightTime = (2 * v) / g;          // ≈ 14.417 s
    const expectedRange = 100 * 100 * Math.sin(Math.PI / 2) / g; // ≈ 1019.37 m
    const expectedApex = (v * v) / (2 * g);          // ≈ 254.84 m
    expect(t.truncated).toBe(false);
    expect(t.impact).not.toBeNull();
    expect(t.flightTime).toBeCloseTo(expectedFlightTime, 1);
    expect(t.impact!.x).toBeCloseTo(expectedRange, -1); // within ~5 m of 1019
    const apex = Math.max(...t.points.map(p => p.z));
    expect(Math.abs(apex - expectedApex)).toBeLessThan(1); // integrator bias ~a·dt·t/2 ≈ 0.3 m
  });

  test("drag strictly shortens range", () => {
    const free = predictPath(SHOT, CALM);
    const dragged = predictPath(SHOT, { ...CALM, dragCoefficient: 0.0005 });
    expect(dragged.impact!.x).toBeLessThan(free.impact!.x);
  });

  test("crosswind drifts the impact point downwind", () => {
    const wind = predictPath(SHOT, {
      ...CALM,
      dragCoefficient: 0.0005,
      windSpeed: 15,
      windDirectionDeg: 90, // blowing toward +y (north)
    });
    expect(wind.impact!.y).toBeGreaterThan(1);
  });

  test("zero gravity truncates at MAX_FLIGHT_TIME instead of looping forever", () => {
    const t = predictPath(SHOT, { ...CALM, gravity: 0 });
    expect(t.truncated).toBe(true);
    expect(t.impact).toBeNull();
    expect(t.flightTime).toBeGreaterThanOrEqual(120);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/physics.test.ts`
Expected: FAIL — cannot resolve `../src/physics/predict`.

- [ ] **Step 3: Write the implementation**

Create `src/physics/predict.ts`:

```typescript
import { FIXED_DT, stepState } from "./integrator";
import { launchState } from "./shot";
import type { Environment, ShotParams, Vec3 } from "./types";

export const MAX_FLIGHT_TIME = 120;

export type Trajectory = {
  points: Vec3[];
  impact: Vec3 | null;
  flightTime: number;
  truncated: boolean;
};

export function predictPath(params: ShotParams, env: Environment): Trajectory {
  let state = launchState(params);
  const points: Vec3[] = [state.position];
  while (state.time < MAX_FLIGHT_TIME) {
    state = stepState(state, env, FIXED_DT);
    points.push(state.position);
    if (state.position.z <= 0 && state.velocity.z < 0) {
      return { points, impact: state.position, flightTime: state.time, truncated: false };
    }
  }
  return { points, impact: null, flightTime: state.time, truncated: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/physics.test.ts`
Expected: PASS (all physics tests).

- [ ] **Step 5: Commit**

```bash
git add src/physics/predict.ts tests/physics.test.ts
git commit -m "feat: trajectory prediction with impact detection and time cap"
```

---

### Task 5: Simulation loop with time controls

**Files:**
- Create: `src/sim.ts`
- Test: `tests/sim.test.ts`

**Interfaces:**
- Consumes: `launchState` (Task 1), `stepState`, `FIXED_DT` (Task 3), `predictPath` (Task 4, in tests), types (Task 1).
- Produces: `Simulation` class:
  - `constructor(env: Environment)` — `env` is a mutable public field; UI writes slider values into it.
  - `fire(params: ShotParams): void` — starts a flight, clears previous impact.
  - `advance(elapsedSeconds: number): void` — accumulates scaled wall time, integrates whole `FIXED_DT` steps. No-op when paused, before first fire, or after impact.
  - `stepFrame(): void` — exactly one `FIXED_DT` step (works while paused).
  - `paused: boolean`, `timeScale: number` (1 = realtime, 0.25 = slow-mo)
  - `state: ProjectileState | null`, `impact: Vec3 | null`

- [ ] **Step 1: Write the failing test**

Create `tests/sim.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { FIXED_DT } from "../src/physics/integrator";
import { predictPath } from "../src/physics/predict";
import type { Environment } from "../src/physics/types";
import { Simulation } from "../src/sim";

const ENV: Environment = { gravity: 9.81, dragCoefficient: 0.0005, windSpeed: 10, windDirectionDeg: 45 };
const SHOT = { elevationDeg: 50, azimuthDeg: 10, muzzleSpeed: 90 };

describe("Simulation", () => {
  test("live flight lands exactly where predictPath says, regardless of frame chunking", () => {
    const predicted = predictPath(SHOT, ENV);
    const sim = new Simulation({ ...ENV });
    sim.fire(SHOT);
    // advance in ragged, non-multiple-of-dt chunks until impact
    const chunks = [0.013, 0.021, 0.007, 0.033];
    let i = 0;
    while (!sim.impact && sim.state!.time < 200) {
      sim.advance(chunks[i % chunks.length]!);
      i++;
    }
    expect(sim.impact).not.toBeNull();
    expect(sim.impact!.x).toBeCloseTo(predicted.impact!.x, 6);
    expect(sim.impact!.y).toBeCloseTo(predicted.impact!.y, 6);
    expect(sim.state!.time).toBeCloseTo(predicted.flightTime, 6);
  });

  test("advance is a no-op before fire and while paused", () => {
    const sim = new Simulation({ ...ENV });
    sim.advance(1);
    expect(sim.state).toBeNull();
    sim.fire(SHOT);
    sim.paused = true;
    sim.advance(1);
    expect(sim.state!.time).toBe(0);
  });

  test("stepFrame advances exactly one fixed step, even while paused", () => {
    const sim = new Simulation({ ...ENV });
    sim.fire(SHOT);
    sim.paused = true;
    sim.stepFrame();
    expect(sim.state!.time).toBeCloseTo(FIXED_DT, 12);
  });

  test("timeScale slows integration proportionally", () => {
    // slow-mo advancing 1 s of wall time equals realtime advancing 0.25 s:
    // both feed 0.25 s into the same accumulator, so step counts match exactly
    const slow = new Simulation({ ...ENV });
    slow.fire(SHOT);
    slow.timeScale = 0.25;
    slow.advance(1);
    const realtime = new Simulation({ ...ENV });
    realtime.fire(SHOT);
    realtime.advance(0.25);
    expect(slow.state!.time).toBe(realtime.state!.time);
    expect(slow.state!.time).toBeGreaterThan(0.2);
  });

  test("firing again clears the previous impact and restarts time", () => {
    const sim = new Simulation({ gravity: 9.81, dragCoefficient: 0, windSpeed: 0, windDirectionDeg: 0 });
    sim.fire({ elevationDeg: 45, azimuthDeg: 0, muzzleSpeed: 10 });
    while (!sim.impact) sim.advance(0.1);
    sim.fire(SHOT);
    expect(sim.impact).toBeNull();
    expect(sim.state!.time).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/sim.test.ts`
Expected: FAIL — cannot resolve `../src/sim`.

- [ ] **Step 3: Write the implementation**

Create `src/sim.ts`:

```typescript
import { FIXED_DT, stepState } from "./physics/integrator";
import { launchState } from "./physics/shot";
import type { Environment, ProjectileState, ShotParams, Vec3 } from "./physics/types";

export class Simulation {
  env: Environment;
  state: ProjectileState | null = null;
  impact: Vec3 | null = null;
  paused = false;
  timeScale = 1;
  private accumulator = 0;

  constructor(env: Environment) {
    this.env = env;
  }

  fire(params: ShotParams): void {
    this.state = launchState(params);
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
    if (this.state.position.z <= 0 && this.state.velocity.z < 0) {
      this.impact = this.state.position;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test`
Expected: PASS (physics + sim suites).

- [ ] **Step 5: Commit**

```bash
git add src/sim.ts tests/sim.test.ts
git commit -m "feat: fixed-timestep simulation with pause, slow-mo, and frame-step"
```

---

### Task 6: Page scaffold and board setup

**Files:**
- Create: `index.html`
- Create: `src/main.ts`
- Modify: `tsconfig.json` (add `"DOM"` to `lib`)
- Modify: `package.json` (name `woolwich`, `dev` script)
- Delete: `index.ts` (bun init placeholder)

**Interfaces:**
- Consumes: `Board` from `@ue-too/board`: `new Board(canvas)`; `board.step(timestamp)` clears the canvas and applies the camera transform — call it first in every frame, then draw in world coordinates via `board.context`; `board.alignCoordinateSystem = false` makes world +y point up on screen; `board.camera.setPosition({x, y})` and `board.camera.setZoomLevel(n)` position the camera.
- Produces: `index.html` element ids used by later tasks: canvases `#side-view`, `#top-view`; control panel container `#controls`; readout container `#readouts`; buttons `#fire`, `#pause`, `#slowmo`, `#step`.

- [ ] **Step 1: Update tsconfig and package.json, drop the placeholder**

In `tsconfig.json`, change the `lib` line to:

```json
    "lib": ["ESNext", "DOM"],
```

Replace `package.json` entirely with (the `dependencies` versions were written by Task 1's `bun add` — keep whatever exact ranges are already there):

```json
{
  "name": "woolwich",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "bun index.html"
  },
  "dependencies": {
    "@ue-too/board": "^0.17.7",
    "@ue-too/math": "^0.17.7"
  },
  "devDependencies": {
    "@types/bun": "latest"
  },
  "peerDependencies": {
    "typescript": "^5"
  }
}
```

Then delete the bun init placeholder entry point: `rm index.ts`.

- [ ] **Step 2: Write index.html**

Create `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>woolwich — artillery playground</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; background: #14181f; color: #d7dde6; font: 14px/1.4 system-ui, sans-serif; display: flex; height: 100vh; }
    #panel { width: 260px; padding: 16px; box-sizing: border-box; overflow-y: auto; background: #1b212b; }
    #views { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .view { flex: 1; position: relative; min-height: 0; }
    .view canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
    .view .label { position: absolute; top: 8px; left: 12px; opacity: 0.6; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
    #controls label { display: block; margin: 10px 0 2px; }
    #controls output { float: right; opacity: 0.8; }
    #controls input[type="range"] { width: 100%; }
    button { margin: 12px 6px 0 0; padding: 6px 14px; background: #2c3440; color: inherit; border: 1px solid #3d4859; border-radius: 4px; cursor: pointer; }
    button:hover { background: #38445a; }
    #fire { background: #7a2e2e; border-color: #a04040; font-weight: 600; }
    #readouts { margin-top: 16px; font-variant-numeric: tabular-nums; opacity: 0.9; white-space: pre-line; }
  </style>
</head>
<body>
  <div id="panel">
    <h3 style="margin-top:0">woolwich</h3>
    <div id="controls"></div>
    <div>
      <button id="fire">Fire</button>
      <button id="pause">Pause</button>
      <button id="slowmo">Slow-mo</button>
      <button id="step">Step</button>
    </div>
    <div id="readouts"></div>
  </div>
  <div id="views">
    <div class="view"><canvas id="side-view"></canvas><span class="label">side view</span></div>
    <div class="view"><canvas id="top-view"></canvas><span class="label">top-down</span></div>
  </div>
  <script type="module" src="./src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 3: Write the main.ts board skeleton**

Create `src/main.ts` (temporary smoke-test drawing; replaced by real wiring in Task 8):

```typescript
import { Board } from "@ue-too/board";

function setupBoard(canvasId: string): Board {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  const board = new Board(canvas);
  board.alignCoordinateSystem = false; // world +y is up on screen
  board.camera.setPosition({ x: 400, y: 150 });
  board.camera.setZoomLevel(0.5);
  return board;
}

const sideBoard = setupBoard("side-view");
const topBoard = setupBoard("top-view");

function frame(timestamp: number) {
  for (const board of [sideBoard, topBoard]) {
    board.step(timestamp);
    const ctx = board.context;
    if (!ctx) continue;
    // temporary smoke test: axes cross at the origin
    ctx.strokeStyle = "#4a90d9";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-100, 0); ctx.lineTo(100, 0);
    ctx.moveTo(0, -100); ctx.lineTo(0, 100);
    ctx.stroke();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

- [ ] **Step 4: Verify in the browser**

Run: `bun index.html` and open the printed URL.
Expected: dark two-pane layout with the control panel shell; both canvases show a blue axes cross; pan (space+drag or scroll-wheel-button drag) and zoom (ctrl+scroll / pinch) work on each canvas independently. Check the browser console for errors.

- [ ] **Step 5: Run the test suite (regression)**

Run: `bun test`
Expected: PASS — page work must not break physics tests.

- [ ] **Step 6: Commit**

```bash
git add index.html src/main.ts tsconfig.json package.json
git rm index.ts
git commit -m "feat: page scaffold with two ue-too board canvases"
```

---

### Task 7: Scene projections and view renderers

**Files:**
- Create: `src/render/scene.ts`
- Create: `src/render/draw.ts`
- Create: `src/render/sideView.ts`
- Create: `src/render/topView.ts`
- Modify: `src/main.ts` (render a hard-coded demo scene)
- Test: `tests/physics.test.ts` (append — `downrange` only; canvas drawing is manual-verify)

**Interfaces:**
- Consumes: `Vec3` (Task 1), `Trajectory` (Task 4), `predictPath` (Task 4), boards from Task 6.
- Produces:
  - `Scene = { predicted: Trajectory | null; projectile: Vec3 | null; impact: Vec3 | null }`
  - `downrange(p: Vec3): number` — horizontal distance from the launcher: `Math.hypot(p.x, p.y)`
  - `renderSideView(ctx: CanvasRenderingContext2D, scene: Scene): void` — plots (downrange, z)
  - `renderTopView(ctx: CanvasRenderingContext2D, scene: Scene): void` — plots (x, y)
  - Draw helpers: `drawGrid(ctx, spacing, extent)`, `drawPolyline(ctx, pts: {x,y}[], color, dashed)`, `drawCircle(ctx, p, radius, color)`, `drawCross(ctx, p, size, color)`

- [ ] **Step 1: Write the failing test for downrange**

Append to `tests/physics.test.ts`:

```typescript
import { downrange } from "../src/render/scene";

describe("downrange", () => {
  test("is the horizontal distance, ignoring altitude", () => {
    expect(downrange({ x: 3, y: 4, z: 999 })).toBeCloseTo(5, 9);
    expect(downrange({ x: 0, y: 0, z: 10 })).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/physics.test.ts`
Expected: FAIL — cannot resolve `../src/render/scene`.

- [ ] **Step 3: Write scene.ts and draw.ts**

Create `src/render/scene.ts`:

```typescript
import type { Trajectory } from "../physics/predict";
import type { Vec3 } from "../physics/types";

export type Scene = {
  predicted: Trajectory | null;
  projectile: Vec3 | null;
  impact: Vec3 | null;
};

/** Horizontal distance from the launcher at the origin. */
export function downrange(p: Vec3): number {
  return Math.hypot(p.x, p.y);
}
```

Create `src/render/draw.ts`:

```typescript
export type Pt = { x: number; y: number };

export function drawGrid(ctx: CanvasRenderingContext2D, spacing: number, extent: number): void {
  ctx.save();
  ctx.strokeStyle = "rgba(140, 160, 190, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let v = -extent; v <= extent; v += spacing) {
    ctx.moveTo(v, -extent); ctx.lineTo(v, extent);
    ctx.moveTo(-extent, v); ctx.lineTo(extent, v);
  }
  ctx.stroke();
  // axes slightly brighter
  ctx.strokeStyle = "rgba(140, 160, 190, 0.35)";
  ctx.beginPath();
  ctx.moveTo(-extent, 0); ctx.lineTo(extent, 0);
  ctx.moveTo(0, -extent); ctx.lineTo(0, extent);
  ctx.stroke();
  ctx.restore();
}

export function drawPolyline(ctx: CanvasRenderingContext2D, pts: Pt[], color: string, dashed: boolean): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  if (dashed) ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.stroke();
  ctx.restore();
}

export function drawCircle(ctx: CanvasRenderingContext2D, p: Pt, radius: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawCross(ctx: CanvasRenderingContext2D, p: Pt, size: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x - size, p.y - size); ctx.lineTo(p.x + size, p.y + size);
  ctx.moveTo(p.x - size, p.y + size); ctx.lineTo(p.x + size, p.y - size);
  ctx.stroke();
  ctx.restore();
}
```

- [ ] **Step 4: Run the downrange test to verify it passes**

Run: `bun test tests/physics.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the two view renderers**

Create `src/render/sideView.ts`:

```typescript
import type { Vec3 } from "../physics/types";
import { drawCircle, drawCross, drawGrid, drawPolyline } from "./draw";
import { downrange, type Scene } from "./scene";

const PREDICTED = "rgba(120, 190, 255, 0.7)";
const PROJECTILE = "#ffb347";
const IMPACT = "#e05555";
const LAUNCHER = "#9ad17b";

function project(p: Vec3): { x: number; y: number } {
  return { x: downrange(p), y: p.z };
}

export function renderSideView(ctx: CanvasRenderingContext2D, scene: Scene): void {
  drawGrid(ctx, 100, 5000);
  drawCircle(ctx, { x: 0, y: 0 }, 6, LAUNCHER);
  if (scene.predicted) drawPolyline(ctx, scene.predicted.points.map(project), PREDICTED, true);
  if (scene.impact) drawCross(ctx, project(scene.impact), 10, IMPACT);
  if (scene.projectile) drawCircle(ctx, project(scene.projectile), 5, PROJECTILE);
}
```

Create `src/render/topView.ts`:

```typescript
import type { Vec3 } from "../physics/types";
import { drawCircle, drawCross, drawGrid, drawPolyline } from "./draw";
import type { Scene } from "./scene";

const PREDICTED = "rgba(120, 190, 255, 0.7)";
const PROJECTILE = "#ffb347";
const IMPACT = "#e05555";
const LAUNCHER = "#9ad17b";

function project(p: Vec3): { x: number; y: number } {
  return { x: p.x, y: p.y };
}

export function renderTopView(ctx: CanvasRenderingContext2D, scene: Scene): void {
  drawGrid(ctx, 100, 5000);
  drawCircle(ctx, { x: 0, y: 0 }, 6, LAUNCHER);
  if (scene.predicted) drawPolyline(ctx, scene.predicted.points.map(project), PREDICTED, true);
  if (scene.impact) drawCross(ctx, project(scene.impact), 10, IMPACT);
  if (scene.projectile) drawCircle(ctx, project(scene.projectile), 5, PROJECTILE);
}
```

- [ ] **Step 6: Point main.ts at a hard-coded demo scene**

Replace the smoke-test drawing in `src/main.ts` with:

```typescript
import { Board } from "@ue-too/board";
import { predictPath } from "./physics/predict";
import { renderSideView } from "./render/sideView";
import { renderTopView } from "./render/topView";
import type { Scene } from "./render/scene";

function setupBoard(canvasId: string): Board {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  const board = new Board(canvas);
  board.alignCoordinateSystem = false;
  board.camera.setPosition({ x: 400, y: 150 });
  board.camera.setZoomLevel(0.5);
  return board;
}

const sideBoard = setupBoard("side-view");
const topBoard = setupBoard("top-view");

// temporary demo scene; Task 8 replaces this with live controls + simulation
const demoScene: Scene = {
  predicted: predictPath(
    { elevationDeg: 45, azimuthDeg: 15, muzzleSpeed: 100 },
    { gravity: 9.81, dragCoefficient: 0.0003, windSpeed: 10, windDirectionDeg: 90 },
  ),
  projectile: null,
  impact: null,
};

function frame(timestamp: number) {
  sideBoard.step(timestamp);
  if (sideBoard.context) renderSideView(sideBoard.context, demoScene);
  topBoard.step(timestamp);
  if (topBoard.context) renderTopView(topBoard.context, demoScene);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

- [ ] **Step 7: Verify in the browser**

Run: `bun index.html` and open the printed URL.
Expected: side view shows a dashed asymmetric arc rising and falling from the green launcher dot; top-down view shows a dashed near-straight line curving slightly north (the crosswind drift). Grid and axes visible in both; pan/zoom still works.

- [ ] **Step 8: Run the test suite and commit**

Run: `bun test` — expected PASS.

```bash
git add src/render tests/physics.test.ts src/main.ts
git commit -m "feat: side and top-down view renderers with predicted path"
```

---

### Task 8: Controls, readouts, and full wiring

**Files:**
- Create: `src/ui/controls.ts`
- Modify: `src/main.ts` (replace demo scene with live sim + controls)

**Interfaces:**
- Consumes: `Simulation` (Task 5), `predictPath` (Task 4), `Scene` (Task 7), renderers (Task 7), element ids from `index.html` (Task 6), `ShotParams`/`Environment` (Task 1).
- Produces:
  - `setupControls(onChange: () => void): ControlPanel` — builds sliders into `#controls`, wires buttons.
  - `ControlPanel = { shotParams(): ShotParams; environment(): Environment; onFire(cb: () => void): void; onPauseToggle(cb: () => boolean): void; onSlowmoToggle(cb: () => boolean): void; onStep(cb: () => void): void; setReadouts(text: string): void }`

- [ ] **Step 1: Write the control panel**

Create `src/ui/controls.ts`:

```typescript
import type { Environment, ShotParams } from "../physics/types";

type SliderSpec = { id: string; label: string; min: number; max: number; step: number; value: number; unit: string };

const SLIDERS: SliderSpec[] = [
  { id: "elevation", label: "Elevation", min: 0, max: 90, step: 1, value: 45, unit: "°" },
  { id: "azimuth", label: "Azimuth", min: -180, max: 180, step: 1, value: 0, unit: "°" },
  { id: "muzzle", label: "Muzzle velocity", min: 10, max: 300, step: 5, value: 100, unit: " m/s" },
  { id: "gravity", label: "Gravity", min: 0, max: 25, step: 0.01, value: 9.81, unit: " m/s²" },
  { id: "drag", label: "Drag coefficient", min: 0, max: 0.002, step: 0.0001, value: 0.0003, unit: " /m" },
  { id: "windspeed", label: "Wind speed", min: 0, max: 40, step: 1, value: 0, unit: " m/s" },
  { id: "winddir", label: "Wind direction", min: -180, max: 180, step: 5, value: 0, unit: "°" },
];

export type ControlPanel = {
  shotParams(): ShotParams;
  environment(): Environment;
  onFire(cb: () => void): void;
  /** cb returns the new paused state, used to update the button label */
  onPauseToggle(cb: () => boolean): void;
  /** cb returns whether slow-mo is now active */
  onSlowmoToggle(cb: () => boolean): void;
  onStep(cb: () => void): void;
  setReadouts(text: string): void;
};

export function setupControls(onChange: () => void): ControlPanel {
  const container = document.getElementById("controls")!;
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
  const readouts = document.getElementById("readouts")!;
  const fireBtn = document.getElementById("fire")!;
  const pauseBtn = document.getElementById("pause")!;
  const slowmoBtn = document.getElementById("slowmo")!;
  const stepBtn = document.getElementById("step")!;

  return {
    shotParams: () => ({ elevationDeg: value("elevation"), azimuthDeg: value("azimuth"), muzzleSpeed: value("muzzle") }),
    environment: () => ({ gravity: value("gravity"), dragCoefficient: value("drag"), windSpeed: value("windspeed"), windDirectionDeg: value("winddir") }),
    onFire: (cb) => fireBtn.addEventListener("click", cb),
    onPauseToggle: (cb) => pauseBtn.addEventListener("click", () => { pauseBtn.textContent = cb() ? "Resume" : "Pause"; }),
    onSlowmoToggle: (cb) => slowmoBtn.addEventListener("click", () => { slowmoBtn.textContent = cb() ? "Realtime" : "Slow-mo"; }),
    onStep: (cb) => stepBtn.addEventListener("click", cb),
    setReadouts: (text) => { readouts.textContent = text; },
  };
}
```

- [ ] **Step 2: Wire everything in main.ts**

Replace the demo-scene block and `frame` in `src/main.ts` so the whole file reads:

```typescript
import { Board } from "@ue-too/board";
import { predictPath, type Trajectory } from "./physics/predict";
import { renderSideView } from "./render/sideView";
import { renderTopView } from "./render/topView";
import { downrange, type Scene } from "./render/scene";
import { Simulation } from "./sim";
import { setupControls } from "./ui/controls";

function setupBoard(canvasId: string): Board {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  const board = new Board(canvas);
  board.alignCoordinateSystem = false;
  board.camera.setPosition({ x: 400, y: 150 });
  board.camera.setZoomLevel(0.5);
  return board;
}

const sideBoard = setupBoard("side-view");
const topBoard = setupBoard("top-view");

let predicted: Trajectory | null = null;

const controls = setupControls(() => {
  sim.env = controls.environment();
  predicted = predictPath(controls.shotParams(), sim.env);
});

const sim = new Simulation(controls.environment());
predicted = predictPath(controls.shotParams(), sim.env);

controls.onFire(() => {
  sim.env = controls.environment();
  sim.fire(controls.shotParams());
});
controls.onPauseToggle(() => (sim.paused = !sim.paused));
controls.onSlowmoToggle(() => {
  sim.timeScale = sim.timeScale === 1 ? 0.25 : 1;
  return sim.timeScale !== 1;
});
controls.onStep(() => sim.stepFrame());

function readoutText(): string {
  if (!sim.state) return "ready — adjust sliders, then Fire";
  const { position, velocity, time } = sim.state;
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  const status = sim.impact ? "impact" : sim.paused ? "paused" : "in flight";
  return [
    `status: ${status}`,
    `t: ${time.toFixed(2)} s`,
    `speed: ${speed.toFixed(1)} m/s`,
    `altitude: ${Math.max(0, position.z).toFixed(1)} m`,
    `downrange: ${downrange(position).toFixed(1)} m`,
  ].join("\n");
}

let lastTimestamp: number | null = null;

function frame(timestamp: number) {
  const elapsed = lastTimestamp === null ? 0 : (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;
  sim.advance(Math.min(elapsed, 0.25)); // clamp huge tab-switch gaps

  const scene: Scene = {
    predicted,
    projectile: sim.state && !sim.impact ? sim.state.position : null,
    impact: sim.impact,
  };

  sideBoard.step(timestamp);
  if (sideBoard.context) renderSideView(sideBoard.context, scene);
  topBoard.step(timestamp);
  if (topBoard.context) renderTopView(topBoard.context, scene);

  controls.setReadouts(readoutText());
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

- [ ] **Step 3: Verify in the browser (manual acceptance checklist)**

Run: `bun index.html` and open the printed URL. Check each item:

1. Moving any slider immediately reshapes the dashed predicted arc in **both** views.
2. Fire: an orange projectile flies along the dashed path in both views and a red X appears at impact; readouts update live (time, speed, altitude, downrange).
3. With wind speed > 0 and direction 90°, the top-down track visibly bends north; the side view arc becomes asymmetric with drag > 0.
4. Pause freezes flight (button reads "Resume"); Step advances one frame while paused; Slow-mo visibly slows flight (button reads "Realtime" while active).
5. Gravity slider at 0: predicted path truncates (no infinite loop, UI stays responsive).
6. Firing again mid-flight or after impact starts a clean new flight.

- [ ] **Step 4: Run the full test suite**

Run: `bun test`
Expected: PASS — all suites.

- [ ] **Step 5: Commit**

```bash
git add src/ui/controls.ts src/main.ts
git commit -m "feat: control panel, time controls, readouts, and full wiring"
```
