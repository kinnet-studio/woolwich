import type { Vec3 } from "../physics/types";
import { mulberry32 } from "../terrain/prng";
import { sampleTerrain, type Terrain } from "../terrain/terrain";

export type StandKind = "infantry" | "armor";

export type Stand = {
  id: string;
  kind: StandKind;
  position: Vec3;
  /** 0..100; 0 = destroyed (wreck) */
  strength: number;
  /** 0..100 */
  suppression: number;
};

const ZONE = { xMin: 2000, xMax: 3500, yMin: -1000, yMax: 1000 };

export function placeStands(seed: number, terrain: Terrain, count = 8): Stand[] {
  const rand = mulberry32((seed ^ 0x5747414e) >>> 0); // decorrelated from the terrain stream
  const stands: Stand[] = [];
  for (let i = 0; i < count; i++) {
    const x = ZONE.xMin + rand() * (ZONE.xMax - ZONE.xMin);
    const y = ZONE.yMin + rand() * (ZONE.yMax - ZONE.yMin);
    stands.push({
      id: `stand-${i + 1}`,
      kind: rand() < 0.5 ? "infantry" : "armor",
      position: { x, y, z: sampleTerrain(terrain, x, y) },
      strength: 100,
      suppression: 0,
    });
  }
  return stands;
}
