// @vitest-environment jsdom
import type { RecordVersion } from "@eqore/contract";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, type EngineerApi } from "../api";
import { sampleRecord, sampleReport, worcesterRecord } from "../test/fixtures";
import { EvidencePanel } from "./EvidencePanel";

afterEach(cleanup);

function setup(field: string, api: Partial<EngineerApi> = {}, record: RecordVersion = sampleRecord()) {
  const onRecord = vi.fn();
  render(
    <EvidencePanel
      api={{ evidenceUrl: (id: string) => `/files/${id}`, ...api } as EngineerApi}
      record={record}
      report={sampleReport()}
      fields={[field]}
      actorName=""
      onActorName={vi.fn()}
      onRecord={onRecord}
      onClose={vi.fn()}
    />,
  );
  return { onRecord };
}

describe("an item picked on the map", () => {
  function pick(featureId: string, record = worcesterRecord()) {
    const feature = record.features.find((f) => f.id === featureId)!;
    render(
      <EvidencePanel
        api={{ evidenceUrl: (id: string) => `/files/${id}` } as EngineerApi}
        record={record}
        report={null}
        fields={[feature.field]}
        featureId={featureId}
        actorName=""
        onActorName={vi.fn()}
        onRecord={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    return within(screen.getByRole("region", { name: "Selected item" }));
  }

  it("shows the one item's own facts, then the value it belongs to", () => {
    const item = pick(worcesterRecord().features.find((f) => f.field === "wetlands_nearby")!.id);
    expect(item.getByText("WOODED SWAMP DECIDUOUS", { selector: "h3" })).toBeTruthy();
    expect(item.getByText("Distance").nextElementSibling!.textContent).toBe("880 ft");
    expect(screen.getByRole("heading", { name: "Wetlands nearby" })).toBeTruthy();
  });

  it("links to Google Earth and Street View at the item", () => {
    const station = worcesterRecord().features.find((f) => f.field === "fire_stations_nearby")!;
    const [longitude, latitude] = station.geometry.coordinates as [number, number];
    const item = pick(station.id);
    expect(item.getByRole("link", { name: "Open in Google Earth" }).getAttribute("href")).toContain(`@${latitude.toFixed(6)},${longitude.toFixed(6)}`);
    expect(item.getByRole("link", { name: "Street View" }).getAttribute("href")).toContain(`viewpoint=${latitude.toFixed(6)},${longitude.toFixed(6)}`);
  });

  it("explains a zone's tier and never calls it approved", () => {
    const record = worcesterRecord();
    record.features.push({
      id: "zone-1",
      kind: "candidate_area",
      field: "lot_size_acres",
      geometry: { type: "Polygon", coordinates: [[[-71.77, 42.277], [-71.769, 42.277], [-71.769, 42.2776], [-71.77, 42.277]]] },
      attributes: { tier: { type: "text", value: "remote" }, rules: { type: "text", value: "IFC 1207.8.1" } },
    });
    const item = pick("zone-1", record);
    expect(item.getByText(/^Remote: more than 100 ft/)).toBeTruthy();
    expect(item.getByText(/not code approval/)).toBeTruthy();
    expect(item.getByText("IFC 1207.8.1")).toBeTruthy();
  });
});

describe("source evidence", () => {
  it("shows a value's source, dates, method, location, and grade", () => {
    setup("parcel_id");
    const panel = screen.getByRole("complementary");
    expect(panel.textContent).toMatch(/SAMPLE-0001/);
    expect(panel.textContent).toMatch(/SYNTHETIC SAMPLE parcel source/);
    expect(panel.textContent).toMatch(/2025-06-01/);
    expect(panel.textContent).toMatch(/Read from source/);
    expect(panel.textContent).toMatch(/PARCEL_ID/);
    expect(panel.textContent).toMatch(/Reference/);
    expect(within(panel).getAllByText("Synthetic").length).toBeGreaterThan(0);
  });

  it("shows every candidate and its source on a conflict", () => {
    setup("lot_size_acres");
    const candidates = within(screen.getByRole("group", { name: "Candidates" }));
    expect(candidates.getByText(/7\.3 acre/)).toBeTruthy();
    expect(candidates.getByText(/6\.9 acre/)).toBeTruthy();
    expect(candidates.getByText(/assessor field/)).toBeTruthy();
    expect(candidates.getByText(/parcel source/)).toBeTruthy();
  });

  it("shows feeder candidates with their details", () => {
    setup("feeder");
    const candidates = within(screen.getByRole("group", { name: "Candidates" }));
    expect(candidates.getByText(/SAMPLE-FEEDER-A/)).toBeTruthy();
    expect(candidates.getAllByText(/Sample Substation/).length).toBe(2);
  });

  it("says a conflict has values, just none chosen", () => {
    setup("lot_size_acres");
    const panel = screen.getByRole("complementary");
    expect(panel.textContent).toMatch(/Not chosen yet/);
    expect(panel.textContent).not.toMatch(/No value yet/);
  });

  it("says what settles feeder candidates", () => {
    setup("feeder");
    expect(screen.getByRole("complementary").textContent).toMatch(/Pre-Application Report settles this/);
  });

  it("keeps none apart from missing", () => {
    setup("existing_generation");
    expect(screen.getByRole("complementary").textContent).toMatch(/None/);
    cleanup();
    setup("building_area_sqft");
    const panel = screen.getByRole("complementary");
    expect(panel.textContent).toMatch(/Missing/);
    expect(panel.textContent).toMatch(/Source returned 0/);
  });

  it("shows the draft and the correction in history, oldest first", () => {
    setup("main_device_rating");
    const rows = within(screen.getByRole("list", { name: "History" })).getAllByRole("listitem");
    expect(rows[0]!.textContent).toMatch(/Draft/);
    expect(rows[0]!.textContent).toMatch(/800 A/);
    expect(rows[1]!.textContent).toMatch(/600 A/);
    expect(rows[1]!.textContent).toMatch(/Verified/);
  });

  it("links to original evidence files", () => {
    setup("main_device_rating");
    expect(screen.getByRole("link", { name: /Original file/ }).getAttribute("href")).toBe("/files/sample-file-1");
  });

  it("downloads an original file rather than opening it on this origin", () => {
    setup("main_device_rating");
    expect(screen.getByRole("link", { name: /Original file/ }).hasAttribute("download")).toBe(true);
  });

  it.each([
    [true, "Position: placed by hand"],
    [false, "Position: phone GPS"],
  ])("states the position's basis when placedByHand is %s", (placedByHand, words) => {
    const record = sampleRecord();
    record.features.find((f) => f.field === "main_device_rating")!.placedByHand = placedByHand;
    setup("main_device_rating", {}, record);
    expect(screen.getByRole("complementary").textContent).toContain(words);
  });

  it("resets what's cited when a new draft arrives on the same value", () => {
    const record = sampleRecord();
    const props = {
      api: { evidenceUrl: (id: string) => `/files/${id}` } as EngineerApi,
      report: sampleReport(),
      fields: ["parcel_id"],
      actorName: "",
      onActorName: vi.fn(),
      onRecord: vi.fn(),
      onClose: vi.fn(),
    };
    const { rerender } = render(<EvidencePanel {...props} record={record} />);
    const cited = screen.getByRole("checkbox", { name: /SAMPLE-0001/ }) as HTMLInputElement;
    fireEvent.click(cited);
    expect(cited.checked).toBe(true);
    const next = sampleRecord();
    const value = next.values.find((v) => v.field === "parcel_id")!;
    const newer = { ...structuredClone(next.observations[0]!), id: "obs-new" };
    next.observations.push(newer);
    value.observationIds.push("obs-new");
    rerender(<EvidencePanel {...props} record={next} />);
    for (const box of screen.getAllByRole("checkbox") as HTMLInputElement[]) expect(box.checked).toBe(false);
  });

  it("says when a value has no map feature", () => {
    setup("meter_number");
    expect(screen.getByRole("complementary").textContent).toMatch(/Not a map item/);
  });

  it("says when a map feature isn't required by the form", () => {
    setup("property_line");
    expect(screen.getByRole("complementary").textContent).toMatch(/Not required by this form/);
  });
});

describe("resolving a value", () => {
  it("shows the API's rejection when a verify has no name", async () => {
    const confirmValue = vi
      .fn()
      .mockRejectedValue(new ApiRequestError("verifier_required", "A verification needs a named person."));
    setup("parcel_id", { confirmValue });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/needs a named person/));
    expect(confirmValue).toHaveBeenCalledWith("sample-site", "parcel_id", { verifierName: "", evidence: [], expectedObservationId: "obs-1" });
  });

  it("leaves the state unchanged when a confirm fails, and shows the error", async () => {
    const { onRecord } = setup("parcel_id", {
      confirmValue: vi.fn().mockRejectedValue(new ApiRequestError("not_found", "That value no longer exists.")),
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/no longer exists/));
    expect(onRecord).not.toHaveBeenCalled();
    expect(within(screen.getByRole("complementary")).getAllByText(/Inferred/).length).toBeGreaterThan(0);
  });

  it("sends the chosen candidate with the cited evidence", async () => {
    const updated = sampleRecord();
    const resolveConflict = vi.fn().mockResolvedValue(updated);
    const { onRecord } = setup("lot_size_acres", { resolveConflict });
    fireEvent.click(screen.getByRole("radio", { name: /7\.3 acre/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /7\.3 acre/ }));
    fireEvent.change(screen.getByLabelText("Document or note"), { target: { value: "Assessor card checked" } });
    fireEvent.click(screen.getByRole("button", { name: "Choose candidate" }));
    await waitFor(() => expect(onRecord).toHaveBeenCalledWith(updated));
    expect(resolveConflict).toHaveBeenCalledWith("sample-site", "lot_size_acres", {
      verifierName: "",
      candidateId: "lot-assessor",
      evidence: [
        { kind: "observation", observationId: "obs-3" },
        { kind: "document", description: "Assessor card checked" },
      ],
    });
  });

  it("sends a correction with its unit", async () => {
    const correctValue = vi.fn().mockResolvedValue(sampleRecord());
    setup("building_area_sqft", { correctValue });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "42000" } });
    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "sqft" } });
    fireEvent.click(screen.getByRole("button", { name: "Save value" }));
    await waitFor(() => expect(correctValue).toHaveBeenCalled());
    expect(correctValue.mock.calls[0]![2].value).toEqual({ type: "quantity", value: 42000, unit: "sqft" });
  });

  it("won't send a non-number with a unit", () => {
    const correctValue = vi.fn();
    setup("building_area_sqft", { correctValue });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "large" } });
    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "sqft" } });
    fireEvent.click(screen.getByRole("button", { name: "Save value" }));
    expect(correctValue).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/number/);
  });

  it("offers no action on a verified value or an engineer's decision", () => {
    setup("main_device_rating");
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save value" })).toBeNull();
    cleanup();
    setup("system_capacity_kw");
    expect(screen.queryByRole("button", { name: "Save value" })).toBeNull();
    expect(screen.getByRole("complementary").textContent).toMatch(/engineer decision/i);
  });
});

describe("the dock itself", () => {
  const base = () => ({
    api: { evidenceUrl: (id: string) => `/files/${id}` } as EngineerApi,
    report: sampleReport(),
    actorName: "",
    onActorName: vi.fn(),
    onRecord: vi.fn(),
  });

  it("names the pick in its header, and folds and closes from there", () => {
    const onClose = vi.fn();
    const onCollapse = vi.fn();
    render(<EvidencePanel {...base()} record={sampleRecord()} fields={["parcel_id"]} onClose={onClose} onCollapse={onCollapse} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(sampleRecord().values.find((v) => v.field === "parcel_id")!.label);
    fireEvent.click(screen.getByRole("button", { name: "Collapse details" }));
    expect(onCollapse).toHaveBeenCalledOnce();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows only a rail when folded, which opens it again", () => {
    const onExpand = vi.fn();
    render(<EvidencePanel {...base()} record={sampleRecord()} fields={["parcel_id"]} onClose={vi.fn()} collapsed onExpand={onExpand} />);
    expect(screen.queryByRole("list", { name: "History" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Show details/ }));
    expect(onExpand).toHaveBeenCalledOnce();
  });

  it("offers a reading repeated across runs as one piece of evidence to cite", () => {
    const record = sampleRecord();
    const first = record.observations.find((o) => o.field === "parcel_id")!;
    record.observations.push({ ...first, id: `${first.id}-again` });
    render(<EvidencePanel {...base()} record={record} fields={["parcel_id"]} onClose={vi.fn()} />);
    const boxes = screen.getAllByRole("checkbox", { name: /SAMPLE-0001/ });
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.closest("label")!.textContent).toMatch(/2 readings/);
  });
});

describe("readable values", () => {
  it("separates large numbers and spells out code words", async () => {
    const { readable } = await import("./EvidencePanel");
    expect(readable("1122433 sqft")).toBe("1,122,433 sqft");
    expect(readable("880 ft")).toBe("880 ft");
    expect(readable("feasible_bess_recommended")).toBe("feasible bess recommended");
    expect(readable("05_01_10J323")).toBe("05_01_10J323");
  });
});
