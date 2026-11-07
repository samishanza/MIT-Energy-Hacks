import { CONCEPT_GRADE_NOTE, type ReadinessReport, type RecordVersion, type RunProgress } from "@eqore/contract";
import { conflictCounts, factsFound, gridRequestLine, isFound, verifiedCount } from "../app/facts";
import { ProvenanceTag } from "./marks";

export interface StatusStripProps {
  record: RecordVersion | null;
  report: ReadinessReport | null;
  progress: RunProgress | null;
  running: boolean;
}

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function summary(record: RecordVersion): string {
  const conflicts = conflictCounts(record);
  const parts = [`${factsFound(record)} public facts found`];
  if (record.coverage) parts.push(`${record.coverage.filled} of ${record.coverage.total} plan-set fields`);
  parts.push(counted(conflicts.source, "source conflict", "source conflicts"));
  if (conflicts.feeder > 0) parts.push(counted(conflicts.feeder, "field with feeder candidates", "fields with feeder candidates"));
  if (conflicts.listed > 0) parts.push(counted(conflicts.listed, "field with candidates, not settled", "fields with candidates, not settled"));
  return parts.join(", ");
}

function unverified(record: RecordVersion): string {
  const verified = verifiedCount(record);
  return verified === 0
    ? "Unverified: no person has checked these values."
    : `${counted(verified, "value", "values")} verified by a person. Everything else is unverified.`;
}

export function StatusStrip({ record, report, progress, running }: StatusStripProps) {
  const hasReal = record ? record.values.some((value) => !value.synthetic && isFound(value)) : false;
  const answered = progress?.sourceRuns.filter((run) => run.status !== "pending").length ?? 0;
  const grid = record ? gridRequestLine(report) : null;
  return (
    <section className="status-strip" aria-label="Site status">
      <p className="concept-note">{CONCEPT_GRADE_NOTE} Based on public data.</p>
      {record && !running ? (
        <>
          <p className="labels">
            {hasReal ? <ProvenanceTag synthetic={false} /> : null}
            {record.synthetic ? <ProvenanceTag synthetic /> : null}
            {record.snapshot ? <span className="tag">Recorded snapshot</span> : null}
          </p>
          <p className="unverified">{unverified(record)}</p>
          <p className="summary">{summary(record)}</p>
          {grid ? <p className="grid-line">{grid}</p> : <p className="grid-line note">Grid connection request check unavailable.</p>}
        </>
      ) : null}
      {running ? (
        <p className="summary" role="status">
          {progress && progress.sourceRuns.length > 0
            ? `Reading sources, ${answered} of ${progress.sourceRuns.length} answered`
            : "Finding the parcel"}
        </p>
      ) : null}
    </section>
  );
}
