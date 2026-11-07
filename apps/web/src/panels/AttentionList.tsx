import type { RecordVersion } from "@eqore/contract";
import { attentionItems } from "../app/facts";

export interface AttentionListProps {
  record: RecordVersion;
  selectedFields: string[];
  onSelect: (field: string) => void;
}

export function AttentionList({ record, selectedFields, onSelect }: AttentionListProps) {
  const items = attentionItems(record);
  const labelOf = (field: string) => record.values.find((value) => value.field === field)?.label ?? field;
  return (
    <section className="attention" aria-label="Needs your attention">
      <h2>Needs your attention</h2>
      {items.length === 0 ? <p className="note">Nothing needs your attention. Everything below is drawn and traced.</p> : null}
      <ul>
        {items.map((item) => (
          <li key={item.id} className={`attention-item attention-${item.kind}`}>
            {item.field ? (
              <button
                type="button"
                className={selectedFields.includes(item.field) ? "is-selected" : ""}
                onClick={() => onSelect(item.field!)}
              >
                <strong>{item.title}</strong>
                <span>{item.reason}</span>
              </button>
            ) : item.fields ? (
              <details>
                <summary>
                  <strong>{item.title}</strong>
                  <span>{item.reason}</span>
                </summary>
                <ul className="attention-fields">
                  {item.fields.map((field) => (
                    <li key={field}>
                      <button type="button" onClick={() => onSelect(field)}>
                        {labelOf(field)}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            ) : (
              <p>
                <strong>{item.title}</strong>
                <span>{item.reason}</span>
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
