import type { Vec3 } from "../physics/types";
import { drawCircle, drawCross, drawGrid, drawPolyline } from "./draw";
import type { Scene } from "./scene";

const PREDICTED = "rgba(120, 190, 255, 0.7)";
const PROJECTILE = "#ffb347";
const IMPACT = "#e05555";
const LAUNCHER = "#9ad17b";

function project(p: Vec3): { x: number; y: number } {
  return { x: p.x, y: p.y };
}

export function renderTopView(ctx: CanvasRenderingContext2D, scene: Scene): void {
  drawGrid(ctx, 100, 5000);
  drawCircle(ctx, { x: 0, y: 0 }, 6, LAUNCHER);
  if (scene.predicted) drawPolyline(ctx, scene.predicted.points.map(project), PREDICTED, true);
  if (scene.impact) drawCross(ctx, project(scene.impact), 10, IMPACT);
  if (scene.projectile) drawCircle(ctx, project(scene.projectile), 5, PROJECTILE);
}
