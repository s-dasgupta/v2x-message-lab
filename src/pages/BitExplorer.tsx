import { useMemo, useState } from 'react';
import { href } from '../app/router';
import { useApp } from '../app/state';
import { BitReader } from '../asn1/bits';
import type { BitSpan, Trace } from '../asn1/uper';
import { BitGrid, BitLegend, HexView, spanLabel } from '../components/BitGrid';
import { Callout, PageHead, Ref, Segmented } from '../components/common';
import { entry, fieldByPath } from '../j2735/catalog';
import { INTERPRETERS } from '../j2735/interpret';
import type { EntryType } from '../j2735/codec';

const RULES: Record<string, string> = {
  INTEGER: 'Constrained INTEGER: the encoder subtracts the lower bound and writes the offset as an unsigned binary number using the fewest bits that can hold every value in the range (⌈log₂(ub − lb + 1)⌉). No sign bit, no length.',
  ENUMERATED: 'ENUMERATED: the identifier is replaced by its index in ascending order of the enumeration values and written as a constrained whole number (0 … n−1).',
  'BIT STRING': 'BIT STRING with a fixed SIZE: the bits are copied in order (bit 0 first) with no length field.',
  'OCTET STRING': 'OCTET STRING with a fixed SIZE: the octets are copied with no length field — and, in the unaligned variant, without re-aligning to an octet boundary.',
  'extension-bit': 'Extension bit: a type containing the extension marker "..." begins with one bit saying whether any extension additions (from later versions of the standard) are present. 0 = none.',
  'presence-bit': 'Presence bit: for each OPTIONAL component, one bit in the preamble says whether it is present. Absent components occupy no further bits.',
  length: 'Length determinant: tells the receiver how many items or octets follow — here either a constrained count (SEQUENCE OF) or the general length of an open type (one octet below 128, two octets below 16384).',
  padding: 'Padding: a complete UPER encoding is padded with zero bits to a whole number of octets. These bits carry no information.',
  opaque: 'Opaque content: octets whose type this release does not model (Part II, regional extensions, or data after the end of the message). The length determinant lets a decoder skip them safely.',
};

function typeKindOf(s: BitSpan): string {
  if (s.kind !== 'value') return s.kind;
  const spec = fieldByPath(s.path);
  return spec ? entry(spec.entityId).type.kind : 'INTEGER';
}

export function SpanDetails({ span, bytes }: { span: BitSpan; bytes: Uint8Array }) {
  const r = new BitReader(bytes);
  r.seek(span.start);
  const raw = span.length <= 64 ? r.readBitString(Math.min(span.length, 64), '') : `${span.length} bits`;
  const spec = fieldByPath(span.path);
  const e = spec ? entry(spec.entityId) : undefined;
  const interp = spec && span.kind === 'value' && span.value !== undefined ? INTERPRETERS[spec.path]?.(span.value as number | string) : undefined;
  const firstOctet = span.start >> 3;
  const lastOctet = (span.start + Math.max(span.length, 1) - 1) >> 3;
  const lb = e?.type.kind === 'INTEGER' ? e.type.lb : undefined;
  return (
    <div>
      <h3>{spanLabel(span)}</h3>
      <dl className="kv">
        <dt className="muted">Component path</dt><dd className="mono">{span.path || '(message)'}</dd>
        {e && (<><dt className="muted">ASN.1 type</dt><dd><code>{e.type.name}</code> <Ref s={e.section} /></dd></>)}
        <dt className="muted">Bit offset</dt><dd>{span.start} – {span.start + span.length - 1} ({span.length} bit{span.length === 1 ? '' : 's'})</dd>
        <dt className="muted">Octets</dt><dd>{firstOctet === lastOctet ? `octet ${firstOctet}` : `octets ${firstOctet}–${lastOctet}`} (starts at bit {span.start % 8} of octet {firstOctet}{(span.start % 8) !== 0 ? ' — not octet-aligned' : ''})</dd>
        <dt className="muted">Bits</dt><dd className="mono v-bits" style={{ wordBreak: 'break-all' }}>{raw}</dd>
        {span.fieldValue !== undefined && (<><dt className="muted">Field (binary → decimal)</dt><dd className="mono">{span.fieldValue}</dd></>)}
        {span.kind === 'value' && span.value !== undefined && (
          <>
            <dt className="muted">Recovered J2735 value</dt>
            <dd className="v-field">
              {String(span.value)}
              {lb !== undefined && lb !== 0 ? ` = ${span.fieldValue} + (${lb})` : ''}
            </dd>
          </>
        )}
        {interp && (<><dt className="muted">Physical meaning</dt><dd className="v-sensor">{interp.display}{interp.note ? ` (${interp.note})` : ''}</dd></>)}
      </dl>
      <p className="small" style={{ marginTop: 10 }}>{span.note}.</p>
      <Callout><p className="small">{RULES[typeKindOf(span)] ?? RULES.INTEGER}</p></Callout>
    </div>
  );
}

export function SpanTable({ trace, selected, onSelect }: { trace: Trace; selected: BitSpan | null; onSelect: (s: BitSpan) => void }) {
  const spans = useMemo(() => [...trace.spans].filter((s) => s.length > 0).sort((a, b) => a.start - b.start), [trace]);
  return (
    <div className="span-list table-wrap">
      <table className="data">
        <thead>
          <tr><th className="num">Bits</th><th className="num">Len</th><th>Component</th><th>Role</th><th className="num">Field</th></tr>
        </thead>
        <tbody>
          {spans.map((s) => (
            <tr key={`${s.start}-${s.kind}`} className={`clickable${selected === s ? ' selected' : ''}`} onClick={() => onSelect(s)}>
              <td className="num mono">{s.start}</td>
              <td className="num">{s.length}</td>
              <td>{fieldByPath(s.path)?.label ?? <span className="mono small">{s.path || '(message)'}</span>}</td>
              <td className="small">{s.kind}</td>
              <td className="num mono small">{s.fieldValue ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BitExplorerPage({ initialPath }: { initialPath?: string }) {
  const { encoding } = useApp();
  const [entryType, setEntryType] = useState<EntryType>('MessageFrame');
  const [selectedKey, setSelectedKey] = useState<string | null>(initialPath ?? 'coreData.speed');
  if (!encoding?.ok) {
    return (
      <div>
        <PageHead title="Bit-Level Explorer" module="F" />
        <Callout kind="err"><p>No valid encoding yet. <a href={href('generator')}>Fix the inputs in the generator</a>.</p></Callout>
      </div>
    );
  }
  const r = entryType === 'MessageFrame' ? encoding.result.frame : encoding.result.bsm;
  const prefix = entryType === 'MessageFrame' ? 'value.' : '';
  const selected =
    r.trace.spans.find((s) => s.kind === 'value' && selectedKey !== null && s.path === `${prefix}${selectedKey}`) ??
    r.trace.spans.find((s) => selectedKey !== null && `${s.start}:${s.kind}` === selectedKey) ??
    null;
  const select = (s: BitSpan) => setSelectedKey(s.kind === 'value' && fieldByPath(s.path) ? s.path.replace(/^value\./, '') : `${s.start}:${s.kind}`);
  return (
    <div>
      <PageHead title="Bit-Level Explorer" module="F">
        The actual bitstream produced by the encoder. Every bit is attributed to a component by the codec while it encodes; nothing here is
        inferred afterwards. Click a bit or a row to see how that field is represented and recovered.
      </PageHead>
      <div className="card">
        <div className="card-head">
          <h2>{entryType} · {r.bytes.length} octets · {r.bitLength} bits used</h2>
          <Segmented label="Entry type" value={entryType} onChange={setEntryType} options={[{ value: 'MessageFrame', label: 'MessageFrame' }, { value: 'BasicSafetyMessage', label: 'BasicSafetyMessage' }]} />
        </div>
        <BitGrid bytes={r.bytes} spans={r.trace.spans} selected={selected ? [selected] : []} onSelect={select} />
        <BitLegend />
        <div style={{ marginTop: 10 }}>
          <HexView bytes={r.bytes} highlight={selected ?? undefined} />
        </div>
      </div>
      <div className="split" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Selected bits</h2>
          {selected ? <SpanDetails span={selected} bytes={r.bytes} /> : <p>Select a bit or a field.</p>}
        </div>
        <div className="card">
          <h2>All traced spans (encoding order)</h2>
          <SpanTable trace={r.trace} selected={selected} onSelect={select} />
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Reading the bitstream</h2>
        <ul className="small">
          <li><strong>Sequence ordering.</strong> Components appear exactly in the order of the ASN.1 SEQUENCE; nothing identifies a field except its position, which is why a receiver must use the same schema.</li>
          <li><strong>Widths come from constraints, not from “normal” integer sizes.</strong> Latitude spans 1 800 000 002 values, so it needs 31 bits — not 32. Heading needs 15 bits for 28 801 values; 3 bits suffice for the 8 transmission states.</li>
          <li><strong>Offsets.</strong> Signed ranges are shifted by the lower bound: steering angle −126…127 is written as 0…253, so −30 becomes 96.</li>
          <li><strong>No byte alignment.</strong> In the unaligned variant fields straddle octet boundaries freely; only the end of the complete message is padded.</li>
          <li><strong>Nesting is invisible on the wire.</strong> Data frames such as AccelerationSet4Way add no headers when they have no OPTIONAL components or extension marker — their children simply follow one another.</li>
          <li><strong>Variable parts</strong> (open types, SEQUENCE OF, extensions) carry length determinants so that decoders can skip what they do not understand.</li>
        </ul>
        <p className="small muted">Span positions are verified independently: the CI cross-validation re-encodes each field at its bounds with asn1tools and checks that only the traced bits change.</p>
      </div>
    </div>
  );
}
