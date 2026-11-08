// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { worcesterRecord, worcesterReport } from "../test/fixtures";
import { RecordSummary, StatusStrip } from "../ui/StatusStrip";
import { AttentionList } from "./AttentionList";
import { FactsPanel } from "./FactsPanel";

afterEach(cleanup);

describe("public facts", () => {
  function setup() {
    const onSelect = vi.fn();
    const onOpenReport = vi.fn();
    render(<FactsPanel record={worcesterRecord()} selectedFields={[]} onSelect={onSelect} onOpenReport={onOpenReport} />);
    return { onSelect, onOpenReport };
  }

  it("groups public facts by family and lists nothing that isn't public", () => {
    setup();
    const panel = screen.getByRole("region", { name: "Public facts" });
    expect(within(panel).getByRole("region", { name: "Physical facts" })).toBeTruthy();
    expect(within(panel).getByRole("region", { name: "Utility facts" })).toBeTruthy();
    expect(within(panel).queryByText(/Interconnecting customer/)).toBeNull();
    expect(within(panel).queryByText(/System design capacity/)).toBeNull();
  });

  it("shows each fact's source, date, how it was measured, and grade", () => {
    setup();
    const row = screen.getByRole("button", { name: /^Lot width/ });
    expect(row.textContent).toMatch(/1571\.4 ft/);
    expect(row.textContent).toMatch(/MassGIS L3 property tax parcels/);
    expect(row.textContent).toMatch(/dated parcel FY2026/);
    expect(row.textContent).toMatch(/Computed/);
    expect(row.textContent).toMatch(/Reference grade/);
  });

  it("shows cross-checks on the fact", () => {
    const record = worcesterRecord();
    record.values.find((v) => v.field === "ground_elevation_ft")!.crossChecks = [{ label: "USGS against Earth Engine", result: "agrees" }];
    render(<FactsPanel record={record} selectedFields={[]} onSelect={vi.fn()} onOpenReport={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: /^Ground elevation/ })[0]!.textContent).toMatch(/Cross-check, USGS against Earth Engine: agrees/);
  });

  it("selects a fact from the keyboard-reachable row", () => {
    const { onSelect } = setup();
    const row = screen.getByRole("button", { name: /^Lot width/ });
    row.focus();
    expect(document.activeElement).toBe(row);
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith("lot_width_ft");
  });

  it("folds public facts no source had into one line per family", () => {
    setup();
    const physical = screen.getByRole("region", { name: "Physical facts" });
    expect(within(physical).getByText("Not found in public sources: 5")).toBeTruthy();
  });

  it("collapses facts that aren't public into one line that explains why on request", () => {
    const { onOpenReport } = setup();
    const line = screen.getByRole("button", { name: "Not in public records: 37 customer facts and 41 engineer decisions" });
    expect(line.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/No public source we tested/)).toBeNull();
    fireEvent.click(line);
    expect(screen.getByText(/No public source we tested/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open the evidence check and requests" }));
    expect(onOpenReport).toHaveBeenCalled();
  });
});

describe("needs your attention", () => {
  it("lists the conflicts and layers not checked, each with a reason, and selects a conflict's fact", () => {
    const onSelect = vi.fn();
    render(<AttentionList record={worcesterRecord()} selectedFields={[]} onSelect={onSelect} />);
    const list = screen.getByRole("region", { name: "Needs your attention" });
    expect(within(list).getByText(/Sources disagree: 29\.92 acre/)).toBeTruthy();
    expect(within(list).getByText(/4 nearby feeders/)).toBeTruthy();
    expect(within(list).getByText("Google Earth Engine land cover")).toBeTruthy();
    expect(within(list).getByText("FEMA Flood Map Service Center")).toBeTruthy();
    fireEvent.click(within(list).getByRole("button", { name: /^Lot size/ }));
    expect(onSelect).toHaveBeenCalledWith("lot_size_acres");
  });

  it("says so when nothing needs attention", () => {
    const record = worcesterRecord();
    record.values = record.values.filter((v) => v.state !== "conflicting" && v.grade !== "reference");
    record.sourceRuns = record.sourceRuns.filter((run) => run.status === "snapshot");
    render(<AttentionList record={record} selectedFields={[]} onSelect={vi.fn()} />);
    expect(screen.getByText(/Nothing needs your attention/)).toBeTruthy();
  });
});

describe("status strip", () => {
  it("says nothing for real public data, and names a snapshot", () => {
    const record = worcesterRecord();
    record.synthetic = false;
    record.snapshot = false;
    const { container } = render(<StatusStrip record={record} progress={null} running={false} />);
    expect(container.textContent).toBe("");
    cleanup();
    record.snapshot = true;
    render(<StatusStrip record={record} progress={null} running={false} />);
    const text = screen.getByRole("region", { name: "Site status" }).textContent ?? "";
    expect(text).toBe("Recorded snapshot");
  });

  it("moves the counts, unverified signal, and grid line to the record summary, in that order", () => {
    const { container } = render(<RecordSummary record={worcesterRecord()} report={worcesterReport()} />);
    const text = container.textContent ?? "";
    const order = [
      "33 public facts found, 15 of 78 plan-set fields, 1 source conflict, 1 field with feeder candidates",
      "Unverified: no person has checked these values.",
      "Grid connection request: 2 of 21 items",
    ].map((part) => text.indexOf(part));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("always labels a synthetic record", () => {
    const record = worcesterRecord();
    record.synthetic = true;
    render(<StatusStrip record={record} progress={null} running={false} />);
    expect(screen.getByText("Synthetic")).toBeTruthy();
    expect(screen.queryByText("Real public data")).toBeNull();
  });

  it("counts sources answered during a run", () => {
    const record = worcesterRecord();
    const progress = {
      status: "running" as const,
      site: record.site,
      features: [],
      sourceRuns: record.sourceRuns.map((run, i) => (i < 9 ? run : { ...run, status: "pending" as const })),
    };
    render(<StatusStrip record={null} progress={progress} running />);
    expect(screen.getByRole("status").textContent).toBe("Reading sources, 9 of 15 answered");
  });
});
