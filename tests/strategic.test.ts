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
