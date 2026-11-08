import type { MapFeature, ReadinessReport, RecordVersion, RunProgress } from "@eqore/contract";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { EngineerApi, ExportFormat, RunSiteRequest, RunSiteResponse } from "./api";
import { attentionItems, factsFound } from "./app/facts";
import { SiteMap } from "./map/SiteMap";
import { AttentionList } from "./panels/AttentionList";
import { ElectricalSheet } from "./panels/ElectricalSheet";
import { StreetViewPanel } from "./panels/StreetViewPanel";
import { demoSpecsFor } from "./app/demoSpecs";
import { EvidencePanel } from "./panels/EvidencePanel";
import { FactsPanel } from "./panels/FactsPanel";
import { EngineeringSitePlan, featureLabels } from "@eqore/sheets";
import { conceptSiteLayout } from "@eqore/electrical";
import { loadPlanFeatures, planMapFeatures, withPlanSet } from "./app/planFeatures";
import { Menu } from "./ui/Menu";
import { RecordSummary, StatusStrip } from "./ui/StatusStrip";
import { Icon } from "./ui/icons";
import { Landing } from "./ui/Landing";

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

const PROGRESS_MS = 700;

type Candidates = Extract<RunSiteResponse, { status: "needs_choice" }>["candidates"];
type Selection = { fields: string[]; featureId: string | null };

// A poll that brings nothing new keeps the same object, so the map isn't redrawn every tick.
function sameProgress(a: RunProgress | null, b: RunProgress): boolean {
  return (
    a !== null &&
    a.site?.id === b.site?.id &&
    a.features.length === b.features.length &&
    a.sourceRuns.length === b.sourceRuns.length &&
    a.features.every((feature, i) => feature.id === b.features[i]!.id) &&
    a.sourceRuns.every((run, i) => run.status === b.sourceRuns[i]?.status)
  );
}
const NOTHING: Selection = { fields: [], featureId: null };

function ChoosePosition({ onPin }: { onPin: (latitude: number, longitude: number) => void }) {
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [invalid, setInvalid] = useState(false);
  return (
    <form
      className="pin-entry"
      onSubmit={(event) => {
        event.preventDefault();
        const position = [Number(latitude), Number(longitude)] as const;
        const usable = position.every(Number.isFinite);
        setInvalid(!usable);
        if (usable) onPin(...position);
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
      {invalid ? (
        <p role="alert" className="error">
          Latitude and longitude each need to be a number.
        </p>
      ) : null}
    </form>
  );
}

function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A dimension a person verified (from a plan set or a survey) prints the verified figure; the line itself
// stays where public data drew it.
function withVerifiedDimensions(record: RecordVersion) {
  return record.features.map((feature) => {
    // A main switchboard a person placed is drawn as the existing switchboard it is.
    if (feature.kind === "capture_pin" && feature.field === "switchboard_location" && feature.geometry.type === "Point") {
      return {
        ...feature,
        kind: "existing_equipment" as const,
        label: "(E) MAIN SWITCHBOARD",
        attributes: {
          ...feature.attributes,
          equipment_type: { type: "text" as const, value: "service_entrance" },
          basis: { type: "text" as const, value: "placed by a person" },
          confidence_reason: { type: "text" as const, value: "Placed by hand from a document or a site visit; the record's switchboard location value carries the source." },
        },
      };
    }
    if (feature.kind !== "dimension_line") return feature;
    const value = record.values.find((v) => v.field === feature.field);
    if (value?.state !== "verified" || value.current?.type !== "quantity" || value.current.unit !== "ft") return feature;
    const feet = value.current.value;
    return { ...feature, label: `${Number.isInteger(feet) ? feet : feet.toFixed(1)} ft` };
  });
}

export function App({ api }: { api: EngineerApi }) {
  const [address, setAddress] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [candidates, setCandidates] = useState<Candidates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<RecordVersion | null>(null);
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [selected, setSelected] = useState<Selection>(NOTHING);
  // The details dock folds to a rail when the map is moved or on request, and opens on a new pick.
  const [dockCollapsed, setDockCollapsed] = useState(false);
  useEffect(() => setDockCollapsed(false), [selected]);
  const [actorName, setActorName] = useState(loadActor);
  const [placingField, setPlacingField] = useState<string | null>(null);
  const [focusField, setFocusField] = useState<string | null>(null);
  // The map answers "where is it"; the sheet answers "what can we build". Different
  // instruments, so they get their own view rather than layers on one canvas.
  const [view, setView] = useState<"map" | "sheet" | "electrical" | "street">("map");
  const [change, setChange] = useState<string | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const current = useRef<{ record: RecordVersion | null; report: ReadinessReport | null }>({ record, report });
  current.current = { record, report };

  const select = (field: string, featureId?: string) => setSelected({ fields: [field], featureId: featureId ?? null });

  // Only the most recent request to show a record may land, however the responses are ordered.
  // A skipped older version must not take the token from a newer request still waiting on its check.
  const showRequest = useRef(0);
  const show = useCallback(
    async (next: RecordVersion) => {
      const shown = current.current.record;
      if (shown && shown.site.id === next.site.id && next.version < shown.version) return null;
      showRequest.current += 1;
      const request = showRequest.current;
      setRecord(next);
      const nextReport = await api.readReadiness(next.site.id, next.version);
      if (request !== showRequest.current) return null;
      setReport(nextReport);
      return nextReport;
    },
    [api],
  );

  async function afterAction(next: RecordVersion) {
    const before = current.current;
    let nextReport: ReadinessReport | null;
    try {
      nextReport = await show(next);
    } catch {
      setError("The change was saved, but the screen couldn't refresh the evidence check. Run the site again to update it.");
      return;
    }
    if (!before.record || !nextReport) return;
    const share = (report: ReadinessReport | null) => report?.share?.formRows;
    const was = share(before.report);
    const now = share(nextReport);
    const rows = was && now ? ` Form rows with evidence: ${was.withEvidence} to ${now.withEvidence} of ${now.total}.` : "";
    const facts = ` Public facts found: ${factsFound(before.record)} to ${factsFound(next)}.`;
    setChange(`Record v${before.record.version} to v${next.version}.${facts}${rows} Measured in this run.`);
  }

  const failed = (failure: unknown) => setError(failure instanceof Error ? failure.message : "That didn't work.");

  async function run(request: RunSiteRequest) {
    setRunning(true);
    setProgress(null);
    setError(null);
    // A missed progress read is retried on the next tick.
    let reading = false;
    let finished = false;
    const timer = setInterval(() => {
      if (reading) return;
      reading = true;
      void api
        .readRunProgress(request.address)
        .then((next) => {
          if (finished || next?.status !== "running") return;
          setProgress((shown) => (sameProgress(shown, next) ? shown : next));
        })
        .catch(() => {})
        .finally(() => {
          reading = false;
        });
    }, PROGRESS_MS);
    try {
      const response = await api.runSite(request);
      if (response.status === "needs_choice") {
        setCandidates(response.candidates);
      } else {
        setCandidates(null);
        setSelected(NOTHING);
        setPlacingField(null);
        setFocusField(null);
        setChange(null);
        setExportNote(null);
        setReport(null);
        // The map and facts don't need the evidence check. The strip says when it's unavailable.
        await show(response.record).catch(() => {});
      }
    } catch (failure) {
      failed(failure);
    } finally {
      finished = true;
      clearInterval(timer);
      setProgress(null);
      setRunning(false);
    }
  }

  function submitAddress(event: FormEvent) {
    event.preventDefault();
    if (address.trim()) void run({ address: address.trim() });
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

  async function download(format: ExportFormat) {
    if (!record) return;
    setExportNote(null);
    try {
      const file = await api.exportFile(record.site.id, record.version, format);
      if (!file) {
        setExportNote(`The server doesn't offer the ${format.toUpperCase()} file yet. The map and facts are unaffected.`);
        return;
      }
      saveFile(file, `${record.site.id}-v${record.version}.${format}`);
    } catch (failure) {
      setExportNote(failure instanceof Error ? failure.message : "The download didn't work.");
    }
  }

  const updateActor = (name: string) => {
    setActorName(name);
    saveActor(name);
  };

  const live = running && progress?.site ? progress : null;
  const mapSite = live?.site ?? record?.site;
  const dockOpen = !live && selected.fields.length > 0;
  // The concept layout is drawn from the record each time, never stored, so a re-run can't carry a stale one.
  // A site with a traced engineered plan set draws from it; the rest come from public data.
  const [plan, setPlan] = useState<MapFeature[]>([]);
  const siteId = record?.site.id;
  useEffect(() => {
    let current = true;
    setPlan([]);
    if (siteId) void loadPlanFeatures(siteId).then((data) => current && data && setPlan(planMapFeatures(data)));
    return () => {
      current = false;
    };
  }, [siteId]);
  const drawn = useMemo(
    () => (record ? { ...record, features: withPlanSet([...withVerifiedDimensions(record), ...conceptSiteLayout(record)], plan) } : null),
    [record, plan],
  );
  const labels = useMemo(() => (drawn && !live ? featureLabels(drawn) : undefined), [drawn, live]);
  const pick = (close: () => void) => (field: string) => {
    select(field);
    close();
  };

  // Before any site opens, the landing holds the address field; after, the top bar does.
  const landing = !mapSite && !candidates;
  const addressForm = (large: boolean) => (
    <form className={`address is-address${large ? " is-address--lg" : ""}`} onSubmit={submitAddress}>
      <Icon name={large ? "pin" : "search"} small={!large} />
      <input aria-label="Site address" placeholder="Enter a site address" value={address} onChange={(event) => setAddress(event.target.value)} />
      <button type="submit" className="primary" disabled={running}>
        Run site {large ? <Icon name="arrow" small /> : null}
      </button>
    </form>
  );

  return (
    <div className={`app${landing ? " app-landing" : ""}`}>
      <header className="header">
        <img className="brand-logo" src="/insite-logo.png" alt="InSite" />
        {landing ? null : addressForm(false)}
        {record && !live ? (
          <div className="site-summary">
            <p className="site-address">{record.site.address}</p>
            <div className="menus">
              <Menu label="Needs attention" count={attentionItems(record).length} alert={attentionItems(record).length > 0}>
                {(close) => <AttentionList record={record} selectedFields={selected.fields} onSelect={pick(close)} />}
              </Menu>
              <Menu label="Public facts" count={factsFound(record)}>
                {(close) => (
                  <>
                    <RecordSummary record={record} report={report} />
                    <FactsPanel record={record} selectedFields={selected.fields} onSelect={pick(close)} />
                  </>
                )}
              </Menu>
              <Menu label="Download" align="right">
                {(close) => (
                  <div className="downloads" role="group" aria-label="Download the site geometry">
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        void download("dxf");
                      }}
                    >
                      DXF for CAD
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        void download("kml");
                      }}
                    >
                      KML for Google Earth
                    </button>
                  </div>
                )}
              </Menu>
            </div>
          </div>
        ) : null}
        <StatusStrip record={live ? null : record} progress={progress} running={running} />
      </header>

      {record?.snapshot && !live ? (
        <div role="status" aria-label="Snapshot" className="snapshot-banner">
          Snapshot recorded {record.createdAt.slice(0, 10)}. Sources were not queried now.
        </div>
      ) : null}

      {exportNote ? (
        <div role="status" aria-label="Download" className="notice-bar">
          {exportNote}
          <button type="button" onClick={() => setExportNote(null)}>
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

      {landing ? (
        <Landing
          form={addressForm(true)}
          disabled={running}
          onTry={(next) => {
            setAddress(next);
            void run({ address: next });
          }}
        />
      ) : null}

      {mapSite ? (
        <main className="workspace">
          <div className={`map-region${dockOpen ? (dockCollapsed ? " dock-collapsed" : " dock-open") : ""}`}>
            <div className="view-tabs" role="tablist" aria-label="Site view">
              <button type="button" role="tab" aria-selected={view === "map"} className={view === "map" ? "on" : ""} onClick={() => setView("map")}>
                Map
              </button>
              <button type="button" role="tab" aria-selected={view === "sheet"} className={view === "sheet" ? "on" : ""} disabled={!record || Boolean(live)} onClick={() => setView("sheet")}>
                Site plan
              </button>
              <button type="button" role="tab" aria-selected={view === "electrical"} className={view === "electrical" ? "on" : ""} disabled={!record || Boolean(live)} onClick={() => setView("electrical")}>
                Single line
              </button>
              <button type="button" role="tab" aria-selected={view === "street"} className={view === "street" ? "on" : ""} disabled={!record || Boolean(live)} onClick={() => setView("street")}>
                Street view
              </button>
            </div>
            {view === "street" && record && !live ? (
              <StreetViewPanel api={api} record={drawn ?? record} />
            ) : view === "electrical" && record && !live ? (
              <ElectricalSheet record={record} api={api} actorName={actorName} onActorName={updateActor} onRecord={(next) => void afterAction(next)} prefill={demoSpecsFor(record.site.address)} />
            ) : view === "sheet" && record && !live ? (
              <EngineeringSitePlan record={drawn ?? record} />
            ) : (
              <SiteMap
                key={mapSite.id}
                site={mapSite}
                baseMap={record?.site.id === mapSite.id ? record.baseMap : null}
                features={live ? live.features : (drawn?.features ?? [])}
                values={live ? [] : (record?.values ?? [])}
                loading={Boolean(live)}
                selectedFields={live ? [] : selected.fields}
                selectedFeatureId={live ? null : selected.featureId}
                onSelect={select}
                dockOpen={dockOpen && !dockCollapsed}
                onUserMove={() => setDockCollapsed(true)}
                placingField={placingField}
                onPlace={(field, longitude, latitude) => void place(field, longitude, latitude)}
                onCancelPlace={() => setPlacingField(null)}
                focusField={focusField}
                featureLabels={labels}
              />
            )}
            {dockOpen && record ? (
              <EvidencePanel
                api={api}
                record={drawn ?? record}
                report={report}
                fields={selected.fields}
                featureId={selected.featureId}
                actorName={actorName}
                onActorName={updateActor}
                onRecord={(next) => void afterAction(next)}
                onClose={() => setSelected(NOTHING)}
                onPlace={setPlacingField}
                collapsed={dockCollapsed}
                onCollapse={() => setDockCollapsed(true)}
                onExpand={() => setDockCollapsed(false)}
              />
            ) : null}
          </div>
        </main>
      ) : null}

    </div>
  );
}
