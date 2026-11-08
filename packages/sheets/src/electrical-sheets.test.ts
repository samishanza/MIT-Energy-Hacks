import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MapFeature, ObservedValue, RecordVersion, Value } from '@eqore/contract';
import { CONFIGURATIONS, designFromRecord } from '@eqore/electrical';
import { CalculationsSheet, EquipmentElevations, SingleLineSheet, deviceSpecs, drawingText, scheduleRows, ELECTRICAL_SHEET_NOTE } from './index.ts';

// A labeled synthetic record: only the parts the electrical design reads.
function value(field: string, current: ObservedValue | null, state: Value['state'] = current ? 'inferred' : 'missing', reason?: string): Value {
  return { field, label: field, state, current, flags: [], observationIds: [], owner: 'engineer', grade: 'reference', synthetic: true, reason } as unknown as Value;
}

const square = (lon: number, lat: number, size: number): MapFeature['geometry'] => ({
  type: 'Polygon',
  coordinates: [[[lon, lat], [lon + size, lat], [lon + size, lat + size], [lon, lat + size], [lon, lat]]],
});

function record(values: Value[]): RecordVersion {
  return {
    id: 'synthetic-site-v1',
    version: 1,
    createdAt: '2026-11-07T20:00:00.000Z',
    site: { id: 'synthetic-site', address: 'SYNTHETIC TEST SITE, ANYTOWN, MA', region: 'massachusetts', location: [-71.5, 42.2], locationMethod: 'hand_placed' },
    values,
    features: [
      { id: 'pad', kind: 'candidate_area', field: 'pad_zone_x_ft', geometry: square(-71.5, 42.2, 0.0002) },
      { id: 'entrance', kind: 'existing_equipment', field: 'grid_service_path', geometry: { type: 'Point', coordinates: [-71.5, 42.2006] }, attributes: { equipment_type: { type: 'text', value: 'service_entrance' }, basis: { type: 'text', value: 'inferred' } } },
    ],
    synthetic: true,
  } as unknown as RecordVersion;
}

// Little known: the service path is inferred, the utility is unsettled, the voltage unknown.
const sparse = record([
  value('grid_service_path', { type: 'text', value: 'Likely fed overhead from a pole, by a service drop of about 100 ft' }),
  { ...value('serving_utility', null, 'conflicting'), candidates: [{ value: { type: 'text', value: 'Utility A' } }, { value: { type: 'text', value: 'Utility B' } }] } as unknown as Value,
]);
const known = record([
  value('serving_utility', { type: 'text', value: 'Synthetic Electric' }, 'verified'),
  value('service_voltage', { type: 'text', value: '480Y/277 V' }, 'verified'),
  value('main_device_rating', { type: 'quantity', value: 800, unit: 'A' }, 'verified'),
  value('bus_rating', { type: 'quantity', value: 1200, unit: 'A' }, 'verified'),
]);

const sheets = [SingleLineSheet, CalculationsSheet, EquipmentElevations];
const render = (rec: RecordVersion, service = 0, config = CONFIGURATIONS[0]) =>
  sheets.map((sheet) => renderToStaticMarkup(createElement(sheet, { design: designFromRecord(rec, config), service, synthetic: true })));
// The text on a sheet, without markup.
const words = (svg: string) => svg.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

describe('the electrical sheets', () => {
  it('say only what each thing is, never how it was found', () => {
    for (const rec of [sparse, known]) {
      for (const config of CONFIGURATIONS) {
        for (const svg of [...render(rec, 0, config), ...render(rec, 1, config)]) {
          const text = words(svg).replace(ELECTRICAL_SHEET_NOTE, '');
          expect(text).not.toMatch(/inferred|likely|assum|approximate|estimat|plausible|not field verified|concept location|not confirmed|±|≈|not settled/i);
          expect(text).toContain('NOT FOR CONSTRUCTION');
          expect(words(svg)).toContain(ELECTRICAL_SHEET_NOTE);
        }
      }
    }
  });

  it('prints BY UTILITY and BY ENGINEER where the record has no value', () => {
    const design = designFromRecord(sparse);
    const specs = deviceSpecs(design, design.designs[0]!);
    const row = (table: string, label: string) => specs.find((s) => s.id === table)!.rows.find(([l]) => l === label)![1];
    expect(row('service-transformer', 'UTILITY')).toBe('BY UTILITY');
    expect(row('service-transformer', 'UTILITY METER NO.')).toBe('BY UTILITY');
    expect(row('main-switchgear', 'BUS RATING')).toBe('BY ENGINEER');
    const filled = designFromRecord(known);
    const filledSpecs = deviceSpecs(filled, filled.designs[0]!);
    expect(filledSpecs.find((s) => s.id === 'main-switchgear')!.rows).toContainEqual(['BUS RATING', '1200A']);
    expect(filledSpecs.find((s) => s.id === 'service-transformer')!.rows).toContainEqual(['UTILITY', 'SYNTHETIC ELECTRIC']);
  });

  it('splits the neutral out of the schedule only where the design runs one', () => {
    const rows = scheduleRows(designFromRecord(known).designs[0]!.schedule);
    expect(rows.find((r) => r.tag === 3)).toMatchObject({ conductor: '2 × 250 KCMIL AL 75 °C PER PHASE', neutral: '2 × 250 KCMIL AL 75 °C' });
    expect(rows.find((r) => r.tag === 4)!.neutral).toBe('N/A');
  });

  it('strips clauses that say how a value was found', () => {
    expect(drawingText('Estimated run 10 ft (shortest plausible run, straight line)')).toBe('run 10 ft');
    expect(drawingText('7. VOLTAGE DROP, DISCONNECT TO THE PANEL (ESTIMATE)')).toBe('7. VOLTAGE DROP, DISCONNECT TO THE PANEL');
    expect(drawingText('2023 NEC Table 310.16 (Al, 75 °C)')).toBe('2023 NEC Table 310.16 (Al, 75 °C)');
  });

  it('draws one sheet per number, with the conduit tags the schedule numbers', () => {
    const [e100, e200, e300] = render(known);
    expect(words(e100!)).toContain('E-100');
    expect(words(e200!)).toContain('E-200');
    expect(words(e300!)).toContain('E-300');
    for (const tag of [1, 2, 3, 4]) expect(e100).toContain(`data-device="conduit-${tag}"`);
    expect(words(e100!)).toMatch(/POINT OF INTERCONNECTION \(POI\)/);
    expect(words(e100!)).toMatch(/POINT OF COMMON COUPLING \(PCC\)/);
  });
});
