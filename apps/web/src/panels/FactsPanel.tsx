import type { RecordVersion, Value } from "@eqore/contract";
import { useState } from "react";
import { currentObservation, FAMILY_WORDS, familyOf, isFound, notPublicCounts, PUBLIC_FAMILIES } from "../app/facts";
import { CHECK_WORDS, formatCurrent, GRADE_WORDS, METHOD_WORDS, STATE_WORDS } from "../app/format";
import { ProvenanceTag } from "../ui/marks";

export interface FactsPanelProps {
  record: RecordVersion;
  selectedFields: string[];
  onSelect: (field: string) => void;
  /** Opens the evidence check. Without it, the not-public line only explains. */
  onOpenReport?: () => void;
}

function FactRow({ record, value, selected, onSelect }: { record: RecordVersion; value: Value; selected: boolean; onSelect: () => void }) {
  const observation = currentObservation(record, value);
  const date = observation?.sourceDate ? `dated ${observation.sourceDate}` : observation ? `retrieved ${observation.retrievedAt.slice(0, 10)}` : null;
  const meta = [
    observation?.source.name,
    date,
    value.method ? METHOD_WORDS[value.method] : null,
    value.grade ? `${GRADE_WORDS[value.grade]} grade` : null,
  ].filter(Boolean);
  return (
    <li>
      <button type="button" className={`fact-row${selected ? " is-selected" : ""}`} onClick={onSelect}>
        <span className="fact-label">{value.label}</span>
        <span className="fact-value mono">{formatCurrent(value)}</span>
        {value.state !== "inferred" ? <span className={`fact-state state-${value.state}`}>{STATE_WORDS[value.state]}</span> : null}
        {value.synthetic ? <ProvenanceTag synthetic /> : null}
        <span className="fact-meta">{meta.join(" · ")}</span>
        {(value.crossChecks ?? []).map((check) => (
          <span key={check.label} className={`fact-check check-${check.result}`}>
            Cross-check, {check.label}: {CHECK_WORDS[check.result]}
          </span>
        ))}
      </button>
    </li>
  );
}

export function FactsPanel({ record, selectedFields, onSelect, onOpenReport }: FactsPanelProps) {
  const [explained, setExplained] = useState(false);
  const notPublic = notPublicCounts(record);
  return (
    <section className="facts" aria-label="Public facts">
      <h2>Public facts</h2>
      {PUBLIC_FAMILIES.map((family) => {
        const values = record.values.filter((value) => familyOf(value) === family);
        if (values.length === 0) return null;
        const found = values.filter(isFound);
        const missing = values.filter((value) => !isFound(value));
        return (
          <section key={family} className="family" aria-label={`${FAMILY_WORDS[family]} facts`}>
            <details>
            <summary>
              {FAMILY_WORDS[family]} <span className="note">{found.length} found</span>
            </summary>
            <ul className="fact-list">
              {found.map((value) => (
                <FactRow
                  key={value.field}
                  record={record}
                  value={value}
                  selected={selectedFields.includes(value.field)}
                  onSelect={() => onSelect(value.field)}
                />
              ))}
            </ul>
            {missing.length > 0 ? (
              <details className="not-found">
                <summary>Not found in public sources: {missing.length}</summary>
                <ul>
                  {missing.map((value) => (
                    <li key={value.field}>
                      <button type="button" onClick={() => onSelect(value.field)}>
                        {value.label}
                      </button>
                      {value.reason ? <span className="note"> {value.reason}</span> : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            </details>
          </section>
        );
      })}

      <div className="not-public">
        <button type="button" aria-expanded={explained} onClick={() => setExplained((open) => !open)}>
          Not in public records: {notPublic.customer} customer facts and {notPublic.decision} engineer decisions
        </button>
        {explained ? (
          <div className="not-public-why">
            <p>
              No public source we tested shows customer-side electrical facts, such as the switchboard rating, meter
              number, or where equipment sits. They come from a bill, photos, old drawings, or a qualified person.
              Engineer decisions, such as system size, are yours to make. None of this is needed to see the map.
            </p>
            {onOpenReport ? (
              <button type="button" onClick={onOpenReport}>
                Open the evidence check and requests
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
