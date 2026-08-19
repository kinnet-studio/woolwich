import type { Terrain } from "../terrain/terrain";

const BAND_METERS = 20;
const PX_PER_CELL = 4;

/** Offscreen hypsometric tint with contour strokes at 20 m band boundaries. Image row 0 = north edge (y = +extent). */
export function buildTerrainImage(terrain: Terrain): HTMLCanvasElement {
  const off = document.createElement("canvas");
  off.width = terrain.size * PX_PER_CELL;
  off.height = terrain.size * PX_PER_CELL;
  const ctx = off.getContext("2d")!;
  let min = Infinity;
  let max = -Infinity;
  for (const h of terrain.heights) {
    if (h < min) min = h;
    if (h > max) max = h;
  }
  const bandOf = (h: number) => Math.floor((h - min) / BAND_METERS);
  const bandCount = bandOf(max) + 1;
  const px = (ix: number) => ix * PX_PER_CELL;
  const py = (iy: number) => (terrain.size - 1 - iy) * PX_PER_CELL;

  for (let iy = 0; iy < terrain.size; iy++) {
    for (let ix = 0; ix < terrain.size; ix++) {
      const h = terrain.heights[iy * terrain.size + ix]!;
      const t = bandCount > 1 ? bandOf(h) / (bandCount - 1) : 0;
      // dark green lowlands → pale tan highlands
      const r = Math.round(52 + t * 130);
      const g = Math.round(84 + t * 90);
      const b = Math.round(52 + t * 60);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(px(ix), py(iy), PX_PER_CELL, PX_PER_CELL);
    }
  }
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  for (let iy = 0; iy < terrain.size; iy++) {
    for (let ix = 0; ix < terrain.size - 1; ix++) {
      if (bandOf(terrain.heights[iy * terrain.size + ix]!) !== bandOf(terrain.heights[iy * terrain.size + ix + 1]!)) {
        ctx.fillRect(px(ix + 1), py(iy), 1, PX_PER_CELL);
      }
    }
  }
  for (let iy = 0; iy < terrain.size - 1; iy++) {
    for (let ix = 0; ix < terrain.size; ix++) {
      if (bandOf(terrain.heights[iy * terrain.size + ix]!) !== bandOf(terrain.heights[(iy + 1) * terrain.size + ix]!)) {
        ctx.fillRect(px(ix), py(iy), PX_PER_CELL, 1);
      }
    }
  }
  return off;
}

/** Blit the pre-rendered image into world coordinates (call under the board's y-up transform). */
export function drawTerrainTop(ctx: CanvasRenderingContext2D, terrain: Terrain, image: HTMLCanvasElement): void {
  ctx.save();
  ctx.translate(-terrain.extent, terrain.extent);
  ctx.scale(1, -1);
  ctx.drawImage(image, 0, 0, terrain.extent * 2, terrain.extent * 2);
  ctx.restore();
}
