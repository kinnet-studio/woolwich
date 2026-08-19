import { acceleration } from "./forces";
import type { Environment, ProjectileState } from "./types";

export const FIXED_DT = 1 / 120;

/** Semi-implicit Euler: v += a·dt, then x += v·dt. */
export function stepState(state: ProjectileState, env: Environment, dt: number): ProjectileState {
  const a = acceleration(state.velocity, env);
  const velocity = {
    x: state.velocity.x + a.x * dt,
    y: state.velocity.y + a.y * dt,
    z: state.velocity.z + a.z * dt,
  };
  const position = {
    x: state.position.x + velocity.x * dt,
    y: state.position.y + velocity.y * dt,
    z: state.position.z + velocity.z * dt,
  };
  return { position, velocity, time: state.time + dt };
}
