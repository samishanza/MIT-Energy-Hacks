import type { RecordVersion } from "@eqore/contract";
import { useCallback, useEffect, useState } from "react";

// The review agent reads the site, checks the site plan, and proposes changes: a pin for the switchboard,
// meter or utility transformer, a pick between conflicting values, or a question. Nothing it proposes
// changes the record until a person accepts it, with their name and a reason.

type Proposal = {
  id: string;
  type: "pin" | "resolve_conflict" | "question" | "flag";
  payload: { field?: string; text?: string; candidateId?: string; longitude?: number; latitude?: number; step?: string; severity?: "high" | "medium" | "low"; issue?: string; suggestion?: string };
  rationale: string;
  createdAt: string;
  decision: { decision: "accepted" | "rejected"; decidedBy: string; reason: string; decidedAt: string } | null;
};
type Review = { status: "done" | "unavailable" | "failed"; reason?: string; summary?: string; proposals: Proposal[] };

const FIELD_WORDS: Record<string, string> = {
  switchboard_location: "main switchboard",
  meter_location: "utility meter",
  utility_transformer_location: "utility transformer",
};

function headline(p: Proposal): string {
  const what = FIELD_WORDS[p.payload.field ?? ""] ?? (p.payload.field ?? "").replace(/_/g, " ");
  if (p.type === "pin") return `Place the ${what}`;
  if (p.type === "resolve_conflict") return `Settle ${what}`;
  if (p.type === "flag") return `${(p.payload.step ?? "").replace(/_/g, " ")}: ${p.payload.issue ?? ""}`;
  return p.payload.text ?? "Question";
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(data.message ?? `The request failed (${response.status}).`);
  return data;
}

export function ReviewAgentPanel({ record, actorName, onActorName, onRecord }: { record: RecordVersion; actorName: string; onActorName: (name: string) => void; onRecord: (record: RecordVersion) => void }) {
  const siteId = record.site.id;
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const response = await fetch(`/api/sites/${siteId}/agent-proposals`);
    if (response.ok) setProposals((await response.json()) as Proposal[]);
  }, [siteId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run() {
    setRunning(true);
    setNote(null);
    try {
      const review = await post<Review>(`/api/sites/${siteId}/agent-review`);
      setNote(review.status === "done" ? (review.summary ?? `${review.proposals.length} proposals.`) : (review.reason ?? "The review didn't finish."));
      await load();
    } catch (failure) {
      setNote(failure instanceof Error ? failure.message : "The review didn't run.");
    } finally {
      setRunning(false);
    }
  }

  async function decide(p: Proposal, decision: "accept" | "reject") {
    const reason = (reasons[p.id] ?? "").trim();
    if (!actorName.trim() || !reason) return setNote("Add your name and a reason first.");
    try {
      const result = await post<{ record: RecordVersion | null }>(`/api/agent-proposals/${p.id}/${decision}`, { verifierName: actorName.trim(), reason });
      if (result.record) onRecord(result.record);
      await load();
    } catch (failure) {
      setNote(failure instanceof Error ? failure.message : "That didn't save.");
    }
  }

  const open = proposals.filter((p) => !p.decision);
  const decided = proposals.filter((p) => p.decision);
  return (
    <section className="review-agent" aria-label="Review agent">
      <p className="note">The agent checks this site plan and proposes changes. Nothing changes until you accept it.</p>
      <div className="review-agent__run">
        <button type="button" className="primary" disabled={running} onClick={() => void run()}>
          {running ? "Reviewing…" : "Run review"}
        </button>
        <label>
          Your name
          <input value={actorName} onChange={(e) => onActorName(e.target.value)} placeholder="Engineer" />
        </label>
      </div>
      {note ? <p className="note">{note}</p> : null}
      {open.length === 0 && !running ? <p className="note">No open proposals.</p> : null}
      <ol className="review-agent__list">
        {open.map((p) => (
          <li key={p.id}>
            {p.type === "flag" ? <span className={`review-agent__sev review-agent__sev--${p.payload.severity ?? "low"}`}>{p.payload.severity}</span> : null}
            <strong>{headline(p)}</strong>
            {p.type === "flag" && p.payload.suggestion ? <p className="review-agent__fix">Suggested fix: {p.payload.suggestion}</p> : null}
            <p>{p.rationale}</p>
            <input aria-label="Reason" placeholder="Reason" value={reasons[p.id] ?? ""} onChange={(e) => setReasons((r) => ({ ...r, [p.id]: e.target.value }))} />
            {p.type !== "question" ? (
              <button type="button" onClick={() => void decide(p, "accept")}>
                {p.type === "flag" ? "Agree" : "Accept"}
              </button>
            ) : null}
            <button type="button" onClick={() => void decide(p, "reject")}>
              {p.type === "question" ? "Dismiss" : "Reject"}
            </button>
          </li>
        ))}
      </ol>
      {decided.length ? (
        <details>
          <summary>Decided ({decided.length})</summary>
          <ol className="review-agent__list">
            {decided.map((p) => (
              <li key={p.id}>
                <strong>{headline(p)}</strong> · {p.decision!.decision} by {p.decision!.decidedBy}: {p.decision!.reason}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}
