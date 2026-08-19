import { DEG_TO_RAD, type Vec3 } from "../physics/types";
import { sampleTerrain, type Terrain } from "../terrain/terrain";

export type ProfilePoint = { s: number; z: number };

/** Terrain elevations along a bearing from an origin, at fixed s spacing. */
export function sampleProfile(
  terrain: Terrain,
  origin: Vec3,
  bearingDeg: number,
  maxS: number,
  step = 25,
): ProfilePoint[] {
  const rad = bearingDeg * DEG_TO_RAD;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const points: ProfilePoint[] = [];
  for (let s = 0; s <= maxS; s += step) {
    points.push({ s, z: sampleTerrain(terrain, origin.x + cos * s, origin.y + sin * s) });
  }
  return points;
}

export function drawProfile(ctx: CanvasRenderingContext2D, profile: ProfilePoint[], floorZ: number): void {
  if (profile.length < 2) return;
  ctx.save();
  ctx.fillStyle = "rgba(96, 116, 96, 0.55)";
  ctx.beginPath();
  ctx.moveTo(profile[0]!.s, floorZ);
  for (const p of profile) ctx.lineTo(p.s, p.z);
  ctx.lineTo(profile[profile.length - 1]!.s, floorZ);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
