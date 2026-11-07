import type { MapFeature, Observation, ReadinessReport, RecordVersion, Value } from "@eqore/contract";
import type { EngineerApi } from "../api";
import { centerOf, isEquipmentPoint, zoneTier, ZONE_WORDS } from "../map/layers";
import { CHECK_WORDS, formatCurrent, formatValue, locationWords, METHOD_WORDS, observationWord } from "../app/format";
import { googleEarthUrl, streetViewUrl } from "../app/siteLinks";
import { GradeTag, ProvenanceTag, StateBadge } from "../ui/marks";
import { ResolveControls } from "./ResolveControls";

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
}

function HistoryRow({ observation, api, value }: { observation: Observation; api: EngineerApi; value: Value }) {
  const fileId = observation.locator.evidenceFileId;
  const location = locationWords(observation);
  return (
    <li className="history-row">
      <p>
        <strong>{observationWord(observation)}</strong>
        {observation.value ? <span className="mono"> {formatValue(observation.value)}</span> : null}
      </p>
      {observation.verification ? <p>By {observation.verification.verifierName}</p> : null}
      <p className="note">
        {observation.source.url ? <a href={observation.source.url}>{observation.source.name}</a> : observation.source.name}
        {`. Retrieved ${observation.retrievedAt.slice(0, 10)}. `}
        {observation.sourceDate ? `Source dated ${observation.sourceDate}. ` : "Source date unknown. "}
        {`${METHOD_WORDS[observation.method]}.`}
        {location ? ` Found at ${location}.` : ""}
      </p>
      {observation.reason && observation.reason !== value.reason ? <p className="note">{observation.reason}</p> : null}
      <ProvenanceTag synthetic={observation.synthetic} />
      {fileId ? (
        // Saved rather than opened: anyone holding a capture link chooses what this file contains.
        <a href={api.evidenceUrl(fileId)} download>
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

const UNIT_SUFFIX = /_(ft|m)$/;

const attributeWords = (name: string) => {
  const words = name.replace(UNIT_SUFFIX, "").replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

function FeatureFacts({ feature }: { feature: MapFeature }) {
  const [longitude, latitude] = centerOf(feature);
  const position: [number, number] = [longitude, latitude];
  const attributes = Object.entries(feature.attributes ?? {});
  return (
    <section className="feature-facts" aria-label="Selected item">
      {feature.label ? <h3>{feature.label}</h3> : null}
      {feature.kind === "candidate_area" ? (
        <>
          <p>{ZONE_WORDS[zoneTier(feature)]}</p>
          <p className="flag">Eligibility screen from public data, not code approval. Local amendments go to a person.</p>
        </>
      ) : null}
      {attributes.length > 0 ? (
        <dl className="attributes">
          {attributes.map(([name, attribute]) => (
            <div key={name}>
              <dt>{attributeWords(name)}</dt>
              <dd className="mono">{formatValue(attribute)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="links">
        <a href={googleEarthUrl(position)} target="_blank" rel="noopener noreferrer">
          Open in Google Earth
        </a>
        <a href={streetViewUrl(position)} target="_blank" rel="noopener noreferrer">
          Street View
        </a>
      </p>
    </section>
  );
}

function ValueEvidence(props: EvidencePanelProps & { value: Value }) {
  const { api, record, report, value, actorName, onActorName, onRecord } = props;
  const onMap = record.features.some((f) => f.field === value.field);
  const required = report ? report.items.some((item) => item.fields.includes(value.field)) : true;
  const position = positionWords(record, value.field);
  const fromAFile = record.observations.some((o) => o.field === value.field && o.locator.evidenceFileId);
  return (
    <article className="evidence">
      <h3>{value.label}</h3>
      <p className="evidence-value mono">{formatCurrent(value)}</p>
      <div className="marks">
        <StateBadge value={value} />
        <GradeTag grade={value.grade} />
        <ProvenanceTag synthetic={value.synthetic} />
      </div>
      {value.reason ? <p>{value.reason}</p> : null}
      {value.conflictKind === "feeder_candidates" ? (
        <p>These are nearby feeders, not a source disagreement. The utility's Pre-Application Report settles this.</p>
      ) : null}
      {value.flags.map((flag) => (
        <p key={flag} className="flag">
          Flag: {flag}
        </p>
      ))}
      {value.crossChecks && value.crossChecks.length > 0 ? (
        <ul className="cross-checks" aria-label="Cross-checks">
          {value.crossChecks.map((check) => (
            <li key={check.label} className={`check-${check.result}`}>
              <strong className="check-word">{CHECK_WORDS[check.result]}:</strong> {check.label}
              {check.detail ? `. ${check.detail}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {position ? <p className="note">{position}</p> : null}
      {!onMap ? <p className="note">Not a map item.</p> : null}
      {!required ? <p className="note">Not required by this form. Shown for context.</p> : null}

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

      <h4>History</h4>
      <ul className="history" aria-label="History">
        {record.observations
          .filter((o) => o.field === value.field)
          .map((observation) => (
            <HistoryRow key={observation.id} observation={observation} api={api} value={value} />
          ))}
      </ul>
    </article>
  );
}

export function EvidencePanel(props: EvidencePanelProps) {
  const values = props.fields
    .map((field) => props.record.values.find((v) => v.field === field))
    .filter((value): value is Value => Boolean(value));
  const feature = props.featureId ? props.record.features.find((f) => f.id === props.featureId) : undefined;
  return (
    <aside className="dock" aria-label="Evidence">
      <button type="button" className="dock-close" onClick={props.onClose}>
        Close
      </button>
      {feature ? <FeatureFacts feature={feature} /> : null}
      {values.length === 0 ? <p>No value yet.</p> : null}
      {values.map((value) => (
        <ValueEvidence key={value.field} {...props} value={value} />
      ))}
    </aside>
  );
}
