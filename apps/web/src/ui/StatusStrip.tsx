import { type ReadinessReport, type RecordVersion, type RunProgress } from "@eqore/contract";
import { conflictCounts, factsFound, gridRequestLine, verifiedCount } from "../app/facts";
import { ProvenanceTag } from "./marks";

export interface StatusStripProps {
  record: RecordVersion | null;
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

/**
 * A few words in the header, only when there's something to say: progress while a run reads
 * sources, and the labels a person must not miss (synthetic data, a recorded snapshot).
 * Real public data is the normal case and isn't labeled here.
 */
export function StatusStrip({ record, progress, running }: StatusStripProps) {
  const answered = progress?.sourceRuns.filter((run) => run.status !== "pending").length ?? 0;
  const synthetic = Boolean(record && !running && record.synthetic);
  const snapshot = Boolean(record && !running && record.snapshot);
  if (!running && !synthetic && !snapshot) return null;
  return (
    <section className="status-strip" aria-label="Site status">
      {synthetic ? <ProvenanceTag synthetic /> : null}
      {snapshot ? <span className="tag">Recorded snapshot</span> : null}
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

/** The record's counts, at the top of the facts menu rather than always on screen. */
export function RecordSummary({ record, report }: { record: RecordVersion; report: ReadinessReport | null }) {
  const grid = gridRequestLine(report);
  return (
    <div className="record-summary">
      <p className="summary">
        Record v{record.version}. {summary(record)}.
      </p>
      <p className="unverified">{unverified(record)}</p>
      <p className="grid-line">{grid ?? "Grid connection request check unavailable."}</p>
    </div>
  );
}
