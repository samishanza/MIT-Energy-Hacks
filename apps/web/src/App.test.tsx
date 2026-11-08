// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleRecord, sampleReport } from "./test/fixtures";

const mapProps = vi.hoisted(() => ({ current: null as null | Record<string, (...args: never[]) => unknown> & { placingField?: string | null } }));

vi.mock("./map/SiteMap", () => ({
  SiteMap: (props: Record<string, (...args: never[]) => unknown>) => {
    mapProps.current = props;
    return <div data-testid="site-map" />;
  },
}));

import type { EngineerApi } from "./api";
import { App } from "./App";

function fakeApi(overrides: Partial<EngineerApi> = {}): EngineerApi {
  return {
    runSite: vi.fn().mockResolvedValue({ status: "ok", record: sampleRecord() }),
    readRunProgress: vi.fn().mockResolvedValue(null),
    exportFile: vi.fn().mockResolvedValue(null),
    readStreetView: vi.fn().mockResolvedValue({ status: "unavailable", reason: "No key in tests.", markers: [] }),
    readVersion: vi.fn().mockResolvedValue(sampleRecord()),
    readReadiness: vi.fn().mockResolvedValue(sampleReport()),
    confirmValue: vi.fn(),
    correctValue: vi.fn(),
    resolveConflict: vi.fn(),
    movePin: vi.fn(),
    createCaptureLink: vi.fn(),
    uploadEvidence: vi.fn(),
    evidenceUrl: (id) => `/files/${id}`,
    evidenceKind: vi.fn().mockResolvedValue("image"),
    ...overrides,
  };
}

async function runAddress(api: EngineerApi) {
  render(<App api={api} />);
  fireEvent.change(screen.getByLabelText("Site address"), { target: { value: "100 Sample Way" } });
  fireEvent.click(screen.getByRole("button", { name: "Run site" }));
  await waitFor(() => expect(api.runSite).toHaveBeenCalled());
}

// The details live in header menus that drop over the map.
async function openMenu(name: "Needs attention" | "Public facts" | "Download") {
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^${name}`) }));
  return within(screen.getByRole("region", { name: `${name} menu` }));
}

const strip = () => within(screen.getByRole("region", { name: "Site status" }));

afterEach(cleanup);

describe("running a site", () => {
  it("goes straight to a full-width map, with every detail in a closed menu", async () => {
    await runAddress(fakeApi());
    expect(await screen.findByTestId("site-map")).toBeTruthy();
    expect(strip().getByText("Synthetic")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Site facts" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Needs your attention" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Public facts" })).toBeNull();
    const banner = within(screen.getByRole("banner"));
    expect(banner.getByRole("button", { name: /^Needs attention/ }).getAttribute("aria-expanded")).toBe("false");
    expect(banner.getByRole("button", { name: /^Public facts/ })).toBeTruthy();
    expect(banner.getByRole("button", { name: /^Download/ })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Sources" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Next request" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Ranked gaps" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Evidence check" })).toBeNull();
  });

  it("lists a failed or unchecked source in the attention list, with its reason, without blocking the map", async () => {
    await runAddress(fakeApi());
    await openMenu("Needs attention");
    const attention = screen.getByRole("region", { name: "Needs your attention" });
    expect(attention.textContent).toMatch(/elevation.*Failed or not run\. No credentials configured/);
    expect(attention.textContent).toMatch(/permit portal.*Not checked by the tool\. robots\.txt/);
    expect(screen.getByTestId("site-map")).toBeTruthy();
  });

  it("labels real data as real", async () => {
    const record = sampleRecord();
    record.synthetic = false;
    for (const value of record.values) value.synthetic = false;
    await runAddress(fakeApi({ runSite: vi.fn().mockResolvedValue({ status: "ok", record }) }));
    await screen.findByTestId("site-map");
    expect(strip().getByText("Real public data")).toBeTruthy();
  });

  it("banners a snapshot with its date", async () => {
    const record = sampleRecord();
    record.snapshot = true;
    await runAddress(fakeApi({ runSite: vi.fn().mockResolvedValue({ status: "ok", record }) }));
    expect((await screen.findByRole("status", { name: "Snapshot" })).textContent).toMatch(/2026-11-07/);
  });

  it("draws results as sources answer, and counts them, before the record exists", async () => {
    const record = sampleRecord();
    let finish: (value: unknown) => void = () => {};
    const progress = {
      status: "running",
      site: record.site,
      sourceRuns: record.sourceRuns.map((run, i) => (i === 0 ? run : { sourceId: run.sourceId, name: run.name, status: "pending" })),
      features: record.features.filter((f) => f.kind === "property_line"),
    };
    const api = fakeApi({
      runSite: vi.fn().mockImplementation(() => new Promise((resolve) => (finish = resolve))),
      readRunProgress: vi.fn().mockResolvedValue(progress),
    });
    await runAddress(api);
    await waitFor(() => expect(strip().getByRole("status").textContent).toBe("Reading sources, 1 of 4 answered"));
    expect(api.readRunProgress).toHaveBeenCalledWith("100 Sample Way");
    expect(mapProps.current?.loading).toBe(true);
    expect((mapProps.current?.features as unknown as { kind: string }[]).map((f) => f.kind)).toEqual(["property_line"]);
    await act(async () => finish({ status: "ok", record }));
    await waitFor(() => expect(mapProps.current?.loading).toBe(false));
    expect(screen.queryByText(/Reading sources/)).toBeNull();
  });

  it("asks the engineer to choose when an address has several matches", async () => {
    const runSite = vi
      .fn()
      .mockResolvedValueOnce({
        status: "needs_choice",
        candidates: [{ id: "a", label: "100 Sample Way, Unit A", source: "Parcels" }],
      })
      .mockResolvedValueOnce({ status: "ok", record: sampleRecord() });
    await runAddress(fakeApi({ runSite }));
    fireEvent.click(await screen.findByRole("button", { name: /Unit A/ }));
    await waitFor(() =>
      expect(runSite).toHaveBeenLastCalledWith({
        address: "100 Sample Way",
        choice: { kind: "candidate", candidateId: "a" },
      }),
    );
    expect(await screen.findByTestId("site-map")).toBeTruthy();
  });

  it("lets the engineer give a pin position when nothing matches", async () => {
    const runSite = vi
      .fn()
      .mockResolvedValueOnce({ status: "needs_choice", candidates: [] })
      .mockResolvedValueOnce({ status: "ok", record: sampleRecord() });
    await runAddress(fakeApi({ runSite }));
    fireEvent.change(await screen.findByLabelText("Latitude"), { target: { value: "42.26" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "-71.8" } });
    fireEvent.click(screen.getByRole("button", { name: "Use this position" }));
    await waitFor(() =>
      expect(runSite).toHaveBeenLastCalledWith({
        address: "100 Sample Way",
        choice: { kind: "pin", latitude: 42.26, longitude: -71.8 },
      }),
    );
  });

  it("shows a failed run's reason", async () => {
    await runAddress(fakeApi({ runSite: vi.fn().mockRejectedValue(new Error("The API isn't reachable.")) }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/isn't reachable/);
  });

  it("still shows the map and facts when the evidence check can't be read", async () => {
    await runAddress(fakeApi({ readReadiness: vi.fn().mockRejectedValue(new Error("offline")) }));
    expect(await screen.findByTestId("site-map")).toBeTruthy();
    const facts = await openMenu("Public facts");
    expect(facts.getByRole("region", { name: "Public facts" })).toBeTruthy();
    expect(facts.getByText("Grid connection request check unavailable.")).toBeTruthy();
  });

  it("closes a menu on Escape and on a click outside it", async () => {
    await runAddress(fakeApi());
    await openMenu("Public facts");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Public facts" })).toBeNull();
    await openMenu("Public facts");
    fireEvent.pointerDown(screen.getByTestId("site-map"));
    expect(screen.queryByRole("region", { name: "Public facts" })).toBeNull();
  });

  it("explains the facts that aren't public, and offers no capture links or evidence check", async () => {
    await runAddress(fakeApi());
    const facts = await openMenu("Public facts");
    fireEvent.click(facts.getByRole("button", { name: /^Not in public records/ }));
    expect(facts.getByText(/No public source we tested/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open the evidence check and requests" })).toBeNull();
  });
});

describe("the site view", () => {
  it("opens a fact one click from its row, and the one item the map picked", async () => {
    await runAddress(fakeApi());
    const facts = await openMenu("Public facts");
    fireEvent.click(facts.getByRole("button", { name: /^Parcel ID/ }));
    expect(screen.queryByRole("region", { name: "Public facts" })).toBeNull();
    expect(within(screen.getByRole("complementary")).getByRole("heading", { name: "Parcel ID" })).toBeTruthy();
    expect(mapProps.current?.selectedFields).toEqual(["parcel_id"]);
    act(() => {
      mapProps.current!.onSelect!("feeder" as never, "f-feeder" as never);
    });
    expect(mapProps.current?.selectedFeatureId).toBe("f-feeder");
    expect(within(screen.getByRole("complementary")).getByRole("region", { name: "Equipment specifications" })).toBeTruthy();
  });

  it("says when the server doesn't offer a file yet, and keeps the map", async () => {
    const exportFile = vi.fn().mockResolvedValue(null);
    await runAddress(fakeApi({ exportFile }));
    fireEvent.click((await openMenu("Download")).getByRole("button", { name: "DXF for CAD" }));
    await waitFor(() => expect(exportFile).toHaveBeenCalledWith("sample-site", 2, "dxf"));
    expect((await screen.findByRole("status", { name: "Download" })).textContent).toMatch(/doesn't offer the DXF file yet/);
    expect(screen.getByTestId("site-map")).toBeTruthy();
  });

  it("saves a file the server does offer, named for the site and version", async () => {
    const saved: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    Object.assign(URL, { createObjectURL: () => "blob:kml", revokeObjectURL: () => {} });
    await runAddress(fakeApi({ exportFile: vi.fn().mockResolvedValue(new Blob(["<kml/>"])) }));
    fireEvent.click((await openMenu("Download")).getByRole("button", { name: "KML for Google Earth" }));
    await waitFor(() => expect(saved).toEqual(["sample-site-v2.kml"]));
    click.mockRestore();
  });

  it("keeps the site plan tab", async () => {
    await runAddress(fakeApi());
    expect(await screen.findByRole("tab", { name: "Site plan" })).toBeTruthy();
  });

  it("shows the single line with its calculations, marked for the engineer of record to verify", async () => {
    await runAddress(fakeApi());
    fireEvent.click(await screen.findByRole("tab", { name: "Single line" }));
    const calcs = await screen.findByRole("region", { name: "Calculations" });
    expect(within(calcs).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/THE ENGINEER OF RECORD VERIFIES/).length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Site inputs" })).toBeTruthy();
  });
});

describe("placing equipment", () => {
  function draftOnly(field: string) {
    const record = sampleRecord();
    const value = record.values.find((v) => v.field === field)!;
    value.state = "inferred";
    value.current = { type: "quantity", value: 800, unit: "A" };
    value.grade = "nameplate";
    value.method = "model_draft";
    delete value.reason;
    record.features = record.features.filter((f) => f.field !== field);
    const obs = structuredClone(record.observations.find((o) => o.field === "meter_number")!);
    obs.id = "obs-draft";
    obs.field = field;
    obs.kind = "reading";
    obs.value = value.current;
    obs.locator = { evidenceFileId: "file-9" };
    delete obs.reason;
    record.observations.push(obs);
    value.observationIds.push("obs-draft");
    return record;
  }

  function verifiedFrom(record: ReturnType<typeof sampleRecord>, field: string) {
    const next = structuredClone(record);
    next.version += 1;
    const value = next.values.find((v) => v.field === field)!;
    value.state = "verified";
    value.verification = {
      verifierName: "Sample Engineer",
      verifiedAt: "2026-11-07T12:00:00Z",
      evidence: [{ kind: "observation", observationId: "obs-draft" }],
    };
    return next;
  }

  async function startPlacing(api: Partial<EngineerApi> = {}) {
    const record = verifiedFrom(draftOnly("main_device_rating"), "main_device_rating");
    const fake = fakeApi({ runSite: vi.fn().mockResolvedValue({ status: "ok", record }), ...api });
    await runAddress(fake);
    await screen.findByTestId("site-map");
    act(() => {
      mapProps.current!.onSelect!("main_device_rating" as never);
    });
    fireEvent.click(within(screen.getByRole("complementary")).getByRole("button", { name: "Place on the map" }));
    await waitFor(() => expect(mapProps.current?.placingField).toBe("main_device_rating"));
    return fake;
  }

  it("places from the evidence dock on a verified value, as a hand placement", async () => {
    const placed = sampleRecord();
    placed.version = 9;
    const movePin = vi.fn().mockResolvedValue(placed);
    await startPlacing({ movePin });
    mapProps.current!.onPlace!("main_device_rating" as never, -71.8 as never, 42.26 as never);
    await waitFor(() =>
      expect(movePin).toHaveBeenCalledWith("sample-site", expect.objectContaining({ field: "main_device_rating", latitude: 42.26, longitude: -71.8 })),
    );
  });

  it("lets the person cancel placing", async () => {
    const movePin = vi.fn();
    await startPlacing({ movePin });
    act(() => {
      mapProps.current!.onCancelPlace!();
    });
    await waitFor(() => expect(mapProps.current?.placingField ?? null).toBeNull());
    expect(movePin).not.toHaveBeenCalled();
  });
});

describe("responses that land late or fail", () => {
  it("still shows a saved change, and says so, when the refresh after it fails", async () => {
    const saved = sampleRecord();
    saved.version = 5;
    const readReadiness = vi.fn().mockResolvedValueOnce(sampleReport()).mockRejectedValue(new Error("offline"));
    await runAddress(fakeApi({ readReadiness, confirmValue: vi.fn().mockResolvedValue(saved) }));
    fireEvent.click((await openMenu("Public facts")).getByRole("button", { name: /^Parcel ID/ }));
    const dock = within(screen.getByRole("complementary"));
    fireEvent.click(dock.getByRole("button", { name: "Confirm" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/saved.*couldn't refresh/i);
    expect((await openMenu("Public facts")).getByText(/Record v5\./)).toBeTruthy();
  });

  it("won't send a pin position that isn't a number", async () => {
    const runSite = vi.fn().mockResolvedValue({ status: "needs_choice", candidates: [] });
    await runAddress(fakeApi({ runSite }));
    fireEvent.change(await screen.findByLabelText("Latitude"), { target: { value: "north" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "-71.8" } });
    fireEvent.click(screen.getByRole("button", { name: "Use this position" }));
    expect(runSite).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toMatch(/number/);
  });

  it("keeps the candidates on screen when choosing one fails", async () => {
    const runSite = vi
      .fn()
      .mockResolvedValueOnce({
        status: "needs_choice",
        candidates: [{ id: "a", label: "100 Sample Way, Unit A", source: "Parcels" }],
      })
      .mockRejectedValueOnce(new Error("The API isn't reachable."));
    await runAddress(fakeApi({ runSite }));
    fireEvent.click(await screen.findByRole("button", { name: /Unit A/ }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: /Unit A/ })).toBeTruthy();
  });
});
