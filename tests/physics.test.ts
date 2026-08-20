import { describe, expect, test } from "bun:test";
import { launchState } from "../src/physics/shot";

describe("launchState", () => {
  test("45° elevation due east splits speed between x and z", () => {
    const s = launchState({ elevationDeg: 45, azimuthDeg: 0, muzzleSpeed: 100 });
    expect(s.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(s.time).toBe(0);
    expect(s.velocity.x).toBeCloseTo(100 * Math.SQRT1_2, 6);
    expect(s.velocity.y).toBeCloseTo(0, 6);
    expect(s.velocity.z).toBeCloseTo(100 * Math.SQRT1_2, 6);
  });

  test("azimuth 90° points north", () => {
    const s = launchState({ elevationDeg: 0, azimuthDeg: 90, muzzleSpeed: 50 });
    expect(s.velocity.x).toBeCloseTo(0, 6);
    expect(s.velocity.y).toBeCloseTo(50, 6);
    expect(s.velocity.z).toBeCloseTo(0, 6);
  });

  test("90° elevation is straight up", () => {
    const s = launchState({ elevationDeg: 90, azimuthDeg: 30, muzzleSpeed: 80 });
    expect(s.velocity.x).toBeCloseTo(0, 6);
    expect(s.velocity.y).toBeCloseTo(0, 6);
    expect(s.velocity.z).toBeCloseTo(80, 6);
  });
});

import { acceleration, windVector } from "../src/physics/forces";
import type { Environment } from "../src/physics/types";

const CALM: Environment = { gravity: 9.81, dragCoefficient: 0, windSpeed: 0, windDirectionDeg: 0 };

describe("forces", () => {
  test("windVector converts speed+direction to a horizontal vector", () => {
    const w = windVector({ ...CALM, windSpeed: 10, windDirectionDeg: 90 });
    expect(w.x).toBeCloseTo(0, 6);
    expect(w.y).toBeCloseTo(10, 6);
    expect(w.z).toBe(0);
  });

  test("with zero drag, acceleration is pure gravity", () => {
    const a = acceleration({ x: 40, y: 5, z: 30 }, CALM);
    expect(a.x).toBeCloseTo(0, 12);
    expect(a.y).toBeCloseTo(0, 12);
    expect(a.z).toBeCloseTo(-9.81, 12);
  });

  test("drag opposes air-relative velocity, quadratically", () => {
    const env: Environment = { ...CALM, dragCoefficient: 0.01 };
    const a = acceleration({ x: 50, y: 0, z: 0 }, env);
    // |v_air| = 50, a_x = -0.01 * 50 * 50 = -25
    expect(a.x).toBeCloseTo(-25, 6);
    expect(a.y).toBeCloseTo(0, 6);
    expect(a.z).toBeCloseTo(-9.81, 6);
  });

  test("a tailwind matching projectile velocity produces zero drag", () => {
    const env: Environment = { ...CALM, dragCoefficient: 0.01, windSpeed: 50, windDirectionDeg: 0 };
    const a = acceleration({ x: 50, y: 0, z: 0 }, env);
    expect(a.x).toBeCloseTo(0, 6);
    expect(a.z).toBeCloseTo(-9.81, 6);
  });
});

import { FIXED_DT, stepState } from "../src/physics/integrator";

describe("stepState", () => {
  test("semi-implicit Euler: velocity updates first, then position uses new velocity", () => {
    const s0 = { position: { x: 0, y: 0, z: 100 }, velocity: { x: 10, y: 0, z: 0 }, time: 0 };
    const s1 = stepState(s0, CALM, 0.5);
    // vz' = 0 - 9.81*0.5 = -4.905 ; z' = 100 + (-4.905)*0.5 = 97.5475
    expect(s1.velocity.z).toBeCloseTo(-4.905, 6);
    expect(s1.position.z).toBeCloseTo(97.5475, 6);
    expect(s1.position.x).toBeCloseTo(5, 6);
    expect(s1.time).toBeCloseTo(0.5, 6);
    // input state is not mutated
    expect(s0.position.z).toBe(100);
    expect(s0.velocity.z).toBe(0);
  });

  test("FIXED_DT is 1/120", () => {
    expect(FIXED_DT).toBeCloseTo(1 / 120, 12);
  });
});

import { predictPath } from "../src/physics/predict";

describe("predictPath", () => {
  const SHOT = { elevationDeg: 45, azimuthDeg: 0, muzzleSpeed: 100 };

  test("drag-free shot matches the closed-form parabola", () => {
    const t = predictPath(SHOT, CALM);
    const g = CALM.gravity;
    const v = 100 * Math.SQRT1_2;
    const expectedFlightTime = (2 * v) / g;          // ≈ 14.417 s
    const expectedRange = 100 * 100 * Math.sin(Math.PI / 2) / g; // ≈ 1019.37 m
    const expectedApex = (v * v) / (2 * g);          // ≈ 254.84 m
    expect(t.truncated).toBe(false);
    expect(t.impact).not.toBeNull();
    expect(t.flightTime).toBeCloseTo(expectedFlightTime, 1);
    expect(t.impact!.x).toBeCloseTo(expectedRange, -1); // within ~5 m of 1019
    const apex = Math.max(...t.points.map(p => p.z));
    expect(Math.abs(apex - expectedApex)).toBeLessThan(1); // integrator bias ~a·dt·t/2 ≈ 0.3 m
  });

  test("drag strictly shortens range", () => {
    const free = predictPath(SHOT, CALM);
    const dragged = predictPath(SHOT, { ...CALM, dragCoefficient: 0.0005 });
    expect(dragged.impact!.x).toBeLessThan(free.impact!.x);
  });

  test("crosswind drifts the impact point downwind", () => {
    const wind = predictPath(SHOT, {
      ...CALM,
      dragCoefficient: 0.0005,
      windSpeed: 15,
      windDirectionDeg: 90, // blowing toward +y (north)
    });
    expect(wind.impact!.y).toBeGreaterThan(1);
  });

  test("zero gravity truncates at MAX_FLIGHT_TIME instead of looping forever", () => {
    const t = predictPath(SHOT, { ...CALM, gravity: 0 });
    expect(t.truncated).toBe(true);
    expect(t.impact).toBeNull();
    expect(t.flightTime).toBeGreaterThanOrEqual(120);
  });
});

import { downrange } from "../src/render/scene";

describe("downrange", () => {
  test("is the horizontal distance, ignoring altitude", () => {
    expect(downrange({ x: 3, y: 4, z: 999 })).toBeCloseTo(5, 9);
    expect(downrange({ x: 0, y: 0, z: 10 })).toBe(0);
  });
});

import type { GroundFn } from "../src/physics/types";

describe("terrain-aware physics", () => {
  test("launchState accepts a launch origin", () => {
    const s = launchState({ elevationDeg: 45, azimuthDeg: 0, muzzleSpeed: 100 }, { x: 100, y: 200, z: 50 });
    expect(s.position).toEqual({ x: 100, y: 200, z: 50 });
  });

  test("a shell hits an ascending wall while still climbing", () => {
    // vertical wall 400 m tall starting at x = 200
    const wall: GroundFn = (x) => (x > 200 ? 400 : 0);
    const shot = { elevationDeg: 30, azimuthDeg: 0, muzzleSpeed: 150 };
    const hit = predictPath(shot, CALM, { ground: wall });
    // apex of this shot is at t ≈ 7.6 s; the wall is reached at t ≈ 1.5 s, still ascending
    expect(hit.impact).not.toBeNull();
    expect(hit.impact!.x).toBeGreaterThan(200);
    expect(hit.impact!.x).toBeLessThan(215);
    expect(hit.flightTime).toBeLessThan(2);
    const flat = predictPath(shot, CALM);
    expect(flat.impact!.x).toBeGreaterThan(1500);
  });

  test("launching from altitude over flat ground lands at z <= 0 with extended flight", () => {
    const t = predictPath(
      { elevationDeg: 0, azimuthDeg: 0, muzzleSpeed: 50 },
      CALM,
      { origin: { x: 100, y: 200, z: 300 } },
    );
    const expectedFall = Math.sqrt((2 * 300) / CALM.gravity); // ≈ 7.82 s
    expect(t.impact).not.toBeNull();
    expect(t.impact!.z).toBeLessThanOrEqual(0);
    expect(t.flightTime).toBeCloseTo(expectedFall, 1);
    expect(t.impact!.x).toBeCloseTo(100 + 50 * expectedFall, -1);
  });
});
