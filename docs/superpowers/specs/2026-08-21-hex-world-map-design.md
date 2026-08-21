# Woolwich v3.0 — Hex World Map Foundation (Strategic Layer)

**Date:** 2026-08-21
**Status:** Approved
**Builds on:** v2.1 shooting gallery (`docs/superpowers/specs/2026-08-19-shooting-gallery-design.md`)
**Serves:** build-order item 2 of `docs/VISION.md` (strategic layer)

## Purpose

Lay the foundation of the strategic layer: a seeded, procedurally generated
hex world map with terrain classes and two blocs owning territory, rendered
on a third page with pan/zoom, hover, and selection. This slice establishes
the hex math library, the strategic world data model, the generation
pipeline, and the map renderer that every later strategic slice (units,
frontlines that move, economy, the battle bridge) builds on.

## Scope (v3.0)

- Pure hex math: axial/offset coordinates, neighbors, distance, rings,
  lines, hex ↔ world conversion.
- `HexWorld` data model: flat typed arrays indexed by offset coordinates.
- Seeded generation: elevation → terrain classes; two blocs partition the
  main landmass along a noisy frontline; islands stay neutral.
- `map.html`: one `@ue-too/board` canvas with baked terrain and ownership
  layers, frontline edges, hover/selection, seed control, info panel.
- A shared value-noise module extracted from the battle terrain generator
  (pure refactor; battle terrain output for a given seed is unchanged).

Out of scope (later slices): units and counters, movement and orders,
frontline changes over time, economy/production, fog of war, province or
nation names, save/load, the battle bridge, ECS adoption (trigger
unchanged: when a second *behavior* system lands).

## Architecture

New modules alongside the existing layout; `index.html` and `gallery.html`
keep working unchanged.

```
map.html                   third page: full-window map + side panel
src/
  hex/
    coords.ts              Axial/Offset types, odd-r conversions, keys
    ops.ts                 directions, neighbors, distance, ring, spiral, line
    layout.ts              HexLayout, hexToWorld, worldToHex, hexCorners
  terrain/
    noise.ts               value noise (extracted from generate.ts)
    generate.ts            (modified: uses noise.ts; same output per seed)
  strategic/
    world.ts               HexWorld type, indexing, bounds
    generate.ts            generateWorld(seed): elevation, terrain classes
    ownership.ts           landmasses, capitals, bloc partition
    queries.ts             frontier edges, counts
    main.ts                page wiring: board, pointer → hex, panel, rAF loop
    panel.ts               seed control, info readout, tally
  render/
    hexMap.ts              baked terrain/owner layers, edges, hover/select
```

### Hex math (`src/hex/`)

Pure, DOM-free, no knowledge of terrain or rendering.

**Conventions**

- Pointy-top hexes.
- Axial coordinates `{ q, r }` for all math; cube `s = -q - r` derived
  where needed.
- Odd-r offset coordinates `{ col, row }` only at the storage boundary
  (`row` = `r`; odd rows are shoved right by half a hex).
- World coordinates in **kilometers**, `+x` east, `+y` north (same
  orientation as the battle layer, different unit).
- Direction indices 0–5 start at east and go counterclockwise, matching the
  project's angle convention: `DIRECTIONS = [(+1,0), (0,+1), (−1,+1),
  (−1,0), (0,−1), (+1,−1)]` as `(q, r)` deltas — E, NE, NW, W, SW, SE
  (with `y = 1.5·size·r` pointing north, `+r` is north-east). Direction `d`
  points at angle `60·d` degrees.

**`coords.ts`**

- `Axial { q: number; r: number }`, `Offset { col: number; row: number }`.
- `axialToOffset(h): Offset` — `col = q + (r - (r & 1)) / 2`, `row = r`.
- `offsetToAxial(o): Axial` — `q = col - (row - (row & 1)) / 2`, `r = row`.
- `hexEquals(a, b): boolean`.

**`ops.ts`**

- `neighbor(h, dir)`, `neighbors(h): Axial[]` (6, in direction order).
- `distance(a, b)` = `max(|dq|, |dr|, |ds|)`.
- `ring(center, radius): Axial[]` — `6·radius` hexes (radius 0 → `[center]`),
  starting at `center + DIRECTIONS[4]·radius` and walking direction by
  direction; order is deterministic and documented in the function.
- `spiral(center, radius): Axial[]` — center then rings 1..radius.
- `line(a, b): Axial[]` — cube linear interpolation with `distance(a, b)`
  steps, rounded with `roundHex`; includes both endpoints; consecutive
  hexes are adjacent. A tiny epsilon nudge (`1e-6` on `q` and `r`) breaks
  ties deterministically.
- `roundHex(fq, fr): Axial` — cube rounding (reset the component with the
  largest rounding error).

**`layout.ts`**

- `HexLayout { size: number }` — circumradius in km. The map uses
  `size = 20 / √3 ≈ 11.547 km`, i.e. 20 km flat-to-flat, so one strategic
  hex is roughly one battle map (VISION: "maps 10–30 km across").
- `hexToWorld(h, layout): { x, y }` — center:
  `x = size·√3·(q + r/2)`, `y = size·1.5·r`.
- `worldToHex(p, layout): Axial` — inverse to fractional axial, then
  `roundHex`. Always returns an axial; bounds are the caller's concern.
- `hexCorners(h, layout): {x, y}[]` — 6 points, corner `i` at angle
  `60·i − 30` degrees (corner 0 lower-right, corner 1 upper-right, corner 2
  top, …), each `size` from the center. The edge facing direction `d` runs
  from corner `d` to corner `(d + 1) mod 6`.
- `hexWidth(layout) = size·√3`, `hexHeight(layout) = size·2`,
  `rowSpacing(layout) = size·1.5` — convenience constants for layout code.

### Strategic world (`src/strategic/world.ts`)

```ts
export const COLS = 80;
export const ROWS = 50;
export const Terrain = { Ocean: 0, Plains: 1, Forest: 2, Hills: 3, Mountains: 4 } as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];
export const Owner = { Neutral: 0, BlocA: 1, BlocB: 2 } as const;
export type Owner = (typeof Owner)[keyof typeof Owner];

export interface HexWorld {
  cols: number;            // 80
  rows: number;            // 50
  layout: HexLayout;
  seed: number;
  elevation: Float32Array; // cols·rows, normalized 0..1, row-major odd-r
  terrain: Uint8Array;     // Terrain
  owner: Uint8Array;       // Owner
  capitals: [Axial, Axial];// BlocA, BlocB
  degenerate: boolean;     // ownership fallback was used (see Generation)
}
```

- `index(world, col, row) = row·cols + col`.
- `inBounds(world, h: Axial): boolean` via `axialToOffset`.
- `hexAt(world, h: Axial): number` — array index, or `-1` when out of
  bounds.
- `axialOf(world, index): Axial`.
- `isLand(world, index) = terrain[index] !== Terrain.Ocean`.
- World extent in km: width `cols·hexWidth + hexWidth/2`, height
  `(rows − 1)·rowSpacing + hexHeight`; hex `(0,0)`'s center is at the
  world origin, so the map spans `x ∈ [−w/2, cols·w]`, `y ∈ [−size, …]`.
  `worldBounds(world)` returns the bounding box for camera fitting.

### Shared value noise (`src/terrain/noise.ts`)

Extracted from `src/terrain/generate.ts` so both layers share one
implementation. The battle terrain's output for a given seed **must not
change**; the existing terrain tests are the regression guard.

```ts
export interface Octave { spacing: number; amplitude: number }
export function valueNoise(
  seed: number, octaves: Octave[], extentX: number, extentY: number, salt = 0,
): (x: number, y: number) => number
```

- For octave `o`, lattice values come from `mulberry32((seed·4 + o + 1 + salt) >>> 0)`,
  filled row-major, lattice side `ceil(max(extentX, extentY) / spacing) + 2`
  (identical to today's `ceil(2·EXTENT / spacing) + 2` for the square battle
  field).
- Sampling: bilinear with `smoothstep` weights; contribution
  `(n − 0.5)·2·amplitude`; the returned value is the sum over octaves and
  lies in `[−Σamplitude, +Σamplitude]`. `x, y ≥ 0` are in the same units as
  `spacing`.
- `generateTerrain` becomes: `const noise = valueNoise(seed, OCTAVES, 2·EXTENT, 2·EXTENT)`
  and `heights[i] = noise(ix·CELL_SIZE, iy·CELL_SIZE)`, then the apron as
  before.

### Generation (`src/strategic/generate.ts`)

`generateWorld(seed: number): HexWorld`. Every random draw comes from
mulberry32 streams derived from `seed` in a fixed order, so the same seed
always produces an identical world. `seed` is floored to an integer first.

All noise is sampled at hex centers in world km, shifted so coordinates are
non-negative: `nx = x + hexWidth/2`, `ny = y + size`.

1. **Elevation.**
   `ELEVATION_OCTAVES = [{400, 0.4}, {200, 0.3}, {100, 0.2}, {50, 0.1}]`
   (km, amplitude), `salt = 0`. Raw value normalized:
   `e = 0.5 + noise / (2·Σamplitude)`. Then a subtractive edge falloff so
   the theater reads as a continent with coasts and islands rather than a
   tiled slab: with `u = (nx / width)·2 − 1`, `v = (ny / height)·2 − 1`,
   `d = √(u² + v²)`,
   `falloff = smoothstep(clamp((d − 0.5) / 0.5, 0, 1))`;
   `elevation = clamp(e − 0.35·falloff, 0, 1)`, stored as `Float32`.
2. **Terrain classes — quantile thresholds.** Absolute thresholds make the
   land/mountain share swing wildly between seeds (the 400 km octave sets
   each seed's overall level), so thresholds are quantiles of this world's
   own elevation field: `SEA_QUANTILE = 0.45`, `HILLS_QUANTILE = 0.82`,
   `MOUNTAINS_QUANTILE = 0.94`, `FOREST_QUANTILE = 0.60`, with
   `quantile(values, f) = sorted[min(n − 1, floor(f·n))]` computed over the
   stored `Float32` elevations. `elevation < quantile(SEA)` → Ocean;
   `≥ quantile(MOUNTAINS)` → Mountains; `≥ quantile(HILLS)` → Hills;
   otherwise Plains, except that a second, independent moisture field
   (`MOISTURE_OCTAVES = [{300, 0.5}, {120, 0.3}, {40, 0.2}]`, `salt = 16`,
   normalized the same way, no falloff, not stored)
   `≥ quantile(moisture, FOREST_QUANTILE)` turns Plains into Forest. Every
   seed therefore has ≈ 55 % land, ≈ 22 % of land hills, ≈ 11 % mountains,
   and 15–40 % forest (prototyped over seeds 1–12: one main continent of
   ≈ 2000–2200 hexes plus islands, capitals 40–56 hexes apart).
3. **Landmasses.** BFS over land hexes (6-neighborhood) labels connected
   components; the largest by hex count is the *main landmass* (ties →
   the one containing the lowest index).
4. **Capitals.** Over the main landmass compute `minCol`, `maxCol`,
   `width = maxCol − minCol`, and the centroid row. Target points:
   `A = (minCol + width/6, centroidRow)`, `B = (maxCol − width/6,
   centroidRow)`. Each capital is the Plains hex of the main landmass with
   the smallest hex distance to its target (ties → lowest index); if the
   landmass has no Plains hex, any land hex of it. The world is
   **degenerate** if `distance(capitalA, capitalB) < 8`.
5. **Ownership (normal).** Multi-source Dijkstra from both capitals over
   land hexes only. Step cost into a hex =
   `TERRAIN_COST[terrain] × jitter[hex]`, with
   `TERRAIN_COST = { Plains 1, Forest 1.5, Hills 2, Mountains 4 }` and
   `jitter` drawn per hex (row-major, once, before the search) from
   `mulberry32((seed·4 + 32) >>> 0)` uniformly in `[0.7, 1.3]`. Binary heap
   ordered by `(cost, index)`; a hex is owned by whichever source settles it
   first (equal cost → BlocA, by heap ordering with BlocA's entries pushed
   first). Land never reached (other islands) stays Neutral. Ocean is always
   Neutral.
6. **Ownership (degenerate).** Skip the search; every hex of the main
   landmass with `col < (minCol + maxCol)/2` is BlocA, the rest BlocB;
   other land Neutral; `degenerate = true`.

Steps 3–6 are exported as `assignOwnership(world): void` (reads `terrain`,
writes `owner`, `capitals`, `degenerate`) so tests can drive them on a
hand-built world; `generateWorld` calls it after steps 1–2.

The generator never throws and always terminates: the search is over a
finite grid with strictly positive costs.

### Queries (`src/strategic/queries.ts`)

- `isFrontierEdge(world, index, dir): boolean` — the neighbor in `dir` is
  in bounds and has a different owner, and at least one side is not
  Neutral.
- `frontlineEdges(world): { index: number; dir: 0 | 1 | 2 }[]` — every
  frontier edge exactly once (only directions 0–2 are emitted, since
  direction `d` from hex A is direction `d + 3` from hex B). Each entry
  also carries `kind: "front" | "border"`: `front` when both owners are
  blocs, `border` when one side is Neutral.
- `countByOwner(world): [neutralLand, blocA, blocB]` (land hexes only).
- `frontLength(world)` — number of `front` edges.

### Map page (`map.html`, `src/strategic/main.ts`, `src/strategic/panel.ts`)

- `dev` script becomes `bun index.html gallery.html map.html`.
- Layout: a full-window canvas and a fixed side panel (plain DOM, same
  style as the gallery). The canvas is CSS-sized; `Board`'s own resize
  observer keeps the backing store in sync (as on the other pages). A frame
  with no `board.context` is skipped.
- Board: `new Board(canvas)`, `alignCoordinateSystem = false`, camera
  positioned at the center of `worldBounds(world)` with zoom chosen so the
  whole map fits with a 5% margin. Board provides pan/zoom.
- Pointer: `pointermove` converts the pointer to world coordinates through
  the board camera, then `worldToHex` → `hexAt`; `-1` clears the hover.
  `click` on an in-bounds hex selects it; click on out-of-bounds clears the
  selection. (Ocean hexes are selectable — they are hexes too.)
- Panel:
  - Seed input + **Regenerate** button. The seed is parsed with `Number`;
    non-finite → seed 1, written back into the field. Regeneration rebuilds
    the world and both baked layers and clears hover/selection.
  - Info readout for the hovered hex (or the selected hex when nothing is
    hovered): offset and axial coordinates, terrain name, elevation (two
    decimals), owner, and — when both a selection and a hover exist —
    `distance(selected, hovered)` in hexes and in km (`× 20`).
  - Tally line: land hexes per bloc and neutral, `frontLength`, and a
    `degenerate world` warning when the flag is set.
- rAF loop: `board.step(t)`, then `renderHexMap(ctx, world, layers, hover,
  selected)`.

### Renderer (`src/render/hexMap.ts`)

Three layers, drawn in world coordinates.

1. **Terrain layer.** `buildTerrainLayer(world): Layer` paints every hex's
   filled polygon into an offscreen canvas once per generation. Palette
   per terrain class (ocean, plains, forest, hills, mountains); the fill is
   lightened by up to 15% with elevation within its class so relief reads.
   Pixel scale: a fixed `PX_PER_KM` (e.g. 2) — the offscreen canvas is
   ≈ 3300 × 1800 px. `Layer { canvas, originX, originY, pxPerKm }` records
   the world-space placement so `drawLayer(ctx, layer)` is one `drawImage`,
   using the same proxied-world-coordinate approach as `drawTerrainTop`.
2. **Ownership layer.** `buildOwnerLayer(world): Layer` paints translucent
   bloc tints (BlocA, BlocB; Neutral unpainted) into a second offscreen
   canvas. Kept separate from terrain because later slices change
   ownership without touching terrain. On top, per frame,
   `drawFrontline(ctx, world, edges)`: `front` edges as a thick solid line
   along the shared hex edge (corners `dir` and `dir + 1` of the hex),
   `border` edges as a thin dashed line.
3. **Interaction layer.** Per frame: capital markers (a ring at each
   capital's center), hovered hex outline, selected hex outline (different
   color/weight). Line widths are specified in screen pixels and divided by
   the camera zoom so they stay crisp at any zoom.

`renderHexMap` is the only entry point the page uses.

## Stack

No new dependencies: `@ue-too/board`, `@ue-too/math`, Bun, TypeScript, no
UI framework. (`@ue-too/being` stays gallery-only; the map page has no
interaction state machine yet — hover/select are not a flow with guarded
transitions. Revisit when orders/movement arrive.)

## Error handling

- Bad seed input → seed 1, echoed into the field; never NaN downstream.
- `worldToHex` always returns an axial; `hexAt` returns `-1` out of
  bounds and the UI treats it as "no hex".
- Degenerate landmass (capitals < 8 apart) → column-split fallback and a
  visible warning; generation never throws.
- Dijkstra terminates (finite grid, positive costs); BFS terminates.
- A frame without a `board.context` is skipped.
- Clicks that end a pan (pointer moved more than 4 px since `pointerdown`)
  do not change the selection.
- Layer building with an unavailable 2D context (headless) returns a layer
  whose `canvas` is `null`; `drawLayer` is a no-op for it. Keeps
  `buildTerrainLayer` importable in tests without exercising drawing.

## Testing

`bun test` (deterministic units, no DOM):

- **Hex (`tests/hex.test.ts`):** offset↔axial round-trip for every cell of
  an 80 × 50 grid; `neighbors` returns 6 distinct hexes each at distance 1;
  `distance` is symmetric, zero on self, and equals the ring radius for
  every hex of `ring(c, r)`; `ring(c, r)` has `6r` distinct hexes
  (`r = 1..5`) and `ring(c, 0) = [c]`; `spiral(c, r)` has `1 + 3r(r+1)`
  distinct hexes; `line(a, b)` starts at `a`, ends at `b`, has
  `distance + 1` hexes, and consecutive hexes are adjacent (several
  direction cases including straight lines along each axis);
  `hexToWorld` → `worldToHex` round-trips for every hex of the grid and for
  points jittered up to `0.45·size` from each center; `hexCorners` are all
  exactly `size` from the center and `hexWidth`/`hexHeight` match the
  corner extents.
- **Noise / battle terrain (`tests/terrain.test.ts`):** unchanged and still
  green after the extraction. Add one test pinning a handful of
  `generateTerrain(1)` height samples to their current values so the
  refactor provably preserves output.
- **Strategic (`tests/strategic.test.ts`):** same seed → identical
  `elevation`, `terrain`, `owner` arrays and capitals; different seeds →
  different arrays; every hex's terrain band matches its stored elevation
  against thresholds recomputed with the exported `quantile` and quantile
  constants; `classify` unit-tested on explicit values; land count within
  2100–2300 of 4000 and forest 5–60 % of land; ocean is always
  Neutral and every owned hex is land; both capitals are land, owned by
  their bloc, and ≥ 8 apart on a non-degenerate seed; every bloc's
  territory is connected to its capital through same-owner land (BFS);
  `frontlineEdges` contains only edges whose two sides differ, each edge
  once, `kind` correct; `countByOwner` sums to the land count; the
  degenerate fallback exercised on a hand-built tiny `HexWorld` passed
  through the exported `assignOwnership(world)` step.
- **Rendering and interaction:** verified manually in the browser, per
  project convention.
