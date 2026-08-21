import { describe, expect, test } from "bun:test";
import { PX_PER_KM, buildOwnerLayer, buildTerrainLayer, drawLayer, layerFrame, toLayerPx } from "../src/render/hexMap";
import { createEmptyWorld, worldBounds } from "../src/strategic/world";

describe("hexMap layers (headless)", () => {
  const world = createEmptyWorld(1);

  test("layerFrame covers the world bounds at PX_PER_KM", () => {
    const f = layerFrame(world);
    const b = worldBounds(world);
    expect(f.minX).toBe(b.minX);
    expect(f.minY).toBe(b.minY);
    expect(f.width).toBeCloseTo(b.maxX - b.minX, 9);
    expect(f.height).toBeCloseTo(b.maxY - b.minY, 9);
    expect(f.pxPerKm).toBe(PX_PER_KM);
  });

  test("toLayerPx maps the north-west corner to (0,0) and the south-east corner to the pixel size", () => {
    const f = layerFrame(world);
    const b = worldBounds(world);
    expect(toLayerPx(f, { x: b.minX, y: b.maxY })).toEqual({ x: 0, y: 0 });
    const se = toLayerPx(f, { x: b.maxX, y: b.minY });
    expect(se.x).toBeCloseTo(f.width * PX_PER_KM, 9);
    expect(se.y).toBeCloseTo(f.height * PX_PER_KM, 9);
  });

  test("without a DOM the layers have a null canvas and drawLayer is a no-op", () => {
    const terrain = buildTerrainLayer(world);
    const owner = buildOwnerLayer(world);
    expect(terrain.canvas).toBeNull();
    expect(owner.canvas).toBeNull();
    const ctx = { drawImage: () => { throw new Error("must not draw"); } } as unknown as CanvasRenderingContext2D;
    expect(() => drawLayer(ctx, terrain)).not.toThrow();
  });
});
