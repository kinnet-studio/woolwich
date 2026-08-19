import type { Trajectory } from "../physics/predict";
import type { Vec3 } from "../physics/types";

export type Scene = {
  predicted: Trajectory | null;
  projectile: Vec3 | null;
  impact: Vec3 | null;
};

/** Horizontal distance from the launcher at the origin. */
export function downrange(p: Vec3): number {
  return Math.hypot(p.x, p.y);
}
