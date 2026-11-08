import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { PortalError, type PortalApi, type PortalDocument, type PortalState } from "./portalApi";

const STATUS_WORDS: Record<PortalDocument["status"], string> = {
  needed: "Needed",
  received: "Received, being reviewed",
  confirmed: "Confirmed",
  optional: "Optional",
};

const ENDED: Record<string, string> = {
  invalid_token: "This link isn't active. Please ask the person who sent it for a new one.",
  token_expired: "This link has expired. Please ask the person who sent it for a new one.",
};

// One document kind: what to send, its status, and a file picker that uploads at once.
function DocumentRow({ doc, onUpload, busy }: { doc: PortalDocument; onUpload: (kind: string, file: File) => void; busy: boolean }) {
  const inputId = `file-${doc.kind}`;
  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onUpload(doc.kind, file);
    event.target.value = "";
  };
  return (
    <li className={`portal-doc portal-${doc.status}`}>
      <div className="portal-doc-head">
        <strong>{doc.label}</strong>
        <span className="portal-status">{STATUS_WORDS[doc.status]}</span>
      </div>
      <p className="note">{doc.hint}</p>
      <label htmlFor={inputId} className={`portal-pick${busy ? " disabled" : ""}`}>
        {doc.status === "needed" || doc.status === "optional" ? "Upload a file" : "Upload another"}
      </label>
      <input id={inputId} className="visually-hidden" type="file" accept="image/jpeg,image/png,application/pdf" disabled={busy} onChange={pick} />
    </li>
  );
}

export function PortalPage({ token, api }: { token: string; api: PortalApi }) {
  const [state, setState] = useState<PortalState | null>(null);
  const [ended, setEnded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await api.read(token));
    } catch (error) {
      const code = error instanceof PortalError ? error.code : "unreachable";
      setEnded(ENDED[code] ?? "We couldn't reach the site right now. Please try again in a few minutes.");
    }
  }, [api, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (kind: string, file: File) => {
    setBusy(kind);
    setMessage(null);
    try {
      const result = await api.upload(token, kind, file);
      const read = result.state === "read" ? " and read it" : "";
      setMessage({ kind: "ok", text: `Thank you. We received ${file.name}${read}; an engineer will review it.` });
      await load();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof PortalError ? error.message : "The upload didn't go through. Please try again." });
    } finally {
      setBusy(null);
    }
  };

  if (ended) {
    return (
      <main className="portal">
        <p className="capture-message">{ended}</p>
      </main>
    );
  }
  if (!state) {
    return (
      <main className="portal">
        <p className="note">Loading…</p>
      </main>
    );
  }
  const needed = state.documents.filter((d) => d.status === "needed").length;
  return (
    <main className="portal">
      <header>
        <h1>Documents for your battery project</h1>
        <p className="portal-address">{state.address}</p>
        <p className="note">
          {needed ? `${needed} item${needed === 1 ? "" : "s"} still needed.` : "We have every item we asked for. You can still add more."} JPEG, PNG, or PDF, up to 15 MB each.
          Photograph only what is on the outside of electrical equipment; never open a panel or cabinet.
        </p>
      </header>
      {message ? (
        <p className={message.kind === "error" ? "error" : "portal-ok"} role="status">
          {message.text}
        </p>
      ) : null}
      {busy ? (
        <p className="note" role="status">
          Uploading and reading the file…
        </p>
      ) : null}
      <ul className="portal-docs">
        {state.documents.map((doc) => (
          <DocumentRow key={doc.kind} doc={doc} onUpload={upload} busy={busy !== null || state.uploadsLeft === 0} />
        ))}
      </ul>
      {state.uploads.length ? (
        <section>
          <h2>What you have sent</h2>
          <ul className="portal-sent">
            {state.uploads.map((u, i) => (
              <li key={i}>
                <span className="mono">{u.fileName}</span> <span className="note">{new Date(u.receivedAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <footer className="note">
        This link works until {new Date(state.expiresAt).toLocaleDateString()}. {state.uploadsLeft} uploads left.
      </footer>
    </main>
  );
}
