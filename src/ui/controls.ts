import type { Environment, ShotParams } from "../physics/types";

type SliderSpec = { id: string; label: string; min: number; max: number; step: number; value: number; unit: string };

const SLIDERS: SliderSpec[] = [
  { id: "elevation", label: "Elevation", min: 0, max: 90, step: 1, value: 45, unit: "°" },
  { id: "azimuth", label: "Azimuth", min: -180, max: 180, step: 1, value: 0, unit: "°" },
  { id: "muzzle", label: "Muzzle velocity", min: 10, max: 300, step: 5, value: 100, unit: " m/s" },
  { id: "gravity", label: "Gravity", min: 0, max: 25, step: 0.01, value: 9.81, unit: " m/s²" },
  { id: "drag", label: "Drag coefficient", min: 0, max: 0.002, step: 0.0001, value: 0.0003, unit: " /m" },
  { id: "windspeed", label: "Wind speed", min: 0, max: 40, step: 1, value: 0, unit: " m/s" },
  { id: "winddir", label: "Wind direction", min: -180, max: 180, step: 5, value: 0, unit: "°" },
];

export type ControlPanel = {
  shotParams(): ShotParams;
  environment(): Environment;
  onFire(cb: () => void): void;
  /** cb returns the new paused state, used to update the button label */
  onPauseToggle(cb: () => boolean): void;
  /** cb returns whether slow-mo is now active */
  onSlowmoToggle(cb: () => boolean): void;
  onStep(cb: () => void): void;
  setReadouts(text: string): void;
};

export function setupControls(onChange: () => void): ControlPanel {
  const container = document.getElementById("controls")!;
  const inputs = new Map<string, HTMLInputElement>();

  for (const spec of SLIDERS) {
    const label = document.createElement("label");
    label.htmlFor = spec.id;
    label.textContent = spec.label;
    const out = document.createElement("output");
    label.appendChild(out);
    const input = document.createElement("input");
    input.type = "range";
    input.id = spec.id;
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(spec.value);
    const refresh = () => { out.textContent = `${input.value}${spec.unit}`; };
    input.addEventListener("input", () => { refresh(); onChange(); });
    refresh();
    container.appendChild(label);
    container.appendChild(input);
    inputs.set(spec.id, input);
  }

  const value = (id: string) => Number(inputs.get(id)!.value);
  const readouts = document.getElementById("readouts")!;
  const fireBtn = document.getElementById("fire")!;
  const pauseBtn = document.getElementById("pause")!;
  const slowmoBtn = document.getElementById("slowmo")!;
  const stepBtn = document.getElementById("step")!;

  return {
    shotParams: () => ({ elevationDeg: value("elevation"), azimuthDeg: value("azimuth"), muzzleSpeed: value("muzzle") }),
    environment: () => ({ gravity: value("gravity"), dragCoefficient: value("drag"), windSpeed: value("windspeed"), windDirectionDeg: value("winddir") }),
    onFire: (cb) => fireBtn.addEventListener("click", cb),
    onPauseToggle: (cb) => pauseBtn.addEventListener("click", () => { pauseBtn.textContent = cb() ? "Resume" : "Pause"; }),
    onSlowmoToggle: (cb) => slowmoBtn.addEventListener("click", () => { slowmoBtn.textContent = cb() ? "Realtime" : "Slow-mo"; }),
    onStep: (cb) => stepBtn.addEventListener("click", cb),
    setReadouts: (text) => { readouts.textContent = text; },
  };
}
