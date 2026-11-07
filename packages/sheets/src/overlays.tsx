// Overlays that make the sheet answer questions a reader would otherwise have to ask.
//
// Kept in their own file so the drawing can gain features without the main sheet
// becoming a place several people edit at once.
//
// Three ideas, in order of how much they change what a reader understands:
//
//   Slope      — a number in a table nobody pictures, drawn as a tint and a fall arrow.
//   Confidence — surveyed geometry solid, inferred dashed, assumed ghosted, so the
//                drawing itself says how much to trust its own lines.
//   Blocking   — the one fact holding the project up, stamped where the decision is made.

import type { RecordVersion, Value, ValueState } from '@eqore/contract';

// ------------------------------------------------------------------- reading

export const valueOf = (record: RecordVersion, field: string): Value | undefined =>
  record.values.find((v) => v.field === field);

export function quantity(record: RecordVersion, field: string): number | null {
  const v = valueOf(record, field);
  return v?.current?.type === 'quantity' ? v.current.value : null;
}

/** Slope's fall direction is carried in the reason sentence, not as its own field. */
export function aspectFromReason(record: RecordVersion, field = 'site_slope_pct'): number | null {
  const reason = valueOf(record, field)?.reason ?? '';
  const m = /falls toward (\d+(?:\.\d+)?) degrees/i.exec(reason);
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------- confidence

export interface StrokeStyle {
  dash?: string;
  width: number;
  opacity: number;
}

/**
 * How certain a line is, expressed the way a draughtsman would.
 *
 * This is the project's whole thesis rendered as drawing convention: a reader can see
 * which lines are trustworthy without consulting a legend or a confidence column.
 */
export function strokeForState(state: ValueState | undefined, scale = 1): StrokeStyle {
  switch (state) {
    case 'verified':
      return { width: 2.4 / scale, opacity: 1 };
    case 'inferred':
      return { dash: `${8 / scale} ${4 / scale}`, width: 1.8 / scale, opacity: 0.95 };
    case 'conflicting':
      return { dash: `${3 / scale} ${3 / scale}`, width: 2.2 / scale, opacity: 1 };
    case 'unreadable':
    case 'missing':
      return { dash: `${2 / scale} ${6 / scale}`, width: 1.2 / scale, opacity: 0.45 };
    default:
      return { dash: `${2 / scale} ${6 / scale}`, width: 1.2 / scale, opacity: 0.4 };
  }
}

export const CONFIDENCE_LEGEND: { state: ValueState; label: string }[] = [
  { state: 'verified', label: 'a person confirmed it' },
  { state: 'inferred', label: 'read or computed from a source' },
  { state: 'conflicting', label: 'sources disagree' },
  { state: 'missing', label: 'nothing answered' },
];

export function ConfidenceKey({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g fontFamily="ui-monospace, monospace" fontSize={9.5} fill="#1D2A35">
      <text x={x} y={y} fontSize={10.5} fontWeight={700} letterSpacing={1.3} fill="#6B7782">
        LINE MEANING
      </text>
      {CONFIDENCE_LEGEND.map((row, i) => {
        const s = strokeForState(row.state, scale);
        const ly = y + 16 + i * 14;
        return (
          <g key={row.state}>
            <line x1={x} y1={ly - 3} x2={x + 26} y2={ly - 3} stroke="#1D2A35" strokeWidth={s.width} strokeDasharray={s.dash} opacity={s.opacity} />
            <text x={x + 32} y={ly}>{row.label}</text>
          </g>
        );
      })}
    </g>
  );
}

// --------------------------------------------------------------------- slope

/** Above this, a pad needs grading or a stepped foundation. Real money, real schedule. */
export const GRADING_THRESHOLD_PCT = 2;

export interface SlopeOverlayProps {
  slopePercent: number;
  aspectDegrees: number | null;
  /** Plan-window rectangle, in sheet units. */
  region: { x: number; y: number; w: number; h: number };
}

/**
 * A slope tint and a fall arrow.
 *
 * Measured across the whole parcel, not at a chosen pad, so it is drawn as a wash over
 * the plan rather than as a contour anyone could measure off. It answers "is this site
 * flat enough" at a glance, which a percentage in a table does not.
 */
export function SlopeOverlay({ slopePercent, aspectDegrees, region }: SlopeOverlayProps) {
  const steep = slopePercent >= GRADING_THRESHOLD_PCT;
  // Saturate the tint at 10%, beyond which the site is a grading job regardless.
  const strength = Math.min(1, slopePercent / 10);
  const cx = region.x + region.w / 2;
  const cy = region.y + region.h / 2;
  const r = Math.min(region.w, region.h) * 0.3;

  // Compass bearing to screen vector: 0 is up, and the sheet's y grows downward.
  const rad = ((aspectDegrees ?? 0) * Math.PI) / 180;
  const dx = Math.sin(rad) * r;
  const dy = -Math.cos(rad) * r;

  return (
    <g pointerEvents="none">
      <defs>
        <linearGradient id="slopeWash" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={steep ? '#C2412D' : '#2E7D5B'} stopOpacity={0} />
          <stop offset="100%" stopColor={steep ? '#C2412D' : '#2E7D5B'} stopOpacity={0.1 + 0.22 * strength} />
        </linearGradient>
        <marker id="fallHead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill={steep ? '#C2412D' : '#2E7D5B'} />
        </marker>
      </defs>

      <rect x={region.x} y={region.y} width={region.w} height={region.h} fill="url(#slopeWash)" />

      {aspectDegrees !== null && (
        <g opacity={0.8}>
          <line
            x1={cx - dx / 2}
            y1={cy - dy / 2}
            x2={cx + dx / 2}
            y2={cy + dy / 2}
            stroke={steep ? '#C2412D' : '#2E7D5B'}
            strokeWidth={2.2}
            markerEnd="url(#fallHead)"
          />
          <text
            x={cx + dx / 2 + 8}
            y={cy + dy / 2 + 4}
            fontSize={11}
            fontFamily="ui-monospace, monospace"
            fill={steep ? '#C2412D' : '#2E7D5B'}
            fontWeight={700}
          >
            {slopePercent.toFixed(1)}% fall
          </text>
        </g>
      )}

      {steep && (
        <text
          x={region.x + 8}
          y={region.y + region.h - 8}
          fontSize={10.5}
          fontFamily="ui-monospace, monospace"
          fontWeight={700}
          fill="#C2412D"
        >
          OVER {GRADING_THRESHOLD_PCT}% — EXPECT GRADING OR A STEPPED FOUNDATION
        </text>
      )}
    </g>
  );
}

// ------------------------------------------------------------------ blocking

export interface BlockingFact {
  label: string;
  /** What each plausible value would mean, in plain words. */
  outcomes?: string[];
  /** Cheapest thing that would settle it. */
  resolver?: string;
  owner?: string;
}

/**
 * The one fact holding the project up, stamped on the sheet.
 *
 * The ranking that produces it lives in the engine; this only draws it. It belongs on the
 * drawing because that is where the decision gets made, and a blocker discovered in a
 * side panel is a blocker discovered late.
 */
export function BlockingStamp({ x, y, fact }: { x: number; y: number; fact: BlockingFact | null }) {
  if (!fact) {
    return (
      <g fontFamily="ui-monospace, monospace">
        <rect x={x} y={y} width={284} height={34} fill="#DDEFE4" stroke="#2E7D5B" />
        <text x={x + 10} y={y + 21} fontSize={11} fontWeight={700} fill="#2E7D5B">
          NOTHING DECISION-CRITICAL OUTSTANDING
        </text>
      </g>
    );
  }
  const lines = [...(fact.outcomes ?? []), fact.resolver ? `Settle it: ${fact.resolver}` : null].filter(Boolean) as string[];
  const h = 34 + lines.length * 14;
  return (
    <g fontFamily="ui-monospace, monospace">
      <rect x={x} y={y} width={284} height={h} fill="#F6E1DC" stroke="#C2412D" strokeWidth={1.4} />
      <text x={x + 10} y={y + 17} fontSize={10.5} fontWeight={700} letterSpacing={1.2} fill="#C2412D">
        BLOCKED ON
      </text>
      <text x={x + 10} y={y + 31} fontSize={11.5} fontWeight={700} fill="#1D2A35">
        {fact.label}
      </text>
      {lines.map((line, i) => (
        <text key={i} x={x + 10} y={y + 47 + i * 14} fontSize={9.5} fill="#1D2A35">
          {line}
        </text>
      ))}
    </g>
  );
}
