import { describe, expect, test } from "bun:test";
import { generateTerrain } from "../src/terrain/generate";
import { sampleTerrain } from "../src/terrain/terrain";
import { applyBurst, decaySuppression } from "../src/world/damage";
import { placeStands, type Stand } from "../src/world/stand";
import { createWorld } from "../src/world/world";

function stand(kind: "infantry" | "armor", x: number, y: number): Stand {
  return { id: "t", kind, position: { x, y, z: 0 }, strength: 100, suppression: 0 };
}

describe("placeStands", () => {
  const terrain = generateTerrain(42);

  test("places stands inside the target zone, snapped to terrain, deterministically", () => {
    const a = placeStands(42, terrain);
    const b = placeStands(42, terrain);
    expect(a).toEqual(b);
    expect(a.length).toBe(8);
    for (const s of a) {
      expect(s.position.x).toBeGreaterThanOrEqual(2000);
      expect(s.position.x).toBeLessThanOrEqual(3500);
      expect(s.position.y).toBeGreaterThanOrEqual(-1000);
      expect(s.position.y).toBeLessThanOrEqual(1000);
      expect(s.position.z).toBe(sampleTerrain(terrain, s.position.x, s.position.y));
      expect(s.strength).toBe(100);
      expect(s.suppression).toBe(0);
    }
  });
});

describe("applyBurst", () => {
  test("direct hit on infantry: strength 100 → 20; on armor: 100 → 72", () => {
    const inf = stand("infantry", 0, 0);
    const arm = stand("armor", 0, 0);
    applyBurst({ x: 0, y: 0, z: 0 }, [inf, arm]);
    expect(inf.strength).toBeCloseTo(20, 9);
    expect(arm.strength).toBeCloseTo(72, 9);
  });

  test("linear falloff: infantry at 25 m loses 40", () => {
    const s = stand("infantry", 25, 0);
    applyBurst({ x: 0, y: 0, z: 0 }, [s]);
    expect(s.strength).toBeCloseTo(60, 9);
  });

  test("outside lethal but inside suppression radius: no strength loss, suppression rises", () => {
    const s = stand("infantry", 60, 0);
    applyBurst({ x: 0, y: 0, z: 0 }, [s]);
    expect(s.strength).toBe(100);
    expect(s.suppression).toBeCloseTo(60 * (1 - 60 / 150), 9);
  });

  test("suppression clamps at 100 and strength floors at 0; wrecks ignore later bursts", () => {
    const s = stand("infantry", 0, 0);
    applyBurst({ x: 0, y: 0, z: 0 }, [s]);
    applyBurst({ x: 0, y: 0, z: 0 }, [s]);
    expect(s.strength).toBe(0);
    expect(s.suppression).toBe(100);
    const wreckSuppression = s.suppression;
    applyBurst({ x: 0, y: 0, z: 0 }, [s]);
    expect(s.strength).toBe(0);
    expect(s.suppression).toBe(wreckSuppression);
  });

  test("suppression decays at 5 points per second and floors at 0", () => {
    const s = stand("infantry", 100, 0);
    applyBurst({ x: 0, y: 0, z: 0 }, [s]);
    const start = s.suppression;
    decaySuppression([s], 2);
    expect(s.suppression).toBeCloseTo(start - 10, 9);
    decaySuppression([s], 999);
    expect(s.suppression).toBe(0);
  });
});

describe("createWorld", () => {
  test("assembles terrain, stands, and a battery on the terrain surface", () => {
    const w = createWorld(7);
    expect(w.stands.length).toBe(8);
    expect(w.battery.position.z).toBe(sampleTerrain(w.terrain, 0, 0));
    expect(w.battery.muzzleSpeed).toBe(250);
    expect(w.ground(1234, -567)).toBe(sampleTerrain(w.terrain, 1234, -567));
  });
});
