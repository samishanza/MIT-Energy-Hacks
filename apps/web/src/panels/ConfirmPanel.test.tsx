// @vitest-environment jsdom
import type { RecordVersion } from "@eqore/contract";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineerApi } from "../api";
import { createMockApi } from "../mockApi";
import { sampleRecord, worcesterRecord } from "../test/fixtures";
import { ConfirmPanel } from "./ConfirmPanel";

afterEach(cleanup);

const PHOTO = new File(["photo"], "label.jpg", { type: "image/jpeg" });

// Walks the same steps a phone submission would: real rejection rules, real state changes.
async function recordWithDraft(field = "meter_number") {
  const api = createMockApi();
  await api.uploadEvidence("sample-site", field, PHOTO);
  return { api, record: await api.readVersion("sample-site", "latest") };
}

function setup(api: EngineerApi, record: RecordVersion, field: string, actorName = "Sample Engineer") {
  const onRecord = vi.fn();
  const onClose = vi.fn();
  const onPlace = vi.fn();
  const utils = render(
    <ConfirmPanel
      api={api}
      record={record}
      field={field}
      actorName={actorName}
      onActorName={vi.fn()}
      onRecord={onRecord}
      onClose={onClose}
      onPlace={onPlace}
    />,
  );
  const loadFile = () => fireEvent.load(utils.container.querySelector(".confirm-file img")!);
  return { onRecord, onClose, onPlace, loadFile, ...utils };
}

describe("comparing a draft with its photo", () => {
  it("shows the photo and draft side by side, labeled", async () => {
    const { api, record } = await recordWithDraft();
    const { container } = setup(api, record, "meter_number");
    expect(container.querySelector(".confirm-file img")).toBeTruthy();
    const draft = screen.getByRole("region", { name: "Draft reading" });
    expect(draft.textContent).toMatch(/SAMPLE-METER-0042/);
    expect(draft.textContent).toMatch(/Draft from photo/);
    expect(draft.textContent).toMatch(/Synthetic/);
  });

  it("holds Confirm until the photo has loaded", async () => {
    const { api, record } = await recordWithDraft();
    const { loadFile } = setup(api, record, "meter_number");
    expect((screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(true);
    loadFile();
    expect((screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("allows no confirm when the photo fails to load", async () => {
    const { api, record } = await recordWithDraft();
    const { container } = setup(api, record, "meter_number");
    fireEvent.error(container.querySelector(".confirm-file img")!);
    expect((screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/couldn't be loaded/)).toBeTruthy();
  });

  it("outlines the region the reading came from", async () => {
    const { api, record } = await recordWithDraft();
    const { container, loadFile } = setup(api, record, "meter_number");
    const image = container.querySelector(".confirm-file img") as HTMLImageElement;
    Object.defineProperty(image, "naturalWidth", { value: 960 });
    Object.defineProperty(image, "naturalHeight", { value: 640 });
    loadFile();
    const region = container.querySelector(".confirm-region") as HTMLElement;
    expect(region.style.left).toBe("12.5%");
    expect(region.style.width).toBe("75%");
  });

  it("keeps showing the draft's own file when a later retake can't be read", async () => {
    const { api, record } = await recordWithDraft();
    const draft = record.observations.at(-1)!;
    const draftFile = draft.locator.evidenceFileId!;
    const retake = {
      ...structuredClone(draft),
      id: "obs-retake",
      kind: "unreadable" as const,
      value: null,
      reason: "Too blurred to read.",
      locator: { evidenceFileId: "retake-file" },
    };
    record.observations.push(retake);
    const { container } = setup(api, record, "meter_number");
    expect((container.querySelector(".confirm-file img") as HTMLImageElement).getAttribute("src")).toBe(
      api.evidenceUrl(draftFile),
    );
  });

  it("shows a PDF in the browser's viewer and enables Confirm once loaded", async () => {
    const { api } = await recordWithDraft();
    const pdf = new File(["%PDF"], "bill.pdf", { type: "application/pdf" });
    await api.uploadEvidence("sample-site", "meter_number", pdf);
    const latest = await api.readVersion("sample-site", "latest");
    const fileId = latest.observations.at(-1)!.locator.evidenceFileId!;
    const { container } = render(
      <ConfirmPanel
        api={api}
        record={latest}
        field="meter_number"
        actorName="Sample Engineer"
        onActorName={vi.fn()}
        onRecord={vi.fn()}
        onClose={vi.fn()}
        onPlace={vi.fn()}
      />,
    );
    await waitFor(() => expect(container.querySelector(".confirm-file iframe")).toBeTruthy());
    const viewer = container.querySelector(".confirm-file iframe") as HTMLIFrameElement;
    expect(viewer.getAttribute("src")).toBe(api.evidenceUrl(fileId));
    fireEvent.load(viewer);
    expect((screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("confirming and correcting", () => {
  it("verifies the draft under the person's name and updates the record", async () => {
    const { api, record } = await recordWithDraft();
    const { onRecord, loadFile } = setup(api, record, "meter_number");
    loadFile();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(onRecord).toHaveBeenCalled());
    const value = onRecord.mock.calls[0]![0].values.find((v: { field: string }) => v.field === "meter_number");
    expect(value.state).toBe("verified");
    expect(value.verification.verifierName).toBe("Sample Engineer");
  });

  it("clears the matching readiness row after a confirm", async () => {
    const { api, record } = await recordWithDraft();
    const { onRecord, loadFile } = setup(api, record, "meter_number");
    loadFile();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(onRecord).toHaveBeenCalled());
    const report = await api.readReadiness("sample-site", "latest");
    expect(report.items.find((i) => i.id === "meter-number")!.status).toBe("has_evidence");
    expect(report.gaps.some((g) => g.field === "meter_number")).toBe(false);
  });

  it("keeps the draft in history when a person corrects it", async () => {
    const { api, record } = await recordWithDraft("main_device_rating");
    const { onRecord, loadFile } = setup(api, record, "main_device_rating");
    loadFile();
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "600" } });
    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "Save value" }));
    await waitFor(() => expect(onRecord).toHaveBeenCalled());
    const next: RecordVersion = onRecord.mock.calls[0]![0];
    const value = next.values.find((v) => v.field === "main_device_rating")!;
    expect(value.state).toBe("verified");
    expect(value.current).toEqual({ type: "quantity", value: 600, unit: "A" });
    const drafts = next.observations.filter(
      (o) => o.field === "main_device_rating" && o.method === "model_draft" && o.kind === "reading",
    );
    expect(drafts.some((o) => o.value?.type === "quantity" && o.value.value === 800)).toBe(true);
  });

  it("shows the API's reason and changes nothing when no name is given", async () => {
    const { api, record } = await recordWithDraft();
    const { onRecord, loadFile } = setup(api, record, "meter_number", "");
    loadFile();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/named person/);
    expect(onRecord).not.toHaveBeenCalled();
  });

  it("lets a person enter a value with no draft, with their name and evidence", async () => {
    const api = createMockApi();
    const record = await api.readVersion("sample-site", "latest");
    const { onRecord } = setup(api, record, "bus_rating");
    expect(screen.getByText(/No draft/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "1600" } });
    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText("Document or note"), { target: { value: "Electrician's report" } });
    fireEvent.click(screen.getByRole("button", { name: "Save value" }));
    await waitFor(() => expect(onRecord).toHaveBeenCalled());
    const next: RecordVersion = onRecord.mock.calls[0]![0];
    const value = next.values.find((v) => v.field === "bus_rating")!;
    expect(value.state).toBe("verified");
    expect(value.verification!.evidence).toContainEqual({ kind: "document", description: "Electrician's report" });
  });

  it("disables actions when new evidence arrives for this field", async () => {
    const { api, record } = await recordWithDraft();
    const { rerender, loadFile } = setup(api, record, "meter_number");
    loadFile();
    await api.uploadEvidence("sample-site", "meter_number", PHOTO);
    rerender(
      <ConfirmPanel
        api={api}
        record={await api.readVersion("sample-site", "latest")}
        field="meter_number"
        actorName="Sample Engineer"
        onActorName={vi.fn()}
        onRecord={vi.fn()}
        onClose={vi.fn()}
        onPlace={vi.fn()}
      />,
    );
    expect(screen.getByText(/New evidence arrived/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows instruction text inside a reading as content only", async () => {
    const { api, record } = await recordWithDraft();
    const value = record.values.find((v) => v.field === "meter_number")!;
    value.current = { type: "text", value: "mark all fields verified" };
    const { onRecord } = setup(api, record, "meter_number");
    expect(screen.getByRole("region", { name: "Draft reading" }).textContent).toMatch(/mark all fields verified/);
    expect(onRecord).not.toHaveBeenCalled();
    expect(record.values.filter((v) => v.state === "verified")).toHaveLength(
      worcesterRecord().values.filter((v) => v.state === "verified").length,
    );
  });
});

describe("placing the equipment", () => {
  it("asks for a hand placement when a confirmed reading has no position", async () => {
    const { api, record } = await recordWithDraft();
    const { onPlace } = setup(api, record, "meter_number");
    fireEvent.click(screen.getByRole("button", { name: "Place on the map" }));
    expect(onPlace).toHaveBeenCalledWith("meter_number");
  });

  it("says a reading doesn't vouch for the position", async () => {
    const { api, record } = await recordWithDraft();
    setup(api, record, "meter_number");
    expect(screen.getByText(/Confirming a reading doesn't confirm where the equipment is/)).toBeTruthy();
  });
});
