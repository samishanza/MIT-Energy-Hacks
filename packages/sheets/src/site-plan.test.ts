import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RecordVersionSchema, type RecordVersion } from '@eqore/contract';
import sample from '../../contract/samples/record.sample.json' with { type: 'json' };
import { EngineeringSitePlan } from './EngineeringSitePlan.tsx';
import { chooseScale, dimensionText, featureLabels, formatQuantity, plainLabel, printed, sheetNotes, siteDataRows } from './site-plan-data.ts';

const record = (): RecordVersion => RecordVersionSchema.parse(structuredClone(sample));

describe('site plan data', () => {
  it('prints quantities the way a drawing writes them', () => {
    expect(formatQuantity(1571.4, 'ft')).toBe("1,571'");
    expect(formatQuantity(1994, 'year')).toBe('1994');
    expect(formatQuantity(29.92, 'acre')).toBe('29.92 AC');
    expect(formatQuantity(13.8, 'kV')).toBe('13.8 KV');
  });

  it('writes a dimension the way a drawing does', () => {
    expect(dimensionText('1,571 ft (fitted)')).toBe("1,571'");
  });

  it('names a feature by what it is, leaving how it was found to the record', () => {
    expect(plainLabel('(E) LIKELY SERVICE TAP ON 05_01_27W3, INFERRED, NOT FIELD VERIFIED')).toBe('(E) SERVICE TAP ON 05_01_27W3');
    expect(plainLabel('(E) UTILITY POLE, DETECTED IN LIDAR, NOT FIELD VERIFIED')).toBe('(E) UTILITY POLE');
    expect(plainLabel('(N) BESS PAD, CONCEPT LOCATION, NOT A DESIGN')).toBe('(N) BESS PAD');
    expect(plainLabel('Research Dr, the street in the address (mapped centerline, not surveyed)')).toBe('Research Dr, the street in the address');
  });

  it('picks the smallest standard engineering scale that fits', () => {
    expect(chooseScale(1600 * 1.3, 1700 * 1.3, 23.3, 19.3)).toBe(150);
    expect(chooseScale(300, 200, 23.3, 19.3)).toBe(20);
  });

  it('prints both readings when sources disagree, and never fills in a missing value', () => {
    const r = record();
    const lot = r.values.find((v) => v.field === 'lot_size_acres')!;
    lot.current = null;
    lot.state = 'conflicting';
    (lot as { candidates?: unknown }).candidates = [
      { id: 'a', value: { type: 'quantity', value: 29.92, unit: 'acre' }, observationId: 'o1', sourceName: 'A' },
      { id: 'b', value: { type: 'quantity', value: 30.931, unit: 'acre' }, observationId: 'o2', sourceName: 'B' },
    ];
    expect(printed(r, 'lot_size_acres')).toBe('29.92 AC / 30.93 AC (SOURCES DIFFER)');
    const rows = siteDataRows(r);
    expect(rows.find((row) => row.label === 'ZONING DISTRICT')?.value).toBe('NOT FOUND IN PUBLIC RECORDS');
    expect(rows.find((row) => row.label === 'BESS CONFIGURATION')?.value).toBe('BY ENGINEER');
  });

  it('carries the not-surveyed note and the record id', () => {
    const notes = sheetNotes(record());
    expect(notes[0]).toMatch(/FOR REFERENCE ONLY\. NOT SURVEYED\./);
    expect(notes.at(-1)).toMatch(/SAMPLE-SITE|RECORD/);
  });

  it('labels the lot for the map as the sheet does', () => {
    const r = record();
    const lot = r.features.find((f) => f.kind === 'property_line')!;
    expect(featureLabels(r)[lot.id]).toMatch(/^\(E\) PROPERTY LINE/);
    expect(featureLabels(r)[lot.id]).not.toMatch(/SURVEYED|INFERRED|APPROX/);
  });
});

describe('the engineering site plan', () => {
  it('draws a G-100 sheet with its notes, legend, and data table, and no equipment the record does not hold', () => {
    const html = renderToStaticMarkup(createElement(EngineeringSitePlan, { record: record(), aerial: false }));
    expect(html).toContain('OVERALL SITE PLAN');
    expect(html).toContain('G-100');
    expect(html).toContain('SHEET NOTES');
    expect(html).toContain('LEGEND');
    expect(html).toContain('SITE DATA (PUBLIC RECORDS)');
    expect(html).toContain('NOT FOR CONSTRUCTION');
    expect(html).toContain('(E) PROPERTY LINE');
    // Without a concept layout in the record, the pad appears only in the legend.
    expect(html.match(/\(N\) BESS PAD/g) ?? []).toHaveLength(1);
  });

  it('says so instead of drawing when the record has no lot', () => {
    const r = record();
    r.features = r.features.filter((f) => f.kind !== 'property_line');
    const html = renderToStaticMarkup(createElement(EngineeringSitePlan, { record: r, aerial: false }));
    expect(html).toContain('no parcel polygon');
  });
});
