import { valueNoise, smoothstep, type Octave } from "./noise";
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
