import type { RecordVersion } from "@eqore/contract";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import type { EngineerApi } from "../api";
import { formatCurrent } from "../app/format";
import { GradeTag, ProvenanceTag, StateBadge } from "../ui/marks";
import { ResolveControls } from "./ResolveControls";

export interface ConfirmPanelProps {
  api: EngineerApi;
  record: RecordVersion;
  field: string;
  actorName: string;
  onActorName: (name: string) => void;
  onRecord: (record: RecordVersion) => void;
  onClose: () => void;
  onPlace: (field: string) => void;
}

interface Region {
  left: string;
  top: string;
  width: string;
  height: string;
}

const percent = (part: number, whole: number) => `${(part / whole) * 100}%`;

export function ConfirmPanel(props: ConfirmPanelProps) {
  const { api, record, field, actorName, onActorName, onRecord, onClose, onPlace } = props;
  const value = record.values.find((v) => v.field === field);
  const observations = record.observations.filter((o) => o.field === field);
  const latestId = observations.at(-1)?.id;
  const [reviewedId, setReviewedId] = useState(latestId);
  // What the person is reading stays put until they choose to reload it.
  const shown = observations.filter((o) => {
    const reviewedAt = observations.findIndex((other) => other.id === reviewedId);
    return reviewedAt < 0 || observations.indexOf(o) <= reviewedAt;
  });
  const draft = shown.filter((o) => o.kind === "reading" && o.method === "model_draft").at(-1);
  const fileObservation = shown.filter((o) => o.locator.evidenceFileId).at(-1);
  const fileId = fileObservation?.locator.evidenceFileId;
  const [kind, setKind] = useState<"image" | "pdf">("image");
  const [fileState, setFileState] = useState<"loading" | "loaded" | "failed">("loading");
  const [region, setRegion] = useState<Region | null>(null);
  const changed = latestId !== reviewedId;
  const loadedFile = useRef(fileId);

  useEffect(() => {
    if (loadedFile.current !== fileId) {
      loadedFile.current = fileId;
      setFileState("loading");
      setRegion(null);
    }
    if (!fileId) return;
    let current = true;
    void Promise.resolve(api.evidenceKind?.(fileId)).then((found) => {
      if (current && found) setKind(found);
    });
    return () => {
      current = false;
    };
  }, [api, fileId]);

  if (!value) return null;

  function imageLoaded(event: SyntheticEvent<HTMLImageElement>) {
    setFileState("loaded");
    const { naturalWidth, naturalHeight } = event.currentTarget;
    const box = fileObservation?.locator.imageRegion;
    if (box && naturalWidth && naturalHeight) {
      setRegion({
        left: percent(box.x, naturalWidth),
        top: percent(box.y, naturalHeight),
        width: percent(box.width, naturalWidth),
        height: percent(box.height, naturalHeight),
      });
    }
  }

  const hasPosition = record.features.some(
    (f) => f.field === field && (f.kind === "existing_equipment" || f.kind === "capture_pin"),
  );
  const waitingOnFile = Boolean(fileId) && fileState !== "loaded";

  return (
    <div role="dialog" aria-label="Confirm reading" className="takeover">
      <div className="confirm-file">
        {!fileId ? <p className="note">No file for this value.</p> : null}
        {fileId && kind === "pdf" ? (
          <iframe title="Evidence file" src={api.evidenceUrl(fileId)} onLoad={() => setFileState("loaded")} />
        ) : null}
        {fileId && kind === "image" ? (
          <div className="confirm-image">
            <img
              src={api.evidenceUrl(fileId)}
              alt={`Evidence for ${value.label}`}
              onLoad={imageLoaded}
              onError={() => setFileState("failed")}
            />
            {region ? <span className="confirm-region" style={region} /> : null}
          </div>
        ) : null}
        {fileState === "failed" ? <p className="error">This file couldn't be loaded, so it can't be confirmed.</p> : null}
      </div>

      <div className="confirm-side">
        <button type="button" className="dock-close" onClick={onClose}>
          Close
        </button>
        <h2>{value.label}</h2>

        <section aria-label="Draft reading" className="confirm-draft">
          {draft ? (
            <>
              <p className="evidence-value mono">{formatCurrent(value)}</p>
              <div className="marks">
                <StateBadge value={value} />
                <GradeTag grade={value.grade} />
                <ProvenanceTag synthetic={draft.synthetic} />
              </div>
            </>
          ) : (
            <>
              <p>No draft to compare. You can enter the value yourself, with your name and evidence.</p>
              <StateBadge value={value} />
            </>
          )}
          {value.reason ? <p>{value.reason}</p> : null}
        </section>

        {changed ? (
          <div className="notice">
            <p>New evidence arrived for this value.</p>
            <button type="button" onClick={() => setReviewedId(latestId)}>
              Reload
            </button>
          </div>
        ) : null}

        <ResolveControls
          key={`${field}-${draft?.id ?? "none"}`}
          api={api}
          record={record}
          value={value}
          actorName={actorName}
          onActorName={onActorName}
          onRecord={onRecord}
          preselectedEvidence={draft ? [draft.id] : []}
          disabled={changed || waitingOnFile}
        />

        <p className="note">Confirming a reading doesn't confirm where the equipment is.</p>
        <button type="button" onClick={() => onPlace(field)}>
          {hasPosition ? "Move on the map" : "Place on the map"}
        </button>
      </div>
    </div>
  );
}
