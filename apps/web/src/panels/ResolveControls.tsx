import type { EvidenceRef, ObservedValue, RecordVersion, Value } from "@eqore/contract";
import { useId, useState } from "react";
import { ApiRequestError, type EngineerApi } from "../api";
import { formatValue, observationWord } from "../app/format";

export interface ResolveControlsProps {
  api: EngineerApi;
  record: RecordVersion;
  value: Value;
  actorName: string;
  onActorName: (name: string) => void;
  onRecord: (record: RecordVersion) => void;
  preselectedEvidence?: string[];
  disabled?: boolean;
}

const canConfirm = (value: Value) => value.state === "inferred";
const canChoose = (value: Value) => value.state === "conflicting";
// An engineer's own decisions aren't site facts, so the record doesn't collect them.
const canEnter = (value: Value) =>
  value.state !== "verified" && !(value.state === "missing" && value.owner === "engineer");

export function parseEntry(text: string, unit: string): ObservedValue | string {
  const trimmed = text.trim();
  if (!trimmed) return "Enter a value.";
  if (!unit.trim()) return { type: "text", value: trimmed };
  const number = Number(trimmed);
  if (!Number.isFinite(number)) return "Enter a number when a unit is given.";
  return { type: "quantity", value: number, unit: unit.trim() };
}

function startingUnit(value: Value): string {
  const known = value.current ?? value.candidates[0]?.value;
  return known?.type === "quantity" ? known.unit : "";
}

export function ResolveControls(props: ResolveControlsProps) {
  const { api, record, value, actorName, onActorName, onRecord, disabled = false } = props;
  const id = useId();
  const [cited, setCited] = useState<string[]>(props.preselectedEvidence ?? []);
  const [note, setNote] = useState("");
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [entry, setEntry] = useState("");
  const [unit, setUnit] = useState(startingUnit(value));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canConfirm(value) && !canChoose(value) && !canEnter(value)) return null;

  const siteId = record.site.id;
  // The same reading from the same source, repeated across runs, is one thing to cite.
  const groups = new Map<string, { label: string; ids: string[] }>();
  for (const observation of record.observations.filter((o) => o.field === value.field)) {
    const label = `${observationWord(observation)}${observation.value ? `: ${formatValue(observation.value)}` : ""}, ${observation.source.name}`;
    const group = groups.get(label) ?? { label, ids: [] };
    group.ids.push(observation.id);
    groups.set(label, group);
  }

  const evidence = (): EvidenceRef[] => [
    ...cited.map((observationId) => ({ kind: "observation" as const, observationId })),
    ...(note.trim() ? [{ kind: "document" as const, description: note.trim() }] : []),
  ];

  async function submit(action: () => Promise<RecordVersion>) {
    setBusy(true);
    setError(null);
    try {
      onRecord(await action());
    } catch (failure) {
      setError(failure instanceof ApiRequestError ? failure.message : "That didn't save. Nothing changed.");
    } finally {
      setBusy(false);
    }
  }

  const actor = () => ({ verifierName: actorName, evidence: evidence() });
  const blocked = busy || disabled;

  return (
    <form className="resolve" onSubmit={(event) => event.preventDefault()}>
      {canChoose(value) ? (
        <fieldset className="candidates" aria-label="Candidates">
          <legend>Candidates</legend>
          {value.candidates.map((candidate) => (
            <label key={candidate.id} className="candidate">
              <input
                type="radio"
                name={`${id}-candidate`}
                checked={candidateId === candidate.id}
                onChange={() => setCandidateId(candidate.id)}
              />
              <span className="candidate-value">{formatValue(candidate.value)}</span>
              <span className="candidate-source">{candidate.sourceName}</span>
              {candidate.attributes ? (
                <span className="candidate-details">
                  {Object.entries(candidate.attributes)
                    .map(([name, attribute]) => `${name}: ${formatValue(attribute)}`)
                    .join(", ")}
                </span>
              ) : null}
            </label>
          ))}
        </fieldset>
      ) : null}

      <fieldset className="evidence-picks">
        <legend>Evidence you looked at</legend>
        {[...groups.values()].map((group) => (
          <label key={group.ids[0]} className="evidence-pick">
            <input
              type="checkbox"
              checked={group.ids.every((id) => cited.includes(id))}
              onChange={(event) =>
                setCited(event.target.checked ? [...new Set([...cited, ...group.ids])] : cited.filter((o) => !group.ids.includes(o)))
              }
            />
            <span>
              {group.label}
              {group.ids.length > 1 ? <span className="evidence-times"> · {group.ids.length} readings</span> : null}
            </span>
          </label>
        ))}
        <label className="field">
          <span>Document or note</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
      </fieldset>

      <label className="field">
        <span>Verifier name</span>
        <input value={actorName} onChange={(event) => onActorName(event.target.value)} />
      </label>
      <p className="note">Self-entered. This prototype has no login.</p>

      <div className="resolve-actions">
        {canConfirm(value) ? (
          <button
            type="button"
            className="primary"
            disabled={blocked}
            onClick={() => void submit(() => api.confirmValue(siteId, value.field, { ...actor(), expectedObservationId: value.currentObservationId ?? value.observationIds.at(-1) ?? "" }))}
          >
            Confirm
          </button>
        ) : null}
        {canChoose(value) ? (
          <button
            type="button"
            className="primary"
            disabled={blocked || !candidateId}
            onClick={() =>
              void submit(() =>
                api.resolveConflict(siteId, value.field, { ...actor(), candidateId: candidateId ?? "" }),
              )
            }
          >
            Choose candidate
          </button>
        ) : null}
      </div>

      {canEnter(value) ? (
        <div className="entry">
          <label className="field">
            <span>Value</span>
            <input value={entry} onChange={(event) => setEntry(event.target.value)} />
          </label>
          <label className="field field-unit">
            <span>Unit</span>
            <input value={unit} onChange={(event) => setUnit(event.target.value)} />
          </label>
          <button
            type="button"
            disabled={blocked}
            onClick={() => {
              const parsed = parseEntry(entry, unit);
              if (typeof parsed === "string") {
                setError(parsed);
                return;
              }
              void submit(() => api.correctValue(siteId, value.field, { ...actor(), value: parsed }));
            }}
          >
            Save value
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
    </form>
  );
}
