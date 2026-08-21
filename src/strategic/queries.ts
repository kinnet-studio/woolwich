import { neighbor } from "../hex/ops";
import { Owner, axialOf, hexAt, isLand, type HexWorld } from "./world";

export type FrontierEdge = { index: number; dir: 0 | 1 | 2; kind: "front" | "border" };

/** True when the neighbor in `dir` exists and has a different owner. */
export function isFrontierEdge(world: HexWorld, index: number, dir: number): boolean {
  const j = hexAt(world, neighbor(axialOf(world, index), dir));
  if (j < 0) return false;
  return world.owner[index] !== world.owner[j];
}

/** Every frontier edge exactly once: only directions 0–2 are emitted, since direction d from
 * hex A is direction d + 3 from hex B. `front` = bloc vs bloc, `border` = bloc vs neutral. */
export function frontlineEdges(world: HexWorld): FrontierEdge[] {
  const out: FrontierEdge[] = [];
  for (let i = 0; i < world.owner.length; i++) {
    const a = world.owner[i]!;
    const h = axialOf(world, i);
    for (const dir of [0, 1, 2] as const) {
      const j = hexAt(world, neighbor(h, dir));
      if (j < 0) continue;
      const b = world.owner[j]!;
      if (a === b) continue;
      out.push({ index: i, dir, kind: a !== Owner.Neutral && b !== Owner.Neutral ? "front" : "border" });
    }
  }
  return out;
}

/** Land hexes per owner: [neutral, blocA, blocB]. */
export function countByOwner(world: HexWorld): [number, number, number] {
  const counts: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < world.owner.length; i++) {
    if (!isLand(world, i)) continue;
    counts[world.owner[i] as 0 | 1 | 2]++;
  }
  return counts;
}

export function frontLength(world: HexWorld): number {
  let n = 0;
  for (const e of frontlineEdges(world)) if (e.kind === "front") n++;
  return n;
}
