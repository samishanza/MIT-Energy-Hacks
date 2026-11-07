// Unit handling is deterministic. An agent that reports metres where the catalog wants feet
// gets converted; an agent that reports amps where the catalog wants feet gets rejected.

/** Everything reduces to the catalog's canonical unit per dimension. */
const TO_CANONICAL: Record<string, { canonical: string; factor: number }> = {
  ft: { canonical: 'ft', factor: 1 },
  feet: { canonical: 'ft', factor: 1 },
  "'": { canonical: 'ft', factor: 1 },
  in: { canonical: 'ft', factor: 1 / 12 },
  inch: { canonical: 'ft', factor: 1 / 12 },
  '"': { canonical: 'ft', factor: 1 / 12 },
  m: { canonical: 'ft', factor: 3.280839895 },
  meter: { canonical: 'ft', factor: 3.280839895 },
  cm: { canonical: 'ft', factor: 0.0328083989 },
  mm: { canonical: 'ft', factor: 0.0032808399 },

  A: { canonical: 'A', factor: 1 },
  amp: { canonical: 'A', factor: 1 },
  amps: { canonical: 'A', factor: 1 },
  kA: { canonical: 'A', factor: 1000 },

  V: { canonical: 'V', factor: 1 },
  volt: { canonical: 'V', factor: 1 },
  kV: { canonical: 'V', factor: 1000 },

  kW: { canonical: 'kW', factor: 1 },
  W: { canonical: 'kW', factor: 0.001 },
  MW: { canonical: 'kW', factor: 1000 },

  kVA: { canonical: 'kVA', factor: 1 },
  MVA: { canonical: 'kVA', factor: 1000 },

  kWh: { canonical: 'kWh', factor: 1 },
  MWh: { canonical: 'kWh', factor: 1000 },

  mph: { canonical: 'mph', factor: 1 },
  MPH: { canonical: 'mph', factor: 1 },
  'm/s': { canonical: 'mph', factor: 2.2369363 },

  '%': { canonical: '%', factor: 1 },
  percent: { canonical: '%', factor: 1 },
  deg: { canonical: 'deg', factor: 1 },
  psf: { canonical: 'psf', factor: 1 },
  PSF: { canonical: 'psf', factor: 1 },
  kPa: { canonical: 'psf', factor: 20.885434 },
  Pa: { canonical: 'psf', factor: 0.020885434 },
};

/**
 * Temperature is affine, not a scale factor, so it cannot live in the table above —
 * multiplying -25 degF by a ratio would produce a number that looks plausible and is
 * nonsense. These are handled separately and explicitly.
 */
const TEMP_UNITS: Record<string, 'F' | 'C'> = {
  degF: 'F', F: 'F', '°F': 'F', degC: 'C', C: 'C', '°C': 'C',
};

const toF = (v: number, from: 'F' | 'C') => (from === 'F' ? v : v * 9 / 5 + 32);
const fromF = (v: number, to: 'F' | 'C') => (to === 'F' ? v : (v - 32) * 5 / 9);

export interface ConvertOk {
  ok: true;
  value: number;
  /** True when the agent's unit differed and we converted it. Worth showing in review. */
  converted: boolean;
}
export interface ConvertErr {
  ok: false;
  reason: string;
}

/**
 * Convert `value` from `from` into the catalog unit `to`.
 * Returns an error rather than a guess when the dimensions do not match.
 */
export function convert(value: number, from: string | undefined, to: string | undefined): ConvertOk | ConvertErr {
  if (!to) return from ? { ok: false, reason: `field takes no unit but proposal supplied "${from}"` } : { ok: true, value, converted: false };
  if (!from) return { ok: false, reason: `field requires a unit (${to}) but the proposal has none` };

  const f = from.trim();

  // Temperature first: affine, and mixing it with the scale table would be a silent bug.
  const srcTemp = TEMP_UNITS[f];
  const dstTemp = TEMP_UNITS[to];
  if (srcTemp || dstTemp) {
    if (!srcTemp || !dstTemp) {
      return { ok: false, reason: `cannot convert between temperature and non-temperature units (${f} to ${to})` };
    }
    const out = fromF(toF(value, srcTemp), dstTemp);
    return { ok: true, value: round4(out), converted: srcTemp !== dstTemp };
  }

  const src = TO_CANONICAL[f] ?? TO_CANONICAL[from];
  const dst = TO_CANONICAL[to];
  if (!src) return { ok: false, reason: `unknown unit "${from}"` };
  if (!dst) return { ok: false, reason: `catalog unit "${to}" is not convertible` };
  if (src.canonical !== dst.canonical) {
    return { ok: false, reason: `cannot convert ${from} (${src.canonical}) to ${to} (${dst.canonical})` };
  }
  const canonical = value * src.factor;
  const out = canonical / dst.factor;
  return { ok: true, value: round4(out), converted: src.factor !== dst.factor };
}

export const round4 = (x: number) => Math.round(x * 1e4) / 1e4;
