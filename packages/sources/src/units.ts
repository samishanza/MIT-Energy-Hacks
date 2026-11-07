// Deterministic unit conversion. An unknown pair throws rather than passing a number through,
// so kV and MW can never be mixed with kW or V by accident.
const FACTORS: Record<string, number> = {
  "V>kV": 0.001,
  "kV>V": 1000,
  "kW>MW": 0.001,
  "MW>kW": 1000,
  "sqm>acre": 1 / 4046.8564224,
  "sqm>sqft": 10.7639104167,
  "sqft>acre": 1 / 43560,
  "acre>sqft": 43560,
};

export function convertUnit(value: number, from: string, to: string): number {
  if (from === to) return value;
  const factor = FACTORS[`${from}>${to}`];
  if (factor === undefined) throw new Error(`No conversion from ${from} to ${to}`);
  return value * factor;
}
