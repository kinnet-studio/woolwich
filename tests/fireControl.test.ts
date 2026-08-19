import { describe, expect, test } from "bun:test";
import { createFireControlStateMachine, type FireControlContext } from "../src/gallery/fireControl";

function makeContext(valid: boolean) {
  const calls: string[] = [];
  const context: FireControlContext = {
    setup: () => {},
    cleanup: () => {},
    solve: (target) => calls.push(`solve:${target.x},${target.y}`),
    hasValidSolution: () => valid,
    launch: () => calls.push("launch"),
    invalidateSolution: () => calls.push("invalidate"),
    applyEnvironment: () => calls.push("applyEnv"),
    handleImpact: () => calls.push("impact"),
    resetWorld: (seed) => calls.push(`reset:${seed}`),
  };
  return { context, calls };
}

describe("fire-control state machine", () => {
  test("starts in READY and a map click solves", () => {
    const { context, calls } = makeContext(false);
    const sm = createFireControlStateMachine(context);
    expect(sm.currentState).toBe("READY");
    sm.happens("mapClick", { x: 100, y: 200 });
    expect(calls).toEqual(["solve:100,200"]);
    expect(sm.currentState).toBe("READY");
  });

  test("fire without a valid solution does not launch and stays READY", () => {
    const { context, calls } = makeContext(false);
    const sm = createFireControlStateMachine(context);
    sm.happens("fire", {});
    expect(calls).not.toContain("launch");
    expect(sm.currentState).toBe("READY");
  });

  test("fire with a valid solution launches and enters IN_FLIGHT", () => {
    const { context, calls } = makeContext(true);
    const sm = createFireControlStateMachine(context);
    sm.happens("fire", {});
    expect(calls).toContain("launch");
    expect(sm.currentState).toBe("IN_FLIGHT");
  });

  test("clicks and fire are ignored while IN_FLIGHT", () => {
    const { context, calls } = makeContext(true);
    const sm = createFireControlStateMachine(context);
    sm.happens("fire", {});
    calls.length = 0;
    sm.happens("mapClick", { x: 1, y: 2 });
    sm.happens("fire", {});
    expect(calls).toEqual([]);
    expect(sm.currentState).toBe("IN_FLIGHT");
  });

  test("impact applies the burst and returns to READY (mission can re-fire)", () => {
    const { context, calls } = makeContext(true);
    const sm = createFireControlStateMachine(context);
    sm.happens("fire", {});
    sm.happens("impact", {});
    expect(calls).toContain("impact");
    expect(sm.currentState).toBe("READY");
    sm.happens("fire", {});
    expect(calls.filter((c) => c === "launch").length).toBe(2);
  });

  test("envChanged applies the environment and invalidates in both states", () => {
    const ready = makeContext(false);
    const smReady = createFireControlStateMachine(ready.context);
    smReady.happens("envChanged", {});
    expect(ready.calls).toEqual(["applyEnv", "invalidate"]);
    expect(smReady.currentState).toBe("READY");

    const flight = makeContext(true);
    const smFlight = createFireControlStateMachine(flight.context);
    smFlight.happens("fire", {});
    flight.calls.length = 0;
    smFlight.happens("envChanged", {});
    expect(flight.calls).toEqual(["applyEnv", "invalidate"]);
    expect(smFlight.currentState).toBe("IN_FLIGHT");
  });

  test("regenerate resets the world from either state and lands in READY", () => {
    const { context, calls } = makeContext(true);
    const sm = createFireControlStateMachine(context);
    sm.happens("fire", {});
    sm.happens("regenerate", { seed: 9 });
    expect(calls).toContain("reset:9");
    expect(sm.currentState).toBe("READY");
  });
});
