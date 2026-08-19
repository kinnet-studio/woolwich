import { DEG_TO_RAD, type ProjectileState, type ShotParams, type Vec3 } from "./types";

export function launchState(
  params: ShotParams,
  origin: Vec3 = { x: 0, y: 0, z: 0 },
): ProjectileState {
  const elevation = params.elevationDeg * DEG_TO_RAD;
  const azimuth = params.azimuthDeg * DEG_TO_RAD;
  const horizontal = params.muzzleSpeed * Math.cos(elevation);
  return {
    position: { x: origin.x, y: origin.y, z: origin.z },
    velocity: {
      x: horizontal * Math.cos(azimuth),
      y: horizontal * Math.sin(azimuth),
      z: params.muzzleSpeed * Math.sin(elevation),
    },
    time: 0,
  };
}
