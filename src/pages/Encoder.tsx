import { useState } from 'react';
import { href } from '../app/router';
import { useApp } from '../app/state';
import { bytesToHex } from '../asn1/bits';
import { AtLeast, Callout, CopyButton, PageHead, Ref, Segmented, downloadBlob } from '../components/common';
import type { EntryType } from '../j2735/codec';

export function StackDiagram() {
  const layers = [
    { label: 'Radio: C-V2X PC5 sidelink (3GPP) or IEEE 802.11 (DSRC)', fill: 'var(--surface-2)', note: 'outside J2735' },
    { label: 'Network/transport: WSMP header (IEEE 1609.3)', fill: 'var(--surface-2)', note: 'outside J2735' },
    { label: 'Security: Ieee1609Dot2Data — signature, certificate (IEEE 1609.2)', fill: 'var(--surface-2)', note: 'outside J2735' },
    { label: 'SAE J2735 MessageFrame { messageId 20, value }', fill: 'var(--c-field-soft)', note: '§5.1 · this tool' },
    { label: 'SAE J2735 BasicSafetyMessage { coreData, … }', fill: 'var(--c-bits-soft)', note: '§5.2 · this tool' },
  ];
  return (
    <svg className="diagram" viewBox="0 0 640 230" role="img" aria-label="Protocol nesting: radio, WSMP, IEEE 1609.2, MessageFrame, BasicSafetyMessage">
      {layers.map((l, i) => {
        const inset = i * 22;
        return (
          <g key={l.label}>
            <rect x={inset} y={i * 38 + 4} width={640 - 2 * inset} height={222 - i * 44} rx={8} fill={l.fill} stroke="var(--border)" />
            <text x={inset + 12} y={i * 38 + 24} fontSize={12.5} fontWeight={i >= 3 ? 650 : 500}>{l.label}</text>
            <text x={640 - inset - 12} y={i * 38 + 24} fontSize={10.5} textAnchor="end" fill="var(--text-3)">{l.note}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function EncoderPage() {
  const { encoding, build } = useApp();
  const [entryType, setEntryType] = useState<EntryType>('MessageFrame');
  if (!encoding || !encoding.ok) {
    return (
      <div>
        <PageHead title="ASN.1 UPER Encoder" module="E" />
        <Callout kind="err">
          <p>
            <strong>Encoding status: not encoded.</strong>{' '}
            {encoding && !encoding.ok ? encoding.error : `${build.issues.filter((i) => i.severity === 'error').length} input error(s) must be fixed first.`}{' '}
            <a href={href('generator')}>Open the generator</a>.
          </p>
        </Callout>
      </div>
    );
  }
  const r = entryType === 'MessageFrame' ? encoding.result.frame : encoding.result.bsm;
  const hex = bytesToHex(r.bytes);
  const binary = Array.from(r.bytes, (b) => b.toString(2).padStart(8, '0')).join(' ');
  const pad = r.bytes.length * 8 - r.bitLength;
  const base = entryType === 'MessageFrame' ? 'bsm-messageframe' : 'bsm';
  return (
    <div>
      <PageHead title="ASN.1 UPER Encoder" module="E">
        Real Unaligned PER (ITU-T X.691) encoding of the structured BSM, produced by this project's schema-driven codec and cross-checked
        bit-for-bit against two independent ASN.1 toolchains.
      </PageHead>

      <div className="card">
        <div className="card-head">
          <h2>Encoded payload</h2>
          <Segmented label="ASN.1 entry type" value={entryType} onChange={setEntryType} options={[{ value: 'MessageFrame', label: 'MessageFrame (§5.1)' }, { value: 'BasicSafetyMessage', label: 'BasicSafetyMessage (§5.2)' }]} />
        </div>
        <Callout kind="ok">
          <p>
            <strong>Encoding status: success.</strong> {entryType} encoded with UPER · {r.bitLength} significant bits + {pad} padding bit{pad === 1 ? '' : 's'} = <strong>{r.bytes.length} octets</strong>.
          </p>
        </Callout>
        <div className="kpi" style={{ margin: '10px 0' }}>
          <div><b>{r.bytes.length}</b><span>octets</span></div>
          <div><b>{r.bitLength}</b><span>bits used</span></div>
          <div><b>{pad}</b><span>padding bits</span></div>
          <div><b>{entryType === 'MessageFrame' ? '00 14' : '—'}</b><span>frame header</span></div>
        </div>
        <h3>Hexadecimal</h3>
        <p className="mono" style={{ wordBreak: 'break-all' }}>{hex}</p>
        <div className="row">
          <CopyButton text={hex} label="Copy hex" />
          <button onClick={() => downloadBlob(r.bytes.slice().buffer, `${base}.uper`, 'application/octet-stream')}>Download binary (.uper)</button>
          <button onClick={() => downloadBlob(`${hex}\n`, `${base}.hex.txt`, 'text/plain')}>Download hex (.txt)</button>
          <a className="btn" href={href('bits')}>Inspect bits →</a>
        </div>
        <AtLeast min="engineering">
          <h3 style={{ marginTop: 16 }}>Binary</h3>
          <p className="mono small v-bits" style={{ wordBreak: 'break-word' }}>{binary}</p>
        </AtLeast>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>BasicSafetyMessage vs. MessageFrame</h2>
          <p>
            <strong>BasicSafetyMessage</strong> <Ref s="5.2" /> is the BSM structure on its own: 1 extension bit, 2 presence bits (Part II,
            regional) and the 290-bit core data, padded to {encoding.result.bsm.bytes.length} octets.
          </p>
          <p>
            <strong>MessageFrame</strong> <Ref s="5.1" /> wraps any J2735 message so a receiver can tell which type it is: 1 extension bit,
            the 15-bit messageId (20 for a BSM), a length determinant ({encoding.result.bsm.bytes.length} = 0x{encoding.result.bsm.bytes.length.toString(16).toUpperCase().padStart(2, '0')}) and then the
            complete BSM encoding unchanged. That is why a BSM MessageFrame starts with <code>00 14 {encoding.result.bsm.bytes.length.toString(16).toUpperCase().padStart(2, '0')}</code>.
          </p>
          <p className="small muted">
            Which of the two an application exchanges is set by the application or profile standard; when no encoding is specified,
            J2735 requires UPER <Ref s="4.4" /> <Ref s="11.1" />.
          </p>
        </div>
        <div className="card">
          <h2>What this payload is not</h2>
          <StackDiagram />
          <p className="small">
            The bytes above are the J2735 application payload only. They are <strong>not signed</strong> (IEEE 1609.2), carry
            <strong> no WSMP header</strong> (IEEE 1609.3) and include <strong>no PC5 / 802.11 framing</strong>. A deployed vehicle would wrap
            this payload in those layers before transmission <Ref s="4.2" />.
          </p>
        </div>
      </div>
    </div>
  );
}
