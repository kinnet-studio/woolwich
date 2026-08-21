# Woolwich v3.0 Hex World Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A third page (`map.html`) showing a seeded, procedurally generated 80 × 50 hex world with terrain classes and two blocs owning territory, rendered with pan/zoom, hover, and selection — the foundation of the strategic layer.

**Architecture:** A pure hex-math library (`src/hex/`) handles axial/offset coordinates, neighbors, distance, rings, lines, and hex ↔ world (km) conversion. The world is flat typed arrays (`src/strategic/world.ts`) filled by a seeded generator: shared value noise → elevation → quantile-classified terrain → multi-source Dijkstra from two capitals for bloc ownership. The renderer bakes terrain and ownership into offscreen canvases once per generation and draws frontline edges, capitals, hover, and selection per frame on one `@ue-too/board` canvas.

**Tech Stack:** Bun (dev server `bun index.html gallery.html map.html`, `bun test`), TypeScript (strict, `noUncheckedIndexedAccess`), `@ue-too/board` (existing dep), no UI framework. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-21-hex-world-map-design.md`

## Global Constraints

- Hexes are pointy-top; axial `{ q, r }` for all math; odd-r offset `{ col, row }` only at the storage boundary; world coordinates in **kilometers**, `+x` east, `+y` north. (Spec: Hex math → Conventions)
- `DIRECTIONS = [(+1,0), (0,+1), (−1,+1), (−1,0), (0,−1), (+1,−1)]` — E, NE, NW, W, SW, SE; direction `d` points at angle `60·d` degrees. Corner `i` is at angle `60·i − 30` degrees; the edge facing direction `d` runs from corner `d` to corner `(d + 1) mod 6`. (Spec: Hex math)
- Map: `COLS = 80`, `ROWS = 50`, hex circumradius `size = 20 / √3` km (20 km flat-to-flat). Hex `(0,0)`'s center is the world origin. (Spec: Strategic world)
- `HexWorld` is flat typed arrays indexed `row·cols + col` (row-major odd-r): `elevation: Float32Array` in `[0, 1]`, `terrain: Uint8Array`, `owner: Uint8Array`. Terrain ids: Ocean 0, Plains 1, Forest 2, Hills 3, Mountains 4. Owner ids: Neutral 0, BlocA 1, BlocB 2. (Spec: Strategic world)
- Value noise is extracted into `src/terrain/noise.ts`; **`generateTerrain(seed)` output for any seed must not change** — the existing terrain tests plus a new pinned-sample test are the guard. (Spec: Shared value noise)
- Generation constants: `ELEVATION_OCTAVES = [{400, 0.4}, {200, 0.3}, {100, 0.2}, {50, 0.1}]`, `MOISTURE_OCTAVES = [{300, 0.5}, {120, 0.3}, {40, 0.2}]` with salt 16, edge falloff `clamp(e − 0.35·smoothstep(clamp((d − 0.5)/0.5, 0, 1)), 0, 1)`, quantile thresholds `SEA 0.45`, `HILLS 0.82`, `MOUNTAINS 0.94`, `FOREST 0.60`. (Spec: Generation 1–2)
- Ownership: capitals nearest `(minCol + width/6, centroidRow)` and `(maxCol − width/6, centroidRow)` on the main landmass, Plains preferred; degenerate if `distance < 8` → column split; otherwise multi-source Dijkstra over land with cost `TERRAIN_COST × jitter[0.7, 1.3]` from `mulberry32((seed·4 + 32) >>> 0)`, heap ordered `(cost, index, owner)`. Ocean and unreached land stay Neutral. (Spec: Generation 3–6)
- All generation is deterministic: same seed → identical world. The generator never throws.
- No `@ue-too/being` on the map page; no manual canvas resize code (Board's resize observer handles CSS-sized canvases). Line widths in screen px divided by zoom.
- Deterministic units tested with `bun test`; rendering and interaction verified manually in the browser. (Spec: Testing)
- Run `bunx tsc --noEmit` before every commit; it must be clean.

## File Structure

```
map.html                        new page
package.json                    dev script adds map.html
src/hex/coords.ts               Axial/Offset, odd-r conversions, hexEquals
src/hex/ops.ts                  DIRECTIONS, neighbor(s), distance, roundHex, ring, spiral, line
src/hex/layout.ts               HexLayout, hexToWorld, worldToHex, hexCorners, hexWidth/Height, rowSpacing
src/terrain/noise.ts            valueNoise() — extracted
src/terrain/generate.ts         modified to call valueNoise()
src/strategic/world.ts          constants, HexWorld, createEmptyWorld, index/hexAt/axialOf/isLand/worldBounds
src/strategic/generate.ts       quantile, thresholdsOf, classify, fillTerrain, generateWorld
src/strategic/ownership.ts      labelLandmasses, mainLandmass, assignOwnership (+ private MinHeap)
src/strategic/queries.ts        isFrontierEdge, frontlineEdges, countByOwner, frontLength
src/strategic/panel.ts          setupMapPanel (DOM), describeHex (pure), name tables
src/strategic/main.ts           page wiring
src/render/hexMap.ts            Layer, layerFrame, toLayerPx, buildTerrainLayer, buildOwnerLayer, drawLayer,
                                drawFrontline, drawCapitals, drawHexOutline, buildMapLayers, renderHexMap
tests/hex.test.ts
tests/terrain.test.ts           + pinned samples
tests/strategic.test.ts
tests/hexMap.test.ts
docs/VISION.md                  "Current state" refreshed
README.md                       run command fixed
```

---

### Task 1: Hex coordinates and operations

**Files:**
- Create: `src/hex/coords.ts`
- Create: `src/hex/ops.ts`
- Test: `tests/hex.test.ts`

**Interfaces:**
- Produces: `Axial { q, r }`, `Offset { col, row }`, `axialToOffset(h): Offset`, `offsetToAxial(o): Axial`, `hexEquals(a, b): boolean`, `DIRECTIONS: readonly Axial[]`, `neighbor(h, dir): Axial`, `neighbors(h): Axial[]`, `distance(a, b): number`, `roundHex(fq, fr): Axial`, `ring(center, radius): Axial[]`, `spiral(center, radius): Axial[]`, `line(a, b): Axial[]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/hex.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { axialToOffset, hexEquals, offsetToAxial, type Axial } from "../src/hex/coords";
import { DIRECTIONS, distance, line, neighbor, neighbors, ring, roundHex, spiral } from "../src/hex/ops";

const key = (h: Axial) => `${h.q},${h.r}`;

describe("coords", () => {
  test("offset ↔ axial round-trips over an 80×50 grid", () => {
    for (let row = 0; row < 50; row++) {
      for (let col = 0; col < 80; col++) {
        expect(axialToOffset(offsetToAxial({ col, row }))).toEqual({ col, row });
      }
    }
  });

  test("round-trips for negative rows too", () => {
    for (let row = -3; row < 0; row++) {
      for (let col = -2; col < 3; col++) {
        expect(axialToOffset(offsetToAxial({ col, row }))).toEqual({ col, row });
      }
    }
  });

  test("odd rows are shoved right: offset (0,1) is axial (0,1), offset (0,2) is axial (-1,2)", () => {
    expect(offsetToAxial({ col: 0, row: 1 })).toEqual({ q: 0, r: 1 });
    expect(offsetToAxial({ col: 0, row: 2 })).toEqual({ q: -1, r: 2 });
  });

  test("hexEquals compares by value", () => {
    expect(hexEquals({ q: 1, r: 2 }, { q: 1, r: 2 })).toBe(true);
    expect(hexEquals({ q: 1, r: 2 }, { q: 2, r: 1 })).toBe(false);
  });
});

describe("ops", () => {
  const c: Axial = { q: 3, r: -2 };

  test("DIRECTIONS are E, NE, NW, W, SW, SE", () => {
    expect(DIRECTIONS).toEqual([
      { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 },
    ]);
  });

  test("neighbors are 6 distinct hexes at distance 1, and opposite directions cancel", () => {
    const ns = neighbors(c);
    expect(ns.length).toBe(6);
    expect(new Set(ns.map(key)).size).toBe(6);
    for (const n of ns) expect(distance(c, n)).toBe(1);
    for (let d = 0; d < 6; d++) expect(neighbor(neighbor(c, d), (d + 3) % 6)).toEqual(c);
  });

  test("distance is zero on self, symmetric, and matches known values", () => {
    expect(distance(c, c)).toBe(0);
    expect(distance({ q: 0, r: 0 }, { q: 3, r: -7 })).toBe(7);
    expect(distance({ q: 3, r: -7 }, { q: 0, r: 0 })).toBe(7);
    expect(distance({ q: 0, r: 0 }, { q: 2, r: 2 })).toBe(4);
  });

  test("roundHex snaps to the nearest hex (cube rounding)", () => {
    expect(roundHex(0.9, 0.1)).toEqual({ q: 1, r: 0 });
    expect(roundHex(0.3, 0.3)).toEqual({ q: 0, r: 0 });
    expect(roundHex(2.3, -0.8)).toEqual({ q: 2, r: -1 });
    // (0.4, 0.4, -0.8) rounds componentwise to (0, 0, -1), which does not sum to zero.
    // q and r tie on error (0.4 > s's 0.2); the tie resolves by recomputing r → (0, 1).
    expect(roundHex(0.4, 0.4)).toEqual({ q: 0, r: 1 });
    for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) expect(roundHex(q, r)).toEqual({ q, r });
  });

  test("ring(c, r) has 6r distinct hexes all at distance r; ring(c, 0) is [c]", () => {
    expect(ring(c, 0)).toEqual([c]);
    for (let r = 1; r <= 5; r++) {
      const hs = ring(c, r);
      expect(hs.length).toBe(6 * r);
      expect(new Set(hs.map(key)).size).toBe(6 * r);
      for (const h of hs) expect(distance(c, h)).toBe(r);
    }
  });

  test("spiral(c, 5) covers every hex within distance 5 exactly once", () => {
    const hs = spiral(c, 5);
    expect(hs.length).toBe(91);
    expect(new Set(hs.map(key)).size).toBe(91);
    const byDistance = new Map<number, number>();
    for (const h of hs) byDistance.set(distance(c, h), (byDistance.get(distance(c, h)) ?? 0) + 1);
    expect(byDistance.get(0)).toBe(1);
    for (let r = 1; r <= 5; r++) expect(byDistance.get(r)).toBe(6 * r);
  });

  test("line along each axis has distance+1 adjacent hexes ending at the target", () => {
    for (let d = 0; d < 6; d++) {
      const dir = DIRECTIONS[d]!;
      const target = { q: c.q + 4 * dir.q, r: c.r + 4 * dir.r };
      const hs = line(c, target);
      expect(hs.length).toBe(5);
      expect(hs[0]).toEqual(c);
      expect(hs[4]).toEqual(target);
      for (let i = 1; i < hs.length; i++) expect(distance(hs[i - 1]!, hs[i]!)).toBe(1);
    }
  });

  test("off-axis line is adjacent step by step", () => {
    const a = { q: 0, r: 0 };
    const b = { q: 3, r: -7 };
    const hs = line(a, b);
    expect(hs.length).toBe(8);
    expect(hs[0]).toEqual(a);
    expect(hs[7]).toEqual(b);
    for (let i = 1; i < hs.length; i++) expect(distance(hs[i - 1]!, hs[i]!)).toBe(1);
    expect(line(a, a)).toEqual([a]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/hex.test.ts`
Expected: FAIL — cannot resolve `../src/hex/coords`.

- [ ] **Step 3: Implement `coords.ts`**

Create `src/hex/coords.ts`:

```ts
/** Axial hex coordinates (pointy-top). Cube s = -q - r is derived where needed. */
export type Axial = { q: number; r: number };
/** Odd-r offset coordinates: row = r; odd rows are shoved right by half a hex. */
export type Offset = { col: number; row: number };

export function axialToOffset(h: Axial): Offset {
  return { col: h.q + (h.r - (h.r & 1)) / 2, row: h.r };
}

export function offsetToAxial(o: Offset): Axial {
  return { q: o.col - (o.row - (o.row & 1)) / 2, r: o.row };
}

export function hexEquals(a: Axial, b: Axial): boolean {
  return a.q === b.q && a.r === b.r;
}
```

(`r & 1` is 1 for negative odd numbers too, so the formulas hold below row 0.)

- [ ] **Step 4: Implement `ops.ts`**

Create `src/hex/ops.ts`:

```ts
import type { Axial } from "./coords";

/** Six axial direction deltas, counterclockwise from east: E, NE, NW, W, SW, SE.
 * With y = 1.5·size·r pointing north, +r is north-east. Direction d points at 60·d degrees. */
export const DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

export function neighbor(h: Axial, dir: number): Axial {
  const d = DIRECTIONS[dir]!;
  return { q: h.q + d.q, r: h.r + d.r };
}

export function neighbors(h: Axial): Axial[] {
  return DIRECTIONS.map((_, i) => neighbor(h, i));
}

export function distance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

/** Cube rounding: round all three, then fix the component with the largest error. */
export function roundHex(fq: number, fr: number): Axial {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

/** Hexes at exactly `radius` from center, starting at center + radius·DIRECTIONS[4] (south-west
 * corner) and walking each direction 0..5 in turn. radius 0 → [center]. */
export function ring(center: Axial, radius: number): Axial[] {
  if (radius === 0) return [{ q: center.q, r: center.r }];
  const out: Axial[] = [];
  const start = DIRECTIONS[4]!;
  let h: Axial = { q: center.q + start.q * radius, r: center.r + start.r * radius };
  for (let d = 0; d < 6; d++) {
    for (let i = 0; i < radius; i++) {
      out.push(h);
      h = neighbor(h, d);
    }
  }
  return out;
}

/** Center followed by rings 1..radius. */
export function spiral(center: Axial, radius: number): Axial[] {
  const out: Axial[] = [{ q: center.q, r: center.r }];
  for (let r = 1; r <= radius; r++) out.push(...ring(center, r));
  return out;
}

/** Hexes along the straight line from a to b (both inclusive), consecutive hexes adjacent.
 * A tiny nudge breaks ties deterministically when the line passes through a corner. */
export function line(a: Axial, b: Axial): Axial[] {
  const n = distance(a, b);
  if (n === 0) return [{ q: a.q, r: a.r }];
  const aq = a.q + 1e-6;
  const ar = a.r + 2e-6;
  const bq = b.q + 1e-6;
  const br = b.r + 2e-6;
  const out: Axial[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(roundHex(aq + (bq - aq) * t, ar + (br - ar) * t));
  }
  return out;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test tests/hex.test.ts && bunx tsc --noEmit`
Expected: all hex tests PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/hex/coords.ts src/hex/ops.ts tests/hex.test.ts
git commit -m "feat: hex math core — axial/odd-r coordinates, neighbors, distance, rings, lines"
```

---

### Task 2: Hex layout (hex ↔ world km)

**Files:**
- Create: `src/hex/layout.ts`
- Test: `tests/hex.test.ts` (append)

**Interfaces:**
- Consumes: `Axial`, `roundHex` (Task 1).
- Produces: `Pt { x, y }`, `HexLayout { size }`, `SQRT3`, `hexWidth(l)`, `hexHeight(l)`, `rowSpacing(l)`, `hexToWorld(h, l): Pt`, `worldToHex(p, l): Axial`, `hexCorners(h, l): Pt[]`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/hex.test.ts`:

```ts
import { hexCorners, hexHeight, hexToWorld, hexWidth, rowSpacing, worldToHex, type HexLayout } from "../src/hex/layout";
import { offsetToAxial as o2a } from "../src/hex/coords";

describe("layout", () => {
  const layout: HexLayout = { size: 20 / Math.sqrt(3) };

  test("hex (0,0) is at the origin; east neighbor is one width away; NE neighbor is half a width and one row spacing away", () => {
    expect(hexToWorld({ q: 0, r: 0 }, layout)).toEqual({ x: 0, y: 0 });
    const e = hexToWorld({ q: 1, r: 0 }, layout);
    expect(e.x).toBeCloseTo(hexWidth(layout), 9);
    expect(e.y).toBeCloseTo(0, 9);
    const ne = hexToWorld({ q: 0, r: 1 }, layout);
    expect(ne.x).toBeCloseTo(hexWidth(layout) / 2, 9);
    expect(ne.y).toBeCloseTo(rowSpacing(layout), 9);
  });

  test("flat-to-flat width is 20 km", () => {
    expect(hexWidth(layout)).toBeCloseTo(20, 9);
    expect(hexHeight(layout)).toBeCloseTo(2 * layout.size, 9);
    expect(rowSpacing(layout)).toBeCloseTo(1.5 * layout.size, 9);
  });

  test("hexToWorld → worldToHex round-trips for every hex of an 80×50 grid, with jitter", () => {
    for (let row = 0; row < 50; row++) {
      for (let col = 0; col < 80; col++) {
        const h = o2a({ col, row });
        const c = hexToWorld(h, layout);
        expect(worldToHex(c, layout)).toEqual(h);
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k + 0.3;
          const p = { x: c.x + 0.45 * layout.size * Math.cos(a), y: c.y + 0.45 * layout.size * Math.sin(a) };
          expect(worldToHex(p, layout)).toEqual(h);
        }
      }
    }
  });

  test("corners are size from the center, corner 0 is lower-right, corner 2 is the top", () => {
    const h = { q: 2, r: 3 };
    const c = hexToWorld(h, layout);
    const corners = hexCorners(h, layout);
    expect(corners.length).toBe(6);
    for (const p of corners) expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeCloseTo(layout.size, 9);
    expect(corners[0]!.x).toBeGreaterThan(c.x);
    expect(corners[0]!.y).toBeLessThan(c.y);
    expect(corners[2]!.x).toBeCloseTo(c.x, 9);
    expect(corners[2]!.y).toBeCloseTo(c.y + layout.size, 9);
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(hexWidth(layout), 9);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(hexHeight(layout), 9);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/hex.test.ts`
Expected: FAIL — cannot resolve `../src/hex/layout`.

- [ ] **Step 3: Implement `layout.ts`**

Create `src/hex/layout.ts`:

```ts
import type { Axial } from "./coords";
import { roundHex } from "./ops";

export type Pt = { x: number; y: number };
/** Pointy-top hex layout; `size` is the circumradius in world units (km on the strategic map). */
export type HexLayout = { size: number };

export const SQRT3 = Math.sqrt(3);

export function hexWidth(l: HexLayout): number {
  return l.size * SQRT3;
}

export function hexHeight(l: HexLayout): number {
  return l.size * 2;
}

export function rowSpacing(l: HexLayout): number {
  return l.size * 1.5;
}

/** Center of a hex in world coordinates (+x east, +y north). */
export function hexToWorld(h: Axial, l: HexLayout): Pt {
  return { x: l.size * SQRT3 * (h.q + h.r / 2), y: l.size * 1.5 * h.r };
}

/** Nearest hex to a world point. Always returns an axial; bounds are the caller's concern. */
export function worldToHex(p: Pt, l: HexLayout): Axial {
  const r = p.y / (1.5 * l.size);
  const q = p.x / (SQRT3 * l.size) - r / 2;
  return roundHex(q, r);
}

/** Six corners; corner i at angle 60·i − 30 degrees (0 = lower-right, 1 = upper-right, 2 = top, …).
 * The edge facing direction d runs from corner d to corner (d + 1) % 6. */
export function hexCorners(h: Axial, l: HexLayout): Pt[] {
  const c = hexToWorld(h, l);
  const out: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    out.push({ x: c.x + l.size * Math.cos(a), y: c.y + l.size * Math.sin(a) });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/hex.test.ts && bunx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/hex/layout.ts tests/hex.test.ts
git commit -m "feat: hex layout — hex/world conversion and corners in km"
```

---

### Task 3: Extract shared value noise (output-preserving refactor)

**Files:**
- Create: `src/terrain/noise.ts`
- Modify: `src/terrain/generate.ts`
- Test: `tests/terrain.test.ts` (append pinned samples)

**Interfaces:**
- Consumes: `mulberry32(seed)` from `src/terrain/prng.ts`.
- Produces: `Octave { spacing, amplitude }`, `valueNoise(seed, octaves, extentX, extentY, salt = 0): (x, y) => number` — sum over octaves of `(n − 0.5)·2·amplitude`, range `[−Σamp, +Σamp]`, `x, y ≥ 0` in the same units as `spacing`.

- [ ] **Step 1: Add the characterization test (it passes on the current code)**

Append to `tests/terrain.test.ts`:

```ts
describe("terrain output is pinned (noise extraction must not change it)", () => {
  test("generateTerrain(1) samples match recorded values", () => {
    const t = generateTerrain(1);
    expect(t.heights[0]).toBeCloseTo(4.513356123352423, 9);
    expect(t.heights[80]).toBeCloseTo(-26.600040273042396, 9);
    expect(t.heights[12960]).toBeCloseTo(-7.84389054402709, 9);
    expect(t.heights[25920]).toBeCloseTo(-24.02479829499498, 9);
    expect(t.heights[12345]).toBeCloseTo(-3.3715437194656195, 9);
  });
});
```

Run: `bun test tests/terrain.test.ts`
Expected: PASS (these values were recorded from the current implementation on 2026-08-21).

- [ ] **Step 2: Write the failing noise test**

Append to `tests/terrain.test.ts`:

```ts
import { valueNoise } from "../src/terrain/noise";

describe("valueNoise", () => {
  const octaves = [{ spacing: 100, amplitude: 2 }, { spacing: 50, amplitude: 1 }];

  test("is deterministic per seed and salt, and differs across them", () => {
    const a = valueNoise(5, octaves, 400, 300);
    const b = valueNoise(5, octaves, 400, 300);
    const c = valueNoise(6, octaves, 400, 300);
    const d = valueNoise(5, octaves, 400, 300, 16);
    expect(a(37, 91)).toBe(b(37, 91));
    expect(a(37, 91)).not.toBe(c(37, 91));
    expect(a(37, 91)).not.toBe(d(37, 91));
  });

  test("stays within ±Σamplitude across the extent, including the far edge", () => {
    const n = valueNoise(3, octaves, 400, 300);
    for (let y = 0; y <= 300; y += 7) {
      for (let x = 0; x <= 400; x += 7) {
        expect(Math.abs(n(x, y))).toBeLessThanOrEqual(3);
      }
    }
  });
});
```

Run: `bun test tests/terrain.test.ts`
Expected: FAIL — cannot resolve `../src/terrain/noise`.

- [ ] **Step 3: Create `noise.ts`**

Create `src/terrain/noise.ts`:

```ts
import { mulberry32 } from "./prng";

export type Octave = { spacing: number; amplitude: number };

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

type Layer = Octave & { lattice: number; values: Float64Array };

/** Seeded multi-octave value noise. Octave o's lattice is filled row-major from
 * mulberry32((seed·4 + o + 1 + salt) >>> 0); the lattice side is ceil(extent / spacing) + 2
 * where extent = max(extentX, extentY). Sample with x, y in [0, extent] (same units as spacing).
 * Returns Σ (n − 0.5)·2·amplitude, i.e. a value in [−Σamplitude, +Σamplitude]. */
export function valueNoise(
  seed: number,
  octaves: Octave[],
  extentX: number,
  extentY: number,
  salt = 0,
): (x: number, y: number) => number {
  const extent = Math.max(extentX, extentY);
  const layers: Layer[] = octaves.map((o, i) => {
    const rand = mulberry32((seed * 4 + i + 1 + salt) >>> 0);
    const lattice = Math.ceil(extent / o.spacing) + 2;
    const values = new Float64Array(lattice * lattice);
    for (let k = 0; k < values.length; k++) values[k] = rand();
    return { spacing: o.spacing, amplitude: o.amplitude, lattice, values };
  });
  return (x, y) => {
    let sum = 0;
    for (const L of layers) {
      const gx = x / L.spacing;
      const gy = y / L.spacing;
      const x0 = Math.min(Math.floor(gx), L.lattice - 2);
      const y0 = Math.min(Math.floor(gy), L.lattice - 2);
      const fx = smoothstep(gx - x0);
      const fy = smoothstep(gy - y0);
      const v00 = L.values[y0 * L.lattice + x0]!;
      const v10 = L.values[y0 * L.lattice + x0 + 1]!;
      const v01 = L.values[(y0 + 1) * L.lattice + x0]!;
      const v11 = L.values[(y0 + 1) * L.lattice + x0 + 1]!;
      const n = v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
      sum += (n - 0.5) * 2 * L.amplitude;
    }
    return sum;
  };
}
```

- [ ] **Step 4: Rewrite `generateTerrain` to use it**

Replace the whole of `src/terrain/generate.ts` with:

```ts
import { valueNoise, type Octave } from "./noise";
import { sampleTerrain, type Terrain } from "./terrain";

const EXTENT = 4000;
const CELL_SIZE = 50;
const SIZE = 161; // 2 * EXTENT / CELL_SIZE + 1
const OCTAVES: Octave[] = [
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
  const noise = valueNoise(seed, OCTAVES, 2 * EXTENT, 2 * EXTENT);
  for (let iy = 0; iy < SIZE; iy++) {
    for (let ix = 0; ix < SIZE; ix++) {
      heights[iy * SIZE + ix] = noise(ix * CELL_SIZE, iy * CELL_SIZE);
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

The per-octave PRNG seed, lattice size, fill order, bilinear weights, and summation order are identical to the old inline loop, so heights are bit-for-bit unchanged.

- [ ] **Step 5: Run the whole suite**

Run: `bun test && bunx tsc --noEmit`
Expected: every test passes, including the pinned samples and all pre-existing terrain/solver/physics tests; tsc clean. If a pinned sample fails, the extraction changed the arithmetic — fix the extraction, never the pinned values.

- [ ] **Step 6: Commit**

```bash
git add src/terrain/noise.ts src/terrain/generate.ts tests/terrain.test.ts
git commit -m "refactor: extract seeded value noise into terrain/noise.ts (output pinned)"
```

---

### Task 4: Strategic world model

**Files:**
- Create: `src/strategic/world.ts`
- Test: `tests/strategic.test.ts`

**Interfaces:**
- Consumes: `Axial`, `axialToOffset`, `offsetToAxial` (Task 1); `HexLayout`, `hexWidth`, `rowSpacing` (Task 2).
- Produces: `COLS`, `ROWS`, `HEX_SIZE`, `Terrain` (const + type), `Owner` (const + type), `HexWorld`, `createEmptyWorld(seed, cols?, rows?)`, `index(world, col, row)`, `inBounds(world, h)`, `hexAt(world, h): number` (−1 out of bounds), `axialOf(world, i): Axial`, `isLand(world, i)`, `worldBounds(world): { minX, minY, maxX, maxY }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/strategic.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { offsetToAxial } from "../src/hex/coords";
import { hexWidth, rowSpacing } from "../src/hex/layout";
import {
  COLS, HEX_SIZE, Owner, ROWS, Terrain, axialOf, createEmptyWorld, hexAt, inBounds, index, isLand, worldBounds,
} from "../src/strategic/world";

describe("world model", () => {
  const world = createEmptyWorld(7);

  test("empty world has the configured shape and zeroed arrays", () => {
    expect(world.cols).toBe(COLS);
    expect(world.rows).toBe(ROWS);
    expect(world.seed).toBe(7);
    expect(world.layout.size).toBeCloseTo(HEX_SIZE, 12);
    expect(world.elevation.length).toBe(COLS * ROWS);
    expect(world.terrain.length).toBe(COLS * ROWS);
    expect(world.owner.length).toBe(COLS * ROWS);
    expect(world.terrain.every((t) => t === Terrain.Ocean)).toBe(true);
    expect(world.owner.every((o) => o === Owner.Neutral)).toBe(true);
    expect(world.degenerate).toBe(false);
  });

  test("index/axialOf/hexAt agree for every cell", () => {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const i = index(world, col, row);
        expect(i).toBe(row * COLS + col);
        const h = axialOf(world, i);
        expect(h).toEqual(offsetToAxial({ col, row }));
        expect(hexAt(world, h)).toBe(i);
        expect(inBounds(world, h)).toBe(true);
      }
    }
  });

  test("hexAt is -1 just outside every edge", () => {
    expect(hexAt(world, offsetToAxial({ col: -1, row: 0 }))).toBe(-1);
    expect(hexAt(world, offsetToAxial({ col: COLS, row: 0 }))).toBe(-1);
    expect(hexAt(world, offsetToAxial({ col: 0, row: -1 }))).toBe(-1);
    expect(hexAt(world, offsetToAxial({ col: 0, row: ROWS }))).toBe(-1);
    expect(inBounds(world, offsetToAxial({ col: COLS, row: ROWS }))).toBe(false);
  });

  test("isLand reads the terrain array", () => {
    const w = createEmptyWorld(1, 4, 2);
    w.terrain[3] = Terrain.Hills;
    expect(isLand(w, 3)).toBe(true);
    expect(isLand(w, 2)).toBe(false);
  });

  test("worldBounds spans the whole grid with hex (0,0) at the origin", () => {
    const b = worldBounds(world);
    const w = hexWidth(world.layout);
    expect(b.minX).toBeCloseTo(-w / 2, 9);
    expect(b.maxX).toBeCloseTo(COLS * w, 9);
    expect(b.minY).toBeCloseTo(-HEX_SIZE, 9);
    expect(b.maxY).toBeCloseTo((ROWS - 1) * rowSpacing(world.layout) + HEX_SIZE, 9);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/strategic.test.ts`
Expected: FAIL — cannot resolve `../src/strategic/world`.

- [ ] **Step 3: Implement `world.ts`**

Create `src/strategic/world.ts`:

```ts
import { axialToOffset, offsetToAxial, type Axial } from "../hex/coords";
import { hexWidth, rowSpacing, type HexLayout } from "../hex/layout";

export const COLS = 80;
export const ROWS = 50;
/** Circumradius in km: 20 km flat-to-flat, so one strategic hex ≈ one battle map. */
export const HEX_SIZE = 20 / Math.sqrt(3);

export const Terrain = { Ocean: 0, Plains: 1, Forest: 2, Hills: 3, Mountains: 4 } as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];
export const Owner = { Neutral: 0, BlocA: 1, BlocB: 2 } as const;
export type Owner = (typeof Owner)[keyof typeof Owner];

export type HexWorld = {
  cols: number;
  rows: number;
  layout: HexLayout;
  seed: number;
  /** normalized 0..1, one per hex, row-major odd-r (index = row·cols + col) */
  elevation: Float32Array;
  /** Terrain ids */
  terrain: Uint8Array;
  /** Owner ids */
  owner: Uint8Array;
  /** [BlocA, BlocB] */
  capitals: [Axial, Axial];
  /** true when the ownership fallback (column split) was used */
  degenerate: boolean;
};

export function createEmptyWorld(seed: number, cols = COLS, rows = ROWS): HexWorld {
  const n = cols * rows;
  return {
    cols,
    rows,
    layout: { size: HEX_SIZE },
    seed,
    elevation: new Float32Array(n),
    terrain: new Uint8Array(n),
    owner: new Uint8Array(n),
    capitals: [{ q: 0, r: 0 }, { q: 0, r: 0 }],
    degenerate: false,
  };
}

export function index(world: HexWorld, col: number, row: number): number {
  return row * world.cols + col;
}

export function inBounds(world: HexWorld, h: Axial): boolean {
  const o = axialToOffset(h);
  return o.col >= 0 && o.col < world.cols && o.row >= 0 && o.row < world.rows;
}

/** Array index of a hex, or -1 when out of bounds. */
export function hexAt(world: HexWorld, h: Axial): number {
  const o = axialToOffset(h);
  if (o.col < 0 || o.col >= world.cols || o.row < 0 || o.row >= world.rows) return -1;
  return o.row * world.cols + o.col;
}

export function axialOf(world: HexWorld, i: number): Axial {
  return offsetToAxial({ col: i % world.cols, row: Math.floor(i / world.cols) });
}

export function isLand(world: HexWorld, i: number): boolean {
  return world.terrain[i] !== Terrain.Ocean;
}

/** Bounding box of the whole grid in world km. Hex (0,0)'s center is the origin. */
export function worldBounds(world: HexWorld): { minX: number; minY: number; maxX: number; maxY: number } {
  const w = hexWidth(world.layout);
  const s = world.layout.size;
  return {
    minX: -w / 2,
    minY: -s,
    maxX: world.cols * w,
    maxY: (world.rows - 1) * rowSpacing(world.layout) + s,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/strategic.test.ts && bunx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/strategic/world.ts tests/strategic.test.ts
git commit -m "feat: strategic HexWorld model — typed arrays, indexing, bounds"
```

---

### Task 5: Elevation and terrain classification

**Files:**
- Create: `src/strategic/generate.ts`
- Test: `tests/strategic.test.ts` (append)

**Interfaces:**
- Consumes: `valueNoise`, `Octave` (Task 3); `hexToWorld` (Task 2); `axialOf`, `createEmptyWorld`, `Terrain`, `worldBounds`, `HexWorld` (Task 4).
- Produces: `ELEVATION_OCTAVES`, `MOISTURE_OCTAVES`, `EDGE_FALLOFF_START = 0.5`, `EDGE_FALLOFF_DEPTH = 0.35`, `SEA_QUANTILE = 0.45`, `HILLS_QUANTILE = 0.82`, `MOUNTAINS_QUANTILE = 0.94`, `FOREST_QUANTILE = 0.6`, `quantile(values, f): number`, `Thresholds { sea, hills, mountains }`, `thresholdsOf(elevation): Thresholds`, `classify(elevation, t, moisture, forestThreshold): Terrain`, `fillTerrain(world): void`. (`generateWorld` is added in Task 6 once ownership exists.)

- [ ] **Step 1: Write the failing tests**

Append to `tests/strategic.test.ts`:

```ts
import {
  FOREST_QUANTILE, HILLS_QUANTILE, MOUNTAINS_QUANTILE, SEA_QUANTILE, classify, fillTerrain, quantile, thresholdsOf,
} from "../src/strategic/generate";

describe("terrain generation", () => {
  test("quantile picks sorted[floor(f·n)] and clamps at the top", () => {
    const v = new Float32Array([0.9, 0.1, 0.5, 0.3, 0.7]);
    expect(quantile(v, 0)).toBeCloseTo(0.1, 6);
    expect(quantile(v, 0.4)).toBeCloseTo(0.5, 6);
    expect(quantile(v, 1)).toBeCloseTo(0.9, 6);
  });

  test("classify applies sea, mountain, hill, then forest thresholds in that order", () => {
    const t = { sea: 0.3, hills: 0.6, mountains: 0.8 };
    expect(classify(0.29, t, 0.9, 0.5)).toBe(Terrain.Ocean);
    expect(classify(0.3, t, 0.2, 0.5)).toBe(Terrain.Plains);
    expect(classify(0.3, t, 0.5, 0.5)).toBe(Terrain.Forest);
    expect(classify(0.6, t, 0.9, 0.5)).toBe(Terrain.Hills);
    expect(classify(0.8, t, 0.9, 0.5)).toBe(Terrain.Mountains);
  });

  test("fillTerrain is deterministic per seed and differs across seeds", () => {
    const a = createEmptyWorld(11);
    const b = createEmptyWorld(11);
    const c = createEmptyWorld(12);
    fillTerrain(a);
    fillTerrain(b);
    fillTerrain(c);
    expect(a.elevation).toEqual(b.elevation);
    expect(a.terrain).toEqual(b.terrain);
    let differs = false;
    for (let i = 0; i < a.terrain.length; i++) if (a.terrain[i] !== c.terrain[i]) { differs = true; break; }
    expect(differs).toBe(true);
  });

  test("every hex's band matches its stored elevation against recomputed quantile thresholds", () => {
    const world = createEmptyWorld(1);
    fillTerrain(world);
    const t = thresholdsOf(world.elevation);
    expect(t.sea).toBeCloseTo(quantile(world.elevation, SEA_QUANTILE), 9);
    expect(t.hills).toBeCloseTo(quantile(world.elevation, HILLS_QUANTILE), 9);
    expect(t.mountains).toBeCloseTo(quantile(world.elevation, MOUNTAINS_QUANTILE), 9);
    for (let i = 0; i < world.terrain.length; i++) {
      const e = world.elevation[i]!;
      const k = world.terrain[i]!;
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1);
      if (e < t.sea) expect(k).toBe(Terrain.Ocean);
      else if (e >= t.mountains) expect(k).toBe(Terrain.Mountains);
      else if (e >= t.hills) expect(k).toBe(Terrain.Hills);
      else expect(k === Terrain.Plains || k === Terrain.Forest).toBe(true);
    }
  });

  test("shares: ~55% land, forest 5–60% of land, for several seeds", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const world = createEmptyWorld(seed);
      fillTerrain(world);
      let land = 0;
      let forest = 0;
      for (const k of world.terrain) {
        if (k !== Terrain.Ocean) land++;
        if (k === Terrain.Forest) forest++;
      }
      expect(land).toBeGreaterThanOrEqual(2100);
      expect(land).toBeLessThanOrEqual(2300);
      expect(forest / land).toBeGreaterThan(0.05);
      expect(forest / land).toBeLessThan(0.6);
    }
  });

  test("FOREST_QUANTILE is a fraction", () => {
    expect(FOREST_QUANTILE).toBeGreaterThan(0);
    expect(FOREST_QUANTILE).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/strategic.test.ts`
Expected: FAIL — cannot resolve `../src/strategic/generate`.

- [ ] **Step 3: Implement `generate.ts`**

Create `src/strategic/generate.ts`:

```ts
import { hexToWorld } from "../hex/layout";
import { valueNoise, type Octave } from "../terrain/noise";
import { Terrain, axialOf, worldBounds, type HexWorld } from "./world";

/** km spacing / amplitude. Σamplitude = 1 so e = 0.5 + noise/2 spans [0, 1]. */
export const ELEVATION_OCTAVES: Octave[] = [
  { spacing: 400, amplitude: 0.4 },
  { spacing: 200, amplitude: 0.3 },
  { spacing: 100, amplitude: 0.2 },
  { spacing: 50, amplitude: 0.1 },
];
export const MOISTURE_OCTAVES: Octave[] = [
  { spacing: 300, amplitude: 0.5 },
  { spacing: 120, amplitude: 0.3 },
  { spacing: 40, amplitude: 0.2 },
];
const MOISTURE_SALT = 16;

/** Subtractive edge falloff: starts at normalized radius 0.5, reaches full depth at the corners. */
export const EDGE_FALLOFF_START = 0.5;
export const EDGE_FALLOFF_DEPTH = 0.35;

/** Terrain thresholds are quantiles of each world's own field, so every seed has a usable theater. */
export const SEA_QUANTILE = 0.45;
export const HILLS_QUANTILE = 0.82;
export const MOUNTAINS_QUANTILE = 0.94;
export const FOREST_QUANTILE = 0.6;

export type Thresholds = { sea: number; hills: number; mountains: number };

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function sumAmplitude(octaves: Octave[]): number {
  let s = 0;
  for (const o of octaves) s += o.amplitude;
  return s;
}

/** Value at fraction f (0..1) of the sorted values: sorted[min(n − 1, floor(f·n))]. */
export function quantile(values: ArrayLike<number>, f: number): number {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))]!;
}

export function thresholdsOf(elevation: Float32Array): Thresholds {
  return {
    sea: quantile(elevation, SEA_QUANTILE),
    hills: quantile(elevation, HILLS_QUANTILE),
    mountains: quantile(elevation, MOUNTAINS_QUANTILE),
  };
}

export function classify(elevation: number, t: Thresholds, moisture: number, forestThreshold: number): Terrain {
  if (elevation < t.sea) return Terrain.Ocean;
  if (elevation >= t.mountains) return Terrain.Mountains;
  if (elevation >= t.hills) return Terrain.Hills;
  return moisture >= forestThreshold ? Terrain.Forest : Terrain.Plains;
}

/** Fills `elevation` and `terrain` from the world's seed. Deterministic. */
export function fillTerrain(world: HexWorld): void {
  const b = worldBounds(world);
  const width = b.maxX - b.minX;
  const height = b.maxY - b.minY;
  const elevNoise = valueNoise(world.seed, ELEVATION_OCTAVES, width, height);
  const moistNoise = valueNoise(world.seed, MOISTURE_OCTAVES, width, height, MOISTURE_SALT);
  const elevScale = 2 * sumAmplitude(ELEVATION_OCTAVES);
  const moistScale = 2 * sumAmplitude(MOISTURE_OCTAVES);
  const n = world.terrain.length;
  const moisture = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const c = hexToWorld(axialOf(world, i), world.layout);
    const nx = c.x - b.minX;
    const ny = c.y - b.minY;
    const e = 0.5 + elevNoise(nx, ny) / elevScale;
    const u = (nx / width) * 2 - 1;
    const v = (ny / height) * 2 - 1;
    const d = Math.hypot(u, v);
    const falloff = smoothstep(clamp01((d - EDGE_FALLOFF_START) / (1 - EDGE_FALLOFF_START)));
    world.elevation[i] = clamp01(e - EDGE_FALLOFF_DEPTH * falloff);
    moisture[i] = 0.5 + moistNoise(nx, ny) / moistScale;
  }

  // thresholds from the stored Float32 values so tests can recompute them exactly
  const t = thresholdsOf(world.elevation);
  const forest = quantile(moisture, FOREST_QUANTILE);
  for (let i = 0; i < n; i++) {
    world.terrain[i] = classify(world.elevation[i]!, t, moisture[i]!, forest);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/strategic.test.ts && bunx tsc --noEmit`
Expected: PASS; tsc clean. (The share test was validated on seeds 1–12 with a prototype; if it fails, check the falloff formula and quantile constants against the spec before touching anything else.)

- [ ] **Step 5: Commit**

```bash
git add src/strategic/generate.ts tests/strategic.test.ts
git commit -m "feat: strategic terrain generation — noise elevation with edge falloff, quantile classes"
```

---

### Task 6: Ownership — landmasses, capitals, bloc partition, `generateWorld`

**Files:**
- Create: `src/strategic/ownership.ts`
- Modify: `src/strategic/generate.ts` (add `generateWorld`)
- Test: `tests/strategic.test.ts` (append)

**Interfaces:**
- Consumes: `distance`, `neighbor` (Task 1); `offsetToAxial` (Task 1); `mulberry32`; `Owner`, `Terrain`, `axialOf`, `hexAt`, `isLand`, `createEmptyWorld`, `HexWorld` (Task 4); `fillTerrain` (Task 5).
- Produces: `TERRAIN_COST: readonly number[]` (indexed by terrain id), `MIN_CAPITAL_DISTANCE = 8`, `labelLandmasses(world): { label: Int32Array; sizes: number[] }`, `mainLandmass(sizes): number`, `assignOwnership(world): void` (writes `owner`, `capitals`, `degenerate`), `generateWorld(seed): HexWorld`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/strategic.test.ts`:

```ts
import { generateWorld } from "../src/strategic/generate";
import { MIN_CAPITAL_DISTANCE, assignOwnership, labelLandmasses, mainLandmass } from "../src/strategic/ownership";
import { distance, neighbors } from "../src/hex/ops";

/** All indices reachable from `start` through hexes with the same owner. */
function sameOwnerComponent(world: ReturnType<typeof generateWorld>, start: number): Set<number> {
  const owner = world.owner[start]!;
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    for (const n of neighbors(axialOf(world, i))) {
      const j = hexAt(world, n);
      if (j >= 0 && !seen.has(j) && world.owner[j] === owner) { seen.add(j); stack.push(j); }
    }
  }
  return seen;
}

describe("landmasses", () => {
  test("labels connected land components and sizes them", () => {
    const w = createEmptyWorld(1, 5, 1); // one row: L L O L O
    w.terrain.set([Terrain.Plains, Terrain.Hills, Terrain.Ocean, Terrain.Forest, Terrain.Ocean]);
    const { label, sizes } = labelLandmasses(w);
    expect(Array.from(label)).toEqual([0, 0, -1, 1, -1]);
    expect(sizes).toEqual([2, 1]);
    expect(mainLandmass(sizes)).toBe(0);
    expect(mainLandmass([3, 7, 7])).toBe(1); // ties → lowest id
    expect(mainLandmass([])).toBe(-1);
  });
});

describe("ownership", () => {
  test("degenerate fallback: capitals too close → column split, flag set", () => {
    const w = createEmptyWorld(1, 6, 3);
    w.terrain.fill(Terrain.Plains);
    assignOwnership(w);
    expect(w.degenerate).toBe(true);
    expect(distance(w.capitals[0], w.capitals[1])).toBeLessThan(MIN_CAPITAL_DISTANCE);
    for (let i = 0; i < w.owner.length; i++) {
      expect(w.owner[i]).toBe(i % 6 < 2.5 ? Owner.BlocA : Owner.BlocB);
    }
  });

  test("a 20×3 plains strip is split between two blocs with both capitals owning themselves", () => {
    const w = createEmptyWorld(3, 20, 3);
    w.terrain.fill(Terrain.Plains);
    assignOwnership(w);
    expect(w.degenerate).toBe(false);
    expect(distance(w.capitals[0], w.capitals[1])).toBeGreaterThanOrEqual(MIN_CAPITAL_DISTANCE);
    expect(w.owner[hexAt(w, w.capitals[0])]).toBe(Owner.BlocA);
    expect(w.owner[hexAt(w, w.capitals[1])]).toBe(Owner.BlocB);
    let a = 0;
    let b = 0;
    for (const o of w.owner) { if (o === Owner.BlocA) a++; else if (o === Owner.BlocB) b++; }
    expect(a + b).toBe(60);
    expect(a).toBeGreaterThan(10);
    expect(b).toBeGreaterThan(10);
  });

  test("ownership is deterministic per seed", () => {
    const a = createEmptyWorld(5, 20, 3);
    const b = createEmptyWorld(5, 20, 3);
    a.terrain.fill(Terrain.Plains);
    b.terrain.fill(Terrain.Plains);
    assignOwnership(a);
    assignOwnership(b);
    expect(a.owner).toEqual(b.owner);
  });
});

describe("generateWorld", () => {
  const world = generateWorld(1);

  test("same seed → identical world; different seed → different owners", () => {
    const again = generateWorld(1);
    expect(again.elevation).toEqual(world.elevation);
    expect(again.terrain).toEqual(world.terrain);
    expect(again.owner).toEqual(world.owner);
    expect(again.capitals).toEqual(world.capitals);
    const other = generateWorld(2);
    let differs = false;
    for (let i = 0; i < world.owner.length; i++) if (world.owner[i] !== other.owner[i]) { differs = true; break; }
    expect(differs).toBe(true);
  });

  test("seed is floored", () => {
    expect(generateWorld(1.9).owner).toEqual(world.owner);
  });

  test("ocean is neutral and every owned hex is land", () => {
    for (let i = 0; i < world.owner.length; i++) {
      if (world.terrain[i] === Terrain.Ocean) expect(world.owner[i]).toBe(Owner.Neutral);
      if (world.owner[i] !== Owner.Neutral) expect(isLand(world, i)).toBe(true);
    }
  });

  test("capitals are land, owned by their bloc, far enough apart; world is not degenerate", () => {
    expect(world.degenerate).toBe(false);
    const [a, b] = world.capitals;
    expect(isLand(world, hexAt(world, a))).toBe(true);
    expect(isLand(world, hexAt(world, b))).toBe(true);
    expect(world.owner[hexAt(world, a)]).toBe(Owner.BlocA);
    expect(world.owner[hexAt(world, b)]).toBe(Owner.BlocB);
    expect(distance(a, b)).toBeGreaterThanOrEqual(MIN_CAPITAL_DISTANCE);
  });

  test("each bloc's territory is connected to its capital", () => {
    for (const [owner, capital] of [[Owner.BlocA, world.capitals[0]], [Owner.BlocB, world.capitals[1]]] as const) {
      const reach = sameOwnerComponent(world, hexAt(world, capital));
      let owned = 0;
      for (const o of world.owner) if (o === owner) owned++;
      expect(reach.size).toBe(owned);
    }
  });

  test("both blocs hold a substantial share of the land for several seeds", () => {
    for (const seed of [2, 3, 4]) {
      const w = generateWorld(seed);
      let land = 0;
      let a = 0;
      let b = 0;
      for (let i = 0; i < w.owner.length; i++) {
        if (isLand(w, i)) land++;
        if (w.owner[i] === Owner.BlocA) a++;
        if (w.owner[i] === Owner.BlocB) b++;
      }
      expect(w.degenerate).toBe(false);
      expect(a / land).toBeGreaterThan(0.2);
      expect(b / land).toBeGreaterThan(0.2);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/strategic.test.ts`
Expected: FAIL — cannot resolve `../src/strategic/ownership`.

- [ ] **Step 3: Implement `ownership.ts`**

Create `src/strategic/ownership.ts`:

```ts
import { offsetToAxial, type Axial } from "../hex/coords";
import { distance, neighbor } from "../hex/ops";
import { mulberry32 } from "../terrain/prng";
import { Owner, Terrain, axialOf, hexAt, isLand, type HexWorld } from "./world";

/** Step cost into a hex, indexed by terrain id. Ocean is never traversed. */
export const TERRAIN_COST: readonly number[] = [Infinity, 1, 1.5, 2, 4];
export const MIN_CAPITAL_DISTANCE = 8;
const JITTER_SALT = 32;

function landNeighbors(world: HexWorld, i: number): number[] {
  const h = axialOf(world, i);
  const out: number[] = [];
  for (let d = 0; d < 6; d++) {
    const j = hexAt(world, neighbor(h, d));
    if (j >= 0 && isLand(world, j)) out.push(j);
  }
  return out;
}

/** Labels connected land components (6-neighborhood). label[i] = -1 for ocean. */
export function labelLandmasses(world: HexWorld): { label: Int32Array; sizes: number[] } {
  const label = new Int32Array(world.terrain.length).fill(-1);
  const sizes: number[] = [];
  for (let i = 0; i < label.length; i++) {
    if (!isLand(world, i) || label[i] !== -1) continue;
    const id = sizes.length;
    let count = 0;
    const stack = [i];
    label[i] = id;
    while (stack.length) {
      const x = stack.pop()!;
      count++;
      for (const n of landNeighbors(world, x)) {
        if (label[n] === -1) {
          label[n] = id;
          stack.push(n);
        }
      }
    }
    sizes.push(count);
  }
  return { label, sizes };
}

/** Id of the largest landmass (ties → lowest id); -1 when there is no land. */
export function mainLandmass(sizes: number[]): number {
  let best = -1;
  let bestSize = 0;
  for (let i = 0; i < sizes.length; i++) {
    if (sizes[i]! > bestSize) {
      best = i;
      bestSize = sizes[i]!;
    }
  }
  return best;
}

/** Plains hex of the landmass nearest the target (ties → lowest index); any land hex if no plains. */
function pickCapital(world: HexWorld, label: Int32Array, main: number, targetCol: number, targetRow: number): Axial {
  const target = offsetToAxial({ col: Math.round(targetCol), row: Math.round(targetRow) });
  let best = -1;
  let bestDist = Infinity;
  let fallback = -1;
  let fallbackDist = Infinity;
  for (let i = 0; i < label.length; i++) {
    if (label[i] !== main) continue;
    const d = distance(axialOf(world, i), target);
    if (d < fallbackDist) {
      fallback = i;
      fallbackDist = d;
    }
    if (world.terrain[i] === Terrain.Plains && d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return axialOf(world, best >= 0 ? best : fallback);
}

type Entry = { cost: number; index: number; owner: number };

/** Binary min-heap ordered by (cost, index, owner) so the search is fully deterministic. */
class MinHeap {
  private items: Entry[] = [];

  get size(): number {
    return this.items.length;
  }

  private less(a: Entry, b: Entry): boolean {
    if (a.cost !== b.cost) return a.cost < b.cost;
    if (a.index !== b.index) return a.index < b.index;
    return a.owner < b.owner;
  }

  push(e: Entry): void {
    const items = this.items;
    items.push(e);
    let i = items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(items[i]!, items[p]!)) break;
      [items[i], items[p]] = [items[p]!, items[i]!];
      i = p;
    }
  }

  pop(): Entry {
    const items = this.items;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && this.less(items[l]!, items[m]!)) m = l;
        if (r < items.length && this.less(items[r]!, items[m]!)) m = r;
        if (m === i) break;
        [items[i], items[m]] = [items[m]!, items[i]!];
        i = m;
      }
    }
    return top;
  }
}

/** Partitions land between two blocs. Writes owner, capitals, degenerate. Never throws. */
export function assignOwnership(world: HexWorld): void {
  world.owner.fill(Owner.Neutral);
  const { label, sizes } = labelLandmasses(world);
  const main = mainLandmass(sizes);
  if (main < 0) {
    world.capitals = [{ q: 0, r: 0 }, { q: 0, r: 0 }];
    world.degenerate = true;
    return;
  }

  let minCol = Infinity;
  let maxCol = -Infinity;
  let rowSum = 0;
  let count = 0;
  for (let i = 0; i < label.length; i++) {
    if (label[i] !== main) continue;
    const col = i % world.cols;
    const row = Math.floor(i / world.cols);
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
    rowSum += row;
    count++;
  }
  const width = maxCol - minCol;
  const centroidRow = rowSum / count;
  const capA = pickCapital(world, label, main, minCol + width / 6, centroidRow);
  const capB = pickCapital(world, label, main, maxCol - width / 6, centroidRow);
  world.capitals = [capA, capB];

  if (distance(capA, capB) < MIN_CAPITAL_DISTANCE) {
    world.degenerate = true;
    const split = (minCol + maxCol) / 2;
    for (let i = 0; i < label.length; i++) {
      if (label[i] === main) world.owner[i] = i % world.cols < split ? Owner.BlocA : Owner.BlocB;
    }
    return;
  }
  world.degenerate = false;

  const n = world.terrain.length;
  const rand = mulberry32((world.seed * 4 + JITTER_SALT) >>> 0);
  const jitter = new Float64Array(n);
  for (let i = 0; i < n; i++) jitter[i] = 0.7 + rand() * 0.6;

  const cost = new Float64Array(n).fill(Infinity);
  const settled = new Uint8Array(n);
  const heap = new MinHeap();
  const a = hexAt(world, capA);
  const b = hexAt(world, capB);
  cost[a] = 0;
  cost[b] = 0;
  heap.push({ cost: 0, index: a, owner: Owner.BlocA });
  heap.push({ cost: 0, index: b, owner: Owner.BlocB });

  while (heap.size > 0) {
    const e = heap.pop();
    if (settled[e.index]) continue;
    settled[e.index] = 1;
    world.owner[e.index] = e.owner;
    for (const j of landNeighbors(world, e.index)) {
      if (settled[j]) continue;
      const nc = e.cost + TERRAIN_COST[world.terrain[j]!]! * jitter[j]!;
      if (nc < cost[j]!) {
        cost[j] = nc;
        heap.push({ cost: nc, index: j, owner: e.owner });
      }
    }
  }
}
```

- [ ] **Step 4: Add `generateWorld` to `generate.ts`**

In `src/strategic/generate.ts`, add the import at the top and the function at the bottom:

```ts
import { assignOwnership } from "./ownership";
import { createEmptyWorld } from "./world";   // merge into the existing ./world import
```

```ts
/** Full pipeline: terrain then ownership. Deterministic; never throws. */
export function generateWorld(seed: number): HexWorld {
  const world = createEmptyWorld(Math.floor(seed));
  fillTerrain(world);
  assignOwnership(world);
  return world;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test tests/strategic.test.ts && bunx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/strategic/ownership.ts src/strategic/generate.ts tests/strategic.test.ts
git commit -m "feat: bloc ownership — landmasses, capitals, jittered Dijkstra partition, generateWorld"
```

---

### Task 7: Queries — frontier edges and counts

**Files:**
- Create: `src/strategic/queries.ts`
- Test: `tests/strategic.test.ts` (append)

**Interfaces:**
- Consumes: `neighbor` (Task 1); `Owner`, `axialOf`, `hexAt`, `isLand`, `HexWorld` (Task 4).
- Produces: `FrontierEdge { index; dir: 0 | 1 | 2; kind: "front" | "border" }`, `isFrontierEdge(world, index, dir): boolean`, `frontlineEdges(world): FrontierEdge[]`, `countByOwner(world): [neutralLand, blocA, blocB]`, `frontLength(world): number`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/strategic.test.ts`:

```ts
import { countByOwner, frontLength, frontlineEdges, isFrontierEdge } from "../src/strategic/queries";

describe("queries", () => {
  test("frontier edges on a hand-built strip: A A N B B", () => {
    const w = createEmptyWorld(1, 5, 1);
    w.terrain.fill(Terrain.Plains);
    w.terrain[2] = Terrain.Ocean;
    w.owner.set([Owner.BlocA, Owner.BlocA, Owner.Neutral, Owner.BlocB, Owner.BlocB]);
    expect(isFrontierEdge(w, 0, 0)).toBe(false);   // A|A
    expect(isFrontierEdge(w, 1, 0)).toBe(true);    // A|N
    expect(isFrontierEdge(w, 2, 0)).toBe(true);    // N|B
    expect(isFrontierEdge(w, 4, 0)).toBe(false);   // off the map
    const edges = frontlineEdges(w);
    expect(edges).toEqual([
      { index: 1, dir: 0, kind: "border" },
      { index: 2, dir: 0, kind: "border" },
    ]);
    expect(countByOwner(w)).toEqual([0, 2, 2]);
    expect(frontLength(w)).toBe(0);
  });

  test("a direct A|B contact is a front edge", () => {
    const w = createEmptyWorld(1, 2, 1);
    w.terrain.fill(Terrain.Plains);
    w.owner.set([Owner.BlocA, Owner.BlocB]);
    expect(frontlineEdges(w)).toEqual([{ index: 0, dir: 0, kind: "front" }]);
    expect(frontLength(w)).toBe(1);
  });

  test("on a generated world every edge separates different owners, appears once, and counts sum to land", () => {
    const world = generateWorld(1);
    const seen = new Set<string>();
    for (const e of frontlineEdges(world)) {
      const j = hexAt(world, neighbors(axialOf(world, e.index))[e.dir]!);
      expect(j).toBeGreaterThanOrEqual(0);
      const a = world.owner[e.index]!;
      const b = world.owner[j]!;
      expect(a).not.toBe(b);
      expect(e.kind).toBe(a !== Owner.Neutral && b !== Owner.Neutral ? "front" : "border");
      const k = e.index < j ? `${e.index}-${j}` : `${j}-${e.index}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
    const [neutral, a, b] = countByOwner(world);
    let land = 0;
    for (let i = 0; i < world.terrain.length; i++) if (isLand(world, i)) land++;
    expect(neutral + a + b).toBe(land);
    expect(frontLength(world)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/strategic.test.ts`
Expected: FAIL — cannot resolve `../src/strategic/queries`.

- [ ] **Step 3: Implement `queries.ts`**

Create `src/strategic/queries.ts`:

```ts
import { neighbor } from "../hex/ops";
import { Owner, axialOf, hexAt, isLand, type HexWorld } from "./world";

export type FrontierEdge = { index: number; dir: 0 | 1 | 2; kind: "front" | "border" };

/** True when the neighbor in `dir` exists and has a different owner. */
export function isFrontierEdge(world: HexWorld, index: number, dir: number): boolean {
  const j = hexAt(world, neighbor(axialOf(world, index), dir));
  if (j < 0) return false;
  return world.owner[index] !== world.owner[j];
}

/** Every frontier edge exactly once: only directions 0–2 are emitted, since direction d from
 * hex A is direction d + 3 from hex B. `front` = bloc vs bloc, `border` = bloc vs neutral. */
export function frontlineEdges(world: HexWorld): FrontierEdge[] {
  const out: FrontierEdge[] = [];
  for (let i = 0; i < world.owner.length; i++) {
    const a = world.owner[i]!;
    const h = axialOf(world, i);
    for (const dir of [0, 1, 2] as const) {
      const j = hexAt(world, neighbor(h, dir));
      if (j < 0) continue;
      const b = world.owner[j]!;
      if (a === b) continue;
      out.push({ index: i, dir, kind: a !== Owner.Neutral && b !== Owner.Neutral ? "front" : "border" });
    }
  }
  return out;
}

/** Land hexes per owner: [neutral, blocA, blocB]. */
export function countByOwner(world: HexWorld): [number, number, number] {
  const counts: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < world.owner.length; i++) {
    if (!isLand(world, i)) continue;
    counts[world.owner[i] as 0 | 1 | 2]++;
  }
  return counts;
}

export function frontLength(world: HexWorld): number {
  let n = 0;
  for (const e of frontlineEdges(world)) if (e.kind === "front") n++;
  return n;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test && bunx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/strategic/queries.ts tests/strategic.test.ts
git commit -m "feat: strategic queries — frontier edges, owner counts, front length"
```

---

### Task 8: Renderer — baked layers, frontline, capitals, hover/selection

**Files:**
- Create: `src/render/hexMap.ts`
- Test: `tests/hexMap.test.ts`

**Interfaces:**
- Consumes: `Axial` (Task 1); `Pt`, `hexCorners`, `hexToWorld` (Task 2); `Owner`, `Terrain`, `axialOf`, `worldBounds`, `HexWorld` (Task 4); `FrontierEdge`, `frontlineEdges` (Task 7).
- Produces: `PX_PER_KM = 2`, `LayerFrame { minX, minY, width, height, pxPerKm }`, `Layer = LayerFrame & { canvas: HTMLCanvasElement | null }`, `layerFrame(world)`, `toLayerPx(frame, p): Pt`, `buildTerrainLayer(world): Layer`, `buildOwnerLayer(world): Layer`, `drawLayer(ctx, layer)`, `drawFrontline(ctx, world, edges, zoom)`, `drawCapitals(ctx, world, zoom)`, `drawHexOutline(ctx, world, h, color, widthPx, zoom)`, `MapLayers { terrain; owner; edges }`, `buildMapLayers(world): MapLayers`, `renderHexMap(ctx, world, layers, hover, selected, zoom)`.

- [ ] **Step 1: Write the failing tests (headless geometry only)**

Create `tests/hexMap.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { PX_PER_KM, buildOwnerLayer, buildTerrainLayer, drawLayer, layerFrame, toLayerPx } from "../src/render/hexMap";
import { createEmptyWorld, worldBounds } from "../src/strategic/world";

describe("hexMap layers (headless)", () => {
  const world = createEmptyWorld(1);

  test("layerFrame covers the world bounds at PX_PER_KM", () => {
    const f = layerFrame(world);
    const b = worldBounds(world);
    expect(f.minX).toBe(b.minX);
    expect(f.minY).toBe(b.minY);
    expect(f.width).toBeCloseTo(b.maxX - b.minX, 9);
    expect(f.height).toBeCloseTo(b.maxY - b.minY, 9);
    expect(f.pxPerKm).toBe(PX_PER_KM);
  });

  test("toLayerPx maps the north-west corner to (0,0) and the south-east corner to the pixel size", () => {
    const f = layerFrame(world);
    const b = worldBounds(world);
    expect(toLayerPx(f, { x: b.minX, y: b.maxY })).toEqual({ x: 0, y: 0 });
    const se = toLayerPx(f, { x: b.maxX, y: b.minY });
    expect(se.x).toBeCloseTo(f.width * PX_PER_KM, 9);
    expect(se.y).toBeCloseTo(f.height * PX_PER_KM, 9);
  });

  test("without a DOM the layers have a null canvas and drawLayer is a no-op", () => {
    const terrain = buildTerrainLayer(world);
    const owner = buildOwnerLayer(world);
    expect(terrain.canvas).toBeNull();
    expect(owner.canvas).toBeNull();
    const ctx = { drawImage: () => { throw new Error("must not draw"); } } as unknown as CanvasRenderingContext2D;
    expect(() => drawLayer(ctx, terrain)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/hexMap.test.ts`
Expected: FAIL — cannot resolve `../src/render/hexMap`.

- [ ] **Step 3: Implement `hexMap.ts`**

Create `src/render/hexMap.ts`:

```ts
import type { Axial } from "../hex/coords";
import { hexCorners, hexToWorld, type Pt } from "../hex/layout";
import { frontlineEdges, type FrontierEdge } from "../strategic/queries";
import { Owner, axialOf, worldBounds, type HexWorld } from "../strategic/world";

export const PX_PER_KM = 2;

export type LayerFrame = { minX: number; minY: number; width: number; height: number; pxPerKm: number };
/** An offscreen image plus its world-space placement. canvas is null when there is no DOM. */
export type Layer = LayerFrame & { canvas: HTMLCanvasElement | null };

const TERRAIN_RGB: readonly [number, number, number][] = [
  [38, 62, 92],    // ocean
  [116, 150, 82],  // plains
  [62, 106, 58],   // forest
  [150, 132, 92],  // hills
  [170, 166, 160], // mountains
];
const OWNER_TINT: readonly string[] = ["", "rgba(220, 80, 70, 0.35)", "rgba(70, 120, 220, 0.35)"];
const OWNER_STROKE: readonly string[] = ["", "#e0574a", "#4a7ae0"];
const FRONT = "#f5f0e6";
const BORDER = "rgba(245, 240, 230, 0.55)";
const HOVER = "#ffd166";
const SELECTED = "#ffffff";

export function layerFrame(world: HexWorld): LayerFrame {
  const b = worldBounds(world);
  return { minX: b.minX, minY: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY, pxPerKm: PX_PER_KM };
}

/** World km → layer pixel; pixel y grows southward (image row 0 is the north edge). */
export function toLayerPx(frame: LayerFrame, p: Pt): Pt {
  return { x: (p.x - frame.minX) * frame.pxPerKm, y: (frame.minY + frame.height - p.y) * frame.pxPerKm };
}

function createLayerCanvas(frame: LayerFrame): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(frame.width * frame.pxPerKm);
  canvas.height = Math.ceil(frame.height * frame.pxPerKm);
  const ctx = canvas.getContext("2d");
  return ctx ? { canvas, ctx } : null;
}

function hexPathPx(ctx: CanvasRenderingContext2D, frame: LayerFrame, corners: Pt[]): void {
  ctx.beginPath();
  for (let i = 0; i < corners.length; i++) {
    const p = toLayerPx(frame, corners[i]!);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

function terrainColor(terrain: number, elevation: number): string {
  const [r, g, b] = TERRAIN_RGB[terrain] ?? TERRAIN_RGB[0]!;
  const k = 1 + 0.15 * elevation; // up to 15% lighter with elevation
  return `rgb(${Math.min(255, Math.round(r * k))}, ${Math.min(255, Math.round(g * k))}, ${Math.min(255, Math.round(b * k))})`;
}

function paintHexes(world: HexWorld, colorOf: (i: number) => string | null): Layer {
  const frame = layerFrame(world);
  const made = createLayerCanvas(frame);
  if (!made) return { ...frame, canvas: null };
  const { canvas, ctx } = made;
  ctx.lineWidth = 1; // stroking in the fill color hides antialiasing seams between hexes
  for (let i = 0; i < world.terrain.length; i++) {
    const color = colorOf(i);
    if (!color) continue;
    hexPathPx(ctx, frame, hexCorners(axialOf(world, i), world.layout));
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.fill();
    ctx.stroke();
  }
  return { ...frame, canvas };
}

/** Terrain fills, baked once per generation. */
export function buildTerrainLayer(world: HexWorld): Layer {
  return paintHexes(world, (i) => terrainColor(world.terrain[i]!, world.elevation[i]!));
}

/** Translucent bloc tints; neutral hexes are left clear. Rebuild whenever ownership changes. */
export function buildOwnerLayer(world: HexWorld): Layer {
  return paintHexes(world, (i) => (world.owner[i] === Owner.Neutral ? null : OWNER_TINT[world.owner[i]!]!));
}

/** One drawImage in world coordinates. The board's proxied context (alignCoordinateSystem = false)
 * y-flips drawImage itself: passing minY as dy puts image row 0 (north) at world maxY. */
export function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer): void {
  if (!layer.canvas) return;
  ctx.drawImage(layer.canvas, layer.minX, layer.minY, layer.width, layer.height);
}

function strokeEdges(ctx: CanvasRenderingContext2D, world: HexWorld, edges: FrontierEdge[], kind: FrontierEdge["kind"]): void {
  ctx.beginPath();
  for (const e of edges) {
    if (e.kind !== kind) continue;
    const corners = hexCorners(axialOf(world, e.index), world.layout);
    const a = corners[e.dir]!;
    const b = corners[(e.dir + 1) % 6]!;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

/** Front edges thick and solid, bloc/neutral borders thin and dashed. Widths in screen px. */
export function drawFrontline(ctx: CanvasRenderingContext2D, world: HexWorld, edges: FrontierEdge[], zoom: number): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([6 / zoom, 4 / zoom]);
  strokeEdges(ctx, world, edges, "border");
  ctx.setLineDash([]);
  ctx.strokeStyle = FRONT;
  ctx.lineWidth = 3 / zoom;
  strokeEdges(ctx, world, edges, "front");
  ctx.restore();
}

export function drawCapitals(ctx: CanvasRenderingContext2D, world: HexWorld, zoom: number): void {
  ctx.save();
  ctx.lineWidth = 3 / zoom;
  world.capitals.forEach((h, i) => {
    const c = hexToWorld(h, world.layout);
    ctx.strokeStyle = OWNER_STROKE[i + 1]!;
    ctx.fillStyle = OWNER_STROKE[i + 1]!;
    ctx.beginPath();
    ctx.arc(c.x, c.y, world.layout.size * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c.x, c.y, world.layout.size * 0.18, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

export function drawHexOutline(ctx: CanvasRenderingContext2D, world: HexWorld, h: Axial, color: string, widthPx: number, zoom: number): void {
  const corners = hexCorners(h, world.layout);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx / zoom;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(corners[0]!.x, corners[0]!.y);
  for (let i = 1; i < 6; i++) ctx.lineTo(corners[i]!.x, corners[i]!.y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

export type MapLayers = { terrain: Layer; owner: Layer; edges: FrontierEdge[] };

export function buildMapLayers(world: HexWorld): MapLayers {
  return { terrain: buildTerrainLayer(world), owner: buildOwnerLayer(world), edges: frontlineEdges(world) };
}

/** The page's single render entry point. `zoom` is the board camera zoom (screen px per km). */
export function renderHexMap(
  ctx: CanvasRenderingContext2D,
  world: HexWorld,
  layers: MapLayers,
  hover: Axial | null,
  selected: Axial | null,
  zoom: number,
): void {
  drawLayer(ctx, layers.terrain);
  drawLayer(ctx, layers.owner);
  drawFrontline(ctx, world, layers.edges, zoom);
  drawCapitals(ctx, world, zoom);
  if (selected) drawHexOutline(ctx, world, selected, SELECTED, 3, zoom);
  if (hover) drawHexOutline(ctx, world, hover, HOVER, 2, zoom);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test && bunx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/render/hexMap.ts tests/hexMap.test.ts
git commit -m "feat: hex map renderer — baked terrain/owner layers, frontline, capitals, outlines"
```

---

### Task 9: Map page — `map.html`, panel, wiring, docs

**Files:**
- Create: `map.html`
- Create: `src/strategic/panel.ts`
- Create: `src/strategic/main.ts`
- Modify: `package.json` (dev script)
- Modify: `docs/VISION.md` ("Current state" section at the end)
- Modify: `README.md` (run command)
- Test: `tests/strategic.test.ts` (append, for `describeHex`)

**Interfaces:**
- Consumes: `Axial`, `distance`, `worldToHex`, `hexWidth`, `generateWorld`, `countByOwner`, `frontLength`, `axialOf`, `hexAt`, `worldBounds`, `HexWorld`, `buildMapLayers`, `renderHexMap`, `MapLayers`.
- Produces: `TERRAIN_NAMES`, `OWNER_NAMES`, `describeHex(world, index): string`, `MapPanel { seed(); onRegenerate(cb); setInfo(text); setTally(text) }`, `setupMapPanel(): MapPanel`.

- [ ] **Step 1: Write the failing test for `describeHex`**

Append to `tests/strategic.test.ts`:

```ts
import { describeHex } from "../src/strategic/panel";

describe("describeHex", () => {
  test("lists coordinates, terrain, elevation, and owner", () => {
    const w = createEmptyWorld(1, 4, 3);
    const i = index(w, 1, 2); // offset (1,2) → axial (0,2)
    w.terrain[i] = Terrain.Hills;
    w.elevation[i] = 0.7349;
    w.owner[i] = Owner.BlocB;
    expect(describeHex(w, i)).toBe("offset: col 1, row 2\naxial: q 0, r 2\nterrain: hills\nelevation: 0.73\nowner: Bloc B");
  });
});
```

Run: `bun test tests/strategic.test.ts`
Expected: FAIL — cannot resolve `../src/strategic/panel`.

- [ ] **Step 2: Create `panel.ts`**

Create `src/strategic/panel.ts`:

```ts
import { axialToOffset } from "../hex/coords";
import { axialOf, type HexWorld } from "./world";

export const TERRAIN_NAMES: readonly string[] = ["ocean", "plains", "forest", "hills", "mountains"];
export const OWNER_NAMES: readonly string[] = ["neutral", "Bloc A", "Bloc B"];

/** Multi-line readout for one hex. Pure; no DOM. */
export function describeHex(world: HexWorld, index: number): string {
  const h = axialOf(world, index);
  const o = axialToOffset(h);
  return [
    `offset: col ${o.col}, row ${o.row}`,
    `axial: q ${h.q}, r ${h.r}`,
    `terrain: ${TERRAIN_NAMES[world.terrain[index]!] ?? "?"}`,
    `elevation: ${world.elevation[index]!.toFixed(2)}`,
    `owner: ${OWNER_NAMES[world.owner[index]!] ?? "?"}`,
  ].join("\n");
}

export type MapPanel = {
  /** Current seed; non-finite input falls back to 1 and is written back into the field. */
  seed(): number;
  onRegenerate(cb: (seed: number) => void): void;
  setInfo(text: string): void;
  setTally(text: string): void;
};

export function setupMapPanel(): MapPanel {
  const seedInput = document.getElementById("seed") as HTMLInputElement;
  const regen = document.getElementById("regen") as HTMLButtonElement;
  const info = document.getElementById("info")!;
  const tally = document.getElementById("tally")!;
  const seed = () => {
    const v = Math.floor(Number(seedInput.value));
    if (!Number.isFinite(v)) {
      seedInput.value = "1";
      return 1;
    }
    return v;
  };
  return {
    seed,
    onRegenerate: (cb) => regen.addEventListener("click", () => cb(seed())),
    setInfo: (text) => { info.textContent = text; },
    setTally: (text) => { tally.textContent = text; },
  };
}
```

Run: `bun test tests/strategic.test.ts && bunx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 3: Create `map.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>woolwich — world map</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; background: #14181f; color: #d7dde6; font: 14px/1.4 system-ui, sans-serif; display: flex; height: 100vh; }
    #panel { width: 280px; padding: 16px; box-sizing: border-box; overflow-y: auto; background: #1b212b; }
    #view { flex: 1; position: relative; min-width: 0; }
    #view canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: crosshair; }
    #view .label { position: absolute; top: 8px; left: 12px; opacity: 0.6; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; pointer-events: none; }
    button { margin: 0 6px 0 0; padding: 6px 14px; background: #2c3440; color: inherit; border: 1px solid #3d4859; border-radius: 4px; cursor: pointer; }
    button:hover { background: #38445a; }
    #seed { width: 90px; background: #2c3440; color: inherit; border: 1px solid #3d4859; border-radius: 4px; padding: 4px 8px; }
    #info, #tally { margin-top: 14px; font-variant-numeric: tabular-nums; white-space: pre-line; opacity: 0.9; }
    #tally { opacity: 0.75; font-size: 13px; }
    .hint { margin-top: 16px; opacity: 0.5; font-size: 12px; }
    a { color: #8fb4ff; }
  </style>
</head>
<body>
  <div id="panel">
    <h3 style="margin-top:0">woolwich — world map</h3>
    <div>
      <input id="seed" type="number" value="1" />
      <button id="regen">Regenerate</button>
    </div>
    <div id="info">hover a hex</div>
    <div id="tally"></div>
    <p class="hint">drag to pan · wheel to zoom · click to select<br /><a href="./gallery.html">gallery</a> · <a href="./index.html">playground</a></p>
  </div>
  <div id="view"><canvas id="map"></canvas><span class="label">strategic map — 20 km hexes</span></div>
  <script type="module" src="./src/strategic/main.ts"></script>
</body>
</html>
```

- [ ] **Step 4: Create `main.ts`**

Create `src/strategic/main.ts`:

```ts
import { Board } from "@ue-too/board";
import type { Axial } from "../hex/coords";
import { hexWidth, worldToHex } from "../hex/layout";
import { distance } from "../hex/ops";
import { buildMapLayers, renderHexMap, type MapLayers } from "../render/hexMap";
import { generateWorld } from "./generate";
import { describeHex, setupMapPanel } from "./panel";
import { countByOwner, frontLength } from "./queries";
import { hexAt, worldBounds, type HexWorld } from "./world";

const canvas = document.getElementById("map") as HTMLCanvasElement;
const board = new Board(canvas);
board.alignCoordinateSystem = false;
board.camera.setMinZoomLevel(0.2);
board.camera.setMaxZoomLevel(20);

const panel = setupMapPanel();

let world: HexWorld = generateWorld(panel.seed());
let layers: MapLayers = buildMapLayers(world);
let hover: Axial | null = null;
let selected: Axial | null = null;

/** Center the camera on the map and zoom so the whole map fits with a 5% margin. */
function fitCamera(): void {
  const b = worldBounds(world);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  const zoom = Math.min(w / (b.maxX - b.minX), h / (b.maxY - b.minY)) * 0.95;
  board.camera.setPosition({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
  board.camera.setZoomLevel(zoom);
}
fitCamera();

/** Pointer position (CSS px) → world km. Camera rotation is unused in this app (0). */
function pointerToWorld(ev: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const cx = ev.clientX - rect.left - rect.width / 2;
  const cy = ev.clientY - rect.top - rect.height / 2;
  const cam = board.camera;
  return { x: cam.position.x + cx / cam.zoomLevel, y: cam.position.y - cy / cam.zoomLevel };
}

function hexUnderPointer(ev: MouseEvent): Axial | null {
  const h = worldToHex(pointerToWorld(ev), world.layout);
  return hexAt(world, h) >= 0 ? h : null;
}

let downAt: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", (ev) => { downAt = { x: ev.clientX, y: ev.clientY }; });
canvas.addEventListener("pointermove", (ev) => { hover = hexUnderPointer(ev); });
canvas.addEventListener("pointerleave", () => { hover = null; });
canvas.addEventListener("click", (ev) => {
  // a click that ends a pan must not change the selection
  if (downAt && Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) > 4) return;
  selected = hexUnderPointer(ev);
});

panel.onRegenerate((seed) => {
  world = generateWorld(seed);
  layers = buildMapLayers(world);
  hover = null;
  selected = null;
  fitCamera();
});

function updatePanel(): void {
  const shown = hover ?? selected;
  let text = shown ? describeHex(world, hexAt(world, shown)) : "hover a hex";
  if (hover && selected) {
    const d = distance(selected, hover);
    text += `\nrange from selection: ${d} hex (${Math.round(d * hexWidth(world.layout))} km)`;
  }
  panel.setInfo(text);
  const [neutral, a, b] = countByOwner(world);
  let tally = `Bloc A ${a} · Bloc B ${b} · neutral ${neutral} land hexes\nfrontline: ${frontLength(world)} edges`;
  if (world.degenerate) tally += "\n⚠ degenerate world — column-split fallback";
  panel.setTally(tally);
}

function frame(timestamp: number): void {
  board.step(timestamp);
  const ctx = board.context;
  if (ctx) renderHexMap(ctx, world, layers, hover, selected, board.camera.zoomLevel);
  updatePanel();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

- [ ] **Step 5: Register the page and fix the docs**

In `package.json`, change the dev script to:

```json
"dev": "bun index.html gallery.html map.html"
```

In `README.md`, replace the "To run" block with:

````markdown
To run (serves `index.html`, `gallery.html`, and `map.html`):

```bash
bun run dev
```
````

In `docs/VISION.md`, replace the whole `## Current state` section with:

```markdown
## Current state

- **v1 playground** (`index.html`): deterministic 3D ballistics core
  (gravity, quadratic drag, wind; semi-implicit Euler at 1/120 s) shared
  between live simulation and prediction, side + top-down views, slider and
  time controls. Renderer-independent; it is the simulated tier of the
  battle layer unchanged.
- **v2.1 shooting gallery** (`gallery.html`): seeded 8 km terrain
  heightfield, launch origin and terrain impact seams in the physics,
  fire-solution solver (high/low arc, manual elevation), platoon stands with
  deterministic burst damage and suppression, `@ue-too/being` fire-control
  state machine.
- **v3.0 hex world map** (`map.html`): the strategic layer's foundation —
  pure hex math, an 80 × 50 world of 20 km hexes with seeded terrain classes
  and two blocs partitioned along a noisy frontline, rendered with pan/zoom,
  hover, and selection. One hex ≈ one battle map: the bridge's first shared
  unit.
```

Run: `bun test && bunx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 6: Verify in the browser**

Run: `bun run dev` and open the printed URL with `/map.html`. Check each item:

1. The whole map is visible and centered on load; ocean around a continent with islands; plains/forest/hills/mountain colors distinguishable; no seams between hexes at the default zoom.
2. Red and blue tints cover the continent; a thick light line runs between them; thin dashed lines separate blocs from neutral islands and coast is untinted.
3. Two ringed capital markers, one per bloc, roughly in the western and eastern thirds.
4. Wheel zooms, drag pans; outline widths stay the same on screen at any zoom.
5. Moving the mouse shows a yellow outline and the info panel updates (coords, terrain, elevation, owner); leaving the canvas clears it.
6. Click selects (white outline); hovering elsewhere shows "range from selection: N hex (N·20 km)"; clicking outside the map clears the selection; a drag-pan ending over a hex does not change the selection.
7. Changing the seed and clicking Regenerate produces a new world, refits the camera, clears hover/selection; the tally updates. Entering `abc` as the seed regenerates seed 1 and the field shows `1`.
8. `gallery.html` and `index.html` still work.

If something is off, fix it in `main.ts` / `hexMap.ts` / `map.html`, rerun `bun test && bunx tsc --noEmit`, and re-check.

- [ ] **Step 7: Commit**

```bash
git add map.html src/strategic/panel.ts src/strategic/main.ts package.json README.md docs/VISION.md tests/strategic.test.ts
git commit -m "feat: strategic world map page — pan/zoom hex map with hover, selection, and seed control"
```

---

## Self-review notes

- Spec coverage: hex math (T1–T2), noise extraction (T3), world model (T4), generation steps 1–2 (T5), steps 3–6 + `assignOwnership` + `generateWorld` (T6), queries (T7), renderer layers/frontline/capitals/outlines/zoom-scaled widths (T8), page, panel, seed handling, pan-click guard, Board resize, docs (T9). Error-handling bullets: bad seed (T9 panel), `hexAt` −1 (T4/T9), degenerate fallback (T6), termination (T6), skipped frame without context (T9), null-canvas layers headless (T8).
- Names used across tasks: `createEmptyWorld(seed, cols?, rows?)`, `hexAt`, `axialOf`, `isLand`, `worldBounds`, `fillTerrain`, `assignOwnership`, `generateWorld`, `frontlineEdges`, `countByOwner`, `frontLength`, `buildMapLayers`, `renderHexMap`, `describeHex`, `setupMapPanel` — consistent in every task that consumes them.
