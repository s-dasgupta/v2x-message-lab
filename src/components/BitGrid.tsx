import { useMemo, useState } from 'react';
import type { BitSpan } from '../asn1/uper';
import { fieldByPath } from '../j2735/catalog';
import { useApp } from '../app/state';

/** Distinct hues for the 14 Part I components (constructed frames share their child hue). */
const COMPONENT_HUES: Record<string, number> = {
  msgCnt: 205, id: 260, secMark: 30, lat: 190, long: 170, elev: 120, accuracy: 95,
  transmission: 330, speed: 10, heading: 50, angle: 290, accelSet: 225, brakes: 0, size: 150,
};

export function componentOf(path: string): string | undefined {
  const m = /(?:^|\.)coreData\.([A-Za-z]+)/.exec(path);
  return m?.[1];
}

export function spanColor(s: BitSpan, dark: boolean): string {
  switch (s.kind) {
    case 'extension-bit':
      return 'var(--b-ext)';
    case 'presence-bit':
      return 'var(--b-presence)';
    case 'length':
      return 'var(--b-length)';
    case 'padding':
      return 'var(--b-padding)';
    case 'opaque':
    case 'extension-additions':
      return 'var(--b-opaque)';
    default: {
      const comp = componentOf(s.path);
      if (comp && COMPONENT_HUES[comp] !== undefined) {
        const h = COMPONENT_HUES[comp]!;
        return dark ? `hsl(${h} 45% 34%)` : `hsl(${h} 70% 82%)`;
      }
      return dark ? 'hsl(210 20% 35%)' : 'hsl(210 30% 85%)';
    }
  }
}

export function spanLabel(s: BitSpan): string {
  const spec = fieldByPath(s.path);
  const role = { 'extension-bit': 'extension bit', 'presence-bit': 'presence bit', length: 'length determinant', value: 'value', padding: 'padding', opaque: 'opaque content', 'extension-additions': 'extension additions' }[s.kind];
  return `${spec?.label ?? (s.path || 'message')} — ${role}`;
}

function usePrefersDark(): boolean {
  const { theme } = useApp(); // subscribe so colours update when the theme changes
  if (theme !== 'system') return theme === 'dark';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export interface BitGridProps {
  bytes: Uint8Array;
  spans: readonly BitSpan[];
  /** Span keys (`${start}`) to highlight. */
  selected?: readonly BitSpan[];
  onSelect?: (s: BitSpan) => void;
  bitsPerRow?: number;
  /** Bit index where decoding stopped (failed decodes). */
  errorAt?: number;
}

/** Interactive SVG rendering of the actual encoded bitstream, coloured by traced span. */
export function BitGrid({ bytes, spans, selected = [], onSelect, bitsPerRow = 64, errorAt }: BitGridProps) {
  const dark = usePrefersDark();
  const [hover, setHover] = useState<BitSpan | null>(null);
  const total = bytes.length * 8;
  const owner = useMemo(() => {
    const arr: (BitSpan | undefined)[] = new Array(total);
    for (const s of spans) for (let i = s.start; i < s.start + s.length && i < total; i += 1) arr[i] = s;
    return arr;
  }, [spans, total]);
  const selectedSet = new Set(selected.map((s) => `${s.start}:${s.length}:${s.kind}`));
  const cell = 14;
  const gutter = 44;
  const byteGap = 4;
  const rows = Math.ceil(total / bitsPerRow);
  const width = gutter + bitsPerRow * cell + (bitsPerRow / 8 - 1) * byteGap + 2;
  const height = rows * (cell + 6) + 4;
  const x = (col: number) => gutter + col * cell + Math.floor(col / 8) * byteGap;
  const items = [];
  for (let i = 0; i < total; i += 1) {
    const row = Math.floor(i / bitsPerRow);
    const col = i % bitsPerRow;
    const bit = (bytes[i >> 3]! >> (7 - (i & 7))) & 1;
    const s = owner[i];
    const isSel = s ? selectedSet.has(`${s.start}:${s.length}:${s.kind}`) : false;
    const isHover = s && hover === s;
    const y = row * (cell + 6) + 2;
    items.push(
      <g key={i}>
        <rect
          className="bit"
          x={x(col)}
          y={y}
          width={cell - 1}
          height={cell}
          rx={2}
          fill={s ? spanColor(s, dark) : 'var(--surface-2)'}
          stroke={isSel ? 'var(--text)' : isHover ? 'var(--accent)' : errorAt === i ? 'var(--err)' : 'none'}
          strokeWidth={isSel || isHover || errorAt === i ? 1.6 : 0}
          opacity={selected.length && !isSel ? 0.45 : 1}
          onMouseEnter={() => s && setHover(s)}
          onMouseLeave={() => setHover(null)}
          onClick={() => s && onSelect?.(s)}
        >
          <title>{`bit ${i} (octet ${i >> 3}, bit ${i & 7}) = ${bit}${s ? `\n${spanLabel(s)}\n${s.note}` : '\nnot attributed'}`}</title>
        </rect>
        <text x={x(col) + (cell - 1) / 2} y={y + cell - 3.5} fontSize={9.5} textAnchor="middle" fill="var(--text)">
          {bit}
        </text>
      </g>,
    );
  }
  const labels = [];
  for (let r = 0; r < rows; r += 1) {
    labels.push(
      <text key={`l${r}`} x={gutter - 6} y={r * (cell + 6) + 2 + cell - 3.5} fontSize={9.5} textAnchor="end" fill="var(--text-3)">
        {r * bitsPerRow}
      </text>,
    );
  }
  return (
    <div>
      <svg className="bitgrid" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Bitstream of ${bytes.length} octets (${total} bits) coloured by ASN.1 component`}>
        {labels}
        {items}
      </svg>
      <div className="small muted" style={{ minHeight: 22 }} aria-live="polite">
        {hover ? `${spanLabel(hover)} · bits ${hover.start}–${hover.start + hover.length - 1} · ${hover.note}` : 'Hover a bit to see which component it belongs to; click to select.'}
      </div>
    </div>
  );
}

export function BitLegend() {
  return (
    <div className="legend">
      <span><i style={{ background: 'var(--b-ext)' }} />extension bit</span>
      <span><i style={{ background: 'var(--b-presence)' }} />OPTIONAL presence bit</span>
      <span><i style={{ background: 'var(--b-length)' }} />length determinant</span>
      <span><i style={{ background: 'hsl(10 70% 82%)' }} />value bits (colour per Part I component)</span>
      <span><i style={{ background: 'var(--b-opaque)' }} />opaque / not modelled</span>
      <span><i style={{ background: 'var(--b-padding)' }} />padding to octet boundary</span>
    </div>
  );
}

/** Hex dump with highlighted octets for the selected bit range. */
export function HexView({ bytes, highlight }: { bytes: Uint8Array; highlight?: { start: number; length: number } }) {
  const from = highlight ? highlight.start >> 3 : -1;
  const to = highlight ? (highlight.start + Math.max(highlight.length, 1) - 1) >> 3 : -2;
  return (
    <div className="hexview" aria-label="Hexadecimal payload">
      {Array.from(bytes, (b, i) => (
        <span key={i} className={i >= from && i <= to ? 'hl' : undefined} title={`octet ${i}: bits ${i * 8}–${i * 8 + 7}`}>
          {b.toString(16).padStart(2, '0').toUpperCase()}
        </span>
      ))}
    </div>
  );
}
