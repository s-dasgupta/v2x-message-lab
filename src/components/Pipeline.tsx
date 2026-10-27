import { describeType } from '../asn1/types';
import { entry, fieldByPath, fixedUperBits } from '../j2735/catalog';
import type { FieldConversion, Handling } from '../j2735/conversions/types';
import { fmt } from '../j2735/conversions/units';
import { useModeAtLeast, IssueList, Ref } from './common';

const HANDLING_TEXT: Record<Handling, { label: string; cls: string }> = {
  quantized: { label: 'scaled & rounded', cls: 'ok' },
  exact: { label: 'exact (no quantization)', cls: 'ok' },
  unavailable: { label: 'unavailable code', cls: 'info' },
  'saturated-high': { label: 'saturated (upper code)', cls: 'warn' },
  'saturated-low': { label: 'saturated (lower code)', cls: 'warn' },
  wrapped: { label: 'wrapped angle', cls: 'info' },
  'no-sentinel': { label: 'no unavailable code', cls: 'warn' },
  invalid: { label: 'cannot encode', cls: 'err' },
};

export function HandlingBadge({ h }: { h: Handling }) {
  const t = HANDLING_TEXT[h];
  return <span className={`badge ${t.cls}`}>{t.label}</span>;
}

function show(v: unknown): string {
  if (v === undefined) return '—';
  return typeof v === 'string' ? (/^[01]+$/.test(v) ? `'${v}'B` : v) : String(v);
}

/** Raw sensor value → physical unit → scaled → quantized → J2735 value → reconstruction (Module C). */
export function Pipeline({ c, compact = false }: { c: FieldConversion; compact?: boolean }) {
  const engineering = useModeAtLeast('engineering');
  const advanced = useModeAtLeast('advanced');
  const spec = fieldByPath(c.path);
  const e = spec ? entry(spec.entityId) : undefined;
  const bits = e ? fixedUperBits(e.type) : undefined;
  return (
    <div>
      <div className="pipeline" aria-label="Transformation pipeline">
        <div className="stage sensor">
          <h5>Original input</h5>
          <div className="val">{c.original}</div>
        </div>
        {engineering && c.physical && (
          <div className="stage sensor">
            <h5>Physical (SI)</h5>
            <div className="val">
              {fmt(c.physical.value, 7)} {c.physical.unit}
            </div>
          </div>
        )}
        {engineering && c.scaled !== undefined && (
          <div className="stage field">
            <h5>÷ LSB {c.resolution}</h5>
            <div className="val">{fmt(c.scaled, 4)}</div>
          </div>
        )}
        <div className="stage field">
          <h5>J2735 value</h5>
          <div className="val">{show(c.j2735Value)}</div>
          <div style={{ marginTop: 4 }}>
            <HandlingBadge h={c.handling} />
          </div>
        </div>
        {c.reconstructed && (
          <div className="stage sensor">
            <h5>Receiver reconstructs</h5>
            <div className="val">
              {fmt(c.reconstructed.value, 7)} {c.reconstructed.unit}
            </div>
          </div>
        )}
        {engineering && c.quantizationError && (
          <div className="stage">
            <h5>Quantization error</h5>
            <div className="val">
              {c.quantizationError.value >= 0 ? '+' : ''}
              {fmt(c.quantizationError.value, 7)} {c.quantizationError.unit}
            </div>
          </div>
        )}
        {advanced && bits !== undefined && (
          <div className="stage bits">
            <h5>UPER field</h5>
            <div className="val">{bits} bits</div>
          </div>
        )}
      </div>
      {engineering && (
        <ol className="steps">
          {c.steps.map((s, i) => (
            <li key={i}>
              <b>{s.label}:</b> {s.detail}
            </li>
          ))}
        </ol>
      )}
      {!compact && e && (
        <p className="small muted" style={{ marginTop: 8 }}>
          Constraint: <code>{e.type.name} ::= {describeType(e.type)}</code> · Rule: {c.quantizationRule ?? 'direct mapping'} · Defined in <Ref s={e.section} />
        </p>
      )}
      <IssueList issues={c.issues} />
    </div>
  );
}
