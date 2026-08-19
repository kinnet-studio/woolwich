import { FIXED_DT, stepState } from "./physics/integrator";
import { launchState } from "./physics/shot";
import type { Environment, ProjectileState, ShotParams, Vec3 } from "./physics/types";

export class Simulation {
  env: Environment;
  state: ProjectileState | null = null;
  impact: Vec3 | null = null;
  paused = false;
  timeScale = 1;
  private accumulator = 0;

  constructor(env: Environment) {
    this.env = env;
  }

  fire(params: ShotParams): void {
    this.state = launchState(params);
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
    if (this.state.position.z <= 0 && this.state.velocity.z < 0) {
      this.impact = this.state.position;
    }
  }
}
