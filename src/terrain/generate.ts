import { mulberry32 } from "./prng";
import { sampleTerrain, type Terrain } from "./terrain";

const EXTENT = 4000;
const CELL_SIZE = 50;
const SIZE = 161; // 2 * EXTENT / CELL_SIZE + 1
const OCTAVES = [
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
  for (let o = 0; o < OCTAVES.length; o++) {
    const { spacing, amplitude } = OCTAVES[o]!;
    const rand = mulberry32((seed * 4 + o + 1) >>> 0);
    const lattice = Math.ceil((2 * EXTENT) / spacing) + 2;
    const values = new Float64Array(lattice * lattice);
    for (let i = 0; i < values.length; i++) values[i] = rand();
    for (let iy = 0; iy < SIZE; iy++) {
      for (let ix = 0; ix < SIZE; ix++) {
        const gx = (ix * CELL_SIZE) / spacing;
        const gy = (iy * CELL_SIZE) / spacing;
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const fx = smoothstep(gx - x0);
        const fy = smoothstep(gy - y0);
        const v00 = values[y0 * lattice + x0]!;
        const v10 = values[y0 * lattice + x0 + 1]!;
        const v01 = values[(y0 + 1) * lattice + x0]!;
        const v11 = values[(y0 + 1) * lattice + x0 + 1]!;
        const n = v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
        const i = iy * SIZE + ix;
        heights[i] = heights[i]! + (n - 0.5) * 2 * amplitude;
      }
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
