import { Board } from "@ue-too/board";
import { DEG_TO_RAD, type Vec3 } from "../physics/types";
import { drawCircle, drawCross, drawPolyline } from "../render/draw";
import { drawBattery, drawBurstRing, drawStandsTop, BURST_DURATION } from "../render/standsTop";
import { drawProfile, profileExtent, sampleProfile, type ProfilePoint } from "../render/terrainProfile";
import { buildTerrainImage, drawTerrainTop } from "../render/terrainTop";
import { Simulation } from "../sim";
import { predictPath } from "../physics/predict";
import { solveFireMission, type FireSolution } from "../solver/fireSolution";
import { applyBurst, decaySuppression } from "../world/damage";
import { createWorld, type WorldState } from "../world/world";
import { createFireControlStateMachine, type FireControlContext } from "./fireControl";
import { setupAdvancedPanel } from "./panel";

const PREDICTED = "rgba(120, 190, 255, 0.7)";
const SHELL = "#ffb347";
const IMPACT = "#e05555";

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
const topCanvas = document.getElementById("g-top") as HTMLCanvasElement;
const missionEl = document.getElementById("mission")!;
const tallyEl = document.getElementById("tally")!;
const seedInput = document.getElementById("seed") as HTMLInputElement;

// `machine` is declared after `panel`; the callback only fires on user input,
// long after module evaluation, so the reference is safe.
const panel = setupAdvancedPanel(() => machine.happens("envChanged"));

let world: WorldState = createWorld(1);
let terrainImage = buildTerrainImage(world.terrain);
let solution: FireSolution | null = null;
let bearingDeg = 0;
let profile: ProfilePoint[] = sampleProfile(world.terrain, world.battery.position, bearingDeg, profileExtent(world.battery.position, bearingDeg, world.terrain.extent));
let sim = new Simulation(panel.environment(), world.ground);
let bursts: { impact: Vec3; age: number }[] = [];

let lastTarget: { x: number; y: number } | null = null;

function successReadout(mode: string, target: { x: number; y: number }): string {
  if (!solution?.ok) return "";
  return [
    `mode: ${mode}`,
    `bearing: ${bearingDeg.toFixed(1)}°`,
    `elevation: ${solution.params.elevationDeg.toFixed(2)}°`,
    `muzzle: ${world.battery.muzzleSpeed} m/s`,
    `time of flight: ${solution.predicted.flightTime.toFixed(1)} s`,
    `miss: ${Math.hypot(solution.predicted.impact!.x - target.x, solution.predicted.impact!.y - target.y).toFixed(0)} m`,
  ].join("\n");
}

function runSolve(target: { x: number; y: number }): void {
  lastTarget = target;
  world.battery.muzzleSpeed = panel.muzzleSpeed();
  bearingDeg = Math.atan2(target.y - world.battery.position.y, target.x - world.battery.position.x) / DEG_TO_RAD;
  profile = sampleProfile(world.terrain, world.battery.position, bearingDeg, profileExtent(world.battery.position, bearingDeg, world.terrain.extent));
  const mode = panel.fireMode();
  if (mode === "manual") {
    const params = {
      elevationDeg: panel.manualElevationDeg(),
      azimuthDeg: bearingDeg,
      muzzleSpeed: world.battery.muzzleSpeed,
    };
    const predicted = predictPath(params, panel.environment(), { ground: world.ground, origin: world.battery.position });
    if (predicted.impact) {
      solution = { ok: true, params, predicted };
      missionEl.textContent = successReadout("manual", target);
    } else {
      solution = null;
      missionEl.textContent = "NO IMPACT within the time cap — adjust elevation";
    }
    return;
  }
  solution = solveFireMission({
    target,
    muzzleSpeed: world.battery.muzzleSpeed,
    env: panel.environment(),
    ground: world.ground,
    origin: world.battery.position,
    arc: mode,
  });
  missionEl.textContent = solution.ok
    ? successReadout(`${mode} arc`, target)
    : solution.reason === "out-of-range"
      ? "OUT OF RANGE"
      : solution.reason === "masked"
        ? "NO SOLUTION — masked by terrain (see side view)"
        : `BEYOND EFFECTIVE RANGE — best effort lands ${Math.round(solution.shortfallMeters ?? 0)} m short`;
}

const context: FireControlContext = {
  setup: () => {},
  cleanup: () => {},
  solve: runSolve,
  hasValidSolution: () => solution?.ok === true,
  launch: () => {
    if (!solution?.ok) return;
    sim.env = panel.environment();
    sim.fire(solution.params, world.battery.position);
  },
  invalidateSolution: () => {
    if (lastTarget) {
      runSolve(lastTarget);
      return;
    }
    solution = null;
    missionEl.textContent = "click the map to plot a fire mission";
  },
  applyEnvironment: () => {
    sim.env = panel.environment();
  },
  handleImpact: () => {
    if (!sim.impact) return;
    applyBurst(sim.impact, world.stands);
    bursts.push({ impact: sim.impact, age: 0 });
  },
  resetWorld: (seed) => {
    lastTarget = null;
    world = createWorld(seed);
    terrainImage = buildTerrainImage(world.terrain);
    sim = new Simulation(panel.environment(), world.ground);
    solution = null;
    bursts = [];
    profile = sampleProfile(world.terrain, world.battery.position, bearingDeg, profileExtent(world.battery.position, bearingDeg, world.terrain.extent));
    missionEl.textContent = "click the map to plot a fire mission";
  },
};

const machine = createFireControlStateMachine(context);

/** Click position (CSS px) → world coordinates. Camera rotation is unused in this app (0). */
function clickToWorld(ev: MouseEvent): { x: number; y: number } {
  const rect = topCanvas.getBoundingClientRect();
  const cx = ev.clientX - rect.left - rect.width / 2;
  const cy = ev.clientY - rect.top - rect.height / 2;
  const cam = topBoard.camera;
  return { x: cam.position.x + cx / cam.zoomLevel, y: cam.position.y - cy / cam.zoomLevel };
}

topCanvas.addEventListener("click", (ev) => machine.happens("mapClick", clickToWorld(ev)));
const fireButton = document.getElementById("g-fire") as HTMLButtonElement;
fireButton.addEventListener("click", () => machine.happens("fire"));
document.getElementById("regen")!.addEventListener("click", () =>
  machine.happens("regenerate", { seed: Number(seedInput.value) || 1 }),
);

/** Project a world point into side-view coordinates: distance along the fire bearing vs altitude. */
function toSide(p: Vec3): { x: number; y: number } {
  const rad = bearingDeg * DEG_TO_RAD;
  const s = (p.x - world.battery.position.x) * Math.cos(rad) + (p.y - world.battery.position.y) * Math.sin(rad);
  return { x: s, y: p.z };
}

function project(p: Vec3): { x: number; y: number } {
  return { x: p.x, y: p.y };
}

let lastTimestamp: number | null = null;

function frame(timestamp: number) {
  const elapsed = lastTimestamp === null ? 0 : Math.min((timestamp - lastTimestamp) / 1000, 0.25);
  lastTimestamp = timestamp;
  sim.advance(elapsed);
  decaySuppression(world.stands, elapsed);
  for (const b of bursts) b.age += elapsed;
  bursts = bursts.filter((b) => b.age < BURST_DURATION);

  // the machine is the impact latch: only IN_FLIGHT handles the event, and
  // handling it transitions to READY, so the burst applies exactly once
  if (machine.currentState === "IN_FLIGHT" && sim.impact) {
    machine.happens("impact");
  }

  const predicted = solution ? (solution.ok ? solution.predicted : solution.predicted ?? null) : null;

  topBoard.step(timestamp);
  const top = topBoard.context;
  if (top) {
    drawTerrainTop(top, world.terrain, terrainImage);
    drawBattery(top, world.battery.position);
    drawStandsTop(top, world.stands);
    if (predicted) drawPolyline(top, predicted.points.map(project), PREDICTED, true);
    if (predicted?.impact) drawCross(top, project(predicted.impact), 40, IMPACT);
    if (sim.state && !sim.impact) drawCircle(top, project(sim.state.position), 25, SHELL);
    for (const b of bursts) drawBurstRing(top, b.impact, b.age);
  }

  sideBoard.step(timestamp);
  const side = sideBoard.context;
  if (side) {
    drawProfile(side, profile, -150);
    if (predicted) drawPolyline(side, predicted.points.map(toSide), PREDICTED, true);
    if (sim.state && !sim.impact) drawCircle(side, toSide(sim.state.position), 25, SHELL);
  }

  const destroyed = world.stands.filter((s) => s.strength <= 0).length;
  tallyEl.textContent = `destroyed: ${destroyed} / ${world.stands.length}`;
  const inFlight = machine.currentState === "IN_FLIGHT";
  fireButton.disabled = inFlight;
  fireButton.textContent = inFlight ? "In flight…" : "Fire";
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
