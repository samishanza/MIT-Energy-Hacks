// E-001 site plan, drawn from the record.
//
// Deliberately a DRAWING, not a map: no basemap, no tiles, no pan-and-zoom. An engineer
// reads a sheet for dimensions and clearances, and a slippy map is the wrong instrument
// for that. Everything on it is traceable to a value in the record.
//
// It is also not a construction document, and says so on its face. These are candidate
// pad zones derived from public geometry, not an approved layout.

import { useMemo, useState } from 'react';
import type { RecordVersion } from '@eqore/contract';
import { polygonPath, sheetGeometry, type PadOptions } from './geometry.ts';

const SHEET_W = 1000;
const SHEET_H = 680;
const PLAN = { x: 44, y: 54, w: 620, h: 560 };

export interface SitePlanSheetProps {
  record: RecordVersion;
  /** Clearances the pad zones are derived under. Shown on the sheet. */
  padOptions?: PadOptions;
  /** Which candidate is highlighted. */
  selectedPad?: number;
  onSelectPad?: (index: number) => void;
}

export function SitePlanSheet({ record, padOptions, selectedPad = 0, onSelectPad }: SitePlanSheetProps) {
  const [showGrid, setShowGrid] = useState(true);
  const geo = useMemo(() => sheetGeometry(record, padOptions ?? {}), [record, padOptions]);

  const buildingBuffer = padOptions?.buildingBufferFt ?? 10;
  const lotSetback = padOptions?.lotSetbackFt ?? 10;

  if (!geo.lot) {
    return (
      <figure className="sheet sheet--empty">
        <p>{geo.reason}</p>
        <p className="sheet__hint">
          Run a site whose parcel resolves, and the lot lines, structures and candidate pad zones
          will be drawn here.
        </p>
      </figure>
    );
  }

  // Fit the lot into the plan window, keeping the aspect ratio square so dimensions read true.
  const pad = 20;
  const s = Math.min((PLAN.w - pad * 2) / geo.extent.w, (PLAN.h - pad * 2) / geo.extent.h);
  const ox = PLAN.x + (PLAN.w - geo.extent.w * s) / 2 - geo.extent.x * s;
  const oy = PLAN.y + (PLAN.h - geo.extent.h * s) / 2 - geo.extent.y * s;
  const T = `translate(${ox} ${oy}) scale(${s})`;

  const pads = geo.pads;
  const chosen = pads[selectedPad] ?? pads[0];

  // A 50 ft grid, so a reader can measure off the drawing.
  const gridStep = geo.extent.w > 800 ? 100 : 50;
  const gridLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  if (showGrid) {
    for (let x = 0; x <= geo.extent.x + geo.extent.w; x += gridStep) {
      gridLines.push({ x1: x, y1: geo.extent.y, x2: x, y2: geo.extent.y + geo.extent.h });
    }
    for (let y = 0; y <= geo.extent.y + geo.extent.h; y += gridStep) {
      gridLines.push({ x1: geo.extent.x, y1: y, x2: geo.extent.x + geo.extent.w, y2: y });
    }
  }

  return (
    <figure className="sheet">
      <svg viewBox={`0 0 ${SHEET_W} ${SHEET_H}`} role="img" aria-label="Site plan, candidate pad zones">
        <rect width={SHEET_W} height={SHEET_H} fill="#FBF8F4" />
        <rect x={10} y={10} width={SHEET_W - 20} height={SHEET_H - 20} fill="none" stroke="#1D2A35" strokeWidth={1.4} />

        <defs>
          <pattern id="bldgHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="#2F5470" strokeWidth="1.1" opacity="0.5" />
          </pattern>
          <pattern id="keepOut" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#C2412D" strokeWidth="0.8" opacity="0.35" />
          </pattern>
        </defs>

        <text x={26} y={36} fontSize={13} fontWeight={700} fill="#1D2A35" letterSpacing={1.6}>
          E-001 · SITE PLAN — CANDIDATE PAD ZONES
        </text>

        <g transform={T}>
          {showGrid &&
            gridLines.map((l, i) => (
              <line key={i} {...l} stroke="#C9D3DA" strokeWidth={1 / s} opacity={0.7} />
            ))}

          {/* lot line */}
          <path
            d={polygonPath(geo.lot)}
            fill="#fff"
            stroke="#1D2A35"
            strokeWidth={2.2 / s}
            strokeDasharray={`${10 / s} ${4 / s} ${2 / s} ${4 / s}`}
          />

          {/* every structure is a keep-out, not just the largest */}
          {geo.buildings.map((b, i) => (
            <path key={i} d={polygonPath(b)} fill="url(#bldgHatch)" stroke="#2F5470" strokeWidth={1.6 / s} />
          ))}

          {/* candidate pad zones: the open ground, then the box that fits in it */}
          {pads.map((p, i) => {
            const on = i === selectedPad;
            return (
              <g key={i} onClick={() => onSelectPad?.(i)} style={{ cursor: onSelectPad ? 'pointer' : 'default' }}>
                <path d={polygonPath(p.polygon)} fill="#2E7D5B" opacity={on ? 0.14 : 0.06} />
                <rect
                  x={p.rect.x}
                  y={p.rect.y}
                  width={p.rect.w}
                  height={p.rect.h}
                  fill="none"
                  stroke={on ? '#2E7D5B' : '#6B7782'}
                  strokeWidth={(on ? 2.4 : 1.2) / s}
                />
                <text
                  x={p.rect.x + p.rect.w / 2}
                  y={p.rect.y + p.rect.h / 2}
                  textAnchor="middle"
                  fontSize={13 / s}
                  fontWeight={700}
                  fill={on ? '#2E7D5B' : '#6B7782'}
                >
                  P{i + 1}
                </text>
              </g>
            );
          })}

          {/* dimension the chosen box, because that is what a reader needs */}
          {chosen && (
            <g stroke="#2E7D5B" strokeWidth={1.1 / s} fill="none">
              <line x1={chosen.rect.x} y1={chosen.rect.y - 12 / s} x2={chosen.rect.x + chosen.rect.w} y2={chosen.rect.y - 12 / s} />
              <text
                x={chosen.rect.x + chosen.rect.w / 2}
                y={chosen.rect.y - 18 / s}
                textAnchor="middle"
                fontSize={12 / s}
                fill="#2E7D5B"
                stroke="none"
              >
                {chosen.rect.w.toFixed(0)}′
              </text>
              <line x1={chosen.rect.x - 12 / s} y1={chosen.rect.y} x2={chosen.rect.x - 12 / s} y2={chosen.rect.y + chosen.rect.h} />
              <text
                x={chosen.rect.x - 16 / s}
                y={chosen.rect.y + chosen.rect.h / 2}
                textAnchor="end"
                fontSize={12 / s}
                fill="#2E7D5B"
                stroke="none"
              >
                {chosen.rect.h.toFixed(0)}′
              </text>
            </g>
          )}
        </g>

        <ScaleBar x={PLAN.x} y={PLAN.y + PLAN.h + 20} s={s} step={gridStep} />
        <NorthArrow x={PLAN.x + PLAN.w - 40} y={PLAN.y + PLAN.h + 8} />

        <Legend
          x={690}
          y={54}
          lot={geo.lotAreaSqft}
          buildings={geo.buildings.length}
          pads={pads}
          selected={selectedPad}
          buildingBuffer={buildingBuffer}
          lotSetback={lotSetback}
          gridStep={gridStep}
        />
        <TitleBlock x={690} y={SHEET_H - 150} record={record} />
      </svg>

      <figcaption className="sheet__controls">
        <label>
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> {gridStep} ft grid
        </label>
        <span className="sheet__warn">Not for construction. Candidate zones from public geometry.</span>
      </figcaption>
    </figure>
  );
}

function ScaleBar({ x, y, s, step }: { x: number; y: number; s: number; step: number }) {
  const w = step * s;
  return (
    <g fontFamily="ui-monospace, monospace">
      <rect x={x} y={y} width={w} height={5} fill="#1D2A35" />
      <rect x={x + w} y={y} width={w} height={5} fill="none" stroke="#1D2A35" />
      <text x={x} y={y + 18} fontSize={10} fill="#6B7782">0</text>
      <text x={x + w * 2} y={y + 18} fontSize={10} fill="#6B7782" textAnchor="end">{step * 2} ft</text>
    </g>
  );
}

const NorthArrow = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <path d="M0 -16 L7 10 L0 4 L-7 10 Z" fill="#1D2A35" />
    <text x={0} y={26} fontSize={11} textAnchor="middle" fill="#1D2A35">N</text>
  </g>
);

function Legend({
  x, y, lot, buildings, pads, selected, buildingBuffer, lotSetback, gridStep,
}: {
  x: number; y: number; lot: number | null; buildings: number;
  pads: { areaSqft: number; rect: { w: number; h: number } }[];
  selected: number; buildingBuffer: number; lotSetback: number; gridStep: number;
}) {
  const row = (i: number) => y + 54 + i * 15;
  return (
    <g fontFamily="ui-monospace, monospace" fontSize={10.5} fill="#1D2A35">
      <text x={x} y={y + 14} fontSize={10.5} fontWeight={700} letterSpacing={1.3} fill="#6B7782">
        DERIVED FROM THE RECORD
      </text>
      <text x={x} y={y + 34}>Lot area {lot ? lot.toLocaleString() : '—'} ft²</text>
      <text x={x} y={row(0)}>Structures {buildings}</text>
      <text x={x} y={row(1)}>Grid {gridStep} ft</text>

      <text x={x} y={row(3)} fontWeight={700} fill="#6B7782" letterSpacing={1.3}>KEEP-OUTS APPLIED</text>
      <text x={x} y={row(4)}>{buildingBuffer} ft to any structure</text>
      <text x={x} y={row(5)}>{lotSetback} ft inside the lot line</text>

      <text x={x} y={row(7)} fontWeight={700} fill="#6B7782" letterSpacing={1.3}>CANDIDATE ZONES</text>
      {pads.slice(0, 5).map((p, i) => (
        <text key={i} x={x} y={row(8 + i)} fill={i === selected ? '#2E7D5B' : '#1D2A35'} fontWeight={i === selected ? 700 : 400}>
          P{i + 1} {p.rect.w.toFixed(0)}×{p.rect.h.toFixed(0)}′ · {p.areaSqft.toLocaleString()} ft²
        </text>
      ))}
      {pads.length === 0 && <text x={x} y={row(8)} fill="#C2412D">None — keep-outs consume the lot</text>}
    </g>
  );
}

function TitleBlock({ x, y, record }: { x: number; y: number; record: RecordVersion }) {
  return (
    <g fontFamily="ui-monospace, monospace">
      <rect x={x} y={y} width={284} height={120} fill="#FBF8F4" stroke="#1D2A35" />
      <line x1={x} y1={y + 22} x2={x + 284} y2={y + 22} stroke="#1D2A35" strokeWidth={0.6} />
      <text x={x + 8} y={y + 15} fontSize={10.5} fontWeight={700} fill="#1D2A35">SITE PLAN · CANDIDATE PAD ZONES</text>
      <text x={x + 8} y={y + 40} fontSize={9.5} fill="#6B7782">{record.site.address}</text>
      <text x={x + 8} y={y + 56} fontSize={9.5} fill="#6B7782">{record.site.region} · v{record.version}</text>
      <text x={x + 8} y={y + 72} fontSize={9.5} fill="#2F5470">{record.id}</text>
      {record.synthetic && (
        <text x={x + 8} y={y + 92} fontSize={10} fontWeight={700} fill="#8A5A12">SYNTHETIC DATA</text>
      )}
      <text x={x + 8} y={y + 110} fontSize={9} fill="#C2412D">NOT FOR CONSTRUCTION</text>
    </g>
  );
}
