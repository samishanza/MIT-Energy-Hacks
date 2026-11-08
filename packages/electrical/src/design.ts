import type { MapFeature, RecordVersion, Value } from "@eqore/contract";
import { PLAN_SET_250KW_760KWH, type Configuration } from "./catalog.ts";
import { BUSBAR_FACTOR, CONTINUOUS_FACTOR, SIZES, ampacity, groundingConductor, label, nextStandardOcpd, resistancePerKft, type Material, type Size } from "./nec.ts";

export const CONCEPT_NOTE = "CONCEPT CALCULATION, THE ENGINEER OF RECORD VERIFIES. NOT FOR CONSTRUCTION.";

export type InputState = "verified" | "inferred" | "estimate" | "missing";
export type SiteInput<T> = { label: string; value: T | null; state: InputState; source: string; reason?: string };

export type Calculation = {
  id: string;
  title: string;
  citation: string;
  steps: string[];
  result: string;
  status: "passes" | "fails" | "needs_input";
  note?: string;
};

// One box on the single-line. (E) existing, (N) new. Known is false when the record can't fill it.
export type LineItem = { id: string; status: "E" | "N"; title: string; lines: string[]; known: boolean; inferred?: boolean };
export type ScheduleRow = { tag: number; from: string; to: string; conductors: string; ground: string; conduit: string };

export type ServiceDesign = {
  serviceVoltage: number;
  serviceLabel: string;
  serviceState: InputState;
  items: LineItem[];
  schedule: ScheduleRow[];
  calculations: Calculation[];
};

export type ElectricalDesign = {
  note: string;
  configuration: { name: string; provenance: string };
  site: { address: string; recordVersionId: string; version: number };
  inputs: {
    utility: SiteInput<string>;
    feeder: SiteInput<string>;
    servicePath: SiteInput<string>;
    serviceVoltage: SiteInput<number>;
    mainBreakerA: SiteInput<number>;
    busRatingA: SiteInput<number>;
    faultCurrentA: SiteInput<number>;
    meterNumber: SiteInput<string>;
    runLengthFt: SiteInput<number>;
  };
  // One design per possible service voltage. Two when the record doesn't say which.
  designs: ServiceDesign[];
};

const STANDARD_SERVICES = [
  { volts: 480, label: "480Y/277 V, 3-PHASE, 4-WIRE" },
  { volts: 208, label: "208Y/120 V, 3-PHASE, 4-WIRE" },
];

const round = (number: number, digits = 1) => Math.round(number * 10 ** digits) / 10 ** digits;
const amps = (number: number) => `${round(number)} A`;

function stateOf(value: Value | undefined): InputState {
  if (!value || value.state === "missing" || value.state === "unreadable") return "missing";
  if (value.state === "verified") return "verified";
  return "inferred";
}

function textInput(value: Value | undefined, label: string, missing: string): SiteInput<string> {
  const source = value?.label ?? label;
  if (value?.current?.type === "text") return { label, value: value.current.value, state: stateOf(value), source };
  if (value?.state === "conflicting" && value.candidates?.length) {
    const names = value.candidates.map((candidate) => (candidate.value.type === "text" ? candidate.value.value : "")).filter(Boolean);
    return { label, value: null, state: "missing", source, reason: `Candidates, none settled: ${names.join(", ")}.` };
  }
  return { label, value: null, state: "missing", source, reason: value?.reason ?? missing };
}

function ampsInput(value: Value | undefined, label: string, missing: string): SiteInput<number> {
  if (value?.current?.type === "quantity" && value.current.unit === "A") return { label, value: value.current.value, state: stateOf(value), source: value.label };
  return { label, value: null, state: "missing", source: value?.label ?? label, reason: value?.reason ?? missing };
}

// A printed service voltage as line-to-line volts: 480Y/277 V is 480 and 120/208 V is 208.
function serviceVolts(value: Value | undefined): SiteInput<number> {
  const label = "Service voltage";
  const current = value?.current;
  const read = current?.type === "quantity" ? current.value : current?.type === "text" ? Math.max(...[...current.value.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0])), 0) : 0;
  if (read > 0) return { label, value: read, state: stateOf(value), source: value!.label };
  return { label, value: null, state: "missing", source: value?.label ?? label, reason: value?.reason ?? "No evidence of the service voltage yet. A photo of the service label or the main switchgear nameplate supplies it." };
}

type Point = [number, number];
const FEET_PER_DEGREE = (6371008.8 * Math.PI * 3.280839895) / 180;

function pointsOf(feature: MapFeature): Point[] {
  const { geometry } = feature;
  if (geometry.type === "Point") return [geometry.coordinates as Point];
  if (geometry.type === "LineString") return geometry.coordinates as Point[];
  if (geometry.type === "Polygon") return (geometry.coordinates as Point[][])[0] ?? [];
  if (geometry.type === "MultiPolygon") return (geometry.coordinates as Point[][][]).flat(2) as unknown as Point[];
  return (geometry.coordinates as Point[][]).flat();
}

// The straight-line distance from the pad to where the service likely enters the building: a lower bound on the run.
function runLength(features: MapFeature[]): SiteInput<number> {
  const label = "Run length, pad to the main distribution panel";
  const pad = features.find((feature) => feature.kind === "candidate_area");
  const entrance = features.find((feature) => feature.attributes?.equipment_type?.type === "text" && feature.attributes.equipment_type.value === "service_entrance");
  const building = features.find((feature) => feature.kind === "building_outline");
  if (!pad || !(entrance ?? building)) return { label, value: null, state: "missing", source: "record geometry", reason: "The record has no candidate pad area or no building to measure to." };
  const padPoints = pointsOf(pad);
  const center: Point = [padPoints.reduce((sum, [x]) => sum + x, 0) / padPoints.length, padPoints.reduce((sum, [, y]) => sum + y, 0) / padPoints.length];
  const perLon = FEET_PER_DEGREE * Math.cos((center[1] * Math.PI) / 180);
  const local = ([x, y]: Point): Point => [(x - center[0]) * perLon, (y - center[1]) * FEET_PER_DEGREE];
  const target = (entrance ? pointsOf(entrance) : pointsOf(building!)).map(local);
  // The nearest point on any wall, not only the nearest corner.
  const toSegment = ([ax, ay]: Point, [bx, by]: Point) => {
    const dx = bx - ax;
    const dy = by - ay;
    const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
    return Math.hypot(ax + t * dx, ay + t * dy);
  };
  const distance = target.length === 1 ? Math.hypot(...target[0]!) : Math.min(...target.slice(1).map((point, index) => toSegment(target[index]!, point)));
  return {
    label,
    value: Math.round(distance),
    state: "estimate",
    source: entrance ? "candidate pad to the inferred service entrance" : "candidate pad to the nearest building wall",
    reason: "A straight line outside the building. The real route is longer, and the run inside the building to the panel isn't known.",
  };
}

// The smallest set of parallel conductors with enough ampacity, at least as many sets as the equipment needs.
function parallelConductors(required: number, material: Material, temperatureC: 75 | 90, minimumSets: number, smallest: Size): { sets: number; size: Size; ampacity: number } | null {
  const sizes = SIZES.slice(SIZES.indexOf(smallest));
  for (let sets = minimumSets; sets <= 6; sets++) {
    for (const size of sizes) {
      const each = ampacity(material, temperatureC, size);
      if (each && sets * each >= required) return { sets, size, ampacity: sets * each };
    }
  }
  return null;
}

function designFor(service: { volts: number; label: string }, state: InputState, inputs: ElectricalDesign["inputs"], config: Configuration): ServiceDesign {
  const { battery, dcCable, inverter, isolationTransformer, disconnect, breaker, auxDisconnect } = config;
  const calculations: Calculation[] = [];
  const schedule: ScheduleRow[] = [];
  const voltageNote = state === "verified" ? "" : ` Assumes a ${service.label.toLowerCase()} service, which the record doesn't confirm.`;

  // 1. Battery to inverters, DC.
  const dcAmps = (battery.outputKw * 1000) / battery.dcMinV;
  calculations.push({
    id: "dc",
    title: "1. BESS TO INVERTERS (DC)",
    citation: "Manufacturer's cable rating; sized at the battery's minimum DC voltage",
    steps: [`${battery.outputKw} kW per output ÷ ${battery.dcMinV} V minimum = ${amps(dcAmps)} per output`, `${dcCable.name}: ${dcCable.ampacity} A (${dcCable.ratingNote})`],
    result: `${dcCable.ampacity} A ≥ ${amps(dcAmps)}, margin ${round(dcCable.ampacity / dcAmps, 2)}`,
    status: dcCable.ampacity >= dcAmps ? "passes" : "fails",
  });
  schedule.push({ tag: 1, from: battery.tag, to: inverter.tag, conductors: `${battery.outputs} × ${dcCable.name}, + AND −`, ground: "PER MANUFACTURER", conduit: "BY ENGINEER" });

  // 2. Each inverter to the isolation transformer, AC at 480 V.
  const perInverter = inverter.maxAcA * CONTINUOUS_FACTOR;
  const inverterConductor = parallelConductors(perInverter, "Cu", inverter.conductorTempC, 1, "6");
  const withinTerminal = inverterConductor && SIZES.indexOf(inverterConductor.size) <= SIZES.indexOf(inverter.maxConductor);
  calculations.push({
    id: "inverter-ac",
    title: "2. EACH INVERTER TO THE ISOLATION TRANSFORMER (AC)",
    citation: "2023 NEC 210.19(A)(1), Table 310.16 (Cu, 90 °C, as the manual allows)",
    steps: [`${inverter.maxAcA} A maximum per unit × ${CONTINUOUS_FACTOR} = ${amps(perInverter)}`, inverterConductor ? `${label(inverterConductor.size)} Cu at 90 °C = ${inverterConductor.ampacity} A` : "No single conductor in the table carries it"],
    result: inverterConductor && withinTerminal ? `${label(inverterConductor.size)} Cu, ${inverterConductor.ampacity} A ≥ ${amps(perInverter)}` : `Needs more than the ${label(inverter.maxConductor)} the terminals accept`,
    status: inverterConductor && withinTerminal ? "passes" : "fails",
  });
  schedule.push({ tag: 2, from: inverter.tag, to: isolationTransformer.tag, conductors: inverterConductor ? `3 × ${label(inverterConductor.size)} CU 90 °C PER INVERTER` : "BY ENGINEER", ground: "3 AWG CU (PER MANUFACTURER)", conduit: "BY ENGINEER" });

  // 3 and 4. Transformer to disconnect, and disconnect to the new breaker, at the service voltage.
  const continuous = inverter.count * inverter.maxAcA * (inverter.voltage / service.volts);
  const required = continuous * CONTINUOUS_FACTOR;
  const ocpd = nextStandardOcpd(required);
  // 2023 NEC 240.4(B) lets the next standard size protect conductors up to 800 A. Above that, 240.4(C) needs the full rating.
  const needed = ocpd && ocpd > 800 ? ocpd : required;
  const feeder = parallelConductors(needed, "Al", 75, Math.max(disconnect.landings, 1), "250");
  const ground = ocpd ? groundingConductor(ocpd, "Al") : null;
  const standardParts = ocpd === breaker.amps;
  for (const [id, title, from, to] of [
    ["xfmr-disc", "3. ISOLATION TRANSFORMER TO THE AC DISCONNECT", isolationTransformer.tag, disconnect.tag],
    ["disc-cb", "4. AC DISCONNECT TO THE NEW BREAKER", disconnect.tag, breaker.tag],
  ] as const) {
    calculations.push({
      id,
      title,
      citation: "2023 NEC 215.2(A)(1), 240.4, 240.6(A), Table 310.16 (Al, 75 °C), Table 250.122",
      steps: [
        `${inverter.count} × ${inverter.maxAcA} A at ${inverter.voltage} V = ${amps(continuous)} at ${service.volts} V`,
        `${amps(continuous)} × ${CONTINUOUS_FACTOR} = ${amps(required)}; next standard overcurrent device ${ocpd ?? "none"} A`,
        feeder ? `${feeder.sets} sets × ${label(feeder.size)} Al at 75 °C = ${feeder.ampacity} A` : "No parallel set up to 6 × 600 kcmil carries it",
        ground ? `Equipment ground at ${ocpd} A: ${label(ground)} Al (Table 250.122)` : "Equipment ground beyond the transcribed rows",
      ],
      result: feeder ? `${feeder.sets} × ${label(feeder.size)} Al per phase, ${feeder.ampacity} A ≥ ${amps(needed)}` : "Engineer selects the conductors",
      status: feeder ? "passes" : "fails",
      note: voltageNote.trim() || undefined,
    });
    schedule.push({
      tag: id === "xfmr-disc" ? 3 : 4,
      from,
      to,
      conductors: feeder ? `${feeder.sets} × ${label(feeder.size)} AL 75 °C PER PHASE${id === "xfmr-disc" ? ", PLUS NEUTRAL" : ""}` : "BY ENGINEER",
      ground: ground ? `${label(ground)} AL PER CONDUIT` : "BY ENGINEER",
      conduit: feeder ? `${feeder.sets} CONDUITS, SIZE BY ENGINEER` : "BY ENGINEER",
    });
  }

  // The isolation transformer carries the inverters' output.
  const kva = inverter.count * inverter.kw;
  calculations.push({
    id: "xfmr",
    title: "5. ISOLATION TRANSFORMER RATING",
    citation: "Manufacturer ratings",
    steps: [`${inverter.count} × ${inverter.kw} kW = ${kva} kW at unity power factor`, `${isolationTransformer.kva} kVA, ${isolationTransformer.primary} to ${service.label}`],
    result: `${isolationTransformer.kva} kVA ≥ ${kva} kVA`,
    status: isolationTransformer.kva >= kva ? "passes" : "fails",
  });

  // The 120% busbar check, which most often decides how the battery connects.
  const main = inputs.mainBreakerA.value;
  const bus = inputs.busRatingA.value;
  const backfeed = continuous * CONTINUOUS_FACTOR;
  if (main === null || bus === null) {
    calculations.push({
      id: "busbar",
      title: "6. MAIN DISTRIBUTION PANEL BUSBAR (120% RULE)",
      citation: "2023 NEC 705.12(B)(3)(2)",
      steps: [
        `Source output ${amps(continuous)} × ${CONTINUOUS_FACTOR} = ${amps(backfeed)}`,
        `Needs ${[main === null && "the main breaker rating", bus === null && "the busbar rating"].filter(Boolean).join(" and ")}, from the panel nameplate.`,
        `With a main breaker equal to the bus, the bus must be at least ${Math.ceil(round(backfeed / (BUSBAR_FACTOR - 1), 6))} A.`,
      ],
      result: "Needs the panel's main breaker and busbar ratings",
      status: "needs_input",
      note: "If the bus doesn't pass, a supply-side connection under 2023 NEC 705.11 is a route to evaluate.",
    });
  } else {
    const limit = BUSBAR_FACTOR * bus;
    const total = backfeed + main;
    calculations.push({
      id: "busbar",
      title: "6. MAIN DISTRIBUTION PANEL BUSBAR (120% RULE)",
      citation: "2023 NEC 705.12(B)(3)(2)",
      steps: [`${amps(backfeed)} + ${main} A main = ${amps(total)}`, `${BUSBAR_FACTOR * 100}% × ${bus} A bus = ${amps(limit)}`],
      result: total <= limit ? `${amps(total)} ≤ ${amps(limit)}` : `${amps(total)} > ${amps(limit)}`,
      status: total <= limit ? "passes" : "fails",
      note: total <= limit ? undefined : "The load-side breaker doesn't fit this bus. A supply-side connection under 2023 NEC 705.11 is a route to evaluate.",
    });
  }

  // Voltage drop on the long run, from the estimated length.
  const run = inputs.runLengthFt.value;
  if (feeder && run !== null) {
    const ohms = resistancePerKft("Al", feeder.size)! / feeder.sets;
    const drop = (Math.sqrt(3) * continuous * ohms * run) / 1000;
    const percent = (drop / service.volts) * 100;
    calculations.push({
      id: "voltage-drop",
      title: "7. VOLTAGE DROP, DISCONNECT TO THE PANEL (ESTIMATE)",
      citation: "2023 NEC Chapter 9 Table 8; 215.2(A)(2) Informational Note suggests 3% for feeders",
      steps: [`Estimated run ${run} ft (${inputs.runLengthFt.source}, straight line)`, `√3 × ${amps(continuous)} × ${round(ohms, 4)} Ω/kft × ${run} ft ÷ 1000 = ${round(drop, 2)} V`],
      result: `${round(percent, 2)}% of ${service.volts} V`,
      status: percent <= 3 ? "passes" : "fails",
      note: "Estimate: the real route is longer than a straight line, and the run inside the building isn't known.",
    });
  } else {
    calculations.push({
      id: "voltage-drop",
      title: "7. VOLTAGE DROP, DISCONNECT TO THE PANEL",
      citation: "2023 NEC Chapter 9 Table 8",
      steps: [inputs.runLengthFt.reason ?? "No run length"],
      result: "Needs the run length from the pad to the panel",
      status: "needs_input",
    });
  }

  calculations.push({
    id: "fault-current",
    title: "8. AVAILABLE FAULT CURRENT AND EQUIPMENT RATINGS",
    citation: "2023 NEC 110.9, 110.10",
    steps: [inputs.faultCurrentA.value !== null ? `Available fault current ${inputs.faultCurrentA.value} A` : (inputs.faultCurrentA.reason ?? "The utility states the available fault current on request.")],
    result: "Needs the utility's available fault current and each device's interrupting rating",
    status: "needs_input",
  });

  const utilityLines = [inputs.utility.value ? inputs.utility.value.toUpperCase() : `UTILITY NOT SETTLED${inputs.utility.reason ? `: ${inputs.utility.reason.replace(/^Candidates, none settled: /, "").replace(/\.$/, "").toUpperCase()}` : ""}`, inputs.feeder.value ? `FEEDER ${inputs.feeder.value} (${inputs.feeder.state === "verified" ? "VERIFIED" : "FROM PUBLIC MAP"})` : "FEEDER BY UTILITY"];
  const items: LineItem[] = [
    { id: "utility", status: "E", title: "UTILITY GRID", lines: utilityLines, known: Boolean(inputs.utility.value) },
    {
      id: "service-transformer",
      status: "E",
      title: "UTILITY SERVICE TRANSFORMER",
      lines: ["KVA AND IMPEDANCE BY UTILITY", inputs.servicePath.value ? "LOCATION INFERRED, NOT FIELD VERIFIED" : "LOCATION NOT FOUND"],
      known: false,
      inferred: Boolean(inputs.servicePath.value),
    },
    { id: "meter", status: "E", title: "REVENUE METER", lines: [inputs.meterNumber.value ? `METER NO. ${inputs.meterNumber.value}` : "METER NO. FROM THE UTILITY BILL"], known: Boolean(inputs.meterNumber.value) },
    {
      id: "main-switchgear",
      status: "E",
      title: "MAIN DISTRIBUTION PANEL",
      lines: [
        `SERVICE ${state === "missing" ? `${service.label} (ASSUMED)` : service.label}`,
        bus !== null ? `BUS ${bus} A` : "BUS RATING NEEDED (NAMEPLATE)",
        main !== null ? `MAIN ${main} A` : "MAIN BREAKER NEEDED (NAMEPLATE)",
      ],
      known: bus !== null && main !== null && state !== "missing",
    },
    { id: "breaker", status: "N", title: breaker.name, lines: standardParts ? [breaker.model, `${breaker.amps} A, 3-POLE`] : [`${ocpd ?? "?"} A, 3-POLE`, "MODEL BY ENGINEER"], known: true },
    { id: "disconnect", status: "N", title: disconnect.name, lines: standardParts ? [disconnect.model, `${disconnect.amps} A, ${disconnect.volts} V`] : [`${ocpd ?? "?"} A`, "MODEL BY ENGINEER"], known: true },
    { id: "isolation-transformer", status: "N", title: isolationTransformer.name, lines: [`${isolationTransformer.kva} KVA`, `${isolationTransformer.primary} TO ${service.label}`], known: true },
    { id: "inverters", status: "N", title: `${inverter.count} × ${inverter.name}`, lines: [inverter.model, `${inverter.kw} KW EACH, ${inverter.voltage} V, ${inverter.maxAcA} A MAX`], known: true },
    { id: "bess", status: "N", title: battery.name, lines: [battery.model, `${battery.kwh} KWH, ${battery.dcMinV}-${battery.dcMaxV} VDC`], known: true },
    { id: "aux", status: "N", title: auxDisconnect.name, lines: [`${auxDisconnect.amps} A, 3-POLE${service.volts === 480 ? ", 480 V" : ", VOLTAGE BY ENGINEER"}`], known: true },
  ];

  return { serviceVoltage: service.volts, serviceLabel: service.label, serviceState: state, items, schedule, calculations };
}

// The single-line, conductor schedule, and calculations for the configuration, from what the record knows.
// Everything here is a concept calculation for the engineer of record to verify.
export function designFromRecord(record: RecordVersion, config: Configuration = PLAN_SET_250KW_760KWH): ElectricalDesign {
  const values = new Map(record.values.map((value) => [value.field, value]));
  const inputs: ElectricalDesign["inputs"] = {
    utility: textInput(values.get("serving_utility"), "Serving utility", "No utility named yet. The bill names it."),
    feeder: textInput(values.get("feeder"), "Feeder", "The utility confirms the feeder."),
    servicePath: textInput(values.get("grid_service_path"), "How the building is fed", "No service path traced from public data."),
    serviceVoltage: serviceVolts(values.get("service_voltage")),
    mainBreakerA: ampsInput(values.get("main_device_rating"), "Main breaker rating", "From the main distribution panel's nameplate."),
    busRatingA: ampsInput(values.get("bus_rating"), "Busbar rating", "From the main distribution panel's nameplate, read by a qualified person."),
    faultCurrentA: ampsInput(values.get("available_fault_current_a"), "Available fault current", "The utility states it on request."),
    meterNumber: textInput(values.get("meter_number"), "Meter number", "The utility bill shows it."),
    runLengthFt: runLength(record.features),
  };
  const known = inputs.serviceVoltage.value;
  const services = known === null ? STANDARD_SERVICES : [STANDARD_SERVICES.find((service) => service.volts === known) ?? { volts: known, label: `${known} V, 3-PHASE` }];
  return {
    note: CONCEPT_NOTE,
    configuration: { name: config.name, provenance: config.provenance },
    site: { address: record.site.address, recordVersionId: record.id, version: record.version },
    inputs,
    designs: services.map((service) => designFor(service, inputs.serviceVoltage.state, inputs, config)),
  };
}
