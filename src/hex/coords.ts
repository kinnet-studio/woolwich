/** Axial hex coordinates (pointy-top). Cube s = -q - r is derived where needed. */
export type Axial = { q: number; r: number };
/** Odd-r offset coordinates: row = r; odd rows are shoved right by half a hex. */
export type Offset = { col: number; row: number };

export function axialToOffset(h: Axial): Offset {
  return { col: h.q + (h.r - (h.r & 1)) / 2, row: h.r };
}

export function offsetToAxial(o: Offset): Axial {
  return { q: o.col - (o.row - (o.row & 1)) / 2, r: o.row };
}

export function hexEquals(a: Axial, b: Axial): boolean {
  return a.q === b.q && a.r === b.r;
}
