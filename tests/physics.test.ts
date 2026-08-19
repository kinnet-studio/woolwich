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
