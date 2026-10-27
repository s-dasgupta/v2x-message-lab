import { useMemo } from 'react';
import { href } from '../app/router';
import { useApp } from '../app/state';
import { BitReader } from '../asn1/bits';
import { Callout, PageHead, Ref } from '../components/common';
import { LEAF_FIELDS, entry } from '../j2735/catalog';
import { decodePayload } from '../j2735/codec';
import { fmt } from '../j2735/conversions/units';

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export function ComparePage() {
  const { build, encoding, openDetail } = useApp();
  const decoded = useMemo(() => (encoding?.ok ? decodePayload(encoding.result.frame.bytes, 'MessageFrame') : undefined), [encoding]);
  if (!encoding?.ok || !decoded || !build.coreData) {
    return (
      <div>
        <PageHead title="Encoding / Decoding Comparison" module="H" />
        <Callout kind="err"><p>No valid message to compare. <a href={href('generator')}>Fix the inputs first</a>.</p></Callout>
      </div>
    );
  }
  const frame = encoding.result.frame;
  const rows = LEAF_FIELDS.map((f) => {
    const conv = build.conversions[f.path]!;
    const encoded = get(build.coreData, f.path.replace('coreData.', ''));
    const dec = get(decoded.bsm, f.path);
    const span = frame.trace.spans.find((s) => s.path === `value.${f.path}` && s.kind === 'value')!;
    const r = new BitReader(frame.bytes);
    r.seek(span.start);
    const bits = r.readBitString(span.length, '');
    const interp = decoded.interpretations?.find((i) => i.path === f.path);
    const delta = conv.physical && interp?.physical && interp.physical.unit === conv.physical.unit ? interp.physical.value - conv.physical.value : undefined;
    return { f, conv, encoded, dec, bits, interp, delta, match: JSON.stringify(encoded) === JSON.stringify(dec) };
  });
  const allMatch = rows.every((r) => r.match) && decoded.ok;
  return (
    <div>
      <PageHead title="Encoding / Decoding Comparison" module="H">
        Original vehicle inputs → J2735 values → UPER bits → decoded J2735 values → measurements recovered by a receiver.
      </PageHead>
      <Callout kind={allMatch ? 'ok' : 'err'}>
        <p>
          <strong>{allMatch ? 'Round trip successful.' : 'Round trip FAILED.'}</strong>{' '}
          {allMatch
            ? `All ${rows.length} decoded standardized values are identical to the values that were encoded (${frame.bytes.length}-octet MessageFrame).`
            : 'At least one decoded value differs from the encoded value — this indicates a codec defect; please report it.'}{' '}
          Differences between the original measurement and the recovered measurement are expected: they come from quantization, saturation
          or special codes, never from the codec.
        </p>
      </Callout>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Field</th>
                <th><span className="badge sensor">original input</span></th>
                <th className="num"><span className="badge field">encoded value</span></th>
                <th><span className="badge bits">UPER bits</span></th>
                <th className="num"><span className="badge field">decoded value</span></th>
                <th><span className="badge sensor">recovered</span></th>
                <th className="num">Δ (recovered − original)</th>
                <th>Match</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ f, conv, encoded, dec, bits, interp, delta, match }) => (
                <tr key={f.path} className="clickable" onClick={() => openDetail(f.path)}>
                  <td>{f.label} <Ref s={entry(f.entityId).section} /></td>
                  <td className="v-sensor">{conv.original}</td>
                  <td className="num v-field">{String(encoded)}</td>
                  <td className="v-bits small" style={{ wordBreak: 'break-all', maxWidth: 220 }}>{bits}</td>
                  <td className="num v-field">{String(dec)}</td>
                  <td className="v-sensor">{interp?.display}</td>
                  <td className="num small">{delta !== undefined ? `${delta >= 0 ? '+' : ''}${fmt(delta, 7)} ${conv.physical?.unit}` : conv.handling === 'unavailable' ? 'n/a (unavailable)' : '—'}</td>
                  <td>{match ? <span className="badge ok">✓ identical</span> : <span className="badge err">✗ differs</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Why recovered measurements differ</h2>
          <ul className="small">
            <li><strong>Quantization.</strong> Each element has a fixed resolution (e.g. 0.02 m/s for speed). The value is rounded to the nearest step, so the error is at most half a step <Ref s="11.5" />.</li>
            <li><strong>Saturation.</strong> Values beyond the range are clipped to a code meaning “this value or more”; the true magnitude is lost.</li>
            <li><strong>Special codes.</strong> “Unavailable” carries no measurement at all.</li>
            <li><strong>Unit conversion.</strong> A value entered in km/h or mph is shown back in the element’s SI unit.</li>
          </ul>
        </div>
        <div className="card">
          <h2>What counts as a successful round trip</h2>
          <p className="small">
            The decoded <em>standardized</em> values must equal the encoded standardized values exactly — that is the codec’s job, and it is
            what this page checks. Recovering the original floating-point measurement exactly is impossible by design: the standard
            deliberately trades precision for a compact, fixed-size message.
          </p>
          <p className="small muted">
            Self-consistency alone does not prove standards conformance; see <a href={href('about')}>Verification &amp; limits</a> for the
            independent checks.
          </p>
        </div>
      </div>
    </div>
  );
}
