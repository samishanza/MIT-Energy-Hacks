// E-300 equipment elevations: front and side elevations of the new equipment at 3/4" = 1'-0"
// from the catalog's published dimensions, and a plan of the equipment pad. Equipment the
// catalog has no dimensions for is drawn as an outline marked NOT TO SCALE.

import type { EquipmentModel } from '@eqore/electrical';
import {
  BY_ENGINEER,
  Device,
  DrawingTitle,
  ElectricalTitleStrip,
  INK,
  Lines,
  NEW,
  SheetFrame,
  SheetNote,
  configurationOf,
  serviceOf,
  switchingParts,
  feetInches,
  modelName,
  wrap,
  type ElectricalSheetProps,
} from './SingleLineSheet.tsx';

// 3/4" = 1'-0": 75 sheet units per foot.
const PER_FT = 75;
const PER_IN = PER_FT / 12;
export const PAD_FT = { w: 14, d: 11.5 };
const GRADE = 900;

type Sel = { selected?: string | null; onSelect?: (id: string) => void };

/** A dimension string: extension lines, the dimension line with ticks, the text. */
function Dim({ x1, y1, x2, y2, text, offset = 0 }: { x1: number; y1: number; x2: number; y2: number; text: string; offset?: number }) {
  const vertical = x1 === x2;
  const tick = (x: number, y: number) => <line x1={x - 9} y1={y + 9} x2={x + 9} y2={y - 9} stroke={INK} strokeWidth={2.5} />;
  if (vertical) {
    const x = x1 + offset;
    return (
      <g>
        <line x1={x1} y1={y1} x2={x - 10} y2={y1} stroke={INK} strokeWidth={1} />
        <line x1={x1} y1={y2} x2={x - 10} y2={y2} stroke={INK} strokeWidth={1} />
        <line x1={x} y1={y1} x2={x} y2={y2} stroke={INK} strokeWidth={1.5} />
        {tick(x, y1)}
        {tick(x, y2)}
        <text x={x - 10} y={(y1 + y2) / 2} fontSize={19} textAnchor="middle" fill={INK} transform={`rotate(-90 ${x - 10} ${(y1 + y2) / 2})`}>
          {text}
        </text>
      </g>
    );
  }
  const y = y1 + offset;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x1} y2={y + (offset < 0 ? -10 : 10)} stroke={INK} strokeWidth={1} />
      <line x1={x2} y1={y1} x2={x2} y2={y + (offset < 0 ? -10 : 10)} stroke={INK} strokeWidth={1} />
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={INK} strokeWidth={1.5} />
      {tick(x1, y)}
      {tick(x2, y)}
      <text x={(x1 + x2) / 2} y={y - 10} fontSize={19} textAnchor="middle" fill={INK}>
        {text}
      </text>
    </g>
  );
}

function Tag({ x, y, text }: { x: number; y: number; text: string }) {
  const w = Math.max(70, text.length * 14 + 24);
  return (
    <g>
      <rect x={x - w / 2} y={y - 20} width={w} height={40} rx={20} fill="#fff" stroke={NEW} strokeWidth={2.5} />
      <text x={x} y={y + 7} fontSize={20} fontWeight={700} textAnchor="middle" fill={NEW}>
        {text}
      </text>
    </g>
  );
}

/** One scaled elevation from published inches, its face drawn simply, with dimension strings. */
function Elevation({ x, w, h, face, detail }: { x: number; w: number; h: number; face: string; detail: 'doors' | 'inverter' | 'plain' }) {
  const W = w * PER_IN;
  const H = h * PER_IN;
  const top = GRADE - H;
  return (
    <g>
      <rect x={x} y={top} width={W} height={H} fill="#fff" stroke={NEW} strokeWidth={3} />
      {detail === 'doors' ? (
        <g stroke={NEW} strokeWidth={1.5} fill="none">
          <rect x={x + 14} y={top + 14} width={W / 2 - 21} height={H - 28} />
          <rect x={x + W / 2 + 7} y={top + 14} width={W / 2 - 21} height={H - 28} />
          <line x1={x + W / 2 - 22} y1={top + H / 2 - 30} x2={x + W / 2 - 22} y2={top + H / 2 + 30} strokeWidth={4} />
          <line x1={x + W / 2 + 22} y1={top + H / 2 - 30} x2={x + W / 2 + 22} y2={top + H / 2 + 30} strokeWidth={4} />
        </g>
      ) : detail === 'inverter' ? (
        <g stroke={NEW} strokeWidth={1.5} fill="none">
          <rect x={x + W * 0.3} y={top + H * 0.15} width={W * 0.4} height={H * 0.12} />
          <line x1={x + 12} y1={top + H - 30} x2={x + W - 12} y2={top + H - 30} />
        </g>
      ) : null}
      <Dim x1={x} y1={top} x2={x + W} y2={top} offset={-40} text={feetInches(w)} />
      <Dim x1={x} y1={top} x2={x} y2={GRADE} offset={-40} text={feetInches(h)} />
      <text x={x + W / 2} y={GRADE + 36} fontSize={18} textAnchor="middle" fill={INK}>
        {face}
      </text>
    </g>
  );
}

/** Equipment without published dimensions: an outline marked not to scale. */
function Unscaled({ x, w, h, lines }: { x: number; w: number; h: number; lines: string[] }) {
  return (
    <g>
      <rect x={x} y={GRADE - h} width={w} height={h} fill="#fff" stroke={NEW} strokeWidth={3} strokeDasharray="18 8" />
      <Lines x={x + w / 2} y={GRADE - h / 2 - 10} lines={lines} size={17} gap={22} anchor="middle" fill={NEW} />
      <text x={x + w / 2} y={GRADE + 36} fontSize={18} textAnchor="middle" fill={INK}>
        NOT TO SCALE
      </text>
    </g>
  );
}

const dimsText = (m: EquipmentModel) => (m.dimensionsIn ? `${feetInches(m.dimensionsIn.w)} × ${feetInches(m.dimensionsIn.d)} × ${feetInches(m.dimensionsIn.h)}` : BY_ENGINEER);

export function EquipmentElevations({ design, service: index = 0, synthetic, issued, selected, onSelect }: ElectricalSheetProps) {
  const config = configurationOf(design);
  const parts = switchingParts(design, serviceOf(design, index));
  const bat = config.battery.model;
  const inv = config.inverter.model;
  const sel: Sel = { selected, onSelect };
  const count = config.inverter.count;
  const precharge = /precharge/i.test(config.inverter.label);

  // Elevations along one grade line.
  const bessDims = bat.dimensionsIn;
  const invDims = inv.dimensionsIn;
  const bx = 200;
  const bW = bessDims ? bessDims.w * PER_IN : 0;
  const bD = bessDims ? bessDims.d * PER_IN : 0;
  const ix = 1460;
  const iW = invDims ? invDims.w * PER_IN : 0;
  const labelY = GRADE + 86;

  // The pad plan.
  const pad = { x: 330, y: 1330 };
  const ft = (n: number) => n * PER_FT;
  const edge = 0.75;
  const bessFoot = bessDims ? { w: bessDims.w / 12, d: bessDims.d / 12 } : null;
  const invFoot = invDims ? { w: invDims.w / 12, d: invDims.d / 12 } : null;
  const bessAt = bessFoot ? { x: edge, y: (PAD_FT.d - bessFoot.d) / 2 } : null;
  const invAt = invFoot ? Array.from({ length: count }, (_, i) => ({ x: PAD_FT.w - edge - (count - i) * invFoot.w - (count - 1 - i) * 0.5, y: PAD_FT.d - edge - invFoot.d })) : [];
  const xfmrArea = { x: 8.5, y: edge, w: PAD_FT.w - edge - 8.5, d: 4.25 };
  const discAt = [
    { id: 'disconnect', tag: 'DISC', x: 6.0 },
    { id: 'aux', tag: 'AUX', x: 7.0 },
  ];
  const P = (x: number, y: number) => ({ x: pad.x + ft(x), y: pad.y + ft(y) });

  const schedule: { id: string; tag: string; name: string; model: string; qty: string; dims: string; weight: string }[] = [
    { id: 'bess', tag: config.battery.tag, name: 'BATTERY ENERGY STORAGE SYSTEM', model: modelName(bat), qty: '1', dims: dimsText(bat), weight: bat.weightLb ? `${bat.weightLb} LB` : BY_ENGINEER },
    { id: 'inverters', tag: config.inverter.tag, name: config.inverter.name, model: modelName(inv), qty: String(count), dims: dimsText(inv), weight: inv.weightLb ? `${inv.weightLb} LB` : BY_ENGINEER },
    ...(precharge ? [{ id: 'precharge', tag: 'PCU', name: 'DC PRECHARGE UNIT', model: BY_ENGINEER, qty: String(count), dims: BY_ENGINEER, weight: BY_ENGINEER }] : []),
    { id: 'isolation-transformer', tag: config.isolationTransformer.tag, name: `${config.isolationTransformer.kva} KVA ISOLATION TRANSFORMER`, model: BY_ENGINEER, qty: '1', dims: BY_ENGINEER, weight: BY_ENGINEER },
    { id: 'disconnect', tag: config.disconnect.tag, name: `${parts.disconnect.amps}A BATTERY SYSTEM DISCONNECT`, model: parts.disconnect.model, qty: '1', dims: BY_ENGINEER, weight: BY_ENGINEER },
    { id: 'aux', tag: config.auxDisconnect.tag, name: `${config.auxDisconnect.amps}A AUXILIARY DISCONNECT`, model: BY_ENGINEER, qty: '1', dims: BY_ENGINEER, weight: BY_ENGINEER },
  ];
  const cols = [
    { key: 'tag', label: 'TAG', w: 110 },
    { key: 'name', label: 'EQUIPMENT', w: 470 },
    { key: 'model', label: 'MODEL', w: 340 },
    { key: 'qty', label: 'QTY', w: 80 },
    { key: 'dims', label: 'W × D × H', w: 400 },
    { key: 'weight', label: 'WEIGHT', w: 230 },
  ] as const;
  const table = { x: 1560, y: 1330, w: cols.reduce((s, c) => s + c.w, 0) };

  return (
    <SheetFrame label="E-300 equipment elevations">
      {/* grade */}
      <line x1={110} y1={GRADE} x2={3200} y2={GRADE} stroke={INK} strokeWidth={4} />

      {bessDims ? (
        <Device id="bess" box={{ x: bx - 70, y: GRADE - bessDims.h * PER_IN - 80, w: bW + bD + 230, h: bessDims.h * PER_IN + 260 }} {...sel} label="BESS elevations">
          <Elevation x={bx} w={bessDims.w} h={bessDims.h} face="FRONT" detail="doors" />
          <Elevation x={bx + bW + 160} w={bessDims.d} h={bessDims.h} face="SIDE" detail="plain" />
          <Tag x={bx + bW / 2} y={labelY} text={config.battery.tag} />
          <Lines x={bx + bW + 80} y={labelY - 4} lines={[`(N) ${config.battery.name}`, modelName(bat)]} size={19} gap={24} fill={NEW} anchor="middle" />
        </Device>
      ) : null}
      <DrawingTitle x={bx} y={1200} n={1} title="BESS ELEVATIONS" scale={'3/4" = 1\'-0"'} />

      {invDims ? (
        <Device id="inverters" box={{ x: ix - 70, y: GRADE - invDims.h * PER_IN - 80, w: iW + invDims.d * PER_IN + 230, h: invDims.h * PER_IN + 260 }} {...sel} label="Inverter elevations">
          <Elevation x={ix} w={invDims.w} h={invDims.h} face="FRONT" detail="inverter" />
          <Elevation x={ix + iW + 130} w={invDims.d} h={invDims.h} face="SIDE" detail="plain" />
          <Tag x={ix + iW / 2} y={labelY} text={`${config.inverter.tag}-1, -${count}`} />
          <Lines x={ix + 10} y={labelY + 50} lines={[`(N) ${config.inverter.name}, TYP. OF ${count}`, modelName(inv)]} size={19} gap={24} fill={NEW} />
        </Device>
      ) : null}
      <DrawingTitle x={ix} y={1200} n={2} title="INVERTER ELEVATIONS" scale={'3/4" = 1\'-0"'} />

      <Device id="isolation-transformer" box={{ x: 2070, y: GRADE - 380, w: 320, h: 560 }} {...sel} label="Isolation transformer elevation">
        <Unscaled x={2090} w={280} h={340} lines={['DIMENSIONS', BY_ENGINEER]} />
        <Tag x={2230} y={labelY} text={config.isolationTransformer.tag} />
        <Lines x={2230} y={labelY + 50} lines={[`(N) ${config.isolationTransformer.kva} KVA ISOLATION`, 'TRANSFORMER']} size={19} gap={24} fill={NEW} anchor="middle" />
      </Device>
      <DrawingTitle x={2070} y={1200} n={3} title="ISOLATION TRANSFORMER" scale="NTS" />

      <Device id="disconnect" box={{ x: 2640, y: GRADE - 300, w: 230, h: 480 }} {...sel} label="Battery system disconnect elevation">
        <Unscaled x={2660} w={190} h={260} lines={['DIMENSIONS', BY_ENGINEER]} />
        <Tag x={2755} y={labelY} text={config.disconnect.tag} />
        <Lines x={2755} y={labelY + 50} lines={[`(N) ${parts.disconnect.amps}A DISCONNECT`, parts.disconnect.model]} size={17} gap={22} fill={NEW} anchor="middle" />
      </Device>
      <Device id="aux" box={{ x: 2900, y: GRADE - 300, w: 300, h: 480 }} {...sel} label="Auxiliary disconnect elevation">
        <Unscaled x={2960} w={190} h={260} lines={['DIMENSIONS', BY_ENGINEER]} />
        <Tag x={3055} y={labelY} text={config.auxDisconnect.tag} />
        <Lines x={3055} y={labelY + 50} lines={[`(N) ${config.auxDisconnect.amps}A AUXILIARY`, 'DISCONNECT']} size={17} gap={22} fill={NEW} anchor="middle" />
      </Device>
      <DrawingTitle x={2640} y={1200} n={4} title="DISCONNECTS" scale="NTS" />

      {/* pad plan */}
      <g>
        <rect x={pad.x} y={pad.y} width={ft(PAD_FT.w)} height={ft(PAD_FT.d)} fill="#f4f4f4" stroke={INK} strokeWidth={3} />
        <text x={pad.x + 16} y={pad.y + ft(PAD_FT.d) - 16} fontSize={19} fill={INK}>
          (N) CONCRETE EQUIPMENT PAD
        </text>
        <Dim x1={pad.x} y1={pad.y} x2={pad.x + ft(PAD_FT.w)} y2={pad.y} offset={-50} text={feetInches(PAD_FT.w * 12)} />
        <Dim x1={pad.x} y1={pad.y} x2={pad.x} y2={pad.y + ft(PAD_FT.d)} offset={-50} text={feetInches(PAD_FT.d * 12)} />

        {bessFoot && bessAt ? (
          <Device id="bess" box={{ x: P(bessAt.x, bessAt.y).x - 6, y: P(bessAt.x, bessAt.y).y - 6, w: ft(bessFoot.w) + 12, h: ft(bessFoot.d) + 12 }} {...sel} label="BESS footprint">
            <rect {...{ x: P(bessAt.x, bessAt.y).x, y: P(bessAt.x, bessAt.y).y, width: ft(bessFoot.w), height: ft(bessFoot.d) }} fill="#fff" stroke={NEW} strokeWidth={3} />
            <line x1={P(bessAt.x, bessAt.y).x} y1={P(bessAt.x, bessAt.y).y} x2={P(bessAt.x + bessFoot.w, bessAt.y + bessFoot.d).x} y2={P(bessAt.x + bessFoot.w, bessAt.y + bessFoot.d).y} stroke={NEW} strokeWidth={1} />
            <Tag x={P(bessAt.x + bessFoot.w / 2, 0).x} y={P(0, bessAt.y + bessFoot.d / 2).y} text={config.battery.tag} />
            <Dim x1={P(bessAt.x, 0).x} y1={P(0, bessAt.y + bessFoot.d).y} x2={P(bessAt.x + bessFoot.w, 0).x} y2={P(0, bessAt.y + bessFoot.d).y} offset={34} text={feetInches(bessFoot.w * 12)} />
            <Dim x1={P(bessAt.x + bessFoot.w, 0).x} y1={P(0, bessAt.y).y} x2={P(bessAt.x + bessFoot.w, 0).x} y2={P(0, bessAt.y + bessFoot.d).y} offset={60} text={feetInches(bessFoot.d * 12)} />
          </Device>
        ) : null}

        {invFoot ? (
          <Device id="inverters" box={{ x: P(invAt[0]!.x, 0).x - 6, y: P(0, invAt[0]!.y).y - 50, w: ft(invAt.at(-1)!.x + invFoot.w - invAt[0]!.x) + 12, h: ft(invFoot.d) + 56 }} {...sel} label="Inverter footprints">
            {invAt.map((at, i) => (
              <g key={i}>
                <rect x={P(at.x, at.y).x} y={P(at.x, at.y).y} width={ft(invFoot.w)} height={ft(invFoot.d)} fill="#fff" stroke={NEW} strokeWidth={3} />
                <text x={P(at.x + invFoot.w / 2, 0).x} y={P(0, at.y).y - 12} fontSize={18} fontWeight={700} textAnchor="middle" fill={NEW}>
                  {`${config.inverter.tag}-${i + 1}`}
                </text>
              </g>
            ))}
            <Dim x1={P(invAt.at(-1)!.x, 0).x} y1={P(0, PAD_FT.d - edge).y} x2={P(invAt.at(-1)!.x + invFoot.w, 0).x} y2={P(0, PAD_FT.d - edge).y} offset={30} text={feetInches(invFoot.w * 12)} />
          </Device>
        ) : null}

        <Device id="isolation-transformer" box={{ x: P(xfmrArea.x, 0).x - 6, y: P(0, xfmrArea.y).y - 6, w: ft(xfmrArea.w) + 12, h: ft(xfmrArea.d) + 12 }} {...sel} label="Isolation transformer area">
          <rect x={P(xfmrArea.x, 0).x} y={P(0, xfmrArea.y).y} width={ft(xfmrArea.w)} height={ft(xfmrArea.d)} fill="#fff" stroke={NEW} strokeWidth={2.5} strokeDasharray="18 8" />
          <Tag x={P(xfmrArea.x + xfmrArea.w / 2, 0).x} y={P(0, xfmrArea.y + 1.2).y} text={config.isolationTransformer.tag} />
          <Lines x={P(xfmrArea.x + xfmrArea.w / 2, 0).x} y={P(0, xfmrArea.y + 2.4).y} lines={['FOOTPRINT', BY_ENGINEER]} size={17} gap={22} anchor="middle" fill={NEW} />
        </Device>

        {discAt.map((d) => (
          <Device key={d.id} id={d.id} box={{ x: P(d.x, 0).x - 6, y: pad.y - 4, w: ft(0.9) + 12, h: ft(1.4) }} {...sel} label={`${d.tag} location`}>
            <rect x={P(d.x, 0).x} y={P(0, 0.15).y} width={ft(0.9)} height={ft(0.45)} fill="#fff" stroke={NEW} strokeWidth={2.5} strokeDasharray="10 6" />
            <text x={P(d.x + 0.45, 0).x} y={P(0, 1.15).y} fontSize={17} fontWeight={700} textAnchor="middle" fill={NEW}>
              {d.tag}
            </text>
          </Device>
        ))}
      </g>
      <DrawingTitle x={pad.x - 40} y={2290} n={5} title="EQUIPMENT PAD PLAN" scale={'3/4" = 1\'-0"'} />

      {/* equipment schedule */}
      <g>
        <rect x={table.x} y={table.y} width={table.w} height={76} fill="#fff" stroke={INK} strokeWidth={2} />
        <text x={table.x + table.w / 2} y={table.y + 28} fontSize={22} fontWeight={700} textAnchor="middle" fill={INK}>
          EQUIPMENT SCHEDULE
        </text>
        <rect x={table.x} y={table.y + 40} width={table.w} height={36} fill="#eee" stroke={INK} strokeWidth={1.5} />
        {(() => {
          let hx = table.x;
          return cols.map((c) => {
            const at = hx;
            hx += c.w;
            return (
              <text key={c.key} x={at + c.w / 2} y={table.y + 65} fontSize={17} fontWeight={700} textAnchor="middle" fill={INK}>
                {c.label}
              </text>
            );
          });
        })()}
        {(() => {
          let cy = table.y + 76;
          return schedule.map((row) => {
            const cells = cols.map((c) => wrap(row[c.key], c.w - 16, 17));
            const h = Math.max(...cells.map((l) => l.length)) * 22 + 16;
            const top = cy;
            cy += h;
            let cx = table.x;
            return (
              <Device key={row.id} id={row.id} box={{ x: table.x, y: top, w: table.w, h }} {...sel} label={`${row.name} schedule row`}>
                <rect x={table.x} y={top} width={table.w} height={h} fill="none" stroke={INK} strokeWidth={1} />
                {cells.map((lines, i) => {
                  const at = cx;
                  cx += cols[i]!.w;
                  return (
                    <g key={i}>
                      {i > 0 ? <line x1={at} y1={top} x2={at} y2={top + h} stroke={INK} strokeWidth={1} /> : null}
                      <Lines x={at + cols[i]!.w / 2} y={top + 26} lines={lines} size={17} gap={22} anchor="middle" fill={lines[0] === BY_ENGINEER ? '#555' : INK} />
                    </g>
                  );
                })}
              </Device>
            );
          });
        })()}
      </g>

      <SheetNote x={1560} y={2230} w={1100} />

      <ElectricalTitleStrip design={design} sheet="E-300" title={['EQUIPMENT', 'ELEVATIONS']} synthetic={synthetic} issued={issued} />
    </SheetFrame>
  );
}
