import { Board } from "@ue-too/board";
import { drawProfile, sampleProfile } from "../render/terrainProfile";
import { buildTerrainImage, drawTerrainTop } from "../render/terrainTop";
import { drawBattery, drawStandsTop } from "../render/standsTop";
import { createWorld, type WorldState } from "../world/world";

function setupBoard(canvasId: string, camX: number, camY: number, zoom: number): Board {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  const board = new Board(canvas);
  board.alignCoordinateSystem = false;
  board.camera.setPosition({ x: camX, y: camY });
  board.camera.setZoomLevel(zoom);
  return board;
}

const topBoard = setupBoard("g-top", 1600, 0, 0.14);
const sideBoard = setupBoard("g-side", 1600, 300, 0.14);

let world: WorldState = createWorld(1);
let terrainImage = buildTerrainImage(world.terrain);
let bearingDeg = 0;

const seedInput = document.getElementById("seed") as HTMLInputElement;
document.getElementById("regen")!.addEventListener("click", () => {
  world = createWorld(Number(seedInput.value) || 1);
  terrainImage = buildTerrainImage(world.terrain);
});

function frame(timestamp: number) {
  topBoard.step(timestamp);
  const top = topBoard.context;
  if (top) {
    drawTerrainTop(top, world.terrain, terrainImage);
    drawBattery(top, world.battery.position);
    drawStandsTop(top, world.stands);
  }
  sideBoard.step(timestamp);
  const side = sideBoard.context;
  if (side) {
    const profile = sampleProfile(world.terrain, world.battery.position, bearingDeg, 8500);
    drawProfile(side, profile, -150);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
