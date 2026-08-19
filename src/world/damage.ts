import type { Vec3 } from "../physics/types";
import type { Stand } from "./stand";

export const LETHAL_RADIUS = 50;
export const SUPPRESS_RADIUS = 150;
export const SUPPRESSION_DECAY_PER_SECOND = 5;
const MAX_STRENGTH_DAMAGE = 80;
const MAX_SUPPRESSION = 60;
const KIND_MULTIPLIER = { infantry: 1.0, armor: 0.35 } as const;

/** Deterministic burst: linear falloff, no RNG. Wrecks (strength 0) are ignored. */
export function applyBurst(impact: Vec3, stands: Stand[]): void {
  for (const stand of stands) {
    if (stand.strength <= 0) continue;
    const d = Math.hypot(stand.position.x - impact.x, stand.position.y - impact.y);
    if (d < LETHAL_RADIUS) {
      const damage = MAX_STRENGTH_DAMAGE * (1 - d / LETHAL_RADIUS) * KIND_MULTIPLIER[stand.kind];
      stand.strength = Math.max(0, stand.strength - damage);
    }
    if (d < SUPPRESS_RADIUS) {
      stand.suppression = Math.min(100, stand.suppression + MAX_SUPPRESSION * (1 - d / SUPPRESS_RADIUS));
    }
  }
}

export function decaySuppression(stands: Stand[], dtSeconds: number): void {
  for (const stand of stands) {
    stand.suppression = Math.max(0, stand.suppression - SUPPRESSION_DECAY_PER_SECOND * dtSeconds);
  }
}
