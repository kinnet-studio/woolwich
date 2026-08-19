# Woolwich v1 — Interactive Artillery Physics Playground

**Date:** 2026-08-19
**Status:** Approved

## Purpose

An interactive web playground for simulating artillery/missile projectiles.
The user sets launch parameters and environmental conditions with sliders,
previews the predicted trajectory, fires, and watches the flight in two
synchronized views. Future directions (not in v1, but the architecture must
not preclude them): artillery game mode with terrain and targets, and a
missile/guidance sandbox with thrust and homing.

## Scope (v1)

- 3D ballistic physics: gravity, quadratic air drag, constant horizontal wind.
- One launcher at the world origin; one projectile in flight at a time.
- Predicted path preview (dotted arc) that updates live as sliders move.
- Two synchronized views: side view and top-down map view.
- Time controls: pause, slow-motion, frame-step; live flight readouts.

Out of scope for v1: terrain, targets, hit scoring, multiple launchers,
thrust/guidance, altitude-varying air density, persistent shot trails.

## Architecture

Physics is fully independent of rendering and the DOM, so later modes only
add forces and entities.

```
src/
  physics/   integrator, forces, shot state, predictPath()   ← pure, unit-tested
  render/    sideView.ts, topView.ts, shared draw helpers
  ui/        controls, readouts
  sim.ts     fixed-timestep loop + time controls
  main.ts    wiring
index.html
```

### Physics core (`src/physics/`)

- Coordinate system: x = east, y = north, z = up. Launcher at origin.
- Shot parameters: elevation angle, azimuth, muzzle speed.
- Forces on the projectile:
  - Gravity: constant acceleration `(0, 0, -g)`.
  - Drag: quadratic, `a_drag = -k · |v_air| · v_air`, where `v_air` is the
    projectile velocity relative to the wind and `k` is the drag
    coefficient slider value.
  - Wind: constant horizontal vector from wind speed + direction sliders;
    it affects the projectile only through the drag term.
- Integration: semi-implicit Euler at a fixed timestep of 1/120 s.
  Deterministic by construction.
- `predictPath(params, env)`: runs the same integrator ahead of time until
  ground impact (z ≤ 0) and returns the trajectory polyline. Because the
  integrator is deterministic and shared, the prediction matches the live
  flight exactly.

### Rendering (`src/render/`)

- Two `<canvas>` elements, each wrapped in `@ue-too/board` for pan/zoom,
  with an optional follow-the-projectile camera. `@ue-too/math` for vectors.
- Side view: plots (horizontal downrange distance from launcher, altitude).
- Top-down view: plots (east, north); shows wind drift and impact point.
- Both views draw: ground/grid reference, launcher, predicted path (dotted),
  live projectile, and impact marker.

### Simulation loop (`src/sim.ts`)

- requestAnimationFrame driver with a fixed-timestep accumulator feeding the
  physics integrator.
- Time scale factor for slow-motion; pause; single frame-step while paused.

### UI (`src/ui/`)

- Plain DOM, no framework. Sliders: elevation, azimuth, muzzle velocity,
  gravity, drag coefficient, wind speed, wind direction. Fire button.
  Time controls: pause / slow-mo / step.
- Readouts during flight: speed, altitude, downrange distance, flight time.
- Any slider change re-runs `predictPath` and redraws the dotted preview in
  both views.

## Stack

- Bun end-to-end: `bun index.html` as the dev server (HMR), `bun test` for
  tests, TypeScript throughout.
- Dependencies: `@ue-too/board`, `@ue-too/math`. No UI framework.

## Error handling

- Slider inputs are range-clamped by construction; no free-text numeric
  entry in v1.
- `predictPath` caps at a maximum simulated flight time so degenerate
  parameter combinations (e.g. zero gravity) cannot loop forever; the
  preview truncates with the polyline drawn as far as computed.

## Testing

Unit tests on the physics core with `bun test`:

- With drag = 0 and no wind, the trajectory matches the closed-form
  parabola (range, apex, flight time) within integration tolerance.
- Adding drag strictly shortens range versus the drag-free shot.
- Wind displaces the impact point downwind.
- `predictPath` output matches a step-by-step live simulation of the same
  shot exactly.

Rendering and UI are verified manually in the browser for v1.
