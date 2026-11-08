import type { RecordVersion, Value } from "@eqore/contract";
import { PLAN_SET_250KW_760KWH, type Configuration } from "./catalog.ts";
import { designFromRecord, type InputState } from "./design.ts";

// A draft of the Pre-Application Report request, from National Grid's Massachusetts interconnection tariff
// (M.D.P.U. No. 1599, Section 3.2 and Exhibit B). A facility of 250 kW or more must request the report before
// applying. The draft fills what the record knows, leaves contacts and customer facts to people, and sets the 16
// items the utility will report beside what public data already suggests, so the report confirms or corrects them.

export const PRE_APPLICATION_NOTE = "DRAFT FROM PUBLIC DATA AND A CONCEPT CONFIGURATION. A PERSON REVIEWS AND SUBMITS IT. THE REPORT IS NON-BINDING.";

const TARIFF = "National Grid (Massachusetts Electric Company), Standards for Interconnection of Distributed Generation, M.D.P.U. No. 1599, effective June 1, 2025";

export type DraftState = InputState | "needs_input";
export type DraftAnswer = { item: string; answer: string | null; state: DraftState; from: string; reason?: string; who?: "customer" | "engineer" };
export type ReportItem = { number: number; asks: string; publicData: string | null; from: string | null; state: DraftState };

export type PreApplicationDraft = {
  note: string;
  form: string;
  // Whether this utility's form is the one drafted, from the record's serving utility.
  utility: { name: string | null; formApplies: boolean; reason: string };
  sizeKw: number;
  required: boolean;
  fee: { usd: number; reason: string };
  contacts: DraftAnswer[];
  facility: DraftAnswer[];
  reportItems: ReportItem[];
  disclaimer: string;
};

const RADIUS_M = 6371008.8;
const HALF_MILE_M = 804.672;

function show(value: Value | undefined): string | null {
  const current = value?.current;
  if (!current || value!.state === "missing" || value!.state === "unreadable") return null;
  if (current.type === "text") return current.value;
  if (current.type === "quantity") return `${current.value} ${current.unit}`;
  if (current.type === "boolean") return current.value ? "yes" : "no";
  return null;
}

const sentence = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

function stateOf(value: Value | undefined): DraftState {
  if (!value || value.state === "missing" || value.state === "unreadable") return "needs_input";
  return value.state === "verified" ? "verified" : "inferred";
}

function metersBetween([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * RADIUS_M * Math.asin(Math.sqrt(a));
}

// Feeders whose mapped lines pass within half a mile of the site, by name.
function feedersWithinHalfMile(record: RecordVersion): string[] {
  const names = new Set<string>();
  const site = record.site.location;
  if (!site) return [];
  for (const feature of record.features) {
    const feeder = feature.attributes?.feeder;
    if (feature.kind !== "utility_line" || feeder?.type !== "text") continue;
    const geometry = feature.geometry;
    const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.type === "MultiLineString" ? geometry.coordinates : [];
    if (lines.some((line) => line.some((point) => metersBetween(site, point as [number, number]) <= HALF_MILE_M))) names.add(feeder.value);
  }
  return [...names].sort();
}

// The tariff's fee table, Section 3.2.
function feeFor(kw: number): { usd: number; reason: string } {
  if (kw < 250) return { usd: 100, reason: "Under 250 kW, from the fee table in Section 3.2." };
  if (kw <= 500) return { usd: 250, reason: "250 kW to 500 kW, from the fee table in Section 3.2." };
  return { usd: 750, reason: "Over 500 kW, from the fee table in Section 3.2." };
}

export function preApplicationDraft(record: RecordVersion, config: Configuration = PLAN_SET_250KW_760KWH): PreApplicationDraft {
  const values = new Map(record.values.map((value) => [value.field, value]));
  const get = (field: string) => values.get(field);
  const sizeKw = config.inverter.count * config.inverter.model.ac!.kw;
  const utility = show(get("serving_utility"));
  const candidates = (get("serving_utility")?.candidates ?? []).map((candidate) => (candidate.value.type === "text" ? candidate.value.value : "")).filter(Boolean);
  const formApplies = utility !== null && /national grid|massachusetts electric/i.test(utility);
  const design = designFromRecord(record, config);
  const busbar = design.designs[0]?.calculations.find((calculation) => calculation.id === "busbar");
  const from = (field: string) => get(field)?.label ?? field;
  const fromRecord = (item: string, field: string, missing: string, who: DraftAnswer["who"]): DraftAnswer => {
    const answer = show(get(field));
    return answer === null ? { item, answer: null, state: "needs_input", from: from(field), reason: get(field)?.reason ?? missing, who } : { item, answer, state: stateOf(get(field)), from: from(field) };
  };
  const location = record.site.location;

  const contacts: DraftAnswer[] = ["Interconnecting customer name, contact person, mailing address, telephone, and email", "Alternative contact, such as the installer"].map((item) => ({
    item,
    answer: null,
    state: "needs_input",
    from: "the customer",
    reason: "Contact details come from the people involved. They aren't drawn from public data or kept in the record.",
    who: "customer",
  }));

  const phase = show(get("feeder_phase"));
  const facility: DraftAnswer[] = [
    { item: "1) Proposed facility location: street address", answer: record.site.address, state: "verified", from: "the address the site was run from" },
    location
      ? { item: "1) GPS coordinates", answer: `${location[1].toFixed(6)}, ${location[0].toFixed(6)}`, state: "inferred", from: "the record's site point", reason: "The parcel or geocoded point. The facility's own location is the concept pad, which the engineer places." }
      : { item: "1) GPS coordinates", answer: null, state: "needs_input", from: "the record's site point", reason: "The site hasn't been located on a map.", who: "customer" },
    { item: "1) Cross streets", answer: null, state: "needs_input", from: "the customer", reason: "The record names the fronting road only.", who: "customer" },
    { item: "1) Map still picture", answer: null, state: "needs_input", from: "the customer", reason: "The form asks for a Google Map still picture, which a person captures. The site map export can go with it.", who: "customer" },
    { item: "2) Generation type", answer: "Battery energy storage, inverter-based", state: "estimate", from: config.name, reason: config.provenance },
    { item: "3) Size (AC kW)", answer: `${sizeKw} kW`, state: "estimate", from: config.name, reason: `${config.inverter.count} × ${config.inverter.model.ac!.kw} kW inverters. ${config.provenance}` },
    {
      item: "4) Single or three phase",
      answer: "Three phase",
      state: "estimate",
      from: config.name,
      reason: `The configuration's inverters are three-phase at ${config.inverter.model.ac!.nominalV} V.${phase && /1|single/i.test(phase) ? ` The mapped feeder is ${phase}, so three-phase may not reach the site.` : ""}`,
    },
    { item: "5) Stand-alone, with no on-site load?", answer: "No", state: "estimate", from: "the concept layout", reason: "The concept puts the battery behind the building's meter. The engineer confirms.", who: "engineer" },
    fromRecord("6a) Account number", "account_number", "The customer's electric bill shows it.", "customer"),
    { item: "6b) Minimum load (kW)", answer: null, state: "needs_input", from: "interval data", reason: "Interval data or the customer's meter shows it.", who: "customer" },
    fromRecord("6b) Maximum load (kW)", "peak_demand_kw", "The billed peak demand on the customer's electric bill.", "customer"),
    {
      item: "7) New service or service upgrade needed?",
      answer: busbar?.status === "passes" ? "Not indicated by the concept busbar check" : busbar?.status === "fails" ? "Possibly: the concept busbar check fails" : null,
      state: busbar?.status === "passes" || busbar?.status === "fails" ? "estimate" : "needs_input",
      from: "the concept busbar calculation",
      reason: busbar?.status === "needs_input" || !busbar ? `${sentence(busbar?.result ?? "No busbar check")} The bus and main breaker ratings come from the panel's nameplate.` : `${sentence(busbar.result)} The engineer of record decides.`,
      who: "engineer",
    },
  ];

  const feeders = feedersWithinHalfMile(record);
  const overhead = /\boverhead\b/i.test(show(get("grid_service_path")) ?? "");
  const item = (number: number, asks: string, field: string | null): ReportItem => {
    const answer = field ? show(get(field)) : null;
    return { number, asks, publicData: answer, from: field && answer !== null ? from(field) : null, state: field && answer !== null ? stateOf(get(field)) : "needs_input" };
  };
  const installed = show(get("feeder_installed_dg"));
  const queued = show(get("feeder_queued_dg"));
  const reportItems: ReportItem[] = [
    item(1, "Circuit voltage at the substation", "feeder_voltage"),
    item(2, "Circuit name", "feeder"),
    item(3, "Circuit voltage at the proposed facility", "feeder_voltage"),
    item(4, "Substation name", "feeder_substation"),
    item(5, "Substation transformer rating", null),
    item(6, "Whether single or three phase is available near the site", "feeder_phase"),
    item(7, "If single phase, the distance to three-phase service", null),
    {
      number: 8,
      asks: "Connected and applied-for facilities on the circuit, in kW by technology",
      publicData: installed || queued ? [installed && `installed ${installed}`, queued && `queued ${queued}`].filter(Boolean).join(", ") : null,
      from: installed || queued ? "the utility's hosting capacity map" : null,
      state: installed || queued ? stateOf(get("feeder_installed_dg") ?? get("feeder_queued_dg")) : "needs_input",
    },
    item(9, "Connected and applied-for facilities on the substation transformer", null),
    item(10, "Whether 3V0 protection is deployed or scheduled on the circuit or substation", null),
    overhead
      ? { number: 11, asks: "Whether the site is served by an area network, a spot network, or a radial system", publicData: "likely radial: the service looks overhead, and networks are fed underground", from: from("grid_service_path"), state: "inferred" }
      : item(11, "Whether the site is served by an area network, a spot network, or a radial system", null),
    {
      number: 12,
      asks: "Feeders within half a mile of the site",
      publicData: feeders.length ? feeders.join(", ") : null,
      from: feeders.length ? "feeder lines drawn from the utility's map" : null,
      state: feeders.length ? "inferred" : "needs_input",
    },
    item(13, "The nearest feeder's circuit rating and length to the substation", "feeder_rating_mva"),
    item(14, "Whether the facility is likely to go to the Standard track", "feeder_hosting_capacity"),
    item(15, "Whether an Affected System Operator study is required or under way", null),
    item(16, "Other system constraints or critical items", "feeder_limiting_criterion"),
  ];

  return {
    note: PRE_APPLICATION_NOTE,
    form: `Exhibit B, Generating Facility Expedited/Standard Pre-Application Report Form. ${TARIFF}.`,
    utility: {
      name: utility,
      formApplies,
      reason: formApplies
        ? "The record's serving utility is National Grid, whose form this is."
        : utility
          ? `The record's serving utility is ${utility}. This draft follows National Grid's form, and ${utility} files its own, so check its form and fees.`
          : `The serving utility isn't settled${candidates.length ? ` (candidates: ${candidates.join(", ")})` : ""}. This draft follows National Grid's form; check the serving utility's own.`,
    },
    sizeKw,
    required: sizeKw >= 250,
    fee: feeFor(sizeKw),
    contacts,
    facility,
    reportItems,
    disclaimer: "The Pre-Application Report is a snapshot in time and is non-binding. System conditions change. The utility issues it within 10 business days of the fee.",
  };
}

// The draft as plain text, for a person to review and copy into the utility's form.
export function preApplicationText(draft: PreApplicationDraft): string {
  const mark = (state: DraftState) => (state === "needs_input" ? "NEEDS INPUT" : state.toUpperCase());
  const answer = (row: DraftAnswer) => `- ${row.item}: ${row.answer ?? "—"} [${mark(row.state)}${row.who ? `, ${row.who}` : ""}]${row.reason ? `\n    ${row.reason}` : ""}`;
  return [
    draft.note,
    draft.form,
    draft.utility.reason,
    `Size ${draft.sizeKw} kW: the report is ${draft.required ? "required (250 kW or more)" : "optional (under 250 kW)"}. Fee $${draft.fee.usd}. ${draft.fee.reason}`,
    "",
    "CONTACTS",
    ...draft.contacts.map(answer),
    "",
    "FACILITY INFORMATION",
    ...draft.facility.map(answer),
    "",
    "WHAT THE REPORT WILL STATE, BESIDE WHAT PUBLIC DATA SUGGESTS",
    ...draft.reportItems.map((row) => `${row.number}) ${row.asks}: ${row.publicData ? `${row.publicData} (${row.from}, ${mark(row.state)})` : "not found in public data for this site"}`),
    "",
    draft.disclaimer,
  ].join("\n");
}
