import type { CaptureMetadata, CaptureRequest } from "@eqore/contract";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { aerialTiles } from "./aerial";
import { CaptureApiError, type CaptureApi } from "./captureApi";

const AERIAL_WIDTH = 320;
const AERIAL_HEIGHT = 180;
const LOCATION_WAIT_MS = 10_000;

type Inactive = "inactive" | "closed" | "limit";

type Stage =
  | { name: "loading" }
  | { name: "unreachable" }
  | { name: "ended"; why: Inactive }
  | { name: "location"; note?: string }
  | { name: "capture"; note?: string }
  | { name: "preview"; file: File; rejected?: string; note?: string }
  | { name: "uploading"; file: File }
  | { name: "failed"; file: File }
  | { name: "received" }
  | { name: "cant-see" };

const ENDED_WORDS: Record<Inactive, string> = {
  inactive: "This link isn't active. Please ask the person who sent it.",
  closed: "We have what we need. Thank you.",
  limit: "This link has reached its upload limit. Please ask the person who sent it.",
};

function endedBy(code: string): Inactive | null {
  if (code === "invalid_token" || code === "token_expired") return "inactive";
  if (code === "token_closed") return "closed";
  if (code === "upload_limit") return "limit";
  return null;
}

function Aerial({ request }: { request: CaptureRequest }) {
  const { aerial, pin } = request;
  if (!aerial) return null;
  const center = pin ?? aerial.center;
  return (
    <figure className="aerial-frame">
      <div className="aerial" style={{ width: AERIAL_WIDTH, height: AERIAL_HEIGHT }}>
        {aerialTiles(aerial, center, AERIAL_WIDTH, AERIAL_HEIGHT).map((tile) => (
          <img key={tile.url} src={tile.url} alt="" style={{ left: tile.left, top: tile.top }} />
        ))}
        {pin ? <span className="aerial-pin" aria-label="The spot we're asking about" /> : null}
      </div>
      <figcaption className="note">{aerial.attribution}</figcaption>
    </figure>
  );
}

export function CapturePage({ token, api }: { token: string; api: CaptureApi }) {
  const [request, setRequest] = useState<CaptureRequest | null>(null);
  const [stage, setStage] = useState<Stage>({ name: "loading" });
  const position = useRef<CaptureMetadata>({});
  const preview = useRef<string | null>(null);

  const load = useCallback(async () => {
    setStage({ name: "loading" });
    try {
      setRequest(await api.read(token));
      setStage({ name: "location" });
    } catch (failure) {
      const why = failure instanceof CaptureApiError ? endedBy(failure.code) : null;
      setStage(why ? { name: "ended", why } : { name: "unreachable" });
    }
  }, [api, token]);

  useEffect(() => {
    void load();
  }, [load]);

  function shareLocation() {
    const declined = () =>
      setStage((current) =>
        current.name === "location"
          ? { name: "capture", note: "That's fine. You can still send the photo." }
          : current,
      );
    if (!navigator.geolocation) {
      declined();
      return;
    }
    // Asked here, on its own tap, so a slow fix can't cost the camera its tap.
    const giveUp = setTimeout(declined, LOCATION_WAIT_MS);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        clearTimeout(giveUp);
        position.current = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracyMeters: coords.accuracy,
        };
        // A slow answer may land after the page has moved on, so it never undoes a chosen photo.
        setStage((current) => (current.name === "location" || current.name === "capture" ? { name: "capture" } : current));
      },
      () => {
        clearTimeout(giveUp);
        declined();
      },
      { enableHighAccuracy: true, timeout: LOCATION_WAIT_MS },
    );
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = file.type.startsWith("image/") ? (URL.createObjectURL?.(file) ?? null) : null;
    setStage({ name: "preview", file });
  }

  async function send(file: File) {
    setStage({ name: "uploading", file });
    try {
      await api.submit(token, file, position.current);
      setStage({ name: "received" });
    } catch (failure) {
      const code = failure instanceof CaptureApiError ? failure.code : "network";
      const why = endedBy(code);
      if (why) setStage({ name: "ended", why });
      else if (code === "file_too_large" || code === "file_type") {
        setStage({ name: "preview", file, rejected: (failure as Error).message });
      } else setStage({ name: "failed", file });
    }
  }

  const isBill = request?.accepts === "bill";
  const showSafety = request && stage.name !== "ended" && stage.name !== "received";

  return (
    <main className="capture">
      {stage.name === "loading" ? <p>Loading this request</p> : null}

      {stage.name === "unreachable" ? (
        <>
          <p>Couldn't reach this request.</p>
          <button type="button" className="primary big" onClick={() => void load()}>
            Try again
          </button>
        </>
      ) : null}

      {stage.name === "ended" ? <p className="capture-message">{ENDED_WORDS[stage.why]}</p> : null}

      {request && stage.name !== "ended" ? (
        <>
          {request.synthetic ? <p className="tag tag-synthetic">Synthetic</p> : null}
          {stage.name !== "received" && stage.name !== "cant-see" ? (
            <>
              <h1>{request.question}</h1>
              <Aerial request={request} />
            </>
          ) : null}
        </>
      ) : null}

      {showSafety ? (
        <p role="note" aria-label="Safety" className="safety">
          {request.safetyText}
        </p>
      ) : null}

      {stage.name === "location" ? (
        <div className="capture-step">
          <p>Share your location once, to place this photo on the site map.</p>
          <button type="button" className="primary big" onClick={shareLocation}>
            Share location
          </button>
          <button type="button" className="big" onClick={() => setStage({ name: "capture" })}>
            Skip
          </button>
        </div>
      ) : null}

      {stage.name === "capture" ? (
        <div className="capture-step">
          {stage.note ? <p>{stage.note}</p> : null}
          <label className="capture-file big primary">
            {isBill ? "Choose your bill" : "Take a photo"}
            <input
              type="file"
              className="visually-hidden"
              accept={isBill ? "image/jpeg,image/png,application/pdf" : "image/jpeg,image/png"}
              {...(isBill ? {} : { capture: "environment" as const })}
              onChange={chooseFile}
            />
          </label>
          {isBill ? null : (
            <button type="button" className="big" onClick={() => setStage({ name: "cant-see" })}>
              I can't see this without opening anything
            </button>
          )}
        </div>
      ) : null}

      {stage.name === "preview" ? (
        <div className="capture-step">
          {stage.rejected ? <p className="error">{stage.rejected}</p> : null}
          {preview.current ? (
            <img className="capture-preview" src={preview.current} alt="What you're about to send" />
          ) : (
            <p className="mono">{stage.file.name}</p>
          )}
          {stage.rejected ? null : (
            <button type="button" className="primary big" onClick={() => void send(stage.file)}>
              {isBill ? "Use this bill" : "Use this photo"}
            </button>
          )}
          <button type="button" className="big" onClick={() => setStage({ name: "capture" })}>
            {isBill ? "Choose another" : "Retake"}
          </button>
        </div>
      ) : null}

      {stage.name === "uploading" ? <p>Sending. Keep this page open. This can take a moment.</p> : null}

      {stage.name === "failed" ? (
        <div className="capture-step">
          <p className="error">Not sent. Try again.</p>
          <button type="button" className="primary big" onClick={() => void send(stage.file)}>
            Try again
          </button>
        </div>
      ) : null}

      {stage.name === "received" ? (
        <p className="capture-message">Received. Nothing is verified yet. An engineer will review it.</p>
      ) : null}

      {stage.name === "cant-see" ? (
        <p className="capture-message">Thanks. Please don't open anything. Tell the person who sent you this link.</p>
      ) : null}

      <footer className="note">Prototype. Safety wording not yet reviewed.</footer>
    </main>
  );
}
