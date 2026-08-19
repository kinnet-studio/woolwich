import { describe, expect, test } from "bun:test";
import { mulberry32 } from "../src/terrain/prng";
import { generateTerrain } from "../src/terrain/generate";
import { sampleTerrain, type Terrain } from "../src/terrain/terrain";

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
