import { FIXED_DT, stepState } from "./integrator";
import { launchState } from "./shot";
import { FLAT_GROUND, type Environment, type GroundFn, type ShotParams, type Vec3 } from "./types";

export const MAX_FLIGHT_TIME = 120;

export type Trajectory = {
  points: Vec3[];
  impact: Vec3 | null;
  flightTime: number;
  truncated: boolean;
};

export type PredictOptions = { ground?: GroundFn; origin?: Vec3 };

export function predictPath(
  params: ShotParams,
  env: Environment,
  opts: PredictOptions = {},
): Trajectory {
  const ground = opts.ground ?? FLAT_GROUND;
  let state = launchState(params, opts.origin);
  const points: Vec3[] = [state.position];
  while (state.time < MAX_FLIGHT_TIME) {
    state = stepState(state, env, FIXED_DT);
    points.push(state.position);
    if (state.position.z <= ground(state.position.x, state.position.y)) {
      return { points, impact: state.position, flightTime: state.time, truncated: false };
    }
  }
  return { points, impact: null, flightTime: state.time, truncated: true };
}
