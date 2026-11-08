import type { RecordVersion } from "@eqore/contract";
import { designFromRecord, singleLineSvg, type Calculation, type ElectricalDesign } from "@eqore/electrical";
import { useMemo, useState } from "react";

const STATUS_WORDS: Record<Calculation["status"], string> = {
  passes: "Passes",
  fails: "Fails",
  needs_input: "Needs input",
  over_recommendation: "Over 3% recommendation",
};

const STATE_WORDS: Record<string, string> = {
  verified: "Verified",
  inferred: "Inferred",
  estimate: "Estimate",
  missing: "Missing",
};

/** The single-line, schedule, and calculations the electrical package derives from the record. */
export function ElectricalSheet({ record }: { record: RecordVersion }) {
  const design: ElectricalDesign = useMemo(() => designFromRecord(record), [record]);
  const [index, setIndex] = useState(0);
  const service = design.designs[index] ?? design.designs[0];
  // The SVG is built by our own code from the record, and every text node in it is escaped there.
  const svg = useMemo(() => singleLineSvg(design, index), [design, index]);
  if (!service) return <p className="note">No electrical design could be drawn for this record.</p>;

  return (
    <figure className="sheet sheet--electrical" aria-label="Single-line diagram and calculations">
      <p className="electrical-note">{design.note}</p>
      <p className="note">
        Configuration: {design.configuration.name}. {design.configuration.provenance}
      </p>
      {design.designs.length > 1 ? (
        <div className="view-tabs electrical-service" role="tablist" aria-label="Service voltage">
          {design.designs.map((d, i) => (
            <button key={d.serviceLabel} type="button" role="tab" aria-selected={i === index} className={i === index ? "on" : ""} onClick={() => setIndex(i)}>
              {d.serviceLabel} ({STATE_WORDS[d.serviceState] ?? d.serviceState})
            </button>
          ))}
        </div>
      ) : null}
      <div className="electrical-svg" dangerouslySetInnerHTML={{ __html: svg }} />

      <section className="electrical-calcs" aria-label="Calculations">
        <h2>Calculations ({service.serviceLabel})</h2>
        <ol>
          {service.calculations.map((calc) => (
            <li key={calc.id} className={`calc calc-${calc.status}`}>
              <p className="calc-head">
                <strong>{calc.title}</strong> <span className={`calc-status status-${calc.status}`}>{STATUS_WORDS[calc.status]}</span>
              </p>
              <p className="calc-cite">{calc.citation}</p>
              <ul className="calc-steps">
                {calc.steps.map((step, i) => (
                  <li key={i} className="mono">
                    {step}
                  </li>
                ))}
              </ul>
              <p className="calc-result">{calc.result}</p>
              {calc.note ? <p className="note">{calc.note}</p> : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="electrical-inputs" aria-label="Site inputs">
        <h2>Site inputs</h2>
        <table>
          <tbody>
            {Object.entries(design.inputs).map(([key, input]) => (
              <tr key={key} className={`input-${input.state}`}>
                <th scope="row">{input.label}</th>
                <td className="mono">{input.value === null ? "—" : String(input.value)}</td>
                <td>{STATE_WORDS[input.state] ?? input.state}</td>
                <td className="note">{input.reason ?? input.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </figure>
  );
}
