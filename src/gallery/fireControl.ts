import {
  BaseContext,
  CreateStateType,
  EventGuards,
  EventReactions,
  Guard,
  StateMachine,
  TemplateState,
  TemplateStateMachine,
} from "@ue-too/being";

export type FireControlEventMapping = {
  mapClick: { x: number; y: number };
  fire: {};
  impact: {};
  envChanged: {};
  regenerate: { seed: number };
};

/** Game actions the machine drives; the machine owns WHEN, the context owns WHAT. */
export interface FireControlContext extends BaseContext {
  solve(target: { x: number; y: number }): void;
  hasValidSolution(): boolean;
  launch(): void;
  invalidateSolution(): void;
  applyEnvironment(): void;
  handleImpact(): void;
  resetWorld(seed: number): void;
}

const FIRE_CONTROL_STATES = ["READY", "IN_FLIGHT"] as const;
export type FireControlStates = CreateStateType<typeof FIRE_CONTROL_STATES>;

export type FireControlStateMachine = StateMachine<
  FireControlEventMapping,
  FireControlContext,
  FireControlStates,
  any
>;

class ReadyState extends TemplateState<FireControlEventMapping, FireControlContext, FireControlStates> {
  protected _guards: Guard<FireControlContext, "hasValidSolution"> = {
    hasValidSolution: (ctx) => ctx.hasValidSolution(),
  };

  protected _eventGuards: Partial<
    EventGuards<FireControlEventMapping, FireControlStates, FireControlContext, Guard<FireControlContext, "hasValidSolution">>
  > = {
    fire: [{ guard: "hasValidSolution", target: "IN_FLIGHT" }],
  };

  protected _eventReactions = {
    mapClick: {
      action: (ctx: FireControlContext, payload: FireControlEventMapping["mapClick"]) => {
        ctx.solve(payload);
      },
      defaultTargetState: "READY",
    },
    fire: {
      action: (ctx: FireControlContext) => {
        if (ctx.hasValidSolution()) ctx.launch();
      },
      // guard promotes to IN_FLIGHT when a valid solution exists
      defaultTargetState: "READY",
    },
    envChanged: {
      action: (ctx: FireControlContext) => {
        ctx.applyEnvironment();
        ctx.invalidateSolution();
      },
      defaultTargetState: "READY",
    },
    regenerate: {
      action: (ctx: FireControlContext, payload: FireControlEventMapping["regenerate"]) => {
        ctx.resetWorld(payload.seed);
      },
      defaultTargetState: "READY",
    },
  } as EventReactions<FireControlEventMapping, FireControlContext, FireControlStates, any>;
}

class InFlightState extends TemplateState<FireControlEventMapping, FireControlContext, FireControlStates> {
  // mapClick and fire have no reactions here: clicks during flight are ignored
  protected _eventReactions = {
    impact: {
      action: (ctx: FireControlContext) => {
        ctx.handleImpact();
      },
      defaultTargetState: "READY",
    },
    envChanged: {
      action: (ctx: FireControlContext) => {
        ctx.applyEnvironment();
        ctx.invalidateSolution();
      },
      defaultTargetState: "IN_FLIGHT",
    },
    regenerate: {
      action: (ctx: FireControlContext, payload: FireControlEventMapping["regenerate"]) => {
        ctx.resetWorld(payload.seed);
      },
      defaultTargetState: "READY",
    },
  } as EventReactions<FireControlEventMapping, FireControlContext, FireControlStates, any>;
}

export function createFireControlStateMachine(context: FireControlContext) {
  return new TemplateStateMachine<FireControlEventMapping, FireControlContext, FireControlStates>(
    { READY: new ReadyState(), IN_FLIGHT: new InFlightState() },
    "READY",
    context,
  );
}
