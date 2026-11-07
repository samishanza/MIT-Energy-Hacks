// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleRecord } from "../test/fixtures";

// WebGL isn't available here. These tests cover what's sent to the map and the
// marks around it. The browser walk covers what it actually draws.
const fake = vi.hoisted(() => {
  const state = { maps: [] as FakeMap[] };
  class FakeMap {
    handlers: Record<string, ((e: unknown) => void)[]> = {};
    featureState: { id: string; selected: boolean }[] = [];
    removed = false;
    sources: Record<string, { data?: unknown; setData: (d: unknown) => void }> = {};
    queryRenderedFeatures = (() => {
      const fn = (_box: unknown, options?: { layers?: string[] }): unknown[] =>
        fn.byLayer[options?.layers?.[0] ?? ""] ?? fn.result;
      fn.result = [] as unknown[];
      fn.byLayer = {} as Record<string, unknown[]>;
      return fn;
    })();
    constructor() {
      state.maps.push(this);
    }
    on(event: string, handler: (e: unknown) => void) {
      (this.handlers[event] ??= []).push(handler);
      return this;
    }
    fire(event: string, payload: unknown = {}) {
      for (const handler of this.handlers[event] ?? []) handler(payload);
    }
    addControl() {}
    addSource(id: string, source: { data?: unknown }) {
      const entry = {
        ...source,
        setData(data: unknown) {
          entry.data = data;
        },
      };
      this.sources[id] = entry;
    }
    addLayer() {}
    getSource(id: string) {
      return this.sources[id];
    }
    setFeatureState(target: { id: string }, value: { selected: boolean }) {
      this.featureState.push({ id: target.id, selected: value.selected });
    }
    setPadding() {}
    eased = 0;
    easeTo() {
      this.eased += 1;
    }
    getCanvas() {
      return document.createElement("canvas");
    }
    remove() {
      this.removed = true;
    }
  }
  class FakeMarker {
    el: HTMLElement;
    constructor(options: { element: HTMLElement }) {
      this.el = options.element;
    }
    setLngLat() {
      return this;
    }
    addTo() {
      document.body.append(this.el);
      return this;
    }
    remove() {
      this.el.remove();
    }
  }
  class FakeControl {}
  return { state, FakeMap, FakeMarker, FakeControl };
});

vi.mock("./maplibre", () => ({
  Map: fake.FakeMap,
  Marker: fake.FakeMarker,
  ScaleControl: fake.FakeControl,
}));

import { SiteMap } from "./SiteMap";

beforeEach(() => {
  fake.state.maps.length = 0;
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const lastMap = () => fake.state.maps.at(-1)!;

function setup(props: Partial<Parameters<typeof SiteMap>[0]> = {}) {
  const onSelect = vi.fn();
  const utils = render(<SiteMap record={sampleRecord()} selectedFields={[]} onSelect={onSelect} {...props} />);
  act(() => lastMap().fire("load"));
  return { onSelect, ...utils };
}

describe("site map", () => {
  it("creates one map and removes it on unmount", () => {
    const { unmount } = setup();
    expect(fake.state.maps).toHaveLength(1);
    unmount();
    expect(lastMap().removed).toBe(true);
  });

  it("keeps the concept-grade note on the map", () => {
    setup();
    expect(screen.getByText(/Concept-grade/).textContent).toMatch(/Not surveyed\. Not a construction document/);
  });

  it("highlights the selected field's features and clears the last selection", () => {
    const { rerender, onSelect } = setup({ selectedFields: ["feeder"] });
    expect(lastMap().featureState).toContainEqual({ id: "f-feeder", selected: true });
    rerender(<SiteMap record={sampleRecord()} selectedFields={["property_line"]} onSelect={onSelect} />);
    expect(lastMap().featureState).toContainEqual({ id: "f-feeder", selected: false });
    expect(lastMap().featureState).toContainEqual({ id: "f-property", selected: true });
  });

  it("reapplies the selection after new source data", () => {
    const { rerender, onSelect } = setup({ selectedFields: ["feeder"] });
    lastMap().featureState.length = 0;
    const next = sampleRecord();
    next.version = 3;
    rerender(<SiteMap record={next} selectedFields={["feeder"]} onSelect={onSelect} />);
    expect(lastMap().featureState).toContainEqual({ id: "f-feeder", selected: true });
  });

  it("selects what a map click hits", () => {
    const { onSelect } = setup();
    lastMap().queryRenderedFeatures.result = [{ properties: { field: "feeder" } }];
    lastMap().fire("click", { point: { x: 1, y: 2 }, lngLat: { lng: 0, lat: 0 } });
    expect(onSelect).toHaveBeenCalledWith("feeder");
  });

  it("picks a utility line over the parcel beneath it", () => {
    const { onSelect } = setup();
    lastMap().queryRenderedFeatures.byLayer = {
      "property-fill": [{ properties: { field: "property_line" } }],
      "utility-line": [{ properties: { field: "feeder" } }],
    };
    lastMap().fire("click", { point: { x: 1, y: 2 }, lngLat: { lng: 0, lat: 0 } });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("feeder");
  });

  it("offers a way out of placing", () => {
    const onCancelPlace = vi.fn();
    setup({ placingField: "meter_number", onPlace: vi.fn(), onCancelPlace });
    fireEvent.click(screen.getByRole("button", { name: "Cancel placing" }));
    expect(onCancelPlace).toHaveBeenCalled();
  });

  it("eases to a focused label once, not again on each new version", () => {
    const { rerender, onSelect } = setup({ focusField: "main_device_rating" });
    expect(lastMap().eased).toBe(1);
    const next = sampleRecord();
    next.version = 3;
    rerender(<SiteMap record={next} selectedFields={[]} onSelect={onSelect} focusField="main_device_rating" />);
    expect(lastMap().eased).toBe(1);
  });

  it.each([
    [true, "Based on public data and customer photos."],
    [false, "Based on public data."],
  ])("states the note's basis when equipment is shown: %s", (withEquipment, words) => {
    const record = sampleRecord();
    if (!withEquipment) record.features = record.features.filter((f) => f.kind !== "existing_equipment");
    setup({ record });
    expect(screen.getByText(/Concept-grade/).textContent).toContain(words);
  });

  it("shows an existing equipment label that selects its field", () => {
    const { onSelect } = setup();
    fireEvent.click(screen.getByRole("button", { name: /\(E\) MAIN SWITCHBOARD 600 A/ }));
    expect(onSelect).toHaveBeenCalledWith("main_device_rating");
  });

  it("marks an unconfirmed photo pin without (E)", () => {
    const record = sampleRecord();
    record.features.push({
      id: "f-pin",
      kind: "capture_pin",
      field: "meter_number",
      geometry: { type: "Point", coordinates: [-71.8, 42.26] },
    });
    setup({ record });
    expect(screen.getByRole("button", { name: "Photo, unconfirmed" }).textContent).not.toMatch(/\(E\)/);
  });

  it("records a click as a hand placement while placing, and selects nothing", () => {
    const onPlace = vi.fn();
    const { onSelect } = setup({ placingField: "meter_number", onPlace });
    lastMap().queryRenderedFeatures.result = [{ properties: { field: "property_line" } }];
    act(() => lastMap().fire("click", { point: { x: 1, y: 2 }, lngLat: { lng: -71.8, lat: 42.26 } }));
    expect(onPlace).toHaveBeenCalledWith("meter_number", -71.8, 42.26);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText(/Click the map to place/)).toBeTruthy();
  });

  it("says when the aerial failed and keeps the map", () => {
    setup();
    act(() => lastMap().fire("error", { sourceId: "base", error: new Error("tile") }));
    expect(screen.getByText("Aerial unavailable")).toBeTruthy();
    expect(lastMap().removed).toBe(false);
  });

  it("says when a record has no aerial", () => {
    const record = sampleRecord();
    record.baseMap = null;
    setup({ record });
    expect(screen.getByText("Aerial unavailable")).toBeTruthy();
  });

  it("says when no existing equipment has been placed", () => {
    const record = sampleRecord();
    record.features = record.features.filter((f) => f.kind !== "existing_equipment");
    setup({ record });
    expect(screen.getByText(/No existing equipment placed yet/)).toBeTruthy();
  });
});
