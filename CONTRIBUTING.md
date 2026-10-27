# Contributing to V2X Message Lab

Thank you for helping. Correctness comes before features: a change that makes the site prettier but
weakens the codec or its verification will not be merged.

## Ground rules

1. **SAE J2735_202409 is the authority** for message definitions. Cite the section for every new
   statement about the standard, and label it normative / recommended / informative /
   implementation / unverified (see `src/j2735/catalog/types.ts`).
2. **Never copy text from the SAE standard** or commit SAE’s ASN.1 files, PDFs, or code generated from
   them. Write original explanations.
3. **Never invent encoded bytes or validation results.** Samples and fixtures must be produced by the
   codec (`npm run export:samples`) or come from a cited, licence-compatible independent source.
4. If something cannot be verified from the standard, say so in the UI and in `docs/VERIFICATION.md`.

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit + UI tests
npm run typecheck
npm run build
```

Independent validation (Python 3.10+):

```bash
pip install -r tools/validation/requirements.txt
npm run export:vectors
python tools/validation/cross_validate.py
```

## Project layout

| Path | Responsibility |
|---|---|
| `src/asn1/` | Generic X.691 UPER engine (types, bit I/O, encode/decode with bit tracing, ASN.1 notation printer) |
| `src/j2735/schema/` | Machine-readable J2735 types (schema only, no prose) |
| `src/j2735/catalog/` | Original educational metadata and the BSM field registry |
| `src/j2735/conversions/` | Pure, unit-tested sensor → J2735 conversion functions |
| `src/j2735/bsmBuilder.ts` | Builds BSMcoreData + validation from inputs |
| `src/j2735/interpret.ts` | J2735 value → physical meaning (receiver view) |
| `src/j2735/codec.ts` | BSM / MessageFrame encode & decode, hex parsing, diagnostics |
| `src/j2735/data/` | Scenarios, decoder samples, deterministic test-value generators |
| `src/components/`, `src/pages/` | React UI (modules A–J) |
| `tests/unit`, `tests/ui`, `tests/fixtures` | Vitest suites and reference vectors |
| `tools/validation/` | Independent cross-validation and fixture builder (Python) |
| `scripts/` | Vector, sample and traceability generators |
| `docs/` | Traceability, codec evaluation, verification, standards/copyright, publishing |

## Adding another J2735 message (e.g. SPaT, MAP, PSM)

1. Add its types to `src/j2735/schema/` and register its `DSRCmsgID` in `SUPPORTED_MESSAGE_TYPES`.
2. If it needs ASN.1 constructs the engine does not support yet (e.g. CHOICE), implement them in
   `src/asn1/uper.ts` following X.691, with hand-derived bit-pattern tests.
3. Add catalog entries (original text + section numbers) and a field registry.
4. Extend `scripts/export-validation-vectors.ts` so asn1tools/pycrate check the new type, and find
   independent reference vectors before claiming interoperability.
5. Add UI modules. Keep conversions in pure functions with tests.

## Pull requests

- Include tests for every behaviour change; `npm test`, `npm run typecheck` and the cross-validation
  must pass.
- Regenerate derived files when relevant: `npm run export:samples`,
  `npx tsx scripts/generate-field-traceability.ts`.
- Describe which statements are normative and where they come from.
