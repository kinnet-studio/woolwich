import { offsetToAxial, type Axial } from "../hex/coords";
import { distance, neighbor } from "../hex/ops";
import { mulberry32 } from "../terrain/prng";
import { Owner, Terrain, axialOf, hexAt, isLand, type HexWorld } from "./world";

/** Step cost into a hex, indexed by terrain id. Ocean is never traversed. */
export const TERRAIN_COST: readonly number[] = [Infinity, 1, 1.5, 2, 4];
export const MIN_CAPITAL_DISTANCE = 8;
const JITTER_SALT = 32;

function landNeighbors(world: HexWorld, i: number): number[] {
  const h = axialOf(world, i);
  const out: number[] = [];
  for (let d = 0; d < 6; d++) {
    const j = hexAt(world, neighbor(h, d));
    if (j >= 0 && isLand(world, j)) out.push(j);
  }
  return out;
}

/** Labels connected land components (6-neighborhood). label[i] = -1 for ocean. */
export function labelLandmasses(world: HexWorld): { label: Int32Array; sizes: number[] } {
  const label = new Int32Array(world.terrain.length).fill(-1);
  const sizes: number[] = [];
  for (let i = 0; i < label.length; i++) {
    if (!isLand(world, i) || label[i] !== -1) continue;
    const id = sizes.length;
    let count = 0;
    const stack = [i];
    label[i] = id;
    while (stack.length) {
      const x = stack.pop()!;
      count++;
      for (const n of landNeighbors(world, x)) {
        if (label[n] === -1) {
          label[n] = id;
          stack.push(n);
        }
      }
    }
    sizes.push(count);
  }
  return { label, sizes };
}

/** Id of the largest landmass (ties → lowest id); -1 when there is no land. */
export function mainLandmass(sizes: number[]): number {
  let best = -1;
  let bestSize = 0;
  for (let i = 0; i < sizes.length; i++) {
    if (sizes[i]! > bestSize) {
      best = i;
      bestSize = sizes[i]!;
    }
  }
  return best;
}

/** Plains hex of the landmass nearest the target (ties → lowest index); any land hex if no plains. */
function pickCapital(world: HexWorld, label: Int32Array, main: number, targetCol: number, targetRow: number): Axial {
  const target = offsetToAxial({ col: Math.round(targetCol), row: Math.round(targetRow) });
  let best = -1;
  let bestDist = Infinity;
  let fallback = -1;
  let fallbackDist = Infinity;
  for (let i = 0; i < label.length; i++) {
    if (label[i] !== main) continue;
    const d = distance(axialOf(world, i), target);
    if (d < fallbackDist) {
      fallback = i;
      fallbackDist = d;
    }
    if (world.terrain[i] === Terrain.Plains && d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return axialOf(world, best >= 0 ? best : fallback);
}

type Entry = { cost: number; index: number; owner: number };

/** Binary min-heap ordered by (cost, index, owner) so the search is fully deterministic. */
class MinHeap {
  private items: Entry[] = [];

  get size(): number {
    return this.items.length;
  }

  private less(a: Entry, b: Entry): boolean {
    if (a.cost !== b.cost) return a.cost < b.cost;
    if (a.index !== b.index) return a.index < b.index;
    return a.owner < b.owner;
  }

  push(e: Entry): void {
    const items = this.items;
    items.push(e);
    let i = items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(items[i]!, items[p]!)) break;
      [items[i], items[p]] = [items[p]!, items[i]!];
      i = p;
    }
  }

  pop(): Entry {
    const items = this.items;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && this.less(items[l]!, items[m]!)) m = l;
        if (r < items.length && this.less(items[r]!, items[m]!)) m = r;
        if (m === i) break;
        [items[i], items[m]] = [items[m]!, items[i]!];
        i = m;
      }
    }
    return top;
  }
}

/** Partitions land between two blocs. Writes owner, capitals, degenerate. Never throws. */
export function assignOwnership(world: HexWorld): void {
  world.owner.fill(Owner.Neutral);
  const { label, sizes } = labelLandmasses(world);
  const main = mainLandmass(sizes);
  if (main < 0) {
    world.capitals = [{ q: 0, r: 0 }, { q: 0, r: 0 }];
    world.degenerate = true;
    return;
  }

  let minCol = Infinity;
  let maxCol = -Infinity;
  let rowSum = 0;
  let count = 0;
  for (let i = 0; i < label.length; i++) {
    if (label[i] !== main) continue;
    const col = i % world.cols;
    const row = Math.floor(i / world.cols);
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
    rowSum += row;
    count++;
  }
  const width = maxCol - minCol;
  const centroidRow = rowSum / count;
  const capA = pickCapital(world, label, main, minCol + width / 6, centroidRow);
  const capB = pickCapital(world, label, main, maxCol - width / 6, centroidRow);
  world.capitals = [capA, capB];

  if (distance(capA, capB) < MIN_CAPITAL_DISTANCE) {
    world.degenerate = true;
    const split = (minCol + maxCol) / 2;
    for (let i = 0; i < label.length; i++) {
      if (label[i] === main) world.owner[i] = i % world.cols < split ? Owner.BlocA : Owner.BlocB;
    }
    return;
  }
  world.degenerate = false;

  const n = world.terrain.length;
  const rand = mulberry32((world.seed * 4 + JITTER_SALT) >>> 0);
  const jitter = new Float64Array(n);
  for (let i = 0; i < n; i++) jitter[i] = 0.7 + rand() * 0.6;

  const cost = new Float64Array(n).fill(Infinity);
  const settled = new Uint8Array(n);
  const heap = new MinHeap();
  const a = hexAt(world, capA);
  const b = hexAt(world, capB);
  cost[a] = 0;
  cost[b] = 0;
  heap.push({ cost: 0, index: a, owner: Owner.BlocA });
  heap.push({ cost: 0, index: b, owner: Owner.BlocB });

  while (heap.size > 0) {
    const e = heap.pop();
    if (settled[e.index]) continue;
    settled[e.index] = 1;
    world.owner[e.index] = e.owner;
    for (const j of landNeighbors(world, e.index)) {
      if (settled[j]) continue;
      const nc = e.cost + TERRAIN_COST[world.terrain[j]!]! * jitter[j]!;
      if (nc < cost[j]!) {
        cost[j] = nc;
        heap.push({ cost: nc, index: j, owner: e.owner });
      }
    }
  }
}
