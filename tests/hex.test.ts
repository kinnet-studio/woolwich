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
