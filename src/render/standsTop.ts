import type { Vec3 } from "../physics/types";
import type { Stand } from "../world/stand";
import { SUPPRESS_RADIUS } from "../world/damage";

const HALF = 40; // meters; stand marker is an 80 m square

export function drawStandsTop(ctx: CanvasRenderingContext2D, stands: Stand[]): void {
  for (const stand of stands) {
    const { x, y } = stand.position;
    ctx.save();
    if (stand.strength <= 0) {
      ctx.strokeStyle = "#8a8a8a";
      ctx.lineWidth = 6;
      ctx.strokeRect(x - HALF, y - HALF, HALF * 2, HALF * 2);
    } else {
      if (stand.suppression > 0) {
        ctx.globalAlpha = Math.min(1, stand.suppression / 100);
        ctx.strokeStyle = "#f5d76e";
        ctx.lineWidth = 10;
        ctx.strokeRect(x - HALF - 14, y - HALF - 14, HALF * 2 + 28, HALF * 2 + 28);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = stand.kind === "armor" ? "#c23b3b" : "#e06a6a";
      ctx.fillRect(x - HALF, y - HALF, HALF * 2, HALF * 2);
    }
    ctx.restore();
  }
}

export function drawBattery(ctx: CanvasRenderingContext2D, position: Vec3): void {
  ctx.save();
  ctx.fillStyle = "#4a90d9";
  ctx.fillRect(position.x - HALF, position.y - HALF, HALF * 2, HALF * 2);
  ctx.restore();
}

const BURST_DURATION = 0.6; // seconds

export function drawBurstRing(ctx: CanvasRenderingContext2D, impact: Vec3, ageSeconds: number): void {
  const t = Math.min(1, ageSeconds / BURST_DURATION);
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = "#ff9d45";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(impact.x, impact.y, SUPPRESS_RADIUS * t, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
