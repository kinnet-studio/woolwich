import { describe, expect, test } from "bun:test";
import { FIXED_DT } from "../src/physics/integrator";
import { predictPath } from "../src/physics/predict";
import type { Environment } from "../src/physics/types";
import { Simulation } from "../src/sim";

const ENV: Environment = { gravity: 9.81, dragCoefficient: 0.0005, windSpeed: 10, windDirectionDeg: 45 };
const SHOT = { elevationDeg: 50, azimuthDeg: 10, muzzleSpeed: 90 };

describe("Simulation", () => {
  test("live flight lands exactly where predictPath says, regardless of frame chunking", () => {
    const predicted = predictPath(SHOT, ENV);
    const sim = new Simulation({ ...ENV });
    sim.fire(SHOT);
    // advance in ragged, non-multiple-of-dt chunks until impact
    const chunks = [0.013, 0.021, 0.007, 0.033];
    let i = 0;
    while (!sim.impact && sim.state!.time < 200) {
      sim.advance(chunks[i % chunks.length]!);
      i++;
    }
    expect(sim.impact).not.toBeNull();
    expect(sim.impact!.x).toBeCloseTo(predicted.impact!.x, 6);
    expect(sim.impact!.y).toBeCloseTo(predicted.impact!.y, 6);
    expect(sim.state!.time).toBeCloseTo(predicted.flightTime, 6);
  });

  test("advance is a no-op before fire and while paused", () => {
    const sim = new Simulation({ ...ENV });
    sim.advance(1);
    expect(sim.state).toBeNull();
    sim.fire(SHOT);
    sim.paused = true;
    sim.advance(1);
    expect(sim.state!.time).toBe(0);
  });

  test("stepFrame advances exactly one fixed step, even while paused", () => {
    const sim = new Simulation({ ...ENV });
    sim.fire(SHOT);
    sim.paused = true;
    sim.stepFrame();
    expect(sim.state!.time).toBeCloseTo(FIXED_DT, 12);
  });

  test("timeScale slows integration proportionally", () => {
    // slow-mo advancing 1 s of wall time equals realtime advancing 0.25 s:
    // both feed 0.25 s into the same accumulator, so step counts match exactly
    const slow = new Simulation({ ...ENV });
    slow.fire(SHOT);
    slow.timeScale = 0.25;
    slow.advance(1);
    const realtime = new Simulation({ ...ENV });
    realtime.fire(SHOT);
    realtime.advance(0.25);
    expect(slow.state!.time).toBe(realtime.state!.time);
    expect(slow.state!.time).toBeGreaterThan(0.2);
  });

  test("firing again clears the previous impact and restarts time", () => {
    const sim = new Simulation({ gravity: 9.81, dragCoefficient: 0, windSpeed: 0, windDirectionDeg: 0 });
    sim.fire({ elevationDeg: 45, azimuthDeg: 0, muzzleSpeed: 10 });
    while (!sim.impact) sim.advance(0.1);
    sim.fire(SHOT);
    expect(sim.impact).toBeNull();
    expect(sim.state!.time).toBe(0);
  });
});
