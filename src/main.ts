import { Board } from "@ue-too/board";
import { predictPath, type Trajectory } from "./physics/predict";
import { renderSideView } from "./render/sideView";
import { renderTopView } from "./render/topView";
import { downrange, type Scene } from "./render/scene";
import { Simulation } from "./sim";
import { setupControls } from "./ui/controls";

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

let predicted: Trajectory | null = null;

const controls = setupControls(() => {
  sim.env = controls.environment();
  predicted = predictPath(controls.shotParams(), sim.env);
});

const sim = new Simulation(controls.environment());
predicted = predictPath(controls.shotParams(), sim.env);

controls.onFire(() => {
  sim.env = controls.environment();
  sim.fire(controls.shotParams());
});
controls.onPauseToggle(() => (sim.paused = !sim.paused));
controls.onSlowmoToggle(() => {
  sim.timeScale = sim.timeScale === 1 ? 0.25 : 1;
  return sim.timeScale !== 1;
});
controls.onStep(() => sim.stepFrame());

function readoutText(): string {
  if (!sim.state) return "ready — adjust sliders, then Fire";
  const { position, velocity, time } = sim.state;
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  const status = sim.impact ? "impact" : sim.paused ? "paused" : "in flight";
  return [
    `status: ${status}`,
    `t: ${time.toFixed(2)} s`,
    `speed: ${speed.toFixed(1)} m/s`,
    `altitude: ${Math.max(0, position.z).toFixed(1)} m`,
    `downrange: ${downrange(position).toFixed(1)} m`,
  ].join("\n");
}

let lastTimestamp: number | null = null;

function frame(timestamp: number) {
  const elapsed = lastTimestamp === null ? 0 : (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;
  sim.advance(Math.min(elapsed, 0.25)); // clamp huge tab-switch gaps

  const scene: Scene = {
    predicted,
    projectile: sim.state && !sim.impact ? sim.state.position : null,
    impact: sim.impact,
  };

  sideBoard.step(timestamp);
  if (sideBoard.context) renderSideView(sideBoard.context, scene);
  topBoard.step(timestamp);
  if (topBoard.context) renderTopView(topBoard.context, scene);

  controls.setReadouts(readoutText());
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
