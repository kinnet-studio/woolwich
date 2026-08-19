import type { Environment } from "../physics/types";

type SliderSpec = { id: string; label: string; min: number; max: number; step: number; value: number; unit: string };

const SLIDERS: SliderSpec[] = [
  { id: "adv-gravity", label: "Gravity", min: 1, max: 25, step: 0.01, value: 9.81, unit: " m/s²" },
  { id: "adv-drag", label: "Drag coefficient", min: 0, max: 0.002, step: 0.0001, value: 0.0003, unit: " /m" },
  { id: "adv-windspeed", label: "Wind speed", min: 0, max: 40, step: 1, value: 0, unit: " m/s" },
  { id: "adv-winddir", label: "Wind direction", min: -180, max: 180, step: 5, value: 0, unit: "°" },
];

export function setupAdvancedPanel(onChange: () => void): { environment(): Environment } {
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
  };
}
