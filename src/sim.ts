import { FIXED_DT, stepState } from "./physics/integrator";
import { launchState } from "./physics/shot";
import { FLAT_GROUND, type Environment, type GroundFn, type ProjectileState, type ShotParams, type Vec3 } from "./physics/types";

export class Simulation {
  env: Environment;
  ground: GroundFn;
  state: ProjectileState | null = null;
  impact: Vec3 | null = null;
  paused = false;
  timeScale = 1;
  private accumulator = 0;

  constructor(env: Environment, ground: GroundFn = FLAT_GROUND) {
    this.env = env;
    this.ground = ground;
  }

  fire(params: ShotParams, origin?: Vec3): void {
    this.state = launchState(params, origin);
    this.impact = null;
    this.accumulator = 0;
  }

  advance(elapsedSeconds: number): void {
    if (this.paused || !this.state || this.impact) return;
    this.accumulator += elapsedSeconds * this.timeScale;
    while (this.accumulator >= FIXED_DT && !this.impact) {
      this.accumulator -= FIXED_DT;
      this.integrateOneStep();
    }
  }

  stepFrame(): void {
    if (!this.state || this.impact) return;
    this.integrateOneStep();
  }

  private integrateOneStep(): void {
    this.state = stepState(this.state!, this.env, FIXED_DT);
    if (this.state.position.z <= this.ground(this.state.position.x, this.state.position.y)) {
      this.impact = this.state.position;
    }
  }
}
