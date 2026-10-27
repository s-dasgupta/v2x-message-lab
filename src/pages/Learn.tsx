import { useMemo, useState, type ReactNode } from 'react';
import { href } from '../app/router';
import { useApp } from '../app/state';
import { bitsForRange } from '../asn1/bits';
import { typeNotation } from '../asn1/notation';
import { AtLeast, Callout, Ref } from '../components/common';
import { LEAF_FIELDS, entry, fixedUperBits } from '../j2735/catalog';
import { convertSpeed } from '../j2735/conversions/fields';
import { num } from '../j2735/inputs';
import { AccelerationSet4Way, BSMcoreData, Speed } from '../j2735/schema';
import { StackDiagram } from './Encoder';

interface Lesson {
  id: string;
  title: string;
  body: () => ReactNode;
}

function Exercise({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div className="exercise">
      <h4>Exercise</h4>
      <p>{q}</p>
      <details>
        <summary>Show answer</summary>
        <div style={{ marginTop: 6 }}>{children}</div>
      </details>
    </div>
  );
}

function FieldLink({ path, children }: { path: string; children: ReactNode }) {
  const { openDetail } = useApp();
  return (
    <button className="link" onClick={() => openDetail(path)}>
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ lesson 1
function V2XDiagram() {
  return (
    <svg className="diagram" viewBox="0 0 760 210" role="img" aria-label="A braking vehicle broadcasts a BSM that reaches a following vehicle hidden behind a truck and a roadside unit">
      {[0, 1, 2].map((i) => <circle key={i} cx={470} cy={120} r={40 + i * 38} fill="none" stroke="var(--accent)" strokeDasharray="4 5" opacity={0.6 - i * 0.15} />)}
      <rect x={0} y={150} width={760} height={34} fill="var(--surface-2)" />
      <line x1={0} y1={167} x2={760} y2={167} stroke="var(--text-3)" strokeDasharray="14 12" />
      {/* following car */}
      <rect x={70} y={130} width={70} height={30} rx={8} fill="var(--c-sensor)" />
      <text x={105} y={124} textAnchor="middle" fontSize={12}>Car B (receiver)</text>
      {/* truck */}
      <rect x={220} y={98} width={150} height={62} rx={4} fill="var(--text-3)" opacity={0.7} />
      <text x={295} y={92} textAnchor="middle" fontSize={12}>Truck blocks the view</text>
      {/* braking car */}
      <rect x={435} y={130} width={70} height={30} rx={8} fill="var(--err)" />
      <text x={470} y={124} textAnchor="middle" fontSize={12}>Car A brakes hard</text>
      {/* RSU */}
      <rect x={640} y={60} width={8} height={90} fill="var(--text-3)" />
      <rect x={625} y={48} width={38} height={18} rx={3} fill="var(--c-field)" />
      <text x={644} y={38} textAnchor="middle" fontSize={12}>Roadside unit</text>
      <text x={470} y={205} textAnchor="middle" fontSize={11.5} fill="var(--text-2)">BSM ≈ 10×/s: position · speed · heading · acceleration · brakes</text>
    </svg>
  );
}

const lessons: Lesson[] = [
  {
    id: 'v2x',
    title: '1 · What is V2X communication?',
    body: () => (
      <>
        <p>
          <strong>Vehicle-to-everything (V2X)</strong> communication lets vehicles exchange short digital messages directly with other
          vehicles (V2V), roadside infrastructure such as traffic signals (V2I), and other road users. Unlike cameras or radar, a radio
          message can describe what a vehicle is doing even when it is hidden behind a truck or around a corner.
        </p>
        <V2XDiagram />
        <p>
          The most frequent V2X message is the <strong>Basic Safety Message (BSM)</strong>: every equipped vehicle broadcasts its position,
          motion and braking state many times per second (about ten is typical) <Ref s="5.2" />. Applications in nearby vehicles — forward
          collision warning, intersection movement assist, emergency electronic brake light — combine these broadcasts to predict conflicts.
        </p>
        <p>
          SAE J2735 states its purpose as supporting <em>interoperability</em> among V2X applications through a standardized message set
          <Ref s="1.1" />. Safety, mobility and commercial applications are the three priorities it lists <Ref s="4.1" />.
        </p>
        <Exercise q="Car B cannot see Car A. Which BSM fields would let Car B’s application conclude that Car A is decelerating sharply, even before Car A’s speed has dropped much?">
          <p>
            The brake status (<FieldLink path="coreData.brakes.wheelBrakes">wheelBrakes</FieldLink>, ABS, brake boost) changes the moment the
            brakes are applied, and the <FieldLink path="coreData.accelSet.long">longitudinal acceleration</FieldLink> turns strongly negative.
            Speed reacts last.
          </p>
        </Exercise>
      </>
    ),
  },
  {
    id: 'why-standards',
    title: '2 · Why standardized message formats?',
    body: () => (
      <>
        <p>
          A safety warning only works if <em>every</em> vehicle understands every other vehicle’s message — regardless of manufacturer,
          model year or radio supplier. Without a shared format, each pair of manufacturers would need its own translation, and a single
          misinterpreted unit (km/h vs. m/s, degrees vs. radians) could produce false or missed warnings.
        </p>
        <svg className="diagram" viewBox="0 0 760 170" role="img" aria-label="Without a standard, every pair of systems needs a translator; with a standard, each system implements one common format">
          {[0, 1, 2, 3].map((i) => {
            const x = 60 + (i % 2) * 180;
            const y = 30 + Math.floor(i / 2) * 100;
            return <g key={i}><rect x={x} y={y} width={90} height={34} rx={6} fill="var(--surface-2)" stroke="var(--border)" /><text x={x + 45} y={y + 22} textAnchor="middle" fontSize={12}>OEM {String.fromCharCode(65 + i)}</text></g>;
          })}
          {[[105, 64, 105, 130], [285, 64, 285, 130], [150, 47, 240, 47], [150, 147, 240, 147], [150, 60, 240, 134], [150, 134, 240, 60]].map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--err)" strokeWidth={1.5} />
          ))}
          <text x={195} y={16} textAnchor="middle" fontSize={12} fill="var(--text-2)">Without a standard: n(n−1)/2 = 6 translators</text>
          {[0, 1, 2, 3].map((i) => {
            const x = 430 + (i % 2) * 230;
            const y = 30 + Math.floor(i / 2) * 100;
            return <g key={i}><rect x={x} y={y} width={90} height={34} rx={6} fill="var(--surface-2)" stroke="var(--border)" /><text x={x + 45} y={y + 22} textAnchor="middle" fontSize={12}>OEM {String.fromCharCode(65 + i)}</text><line x1={x + 45} y1={y + (y < 100 ? 34 : 0)} x2={590} y2={y < 100 ? 80 : 97} stroke="var(--ok)" strokeWidth={1.5} /></g>;
          })}
          <rect x={540} y={76} width={100} height={26} rx={6} fill="var(--c-field-soft)" stroke="var(--c-field)" />
          <text x={590} y={93} textAnchor="middle" fontSize={12} fontWeight={600}>SAE J2735</text>
          <text x={590} y={16} textAnchor="middle" fontSize={12} fill="var(--text-2)">With a standard: one shared definition</text>
        </svg>
        <p>
          The USDOT report <em>SAE J2735 Standard: Applying the Systems Engineering Process</em> (FHWA-JPO-13-046, 2013) describes how a
          candidate revision of J2735 was derived systematically: stakeholder <strong>user needs</strong> were captured in a Concept of
          Operations, each need was decomposed into <strong>verifiable requirements</strong>, and every requirement was traced to
          <strong> data concepts</strong> — dialogs, messages, data frames and data elements — through a traceability matrix. Data concepts
          without a requirement were questioned; requirements without data concepts were gaps.
        </p>
        <svg className="diagram" viewBox="0 0 760 70" role="img" aria-label="User needs lead to requirements, which lead to data concepts, verified by traceability">
          {['User needs (ConOps)', 'Requirements (SRS)', 'Design: data concepts', 'Traceability & verification'].map((t, i) => (
            <g key={t}>
              <rect x={i * 190 + 5} y={12} width={170} height={40} rx={8} fill="var(--surface)" stroke="var(--accent)" />
              <text x={i * 190 + 90} y={37} textAnchor="middle" fontSize={12}>{t}</text>
              {i < 3 && <text x={i * 190 + 182} y={37} textAnchor="middle" fontSize={14} fill="var(--text-3)">→</text>}
            </g>
          ))}
        </svg>
        <p>
          The report also emphasizes that the standard defines the <em>interface</em> — the data exchanged — and deliberately says nothing
          about how each manufacturer’s applications use it. That separation is what allows competition on applications while preserving
          interoperability on the air. (That 2013 report is background; the technical definitions on this site follow SAE J2735:2024.)
        </p>
        <Exercise q="A stakeholder asks for 'the vehicle’s VIN in every BSM so incidents can be investigated'. Using the systems-engineering view, what questions would you ask before adding a data element?">
          <p>
            What is the underlying user need (incident reconstruction?), is it verifiable, does it conflict with other needs (privacy — see
            <FieldLink path="coreData.id"> TemporaryID</FieldLink>), and is a broadcast safety message the right place to satisfy it at all?
            The BSM intentionally carries a short-lived random identifier instead.
          </p>
        </Exercise>
      </>
    ),
  },
  {
    id: 'scope',
    title: '3 · What SAE J2735 defines — and what it does not',
    body: () => (
      <>
        <div className="grid-2">
          <div>
            <h3>Defined by J2735</h3>
            <ul>
              <li>The message set: messages, data frames and data elements <Ref s="5" /> <Ref s="6" /> <Ref s="7" /></li>
              <li>Their structure, ranges, units, resolutions and special values, in ASN.1 <Ref s="11.1" /></li>
              <li>The default encoding: UPER unless an application specification says otherwise <Ref s="4.4" /></li>
              <li>The MessageFrame and message identifiers <Ref s="5.1" /> <Ref s="7.44" /></li>
              <li>Mechanisms for regional extensions <Ref s="11.2" /></li>
              <li>Conformance in terms of format and encoding <Ref s="10" /></li>
            </ul>
          </div>
          <div>
            <h3>Not defined by J2735</h3>
            <ul>
              <li>Radio technology: IEEE 802.11 (DSRC) or 3GPP C-V2X sidelink <Ref s="4.2" /></li>
              <li>Network/transport headers: WSMP (IEEE 1609.3)</li>
              <li>Security, signatures, certificates: IEEE 1609.2; permissions per SAE J2945/5 <Ref s="4.2.2" /></li>
              <li>How often to send, accuracy targets, congestion control: application standards such as SAE J2945/1 <Ref s="4.5" /></li>
              <li>What an application does with the data (warnings, automation)</li>
            </ul>
          </div>
        </div>
        <Callout>
          <p>
            In this lab, every byte you generate is the <strong>J2735 payload only</strong>. It is what a vehicle would hand to its security
            and radio layers — not what would appear on an antenna.
          </p>
        </Callout>
      </>
    ),
  },
  {
    id: 'hierarchy',
    title: '4 · Messages, data frames and data elements',
    body: () => (
      <>
        <p>J2735 builds every message from three levels of reusable building blocks <Ref s="4.3" />:</p>
        <ul>
          <li><strong>Data element (DE)</strong> — the smallest standardized unit, e.g. <FieldLink path="coreData.speed">DE_Speed</FieldLink>: one number with a range, unit and resolution.</li>
          <li><strong>Data frame (DF)</strong> — a group of elements (and possibly other frames), e.g. <FieldLink path="coreData.accelSet">DF_AccelerationSet4Way</FieldLink> = longitudinal, lateral and vertical acceleration plus yaw rate.</li>
          <li><strong>Message (MSG)</strong> — the top level that applications exchange, e.g. the BasicSafetyMessage.</li>
        </ul>
        <svg className="diagram" viewBox="0 0 760 200" role="img" aria-label="BasicSafetyMessage contains BSMcoreData, which contains elements and frames such as AccelerationSet4Way">
          <rect x={290} y={8} width={180} height={34} rx={6} fill="var(--c-bits-soft)" stroke="var(--c-bits)" />
          <text x={380} y={30} textAnchor="middle" fontSize={12.5} fontWeight={600}>MSG BasicSafetyMessage</text>
          <line x1={380} y1={42} x2={380} y2={66} stroke="var(--text-3)" />
          <rect x={290} y={66} width={180} height={34} rx={6} fill="var(--c-field-soft)" stroke="var(--c-field)" />
          <text x={380} y={88} textAnchor="middle" fontSize={12.5}>DF BSMcoreData (Part I)</text>
          {['DE MsgCount', 'DE Latitude', 'DE Speed', 'DF AccelerationSet4Way', 'DF BrakeSystemStatus'].map((t, i) => (
            <g key={t}>
              <line x1={380} y1={100} x2={70 + i * 155} y2={130} stroke="var(--text-3)" />
              <rect x={5 + i * 155} y={130} width={140} height={30} rx={6} fill={t.startsWith('DF') ? 'var(--c-field-soft)' : 'var(--c-sensor-soft)'} stroke={t.startsWith('DF') ? 'var(--c-field)' : 'var(--c-sensor)'} />
              <text x={75 + i * 155} y={150} textAnchor="middle" fontSize={11.5}>{t}</text>
            </g>
          ))}
          <text x={380} y={188} textAnchor="middle" fontSize={11} fill="var(--text-3)">… and 9 more Part I components</text>
        </svg>
        <p>
          Because elements are reused, the same DE_Acceleration definition serves both the longitudinal and lateral components, and the
          same AccelerationSet4Way appears in other messages such as the PSM <Ref s="6.1" />. Names are formal: always cite
          <code> DE_Speed</code>, not a section number, because numbering changes between editions <Ref s="5" />.
        </p>
      </>
    ),
  },
  {
    id: 'bsm',
    title: '5 · How a BSM is organized',
    body: () => <BsmLayout />,
  },
  {
    id: 'asn1',
    title: '6 · What is ASN.1?',
    body: () => (
      <>
        <p>
          <strong>Abstract Syntax Notation One (ASN.1)</strong>, standardized by ITU-T X.680, is a language for describing data
          structures independently of any programming language or byte layout. J2735 publishes its definitions in ASN.1, and the ASN.1
          together with its comments is normative <Ref s="11.1" />.
        </p>
        <p>Two definitions, as generated from this lab’s encoder schema:</p>
        <pre className="code">{`Speed ::= ${typeNotation(Speed, '', true)}\n\nAccelerationSet4Way ::= ${typeNotation(AccelerationSet4Way, '', true)}`}</pre>
        <ul>
          <li><code>INTEGER (0..8191)</code> is a <em>constraint</em>: only these values are legal. It is what lets an encoder use exactly 13 bits.</li>
          <li><code>SEQUENCE</code> is an ordered group of named components — a data frame.</li>
          <li>Other types used by the BSM: <code>ENUMERATED</code> (named states), <code>BIT STRING</code> (independent flags) and <code>OCTET STRING</code> (opaque bytes).</li>
        </ul>
        <p>
          ASN.1 says <em>what</em> the data is (the abstract syntax). Separate <strong>encoding rules</strong> say how a value becomes bytes:
          BER, DER, XER, JER, OER, and the Packed Encoding Rules used by J2735 <Ref s="4.4" />.
        </p>
        <Exercise q="DE_Heading is INTEGER (0..28800). How many bits does UPER need, and which value would you expect to mean 'unavailable'?">
          <p>28 801 possible values need ⌈log₂ 28 801⌉ = 15 bits. The top value 28800 (= 360°, equivalent to 0°) is used for unavailable <Ref s="7.60" />.</p>
        </Exercise>
      </>
    ),
  },
  {
    id: 'uper',
    title: '7 · Why UPER?',
    body: () => <WhyUper />,
  },
  {
    id: 'encoding',
    title: '8 · How encoding and decoding work',
    body: () => <EncodeWalkthrough />,
  },
  {
    id: 'stack',
    title: '9 · J2735 and the radio stack (C-V2X PC5, DSRC)',
    body: () => (
      <>
        <p>
          J2735 was first written for DSRC (IEEE 802.11-based) radios, but its messages are independent of the radio. The 2024 edition notes
          that cellular V2X sidelink (3GPP <strong>PC5</strong>), ordinary cellular networks, Wi-Fi or any medium meeting the application’s
          requirements may carry them <Ref s="4.2" />. Typical range is under 1000 m <Ref s="4.2.1" />.
        </p>
        <StackDiagram />
        <ol>
          <li><strong>Application</strong> builds a J2735 MessageFrame containing the BSM (UPER) — what this lab produces.</li>
          <li><strong>Security (IEEE 1609.2)</strong> signs it and attaches certificate information; the PSID/SSP mechanism authorizes the sender <Ref s="4.2.2" />.</li>
          <li><strong>Network (IEEE 1609.3 WSMP)</strong> adds a short header identifying the service (PSID).</li>
          <li><strong>Radio</strong>: LTE-V2X / NR-V2X PC5 sidelink (3GPP) or IEEE 802.11 OCB transmits the packet. SAE J3161/1 and J2945/1 define on-board requirements for the respective technologies (listed in J2735 §2.1.1).</li>
        </ol>
        <Callout kind="warn">
          <p>
            A captured over-the-air packet therefore usually starts with IEEE 1609.2 and/or WSMP bytes, not with <code>00 14</code>. The
            <a href={href('decoder')}> decoder</a> recognises some of these situations and explains them, but extracting payloads from IEEE 1609.2 is
            outside Release 1.
          </p>
        </Callout>
      </>
    ),
  },
];

function BsmLayout() {
  const comps = BSMcoreData.fields.map((f) => ({ name: f.name, bits: fixedUperBits(f.type)! }));
  const total = comps.reduce((s, c) => s + c.bits, 0);
  const hues = [205, 260, 30, 190, 170, 120, 95, 330, 10, 50, 290, 225, 0, 150];
  let x = 0;
  return (
    <>
      <p>
        A BSM has two parts <Ref s="5.2" />. <strong>Part I</strong> (DF_BSMcoreData) is mandatory in every message. <strong>Part II</strong>{' '}
        is an optional list of extension blocks (vehicle safety extensions with path history, special-vehicle data, supplemental
        data) added according to policies outside J2735. A third, optional <strong>regional</strong> list exists for regional extensions.
      </p>
      <p>The 14 Part I components and their exact UPER bit budget (computed from the constraints — {total} bits in total):</p>
      <svg className="diagram" viewBox="0 0 760 80" role="img" aria-label={`Bit budget of BSM Part I: ${total} bits`}>
        {comps.map((c, i) => {
          const w = (c.bits / total) * 750;
          const g = (
            <g key={c.name}>
              <rect x={5 + x} y={10} width={w - 1} height={34} fill={`hsl(${hues[i]} 65% 75%)`} />
              {w > 24 && <text x={5 + x + w / 2} y={31} textAnchor="middle" fontSize={10} fill="#1b1f24">{c.bits}</text>}
              {w > 34 && <text x={5 + x + w / 2} y={60} textAnchor="middle" fontSize={9.5}>{c.name}</text>}
            </g>
          );
          x += w;
          return g;
        })}
      </svg>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Component</th><th>Type</th><th className="num">Bits</th><th>§</th></tr></thead>
          <tbody>
            {BSMcoreData.fields.map((f) => {
              const id = { msgCnt: 'DE_MsgCount', id: 'DE_TemporaryID', secMark: 'DE_DSecond', lat: 'DE_Latitude', long: 'DE_Longitude', elev: 'DE_Elevation', accuracy: 'DF_PositionalAccuracy', transmission: 'DE_TransmissionState', speed: 'DE_Speed', heading: 'DE_Heading', angle: 'DE_SteeringWheelAngle', accelSet: 'DF_AccelerationSet4Way', brakes: 'DF_BrakeSystemStatus', size: 'DF_VehicleSize' }[f.name]!;
              return (
                <tr key={f.name}>
                  <td><FieldLink path={`coreData.${f.name}`}>{f.name}</FieldLink></td>
                  <td className="mono small">{f.type.name}</td>
                  <td className="num">{fixedUperBits(f.type)}</td>
                  <td><Ref s={entry(id).section} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p>
        Because BSMcoreData has no OPTIONAL components and no extension marker, its encoding has a fixed length. With the BSM’s own
        3 preamble bits (extension bit + 2 presence bits) a Part-I-only BSM is 293 bits → 37 octets.
      </p>
      <Exercise q="Why does a receiver not need any 'field separators' or tags to find the speed inside those 293 bits?">
        <p>Every component before speed has a fixed width, so speed always starts at bit 172 of a Part-I-only BasicSafetyMessage. Order and widths come from the shared ASN.1 schema.</p>
      </Exercise>
    </>
  );
}

function WhyUper() {
  const { build, encoding } = useApp();
  const [lb, setLb] = useState('-2000');
  const [ub, setUb] = useState('2001');
  const lo = Number(lb);
  const hi = Number(ub);
  const valid = Number.isSafeInteger(lo) && Number.isSafeInteger(hi) && hi >= lo;
  const json = build.coreData ? JSON.stringify({ coreData: build.coreData }).length : 0;
  const naive = LEAF_FIELDS.length * 4; // every leaf value in a 32-bit word
  const uperBytes = encoding?.ok ? encoding.result.bsm.bytes.length : 37;
  return (
    <>
      <p>
        V2X radio channels are shared by every vehicle in range, and each vehicle sends about ten BSMs per second. Every byte saved per
        message means less channel congestion and lower latency. J2735 is therefore optimized for the <strong>Unaligned Packed Encoding Rules</strong>
        (UPER, ITU-T X.691), and UPER is mandatory when no other encoding is specified <Ref s="4.4" /> <Ref s="11.1" />.
      </p>
      <p>UPER’s key idea: if both sides know the constraints, a value only needs enough bits to distinguish the legal values.</p>
      <div className="exercise">
        <h4>Try it: bits needed for a constrained INTEGER</h4>
        <div className="row">
          <label>lower bound <input type="text" value={lb} onChange={(e) => setLb(e.target.value)} style={{ width: 110 }} /></label>
          <label>upper bound <input type="text" value={ub} onChange={(e) => setUb(e.target.value)} style={{ width: 110 }} /></label>
          {valid ? (
            <span>range = {hi - lo + 1} values → <strong>{bitsForRange(hi - lo + 1)} bits</strong></span>
          ) : (
            <span className="muted">enter integers with upper ≥ lower</span>
          )}
        </div>
        <p className="small muted" style={{ marginTop: 6 }}>Try DE_Acceleration (−2000..2001), DE_Latitude (−900000000..900000001), MsgCount (0..127).</p>
      </div>
      <h3>The current BSM in three encodings</h3>
      <table className="data">
        <tbody>
          <tr><td>UPER (actual encoding of the current generator BSM)</td><td className="num"><strong>{uperBytes} octets</strong></td></tr>
          <tr><td>Naive binary: every one of the {LEAF_FIELDS.length} leaf values in a 32-bit word</td><td className="num">{naive} octets</td></tr>
          <tr><td>Compact JSON text of the same values</td><td className="num">{json} octets</td></tr>
        </tbody>
      </table>
      <AtLeast min="engineering">
        <p className="small" style={{ marginTop: 8 }}>
          Unaligned PER also skips the padding that the aligned variant inserts before many fields, so fields straddle octet boundaries.
          The price: nothing in the bytes is self-describing — without the exact schema the bits are meaningless, and a single schema
          mismatch shifts every following field.
        </p>
      </AtLeast>
    </>
  );
}

function EncodeWalkthrough() {
  const [kmh, setKmh] = useState(50);
  const c = useMemo(() => convertSpeed(num(String(kmh), 'km/h')), [kmh]);
  const code = typeof c.j2735Value === 'number' ? c.j2735Value : 0;
  const bits = code.toString(2).padStart(13, '0');
  return (
    <>
      <p>Follow one value — speed — through the encoder and back through a decoder.</p>
      <div className="exercise">
        <label htmlFor="spd">Vehicle speed: <strong>{kmh} km/h</strong></label>
        <input id="spd" type="range" min={0} max={250} step={0.5} value={kmh} onChange={(e) => setKmh(Number(e.target.value))} style={{ width: '100%' }} />
        <ol className="steps">
          <li><b>Convert to the element’s unit:</b> {kmh} km/h ÷ 3.6 = {c.physical ? c.physical.value.toFixed(6) : '—'} m/s</li>
          <li><b>Scale by the LSB (0.02 m/s):</b> {c.scaled?.toFixed(4)}</li>
          <li><b>Round to the nearest integer</b> <Ref s="11.5" />: <span className="v-field">{code}</span></li>
          <li><b>Check the constraint</b> Speed ::= INTEGER (0..8191): {code} is legal; 8191 is reserved for unavailable <Ref s="7.196" /></li>
          <li><b>Subtract the lower bound</b> (0) and write in ⌈log₂ 8192⌉ = 13 bits: <span className="v-bits">{bits}</span></li>
          <li><b>Place it in sequence:</b> in a Part-I-only BasicSafetyMessage these 13 bits occupy bits 172–184, right after the 3-bit transmission state.</li>
          <li><b>Decoder:</b> reads 13 bits at that position → {code} → × 0.02 = {(code * 0.02).toFixed(2)} m/s = {(code * 0.072).toFixed(3)} km/h.</li>
        </ol>
        <p className="small muted">Quantization error: {c.quantizationError ? `${(c.quantizationError.value * 3.6).toFixed(4)} km/h` : '—'} (always within ±0.036 km/h).</p>
      </div>
      <p>
        Decoding is the mirror image: the decoder walks the same schema in the same order, reading exactly as many bits as each constraint
        implies, and checks every value against its range — e.g. a 15-bit heading field could hold 32767, which a strict decoder must reject
        because DE_Heading stops at 28800.
      </p>
      <p>
        See every field this way in the <a href={href('bits')}>Bit Explorer</a>, or try decoding real captured BSMs in the{' '}
        <a href={href('decoder')}>Decoder</a>.
      </p>
    </>
  );
}

export function LearnPage({ lesson }: { lesson?: string }) {
  const idx = Math.max(0, lessons.findIndex((l) => l.id === lesson));
  const current = lessons[idx]!;
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="muted small">Module A</div>
          <h1>Learn SAE J2735</h1>
        </div>
      </div>
      <div className="learn-layout">
        <nav className="lesson-nav card" aria-label="Lessons">
          {lessons.map((l) => (
            <a key={l.id} href={href('learn', l.id)} aria-current={l.id === current.id ? 'true' : undefined}>
              {l.title}
            </a>
          ))}
        </nav>
        <article className="card prose">
          <h2>{current.title}</h2>
          {current.body()}
          <div className="row" style={{ marginTop: 18, justifyContent: 'space-between' }}>
            {idx > 0 ? <a className="btn" href={href('learn', lessons[idx - 1]!.id)}>← {lessons[idx - 1]!.title}</a> : <span />}
            {idx < lessons.length - 1 ? (
              <a className="btn primary" href={href('learn', lessons[idx + 1]!.id)}>{lessons[idx + 1]!.title} →</a>
            ) : (
              <a className="btn primary" href={href('generator')}>Build your own BSM →</a>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
