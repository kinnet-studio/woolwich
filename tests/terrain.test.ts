import { describe, expect, test } from "bun:test";
import { mulberry32 } from "../src/terrain/prng";

describe("mulberry32", () => {
  test("same seed produces the same sequence", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });

  test("different seeds produce different sequences", () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });

  test("values stay in [0, 1)", () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
