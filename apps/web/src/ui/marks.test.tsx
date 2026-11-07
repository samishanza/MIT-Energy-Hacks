// @vitest-environment jsdom
import { VALUE_STATES, type ValueState } from "@eqore/contract";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { sampleRecord } from "../test/fixtures";
import { ProvenanceTag, StateBadge } from "./marks";

afterEach(cleanup);

const wordFor: Record<ValueState, string> = {
  missing: "Missing",
  conflicting: "Conflicting",
  unreadable: "Unreadable",
  inferred: "Inferred",
  verified: "Verified",
};

describe("value state badge", () => {
  it.each(VALUE_STATES)("labels %s in words, with its own mark", (state) => {
    const value = sampleRecord().values.find((v) => v.state === state)!;
    const { container } = render(<StateBadge value={value} />);
    expect(screen.getByText(new RegExp(wordFor[state]))).toBeTruthy();
    expect(container.querySelector(`[data-state-mark="${state}"]`)).toBeTruthy();
  });

  it("names how an inferred value was obtained", () => {
    const value = sampleRecord().values.find((v) => v.field === "parcel_id")!;
    render(<StateBadge value={value} />);
    expect(screen.getByText(/Read from source/)).toBeTruthy();
  });

  it("names the person behind a verified value", () => {
    const value = sampleRecord().values.find((v) => v.state === "verified")!;
    render(<StateBadge value={value} />);
    expect(screen.getByText(/Sample Engineer/)).toBeTruthy();
  });
});

describe("provenance tag", () => {
  it("marks synthetic data", () => {
    render(<ProvenanceTag synthetic />);
    expect(screen.getByText("Synthetic")).toBeTruthy();
  });

  it("marks real public data", () => {
    render(<ProvenanceTag synthetic={false} />);
    expect(screen.getByText("Real public data")).toBeTruthy();
  });
});
