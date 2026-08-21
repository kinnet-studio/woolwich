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
