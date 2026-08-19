import { predictPath, type Trajectory } from "../physics/predict";
import { FLAT_GROUND, type Environment, type GroundFn, type ShotParams, type Vec3 } from "../physics/types";

export type FireMission = {
  target: { x: number; y: number };
  muzzleSpeed: number;
  env: Environment;
  ground?: GroundFn;
  origin?: Vec3;
  /** trajectory family: "high" (default, howitzer arc) or "low" (flat, fast, maskable) */
  arc?: "high" | "low";
};

export type FireSolution =
  | { ok: true; params: ShotParams; predicted: Trajectory }
  | {
      ok: false;
      /** out-of-range: beyond even the vacuum envelope; unreachable: drag/wind cap the
       * real range short of the target; masked: terrain above the target blocks the arc. */
      reason: "out-of-range" | "unreachable" | "masked";
      predicted?: Trajectory;
      /** how far short the best effort lands, for "unreachable" */
      shortfallMeters?: number;
    };

const TOLERANCE = 25; // meters, horizontal miss distance
const MAX_ITERATIONS = 25;
const MAX_STEP_DEG = 10;
const RAD_TO_DEG = 180 / Math.PI;
/** impact terrain this far above the target's elevation reads as a masking ridge */
const MASK_ELEVATION_MARGIN = 25;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function classifyNonConvergence(
  predicted: Trajectory | undefined,
  mission: { targetElevation: number; range: number; origin: Vec3 },
): FireSolution {
  const impact = predicted?.impact ?? null;
  if (impact && impact.z > mission.targetElevation + MASK_ELEVATION_MARGIN) {
    return { ok: false, reason: "masked", predicted };
  }
  const along = impact ? Math.hypot(impact.x - mission.origin.x, impact.y - mission.origin.y) : 0;
  return { ok: false, reason: "unreachable", predicted, shortfallMeters: Math.max(0, mission.range - along) };
}

export function solveFireMission(mission: FireMission): FireSolution {
  const arc = mission.arc ?? "high";
  const ground = mission.ground ?? FLAT_GROUND;
  const origin = mission.origin ?? { x: 0, y: 0, z: 0 };
  const { target, muzzleSpeed, env } = mission;
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const range = Math.hypot(dx, dy);
  const targetElevation = ground(target.x, target.y);
  const dh = targetElevation - origin.z;

  // vacuum high-arc initial guess with height difference:
  // tanθ = (v² + √(v⁴ − g(gR² + 2Δh·v²))) / (gR)
  const v2 = muzzleSpeed * muzzleSpeed;
  const g = env.gravity;
  const disc = v2 * v2 - g * (g * range * range + 2 * dh * v2);
  if (g <= 0 || range === 0 || disc < 0) {
    return { ok: false, reason: "out-of-range" };
  }
  let elevationDeg = Math.atan2(v2 + (arc === "high" ? 1 : -1) * Math.sqrt(disc), g * range) * RAD_TO_DEG;
  let azimuthDeg = Math.atan2(dy, dx) * RAD_TO_DEG;
  const targetBearing = Math.atan2(dy, dx);

  let prev: { elevationDeg: number; along: number } | null = null;
  let best: { trajectory: Trajectory; miss: number } | null = null;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const params: ShotParams = { elevationDeg, azimuthDeg, muzzleSpeed };
    const trajectory = predictPath(params, env, { ground, origin });
    if (!trajectory.impact) {
      return classifyNonConvergence(best?.trajectory ?? trajectory, { targetElevation, range, origin });
    }
    const ix = trajectory.impact.x - origin.x;
    const iy = trajectory.impact.y - origin.y;
    const miss = Math.hypot(trajectory.impact.x - target.x, trajectory.impact.y - target.y);
    if (best === null || miss < best.miss) best = { trajectory, miss };
    if (miss <= TOLERANCE) {
      return { ok: true, params, predicted: trajectory };
    }
    // azimuth: rotate by the bearing error between target and impact (as seen from the origin)
    const bearingErr = (targetBearing - Math.atan2(iy, ix)) * RAD_TO_DEG;
    azimuthDeg += clamp(bearingErr, -MAX_STEP_DEG, MAX_STEP_DEG);
    // elevation: secant step on the along-bearing distance
    // (high arc: raising elevation shortens range; low arc: it lengthens it)
    const along = Math.hypot(ix, iy);
    let step: number;
    if (prev === null || Math.abs(along - prev.along) < 1e-6) {
      step = (along < range ? -2 : 2) * (arc === "high" ? 1 : -1);
    } else {
      step = ((range - along) * (elevationDeg - prev.elevationDeg)) / (along - prev.along);
    }
    prev = { elevationDeg, along };
    elevationDeg = clamp(elevationDeg + clamp(step, -MAX_STEP_DEG, MAX_STEP_DEG), 1, 89);
  }
  return classifyNonConvergence(best?.trajectory, { targetElevation, range, origin });
}
