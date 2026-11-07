// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleRecord, sampleReport } from "./test/fixtures";

vi.mock("./map/SiteMap", () => ({
  SiteMap: () => <div data-testid="site-map" />,
}));

import type { EngineerApi } from "./api";
import { App } from "./App";

function fakeApi(overrides: Partial<EngineerApi> = {}): EngineerApi {
  return {
    runSite: vi.fn().mockResolvedValue({ status: "ok", record: sampleRecord() }),
    readVersion: vi.fn().mockResolvedValue(sampleRecord()),
    readReadiness: vi.fn().mockResolvedValue(sampleReport()),
    confirmValue: vi.fn(),
    correctValue: vi.fn(),
    resolveConflict: vi.fn(),
    movePin: vi.fn(),
    createCaptureLink: vi.fn(),
    uploadEvidence: vi.fn(),
    evidenceUrl: (id) => `/files/${id}`,
    ...overrides,
  };
}

async function runAddress(api: EngineerApi) {
  render(<App api={api} />);
  fireEvent.change(screen.getByLabelText("Site address"), { target: { value: "100 Sample Way" } });
  fireEvent.click(screen.getByRole("button", { name: "Run site" }));
  await waitFor(() => expect(api.runSite).toHaveBeenCalled());
}

afterEach(cleanup);

describe("running a site", () => {
  it("shows the record version, synthetic label, and map after a run", async () => {
    await runAddress(fakeApi());
    expect(await screen.findByTestId("site-map")).toBeTruthy();
    const header = screen.getByRole("banner");
    expect(within(header).getByText(/Record v2/)).toBeTruthy();
    expect(within(header).getByText("Synthetic")).toBeTruthy();
  });

  it("lists every source with its outcome and reason, even when one failed", async () => {
    await runAddress(fakeApi());
    const sources = await screen.findByRole("list", { name: "Sources" });
    expect(sources.textContent).toMatch(/parcel source.*Done/);
    expect(sources.textContent).toMatch(/elevation.*Missing.*No credentials configured/);
    expect(sources.textContent).toMatch(/permit portal.*Person only.*robots\.txt/);
    expect(screen.getByRole("region", { name: "Next request" })).toBeTruthy();
  });

  it("labels real data as real", async () => {
    const record = sampleRecord();
    record.synthetic = false;
    await runAddress(fakeApi({ runSite: vi.fn().mockResolvedValue({ status: "ok", record }) }));
    await screen.findByTestId("site-map");
    expect(within(screen.getByRole("banner")).getByText("Real public data")).toBeTruthy();
  });

  it("banners a snapshot with its date", async () => {
    const record = sampleRecord();
    record.snapshot = true;
    await runAddress(fakeApi({ runSite: vi.fn().mockResolvedValue({ status: "ok", record }) }));
    expect((await screen.findByRole("status", { name: "Snapshot" })).textContent).toMatch(/2026-11-07/);
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
});

describe("selecting and creating a link", () => {
  it("opens evidence from a report row", async () => {
    await runAddress(fakeApi());
    fireEvent.click(await screen.findByRole("button", { name: /^Meter number/ }));
    expect(within(screen.getByRole("complementary")).getByText(/too blurred to read/)).toBeTruthy();
  });

  it("creates a link, shows it, and says the tool doesn't send it", async () => {
    const createCaptureLink = vi.fn().mockResolvedValue({
      id: "link-1",
      siteId: "sample-site",
      field: "meter_number",
      url: "https://sample-tunnel.invalid/capture/SAMPLE-TOKEN",
      status: "open",
      expiresAt: "2099-01-01T00:00:00Z",
      uploadsUsed: 0,
      maxUploads: 5,
    });
    await runAddress(fakeApi({ createCaptureLink }));
    await screen.findByRole("region", { name: "Next request" });
    const ranked = within(screen.getByRole("list", { name: "Ranked gaps" }));
    fireEvent.click(ranked.getAllByRole("button", { name: "Create capture link" })[0]!);
    await waitFor(() => expect(createCaptureLink).toHaveBeenCalledWith("sample-site", "meter_number"));
    expect((await screen.findAllByText(/SAMPLE-TOKEN/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/This tool does not send it/)).toBeTruthy();
  });
});
