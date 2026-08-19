import { DEG_TO_RAD, type ProjectileState, type ShotParams } from "./types";

export function launchState(params: ShotParams): ProjectileState {
  const elevation = params.elevationDeg * DEG_TO_RAD;
  const azimuth = params.azimuthDeg * DEG_TO_RAD;
  const horizontal = params.muzzleSpeed * Math.cos(elevation);
  return {
    position: { x: 0, y: 0, z: 0 },
    velocity: {
      x: horizontal * Math.cos(azimuth),
      y: horizontal * Math.sin(azimuth),
      z: params.muzzleSpeed * Math.sin(elevation),
    },
    time: 0,
  };
}
