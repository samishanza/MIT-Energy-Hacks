import { EquipmentSpecs } from "./EquipmentSpecs";
import type { MapFeature, Observation, ReadinessReport, RecordVersion, Value } from "@eqore/contract";
import { useEffect, type ReactNode } from "react";
import type { EngineerApi } from "../api";
import { centerOf, isEquipmentPoint, zoneTier, ZONE_WORDS } from "../map/layers";
import { CHECK_WORDS, formatCurrent, formatValue, locationWords, METHOD_WORDS, observationWord } from "../app/format";
import { googleEarthUrl, streetViewUrl } from "../app/siteLinks";
import { GradeTag, ProvenanceTag, StateBadge } from "../ui/marks";
import { ResolveControls } from "./ResolveControls";

// The details dock: what was clicked, what the record says about it, and what a person can do.
// One header with the item's name, then sections that open and close, so the value and its
// status read first and the longer evidence waits until it's wanted. It folds to a rail on the
// map's edge, from its button or when the map is moved, and opens again on the rail or a new pick.

export interface EvidencePanelProps {
  api: EngineerApi;
  record: RecordVersion;
  // Null when the evidence check couldn't be read. Only the "not required" note depends on it.
  report: ReadinessReport | null;
  fields: string[];
  // The one map item selected, when the selection came from the map.
  featureId?: string | null;
  actorName: string;
  onActorName: (name: string) => void;
  onRecord: (record: RecordVersion) => void;
  onClose: () => void;
  onPlace?: (field: string) => void;
  collapsed?: boolean;
  onCollapse?: () => void;
  onExpand?: () => void;
}

function Section({ title, count, open = false, children }: { title: string; count?: number; open?: boolean; children: ReactNode }) {
  return (
    <details className="dock-section" open={open}>
      <summary>
        <span>{title}</span>
        {count !== undefined ? <span className="dock-count">{count}</span> : null}
      </summary>
      <div className="dock-section-body">{children}</div>
    </details>
  );
}

function HistoryRow({ observation, api, value }: { observation: Observation; api: EngineerApi; value: Value }) {
  const fileId = observation.locator.evidenceFileId;
  const location = locationWords(observation);
  return (
    <li className="history-row">
      <p className="history-head">
        <strong>{observationWord(observation)}</strong>
        {observation.value ? <span> {formatValue(observation.value)}</span> : null}
        {observation.synthetic ? <ProvenanceTag synthetic /> : null}
      </p>
      {observation.verification ? <p>By {observation.verification.verifierName}</p> : null}
      <p className="note">
        {observation.source.url ? (
          <a href={observation.source.url} target="_blank" rel="noopener noreferrer">
            {observation.source.name}
          </a>
        ) : (
          observation.source.name
        )}
        {`. Retrieved ${observation.retrievedAt.slice(0, 10)}. `}
        {observation.sourceDate ? `Source dated ${observation.sourceDate}. ` : "Source date unknown. "}
        {`${METHOD_WORDS[observation.method]}.`}
        {location ? ` Found at ${location}.` : ""}
      </p>
      {observation.reason && observation.reason !== value.reason ? <p className="note">{observation.reason}</p> : null}
      {fileId ? (
        // Saved rather than opened: anyone holding a capture link chooses what this file contains.
        <a className="history-file" href={api.evidenceUrl(fileId)} download>
          Original file
        </a>
      ) : null}
    </li>
  );
}

function positionWords(record: RecordVersion, field: string): string | null {
  const point = record.features.find((f) => f.field === field && isEquipmentPoint(f));
  if (!point) return null;
  return point.placedByHand ? "Position: placed by hand" : "Position: phone GPS";
}

const UNIT_SUFFIX = /_(ft|m|sqft|acres)$/;

/** What kind of thing a map item is, for the dock's header. */
const KIND_WORDS: Record<MapFeature["kind"], string> = {
  property_line: "Lot line",
  building_outline: "Building",
  utility_line: "Utility line",
  existing_equipment: "Electrical equipment",
  capture_pin: "Photo pin",
  dimension_line: "Dimension",
  candidate_area: "Battery zone",
  substation: "Substation",
  road: "Road",
  constraint: "Constraint",
};

/** Large numbers with separators, and code words as plain words. */
export function readable(text: string): string {
  const spaced = /^[a-z0-9]+(_[a-z0-9]+)+$/.test(text) ? text.replace(/_/g, " ") : text;
  return spaced.replace(/\b\d{5,}(\.\d+)?\b/g, (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));
}

const attributeWords = (name: string) => {
  const words = name.replace(UNIT_SUFFIX, "").replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

function MapLinks({ feature }: { feature: MapFeature }) {
  const [longitude, latitude] = centerOf(feature);
  const position: [number, number] = [longitude, latitude];
  return (
    <p className="dock-links">
      <a href={googleEarthUrl(position)} target="_blank" rel="noopener noreferrer">
        Open in Google Earth
      </a>
      <a href={streetViewUrl(position)} target="_blank" rel="noopener noreferrer">
        Street View
      </a>
    </p>
  );
}

function FeatureFacts({ feature, record }: { feature: MapFeature; record: RecordVersion }) {
  if (feature.kind === "existing_equipment" || feature.kind === "utility_line") {
    return (
      <div className="dock-card">
        <EquipmentSpecs record={record} feature={feature} />
        <MapLinks feature={feature} />
      </div>
    );
  }
  const attributes = Object.entries(feature.attributes ?? {});
  return (
    <section className="dock-card feature-facts" aria-label="Selected item">
      {feature.label ? <h3>{feature.label}</h3> : null}
      {feature.kind === "candidate_area" ? (
        <>
          <p>{ZONE_WORDS[zoneTier(feature)]}</p>
          <p className="dock-caution">Eligibility screen from public data, not code approval. Local amendments go to a person.</p>
        </>
      ) : null}
      {attributes.length > 0 ? (
        <dl className="attributes">
          {attributes.map(([name, attribute]) => {
            const text = readable(formatValue(attribute));
            // A sentence reads under its name; a short value sits beside it.
            return (
              <div key={name} className={text.length > 32 ? "attribute-long" : undefined}>
                <dt>{attributeWords(name)}</dt>
                <dd>{text}</dd>
              </div>
            );
          })}
        </dl>
      ) : null}
      <MapLinks feature={feature} />
    </section>
  );
}

function ValueEvidence(props: EvidencePanelProps & { value: Value; titled: boolean }) {
  const { api, record, report, value, actorName, onActorName, onRecord } = props;
  const onMap = record.features.some((f) => f.field === value.field);
  const required = report ? report.items.some((item) => item.fields.includes(value.field)) : true;
  const position = positionWords(record, value.field);
  const fromAFile = record.observations.some((o) => o.field === value.field && o.locator.evidenceFileId);
  const history = record.observations.filter((o) => o.field === value.field);
  const checks = value.flags.length + (value.crossChecks?.length ?? 0) + (value.conflictKind === "feeder_candidates" ? 1 : 0);
  const notes = [position, !onMap ? "Not a map item." : null, !required ? "Not required by this form. Shown for context." : null].filter(Boolean);
  return (
    <article className="dock-card evidence">
      {props.titled ? <h3>{value.label}</h3> : null}
      <p className="dock-value">{readable(formatCurrent(value))}</p>
      <div className="marks">
        <StateBadge value={value} />
        <GradeTag grade={value.grade} />
        {value.synthetic ? <ProvenanceTag synthetic /> : null}
      </div>
      {value.reason ? <p className="dock-reason">{value.reason}</p> : null}
      {notes.length ? <p className="note">{notes.join(" ")}</p> : null}

      {checks > 0 ? (
        <Section title="Checks" count={checks} open>
          <ul className="dock-checks" aria-label="Cross-checks">
            {value.conflictKind === "feeder_candidates" ? (
              <li className="check-note">These are nearby feeders, not a source disagreement. The utility's Pre-Application Report settles this.</li>
            ) : null}
            {value.flags.map((flag) => (
              <li key={flag} className="check-flag">
                <strong>Flag:</strong> {flag}
              </li>
            ))}
            {(value.crossChecks ?? []).map((check) => (
              <li key={check.label} className={`check-${check.result}`}>
                <strong>{CHECK_WORDS[check.result]}:</strong> {check.label}
                {check.detail ? `. ${check.detail}` : ""}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Verify or correct" open={value.state === "conflicting"}>
        <ResolveControls
          key={`${value.field}-${value.state}-${value.observationIds.at(-1) ?? "none"}`}
          api={api}
          record={record}
          value={value}
          actorName={actorName}
          onActorName={onActorName}
          onRecord={onRecord}
        />
        {props.onPlace && (position || fromAFile) ? (
          <button type="button" onClick={() => props.onPlace?.(value.field)}>
            {position ? "Move on the map" : "Place on the map"}
          </button>
        ) : null}
      </Section>

      <Section title="History" count={history.length}>
        <ul className="history" aria-label="History">
          {history.map((observation) => (
            <HistoryRow key={observation.id} observation={observation} api={api} value={value} />
          ))}
        </ul>
      </Section>
    </article>
  );
}

export function EvidencePanel(props: EvidencePanelProps) {
  const values = props.fields
    .map((field) => props.record.values.find((v) => v.field === field))
    .filter((value): value is Value => Boolean(value));
  const feature = props.featureId ? props.record.features.find((f) => f.id === props.featureId) : undefined;
  // A map item is named by its kind here and by its own label in its card, so neither repeats the other.
  const title = (feature ? KIND_WORDS[feature.kind] : null) || values[0]?.label || "Details";
  const { onClose, collapsed = false } = props;

  // Escape closes the dock, unless the person is typing in it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
      if (event.key === "Escape" && !typing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (collapsed) {
    return (
      <aside className="dock dock-collapsed" aria-label="Evidence">
        <button type="button" className="dock-rail" onClick={props.onExpand} aria-label={`Show details: ${title}`} title="Show details">
          <span aria-hidden="true">‹</span>
          <span className="dock-rail-title">{title}</span>
        </button>
      </aside>
    );
  }
  return (
    <aside className="dock" aria-label="Evidence">
      <header className="dock-head">
        <div className="dock-titles">
          <p className="dock-kicker">{feature ? "Map item" : values.length > 1 ? `${values.length} facts` : "Fact"}</p>
          <h2>{title}</h2>
        </div>
        <div className="dock-head-buttons">
          {props.onCollapse ? (
            <button type="button" className="dock-icon" onClick={props.onCollapse} aria-label="Collapse details" title="Collapse">
              ›
            </button>
          ) : null}
          <button type="button" className="dock-icon" onClick={onClose} aria-label="Close" title="Close (Esc)">
            ✕
          </button>
        </div>
      </header>
      <div className="dock-body">
        {feature ? <FeatureFacts feature={feature} record={props.record} /> : null}
        {values.length === 0 ? <p className="note">No value yet.</p> : null}
        {values.map((value) => (
          <ValueEvidence key={value.field} {...props} value={value} titled={Boolean(feature) || values.length > 1} />
        ))}
      </div>
    </aside>
  );
}
