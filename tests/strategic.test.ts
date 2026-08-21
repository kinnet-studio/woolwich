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
