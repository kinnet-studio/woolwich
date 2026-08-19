export type Terrain = {
  /** half-width of the square map in meters */
  extent: number;
  /** meters between grid samples */
  cellSize: number;
  /** samples per side */
  size: number;
  /** row-major; index = iy * size + ix; ix → +x (east), iy → +y (north) */
  heights: Float64Array;
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Bilinear interpolation; coordinates outside the extent clamp to the edge. */
export function sampleTerrain(t: Terrain, x: number, y: number): number {
  const gx = clamp((x + t.extent) / t.cellSize, 0, t.size - 1);
  const gy = clamp((y + t.extent) / t.cellSize, 0, t.size - 1);
  const x0 = Math.min(Math.floor(gx), t.size - 2);
  const y0 = Math.min(Math.floor(gy), t.size - 2);
  const fx = gx - x0;
  const fy = gy - y0;
  const s = t.size;
  const h00 = t.heights[y0 * s + x0]!;
  const h10 = t.heights[y0 * s + x0 + 1]!;
  const h01 = t.heights[(y0 + 1) * s + x0]!;
  const h11 = t.heights[(y0 + 1) * s + x0 + 1]!;
  return h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
}

export function groundFn(t: Terrain): (x: number, y: number) => number {
  return (x, y) => sampleTerrain(t, x, y);
}
