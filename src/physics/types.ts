export type Vec3 = { x: number; y: number; z: number };

/** Angles in degrees: 0° = +x (east), counterclockwise positive (90° = +y north). */
export type ShotParams = {
  elevationDeg: number;
  azimuthDeg: number;
  /** m/s */
  muzzleSpeed: number;
};

export type Environment = {
  /** m/s², acts along -z */
  gravity: number;
  /** quadratic drag coefficient k in a = -k·|v_air|·v_air (1/m) */
  dragCoefficient: number;
  /** m/s, horizontal */
  windSpeed: number;
  /** direction the wind blows toward, degrees, 0° = east, CCW */
  windDirectionDeg: number;
};

export type ProjectileState = {
  position: Vec3;
  velocity: Vec3;
  /** seconds since launch */
  time: number;
};

export const DEG_TO_RAD = Math.PI / 180;
