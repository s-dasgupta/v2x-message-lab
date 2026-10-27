# ASN.1 UPER codec evaluation and selection

## Requirements on the codec

1. Genuine X.691 UPER encoding/decoding of `MessageFrame` and `BasicSafetyMessage` (J2735:2024).
2. Runs entirely in the browser (static GitHub Pages site, no backend, no API keys).
3. Exposes **verified bit positions per field** for the Bit-Level Explorer.
4. Licence compatible with an open-source repository; must not redistribute SAE’s licensed ASN.1.
5. Testable against independent implementations.

## Options considered

| Option | UPER quality | Browser | Field offsets | Licensing / redistribution | Verdict |
|---|---|---|---|---|---|
| **asn1c** (vlm / mouse07410 fork) compiled to WebAssembly | Mature; used by USDOT JPO ODE `asn1_codec` | Possible via Emscripten | No (would need invasive instrumentation) | Generated C is derived from SAE’s ASN.1 module (J2735ASN_202409, a paid SAE product) and would be published with the site | Rejected for the app; its *outputs* (ODE test data) are used as reference vectors |
| **asn1tools** (Python, MIT) via Pyodide | Mature, widely used | ~10–20 MB runtime download | No | Fine | Rejected for the app (size, no offsets); **used as independent validator** |
| **pycrate** (Python, LGPL) via Pyodide | Mature; full information-object-class support | heavy | No | LGPL; fine as an external tool | Rejected for the app; **used as independent validator** |
| JavaScript ASN.1 libraries (asn1.js, asn1js, @peculiar/asn1-schema) | BER/DER only — no PER | Yes | n/a | MIT | Not applicable |
| Other npm packages advertising PER | No widely used, maintained and independently validated UPER package was identified | Yes | No | varies | Not selected |
| **Project-owned TypeScript X.691 engine, schema-driven** | Implements the X.691 rules generically (constrained/extensible INTEGER, ENUMERATED, BIT/OCTET STRING, SEQUENCE with preamble and extension additions, SEQUENCE OF, open types, length determinants incl. fragmentation) | Native, no runtime dependencies | **Yes — recorded while encoding/decoding** | Original MIT code; minimal independent schema | **Selected** |

## Why the selected design is technically justified

- The encoder is *generic*: it implements X.691 clauses, not J2735 special cases, and is driven
  by a declarative schema (`src/j2735/schema`). Adding a message means adding schema objects.
- Bit positions come from the codec itself (`Trace`), and the decoder produces an identical trace.
- Independence is restored by validation rather than by reuse:
  - **asn1tools** and **pycrate** re-encode all 814 exported cases and decode the TypeScript output;
    all are byte- and value-identical. pycrate resolves `MessageFrame.value` through the real
    information-object class (`MESSAGE-ID-AND-TYPE`), independently of this code.
  - **Bit positions** are checked by re-encoding each field at its bounds with asn1tools and
    verifying that only the traced bits change and hold the expected field value (4 096 checks).
  - **Schema transcription** is checked against an independent J2735 implementation: 129 real BSM
    MessageFrames from USDOT JPO ODE whose Part I values were decoded by asn1c compiled from SAE’s
    ASN.1. All values match and all payloads re-encode byte-for-byte.

## Known limitations

- Only the constructs needed by Release 1 are modelled (no CHOICE, SET, REAL, BOOLEAN, NULL,
  character strings or PER-visible constraints other than value/size ranges). Adding a message that
  needs them requires extending `src/asn1/uper.ts` (with tests).
- Open types longer than 16 383 octets are decoded as opaque data (fragmented) and not traced.
- SEQUENCE extension additions are skipped and preserved but cannot be decoded, because J2735:2024
  defines none for the types in scope.
