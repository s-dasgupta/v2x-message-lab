import { PageHead, Ref } from '../components/common';

export function AboutPage() {
  return (
    <div>
      <PageHead title="Verification, limitations and sources">
        What has been verified, how, and what has not. Correctness claims on this site are limited to what is listed here.
      </PageHead>

      <div className="card">
        <h2>Codec</h2>
        <p>
          Encoding and decoding use this project’s own schema-driven implementation of ITU-T X.691 Unaligned PER (TypeScript, runs entirely
          in the browser). It was chosen because no mature, browser-native and appropriately licensed J2735 UPER codec exists that also
          exposes bit positions; WebAssembly builds of asn1c would require compiling SAE’s licensed ASN.1 module into the published site and
          still would not report field offsets. The schema is an independent transcription of the BSM Part I types (see the ASN.1 view in the
          Structure module).
        </p>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Evidence</h2>
          <table className="data">
            <thead><tr><th>Check</th><th>Demonstrates</th></tr></thead>
            <tbody>
              <tr><td>Unit tests of X.691 rules with hand-derived bit patterns (integers, enumerations, bit/octet strings, sequences, extension bits, open types, fragmentation)</td><td>syntactic correctness of the engine</td></tr>
              <tr><td>Conversion tests against J2735 ranges, LSBs, special values, and the §11.5 Table 1 speed values</td><td>correct field values</td></tr>
              <tr><td>814 encodings (5 scenarios, min/max bounds, 400 random BSMs × 2 entry types) re-encoded and decoded by <strong>asn1tools</strong> and <strong>pycrate</strong>: byte-identical</td><td>UPER encoding matches two independent toolchains</td></tr>
              <tr><td>4 096 bit-trace checks: each field re-encoded at its bounds by asn1tools; only the traced bits may change</td><td>bit positions shown in the explorer are correct</td></tr>
              <tr><td>129 BSM MessageFrames from the USDOT JPO ODE project (real logs), Part I decoded by their asn1c-based codec: identical values, byte-exact re-encoding</td><td>interoperability of schema and codec with an independent J2735 implementation</td></tr>
              <tr><td>Malformed, truncated, foreign-type, wrapped and random payloads</td><td>robust rejection of invalid input</td></tr>
            </tbody>
          </table>
          <p className="small muted">The cross-validation runs in CI on every push (see <code>tools/validation</code> and <code>docs/VERIFICATION.md</code> in the repository).</p>
        </div>
        <div className="card">
          <h2>Limitations of Release 1</h2>
          <ul className="small">
            <li>Only the Basic Safety Message is supported. Other messages in a MessageFrame are recognised by messageId and skipped, not decoded.</li>
            <li>Part II content and regional extensions are preserved byte-for-byte but not interpreted, and the generator does not create them.</li>
            <li>IEEE 1609.2 security envelopes, WSMP headers and radio framing are out of scope; payloads must be extracted first.</li>
            <li>Not a conformance test tool: J2735 conformance <Ref s="10" /> also requires behaviour defined in application standards (e.g. SAE J2945/1), which were not supplied.</li>
            <li>Quantization ties are rounded away from zero, and secMark is truncated to the millisecond — implementation choices where the standard is silent.</li>
            <li>DE_YawRate has no unavailable code; “unavailable” is sent as 0 with a warning.</li>
            <li>Unverified interpretations are labelled in the field notes (e.g. the sign in the DE_VerticalAcceleration −126 comment, gravity compensation of vertical acceleration).</li>
            <li>X.691 clause numbers in tooltips refer to the 02/2021 edition and are given for orientation.</li>
          </ul>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Sources</h2>
          <ul className="small">
            <li>SAE J2735_202409, <em>V2X Communications Message Set Dictionary</em> — primary technical authority. © SAE International; not reproduced here. <a href="https://www.sae.org/standards/content/j2735_202409/" target="_blank" rel="noreferrer">sae.org</a></li>
            <li>FHWA-JPO-13-046, <em>SAE J2735 Standard: Applying the Systems Engineering Process</em> (USDOT, 2013) — background on user needs and interoperability; it does not override J2735:2024.</li>
            <li>ITU-T X.680 (ASN.1) and X.691 (PER) — freely available from the ITU.</li>
            <li>USDOT ITS JPO ODE projects (Apache-2.0) — independent reference vectors.</li>
          </ul>
        </div>
        <div className="card">
          <h2>Copyright and licensing</h2>
          <p className="small">
            Project code is MIT-licensed. Explanations are original and cite section numbers only. The official SAE J2735 ASN.1 module is a
            separate SAE product and is not included. The minimal schema in this project (type names, component order, ranges) is
            necessary for interoperability; users with redistribution concerns should review SAE’s licence terms.
          </p>
        </div>
      </div>
    </div>
  );
}
