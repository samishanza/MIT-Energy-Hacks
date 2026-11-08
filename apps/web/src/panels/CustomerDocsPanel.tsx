import type { RecordVersion } from "@eqore/contract";
import { useCallback, useEffect, useState } from "react";

// Send the customer one link where they upload a utility bill, switchgear label, transformer nameplate or
// drawings. Each upload is read into draft values that stay unconfirmed until a person verifies them.

type Upload = { kind: string; evidenceFileId: string; fileName: string; receivedAt: string; state: string };
type Link = { url: string; expiresAt: string; maxUploads: number };

const KIND_WORDS: Record<string, string> = {
  utility_bill: "Utility bill",
  switchgear_label: "Switchgear label",
  transformer_nameplate: "Transformer nameplate",
  electrical_drawings: "Electrical drawings",
  other: "Other document",
};
const STATE_WORDS: Record<string, string> = {
  inferred: "Read, needs confirming",
  unreadable: "Couldn't be read",
  extraction_failed: "Saved, not read",
  stored: "Saved",
};

export function CustomerDocsPanel({ record }: { record: RecordVersion }) {
  const siteId = record.site.id;
  const [link, setLink] = useState<Link | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/sites/${siteId}/portal-uploads`);
    if (response.ok) setUploads((await response.json()) as Upload[]);
  }, [siteId]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function create() {
    setNote(null);
    try {
      const response = await fetch(`/api/sites/${siteId}/portal-links`, { method: "POST" });
      const data = (await response.json()) as Link & { message?: string };
      if (!response.ok) throw new Error(data.message ?? "The link couldn't be made.");
      setLink(data);
      try {
        await navigator.clipboard.writeText(data.url);
        setNote("Copied to the clipboard.");
      } catch {
        setNote("Copy the link below.");
      }
    } catch (failure) {
      setNote(failure instanceof Error ? failure.message : "The link couldn't be made.");
    }
  }

  return (
    <section className="customer-docs" aria-label="Customer documents">
      <p className="note">One link for the customer to upload a utility bill, switchgear label, transformer nameplate or drawings. Values read from them wait for your confirmation.</p>
      <button type="button" className="primary" onClick={() => void create()}>
        Send document link to customer
      </button>
      {link ? (
        <div className="customer-docs__link">
          <input readOnly value={link.url} aria-label="Customer link" onFocus={(e) => e.currentTarget.select()} />
          <span className="note">
            Works until {new Date(link.expiresAt).toLocaleDateString()}, for up to {link.maxUploads} uploads.
          </span>
        </div>
      ) : null}
      {note ? <p className="note">{note}</p> : null}
      <h4>Received</h4>
      {uploads.length === 0 ? <p className="note">Nothing yet.</p> : null}
      <ul className="customer-docs__list">
        {uploads.map((u) => (
          <li key={u.evidenceFileId}>
            <strong>{KIND_WORDS[u.kind] ?? u.kind}</strong> · {u.fileName}
            <span className="note">
              {" "}
              {STATE_WORDS[u.state] ?? u.state}, {new Date(u.receivedAt).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
