import type { Environment } from "../physics/types";

export type FireMode = "high" | "low" | "manual";

const MODES: { value: FireMode; label: string }[] = [
  { value: "high", label: "High arc" },
  { value: "low", label: "Low arc" },
  { value: "manual", label: "Manual" },
];

type SliderSpec = { id: string; label: string; min: number; max: number; step: number; value: number; unit: string };

const SLIDERS: SliderSpec[] = [
  { id: "adv-muzzle", label: "Muzzle velocity", min: 50, max: 300, step: 5, value: 250, unit: " m/s" },
  { id: "adv-gravity", label: "Gravity", min: 1, max: 25, step: 0.01, value: 9.81, unit: " m/s²" },
  { id: "adv-drag", label: "Drag coefficient", min: 0, max: 0.002, step: 0.0001, value: 0.0003, unit: " /m" },
  { id: "adv-windspeed", label: "Wind speed", min: 0, max: 40, step: 1, value: 0, unit: " m/s" },
  { id: "adv-winddir", label: "Wind direction", min: -180, max: 180, step: 5, value: 0, unit: "°" },
  { id: "adv-elevation", label: "Barrel elevation (manual mode)", min: 1, max: 89, step: 1, value: 45, unit: "°" },
];

export function setupAdvancedPanel(onChange: () => void): {
  environment(): Environment;
  muzzleSpeed(): number;
  fireMode(): FireMode;
  manualElevationDeg(): number;
} {
  const modeContainer = document.getElementById("firemode")!;
  const modeInputs: HTMLInputElement[] = [];
  for (const mode of MODES) {
    const label = document.createElement("label");
    label.className = "mode";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "firemode";
    input.value = mode.value;
    input.checked = mode.value === "high";
    input.addEventListener("change", onChange);
    label.appendChild(input);
    label.appendChild(document.createTextNode(mode.label));
    modeContainer.appendChild(label);
    modeInputs.push(input);
  }
  const container = document.getElementById("advanced")!;
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
  return {
    environment: () => ({
      gravity: value("adv-gravity"),
      dragCoefficient: value("adv-drag"),
      windSpeed: value("adv-windspeed"),
      windDirectionDeg: value("adv-winddir"),
    }),
    muzzleSpeed: () => value("adv-muzzle"),
    fireMode: () => (modeInputs.find((i) => i.checked)?.value ?? "high") as FireMode,
    manualElevationDeg: () => value("adv-elevation"),
  };
}
