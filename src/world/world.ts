import type { GroundFn, Vec3 } from "../physics/types";
import { generateTerrain } from "../terrain/generate";
import { groundFn, sampleTerrain, type Terrain } from "../terrain/terrain";
import { placeStands, type Stand } from "./stand";

export type WorldState = {
  seed: number;
  terrain: Terrain;
  ground: GroundFn;
  stands: Stand[];
  battery: { position: Vec3; muzzleSpeed: number };
};

export function createWorld(seed: number, muzzleSpeed = 250): WorldState {
  const terrain = generateTerrain(seed);
  return {
    seed,
    terrain,
    ground: groundFn(terrain),
    stands: placeStands(seed, terrain),
    battery: { position: { x: 0, y: 0, z: sampleTerrain(terrain, 0, 0) }, muzzleSpeed },
  };
}
