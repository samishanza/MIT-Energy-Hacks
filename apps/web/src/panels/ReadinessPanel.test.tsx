// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleRecord, sampleReport } from "../test/fixtures";
import { ReadinessPanel, type ReadinessPanelProps } from "./ReadinessPanel";

afterEach(cleanup);

function setup(overrides: Partial<ReadinessPanelProps> = {}) {
  const props: ReadinessPanelProps = {
    record: sampleRecord(),
    report: sampleReport(),
    links: [],
    selectedFields: [],
    onSelectFields: vi.fn(),
    onCreateLink: vi.fn(),
    onUpload: vi.fn(),
    onOpenConfirm: vi.fn(),
    ...overrides,
  };
  render(<ReadinessPanel {...props} />);
  return props;
}

const gapRow = (request: RegExp) => {
  const ranked = within(screen.getByRole("list", { name: "Ranked gaps" }));
  return ranked.getByText(request).closest("li") as HTMLElement;
};

describe("ranked gaps", () => {
  it("leads with the top gap as the next request", () => {
    setup();
    const next = screen.getByRole("region", { name: "Next request" });
    expect(within(next).getByText(/recent electric bill/)).toBeTruthy();
  });

  it("keeps the server's order", () => {
    setup();
    const rows = within(screen.getByRole("list", { name: "Ranked gaps" })).getAllByRole("listitem");
    expect(rows[0]!.textContent).toMatch(/electric bill/);
    expect(rows[1]!.textContent).toMatch(/Pre-Application Report/);
    expect(rows[2]!.textContent).toMatch(/Bus rating/);
  });

  it("offers a capture link on a phone route", () => {
    const props = setup();
    fireEvent.click(within(gapRow(/electric bill/)).getByRole("button", { name: "Create capture link" }));
    expect(props.onCreateLink).toHaveBeenCalledWith("meter_number");
  });

  it("shows no create-link action on a qualified-person gap, and says why", () => {
    setup();
    const row = gapRow(/Bus rating from a qualified/);
    expect(within(row).queryByRole("button", { name: "Create capture link" })).toBeNull();
    expect(within(row).getByText(/Needs a qualified person/)).toBeTruthy();
  });

  it("shows a draft read-only, and says the tool doesn't send it", () => {
    setup();
    const row = gapRow(/Pre-Application Report/);
    fireEvent.click(within(row).getByRole("button", { name: "View draft" }));
    expect(within(row).getByText(/This tool does not send anything/)).toBeTruthy();
    expect(within(row).getByText(/Please provide a Pre-Application Report/)).toBeTruthy();
    expect(within(row).queryByRole("button", { name: /send/i })).toBeNull();
    expect(row.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it("says so when a draft route has no draft", () => {
    const report = sampleReport();
    delete report.gaps[1]!.draftRequest;
    setup({ report });
    expect(within(gapRow(/Pre-Application Report/)).getByText("No draft available")).toBeTruthy();
  });

  it("lists an engineer-route gap with engineer decisions, not in the ranking", () => {
    setup();
    const ranked = screen.getByRole("list", { name: "Ranked gaps" });
    expect(within(ranked).queryByText(/System capacity decision/)).toBeNull();
    expect(screen.getByRole("region", { name: "Engineer decisions" }).textContent).toMatch(/System capacity decision/);
  });

  it("disables link creation on a snapshot, and says why", () => {
    const record = sampleRecord();
    record.snapshot = true;
    setup({ record });
    const row = gapRow(/electric bill/);
    expect((within(row).getByRole("button", { name: "Create capture link" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(row).getByText(/recorded snapshot/i)).toBeTruthy();
  });
});

describe("required items", () => {
  it("shows a drawing row with how many inputs have evidence", () => {
    setup();
    expect(screen.getByText(/Engineer decision, 1 of 2 inputs have evidence/)).toBeTruthy();
  });

  it("tags input rows as team-derived", () => {
    setup();
    const row = screen.getByRole("button", { name: /Main device rating/ });
    expect(within(row).getByText("Team-derived")).toBeTruthy();
  });

  it("marks a row that public data only previews", () => {
    setup();
    expect(within(screen.getByRole("button", { name: /Circuit and substation/ })).getByText(/Preview only/)).toBeTruthy();
  });

  it("names every row's owner, whatever its status", () => {
    setup();
    expect(screen.getByRole("button", { name: /Facility location/ }).textContent).toMatch(/Owner: public data/);
    expect(screen.getByRole("button", { name: /Circuit and substation/ }).textContent).toMatch(/Owner: the utility/);
    expect(screen.getByRole("button", { name: /PE-stamped one-line/ }).textContent).toMatch(/Owner: the engineer/);
  });

  it("selects a row's fields", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: /PE-stamped one-line/ }));
    expect(props.onSelectFields).toHaveBeenCalledWith(["main_device_rating", "bus_rating"]);
  });

  it("never claims an item is complete, approved, or ready", () => {
    setup();
    const text = (document.body.textContent ?? "").replace(/Not an approval/, "");
    expect(text).not.toMatch(/\b(complete|approved|ready)\b/i);
  });
});

describe("counts and citation", () => {
  it("counts form rows and input rows separately", () => {
    setup();
    expect(screen.getByText(/1 of 4 form rows/)).toBeTruthy();
    expect(screen.getByText(/1 of 2 drawing inputs/)).toBeTruthy();
  });

  it("counts source conflicts apart from feeder candidates", () => {
    setup();
    expect(screen.getByText(/1 source conflict\b/)).toBeTruthy();
    expect(screen.getByText(/1 field with feeder candidates/)).toBeTruthy();
  });

  it("lists values the form doesn't require, with conflicts first", () => {
    setup();
    const other = within(screen.getByRole("region", { name: /Other record values/ })).getAllByRole("button");
    expect(other[0]!.textContent).toMatch(/Lot size/);
  });

  it("cites the version and form", () => {
    setup();
    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).toMatch(/Record v2/);
    expect(footer.textContent).toMatch(/SYNTHETIC SAMPLE application form/);
    expect(footer.textContent).toMatch(/2026-01-01/);
  });

  it("flags a superseded form", () => {
    const report = sampleReport();
    report.requirementsTable!.superseded = true;
    setup({ report });
    expect(screen.getByRole("contentinfo").textContent).toMatch(/superseded form/);
  });

  it("gives the reason and no share when no table applies", () => {
    const report = sampleReport();
    report.requirementsTable = null;
    report.share = null;
    report.noTableReason = "No serving utility was found. Ask for a recent bill.";
    report.items = [];
    setup({ report });
    expect(screen.getByText(/No serving utility was found/)).toBeTruthy();
    expect(screen.queryByText(/form rows/)).toBeNull();
  });
});
