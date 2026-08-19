import { DEG_TO_RAD, type Environment, type Vec3 } from "./types";

export function windVector(env: Environment): Vec3 {
  const direction = env.windDirectionDeg * DEG_TO_RAD;
  return {
    x: env.windSpeed * Math.cos(direction),
    y: env.windSpeed * Math.sin(direction),
    z: 0,
  };
}

/** Gravity plus quadratic drag on the air-relative velocity. */
export function acceleration(velocity: Vec3, env: Environment): Vec3 {
  const wind = windVector(env);
  const rel = { x: velocity.x - wind.x, y: velocity.y - wind.y, z: velocity.z };
  const airSpeed = Math.hypot(rel.x, rel.y, rel.z);
  const k = env.dragCoefficient;
  return {
    x: -k * airSpeed * rel.x,
    y: -k * airSpeed * rel.y,
    z: -env.gravity - k * airSpeed * rel.z,
  };
}
