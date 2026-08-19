import { describe, expect, test } from "bun:test";
import type { Environment, GroundFn } from "../src/physics/types";
import { solveFireMission } from "../src/solver/fireSolution";

const VACUUM: Environment = { gravity: 9.81, dragCoefficient: 0, windSpeed: 0, windDirectionDeg: 0 };

describe("solveFireMission", () => {
  test("flat vacuum solution matches the closed form and hits within tolerance", () => {
    const r = solveFireMission({ target: { x: 2000, y: 0 }, muzzleSpeed: 150, env: VACUUM });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // closed form high arc: tanθ = (v² + √(v⁴ − g²R²)) / (gR)
    const v2 = 150 * 150;
    const g = 9.81;
    const expected = Math.atan2(v2 + Math.sqrt(v2 * v2 - g * g * 2000 * 2000), g * 2000) * (180 / Math.PI);
    expect(r.params.elevationDeg).toBeCloseTo(expected, 0);
    const miss = Math.hypot(r.predicted.impact!.x - 2000, r.predicted.impact!.y - 0);
    expect(miss).toBeLessThanOrEqual(25);
  });

  test("converges under drag and crosswind", () => {
    const env: Environment = { gravity: 9.81, dragCoefficient: 0.0003, windSpeed: 10, windDirectionDeg: 90 };
    const r = solveFireMission({ target: { x: 1800, y: 400 }, muzzleSpeed: 220, env });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const miss = Math.hypot(r.predicted.impact!.x - 1800, r.predicted.impact!.y - 400);
    expect(miss).toBeLessThanOrEqual(25);
  });

  test("reports out-of-range when the vacuum discriminant is negative", () => {
    const r = solveFireMission({ target: { x: 5000, y: 0 }, muzzleSpeed: 150, env: VACUUM });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("out-of-range");
  });

  test("reports masked with a best-effort trajectory when a ridge masks the target", () => {
    const ridge: GroundFn = (x) => (x > 900 && x < 1100 ? 2000 : 0);
    const r = solveFireMission({ target: { x: 2000, y: 0 }, muzzleSpeed: 150, env: VACUUM, ground: ridge });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("masked");
    expect(r.predicted?.impact?.x).toBeGreaterThan(850);
    expect(r.predicted?.impact?.x).toBeLessThan(1150);
  });

  test("reports unreachable with a shortfall when drag makes the target too far", () => {
    // vacuum range at 250 m/s is ~6.4 km, but drag 0.0003 caps it near 2.9 km
    const env: Environment = { gravity: 9.81, dragCoefficient: 0.0003, windSpeed: 0, windDirectionDeg: 0 };
    const r = solveFireMission({ target: { x: 3000, y: 0 }, muzzleSpeed: 250, env });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("unreachable");
    expect(r.predicted?.impact).toBeTruthy();
    expect(r.shortfallMeters).toBeGreaterThan(50);
    expect(r.shortfallMeters).toBeLessThan(400);
  });

  test("is deterministic", () => {
    const env: Environment = { gravity: 9.81, dragCoefficient: 0.0003, windSpeed: 15, windDirectionDeg: -45 };
    const a = solveFireMission({ target: { x: 1500, y: -300 }, muzzleSpeed: 200, env });
    const b = solveFireMission({ target: { x: 1500, y: -300 }, muzzleSpeed: 200, env });
    expect(a).toEqual(b);
  });
});
