import { Board } from "@ue-too/board";
import type { Axial } from "../hex/coords";
import { hexWidth, worldToHex } from "../hex/layout";
import { distance } from "../hex/ops";
import { buildMapLayers, renderHexMap, type MapLayers } from "../render/hexMap";
import { generateWorld } from "./generate";
import { describeHex, setupMapPanel } from "./panel";
import { countByOwner, frontLength } from "./queries";
import { hexAt, worldBounds, type HexWorld } from "./world";

const canvas = document.getElementById("map") as HTMLCanvasElement;
const board = new Board(canvas);
board.alignCoordinateSystem = false;
board.camera.setMinZoomLevel(0.2);
board.camera.setMaxZoomLevel(20);

const panel = setupMapPanel();

let world: HexWorld = generateWorld(panel.seed());
let layers: MapLayers = buildMapLayers(world);
let hover: Axial | null = null;
let selected: Axial | null = null;

/** Center the camera on the map and zoom so the whole map fits with a 5% margin. */
function fitCamera(): void {
  const b = worldBounds(world);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  const zoom = Math.min(w / (b.maxX - b.minX), h / (b.maxY - b.minY)) * 0.95;
  board.camera.setPosition({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
  board.camera.setZoomLevel(zoom);
}
fitCamera();

/** Pointer position (CSS px) → world km. Camera rotation is unused in this app (0). */
function pointerToWorld(ev: MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const cx = ev.clientX - rect.left - rect.width / 2;
  const cy = ev.clientY - rect.top - rect.height / 2;
  const cam = board.camera;
  return { x: cam.position.x + cx / cam.zoomLevel, y: cam.position.y - cy / cam.zoomLevel };
}

function hexUnderPointer(ev: MouseEvent): Axial | null {
  const h = worldToHex(pointerToWorld(ev), world.layout);
  return hexAt(world, h) >= 0 ? h : null;
}

let downAt: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", (ev) => { downAt = { x: ev.clientX, y: ev.clientY }; });
canvas.addEventListener("pointermove", (ev) => { hover = hexUnderPointer(ev); });
canvas.addEventListener("pointerleave", () => { hover = null; });
canvas.addEventListener("click", (ev) => {
  // a click that ends a pan must not change the selection
  if (downAt && Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) > 4) return;
  selected = hexUnderPointer(ev);
});

panel.onRegenerate((seed) => {
  world = generateWorld(seed);
  layers = buildMapLayers(world);
  hover = null;
  selected = null;
  fitCamera();
});

function updatePanel(): void {
  const shown = hover ?? selected;
  let text = shown ? describeHex(world, hexAt(world, shown)) : "hover a hex";
  if (hover && selected) {
    const d = distance(selected, hover);
    text += `\nrange from selection: ${d} hex (${Math.round(d * hexWidth(world.layout))} km)`;
  }
  panel.setInfo(text);
  const [neutral, a, b] = countByOwner(world);
  let tally = `Bloc A ${a} · Bloc B ${b} · neutral ${neutral} land hexes\nfrontline: ${frontLength(world)} edges`;
  if (world.degenerate) tally += "\n⚠ degenerate world — column-split fallback";
  panel.setTally(tally);
}

function frame(timestamp: number): void {
  board.step(timestamp);
  const ctx = board.context;
  if (ctx) renderHexMap(ctx, world, layers, hover, selected, board.camera.zoomLevel);
  updatePanel();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
