// A battery configuration taken from one supplied engineered plan set. It isn't confirmed as EQORE's
// standard. Each rating below is the manufacturer's published value, as that plan set cites it.

export const PLAN_SET_250KW_760KWH = {
  name: "250 kW / 760 kWh configuration",
  provenance: "Taken from one supplied engineered plan set; not confirmed as EQORE's standard.",
  acKw: 250,
  battery: {
    tag: "BESS",
    name: "BATTERY ENERGY STORAGE SYSTEM",
    model: "GOTION EDGE760",
    kwh: 760,
    // Manufacturer's DC operating range. Conductors are sized at the minimum, where current is highest.
    dcMinV: 1069.2,
    dcMaxV: 1425.6,
    // Two high-voltage distribution boxes inside the unit, 190 kW each, per the manufacturer.
    outputs: 2,
    outputKw: 190,
    widthIn: 55.1,
    depthIn: 94.5,
    heightIn: 98.4,
  },
  // A UL-listed 1.5 kV electric-vehicle cable, as the manufacturer rates it.
  dcCable: { name: "70 MM² 1.5 KV EV CABLE", ampacity: 260, ratingNote: "manufacturer's rating, 260 A up to 70 °C" },
  inverter: {
    tag: "INV",
    name: "BIDIRECTIONAL INVERTER",
    model: "DYNAPOWER MPS125 WITH DC PRECHARGE UNIT",
    count: 2,
    kw: 125,
    voltage: 480,
    // Manufacturer's maximum AC current per unit.
    maxAcA: 150,
    // The manufacturer's manual allows conductors up to 2/0 AWG at the AC terminals, rated 90 °C.
    maxConductor: "2/0" as const,
    conductorTempC: 90 as const,
  },
  isolationTransformer: { tag: "XFMR", name: "ISOLATION TRANSFORMER", kva: 500, primary: "480 V DELTA" },
  disconnect: { tag: "DISC", name: "AC DISCONNECT, OUTDOOR", model: "SIEMENS HF365RA", amps: 400, volts: 600, landings: 2 },
  breaker: { tag: "CB", name: "NEW BREAKER IN THE MAIN DISTRIBUTION PANEL", model: "EATON (CUTLER-HAMMER) HKD3400F", amps: 400, landings: 2 },
  auxDisconnect: { tag: "AUX", name: "AUXILIARY DISCONNECT (BESS HEATING, COOLING, FIRE SUPPRESSION)", amps: 100 },
};

export type Configuration = typeof PLAN_SET_250KW_760KWH;
