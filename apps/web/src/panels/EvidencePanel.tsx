import type { Observation, ReadinessReport, RecordVersion, Value } from "@eqore/contract";
import type { EngineerApi } from "../api";
import { formatCurrent, formatValue, locationWords, METHOD_WORDS, observationWord } from "../app/format";
import { GradeTag, ProvenanceTag, StateBadge } from "../ui/marks";
import { ResolveControls } from "./ResolveControls";

export interface EvidencePanelProps {
  api: EngineerApi;
  record: RecordVersion;
  report: ReadinessReport;
  fields: string[];
  actorName: string;
  onActorName: (name: string) => void;
  onRecord: (record: RecordVersion) => void;
  onClose: () => void;
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
        <a href={api.evidenceUrl(fileId)} target="_blank" rel="noreferrer">
          Original file
        </a>
      ) : null}
    </li>
  );
}

function positionWords(record: RecordVersion, field: string): string | null {
  const point = record.features.find(
    (f) => f.field === field && (f.kind === "existing_equipment" || f.kind === "capture_pin"),
  );
  if (!point) return null;
  return point.placedByHand ? "Position: placed by hand" : "Position: phone GPS";
}

function ValueEvidence(props: EvidencePanelProps & { value: Value }) {
  const { api, record, report, value, actorName, onActorName, onRecord } = props;
  const onMap = record.features.some((f) => f.field === value.field);
  const required = report.items.some((item) => item.fields.includes(value.field));
  const position = positionWords(record, value.field);
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
      {position ? <p className="note">{position}</p> : null}
      {!onMap ? <p className="note">Not a map item.</p> : null}
      {!required ? <p className="note">Not required by this form. Shown for context.</p> : null}

      <ResolveControls
        key={`${value.field}-${value.state}`}
        api={api}
        record={record}
        value={value}
        actorName={actorName}
        onActorName={onActorName}
        onRecord={onRecord}
      />

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
  return (
    <aside className="dock" aria-label="Evidence">
      <button type="button" className="dock-close" onClick={props.onClose}>
        Close
      </button>
      {values.length === 0 ? <p>No value yet.</p> : null}
      {values.map((value) => (
        <ValueEvidence key={value.field} {...props} value={value} />
      ))}
    </aside>
  );
}
