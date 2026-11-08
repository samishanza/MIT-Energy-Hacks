import type { MapFeature, RecordVersion } from "@eqore/contract";
import { CONFIGURATIONS } from "@eqore/electrical";
import { feederDetails, feederSummary, formatReading, plainLabel, printed } from "@eqore/sheets";
import { useState } from "react";

// What we know about one piece of equipment, as a short specification table. Missing values
// say who supplies them. How the item was found, and why it could be off, is folded away below.

type Row = [string, string];
const BY_UTILITY = "By utility";
const BY_ENGINEER = "By engineer";

const attr = (f: MapFeature, key: string) => {
  const a = f.attributes?.[key] as { type?: string; value?: unknown; unit?: string } | undefined;
  if (!a || a.value === undefined || a.value === null) return null;
  return a.type === "quantity" ? `${a.value} ${a.unit === "ft" ? "ft" : (a.unit ?? "")}`.trim() : String(a.value);
};
const typeOf = (f: MapFeature) => String((f.attributes?.["equipment_type"] as { value?: unknown } | undefined)?.value ?? "");
const sentence = (text: string | null) => (text ? text.charAt(0) + text.slice(1).toLowerCase() : null);
const value = (record: RecordVersion, field: string) => sentence(printed(record, field));

export function equipmentSpecs(record: RecordVersion, f: MapFeature): { title: string; rows: Row[] } {
  const config = CONFIGURATIONS[0]!;
  const utility = value(record, "serving_utility") ?? BY_UTILITY;
  const feederId = attr(f, "feeder") ?? attr(f, "feeder_id");
  const feeder = feederId ? feederDetails(record).get(feederId) : undefined;
  const side = /(NORTH|SOUTH|EAST|WEST)\w*\s+SIDE/i.exec(f.label ?? "")?.[0];
  switch (typeOf(f)) {
    case "utility_pole":
      return { title: "(E) Utility pole", rows: [["Height", attr(f, "height_ft") ?? BY_UTILITY], ["Owner", utility], ["Pole number", BY_UTILITY]] };
    case "service_tap":
      return {
        title: "(E) Service pole and transformer",
        rows: [
          ["Utility", utility],
          ["Feeder", feederId ?? BY_UTILITY],
          ["Feeder voltage", formatReading(feeder?.get("feeder_voltage")) ?? BY_UTILITY],
          ["Phases", formatReading(feeder?.get("feeder_phase")) ?? BY_UTILITY],
          ["Transformer size", value(record, "transformer_kva") ?? BY_UTILITY],
          ["Construction", attr(f, "construction") ?? "Overhead"],
        ],
      };
    case "service_entrance":
      return {
        title: "(E) Service entrance and main distribution panel",
        rows: [
          ["Location", side ? `${sentence(side)} of the building` : "Building wall facing the supply"],
          ["Service voltage", value(record, "service_voltage") ?? BY_ENGINEER],
          ["Service size", value(record, "service_size_a") ?? BY_ENGINEER],
          ["Main breaker", value(record, "main_device_rating") ?? BY_ENGINEER],
          ["Bus rating", value(record, "bus_rating") ?? BY_ENGINEER],
          ["Available fault current", value(record, "available_fault_current_a") ?? BY_UTILITY],
          ["Meter number", value(record, "meter_number") ?? BY_UTILITY],
        ],
      };
    case "pad_mount_transformer_candidate":
      return { title: "(E) Equipment box", rows: [["Size", "About 6 × 6 ft, 5 ft tall"], ["Type", "By photo or site visit"]] };
    case "bess_pad": {
      const b = config.battery.model;
      const inv = config.inverter.model;
      return {
        title: "(N) Battery energy storage system",
        rows: [
          ["Configuration", config.name],
          ["Battery", `${b.manufacturer} ${b.model}, ${b.energyKwh ?? "?"} kWh`],
          ["Battery DC range", b.dc ? `${b.dc.vMin}–${b.dc.vMax} V` : BY_ENGINEER],
          ["Inverters", `${config.inverter.count} × ${inv.manufacturer} ${inv.model}, ${inv.ac?.kw ?? "?"} kW each`],
          ["AC output", inv.ac ? `${inv.ac.voltage}, ${inv.ac.ratedA} A per unit` : BY_ENGINEER],
          ["Isolation transformer", `${config.isolationTransformer.kva} kVA, ${config.isolationTransformer.primary}`],
          ["Pad", "11.5 × 14 ft concrete"],
        ],
      };
    }
    case "ac_disconnect":
      return { title: "(N) AC disconnect", rows: [["Model", config.disconnect.model], ["Rating", `${config.disconnect.amps} A, ${config.disconnect.volts} V`], ["Enclosure", "NEMA 3R, outdoor"]] };
    case "new_breaker":
      return { title: "(N) Breaker in the main distribution panel", rows: [["Model", config.breaker.model], ["Rating", `${config.breaker.amps} A, 3-pole`], ["Role", "Point of interconnection"]] };
  }
  if (f.kind === "utility_line") {
    const cls = attr(f, "line_class") ?? "";
    if (f.field === "transmission_nearby")
      return { title: "(E) Transmission line", rows: [["Voltage", attr(f, "line_voltage") ?? BY_UTILITY], ["Owner", attr(f, "line_owner") ?? BY_UTILITY], ["From", attr(f, "line_from") ?? "—"], ["To", attr(f, "line_to") ?? "—"]] };
    if (cls === "feeder candidate" && feederId) {
      const s = feederSummary(record, feederId);
      return { title: `(E) Feeder ${feederId}`, rows: [["Feeder", s.line], ["Capacity", s.capacity ?? BY_UTILITY], ["Study status", attr(f, "study_status") ?? BY_UTILITY], ["Construction", attr(f, "construction") ?? BY_UTILITY]] };
    }
    if (cls === "distribution segment") return { title: "(E) Distribution line", rows: [["Feeder", feederId ?? BY_UTILITY], ["Construction", attr(f, "construction") ?? BY_UTILITY], ["Phases", attr(f, "phases") ?? BY_UTILITY]] };
    if (/service drop/.test(cls)) return { title: "(E) Overhead service drop", rows: [["Length", attr(f, "distance_ft") ?? attr(f, "length_ft") ?? BY_ENGINEER], ["Utility", utility]] };
    if (/trench/.test(cls)) return { title: "(N) Trench route", rows: [["Length", attr(f, "distance_ft") ?? BY_ENGINEER], ["Conduit", "2 × 4 in PVC, by engineer"]] };
    if (/conductor/.test(cls)) return { title: "(E) Overhead line", rows: [["Utility", utility]] };
  }
  return { title: plainLabel(f.label) || "Item", rows: [] };
}

const TYPES = [
  ["utility_pole", "Utility pole"],
  ["service_tap", "Pole-mounted transformer"],
  ["pad_mount_transformer", "Pad-mount transformer"],
  ["switchgear", "Switchgear or meter"],
  ["hvac", "HVAC unit"],
  ["other", "Something else"],
] as const;

export function EquipmentSpecs({ record, feature }: { record: RecordVersion; feature: MapFeature }) {
  const { title, rows } = equipmentSpecs(record, feature);
  const [saved, setSaved] = useState<string | null>(null);
  const [actual, setActual] = useState("");
  const detail = Object.entries(feature.attributes ?? {}).filter(([k]) => !["equipment_type", "line_class"].includes(k));
  const canLabel = typeOf(feature) !== "" && !/concept/i.test(String(attr(feature, "basis") ?? ""));

  async function label(verdict: "correct" | "wrong", actualType?: string) {
    const position = feature.geometry.type === "Point" ? feature.geometry.coordinates : null;
    const response = await fetch("/api/equipment-labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: record.site.id,
        address: record.site.address,
        recordVersion: record.version,
        featureId: feature.id,
        equipmentType: typeOf(feature),
        basis: attr(feature, "basis"),
        verdict,
        actualType: actualType ?? null,
        position,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { count?: number };
    setSaved(response.ok ? `Saved to the training labels${body.count ? ` (${body.count} so far)` : ""}.` : "The label didn't save.");
  }

  return (
    <section className="equipment-specs" aria-label="Equipment specifications">
      <h3>{title}</h3>
      {rows.length ? (
        <table>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td className={v === BY_UTILITY || v === BY_ENGINEER ? "by" : ""}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {canLabel ? (
        <div className="equipment-label">
          <span>Is this right?</span>
          <button type="button" onClick={() => void label("correct")}>
            Correct
          </button>
          <button type="button" onClick={() => void label("wrong")}>
            Wrong
          </button>
          <select aria-label="It's actually" value={actual} onChange={(e) => setActual(e.target.value)}>
            <option value="">It's actually…</option>
            {TYPES.map(([id, words]) => (
              <option key={id} value={id}>
                {words}
              </option>
            ))}
          </select>
          {actual ? (
            <button type="button" onClick={() => void label("wrong", actual)}>
              Save
            </button>
          ) : null}
          {saved ? <span className="note">{saved}</span> : null}
        </div>
      ) : null}
      <details className="equipment-basis">
        <summary>How this was found</summary>
        <dl>
          {detail.map(([k, a]) => (
            <div key={k}>
              <dt>{k.replace(/_/g, " ")}</dt>
              <dd>{attr(feature, k)}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
