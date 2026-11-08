// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordVersion } from "@eqore/contract";
import { sampleRecord, worcesterRecord } from "../test/fixtures";

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
    off(event: string, handler: (e: unknown) => void) {
      this.handlers[event] = (this.handlers[event] ?? []).filter((h) => h !== handler);
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
    pitch = 0;
    easeTo(options: { pitch?: number } = {}) {
      this.eased += 1;
      if (options.pitch !== undefined) this.pitch = options.pitch;
    }
    fitted: unknown[] = [];
    fitBounds(bounds: unknown) {
      this.fitted.push(bounds);
    }
    layout: Record<string, string> = {};
    setLayoutProperty(layer: string, _name: string, value: string) {
      this.layout[layer] = value;
    }
    setMaxPitch() {}
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
    getElement() {
      return this.el;
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

import { SiteMap, type SiteMapProps } from "./SiteMap";

beforeEach(() => {
  fake.state.maps.length = 0;
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const lastMap = () => fake.state.maps.at(-1)!;

const fromRecord = (record: RecordVersion) => ({
  site: record.site,
  baseMap: record.baseMap,
  features: record.features,
  values: record.values,
});

function setup(props: Partial<SiteMapProps> & { record?: RecordVersion } = {}) {
  const onSelect = vi.fn();
  const { record = sampleRecord(), ...rest } = props;
  const all: SiteMapProps = { ...fromRecord(record), selectedFields: [], onSelect, ...rest };
  const utils = render(<SiteMap {...all} />);
  act(() => lastMap().fire("load"));
  const rerender = (next: Partial<SiteMapProps> & { record?: RecordVersion }) => {
    const { record: nextRecord = record, ...nextRest } = next;
    utils.rerender(<SiteMap {...fromRecord(nextRecord)} selectedFields={[]} onSelect={onSelect} {...nextRest} />);
  };
  return { onSelect, ...utils, rerender };
}

const drawn = () =>
  (lastMap().sources.features!.data as { features: { properties: { id: string; layer: string } }[] }).features;

describe("site map", () => {
  it("creates one map and removes it on unmount", () => {
    const { unmount } = setup();
    expect(fake.state.maps).toHaveLength(1);
    unmount();
    expect(lastMap().removed).toBe(true);
  });

  it("highlights the selected field's features and clears the last selection", () => {
    const { rerender } = setup({ selectedFields: ["feeder"] });
    expect(lastMap().featureState).toContainEqual({ id: "f-feeder", selected: true });
    rerender({ selectedFields: ["property_line"] });
    expect(lastMap().featureState).toContainEqual({ id: "f-feeder", selected: false });
    expect(lastMap().featureState).toContainEqual({ id: "f-property", selected: true });
  });

  it("highlights only the one item picked on the map, not every item of its field", () => {
    const record = worcesterRecord();
    const [first, second] = record.features.filter((f) => f.kind === "building_outline");
    setup({ record, selectedFields: ["building_outline"], selectedFeatureId: first!.id });
    expect(lastMap().featureState).toContainEqual({ id: first!.id, selected: true });
    expect(lastMap().featureState).not.toContainEqual({ id: second!.id, selected: true });
  });

  it("reapplies the selection after new source data", () => {
    const { rerender } = setup({ selectedFields: ["feeder"] });
    lastMap().featureState.length = 0;
    const next = sampleRecord();
    next.version = 3;
    rerender({ record: next, selectedFields: ["feeder"] });
    expect(lastMap().featureState).toContainEqual({ id: "f-feeder", selected: true });
  });

  it("selects the item a map click hits, by field and item", () => {
    const { onSelect } = setup();
    lastMap().queryRenderedFeatures.result = [{ properties: { field: "feeder", id: "f-feeder" } }];
    lastMap().fire("click", { point: { x: 1, y: 2 }, lngLat: { lng: 0, lat: 0 } });
    expect(onSelect).toHaveBeenCalledWith("feeder", "f-feeder");
  });

  it("picks a dimension line over the building and the parcel beneath it", () => {
    const { onSelect } = setup();
    lastMap().queryRenderedFeatures.byLayer = {
      "property-fill": [{ properties: { field: "property_line", id: "p" } }],
      "building-fill": [{ properties: { field: "building_outline", id: "b" } }],
      "dimension-line": [{ properties: { field: "lot_width_ft", id: "d" } }],
    };
    lastMap().fire("click", { point: { x: 1, y: 2 }, lngLat: { lng: 0, lat: 0 } });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("lot_width_ft", "d");
  });

  it("fits the view to the parcel once, not again on each new version", () => {
    const record = worcesterRecord();
    const { rerender } = setup({ record });
    expect(lastMap().fitted).toHaveLength(1);
    const [[west, south], [east, north]] = lastMap().fitted[0] as [[number, number], [number, number]];
    expect(west).toBeCloseTo(-71.77324, 4);
    expect(east).toBeCloseTo(-71.76742, 4);
    expect(south).toBeLessThan(north);
    rerender({ record: { ...record, version: record.version + 1 } });
    expect(lastMap().fitted).toHaveLength(1);
  });

  it("draws every collected kind on Worcester and lists each in the legend", () => {
    setup({ record: worcesterRecord() });
    const legend = within(screen.getByRole("list", { name: "Map layers" }));
    for (const name of ["Dimension lines", "Buildings", "Lot", "Utility lines", "Fire stations", "Wetlands"]) {
      expect(legend.getByRole("checkbox", { name: new RegExp(name) })).toBeTruthy();
    }
    expect(new Set(drawn().map((f) => f.properties.layer))).toEqual(new Set(["lot", "buildings", "utility", "dimensions", "wetlands"]));
    expect(screen.getAllByRole("button", { name: /FIRE DEPARTMENT/ })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "1,571 ft" })).toBeTruthy();
  });

  it("says which kinds this run didn't collect", () => {
    setup({ record: worcesterRecord() });
    expect(screen.getByText(/Not collected for this site: roads, substations, eligibility zones\./)).toBeTruthy();
  });

  it("toggles a layer off and back on from the legend", () => {
    setup({ record: worcesterRecord() });
    const wetlands = screen.getByRole("checkbox", { name: /Wetlands/ });
    fireEvent.click(wetlands);
    expect(drawn().some((f) => f.properties.layer === "wetlands")).toBe(false);
    fireEvent.click(screen.getByRole("checkbox", { name: /Fire stations/ }));
    expect(screen.queryAllByRole("button", { name: /FIRE DEPARTMENT/ })).toHaveLength(0);
    fireEvent.click(wetlands);
    expect(drawn().some((f) => f.properties.layer === "wetlands")).toBe(true);
  });

  it("draws eligibility zones by tier, with a legend entry for each tier present", () => {
    const record = worcesterRecord();
    const ring: [number, number][] = [
      [-71.77, 42.277],
      [-71.769, 42.277],
      [-71.769, 42.2776],
      [-71.77, 42.277],
    ];
    for (const tier of ["remote", "near_exposure"]) {
      record.features.push({
        id: `zone-${tier}`,
        kind: "candidate_area",
        field: "lot_size_acres",
        geometry: { type: "Polygon", coordinates: [ring] },
        attributes: { tier: { type: "text", value: tier } },
      });
    }
    setup({ record });
    expect(screen.getByRole("checkbox", { name: /Zone: remote/ })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Zone: near exposures/ })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Zone: excluded/ })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /Zone: remote/ }));
    expect(drawn().map((f) => f.properties.id)).toContain("zone-near_exposure");
    expect(drawn().map((f) => f.properties.id)).not.toContain("zone-remote");
  });

  it("offers one 3D view control and no outbound links", () => {
    setup({ record: worcesterRecord() });
    expect(screen.queryByRole("link", { name: /Google Earth|Street View/ })).toBeNull();
    expect(screen.getByRole("button", { name: "3D view" })).toBeTruthy();
  });

  it("raises buildings and draws the equipment models on the aerial, and offers Google's 3D view", () => {
    setup({ record: worcesterRecord() });
    expect(lastMap().layout["building-3d"]).toBe("visible");
    expect(lastMap().layout["equipment-3d"]).toBeUndefined();
    expect(screen.getByRole("button", { name: "3D view" })).toBeTruthy();
  });

  it("offers a way out of placing", () => {
    const onCancelPlace = vi.fn();
    setup({ placingField: "meter_number", onPlace: vi.fn(), onCancelPlace });
    fireEvent.click(screen.getByRole("button", { name: "Cancel placing" }));
    expect(onCancelPlace).toHaveBeenCalled();
  });

  it("eases to a focused label once, not again on each new version", () => {
    const { rerender } = setup({ focusField: "main_device_rating" });
    expect(lastMap().eased).toBe(1);
    const next = sampleRecord();
    next.version = 3;
    rerender({ record: next, focusField: "main_device_rating" });
    expect(lastMap().eased).toBe(1);
  });

  it("shows an existing equipment label that selects its field", () => {
    const { onSelect } = setup();
    fireEvent.click(screen.getByRole("button", { name: /\(E\) MAIN SWITCHBOARD 600 A/ }));
    expect(onSelect).toHaveBeenCalledWith("main_device_rating", "f-gear");
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

  it("says when a record has no aerial, but not while a run is still reading sources", () => {
    const record = sampleRecord();
    record.baseMap = null;
    const { rerender } = setup({ record, loading: true });
    expect(screen.queryByText("Aerial unavailable")).toBeNull();
    expect(screen.queryByText(/Not collected for this site/)).toBeNull();
    rerender({ record, loading: false });
    expect(screen.getByText("Aerial unavailable")).toBeTruthy();
  });

  it("adds the aerial when it arrives after the first results", () => {
    const record = sampleRecord();
    const { rerender } = setup({ record, baseMap: null, loading: true });
    expect(lastMap().sources.base).toBeUndefined();
    rerender({ record });
    expect(lastMap().sources.base).toBeTruthy();
  });
});
