import { Board } from "@ue-too/board";

function setupBoard(canvasId: string): Board {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  const board = new Board(canvas);
  board.alignCoordinateSystem = false; // world +y is up on screen
  board.camera.setPosition({ x: 400, y: 150 });
  board.camera.setZoomLevel(0.5);
  return board;
}

const sideBoard = setupBoard("side-view");
const topBoard = setupBoard("top-view");

function frame(timestamp: number) {
  for (const board of [sideBoard, topBoard]) {
    board.step(timestamp);
    const ctx = board.context;
    if (!ctx) continue;
    // temporary smoke test: axes cross at the origin
    ctx.strokeStyle = "#4a90d9";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-100, 0); ctx.lineTo(100, 0);
    ctx.moveTo(0, -100); ctx.lineTo(0, 100);
    ctx.stroke();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
