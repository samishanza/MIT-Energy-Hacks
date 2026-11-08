import type { JsonReading, JsonRequest, JsonSource } from "../json-api.ts";
import { parseAddress } from "../resolve-site.ts";

// Electrical service facts from city permit records, which is the only public place they appear. A permit
// describes work at the address when it was issued. It may have been superseded since, and a service field can
// describe something other than the building's main service, so every value is inferred with the permit cited.

type Row = Record<string, string | undefined>;

const quantity = (value: number, unit: string) => ({ type: "quantity" as const, value, unit });
const text = (value: string) => ({ type: "text" as const, value });
const number = (raw: string | undefined) => {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
};
const day = (raw: string | undefined) => (raw ? raw.slice(0, 10) : null);
const excerpt = (raw: string | undefined) => (raw ? ` Work: "${raw.replace(/\s+/g, " ").trim().slice(0, 140)}".` : "");

// Work that isn't the building's own service, such as street lighting filed under a public address.
const NOT_THE_BUILDING = /street\s*light|traffic signal|temporary|festival|event|tent|food truck/i;

// The house number and first word of the street, for a LIKE match on how a city writes its addresses.
function streetPrefix(address: string): string | null {
  const parsed = parseAddress(address);
  const [number, word] = parsed?.street.split(" ") ?? [];
  return number && /^\d/.test(number) && word ? `${number} ${word}`.replace(/[%_'\\]/g, "") : null;
}

// Values written in a permit's free text: "1200 amp 277/480 volt 3 phase service", "500 kVA pad mount transformer".
// Only a clause about the service counts, so a sub panel or a feeder isn't read as the service. A transformer
// counts only when the clause says it's the utility's, on a pad or a pole, not a step-down inside the building.
export function parsePermitText(text: string): { amps?: number; volts?: string; phase?: 1 | 3; transformerKva?: number } {
  const found: ReturnType<typeof parsePermitText> = {};
  const clauses = text.split(/[.;\n]|,\s+/);
  const kva = /\b(\d{2,4})\s*kva\b/i.exec(clauses.filter((clause) => /\bkva\b/i.test(clause) && /\bpad\b|\bpole\b|\butility\b|\bservice\b/i.test(clause)).join(" "));
  if (kva) found.transformerKva = Number(kva[1]);
  const description = clauses.filter((clause) => /\bservice\b/i.test(clause) && !/\bsub\s*-?\s*panel|\bfeeder|\btemporary|\btemp\b/i.test(clause)).join(" ");
  const amps = /\b(\d{3,4})\s*-?\s*(?:a\b|amps?\b|ampere)/i.exec(description);
  if (amps) found.amps = Number(amps[1]);
  const pair = /\b(120|208|240|277|347|480|600)\s*\/\s*(120|208|240|277|347|480|600)\s*(?:v\b|volts?)?/i.exec(description);
  const single = /\b(120|208|240|277|480|600)\s*-?\s*(?:v\b|volts?)/i.exec(description);
  if (pair) found.volts = `${Math.min(Number(pair[1]), Number(pair[2]))}/${Math.max(Number(pair[1]), Number(pair[2]))} V`;
  else if (single) found.volts = `${single[1]} V`;
  const phase = /\b(3|three|1|single)[\s-]*(?:ph\b|phase)/i.exec(description);
  if (phase) found.phase = /^(3|three)$/i.test(phase[1]!) ? 3 : 1;
  return found;
}

function serviceReadings(rows: { date: string | null; id: string; reason: string; amps: number | null; volts: string | null; construction: string | null; phase: 1 | 3 | null; kva: number | null }[], citation: string): JsonReading[] {
  const readings: JsonReading[] = [];
  const firstWith = <K extends "amps" | "volts" | "construction" | "phase" | "kva">(key: K) => rows.find((row) => row[key] !== null);
  const cite = (row: (typeof rows)[number]) => `${citation} permit ${row.id}, issued ${row.date ?? "on an unstated date"}.${row.reason}`;
  const amps = firstWith("amps");
  if (amps) readings.push({ field: "service_size_a", value: quantity(amps.amps!, "A"), attribute: `permit ${amps.id}`, grade: "reference", sourceDate: amps.date, reason: `From ${cite(amps)}` });
  const volts = firstWith("volts");
  if (volts) readings.push({ field: "service_voltage", value: text(volts.volts!), attribute: `permit ${volts.id}`, grade: "reference", sourceDate: volts.date, reason: `From ${cite(volts)}` });
  const construction = firstWith("construction");
  if (construction) readings.push({ field: "service_construction", value: text(construction.construction!), attribute: `permit ${construction.id}`, grade: "reference", sourceDate: construction.date, reason: `From ${cite(construction)}` });
  const phase = firstWith("phase");
  if (phase) readings.push({ field: "service_phase", value: quantity(phase.phase!, "phase"), attribute: `permit ${phase.id}`, grade: "reference", sourceDate: phase.date, reason: `From ${cite(phase)}` });
  const kva = firstWith("kva");
  if (kva) readings.push({ field: "transformer_kva", value: quantity(kva.kva!, "kVA"), attribute: `permit ${kva.id}`, grade: "reference", sourceDate: kva.date, reason: `From ${cite(kva)}` });
  return readings;
}

function summary(count: number, latest: string | null, citation: string): JsonReading {
  return {
    field: "electrical_permit_history",
    value: text(`${count} electrical permit${count === 1 ? "" : "s"} on file${latest ? `, the latest issued ${latest}` : ""}`),
    attribute: "permits found by address",
    grade: "reference",
    sourceDate: latest,
    reason: `${citation} records, matched by house number and street. A permit shows work when it was issued, which may have changed since.`,
  };
}

// Cambridge records the existing and new service in separate fields: amps, volts, meters, overhead or underground.
export const cambridgeElectricalPermits: JsonSource = {
  id: "cambridge-electrical-permits",
  name: "City of Cambridge electrical permits",
  url: "https://data.cambridgema.gov/resource/hvtc-3ab9.json",
  licenseNote: "City of Cambridge open data, Open Data Commons Public Domain Dedication and License (PDDL). robots.txt asks Crawl-delay: 1 and allows /resource/.",
  robotsChecked: "2026-11-07",
  cities: ["CAMBRIDGE"],
  fields: ["electrical_permit_history"],
  params: ({ address }: JsonRequest) => {
    const prefix = streetPrefix(address) ?? "";
    return { $where: `upper(full_address) like '${prefix}%'`, $order: "issue_date DESC", $limit: "50" };
  },
  read: (body) => {
    const rows = (Array.isArray(body) ? body : []) as Row[];
    if (rows.length === 0) return [];
    const service = rows
      .filter((row) => !NOT_THE_BUILDING.test(`${row.description ?? ""} ${row.proposed_work_description ?? ""}`))
      .map((row) => {
        const isNew = number(row.amps_new_service) !== null;
        const prefix = isNew ? "new_service" : "existing_service";
        const volts = number(isNew ? row.volts_new_service : row.volts_existing_service);
        const overhead = (isNew ? row.overhead_new_service : row.overhead_existing) === "true";
        const underground = (isNew ? row.underground_new_service : row.underground_existing) === "true";
        const amps = number(row[`amps_${prefix}`]);
        const construction = overhead ? "overhead" : underground ? "underground" : null;
        const recorded = [amps ? `${amps} A` : "", volts ? `${volts} V` : "", construction ?? ""].filter(Boolean).join(", ");
        return {
          date: day(row.issue_date),
          id: row.id ?? "without a number",
          reason: ` The permit's ${isNew ? "new" : "existing"} service fields record ${recorded || "no service values"}.${excerpt(row.description ?? row.proposed_work_description)}`,
          amps,
          volts: volts ? `${volts} V` : null,
          construction,
          phase: null,
          kva: null,
        };
      });
    return [summary(rows.length, day(rows[0]!.issue_date), "City of Cambridge"), ...serviceReadings(service, "City of Cambridge")];
  },
  emptyReason: "The City of Cambridge has no electrical permit on file at this address.",
};

// Somerville records only a free-text description, read with fixed patterns, never a model.
export const somervilleElectricalPermits: JsonSource = {
  id: "somerville-electrical-permits",
  name: "City of Somerville permit applications",
  url: "https://data.somervillema.gov/resource/nneb-s3f7.json",
  licenseNote: "City of Somerville open data, Open Database License (ODbL): derived data stays under ODbL with attribution. robots.txt asks Crawl-delay: 1 and allows /resource/.",
  robotsChecked: "2026-11-07",
  cities: ["SOMERVILLE"],
  fields: ["electrical_permit_history"],
  params: ({ address }: JsonRequest) => {
    const prefix = streetPrefix(address) ?? "";
    return { $where: `upper(application_address) like '${prefix}%' AND application_type = 'Electrical Permit'`, $order: "issue_date DESC", $limit: "50" };
  },
  read: (body) => {
    const rows = (Array.isArray(body) ? body : []) as Row[];
    if (rows.length === 0) return [];
    const service = rows
      .filter((row) => !NOT_THE_BUILDING.test(row.project_description_or_business_name ?? ""))
      .map((row) => {
        const parsed = parsePermitText(row.project_description_or_business_name ?? "");
        return {
          date: day(row.issue_date),
          id: row.application_number ?? row.application_id ?? "without a number",
          reason: `${excerpt(row.project_description_or_business_name)} Read from the permit's text.`,
          amps: parsed.amps ?? null,
          volts: parsed.volts ?? null,
          construction: null,
          phase: parsed.phase ?? null,
          kva: parsed.transformerKva ?? null,
        };
      });
    return [summary(rows.length, day(rows[0]!.issue_date), "City of Somerville (ODbL)"), ...serviceReadings(service, "City of Somerville")];
  },
  emptyReason: "The City of Somerville has no electrical permit application on file at this address.",
};
