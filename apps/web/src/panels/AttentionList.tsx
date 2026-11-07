import type { RecordVersion } from "@eqore/contract";
import { attentionItems, type AttentionItem } from "../app/facts";

export interface AttentionListProps {
  record: RecordVersion;
  selectedFields: string[];
  onSelect: (field: string) => void;
}

function Summary({ item }: { item: AttentionItem }) {
  return (
    <>
      <strong>{item.title}</strong>
      <span>{item.reason}</span>
    </>
  );
}

export function AttentionList({ record, selectedFields, onSelect }: AttentionListProps) {
  const items = attentionItems(record);
  const labelOf = (field: string) => record.values.find((value) => value.field === field)?.label ?? field;

  const body = (item: AttentionItem) => {
    if (item.field) {
      const field = item.field;
      return (
        <button type="button" className={selectedFields.includes(field) ? "is-selected" : ""} onClick={() => onSelect(field)}>
          <Summary item={item} />
        </button>
      );
    }
    if (item.fields) {
      return (
        <details>
          <summary>
            <Summary item={item} />
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
      );
    }
    return (
      <p>
        <Summary item={item} />
      </p>
    );
  };

  return (
    <section className="attention" aria-label="Needs your attention">
      <h2>Needs your attention</h2>
      {items.length === 0 ? <p className="note">Nothing needs your attention. Everything below is drawn and traced.</p> : null}
      <ul>
        {items.map((item) => (
          <li key={item.id} className={`attention-item attention-${item.kind}`}>
            {body(item)}
          </li>
        ))}
      </ul>
    </section>
  );
}
