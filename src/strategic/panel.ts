import { axialToOffset } from "../hex/coords";
import { axialOf, type HexWorld } from "./world";

export const TERRAIN_NAMES: readonly string[] = ["ocean", "plains", "forest", "hills", "mountains"];
export const OWNER_NAMES: readonly string[] = ["neutral", "Bloc A", "Bloc B"];

/** Multi-line readout for one hex. Pure; no DOM. */
export function describeHex(world: HexWorld, index: number): string {
  const h = axialOf(world, index);
  const o = axialToOffset(h);
  return [
    `offset: col ${o.col}, row ${o.row}`,
    `axial: q ${h.q}, r ${h.r}`,
    `terrain: ${TERRAIN_NAMES[world.terrain[index]!] ?? "?"}`,
    `elevation: ${world.elevation[index]!.toFixed(2)}`,
    `owner: ${OWNER_NAMES[world.owner[index]!] ?? "?"}`,
  ].join("\n");
}

export type MapPanel = {
  /** Current seed; non-finite input falls back to 1 and is written back into the field. */
  seed(): number;
  onRegenerate(cb: (seed: number) => void): void;
  setInfo(text: string): void;
  setTally(text: string): void;
};

export function setupMapPanel(): MapPanel {
  const seedInput = document.getElementById("seed") as HTMLInputElement;
  const regen = document.getElementById("regen") as HTMLButtonElement;
  const info = document.getElementById("info")!;
  const tally = document.getElementById("tally")!;
  const seed = () => {
    const v = Math.floor(Number(seedInput.value));
    if (!Number.isFinite(v)) {
      seedInput.value = "1";
      return 1;
    }
    return v;
  };
  return {
    seed,
    onRegenerate: (cb) => regen.addEventListener("click", () => cb(seed())),
    setInfo: (text) => { info.textContent = text; },
    setTally: (text) => { tally.textContent = text; },
  };
}
