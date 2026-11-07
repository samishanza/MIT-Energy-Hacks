import type { Gap, ReadinessItem, ReadinessReport, RecordVersion } from "@eqore/contract";
import { useRef, useState } from "react";
import { formatCurrent, OWNER_WORDS } from "../app/format";
import { linkRow, type TrackedLink } from "../app/links";
import { StateBadge } from "../ui/marks";

export interface ReadinessPanelProps {
  record: RecordVersion;
  report: ReadinessReport;
  links: TrackedLink[];
  selectedFields: string[];
  onSelectFields: (fields: string[]) => void;
  onCreateLink: (field: string) => void;
  onUpload: (field: string, file: File) => void;
  onOpenConfirm: (field: string) => void;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

function statusWords(item: ReadinessItem, record: RecordVersion): string {
  switch (item.status) {
    case "has_evidence":
      return "Evidence in hand";
    case "preview_only":
      return "Preview only: public data, not the authoritative source";
    case "engineer_owned":
      return item.inputsWithEvidence
        ? `Engineer decision, ${item.inputsWithEvidence.have} of ${item.inputsWithEvidence.total} inputs have evidence`
        : "Engineer decision";
    case "needs_evidence": {
      const conflicts = item.fields.filter(
        (field) => record.values.find((v) => v.field === field)?.state === "conflicting",
      ).length;
      return `Needs evidence from ${OWNER_WORDS[item.owner]}${conflicts ? `, ${conflicts} conflicting` : ""}`;
    }
  }
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="link-box">
      <code className="link-url">{url}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(
            () => setCopied(true),
            () => setCopied(false),
          );
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </button>
      <p className="note">This tool does not send it. Send it to the facility contact yourself.</p>
    </div>
  );
}

function GapAction(props: {
  gap: Gap;
  record: RecordVersion;
  tracked?: TrackedLink;
  onCreateLink: (field: string) => void;
  onUpload: (field: string, file: File) => void;
  onOpenConfirm: (field: string) => void;
}) {
  const { gap, record, tracked } = props;
  const [draftOpen, setDraftOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  if (gap.route === "qualified_person") {
    return <p className="gap-note">Needs a qualified person. No capture link is offered, and this tool contacts no one.</p>;
  }
  if (gap.route === "pre_application_report" || gap.route === "customer_record") {
    if (!gap.draftRequest) return <p className="gap-note">No draft available</p>;
    return (
      <>
        <button type="button" onClick={() => setDraftOpen(!draftOpen)}>
          {draftOpen ? "Hide draft" : "View draft"}
        </button>
        {draftOpen ? (
          <div className="draft">
            <p className="note">Draft. This tool does not send anything.</p>
            <p className="draft-text">{gap.draftRequest}</p>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(gap.draftRequest ?? "")}>
              Copy text
            </button>
          </div>
        ) : null}
      </>
    );
  }

  const row = tracked ? linkRow(tracked, record) : null;
  const canMakeLink = !record.snapshot && (!row || row.action === "new");
  return (
    <div className="gap-actions">
      {row ? <p className="gap-status">{row.text}</p> : null}
      {row?.action === "confirm" ? (
        <button type="button" className="primary" onClick={() => props.onOpenConfirm(gap.field)}>
          Open to confirm
        </button>
      ) : null}
      {tracked && row?.action === "copy" ? <CopyLink url={tracked.link.url} /> : null}
      {!row || row.action === "new" ? (
        <button type="button" className="primary" disabled={!canMakeLink} onClick={() => props.onCreateLink(gap.field)}>
          Create capture link
        </button>
      ) : null}
      <button type="button" onClick={() => fileInput.current?.click()}>
        Upload evidence
      </button>
      <input
        ref={fileInput}
        type="file"
        hidden
        accept="image/jpeg,image/png,application/pdf"
        aria-label={`Upload evidence for ${gap.request}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) props.onUpload(gap.field, file);
          event.target.value = "";
        }}
      />
      {record.snapshot ? <p className="note">This is a recorded snapshot, so no new link can be made.</p> : null}
    </div>
  );
}

export function ReadinessPanel(props: ReadinessPanelProps) {
  const { record, report, links, selectedFields, onSelectFields } = props;
  const ranked = report.gaps.filter((gap) => gap.route !== "engineer").sort((a, b) => a.rank - b.rank);
  const engineerGaps = report.gaps.filter((gap) => gap.route === "engineer");
  const top = ranked[0];
  const engineerItems = report.items.filter((item) => item.status === "engineer_owned");
  const otherItems = report.items.filter((item) => item.status !== "engineer_owned" && !item.parentItemId);
  const inputsOf = (id: string) => report.items.filter((item) => item.parentItemId === id);
  const covered = new Set([...report.items.flatMap((i) => i.fields), ...report.gaps.map((g) => g.field)]);
  const others = record.values
    .filter((value) => !covered.has(value.field))
    .sort((a, b) => Number(b.state === "conflicting") - Number(a.state === "conflicting"));
  const sourceConflicts = record.values.filter((v) => v.conflictKind === "source_disagreement").length;
  const feederCandidates = record.values.filter((v) => v.conflictKind === "feeder_candidates").length;
  const table = report.requirementsTable;

  const isSelected = (fields: string[]) => fields.some((field) => selectedFields.includes(field));

  const itemRow = (item: ReadinessItem) => (
    <li key={item.id}>
      <button
        type="button"
        className={`item-row${isSelected(item.fields) ? " is-selected" : ""}`}
        onClick={() => onSelectFields(item.fields)}
      >
        <span className="item-label">{item.label}</span>
        {item.teamDerived ? <span className="tag">Team-derived</span> : null}
        <span className="item-status">{statusWords(item, record)}</span>
        <span className="item-citation">{item.citation}</span>
      </button>
      {item.rowKind === "form" && inputsOf(item.id).length > 0 ? (
        <ul className="item-inputs">{inputsOf(item.id).map(itemRow)}</ul>
      ) : null}
    </li>
  );

  return (
    <section className="report" aria-label="Evidence check">
      <h2>Evidence check against the form</h2>
      <p className="note">Not an approval or a prediction of utility review.</p>

      {!table ? <p className="no-table">{report.noTableReason}</p> : null}

      {report.share ? (
        <div className="counts">
          <p>{report.share.formRows.withEvidence} of {report.share.formRows.total} form rows have evidence</p>
          <p>{report.share.inputRows.withEvidence} of {report.share.inputRows.total} drawing inputs have evidence</p>
        </div>
      ) : null}
      <div className="counts">
        <p>{sourceConflicts} source {plural(sourceConflicts, "conflict", "conflicts")}</p>
        <p>{feederCandidates} {plural(feederCandidates, "field", "fields")} with feeder candidates</p>
      </div>

      {top ? (
        <section className="next-request" aria-label="Next request">
          <h3>Next request</h3>
          <p>{top.request}</p>
          <p className="note">From {OWNER_WORDS[top.owner]}. Fills {top.rowsFilled.length} required {plural(top.rowsFilled.length, "row", "rows")}.</p>
        </section>
      ) : null}

      <ol className="gaps" aria-label="Ranked gaps">
        {ranked.map((gap) => (
          <li key={gap.id} className={selectedFields.includes(gap.field) ? "is-selected" : undefined}>
            <button type="button" className="gap-title" onClick={() => onSelectFields([gap.field])}>
              {gap.request}
            </button>
            <GapAction
              gap={gap}
              record={record}
              tracked={links.filter((l) => l.link.field === gap.field).at(-1)}
              onCreateLink={props.onCreateLink}
              onUpload={props.onUpload}
              onOpenConfirm={props.onOpenConfirm}
            />
          </li>
        ))}
      </ol>

      {otherItems.length > 0 ? (
        <section aria-label="Required items">
          <h3>Required items</h3>
          <ul className="items">{otherItems.map(itemRow)}</ul>
        </section>
      ) : null}

      {engineerItems.length + engineerGaps.length > 0 ? (
        <section aria-label="Engineer decisions">
          <h3>Engineer decisions</h3>
          <p className="note">Your decision. This tool does not fill these.</p>
          <ul className="items">
            {engineerItems.filter((item) => !item.parentItemId).map(itemRow)}
            {engineerGaps.map((gap) => (
              <li key={gap.id} className="item-row-static">{gap.request}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {others.length > 0 ? (
        <section aria-label="Other record values, not required by this form">
          <h3>Other record values</h3>
          <p className="note">Not required by this form. Shown for context.</p>
          <ul className="items">
            {others.map((value) => (
              <li key={value.field}>
                <button
                  type="button"
                  className={`item-row${selectedFields.includes(value.field) ? " is-selected" : ""}`}
                  onClick={() => onSelectFields([value.field])}
                >
                  <span className="item-label">{value.label}</span>
                  <span className="mono">{formatCurrent(value)}</span>
                  <StateBadge value={value} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div role="contentinfo" className="report-footer">
        <p>Record v{record.version}</p>
        {table ? (
          <p>
            {table.utility}: {table.form}, dated {table.formDate}
            {table.superseded ? ". Built from a superseded form." : ""}
          </p>
        ) : null}
      </div>
    </section>
  );
}
