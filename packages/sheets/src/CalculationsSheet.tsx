// E-200 electrical calculations, laid out like the supplied plan set's calculation sheet:
// the connections listed first, then one block per numbered connection with its
// specifications, the sizing steps, the 2023 NEC citation, and the result.

import type { Calculation, ElectricalDesign, ServiceDesign } from '@eqore/electrical';
import {
  BY_ENGINEER,
  BY_UTILITY,
  CONTENT,
  Device,
  DrawingTitle,
  ElectricalTitleStrip,
  EXISTING,
  INK,
  Lines,
  SheetFrame,
  SheetNote,
  configurationOf,
  drawingText,
  hasHedge,
  modelName,
  scheduleRows,
  serviceOf,
  wrap,
  type ElectricalSheetProps,
} from './SingleLineSheet.tsx';

export const STATUS_TEXT: Record<Calculation['status'], string> = {
  passes: 'PASS',
  fails: 'FAIL',
  needs_input: 'INPUT NEEDED',
  over_recommendation: 'OVER 3% RECOMMENDATION',
};
const STATUS_COLOR: Record<Calculation['status'], string> = { passes: '#1d6b2c', fails: EXISTING, needs_input: '#8a5a00', over_recommendation: '#8a5a00' };

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** The specifications each calculation block lists, from the configuration and the record. */
export function calculationSpecs(design: ElectricalDesign, service: ServiceDesign, calc: Calculation): [string, string][] {
  const config = configurationOf(design);
  const inv = config.inverter.model;
  const bat = config.battery.model;
  const unit = inv.ac;
  const designA = unit ? Math.max(unit.ratedA, unit.maxInputA ?? 0) : 0;
  const atService = unit ? config.inverter.count * designA * (unit.nominalV / service.serviceVoltage) : 0;
  const { inputs } = design;
  switch (calc.id) {
    case 'dc-window':
      return [
        ['BATTERY DC RANGE', bat.dc ? `${bat.dc.vMin}-${bat.dc.vMax} VDC` : BY_ENGINEER],
        ['INVERTER DC RANGE', inv.dc ? `${inv.dc.vMin}-${inv.dc.vMax} VDC` : BY_ENGINEER],
      ];
    case 'dc':
      return [
        ['VOLTAGE', bat.dc ? `${bat.dc.vMin}-${bat.dc.vMax} VDC, SIZED AT ${bat.dc.vMin} VDC MINIMUM` : BY_ENGINEER],
        ['MAX CONTINUOUS CURRENT', bat.dc ? `${round((config.battery.outputKw * 1000) / bat.dc.vMin)} A PER OUTPUT` : BY_ENGINEER],
        ['CONFIGURATION', `${config.battery.outputs} HIGH-VOLTAGE OUTPUTS × ${config.battery.outputKw} KW, ONE + AND ONE − CONDUCTOR EACH`],
      ];
    case 'inverter-ac':
      return [
        ['VOLTAGE', unit ? `${unit.voltage.toUpperCase()}, ${config.isolationTransformer.primary}` : BY_ENGINEER],
        ['MAX CONTINUOUS CURRENT', unit ? `${designA} A PER INVERTER` : BY_ENGINEER],
        ['CONFIGURATION', `${config.inverter.count} × ${modelName(inv)} IN PARALLEL, LANDED ON THE ISOLATION TRANSFORMER PRIMARY`],
      ];
    case 'xfmr-disc':
    case 'disc-cb':
      return [
        ['VOLTAGE', service.serviceLabel],
        ['MAX CONTINUOUS CURRENT', `${round(atService)} A (${config.inverter.count} INVERTERS)`],
        ['CONFIGURATION', calc.id === 'xfmr-disc' ? 'TRANSFORMER SECONDARY, 3 PHASES AND NEUTRAL' : '3 PHASES, 3-POLE DISCONNECT TO 3-POLE BREAKER'],
      ];
    case 'xfmr':
      return [
        ['PRIMARY', config.isolationTransformer.primary],
        ['SECONDARY', service.serviceLabel],
        ['RATING', `${config.isolationTransformer.kva} KVA`],
      ];
    case 'busbar':
      return [
        ['MAIN BREAKER', inputs.mainBreakerA.value !== null ? `${inputs.mainBreakerA.value} A` : BY_ENGINEER],
        ['BUS RATING', inputs.busRatingA.value !== null ? `${inputs.busRatingA.value} A` : BY_ENGINEER],
        ['BACKFEED BREAKER', `${config.breaker.amps} A, 3-POLE`],
      ];
    case 'voltage-drop':
      return [
        ['VOLTAGE', service.serviceLabel],
        ['RUN LENGTH', inputs.runLengthFt.value !== null ? `${inputs.runLengthFt.value} FT` : BY_ENGINEER],
        ['CURRENT', `${round(atService)} A`],
      ];
    case 'fault-current':
      return [['AVAILABLE FAULT CURRENT', inputs.faultCurrentA.value !== null ? `${inputs.faultCurrentA.value} A` : BY_UTILITY]];
    default:
      return [];
  }
}

const SIZE = 23;
const LINE = SIZE + 6;
const COL_W = 990;
const TEXT_W = COL_W - 40;

type Block = { calc: Calculation; lines: { text: string; bold?: boolean; indent?: number; size?: number; color?: string }[]; height: number };

function blockFor(design: ElectricalDesign, service: ServiceDesign, calc: Calculation): Block {
  const lines: Block['lines'] = [];
  const push = (text: string, opts: Omit<Block['lines'][number], 'text'> = {}) => {
    for (const l of wrap(text, TEXT_W - (opts.indent ?? 0), opts.size ?? SIZE)) lines.push({ text: l, ...opts });
  };
  const specs = calculationSpecs(design, service, calc);
  if (specs.length) {
    push('SPECIFICATIONS:', { bold: true });
    for (const [label, value] of specs) push(`- ${label}: ${value}`, { indent: 16 });
  }
  push('CALCULATION:', { bold: true });
  for (const step of calc.steps.map(drawingText).filter((t) => !hasHedge(t))) push(step.toUpperCase(), { indent: 16 });
  push(`PER ${drawingText(calc.citation).toUpperCase()}`, { size: 20, color: '#333' });
  push(`RESULT: ${drawingText(calc.result).toUpperCase()}`, { bold: true });
  if (calc.note && !hasHedge(calc.note)) push(drawingText(calc.note).toUpperCase(), { size: 20 });
  const title = wrap(drawingText(calc.title), TEXT_W - 300, 22).length;
  return { calc, lines, height: 20 + title * 28 + 16 + lines.reduce((s, l) => s + (l.size ? l.size + 6 : LINE), 0) + 24 };
}

function CalcBlock({ x, y, block, selected, onSelect }: { x: number; y: number; block: Block; selected?: string | null; onSelect?: (id: string) => void }) {
  const { calc } = block;
  const title = wrap(drawingText(calc.title), TEXT_W - 300, 22);
  let cy = y + 30 + title.length * 28 + 10;
  const status = STATUS_TEXT[calc.status];
  const badgeW = status.length * 13 + 30;
  return (
    <Device id={`calc-${calc.id}`} box={{ x: x - 6, y: y - 4, w: COL_W + 12, h: block.height }} selected={selected} onSelect={onSelect} label={`${calc.title}: ${status}`}>
      <line x1={x} y1={y} x2={x + COL_W} y2={y} stroke={INK} strokeWidth={1.5} />
      <Lines x={x} y={y + 34} lines={title} size={22} gap={28} weight={700} />
      <rect x={x + COL_W - badgeW} y={y + 12} width={badgeW} height={32} fill="#fff" stroke={STATUS_COLOR[calc.status]} strokeWidth={2.5} />
      <text x={x + COL_W - badgeW / 2} y={y + 35} fontSize={18} fontWeight={700} textAnchor="middle" fill={STATUS_COLOR[calc.status]}>
        {status}
      </text>
      {block.lines.map((l, i) => {
        const at = cy;
        cy += l.size ? l.size + 6 : LINE;
        return (
          <text key={i} x={x + (l.indent ?? 0)} y={at + (l.size ?? SIZE)} fontSize={l.size ?? SIZE} fontWeight={l.bold ? 700 : undefined} fill={l.color ?? (l.bold && l.text.startsWith('RESULT') ? STATUS_COLOR[calc.status] : INK)}>
            {l.text}
          </text>
        );
      })}
    </Device>
  );
}

export function CalculationsSheet({ design, service: index = 0, synthetic, issued, selected, onSelect }: ElectricalSheetProps) {
  const service = serviceOf(design, index);
  const config = configurationOf(design);
  const cols = [CONTENT.x + 10, CONTENT.x + 10 + COL_W + 50, CONTENT.x + 10 + 2 * (COL_W + 50)];
  const bottom = 2190;

  // The connections list and the codes block head the first column.
  const connections = scheduleRows(service.schedule).map((row) => `${row.tag}. ${row.from} TO ${row.to} - ${row.tag === 1 ? 'DC' : 'AC'} CONNECTION`);
  const intro = wrap(`SIZED FROM THE MANUFACTURERS' PUBLISHED RATINGS AND THE 2023 NEC FOR THE ${design.configuration.name.toUpperCase()}: ${config.inverter.count} × ${modelName(config.inverter.model)} WITH ${modelName(config.battery.model)}.`, TEXT_W, SIZE);
  const codes: [string, string][] = [
    ['AHJ', design.jurisdiction.ahj?.toUpperCase() ?? BY_ENGINEER],
    ...design.jurisdiction.codes.map((c) => [c.code.toUpperCase(), c.basis.toUpperCase()] as [string, string]),
    ['CALCULATION TABLES', 'NFPA 70 (NEC), 2023 EDITION'],
  ];
  const codeLines = codes.map(([k, v]) => ({ k: wrap(k, 330, 17), v: wrap(v, TEXT_W - 360, 17) }));
  const codesH = 44 + codeLines.reduce((s, c) => s + Math.max(c.k.length, c.v.length) * 22 + 14, 0);
  let y = 110;
  const introTop = y;
  y += 40 + intro.length * LINE + 20;
  const connTop = y;
  y += 34 + connections.length * LINE + 30;
  const codesTop = y;
  y += codesH + 64;

  const placed: { x: number; y: number; block: Block }[] = [];
  let col = 0;
  for (const calc of service.calculations) {
    const block = blockFor(design, service, calc);
    if (y + block.height > bottom && col < 2) {
      col += 1;
      y = 110;
    }
    placed.push({ x: cols[col]!, y, block });
    y += block.height + 16;
  }

  return (
    <SheetFrame label="E-200 electrical calculations">
      <text x={cols[0]} y={introTop + 26} fontSize={30} fontWeight={700} fill={INK}>
        CONDUCTOR SIZING CALCULATIONS
      </text>
      <Lines x={cols[0]!} y={introTop + 66} lines={intro} size={SIZE} gap={LINE} />
      <text x={cols[0]} y={connTop + 24} fontSize={24} fontWeight={700} fill={INK}>
        CONNECTIONS:
      </text>
      <Lines x={cols[0]! + 16} y={connTop + 24 + LINE + 6} lines={connections} size={SIZE} gap={LINE} />

      <g>
        <rect x={cols[0]} y={codesTop} width={COL_W} height={codesH} fill="#fff" stroke={INK} strokeWidth={2} />
        <rect x={cols[0]} y={codesTop} width={COL_W} height={38} fill="#eee" stroke={INK} strokeWidth={1.5} />
        <text x={cols[0]! + COL_W / 2} y={codesTop + 26} fontSize={19} fontWeight={700} textAnchor="middle" fill={INK}>
          AUTHORITY HAVING JURISDICTION AND APPLICABLE CODES
        </text>
        {(() => {
          let cy = codesTop + 38;
          return codeLines.map((c, i) => {
            const top = cy;
            cy += Math.max(c.k.length, c.v.length) * 22 + 14;
            return (
              <g key={i}>
                <line x1={cols[0]} y1={top} x2={cols[0]! + COL_W} y2={top} stroke={INK} strokeWidth={1} />
                <Lines x={cols[0]! + 10} y={top + 25} lines={c.k} size={17} gap={22} weight={700} />
                <Lines x={cols[0]! + 360} y={top + 25} lines={c.v} size={17} gap={22} />
              </g>
            );
          });
        })()}
        <line x1={cols[0]! + 350} y1={codesTop + 38} x2={cols[0]! + 350} y2={codesTop + codesH} stroke={INK} strokeWidth={1} />
      </g>

      <text x={cols[0]} y={codesTop + codesH + 42} fontSize={24} fontWeight={700} fill={INK}>
        CONNECTION-BY-CONNECTION ANALYSIS
      </text>

      {placed.map((p) => (
        <CalcBlock key={p.block.calc.id} x={p.x} y={p.y} block={p.block} selected={selected} onSelect={onSelect} />
      ))}

      <DrawingTitle x={cols[0]!} y={2250} n={1} title="ELECTRICAL CALCULATIONS" scale="NTS" />
      <SheetNote x={cols[1]! + 100} y={2220} w={1100} />
      <text x={cols[2]! + COL_W} y={2300} fontSize={20} textAnchor="end" fill={INK}>
        {`SERVICE: ${service.serviceLabel}`}
      </text>

      <ElectricalTitleStrip design={design} sheet="E-200" title={['ELECTRICAL', 'CALCULATIONS']} synthetic={synthetic} issued={issued} />
    </SheetFrame>
  );
}
