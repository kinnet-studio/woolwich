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
