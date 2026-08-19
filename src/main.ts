import { Board } from "@ue-too/board";
import { predictPath } from "./physics/predict";
import { renderSideView } from "./render/sideView";
import { renderTopView } from "./render/topView";
import type { Scene } from "./render/scene";

function setupBoard(canvasId: string): Board {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  const board = new Board(canvas);
  board.alignCoordinateSystem = false;
  board.camera.setPosition({ x: 400, y: 150 });
  board.camera.setZoomLevel(0.5);
  return board;
}

const sideBoard = setupBoard("side-view");
const topBoard = setupBoard("top-view");

// temporary demo scene; Task 8 replaces this with live controls + simulation
const demoScene: Scene = {
  predicted: predictPath(
    { elevationDeg: 45, azimuthDeg: 15, muzzleSpeed: 100 },
    { gravity: 9.81, dragCoefficient: 0.0003, windSpeed: 10, windDirectionDeg: 90 },
  ),
  projectile: null,
  impact: null,
};

function frame(timestamp: number) {
  sideBoard.step(timestamp);
  if (sideBoard.context) renderSideView(sideBoard.context, demoScene);
  topBoard.step(timestamp);
  if (topBoard.context) renderTopView(topBoard.context, demoScene);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
