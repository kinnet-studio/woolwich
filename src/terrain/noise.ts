import { mulberry32 } from "./prng";

export type Octave = { spacing: number; amplitude: number };

export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

type Layer = Octave & { lattice: number; values: Float64Array };

/** Seeded multi-octave value noise. Octave o's lattice is filled row-major from
 * mulberry32((seed·4 + o + 1 + salt) >>> 0); the lattice side is ceil(extent / spacing) + 2
 * where extent = max(extentX, extentY). Sample with x, y in [0, extent] (same units as spacing).
 * Returns Σ (n − 0.5)·2·amplitude, i.e. a value in [−Σamplitude, +Σamplitude]. */
export function valueNoise(
  seed: number,
  octaves: Octave[],
  extentX: number,
  extentY: number,
  salt = 0,
): (x: number, y: number) => number {
  const extent = Math.max(extentX, extentY);
  const layers: Layer[] = octaves.map((o, i) => {
    const rand = mulberry32((seed * 4 + i + 1 + salt) >>> 0);
    const lattice = Math.ceil(extent / o.spacing) + 2;
    const values = new Float64Array(lattice * lattice);
    for (let k = 0; k < values.length; k++) values[k] = rand();
    return { spacing: o.spacing, amplitude: o.amplitude, lattice, values };
  });
  return (x, y) => {
    let sum = 0;
    for (const L of layers) {
      const gx = x / L.spacing;
      const gy = y / L.spacing;
      const x0 = Math.min(Math.floor(gx), L.lattice - 2);
      const y0 = Math.min(Math.floor(gy), L.lattice - 2);
      const fx = smoothstep(gx - x0);
      const fy = smoothstep(gy - y0);
      const v00 = L.values[y0 * L.lattice + x0]!;
      const v10 = L.values[y0 * L.lattice + x0 + 1]!;
      const v01 = L.values[(y0 + 1) * L.lattice + x0]!;
      const v11 = L.values[(y0 + 1) * L.lattice + x0 + 1]!;
      const n = v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
      sum += (n - 0.5) * 2 * L.amplitude;
    }
    return sum;
  };
}
