// E-100 single line diagram, drawn the way an engineered BESS plan set draws one.
//
// Laid out like the supplied plan set's single line sheet: the one-line diagram from the
// utility grid through the main switchgear to the battery, numbered conduit tags, the PCC and
// POI, a conduit schedule, one specification table per device, the system information block,
// and the title strip. Labels say only what each thing is. A value the record doesn't hold
// prints BY UTILITY or BY ENGINEER; how a value was found lives in the app, not on the sheet.

import type { ReactNode } from 'react';
import { CONFIGURATIONS, PLAN_SET_250KW_760KWH, type Configuration, type ElectricalDesign, type EquipmentModel, type ScheduleRow, type ServiceDesign } from '@eqore/electrical';

// Sheet units: 100 per inch on a 36 x 24 in sheet, as the site plan sheet uses.
export const SHEET_W = 3600;
export const SHEET_H = 2400;
const STRIP = { x: 3260, w: 300 };
export const CONTENT = { x: 70, y: 70, right: 3220, bottom: 2330 };
export const FONT = 'Arial, Helvetica, sans-serif';
export const INK = '#111';
export const EXISTING = '#b5121b';
export const NEW = '#0b5cad';
const SELECT = '#f05a00';

/** The one note the electrical sheets carry. */
export const ELECTRICAL_SHEET_NOTE = 'CONCEPT CALCULATIONS. THE ENGINEER OF RECORD VERIFIES.';
export const BY_UTILITY = 'BY UTILITY';
export const BY_ENGINEER = 'BY ENGINEER';

export interface ElectricalSheetProps {
  design: ElectricalDesign;
  /** Which service voltage design to draw, an index into design.designs. */
  service?: number;
  synthetic?: boolean;
  /** The record's date, for the revision row. */
  issued?: string;
  selected?: string | null;
  onSelect?: (id: string) => void;
}

// ------------------------------------------------------------------ shared drafting helpers

/** The configuration the design was drawn for, with its catalog models. */
export function configurationOf(design: ElectricalDesign): Configuration {
  return CONFIGURATIONS.find((c) => c.id === design.configuration.id) ?? PLAN_SET_250KW_760KWH;
}

export function serviceOf(design: ElectricalDesign, index = 0): ServiceDesign {
  return design.designs[index] ?? design.designs[0]!;
}

// Words that say how a value was found rather than what the thing is. They stay off the sheets.
const HEDGES = /\b(inferred|likely|assum\w*|approximate\w*|estimat\w*|plausible|not field verified|concept location|not confirmed)\b|±|≈/i;

/** Drawing text: strips any parenthetical or clause that says how a value was found. */
export function drawingText(text: string): string {
  return text
    .replace(/\s*\(([^()]*)\)/g, (whole, inner: string) => (HEDGES.test(inner) ? '' : whole))
    .replace(/^estimated\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const hasHedge = (text: string) => HEDGES.test(text.replace(ELECTRICAL_SHEET_NOTE, ''));

// Arial capitals average a little over 0.6 em.
export const textWidth = (text: string, size: number) => text.length * size * 0.62;

export function wrap(text: string, width: number, size: number): string[] {
  const max = Math.max(6, Math.floor(width / (size * 0.62)));
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + ' ' + word).length > max) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

export function Lines({ x, y, lines, size = 20, gap, fill = INK, weight, anchor = 'start' }: { x: number; y: number; lines: string[]; size?: number; gap?: number; fill?: string; weight?: number; anchor?: 'start' | 'middle' | 'end' }) {
  const step = gap ?? Math.round(size * 1.25);
  return (
    <>
      {lines.map((line, i) => (
        <text key={i} x={x} y={y + i * step} fontSize={size} fill={fill} fontWeight={weight} textAnchor={anchor}>
          {line}
        </text>
      ))}
    </>
  );
}

/** A clickable device on a sheet. The box is the hit area and the selection outline. */
export function Device({ id, box, selected, onSelect, label, children }: { id: string; box: { x: number; y: number; w: number; h: number }; selected?: string | null; onSelect?: (id: string) => void; label: string; children: ReactNode }) {
  const on = selected === id;
  return (
    <g
      data-device={id}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={label}
      aria-pressed={onSelect ? on : undefined}
      style={onSelect ? { cursor: 'pointer' } : undefined}
      onClick={onSelect ? () => onSelect(id) : undefined}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(id);
              }
            }
          : undefined
      }
    >
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={on ? '#fdeee4' : '#fff'} fillOpacity={on ? 0.9 : 0.001} stroke={on ? SELECT : 'none'} strokeWidth={4} strokeDasharray={on ? '14 8' : undefined} rx={6} />
      {children}
    </g>
  );
}

export type SpecRow = [label: string, value: string];

export function specTableHeight(rows: SpecRow[], w: number, size = 16): number {
  const valueW = w * 0.55 - 16;
  const labelW = w * 0.45 - 16;
  return 38 + rows.reduce((sum, [l, v]) => sum + Math.max(wrap(v, valueW, size).length, wrap(l, labelW, size).length) * (size + 4) + 12, 0);
}

/** A small two-column specification table, titled, the way plan sets list each device. */
export function SpecTable({ x, y, w, title, rows, size = 16 }: { x: number; y: number; w: number; title: string; rows: SpecRow[]; size?: number }) {
  const split = x + w * 0.45;
  const valueW = w * 0.55 - 16;
  const labelW = w * 0.45 - 16;
  let cy = y + 38;
  const body = rows.map(([label, value], i) => {
    const vl = wrap(value, valueW, size);
    const ll = wrap(label, labelW, size);
    const h = Math.max(vl.length, ll.length) * (size + 4) + 12;
    const top = cy;
    cy += h;
    return (
      <g key={i}>
        <line x1={x} y1={top} x2={x + w} y2={top} stroke={INK} strokeWidth={1} />
        <Lines x={x + 8} y={top + size + 5} lines={ll} size={size} gap={size + 4} />
        <Lines x={split + 8} y={top + size + 5} lines={vl} size={size} gap={size + 4} fill={value === BY_ENGINEER || value === BY_UTILITY ? '#555' : INK} />
      </g>
    );
  });
  const titleLines = wrap(title, w - 16, 17);
  return (
    <g>
      <rect x={x} y={y} width={w} height={cy - y} fill="#fff" stroke={INK} strokeWidth={2} />
      <rect x={x} y={y} width={w} height={38} fill="#eee" stroke={INK} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + 25} fontSize={titleLines.length > 1 ? 14 : 17} fontWeight={700} textAnchor="middle" fill={INK}>
        {titleLines.length > 1 ? title : titleLines[0]}
      </text>
      {body}
      <line x1={split} y1={y + 38} x2={split} y2={cy} stroke={INK} strokeWidth={1} />
    </g>
  );
}

/** Feet and inches to the nearest eighth, as dimension strings print. */
export function feetInches(inches: number): string {
  const eighths = Math.round(inches * 8);
  const feet = Math.floor(eighths / 96);
  const rest = eighths - feet * 96;
  const whole = Math.floor(rest / 8);
  let frac = rest % 8;
  let den = 8;
  while (frac && frac % 2 === 0) {
    frac /= 2;
    den /= 2;
  }
  return `${feet}'-${whole}${frac ? ` ${frac}/${den}` : ''}"`;
}

export function SheetNote({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={96} fill="#fff" stroke={INK} strokeWidth={2} />
      <line x1={x} y1={y + 34} x2={x + w} y2={y + 34} stroke={INK} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + 25} fontSize={22} fontWeight={700} textAnchor="middle" fill={INK}>
        SHEET NOTES
      </text>
      <text x={x + 14} y={y + 72} fontSize={20} fill={INK}>
        1
      </text>
      <text x={x + 44} y={y + 72} fontSize={20} fill={INK}>
        {ELECTRICAL_SHEET_NOTE}
      </text>
    </g>
  );
}

/** A plan-set drawing title: the detail number in a circle, the title underlined, the scale under it. */
export function DrawingTitle({ x, y, n, title, scale }: { x: number; y: number; n: number; title: string; scale: string }) {
  const w = Math.max(textWidth(title, 28) + 40, 420);
  return (
    <g>
      <circle cx={x + 30} cy={y} r={30} fill="#fff" stroke={INK} strokeWidth={2.5} />
      <text x={x + 30} y={y + 11} fontSize={30} fontWeight={700} textAnchor="middle" fill={INK}>
        {n}
      </text>
      <text x={x + 80} y={y - 4} fontSize={28} fontWeight={700} fill={INK}>
        {title}
      </text>
      <line x1={x + 76} y1={y + 8} x2={x + 76 + w} y2={y + 8} stroke={INK} strokeWidth={3} />
      <text x={x + 80} y={y + 34} fontSize={18} fill={INK}>
        {`SCALE: ${scale}`}
      </text>
    </g>
  );
}

/** The title strip down the right edge, as the site plan sheet draws it, with the AHJ added. */
export function ElectricalTitleStrip({ design, sheet, title, synthetic, issued }: { design: ElectricalDesign; sheet: string; title: string[]; synthetic?: boolean; issued?: string }) {
  const x = STRIP.x;
  const w = STRIP.w;
  const [street, ...rest] = design.site.address.toUpperCase().split(',');
  const ahj = design.jurisdiction.ahj ? wrap(design.jurisdiction.ahj.toUpperCase(), w - 28, 15) : [BY_ENGINEER];
  return (
    <g>
      <rect x={x} y={40} width={w} height={SHEET_H - 80} fill="#fff" stroke={INK} strokeWidth={3} />
      <text x={x + w / 2} y={110} fontSize={20} fontWeight={700} textAnchor="middle" fill={INK}>
        BESS ELECTRICAL
      </text>
      <Lines x={x + w / 2} y={138} lines={wrap(design.configuration.name.toUpperCase(), w - 30, 15).slice(0, 3)} size={15} gap={20} anchor="middle" />
      {synthetic ? (
        <text x={x + w / 2} y={214} fontSize={18} fontWeight={700} textAnchor="middle" fill="#8a5a12">
          SYNTHETIC DATA
        </text>
      ) : null}

      <g transform={`translate(${x} 640)`}>
        <line x1={0} y1={0} x2={w} y2={0} stroke={INK} strokeWidth={1.5} />
        <text x={14} y={30} fontSize={18} fontWeight={700} fill={INK}>
          AHJ
        </text>
        <Lines x={14} y={58} lines={ahj.slice(0, 7)} size={15} gap={20} />
      </g>

      <g transform={`translate(${x} 900)`}>
        {['REV.', 'DATE', 'DESC.', 'BY'].map((h, i) => (
          <text key={h} x={14 + [0, 50, 160, 250][i]!} y={24} fontSize={14} fontWeight={700} fill={INK}>
            {h}
          </text>
        ))}
        <line x1={0} y1={34} x2={w} y2={34} stroke={INK} strokeWidth={1} />
        <text x={14} y={58} fontSize={14} fill={INK}>{`V${design.site.version}`}</text>
        <text x={64} y={58} fontSize={14} fill={INK}>
          {issued ?? ''}
        </text>
        <text x={174} y={58} fontSize={14} fill={INK}>
          SITE REC.
        </text>
        <text x={264} y={58} fontSize={14} fill={INK}>
          TOOL
        </text>
        <line x1={0} y1={0} x2={w} y2={0} stroke={INK} strokeWidth={1.5} />
        <line x1={0} y1={72} x2={w} y2={72} stroke={INK} strokeWidth={1.5} />
      </g>

      <g transform={`translate(${x + 150} 1650) rotate(-90)`}>
        <text fontSize={street && street.length > 22 ? 40 : 52} textAnchor="middle" fill={INK}>
          {street}
        </text>
        <text y={50} fontSize={32} textAnchor="middle" fill={INK}>
          {rest.join(',').trim()}
        </text>
      </g>

      <line x1={x} y1={2000} x2={x + w} y2={2000} stroke={INK} strokeWidth={2} />
      <text x={x + 14} y={2026} fontSize={14} fill={INK}>
        SHEET SIZE:
      </text>
      <text x={x + w / 2} y={2050} fontSize={20} textAnchor="middle" fill={INK}>
        {`24" x 36"`}
      </text>
      <text x={x + 14} y={2076} fontSize={14} fill={INK}>
        SHEET TITLE:
      </text>
      <Lines x={x + w / 2} y={2100} lines={title} size={title.some((t) => t.length > 18) ? 17 : 20} gap={22} anchor="middle" />
      <text x={x + w / 2} y={2148} fontSize={15} fontWeight={700} textAnchor="middle" fill={EXISTING}>
        NOT FOR CONSTRUCTION
      </text>
      <line x1={x} y1={2160} x2={x + w} y2={2160} stroke={INK} strokeWidth={2} />
      <text x={x + 14} y={2186} fontSize={14} fill={INK}>
        DRAWING NO.
      </text>
      <text x={x + w / 2} y={2290} fontSize={84} textAnchor="middle" fill={INK}>
        {sheet}
      </text>
    </g>
  );
}

export function SheetFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <svg className="electrical-sheet" viewBox={`0 0 ${SHEET_W} ${SHEET_H}`} fontFamily={FONT} role="img" aria-label={label} xmlns="http://www.w3.org/2000/svg">
      <rect x={0} y={0} width={SHEET_W} height={SHEET_H} fill="#fff" />
      <rect x={40} y={40} width={STRIP.x - 60} height={SHEET_H - 80} fill="none" stroke={INK} strokeWidth={3} />
      {children}
    </svg>
  );
}

// ------------------------------------------------------------------ what each device is

const amps = (n: number) => `${Math.round(n * 10) / 10}A`;
const sizeOf = (config: Configuration) => ({ ac: config.inverter.count * (config.inverter.model.ac?.kw ?? 0), kwh: config.battery.model.energyKwh ?? null });
export const modelName = (m: EquipmentModel) => `${m.manufacturer} ${m.model}`.toUpperCase();
const dims = (m: EquipmentModel) => (m.dimensionsIn ? `${m.dimensionsIn.w} × ${m.dimensionsIn.d} × ${m.dimensionsIn.h} IN` : BY_ENGINEER);

/** The new breaker and disconnect as the design sized them: the configuration's parts when they fit, else a rating and BY ENGINEER. */
export function switchingParts(design: ElectricalDesign, service: ServiceDesign) {
  const config = configurationOf(design);
  const part = (id: 'breaker' | 'disconnect', model: string, amps: number) => {
    const lines = service.items.find((i) => i.id === id)?.lines ?? [];
    const standard = lines.includes(model);
    const rated = Number(/^(\d+)\s*A/.exec(lines.find((l) => /^\d+\s*A/.test(l)) ?? '')?.[1] ?? amps);
    return { model: standard ? model : BY_ENGINEER, amps: standard ? amps : rated };
  };
  return { breaker: part('breaker', config.breaker.model, config.breaker.amps), disconnect: part('disconnect', config.disconnect.model, config.disconnect.amps) };
}

export function systemInformation(design: ElectricalDesign, service: ServiceDesign): SpecRow[] {
  const config = configurationOf(design);
  const size = sizeOf(config);
  return [
    ['AC SYSTEM SIZE', `${size.ac} KW`],
    ['INVERTER MODEL', `${config.inverter.count} × ${modelName(config.inverter.model)}`],
    ['DC SYSTEM SIZE', size.kwh ? `${size.kwh} KWH` : BY_ENGINEER],
    ['BESS', modelName(config.battery.model)],
    ['SERVICE', service.serviceLabel],
  ];
}

/** One specification table per device, existing side from the record, new side from the catalog. */
export function deviceSpecs(design: ElectricalDesign, service: ServiceDesign): { id: string; title: string; rows: SpecRow[] }[] {
  const config = configurationOf(design);
  const { inputs } = design;
  const inv = config.inverter.model;
  const bat = config.battery.model;
  const parts = switchingParts(design, service);
  const fault = inputs.faultCurrentA.value !== null ? `${inputs.faultCurrentA.value} A` : BY_UTILITY;
  return [
    {
      id: 'service-transformer',
      title: 'UTILITY SERVICE SPECIFICATIONS',
      rows: [
        ['UTILITY', inputs.utility.value?.toUpperCase() ?? BY_UTILITY],
        ['FEEDER', inputs.feeder.value?.toUpperCase() ?? BY_UTILITY],
        ['TRANSFORMER KVA', BY_UTILITY],
        ['TRANSFORMER IMPEDANCE', BY_UTILITY],
        ['AVAILABLE FAULT CURRENT', fault],
        ['UTILITY METER NO.', inputs.meterNumber.value?.toUpperCase() ?? BY_UTILITY],
      ],
    },
    {
      id: 'main-switchgear',
      title: 'MAIN DISTRIBUTION PANEL SPECIFICATIONS',
      rows: [
        ['SERVICE VOLTAGE', service.serviceLabel],
        ['MAIN BREAKER', inputs.mainBreakerA.value !== null ? `${inputs.mainBreakerA.value}A` : BY_ENGINEER],
        ['BUS RATING', inputs.busRatingA.value !== null ? `${inputs.busRatingA.value}A` : BY_ENGINEER],
        ['SHORT-CIRCUIT RATING', BY_ENGINEER],
      ],
    },
    {
      id: 'breaker',
      title: 'BATTERY STORAGE SYSTEM BREAKER SPECIFICATIONS',
      rows: [
        ['MODEL', parts.breaker.model],
        ['MAX AMPS', `${parts.breaker.amps}A`],
        ['POLES', '3'],
        ['MAX VOLTAGE', BY_ENGINEER],
        ['AIC RATING', BY_ENGINEER],
      ],
    },
    {
      id: 'disconnect',
      title: 'BATTERY SYSTEM ELECTRICAL DISCONNECT SPECIFICATIONS',
      rows: [
        ['MODEL', parts.disconnect.model],
        ['TYPE', config.disconnect.name],
        ['WEATHER RATING', BY_ENGINEER],
        ['MAX AMPS', `${parts.disconnect.amps}A`],
        ['MAX VOLTAGE', parts.disconnect.model === BY_ENGINEER ? BY_ENGINEER : `${config.disconnect.volts}V AC`],
      ],
    },
    {
      id: 'aux',
      title: 'AUXILIARY SYSTEMS DISCONNECT SPECIFICATIONS',
      rows: [
        ['MODEL', BY_ENGINEER],
        ['SERVES', 'BESS HEATING, COOLING, FIRE SUPPRESSION'],
        ['MAX AMPS', `${config.auxDisconnect.amps}A`],
        ['POLES', '3'],
      ],
    },
    {
      id: 'isolation-transformer',
      title: `${config.isolationTransformer.kva}KVA ISOLATION TRANSFORMER SPECIFICATIONS`,
      rows: [
        ['MANUFACTURER', BY_ENGINEER],
        ['RATING', `${config.isolationTransformer.kva} KVA`],
        ['PRIMARY (INVERTER)', config.isolationTransformer.primary],
        ['SECONDARY (SERVICE)', service.serviceLabel],
        ['WEATHER RATING', BY_ENGINEER],
        ['WEIGHT', BY_ENGINEER],
      ],
    },
    {
      id: 'inverters',
      title: 'INVERTER SPECIFICATIONS',
      rows: [
        ['MODEL', `${config.inverter.count} × ${modelName(inv)}`],
        ['AC POWER', inv.ac ? `${inv.ac.kw} KW` : BY_ENGINEER],
        ['MAX APPARENT POWER', inv.ac ? `${inv.ac.kva} KVA` : BY_ENGINEER],
        ['AC LINE VOLTAGE', inv.ac?.voltage.toUpperCase() ?? BY_ENGINEER],
        ['RATED AC CURRENT', inv.ac ? amps(inv.ac.ratedA) : BY_ENGINEER],
        ...(inv.ac?.maxInputA ? ([['MAX AC INPUT CURRENT', amps(inv.ac.maxInputA)]] as SpecRow[]) : []),
        ['DC VOLTAGE RANGE', inv.dc ? `${inv.dc.vMin}-${inv.dc.vMax} VDC` : BY_ENGINEER],
        ['MAX DC CURRENT', inv.dc?.maxA ? amps(inv.dc.maxA) : BY_ENGINEER],
        ['PEAK EFFICIENCY', inv.efficiencyPct ? `${inv.efficiencyPct}%` : BY_ENGINEER],
        ['ENCLOSURE', inv.enclosure?.toUpperCase() ?? BY_ENGINEER],
        ['DIMENSIONS (W × D × H)', dims(inv)],
        ['WEIGHT', inv.weightLb ? `${inv.weightLb} LB` : BY_ENGINEER],
        ['CERTIFICATIONS', inv.certifications.length ? inv.certifications.join(', ').toUpperCase() : BY_ENGINEER],
      ],
    },
    {
      id: 'bess',
      title: 'BESS SPECIFICATIONS',
      rows: [
        ['MODEL', modelName(bat)],
        ['NOMINAL ENERGY', bat.energyKwh ? `${bat.energyKwh} KWH` : BY_ENGINEER],
        ['NOMINAL VOLTAGE', BY_ENGINEER],
        ['OPERATING VOLTAGE RANGE', bat.dc ? `${bat.dc.vMin}-${bat.dc.vMax} VDC` : BY_ENGINEER],
        ['DC OUTPUTS', `${config.battery.outputs} × ${config.battery.outputKw} KW`],
        ['IP RATING', bat.enclosure?.toUpperCase() ?? BY_ENGINEER],
        ['DIMENSIONS (W × D × H)', dims(bat)],
        ['WEIGHT', bat.weightLb ? `${bat.weightLb} LB` : BY_ENGINEER],
      ],
    },
  ];
}

// Schedule endpoints by their tag, written out.
const ENDPOINT: Record<string, string> = { BESS: 'BESS', INV: 'INVERTER', XFMR: 'ISOLATION TRANSFORMER', DISC: 'BATTERY SYSTEM DISCONNECT', CB: 'BESS BREAKER IN MDP', AUX: 'AUX. DISCONNECT' };

export function scheduleRows(rows: ScheduleRow[]): { tag: number; from: string; to: string; conduit: string; conductor: string; neutral: string; ground: string }[] {
  return rows.map((row) => {
    const conductors = row.conductors.toUpperCase();
    const withNeutral = /,\s*PLUS NEUTRAL$/.test(conductors);
    const phase = conductors.replace(/,\s*PLUS NEUTRAL$/, '');
    return {
      tag: row.tag,
      from: ENDPOINT[row.from] ?? row.from,
      to: ENDPOINT[row.to] ?? row.to,
      conduit: row.conduit.toUpperCase(),
      conductor: phase,
      neutral: withNeutral ? phase.replace(/\s*PER PHASE$/, '') : 'N/A',
      ground: row.ground.toUpperCase(),
    };
  });
}

// ------------------------------------------------------------------ symbols

function GroundSymbol({ x, y, color = INK }: { x: number; y: number; color?: string }) {
  return (
    <g stroke={color} strokeWidth={2.5}>
      <line x1={x} y1={y} x2={x} y2={y + 30} />
      <line x1={x - 22} y1={y + 30} x2={x + 22} y2={y + 30} />
      <line x1={x - 14} y1={y + 38} x2={x + 14} y2={y + 38} />
      <line x1={x - 6} y1={y + 46} x2={x + 6} y2={y + 46} />
    </g>
  );
}

/** A circuit breaker on a vertical run: the arc between two terminals. */
function BreakerV({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g stroke={color} strokeWidth={3} fill="none">
      <circle cx={x} cy={y} r={5} fill={color} />
      <circle cx={x} cy={y + 60} r={5} fill={color} />
      <path d={`M${x + 4} ${y + 2} A 34 34 0 0 1 ${x + 4} ${y + 58}`} />
    </g>
  );
}

/** A circuit breaker on a horizontal run. */
function BreakerH({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g stroke={color} strokeWidth={3} fill="none">
      <circle cx={x} cy={y} r={5} fill={color} />
      <circle cx={x + 60} cy={y} r={5} fill={color} />
      <path d={`M${x + 2} ${y - 4} A 34 34 0 0 1 ${x + 58} ${y - 4}`} />
    </g>
  );
}

/** A disconnect switch in its enclosure, the blade open, on a vertical run. */
function DisconnectV({ x, y, color, fused = false }: { x: number; y: number; color: string; fused?: boolean }) {
  return (
    <g stroke={color} strokeWidth={3} fill="none">
      <rect x={x - 55} y={y} width={110} height={110} fill="#fff" />
      <line x1={x} y1={y} x2={x} y2={y + 25} />
      <circle cx={x} cy={y + 28} r={4} fill={color} />
      <line x1={x} y1={y + 70} x2={x + 30} y2={y + 32} />
      <circle cx={x} cy={y + 70} r={4} fill={color} />
      {fused ? <rect x={x - 8} y={y + 76} width={16} height={22} /> : null}
      <line x1={x} y1={fused ? y + 98 : y + 70} x2={x} y2={y + 110} />
    </g>
  );
}

/** A two-winding transformer: two circles on the run. */
function TransformerV({ x, y, color, r = 40, marks = false }: { x: number; y: number; color: string; r?: number; marks?: boolean }) {
  return (
    <g stroke={color} strokeWidth={3} fill="#fff">
      <circle cx={x} cy={y + r} r={r} />
      <circle cx={x} cy={y + 2.5 * r} r={r} fill="none" />
      {marks ? (
        <g fill="none" strokeWidth={2}>
          <path d={`M${x - 13} ${y + r + 8} L${x} ${y + r - 14} L${x + 13} ${y + r + 8} Z`} />
          <path d={`M${x} ${y + 2.6 * r} L${x} ${y + 2.6 * r + 14} M${x} ${y + 2.6 * r} L${x - 12} ${y + 2.6 * r - 10} M${x} ${y + 2.6 * r} L${x + 12} ${y + 2.6 * r - 10}`} />
        </g>
      ) : null}
    </g>
  );
}

function TransformerH({ x, y, color, r = 40 }: { x: number; y: number; color: string; r?: number }) {
  return (
    <g stroke={color} strokeWidth={3} fill="#fff">
      <circle cx={x + r} cy={y} r={r} />
      <circle cx={x + 2.5 * r} cy={y} r={r} fill="none" />
    </g>
  );
}

function Pole({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g stroke={color} strokeWidth={3} fill="none">
      <line x1={x} y1={y - 70} x2={x} y2={y + 90} strokeWidth={5} />
      <line x1={x - 50} y1={y - 50} x2={x + 50} y2={y - 50} />
      <circle cx={x - 40} cy={y - 58} r={5} fill={color} />
      <circle cx={x} cy={y - 58} r={5} fill={color} />
      <circle cx={x + 40} cy={y - 58} r={5} fill={color} />
    </g>
  );
}

/** An inverter: a box with its diagonal, AC on one side and DC on the other. */
function Inverter({ x, y, w, h, color }: { x: number; y: number; w: number; h: number; color: string }) {
  return (
    <g stroke={color} strokeWidth={3} fill="#fff">
      <rect x={x} y={y} width={w} height={h} />
      <line x1={x} y1={y + h} x2={x + w} y2={y} strokeWidth={2} />
      <path d={`M${x + 16} ${y + 30} q 12 -16 24 0 t 24 0`} fill="none" strokeWidth={2.5} />
      <line x1={x + w - 66} y1={y + h - 30} x2={x + w - 18} y2={y + h - 30} strokeWidth={2.5} />
      <line x1={x + w - 66} y1={y + h - 20} x2={x + w - 18} y2={y + h - 20} strokeWidth={2.5} strokeDasharray="9 6" />
    </g>
  );
}

function Battery({ x, y, w, h, color }: { x: number; y: number; w: number; h: number; color: string }) {
  const cx = x + w / 2;
  const cy = y + h / 2 - 2;
  return (
    <g stroke={color} strokeWidth={3} fill="#fff">
      <rect x={x} y={y} width={w} height={h} />
      {[-36, -12, 12, 36].map((dx, i) => (
        <line key={dx} x1={cx + dx} y1={cy - (i % 2 ? 16 : 34)} x2={cx + dx} y2={cy + (i % 2 ? 16 : 34)} strokeWidth={i % 2 ? 7 : 3} />
      ))}
      <text x={cx - 66} y={cy - 26} fontSize={26} fill={color} stroke="none">
        +
      </text>
      <text x={cx + 54} y={cy - 26} fontSize={26} fill={color} stroke="none">
        −
      </text>
    </g>
  );
}

/** A numbered conduit tag: an ellipse across the run, a leader, and the number in a circle. */
function ConduitTag({ x, y, tag, dx = -90, dy = -10, horizontal = false, selected, onSelect }: { x: number; y: number; tag: number; dx?: number; dy?: number; horizontal?: boolean; selected?: string | null; onSelect?: (id: string) => void }) {
  const cx = x + dx;
  const cy = y + dy;
  return (
    <Device id={`conduit-${tag}`} box={{ x: Math.min(x, cx) - 34, y: Math.min(y, cy) - 30, w: Math.abs(dx) + 68, h: Math.abs(dy) + 60 }} selected={selected} onSelect={onSelect} label={`Conduit ${tag}`}>
      <ellipse cx={x} cy={y} rx={horizontal ? 10 : 30} ry={horizontal ? 30 : 10} fill="none" stroke={INK} strokeWidth={2} />
      <line x1={x + (dx < 0 ? -30 : 30) * (horizontal ? 0.3 : 1)} y1={y} x2={cx + (dx < 0 ? 22 : -22)} y2={cy} stroke={INK} strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={22} fill="#fff" stroke={INK} strokeWidth={2} />
      <text x={cx} y={cy + 8} fontSize={22} fontWeight={700} textAnchor="middle" fill={INK}>
        {tag}
      </text>
    </Device>
  );
}

function Leader({ from, to, color = INK }: { from: { x: number; y: number }; to: { x: number; y: number }; color?: string }) {
  return (
    <g stroke={color} fill={color}>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} strokeWidth={1.5} />
      <circle cx={to.x} cy={to.y} r={5} stroke="none" />
    </g>
  );
}

// ------------------------------------------------------------------ the diagram

function Diagram({ design, service, selected, onSelect }: { design: ElectricalDesign; service: ServiceDesign; selected?: string | null; onSelect?: (id: string) => void }) {
  const config = configurationOf(design);
  const { inputs } = design;
  const sel = { selected, onSelect };
  const overhead = /overhead|pole/i.test(inputs.servicePath.value ?? '');
  const item = (id: string) => service.items.find((i) => i.id === id);
  const breaker = item('breaker');
  const disc = item('disconnect');
  const aux = item('aux');
  const precharge = /precharge/i.test(config.inverter.label);
  const count = Math.max(1, config.inverter.count);
  const busY = 330;
  const bx = 1375; // the BESS branch
  const label = 22;

  // Inverters spread under the isolation transformer.
  const invW = 170;
  const span = 380;
  const invXs = Array.from({ length: count }, (_, i) => bx - ((count - 1) * span) / 2 + i * span - 30);
  const splitY = 1222;
  const invY = 1290;
  const invH = 100;
  const preY = invY + invH + 22;
  const dcStart = precharge ? preY + 58 : invY + invH;
  const bess = { x: 1790, y: 1262, w: 300, h: 200 };
  const bessInputs = Array.from({ length: count }, (_, i) => bess.x + bess.w - 60 - i * ((bess.w - 120) / Math.max(1, count - 1 || 1)));

  return (
    <g>
      {/* service conductors, utility to the main distribution panel */}
      <g stroke={INK} strokeWidth={3}>
        <line x1={250} y1={busY} x2={overhead ? 360 : 470} y2={busY} />
        {overhead ? <line x1={420} y1={busY} x2={470} y2={busY} /> : null}
        <line x1={670} y1={busY} x2={796} y2={busY} />
        <line x1={864} y1={busY} x2={960} y2={busY} />
        <line x1={1020} y1={busY} x2={1110} y2={busY} />
        <line x1={1640} y1={busY} x2={1820} y2={busY} />
      </g>

      {/* utility grid */}
      <Device id="utility" box={{ x: 80, y: 230, w: 190, h: 290 }} {...sel} label="Utility grid">
        <circle cx={170} cy={busY} r={80} fill="#fff" stroke={EXISTING} strokeWidth={3} />
        <Lines x={170} y={busY - 6} lines={['UTILITY', 'GRID']} size={24} gap={30} anchor="middle" fill={EXISTING} />
        <Lines x={170} y={busY + 112} lines={wrap(inputs.utility.value?.toUpperCase() ?? `UTILITY ${BY_UTILITY}`, 180, label)} size={label} anchor="middle" fill={EXISTING} />
        <text x={170} y={busY + 112 + 26 * wrap(inputs.utility.value?.toUpperCase() ?? `UTILITY ${BY_UTILITY}`, 180, label).length} fontSize={label} textAnchor="middle" fill={EXISTING}>
          {inputs.feeder.value ? `FEEDER ${inputs.feeder.value.toUpperCase()}` : 'FEEDER BY UTILITY'}
        </text>
      </Device>

      {/* interconnecting pole */}
      {overhead ? (
        <Device id="pole" box={{ x: 320, y: 150, w: 130, h: 300 }} {...sel} label="Utility pole">
          <Pole x={390} y={busY} color={EXISTING} />
          <Lines x={390} y={190} lines={['(E) UTILITY', 'POLE']} size={label} anchor="middle" fill={EXISTING} />
          <GroundSymbol x={390} y={busY + 90} color={EXISTING} />
        </Device>
      ) : null}

      {/* utility transformer */}
      <Device id="service-transformer" box={{ x: 460, y: 160, w: 220, h: 290 }} {...sel} label="Utility transformer">
        <TransformerH x={470} y={busY} color={EXISTING} />
        <Lines x={570} y={200} lines={['(E) UTILITY', 'TRANSFORMER']} size={label} anchor="middle" fill={EXISTING} />
        <line x1={570} y1={busY + 40} x2={570} y2={busY + 60} stroke={EXISTING} strokeWidth={2.5} />
        <GroundSymbol x={570} y={busY + 60} color={EXISTING} />
        <text x={570} y={busY + 140} fontSize={18} textAnchor="middle" fill={EXISTING}>
          KVA BY UTILITY
        </text>
      </Device>

      {/* point of common coupling */}
      <Leader from={{ x: 720, y: 150 }} to={{ x: 720, y: busY }} />
      <text x={600} y={140} fontSize={label} fontWeight={700} fill={INK}>
        POINT OF COMMON COUPLING (PCC)
      </text>

      {/* main electrical switchgear */}
      <rect x={760} y={210} width={980} height={520} fill="none" stroke={EXISTING} strokeWidth={2.5} strokeDasharray="22 10" />
      <text x={1250} y={244} fontSize={24} fontWeight={700} textAnchor="middle" fill={EXISTING}>
        (E) MAIN ELECTRICAL SWITCHGEAR
      </text>

      <Device id="meter" box={{ x: 775, y: 280, w: 120, h: 210 }} {...sel} label="Utility meter">
        <circle cx={830} cy={busY} r={34} fill="#fff" stroke={EXISTING} strokeWidth={3} />
        <text x={830} y={busY + 9} fontSize={26} fontWeight={700} textAnchor="middle" fill={EXISTING}>
          M
        </text>
        <Lines x={772} y={busY + 64} lines={['(E) UTILITY', 'METER', inputs.meterNumber.value ? `NO. ${inputs.meterNumber.value}` : 'NO. BY UTILITY']} size={21} gap={25} fill={EXISTING} />
      </Device>

      <Device id="main-disconnect" box={{ x: 940, y: 280, w: 160, h: 190 }} {...sel} label="Main disconnect">
        <BreakerH x={960} y={busY} color={EXISTING} />
        <Lines x={1020} y={busY + 56} lines={['(E) MAIN', 'DISCONNECT', inputs.mainBreakerA.value !== null ? `${inputs.mainBreakerA.value}A` : BY_ENGINEER]} size={21} gap={25} anchor="middle" fill={EXISTING} />
      </Device>

      <Device id="main-switchgear" box={{ x: 1104, y: 266, w: 542, h: 132 }} {...sel} label="Main distribution panel">
        <rect x={1110} y={272} width={530} height={120} fill="#fff" stroke={EXISTING} strokeWidth={3} />
        <text x={1375} y={305} fontSize={22} fontWeight={700} textAnchor="middle" fill={EXISTING}>
          (E) MAIN DISTRIBUTION PANEL
        </text>
        <text x={1375} y={336} fontSize={18} textAnchor="middle" fill={EXISTING}>
          {service.serviceLabel}
        </text>
        <text x={1375} y={364} fontSize={18} textAnchor="middle" fill={EXISTING}>
          {`BUS ${inputs.busRatingA.value !== null ? `${inputs.busRatingA.value}A` : BY_ENGINEER}`}
        </text>
      </Device>

      <Device id="load" box={{ x: 1760, y: 250, w: 140, h: 200 }} {...sel} label="Building load">
        <circle cx={1830} cy={busY} r={62} fill="#fff" stroke={EXISTING} strokeWidth={3} />
        <text x={1830} y={busY + 9} fontSize={24} textAnchor="middle" fill={EXISTING}>
          LOAD
        </text>
        <Lines x={1830} y={busY + 96} lines={['(E) BUILDING', 'LOAD']} size={21} gap={25} anchor="middle" fill={EXISTING} />
      </Device>

      {/* the BESS branch, down from the panel */}
      <g stroke={INK} strokeWidth={3}>
        <line x1={bx} y1={392} x2={bx} y2={470} />
        <line x1={bx} y1={530} x2={bx} y2={860} />
        <line x1={bx} y1={970} x2={bx} y2={1060} />
        <line x1={bx} y1={1200} x2={bx} y2={splitY} />
        <line x1={invXs[0]! + invW / 2} y1={splitY} x2={invXs.at(-1)! + invW / 2} y2={splitY} />
        {invXs.map((x) => (
          <line key={x} x1={x + invW / 2} y1={splitY} x2={x + invW / 2} y2={invY} />
        ))}
      </g>

      <Device id="breaker" box={{ x: 1340, y: 450, w: 390, h: 140 }} {...sel} label="Battery storage system breaker">
        <BreakerV x={bx} y={470} color={NEW} />
        <Lines x={1430} y={482} lines={['(N) BATTERY STORAGE', 'SYSTEM BREAKER', ...(breaker?.lines ?? []).flatMap((l) => wrap(l, 300, 21))]} size={21} gap={25} fill={NEW} />
      </Device>

      {/* point of interconnection */}
      <Leader from={{ x: 1492, y: 766 }} to={{ x: bx + 8, y: 530 }} />
      <text x={1500} y={780} fontSize={label} fontWeight={700} fill={INK}>
        POINT OF INTERCONNECTION (POI)
      </text>

      <ConduitTag x={bx} y={790} tag={4} {...sel} />

      {/* the equipment pad */}
      <rect x={640} y={830} width={1510} height={770} fill="none" stroke={NEW} strokeWidth={2.5} strokeDasharray="22 10" />
      <text x={2130} y={866} fontSize={22} fontWeight={700} textAnchor="end" fill={NEW}>
        (N) CONCRETE EQUIPMENT PAD
      </text>

      <Device id="disconnect" box={{ x: 1310, y: 850, w: 520, h: 130 }} {...sel} label="Battery system electrical disconnect">
        <DisconnectV x={bx} y={860} color={NEW} fused={/HF/.test(config.disconnect.model)} />
        <Lines x={1450} y={900} lines={['(N) BATTERY SYSTEM ELECTRICAL', 'DISCONNECT', ...(disc?.lines ?? [])]} size={21} gap={25} fill={NEW} />
      </Device>

      <ConduitTag x={bx} y={1035} tag={3} {...sel} />

      {/* auxiliary disconnect, fed from the disconnect's load side */}
      {aux ? (
        <>
          <g stroke={INK} strokeWidth={3} fill="none">
            <circle cx={bx} cy={995} r={6} fill={INK} />
            <polyline points={`${bx},995 ${bess.x + 150},995 ${bess.x + 150},1060`} />
            <line x1={bess.x + 150} y1={1170} x2={bess.x + 150} y2={bess.y} />
          </g>
          <Device id="aux" box={{ x: 1540, y: 1040, w: 520, h: 150 }} {...sel} label="Auxiliary disconnect">
            <DisconnectV x={bess.x + 150} y={1060} color={NEW} />
            <Lines x={bess.x + 82} y={1090} lines={['(N) AUXILIARY', 'DISCONNECT', ...aux.lines]} size={21} gap={25} anchor="end" fill={NEW} />
          </Device>
        </>
      ) : null}

      <Device id="isolation-transformer" box={{ x: 900, y: 1050, w: 520, h: 160 }} {...sel} label="Isolation transformer">
        <TransformerV x={bx} y={1060} color={NEW} r={35} marks />
        <Lines
          x={bx - 54}
          y={1090}
          lines={[`(N) ${config.isolationTransformer.kva} KVA ISOLATION`, 'TRANSFORMER', `${config.isolationTransformer.primary} -`, service.serviceLabel.replace(/, 3-PHASE, 4-WIRE$/, ' 3Ø 4W')]}
          size={18}
          gap={22}
          anchor="end"
          fill={NEW}
        />
      </Device>

      {invXs.map((x, i) => (
        <ConduitTag key={`t2-${i}`} x={x + invW / 2} y={invY - 34} tag={2} dx={i === 0 ? -80 : 80} dy={0} {...sel} />
      ))}

      <Device id="inverters" box={{ x: invXs[0]! - 10, y: invY - 10, w: invXs.at(-1)! - invXs[0]! + invW + 20, h: invH + 20 }} {...sel} label="Inverters">
        {invXs.map((x) => (
          <Inverter key={x} x={x} y={invY} w={invW} h={invH} color={NEW} />
        ))}
      </Device>
      <Lines x={invXs[0]! - 16} y={invY + 26} lines={[`(N) ${count} × ${config.inverter.name}`, ...wrap(config.inverter.label, 330, 21), ...wrap(item('inverters')?.lines[1] ?? '', 330, 21)]} size={21} gap={25} anchor="end" fill={NEW} />
      {invXs.map((x, i) => (
        <text key={`inv-${i}`} x={i === 0 ? x + invW - 4 : x + 4} y={invY - 10} fontSize={20} fontWeight={700} textAnchor={i === 0 ? 'end' : 'start'} fill={NEW}>
          {`INV-${i + 1}`}
        </text>
      ))}

      {precharge ? (
        <Device id="precharge" box={{ x: invXs[0]! - 10, y: preY - 10, w: invXs.at(-1)! - invXs[0]! + invW + 20, h: 78 }} {...sel} label="DC precharge units">
          {invXs.map((x) => (
            <g key={x}>
              <line x1={x + invW / 2} y1={invY + invH} x2={x + invW / 2} y2={preY} stroke={NEW} strokeWidth={3} />
              <rect x={x} y={preY} width={invW} height={58} fill="#fff" stroke={NEW} strokeWidth={3} />
              <Lines x={x + invW / 2} y={preY + 24} lines={['DC PRECHARGE', 'UNIT']} size={16} gap={20} anchor="middle" fill={NEW} />
            </g>
          ))}
        </Device>
      ) : null}

      {/* DC runs to the battery, each to its own input */}
      {invXs.map((x, i) => {
        const y = dcStart + 50 + (count - 1 - i) * 36;
        const ix = bessInputs[i]!;
        return (
          <g key={`dc-${i}`}>
            <polyline points={`${x + invW / 2},${dcStart} ${x + invW / 2},${y} ${ix},${y} ${ix},${bess.y + bess.h}`} fill="none" stroke={INK} strokeWidth={3} />
            <ConduitTag x={x + invW / 2} y={dcStart + 24} tag={1} dx={-72} dy={6} {...sel} />
          </g>
        );
      })}

      <Device id="bess" box={{ x: bess.x - 10, y: bess.y - 10, w: bess.w + 20, h: bess.h + 20 }} {...sel} label="Battery energy storage system">
        <Battery {...bess} color={NEW} />
        <Lines x={bess.x + bess.w / 2} y={bess.y + 30} lines={['(N) BESS']} size={20} anchor="middle" fill={NEW} weight={700} />
        <Lines x={bess.x + bess.w / 2} y={bess.y + bess.h - 34} lines={item('bess')?.lines ?? []} size={16} gap={20} anchor="middle" fill={NEW} />
      </Device>
      <GroundSymbol x={bess.x + bess.w + 30} y={bess.y + bess.h / 2} color={NEW} />
      <line x1={bess.x + bess.w} y1={bess.y + bess.h / 2} x2={bess.x + bess.w + 30} y2={bess.y + bess.h / 2} stroke={NEW} strokeWidth={2.5} />
    </g>
  );
}

// ------------------------------------------------------------------ tables

function ConduitSchedule({ x, y, w, service, selected, onSelect }: { x: number; y: number; w: number; service: ServiceDesign; selected?: string | null; onSelect?: (id: string) => void }) {
  const cols = [
    { key: 'tag', label: 'TAG', w: 80 },
    { key: 'from', label: 'FROM', w: 200 },
    { key: 'to', label: 'TO', w: 200 },
    { key: 'conduit', label: 'CONDUIT SIZE', w: 330 },
    { key: 'conductor', label: 'CONDUCTOR', w: 520 },
    { key: 'neutral', label: 'NEUTRAL', w: 380 },
    { key: 'ground', label: 'GROUND', w: 0 },
  ] as const;
  const fixed = cols.reduce((s, c) => s + c.w, 0);
  const widths = cols.map((c) => (c.w || w - fixed));
  const size = 17;
  const rows = scheduleRows(service.schedule);
  let cy = y + 76;
  const body = rows.map((row) => {
    const cells = cols.map((c, i) => wrap(String(row[c.key]), widths[i]! - 16, size));
    const h = Math.max(...cells.map((l) => l.length)) * (size + 5) + 14;
    const top = cy;
    cy += h;
    let cx = x;
    return (
      <Device key={row.tag} id={`conduit-${row.tag}`} box={{ x, y: top, w, h }} selected={selected} onSelect={onSelect} label={`Conduit ${row.tag} schedule row`}>
        <line x1={x} y1={top} x2={x + w} y2={top} stroke={INK} strokeWidth={1} />
        {cells.map((lines, i) => {
          const at = cx;
          cx += widths[i]!;
          return <Lines key={i} x={at + widths[i]! / 2} y={top + size + 8} lines={lines} size={size} gap={size + 5} anchor="middle" />;
        })}
      </Device>
    );
  });
  let hx = x;
  return (
    <g>
      <rect x={x} y={y} width={w} height={cy - y} fill="#fff" stroke={INK} strokeWidth={2} />
      <text x={x + w / 2} y={y + 28} fontSize={22} fontWeight={700} textAnchor="middle" fill={INK}>
        CONDUIT SCHEDULE
      </text>
      <rect x={x} y={y + 40} width={w} height={36} fill="#eee" stroke={INK} strokeWidth={1.5} />
      {cols.map((c, i) => {
        const at = hx;
        hx += widths[i]!;
        return (
          <g key={c.key}>
            <text x={at + widths[i]! / 2} y={y + 65} fontSize={17} fontWeight={700} textAnchor="middle" fill={INK}>
              {c.label}
            </text>
            {i > 0 ? <line x1={at} y1={y + 40} x2={at} y2={cy} stroke={INK} strokeWidth={1} /> : null}
          </g>
        );
      })}
      {body}
    </g>
  );
}

function Legend({ x, y, w }: { x: number; y: number; w: number }) {
  const rows: [ReactNode, string][] = [
    [<line x1={0} y1={0} x2={70} y2={0} stroke={EXISTING} strokeWidth={3} />, '(E) EXISTING EQUIPMENT'],
    [<line x1={0} y1={0} x2={70} y2={0} stroke={NEW} strokeWidth={3} />, '(N) NEW EQUIPMENT'],
    [
      <g>
        <ellipse cx={20} cy={0} rx={22} ry={8} fill="none" stroke={INK} strokeWidth={2} />
        <circle cx={60} cy={0} r={14} fill="#fff" stroke={INK} strokeWidth={2} />
      </g>,
      'CONDUIT TAG, SEE CONDUIT SCHEDULE',
    ],
  ];
  return (
    <g>
      <rect x={x} y={y} width={w} height={34 + rows.length * 36 + 10} fill="#fff" stroke={INK} strokeWidth={2} />
      <text x={x + w / 2} y={y + 25} fontSize={20} fontWeight={700} textAnchor="middle" fill={INK}>
        LEGEND
      </text>
      <line x1={x} y1={y + 34} x2={x + w} y2={y + 34} stroke={INK} strokeWidth={1.5} />
      {rows.map(([sym, text], i) => (
        <g key={text} transform={`translate(${x + 20} ${y + 60 + i * 36})`}>
          {sym}
          <text x={100} y={6} fontSize={17} fill={INK}>
            {text}
          </text>
        </g>
      ))}
    </g>
  );
}

export function SystemInformation({ x, y, w, rows }: { x: number; y: number; w: number; rows: SpecRow[] }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={60 + rows.length * 36} fill="#fff" stroke={INK} strokeWidth={2} />
      <text x={x + 18} y={y + 36} fontSize={24} fontWeight={700} fill={INK} textDecoration="underline">
        SYSTEM INFORMATION
      </text>
      {rows.map(([label, value], i) => (
        <text key={label} x={x + 18} y={y + 76 + i * 36} fontSize={20} fill={INK}>
          <tspan fontWeight={700}>{`${label}: `}</tspan>
          {value}
        </text>
      ))}
    </g>
  );
}

// ------------------------------------------------------------------ the sheet

export function SingleLineSheet({ design, service: index = 0, synthetic, issued, selected, onSelect }: ElectricalSheetProps) {
  const service = serviceOf(design, index);
  const sel = { selected, onSelect };
  const specs = deviceSpecs(design, service);
  const system = systemInformation(design, service);

  // The right column: system information, then the device tables in two columns.
  const right = { x: 2200, w: 1010 };
  const colW = (right.w - 20) / 2;
  const sysH = 60 + system.length * 36;
  const tops = [70 + sysH + 24, 70 + sysH + 24];
  const placed = specs.map((spec) => {
    const h = specTableHeight(spec.rows, colW);
    const col = tops[0]! <= tops[1]! ? 0 : 1;
    const at = { x: right.x + col * (colW + 20), y: tops[col]!, h };
    tops[col] = tops[col]! + h + 20;
    return { spec, at };
  });

  return (
    <SheetFrame label="E-100 single line diagram">
      <Diagram design={design} service={service} {...sel} />
      <DrawingTitle x={80} y={1660} n={1} title="SINGLE LINE DIAGRAM" scale="NTS" />

      <ConduitSchedule x={70} y={1740} w={2090} service={service} {...sel} />

      <SheetNote x={70} y={2230} w={1100} />
      <Legend x={1200} y={2180} w={700} />

      <Device id="system" box={{ x: right.x - 4, y: 66, w: right.w + 8, h: sysH + 8 }} {...sel} label="System information">
        <SystemInformation x={right.x} y={70} w={right.w} rows={system} />
      </Device>
      {placed.map(({ spec, at }) => (
        <Device key={spec.id} id={spec.id} box={{ x: at.x - 4, y: at.y - 4, w: colW + 8, h: at.h + 8 }} {...sel} label={spec.title}>
          <SpecTable x={at.x} y={at.y} w={colW} title={spec.title} rows={spec.rows} />
        </Device>
      ))}

      <ElectricalTitleStrip design={design} sheet="E-100" title={['SINGLE LINE', 'DIAGRAM']} synthetic={synthetic} issued={issued} />
    </SheetFrame>
  );
}
