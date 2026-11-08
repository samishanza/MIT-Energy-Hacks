import type { Size } from "./nec.ts";

// The equipment catalog: one record per model, with the same fields in every category, each value as the
// manufacturer publishes it and cited to its document. A configuration picks models and counts from it.

export type EquipmentModel = {
  id: string;
  manufacturer: string;
  model: string;
  category: "inverter" | "battery";
  ac: {
    voltage: string;
    nominalV: number;
    phases: 1 | 3;
    kva: number;
    kw: number;
    // Continuous output current, and the short-term overload the unit can carry.
    ratedA: number;
    overloadA: number | null;
    // The most current the unit draws from the grid. A hybrid unit's includes power passed through to a backup load.
    maxInputA: number | null;
  } | null;
  dc: { vMin: number; vMax: number; maxA: number | null } | null;
  energyKwh?: number;
  efficiencyPct: number | null;
  enclosure: string | null;
  dimensionsIn: { h: number; w: number; d: number } | null;
  weightLb: number | null;
  certifications: string[];
  source: { document: string; revision: string; page: number | null };
};

export const DYNAPOWER_MPS_125: EquipmentModel = {
  id: "dynapower-mps-125",
  manufacturer: "Dynapower",
  model: "MPS-125",
  category: "inverter",
  ac: { voltage: "480 VAC, 3-phase", nominalV: 480, phases: 3, kva: 125, kw: 125, ratedA: 150, overloadA: 180, maxInputA: null },
  dc: { vMin: 740, vMax: 1500, maxA: 171 },
  efficiencyPct: 98.7,
  enclosure: "UL 3R",
  dimensionsIn: { h: 42.5, w: 29.5, d: 15.5 },
  weightLb: 230,
  certifications: ["UL 1741 Ed. 3", "IEEE 1547", "IEEE 519", "CSA 22.2 #107.1", "NFPA 70"],
  source: { document: "MPS-125 Energy Storage Inverter datasheet", revision: "08-2025 US", page: 2 },
};

export const GROWATT_WIT_100K_HU_US: EquipmentModel = {
  id: "growatt-wit-100k-hu-us",
  manufacturer: "Growatt",
  model: "WIT 100K-HU-US",
  category: "inverter",
  ac: { voltage: "277/480 V, 3-phase", nominalV: 480, phases: 3, kva: 110, kw: 100, ratedA: 132.4, overloadA: null, maxInputA: 240.7 },
  // 750 to 1000 V for a 3-wire connection; 820 to 1000 V for 4-wire.
  dc: { vMin: 750, vMax: 1000, maxA: 151.3 },
  efficiencyPct: 98.2,
  enclosure: "IP66 / NEMA 4X",
  dimensionsIn: { h: 53.1, w: 33.5, d: 20.1 },
  weightLb: 352.7,
  certifications: ["UL 1741:2021", "UL 1741 SA/SB:2020", "IEEE 1547:2018", "IEEE 1547.1:2020", "UL 1998:2018", "CSA C22.2 107.1"],
  source: { document: "WIT 50~100K-HU-US datasheet", revision: "2026-01", page: 2 },
};

// No manufacturer's datasheet is on hand; these values are as the supplied plan set cites them.
export const GOTION_EDGE_760: EquipmentModel = {
  id: "gotion-edge-760",
  manufacturer: "Gotion",
  model: "EDGE760",
  category: "battery",
  ac: null,
  dc: { vMin: 1069.2, vMax: 1425.6, maxA: null },
  energyKwh: 760,
  efficiencyPct: null,
  enclosure: null,
  dimensionsIn: { h: 98.4, w: 55.1, d: 94.5 },
  weightLb: null,
  certifications: [],
  source: { document: "Supplied engineered plan set, as it cites the manufacturer", revision: "not stated", page: null },
};

export const EQUIPMENT: EquipmentModel[] = [DYNAPOWER_MPS_125, GROWATT_WIT_100K_HU_US, GOTION_EDGE_760];

export type Configuration = {
  id: string;
  name: string;
  provenance: string;
  battery: {
    tag: string;
    name: string;
    model: EquipmentModel;
    // Separate DC outputs on the unit and the power on each.
    outputs: number;
    outputKw: number;
  };
  dcCable: { name: string; ampacity: number; ratingNote: string };
  inverter: {
    tag: string;
    name: string;
    model: EquipmentModel;
    label: string;
    count: number;
    // The largest conductor the AC terminals accept and its rating, from the manual; null when not on hand.
    maxConductor: Size | null;
    conductorTempC: 75 | 90;
  };
  isolationTransformer: { tag: string; name: string; kva: number; primary: string };
  disconnect: { tag: string; name: string; model: string; amps: number; volts: number; landings: number };
  breaker: { tag: string; name: string; model: string; amps: number; landings: number };
  auxDisconnect: { tag: string; name: string; amps: number };
};

const PLAN_SET_BATTERY = { tag: "BESS", name: "BATTERY ENERGY STORAGE SYSTEM", model: GOTION_EDGE_760, outputs: 2, outputKw: 190 };
const PLAN_SET_BALANCE = {
  // A UL-listed 1.5 kV electric-vehicle cable, as the manufacturer rates it.
  dcCable: { name: "70 MM² 1.5 KV EV CABLE", ampacity: 260, ratingNote: "manufacturer's rating, 260 A up to 70 °C" },
  isolationTransformer: { tag: "XFMR", name: "ISOLATION TRANSFORMER", kva: 500, primary: "480 V DELTA" },
  disconnect: { tag: "DISC", name: "AC DISCONNECT, OUTDOOR", model: "SIEMENS HF365RA", amps: 400, volts: 600, landings: 2 },
  breaker: { tag: "CB", name: "NEW BREAKER IN THE MAIN DISTRIBUTION PANEL", model: "EATON (CUTLER-HAMMER) HKD3400F", amps: 400, landings: 2 },
  auxDisconnect: { tag: "AUX", name: "AUXILIARY DISCONNECT (BESS HEATING, COOLING, FIRE SUPPRESSION)", amps: 100 },
};

// The configuration taken from one supplied engineered plan set. It isn't confirmed as EQORE's standard.
export const PLAN_SET_250KW_760KWH: Configuration = {
  id: "plan-set-250kw-760kwh",
  name: "250 kW / 760 kWh configuration",
  provenance: "Taken from one supplied engineered plan set; not confirmed as EQORE's standard.",
  battery: PLAN_SET_BATTERY,
  inverter: {
    tag: "INV",
    name: "BIDIRECTIONAL INVERTER",
    model: DYNAPOWER_MPS_125,
    label: "DYNAPOWER MPS125 WITH DC PRECHARGE UNIT",
    count: 2,
    // The manufacturer's manual allows conductors up to 2/0 AWG at the AC terminals, rated 90 °C.
    maxConductor: "2/0",
    conductorTempC: 90,
  },
  ...PLAN_SET_BALANCE,
};

// The plan set's battery and balance of system with two Growatt WIT 100K-HU-US inverters, for comparison.
export const WIT_100K_ALTERNATIVE: Configuration = {
  id: "wit-100k-alternative",
  name: "200 kW alternative, 2 × Growatt WIT 100K-HU-US",
  provenance: "The plan set's configuration with the inverters swapped for comparison; not a reviewed design.",
  battery: PLAN_SET_BATTERY,
  inverter: { tag: "INV", name: "HYBRID INVERTER", model: GROWATT_WIT_100K_HU_US, label: "GROWATT WIT 100K-HU-US", count: 2, maxConductor: null, conductorTempC: 75 },
  ...PLAN_SET_BALANCE,
};

export const CONFIGURATIONS: Configuration[] = [PLAN_SET_250KW_760KWH, WIT_100K_ALTERNATIVE];
