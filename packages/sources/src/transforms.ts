import type { ObservedValue } from "@eqore/contract";

// Named readings for values a service doesn't publish as one plain number. A config entry names one,
// and no new code is needed per layer.
export type Transform =
  // "54.30%" is 54.3 percent.
  | { kind: "percent_text" }
  // Several attributes read as one series, such as this year's peak and the next five.
  | { kind: "series"; attributes: string[]; unit: string; describe: string }
  // Several limits, of which the lowest decides, named with each of the others.
  | { kind: "lowest_of"; limits: Record<string, string>; unit: string };

type Read = { value: ObservedValue } | { reason: string };

const numberOf = (raw: unknown, sentinels: number[]): number | null => {
  const number = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
  return Number.isFinite(number) && !sentinels.includes(number) ? number : null;
};

const shown = (number: number) => String(Math.round(number * 1000) / 1000);

export function applyTransform(transform: Transform, attribute: string | undefined, attributes: Record<string, unknown>, sentinels: number[] = []): Read {
  switch (transform.kind) {
    case "percent_text": {
      const raw = attributes[attribute!];
      const match = /^\s*(-?\d+(?:\.\d+)?)\s*%?\s*$/.exec(String(raw ?? ""));
      if (!match) return { reason: `${attribute} isn't a percentage: ${String(raw ?? "blank")}` };
      return { value: { type: "quantity", value: Number(match[1]), unit: "percent" } };
    }
    case "series": {
      const numbers = transform.attributes.map((name) => numberOf(attributes[name], sentinels));
      if (numbers.some((number) => number === null)) return { reason: `${transform.attributes.filter((_, index) => numbers[index] === null).join(", ")} is blank in the source` };
      return { value: { type: "text", value: `${numbers.map((number) => shown(number!)).join(", ")} ${transform.unit} (${transform.describe})` } };
    }
    case "lowest_of": {
      const limits = Object.entries(transform.limits)
        .map(([name, label]) => ({ label, number: numberOf(attributes[name], sentinels) }))
        .filter((limit): limit is { label: string; number: number } => limit.number !== null)
        .sort((a, b) => a.number - b.number);
      if (limits.length === 0) return { reason: "No limit is published for this location" };
      const [lowest, ...others] = limits;
      const rest = others.map((limit) => `${limit.label} ${shown(limit.number)}`).join(", ");
      return { value: { type: "text", value: `${shown(lowest!.number)} ${transform.unit}, limited by ${lowest!.label}${rest ? ` (also ${rest} ${transform.unit})` : ""}` } };
    }
  }
}
