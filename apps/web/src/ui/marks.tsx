import type { FitnessGrade, Value, ValueState } from "@eqore/contract";
import { GRADE_WORDS, METHOD_WORDS, STATE_WORDS } from "../app/format";

function Glyph({ state }: { state: ValueState }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6 };
  return (
    <svg className="state-glyph" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" data-state-mark={state}>
      {state === "missing" && <circle cx="8" cy="8" r="6" {...common} strokeDasharray="2.5 2" />}
      {state === "conflicting" && (
        <>
          <circle cx="6" cy="8" r="4.5" {...common} />
          <circle cx="10" cy="8" r="4.5" {...common} />
        </>
      )}
      {state === "unreadable" && (
        <>
          <circle cx="8" cy="8" r="6" {...common} />
          <path d="M3.8 12.2 12.2 3.8" {...common} />
        </>
      )}
      {state === "inferred" && <path d="M2 10c2-4 4-4 6-2s4 2 6-2" {...common} />}
      {state === "verified" && (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="m4.8 8.2 2.2 2.2 4.2-4.6" fill="none" stroke="var(--paper)" strokeWidth="1.8" />
        </>
      )}
    </svg>
  );
}

const CONFLICT_WORDS = {
  source_disagreement: "Sources disagree",
  feeder_candidates: "Feeder candidates",
} as const;

export function StateBadge({ value }: { value: Value }) {
  const detail =
    value.state === "inferred" && value.method
      ? METHOD_WORDS[value.method]
      : value.state === "verified"
        ? value.verification?.verifierName
        : value.state === "conflicting" && value.conflictKind
          ? CONFLICT_WORDS[value.conflictKind]
          : undefined;
  return (
    <span className={`state state-${value.state}`}>
      <Glyph state={value.state} />
      <span>
        {STATE_WORDS[value.state]}
        {detail ? `: ${detail}` : ""}
      </span>
    </span>
  );
}

export function GradeTag({ grade }: { grade: FitnessGrade | null }) {
  return grade ? <span className="tag">{GRADE_WORDS[grade]} grade</span> : null;
}

export function ProvenanceTag({ synthetic }: { synthetic: boolean }) {
  return synthetic ? <span className="tag tag-synthetic">Synthetic</span> : <span className="tag tag-real">Real public data</span>;
}
