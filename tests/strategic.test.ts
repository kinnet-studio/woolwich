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
