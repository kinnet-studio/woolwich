import type { Axial } from "../hex/coords";
import { hexCorners, hexToWorld, type Pt } from "../hex/layout";
import { frontlineEdges, type FrontierEdge } from "../strategic/queries";
import { Owner, axialOf, worldBounds, type HexWorld } from "../strategic/world";

export const PX_PER_KM = 2;

export type LayerFrame = { minX: number; minY: number; width: number; height: number; pxPerKm: number };
/** An offscreen image plus its world-space placement. canvas is null when there is no DOM. */
export type Layer = LayerFrame & { canvas: HTMLCanvasElement | null };

const TERRAIN_RGB: readonly [number, number, number][] = [
  [38, 62, 92],    // ocean
  [116, 150, 82],  // plains
  [62, 106, 58],   // forest
  [150, 132, 92],  // hills
  [170, 166, 160], // mountains
];
const OWNER_TINT: readonly string[] = ["", "rgba(220, 80, 70, 0.35)", "rgba(70, 120, 220, 0.35)"];
const OWNER_STROKE: readonly string[] = ["", "#e0574a", "#4a7ae0"];
const FRONT = "#f5f0e6";
const BORDER = "rgba(245, 240, 230, 0.55)";
const HOVER = "#ffd166";
const SELECTED = "#ffffff";

export function layerFrame(world: HexWorld): LayerFrame {
  const b = worldBounds(world);
  return { minX: b.minX, minY: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY, pxPerKm: PX_PER_KM };
}

/** World km → layer pixel; pixel y grows southward (image row 0 is the north edge). */
export function toLayerPx(frame: LayerFrame, p: Pt): Pt {
  return { x: (p.x - frame.minX) * frame.pxPerKm, y: (frame.minY + frame.height - p.y) * frame.pxPerKm };
}

function createLayerCanvas(frame: LayerFrame): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(frame.width * frame.pxPerKm);
  canvas.height = Math.ceil(frame.height * frame.pxPerKm);
  const ctx = canvas.getContext("2d");
  return ctx ? { canvas, ctx } : null;
}

function hexPathPx(ctx: CanvasRenderingContext2D, frame: LayerFrame, corners: Pt[]): void {
  ctx.beginPath();
  for (let i = 0; i < corners.length; i++) {
    const p = toLayerPx(frame, corners[i]!);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

function terrainColor(terrain: number, elevation: number): string {
  const [r, g, b] = TERRAIN_RGB[terrain] ?? TERRAIN_RGB[0]!;
  const k = 1 + 0.15 * elevation; // up to 15% lighter with elevation
  return `rgb(${Math.min(255, Math.round(r * k))}, ${Math.min(255, Math.round(g * k))}, ${Math.min(255, Math.round(b * k))})`;
}

function paintHexes(world: HexWorld, colorOf: (i: number) => string | null): Layer {
  const frame = layerFrame(world);
  const made = createLayerCanvas(frame);
  if (!made) return { ...frame, canvas: null };
  const { canvas, ctx } = made;
  ctx.lineWidth = 1; // stroking in the fill color hides antialiasing seams between hexes
  for (let i = 0; i < world.terrain.length; i++) {
    const color = colorOf(i);
    if (!color) continue;
    hexPathPx(ctx, frame, hexCorners(axialOf(world, i), world.layout));
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.fill();
    ctx.stroke();
  }
  return { ...frame, canvas };
}

/** Terrain fills, baked once per generation. */
export function buildTerrainLayer(world: HexWorld): Layer {
  return paintHexes(world, (i) => terrainColor(world.terrain[i]!, world.elevation[i]!));
}

/** Translucent bloc tints; neutral hexes are left clear. Rebuild whenever ownership changes. */
export function buildOwnerLayer(world: HexWorld): Layer {
  return paintHexes(world, (i) => (world.owner[i] === Owner.Neutral ? null : OWNER_TINT[world.owner[i]!]!));
}

/** One drawImage in world coordinates. The board's proxied context (alignCoordinateSystem = false)
 * y-flips drawImage itself: passing minY as dy puts image row 0 (north) at world maxY. */
export function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer): void {
  if (!layer.canvas) return;
  ctx.drawImage(layer.canvas, layer.minX, layer.minY, layer.width, layer.height);
}

function strokeEdges(ctx: CanvasRenderingContext2D, world: HexWorld, edges: FrontierEdge[], kind: FrontierEdge["kind"]): void {
  ctx.beginPath();
  for (const e of edges) {
    if (e.kind !== kind) continue;
    const corners = hexCorners(axialOf(world, e.index), world.layout);
    const a = corners[e.dir]!;
    const b = corners[(e.dir + 1) % 6]!;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

/** Front edges thick and solid, bloc/neutral borders thin and dashed. Widths in screen px. */
export function drawFrontline(ctx: CanvasRenderingContext2D, world: HexWorld, edges: FrontierEdge[], zoom: number): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([6 / zoom, 4 / zoom]);
  strokeEdges(ctx, world, edges, "border");
  ctx.setLineDash([]);
  ctx.strokeStyle = FRONT;
  ctx.lineWidth = 3 / zoom;
  strokeEdges(ctx, world, edges, "front");
  ctx.restore();
}

export function drawCapitals(ctx: CanvasRenderingContext2D, world: HexWorld, zoom: number): void {
  ctx.save();
  ctx.lineWidth = 3 / zoom;
  world.capitals.forEach((h, i) => {
    const c = hexToWorld(h, world.layout);
    ctx.strokeStyle = OWNER_STROKE[i + 1]!;
    ctx.fillStyle = OWNER_STROKE[i + 1]!;
    ctx.beginPath();
    ctx.arc(c.x, c.y, world.layout.size * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c.x, c.y, world.layout.size * 0.18, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

export function drawHexOutline(ctx: CanvasRenderingContext2D, world: HexWorld, h: Axial, color: string, widthPx: number, zoom: number): void {
  const corners = hexCorners(h, world.layout);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx / zoom;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(corners[0]!.x, corners[0]!.y);
  for (let i = 1; i < 6; i++) ctx.lineTo(corners[i]!.x, corners[i]!.y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

export type MapLayers = { terrain: Layer; owner: Layer; edges: FrontierEdge[] };

export function buildMapLayers(world: HexWorld): MapLayers {
  return { terrain: buildTerrainLayer(world), owner: buildOwnerLayer(world), edges: frontlineEdges(world) };
}

/** The page's single render entry point. `zoom` is the board camera zoom (screen px per km). */
export function renderHexMap(
  ctx: CanvasRenderingContext2D,
  world: HexWorld,
  layers: MapLayers,
  hover: Axial | null,
  selected: Axial | null,
  zoom: number,
): void {
  drawLayer(ctx, layers.terrain);
  drawLayer(ctx, layers.owner);
  drawFrontline(ctx, world, layers.edges, zoom);
  drawCapitals(ctx, world, zoom);
  if (selected) drawHexOutline(ctx, world, selected, SELECTED, 3, zoom);
  if (hover) drawHexOutline(ctx, world, hover, HOVER, 2, zoom);
}
