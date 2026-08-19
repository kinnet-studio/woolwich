import { FIXED_DT, stepState } from "./integrator";
import { launchState } from "./shot";
import type { Environment, ShotParams, Vec3 } from "./types";

export const MAX_FLIGHT_TIME = 120;

export type Trajectory = {
  points: Vec3[];
  impact: Vec3 | null;
  flightTime: number;
  truncated: boolean;
};

export function predictPath(params: ShotParams, env: Environment): Trajectory {
  let state = launchState(params);
  const points: Vec3[] = [state.position];
  while (state.time < MAX_FLIGHT_TIME) {
    state = stepState(state, env, FIXED_DT);
    points.push(state.position);
    if (state.position.z <= 0 && state.velocity.z < 0) {
      return { points, impact: state.position, flightTime: state.time, truncated: false };
    }
  }
  return { points, impact: null, flightTime: state.time, truncated: true };
}
