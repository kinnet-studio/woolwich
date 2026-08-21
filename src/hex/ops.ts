import type { Axial } from "./coords";

/** Six axial direction deltas, counterclockwise from east: E, NE, NW, W, SW, SE.
 * With y = 1.5·size·r pointing north, +r is north-east. Direction d points at 60·d degrees. */
export const DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

export function neighbor(h: Axial, dir: number): Axial {
  const d = DIRECTIONS[dir]!;
  return { q: h.q + d.q, r: h.r + d.r };
}

export function neighbors(h: Axial): Axial[] {
  return DIRECTIONS.map((_, i) => neighbor(h, i));
}

export function distance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

/** Cube rounding: round all three, then fix the component with the largest error. */
export function roundHex(fq: number, fr: number): Axial {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

/** Hexes at exactly `radius` from center, starting at center + radius·DIRECTIONS[4] (south-west
 * corner) and walking each direction 0..5 in turn. radius 0 → [center]. */
export function ring(center: Axial, radius: number): Axial[] {
  if (radius === 0) return [{ q: center.q, r: center.r }];
  const out: Axial[] = [];
  const start = DIRECTIONS[4]!;
  let h: Axial = { q: center.q + start.q * radius, r: center.r + start.r * radius };
  for (let d = 0; d < 6; d++) {
    for (let i = 0; i < radius; i++) {
      out.push(h);
      h = neighbor(h, d);
    }
  }
  return out;
}

/** Center followed by rings 1..radius. */
export function spiral(center: Axial, radius: number): Axial[] {
  const out: Axial[] = [{ q: center.q, r: center.r }];
  for (let r = 1; r <= radius; r++) out.push(...ring(center, r));
  return out;
}

/** Hexes along the straight line from a to b (both inclusive), consecutive hexes adjacent.
 * A tiny nudge breaks ties deterministically when the line passes through a corner. */
export function line(a: Axial, b: Axial): Axial[] {
  const n = distance(a, b);
  if (n === 0) return [{ q: a.q, r: a.r }];
  const aq = a.q + 1e-6;
  const ar = a.r + 2e-6;
  const bq = b.q + 1e-6;
  const br = b.r + 2e-6;
  const out: Axial[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(roundHex(aq + (bq - aq) * t, ar + (br - ar) * t));
  }
  return out;
}
