import { href } from '../app/router';
import { useApp } from '../app/state';
import { bytesToHex } from '../asn1/bits';

const MODULES = [
  { id: 'learn', tag: 'A', title: 'Learn SAE J2735', text: 'Nine short lessons: V2X, messages vs. frames vs. elements, ASN.1, UPER, and where J2735 sits in the radio stack.' },
  { id: 'generator', tag: 'B + C', title: 'BSM Generator', text: 'Enter vehicle measurements or pick a scenario and watch every value travel from sensor units to a J2735 integer.' },
  { id: 'structure', tag: 'D', title: 'BSM Structure', text: 'The same message as vehicle values, J2735 values, an ASN.1 tree and JSON — all synchronized.' },
  { id: 'encoder', tag: 'E', title: 'UPER Encoder', text: 'Real UPER bytes for a BasicSafetyMessage and for a MessageFrame, with download and copy.' },
  { id: 'bits', tag: 'F', title: 'Bit Explorer', text: 'Click a field and see exactly which bits carry it, how wide the field is, and how a receiver recovers it.' },
  { id: 'decoder', tag: 'G', title: 'BSM Decoder', text: 'Paste hex or upload a binary file; malformed, truncated or foreign payloads are rejected with explanations.' },
  { id: 'compare', tag: 'H', title: 'Round-trip Compare', text: 'Inputs → J2735 values → bytes → decoded values → recovered measurements, with quantization error.' },
  { id: 'research', tag: 'I', title: 'Research Vehicle ID', text: 'Keep experiment labels like UA-CAR-07 in metadata and logs — never inside the standard message.' },
  { id: 'reference', tag: 'J', title: 'Standard Reference', text: 'Searchable explanations of every message, data frame and data element used by BSM Part I.' },
] as const;

function Workflow() {
  const boxes = [
    { x: 10, label: 'Vehicle sensors', sub: 'GNSS · CAN · IMU', color: 'var(--c-sensor)' },
    { x: 150, label: 'Convert & quantize', sub: 'units · LSB · round', color: 'var(--c-sensor)' },
    { x: 290, label: 'J2735 structure', sub: 'BSMcoreData values', color: 'var(--c-field)' },
    { x: 430, label: 'ASN.1 UPER', sub: 'X.691 unaligned', color: 'var(--c-bits)' },
    { x: 570, label: 'Payload bytes', sub: 'to 1609 / PC5 stack', color: 'var(--c-bits)' },
    { x: 710, label: 'Decode & recover', sub: 'receiver view', color: 'var(--c-field)' },
  ];
  return (
    <svg className="diagram" viewBox="0 0 840 92" role="img" aria-label="Workflow: vehicle sensors, conversion, J2735 structure, UPER encoding, payload bytes, decoding">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--text-3)" />
        </marker>
      </defs>
      {boxes.map((b, i) => (
        <g key={b.label}>
          <rect x={b.x} y={14} width={120} height={60} rx={8} fill="var(--surface)" stroke={b.color} strokeWidth={1.6} />
          <rect x={b.x} y={14} width={120} height={5} rx={2} fill={b.color} />
          <text x={b.x + 60} y={42} textAnchor="middle" fontSize={12.5} fontWeight={600}>{b.label}</text>
          <text x={b.x + 60} y={60} textAnchor="middle" fontSize={10.5} fill="var(--text-3)">{b.sub}</text>
          {i < boxes.length - 1 && <line x1={b.x + 122} y1={44} x2={b.x + 138} y2={44} stroke="var(--text-3)" strokeWidth={1.4} markerEnd="url(#arr)" />}
        </g>
      ))}
    </svg>
  );
}

export function HomePage() {
  const { encoding, build } = useApp();
  const frame = encoding?.ok ? encoding.result.frame : undefined;
  const bsm = encoding?.ok ? encoding.result.bsm : undefined;
  return (
    <div>
      <section className="home-hero">
        <h1>V2X Message Lab</h1>
        <p>
          Learn, build, encode and decode SAE J2735 messages. Start from real vehicle measurements, follow every conversion into
          the standardized Basic Safety Message, and inspect the actual ASN.1 UPER bits a radio would carry.
        </p>
        <Workflow />
        <div className="row">
          <a className="btn primary" href={href('learn')}>Start learning</a>
          <a className="btn" href={href('generator')}>Open the BSM Generator</a>
          <a className="btn" href={href('decoder')}>Decode a payload</a>
        </div>
      </section>

      <div className="card">
        <div className="card-head">
          <h2>The message currently in the lab</h2>
          <a href={href('generator')}>Edit inputs</a>
        </div>
        {frame && bsm ? (
          <>
            <div className="kpi">
              <div><b>{bsm.bitLength}</b><span>BSM bits (Part I)</span></div>
              <div><b>{bsm.bytes.length}</b><span>BSM octets</span></div>
              <div><b>{frame.bytes.length}</b><span>MessageFrame octets</span></div>
              <div><b>{build.issues.filter((i) => i.severity === 'warning').length}</b><span>warnings</span></div>
            </div>
            <p className="mono small" style={{ marginTop: 12, wordBreak: 'break-all' }}>
              <span className="badge bits">MessageFrame</span> {bytesToHex(frame.bytes)}
            </p>
          </>
        ) : (
          <p>The current inputs contain errors. <a href={href('generator')}>Fix them in the generator</a>.</p>
        )}
      </div>

      <h2 style={{ marginTop: 24 }}>Modules</h2>
      <div className="module-cards">
        {MODULES.map((m) => (
          <a key={m.id} href={href(m.id)}>
            <div className="card">
              <div className="tag">Module {m.tag}</div>
              <h3>{m.title}</h3>
              <p className="small muted" style={{ margin: 0 }}>{m.text}</p>
            </div>
          </a>
        ))}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h2>What makes this a laboratory, not a mock-up</h2>
        <ul>
          <li>Bytes are produced by a schema-driven X.691 UPER encoder, not by templates.</li>
          <li>Every encoding is cross-checked in CI against two independent ASN.1 toolchains (asn1tools, pycrate), bit for bit.</li>
          <li>129 real-world BSM payloads decoded by the USDOT JPO ODE (asn1c) toolchain are part of the test suite.</li>
          <li>Bit positions in the explorer are recorded by the codec while it encodes, and their correctness is verified independently.</li>
        </ul>
        <p className="small muted">
          Details, limitations and what remains unverified: <a href={href('about')}>Verification &amp; limits</a>. SAE J2735 is © SAE International; this
          project cites section numbers and does not reproduce the standard.
        </p>
      </div>
    </div>
  );
}
