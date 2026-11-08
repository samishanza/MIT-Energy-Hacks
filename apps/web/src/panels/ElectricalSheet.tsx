import type { RecordVersion } from "@eqore/contract";
import { CONFIGURATIONS, designFromRecord, preApplicationDraft, preApplicationText, type ElectricalDesign, type SiteInput } from "@eqore/electrical";
import { CalculationsSheet, EquipmentElevations, SingleLineSheet, STATUS_TEXT, configurationOf } from "@eqore/sheets";
import { useMemo, useState } from "react";
import type { EngineerApi } from "../api";
import { ElectricalSpecsForm, type SpecsPrefill } from "./ElectricalSpecsForm";
import "./electrical-sheets.css";

const SHEETS = [
  { id: "E-100", title: "Single line" },
  { id: "E-200", title: "Calculations" },
  { id: "E-300", title: "Elevations" },
] as const;
type SheetId = (typeof SHEETS)[number]["id"];

const STATE_WORDS: Record<string, string> = {
  verified: "Verified",
  inferred: "Inferred",
  estimate: "Estimate",
  missing: "Missing",
};

/** The electrical sheets (single line, calculations, elevations) the electrical package derives from the record. */
export interface ElectricalSheetProps {
  record: RecordVersion;
  api?: EngineerApi;
  actorName?: string;
  onActorName?: (name: string) => void;
  onRecord?: (next: RecordVersion) => void;
  prefill?: SpecsPrefill | null;
}

export function ElectricalSheet({ record, api, actorName = "", onActorName = () => {}, onRecord = () => {}, prefill = null }: ElectricalSheetProps) {
  const [sheet, setSheet] = useState<SheetId>("E-100");
  const [configId, setConfigId] = useState(CONFIGURATIONS[0]!.id);
  const [index, setIndex] = useState(0);
  const [preapp, setPreapp] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const config = CONFIGURATIONS.find((c) => c.id === configId) ?? CONFIGURATIONS[0]!;
  const design: ElectricalDesign = useMemo(() => designFromRecord(record, config), [record, config]);
  const service = Math.min(index, design.designs.length - 1);
  if (!design.designs.length) return <p className="note">No electrical design could be drawn for this record.</p>;

  const props = {
    design,
    service,
    synthetic: record.synthetic,
    issued: record.createdAt.slice(0, 10),
    selected,
    onSelect: (id: string) => setSelected((current) => (current === id ? null : id)),
  };

  return (
    <div className="esheets">
      <div className="esheets-bar" role="toolbar" aria-label="Electrical sheets">
        <div className="esheets-group" role="tablist" aria-label="Sheet">
          {SHEETS.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={sheet === s.id} className={sheet === s.id ? "on" : ""} onClick={() => setSheet(s.id)}>
              <b>{s.id}</b> {s.title}
            </button>
          ))}
        </div>
        {design.designs.length > 1 ? (
          <div className="esheets-group" role="tablist" aria-label="Service voltage">
            {design.designs.map((d, i) => (
              <button key={d.serviceLabel} type="button" role="tab" aria-selected={i === service} className={i === service ? "on" : ""} title="The record doesn't hold the service voltage yet" onClick={() => setIndex(i)}>
                {d.serviceLabel.replace(/, 3-PHASE, 4-WIRE$/, "")}
              </button>
            ))}
          </div>
        ) : null}
        <label className="esheets-config">
          <span>Configuration</span>
          <select value={configId} onChange={(e) => setConfigId(e.target.value)}>
            {CONFIGURATIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="esheets-group esheets-zoom" aria-label="Zoom">
          {[1, 1.5, 2.5].map((z) => (
            <button key={z} type="button" className={zoom === z ? "on" : ""} aria-pressed={zoom === z} onClick={() => setZoom(z)}>
              {z === 1 ? "Fit" : `${z * 100}%`}
            </button>
          ))}
        </div>
        <span className="esheets-spacer" />
        {api ? <ElectricalSpecsForm api={api} record={record} actorName={actorName} onActorName={onActorName} onRecord={onRecord} prefill={prefill} /> : null}
        <button type="button" aria-expanded={preapp} onClick={() => setPreapp((shown) => !shown)}>
          Pre-Application draft
        </button>
      </div>

      {preapp ? <PreApplication record={record} /> : null}

      <div className="esheets-body">
        <figure className="esheets-sheet" aria-label={`Sheet ${sheet}`}>
          <div className={`esheets-scroll${zoom === 1 ? " is-fit" : ""}`} style={{ ["--zoom" as string]: zoom }}>
            {sheet === "E-100" ? <SingleLineSheet {...props} /> : sheet === "E-200" ? <CalculationsSheet {...props} /> : <EquipmentElevations {...props} />}
          </div>
          <figcaption>Click any device, conduit, table, or calculation for where its values came from.</figcaption>
        </figure>
        {selected ? <Details id={selected} design={design} service={service} onClose={() => setSelected(null)} /> : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ details

type Row = { input: SiteInput<unknown> } | { label: string; value: string; source?: string };

function inputRows(design: ElectricalDesign, keys: (keyof ElectricalDesign["inputs"])[]): Row[] {
  return keys.map((key) => ({ input: design.inputs[key] as SiteInput<unknown> }));
}

/** What the record and catalog say about one thing on a sheet, with the state and source of each value. */
function detailsFor(id: string, design: ElectricalDesign, serviceIndex: number): { title: string; rows: Row[]; notes: string[] } {
  const config = configurationOf(design);
  const service = design.designs[serviceIndex]!;
  const item = service.items.find((i) => i.id === id);
  const lines = item ? item.lines : [];
  const catalog = (m: typeof config.inverter.model): Row => ({
    label: `${m.manufacturer} ${m.model}`,
    value: "Catalog model",
    source: `${m.source.document}, ${m.source.revision}${m.source.page ? `, p. ${m.source.page}` : ""}`,
  });
  const provenance = { label: "Configuration", value: config.name, source: config.provenance };
  if (id.startsWith("conduit-")) {
    const tag = Number(id.slice(8));
    const row = service.schedule.find((r) => r.tag === tag);
    const calcIds: Record<number, string> = { 1: "dc", 2: "inverter-ac", 3: "xfmr-disc", 4: "disc-cb" };
    const calc = service.calculations.find((c) => c.id === calcIds[tag]);
    return {
      title: `Conduit ${tag}${row ? `: ${row.from} to ${row.to}` : ""}`,
      rows: [
        ...(row ? [{ label: "Conductors", value: row.conductors }, { label: "Ground", value: row.ground }, { label: "Conduit", value: row.conduit }] : []),
        ...(calc ? [{ label: "Sizing", value: `${STATUS_TEXT[calc.status]}: ${calc.result}`, source: calc.citation }] : []),
        ...(tag === 4 ? inputRows(design, ["runLengthFt"]) : []),
      ],
      notes: calc?.note ? [calc.note] : [],
    };
  }
  if (id.startsWith("calc-")) {
    const calc = service.calculations.find((c) => `calc-${c.id}` === id);
    if (calc) {
      const inputs: Record<string, (keyof ElectricalDesign["inputs"])[]> = {
        busbar: ["mainBreakerA", "busRatingA"],
        "voltage-drop": ["runLengthFt"],
        "fault-current": ["faultCurrentA"],
        "xfmr-disc": ["serviceVoltage"],
        "disc-cb": ["serviceVoltage"],
      };
      return {
        title: calc.title,
        rows: [{ label: "Result", value: `${STATUS_TEXT[calc.status]}: ${calc.result}`, source: calc.citation }, ...inputRows(design, inputs[calc.id] ?? [])],
        notes: [...calc.steps, ...(calc.note ? [calc.note] : [])],
      };
    }
  }
  switch (id) {
    case "utility":
      return { title: "Utility grid", rows: inputRows(design, ["utility", "feeder"]), notes: lines };
    case "pole":
      return { title: "Utility pole", rows: inputRows(design, ["servicePath"]), notes: [] };
    case "service-transformer":
      return { title: "Utility transformer and service", rows: inputRows(design, ["servicePath", "utility", "feeder", "faultCurrentA", "meterNumber"]), notes: lines };
    case "meter":
      return { title: "Utility meter", rows: inputRows(design, ["meterNumber"]), notes: [] };
    case "main-disconnect":
      return { title: "Main disconnect", rows: inputRows(design, ["mainBreakerA"]), notes: [] };
    case "main-switchgear":
      return { title: "Main distribution panel", rows: [...inputRows(design, ["serviceVoltage", "mainBreakerA", "busRatingA", "faultCurrentA"]), { label: "Drawn for", value: service.serviceLabel, source: STATE_WORDS[service.serviceState] }], notes: lines };
    case "load":
      return { title: "Building load", rows: [{ label: "Load", value: "Not in the record", source: "Interval data or bills give it" }], notes: [] };
    case "system":
      return { title: "System information", rows: [provenance, catalog(config.inverter.model), catalog(config.battery.model)], notes: [] };
    case "inverters":
      return { title: config.inverter.name, rows: [catalog(config.inverter.model), provenance], notes: lines };
    case "precharge":
      return { title: "DC precharge units", rows: [{ label: "Model", value: config.inverter.label, source: config.provenance }], notes: [] };
    case "bess":
      return { title: config.battery.name, rows: [catalog(config.battery.model), provenance], notes: lines };
    case "breaker":
    case "disconnect":
    case "isolation-transformer":
    case "aux":
      return { title: item?.title ?? id, rows: [provenance], notes: lines };
    default:
      return { title: id, rows: [], notes: lines };
  }
}

function Details({ id, design, service, onClose }: { id: string; design: ElectricalDesign; service: number; onClose: () => void }) {
  const details = detailsFor(id, design, service);
  return (
    <aside className="esheets-details" aria-label="Details">
      <header>
        <h2>{details.title}</h2>
        <button type="button" aria-label="Close details" onClick={onClose}>
          ×
        </button>
      </header>
      {details.rows.length ? (
        <dl>
          {details.rows.map((row, i) =>
            "input" in row ? (
              <div key={i} className={`esheets-row state-${row.input.state}`}>
                <dt>{row.input.label}</dt>
                <dd>
                  <span className="esheets-value">{row.input.value === null ? "None yet" : String(row.input.value)}</span>
                  <span className="esheets-state">{STATE_WORDS[row.input.state] ?? row.input.state}</span>
                  <small>Source: {row.input.source}</small>
                  {row.input.reason ? <small>{row.input.reason}</small> : null}
                </dd>
              </div>
            ) : (
              <div key={i} className="esheets-row">
                <dt>{row.label}</dt>
                <dd>
                  <span className="esheets-value">{row.value}</span>
                  {row.source ? <small>{row.source}</small> : null}
                </dd>
              </div>
            ),
          )}
        </dl>
      ) : null}
      {details.notes.length ? (
        <ul className="esheets-notes">
          {details.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}

/** The utility's Pre-Application Report request, drafted from the record for a person to review and send. */
function PreApplication({ record }: { record: RecordVersion }) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => preApplicationText(preApplicationDraft(record)), [record]);
  return (
    <section className="esheets-panel preapp" aria-label="Pre-Application Report request">
      <p className="note">Drafted from public data for a person to review and send. Customer contacts, the account number, and loads are left for the customer.</p>
      <pre className="preapp-text">{text}</pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => setCopied(true));
        }}
      >
        {copied ? "Copied" : "Copy text"}
      </button>
    </section>
  );
}
