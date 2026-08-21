import { hexToWorld } from "../hex/layout";
import { valueNoise, smoothstep, type Octave } from "../terrain/noise";
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
