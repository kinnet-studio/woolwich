import { describe, expect, test } from "bun:test";
import { mulberry32 } from "../src/terrain/prng";
import { generateTerrain } from "../src/terrain/generate";
import { sampleTerrain, type Terrain } from "../src/terrain/terrain";
import { sampleProfile } from "../src/render/terrainProfile";

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
    for (const pt of p) expect(pt.z).toBeCloseTo(42, 9);
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

import { profileExtent } from "../src/render/terrainProfile";

describe("profileExtent", () => {
  test("axis-aligned bearings run to the map edge", () => {
    expect(profileExtent({ x: 0, y: 0, z: 0 }, 0, 4000)).toBeCloseTo(4000, 6);
    expect(profileExtent({ x: 0, y: 0, z: 0 }, 90, 4000)).toBeCloseTo(4000, 6);
    expect(profileExtent({ x: 0, y: 0, z: 0 }, 180, 4000)).toBeCloseTo(4000, 6);
  });

  test("diagonal bearing reaches the corner", () => {
    expect(profileExtent({ x: 0, y: 0, z: 0 }, 45, 4000)).toBeCloseTo(4000 * Math.SQRT2, 3);
  });

  test("offset origin shortens or lengthens the run", () => {
    expect(profileExtent({ x: 2000, y: 0, z: 0 }, 0, 4000)).toBeCloseTo(2000, 6);
    expect(profileExtent({ x: 2000, y: 0, z: 0 }, 180, 4000)).toBeCloseTo(6000, 6);
  });
});

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
