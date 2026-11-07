import type { ReadinessReport, RecordVersion } from "@eqore/contract";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { EngineerApi, RunSiteRequest, RunSiteResponse } from "./api";
import { SOURCE_RUN_WORDS } from "./app/format";
import { isLinkOpen, trackLink, type TrackedLink } from "./app/links";
import { isEquipmentPoint } from "./map/layers";
import { SiteMap } from "./map/SiteMap";
import { ConfirmPanel } from "./panels/ConfirmPanel";
import { EvidencePanel } from "./panels/EvidencePanel";
import { ReadinessPanel } from "./panels/ReadinessPanel";
import { ProvenanceTag } from "./ui/marks";

const ACTOR_KEY = "eqore.actorName";

function loadActor(): string {
  try {
    return localStorage.getItem(ACTOR_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveActor(name: string) {
  try {
    localStorage.setItem(ACTOR_KEY, name);
  } catch {
    // Storage is only a convenience. The name still works for this session.
  }
}

const POLL_MS = 3000;

type Candidates = Extract<RunSiteResponse, { status: "needs_choice" }>["candidates"];

function ChoosePosition({ onPin }: { onPin: (latitude: number, longitude: number) => void }) {
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  return (
    <form
      className="pin-entry"
      onSubmit={(event) => {
        event.preventDefault();
        onPin(Number(latitude), Number(longitude));
      }}
    >
      <p className="note">Or give the site's position as a pin. It's recorded as placed by a person.</p>
      <label className="field">
        <span>Latitude</span>
        <input className="mono" required inputMode="decimal" value={latitude} onChange={(e) => setLatitude(e.target.value)} />
      </label>
      <label className="field">
        <span>Longitude</span>
        <input className="mono" required inputMode="decimal" value={longitude} onChange={(e) => setLongitude(e.target.value)} />
      </label>
      <button type="submit">Use this position</button>
    </form>
  );
}

export function App({ api }: { api: EngineerApi }) {
  const [address, setAddress] = useState("");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [candidates, setCandidates] = useState<Candidates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<RecordVersion | null>(null);
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [links, setLinks] = useState<TrackedLink[]>([]);
  const [actorName, setActorName] = useState(loadActor);
  const [confirmField, setConfirmField] = useState<string | null>(null);
  const [placingField, setPlacingField] = useState<string | null>(null);
  const [focusField, setFocusField] = useState<string | null>(null);
  const [arrival, setArrival] = useState<string | null>(null);
  const [change, setChange] = useState<string | null>(null);
  const current = useRef<{ record: RecordVersion | null; report: ReadinessReport | null }>({ record, report });
  current.current = { record, report };

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const show = useCallback(
    async (next: RecordVersion) => {
      const nextReport = await api.readReadiness(next.site.id, next.version);
      setRecord(next);
      setReport(nextReport);
      return nextReport;
    },
    [api],
  );

  const hasOpenLink = record ? links.some((tracked) => isLinkOpen(tracked, record)) : false;
  const siteId = record?.site.id;
  useEffect(() => {
    if (!hasOpenLink || !siteId) return;
    const timer = setInterval(() => {
      void api
        .readVersion(siteId, "latest")
        .then(async (latest) => {
          const previous = current.current.record;
          if (!previous || latest.version <= previous.version) return;
          const seen = new Set(previous.observations.map((o) => o.id));
          const labels = [
            ...new Set(
              latest.observations
                .filter((o) => !seen.has(o.id))
                .map((o) => latest.values.find((v) => v.field === o.field)?.label ?? o.field),
            ),
          ];
          await show(latest);
          if (labels.length > 0) setArrival(`New evidence for ${labels.join(", ")}`);
        })
        .catch(() => {
          // A missed check is retried on the next tick.
        });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [api, hasOpenLink, siteId, show]);

  async function afterAction(next: RecordVersion) {
    const before = current.current;
    const nextReport = await show(next);
    if (!before.record) return;
    const share = (report: ReadinessReport | null) => report?.share?.formRows;
    const was = share(before.report);
    const now = share(nextReport);
    const rows = was && now ? ` Form rows with evidence: ${was.withEvidence} to ${now.withEvidence} of ${now.total}.` : "";
    setChange(`Record v${before.record.version} to v${next.version}.${rows} Measured in this run.`);
  }

  const failed = (failure: unknown) => setError(failure instanceof Error ? failure.message : "That didn't work.");

  async function run(request: RunSiteRequest) {
    setRunning(true);
    setError(null);
    setCandidates(null);
    try {
      const response = await api.runSite(request);
      if (response.status === "needs_choice") {
        setCandidates(response.candidates);
      } else {
        setSelected([]);
        setLinks([]);
        setConfirmField(null);
        setPlacingField(null);
        setFocusField(null);
        setArrival(null);
        setChange(null);
        await show(response.record);
      }
    } catch (failure) {
      failed(failure);
    } finally {
      setRunning(false);
    }
  }

  function submitAddress(event: FormEvent) {
    event.preventDefault();
    if (address.trim()) void run({ address: address.trim() });
  }

  async function createLink(field: string) {
    if (!record) return;
    setError(null);
    try {
      const link = await api.createCaptureLink(record.site.id, field);
      setLinks((current) => [...current, trackLink(link, record)]);
    } catch (failure) {
      failed(failure);
    }
  }

  async function upload(field: string, file: File) {
    if (!record) return;
    setError(null);
    try {
      await api.uploadEvidence(record.site.id, field, file);
      await show(await api.readVersion(record.site.id, "latest"));
      setSelected([field]);
      setConfirmField(field);
    } catch (failure) {
      failed(failure);
    }
  }

  async function place(field: string, longitude: number, latitude: number) {
    if (!record) return;
    setError(null);
    try {
      const next = await api.movePin(record.site.id, { field, latitude, longitude, placedBy: actorName });
      setPlacingField(null);
      setFocusField(field);
      // Placing moves a label but adds no evidence, so the last before-and-after line stays up.
      await show(next);
    } catch (failure) {
      failed(failure);
    }
  }

  const updateActor = (name: string) => {
    setActorName(name);
    saveActor(name);
  };

  const answered = record?.sourceRuns.filter((run) => run.status === "done" || run.status === "snapshot").length ?? 0;

  return (
    <div className="app">
      <header className="header">
        <form className="address" onSubmit={submitAddress}>
          <label className="field">
            <span>Site address</span>
            <input value={address} onChange={(event) => setAddress(event.target.value)} />
          </label>
          <button type="submit" className="primary" disabled={running}>
            Run site
          </button>
          {running ? <p className="note">Running sources, {elapsed} s</p> : null}
        </form>
        {record ? (
          <div className="site-summary">
            <p className="site-address">{record.site.address}</p>
            <p>Record v{record.version}</p>
            <ProvenanceTag synthetic={record.synthetic} />
            <p className="note">{answered} of {record.sourceRuns.length} sources answered</p>
          </div>
        ) : null}
        {record ? (
          <ul className="sources" aria-label="Sources">
            {record.sourceRuns.map((sourceRun) => (
              <li key={sourceRun.sourceId} className={`source source-${sourceRun.status}`}>
                <span>{sourceRun.name}</span> <strong>{SOURCE_RUN_WORDS[sourceRun.status]}</strong>
                {sourceRun.reason ? <span className="note"> {sourceRun.reason}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {record?.snapshot ? (
        <div role="status" aria-label="Snapshot" className="snapshot-banner">
          Snapshot recorded {record.createdAt.slice(0, 10)}. Sources were not queried now.
        </div>
      ) : null}

      {arrival ? (
        <div role="status" aria-label="New evidence" className="notice-bar">
          {arrival}
          <button type="button" onClick={() => setArrival(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {change ? (
        <div role="status" aria-label="Change" className="notice-bar change-bar">
          {change}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="error app-error">
          {error}
        </p>
      ) : null}

      {candidates ? (
        <section className="choose" aria-label="Choose a site">
          <h2>{candidates.length ? "This address has several matches" : "No match found. Nothing stored."}</h2>
          <ul>
            {candidates.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  onClick={() => void run({ address: address.trim(), choice: { kind: "candidate", candidateId: candidate.id } })}
                >
                  {candidate.label} ({candidate.source})
                </button>
              </li>
            ))}
          </ul>
          <ChoosePosition
            onPin={(latitude, longitude) =>
              void run({ address: address.trim(), choice: { kind: "pin", latitude, longitude } })
            }
          />
        </section>
      ) : null}

      {record && report ? (
        <main className="workspace">
          <ReadinessPanel
            record={record}
            report={report}
            links={links}
            selectedFields={selected}
            onSelectFields={setSelected}
            onCreateLink={(field) => void createLink(field)}
            onUpload={(field, file) => void upload(field, file)}
            onOpenConfirm={(field) => {
              setSelected([field]);
              setConfirmField(field);
            }}
          />
          <div className={`map-region${selected.length > 0 ? " dock-open" : ""}`}>
            <SiteMap
              key={record.site.id}
              record={record}
              selectedFields={selected}
              onSelect={(field) => setSelected([field])}
              dockOpen={selected.length > 0}
              placingField={placingField}
              onPlace={(field, longitude, latitude) => void place(field, longitude, latitude)}
              focusField={focusField}
            />
            {selected.length > 0 ? (
              <EvidencePanel
                api={api}
                record={record}
                report={report}
                fields={selected}
                actorName={actorName}
                onActorName={updateActor}
                onRecord={(next) => void afterAction(next)}
                onClose={() => setSelected([])}
              />
            ) : null}
          </div>
        </main>
      ) : null}

      {record && confirmField ? (
        <ConfirmPanel
          api={api}
          record={record}
          field={confirmField}
          actorName={actorName}
          onActorName={updateActor}
          onRecord={(next) => {
            const hasPoint = next.features.some((f) => f.field === confirmField && isEquipmentPoint(f));
            if (hasPoint) setFocusField(confirmField);
            else setPlacingField(confirmField);
            setConfirmField(null);
            void afterAction(next);
          }}
          onClose={() => setConfirmField(null)}
          onPlace={(field) => {
            setConfirmField(null);
            setPlacingField(field);
          }}
        />
      ) : null}
    </div>
  );
}
