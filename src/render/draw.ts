export type Pt = { x: number; y: number };

export function drawGrid(ctx: CanvasRenderingContext2D, spacing: number, extent: number): void {
  ctx.save();
  ctx.strokeStyle = "rgba(140, 160, 190, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let v = -extent; v <= extent; v += spacing) {
    ctx.moveTo(v, -extent); ctx.lineTo(v, extent);
    ctx.moveTo(-extent, v); ctx.lineTo(extent, v);
  }
  ctx.stroke();
  // axes slightly brighter
  ctx.strokeStyle = "rgba(140, 160, 190, 0.35)";
  ctx.beginPath();
  ctx.moveTo(-extent, 0); ctx.lineTo(extent, 0);
  ctx.moveTo(0, -extent); ctx.lineTo(0, extent);
  ctx.stroke();
  ctx.restore();
}

export function drawPolyline(ctx: CanvasRenderingContext2D, pts: Pt[], color: string, dashed: boolean): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  if (dashed) ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.stroke();
  ctx.restore();
}

export function drawCircle(ctx: CanvasRenderingContext2D, p: Pt, radius: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawCross(ctx: CanvasRenderingContext2D, p: Pt, size: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x - size, p.y - size); ctx.lineTo(p.x + size, p.y + size);
  ctx.moveTo(p.x - size, p.y + size); ctx.lineTo(p.x + size, p.y - size);
  ctx.stroke();
  ctx.restore();
}
