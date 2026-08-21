import type { Axial } from "./coords";
import { roundHex } from "./ops";

export type Pt = { x: number; y: number };
/** Pointy-top hex layout; `size` is the circumradius in world units (km on the strategic map). */
export type HexLayout = { size: number };

export const SQRT3 = Math.sqrt(3);

export function hexWidth(l: HexLayout): number {
  return l.size * SQRT3;
}

export function hexHeight(l: HexLayout): number {
  return l.size * 2;
}

export function rowSpacing(l: HexLayout): number {
  return l.size * 1.5;
}

/** Center of a hex in world coordinates (+x east, +y north). */
export function hexToWorld(h: Axial, l: HexLayout): Pt {
  return { x: l.size * SQRT3 * (h.q + h.r / 2), y: l.size * 1.5 * h.r };
}

/** Nearest hex to a world point. Always returns an axial; bounds are the caller's concern. */
export function worldToHex(p: Pt, l: HexLayout): Axial {
  const r = p.y / (1.5 * l.size);
  const q = p.x / (SQRT3 * l.size) - r / 2;
  const result = roundHex(q, r);
  // Normalize -0 to 0 (can occur from floating-point rounding)
  return { q: result.q + 0, r: result.r + 0 };
}

/** Six corners; corner i at angle 60·i − 30 degrees (0 = lower-right, 1 = upper-right, 2 = top, …).
 * The edge facing direction d runs from corner d to corner (d + 1) % 6. */
export function hexCorners(h: Axial, l: HexLayout): Pt[] {
  const c = hexToWorld(h, l);
  const out: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    out.push({ x: c.x + l.size * Math.cos(a), y: c.y + l.size * Math.sin(a) });
  }
  return out;
}
