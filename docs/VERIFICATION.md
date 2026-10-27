# Verification and test results

Results below were obtained on 2026-10-26 (Node 24.15, Python 3.14.4) and are reproduced on every
push by `.github/workflows/deploy.yml`. The latest independent report is in
[validation-report.md](validation-report.md).

## How to run

```bash
npm test                               # 264 Vitest unit + UI tests
npm run typecheck && npm run build     # strict TypeScript + production build
npm run export:vectors                 # writes tools/validation/generated/vectors.json
pip install -r tools/validation/requirements.txt
python tools/validation/cross_validate.py --report docs/validation-report.md
```

## What each kind of test demonstrates

| Evidence | Tests | Demonstrates | Does **not** demonstrate |
|---|---|---|---|
| X.691 rule tests with hand-derived bit patterns | `tests/unit/uper-engine.test.ts` (43 tests) | the engine follows X.691 for every construct used | J2735 schema correctness |
| Conversion tests | `tests/unit/conversions.test.ts` (32 tests) incl. §11.5 Table 1 | ranges, LSBs, rounding, saturation, special values, heading wrap, ± coordinates, signed values | behaviour required only by application standards (J2945/1) |
| Construction, round-trip and error tests | `tests/unit/bsm-codec.test.ts` (30 tests; 500 random round trips; 300 random-byte rejections) | complete Part I construction; 37/40-octet sizes; MessageFrame vs BSM; malformed/truncated/foreign payload handling | interoperability by itself (self-consistency only) |
| Bit-trace tests | `tests/unit/bit-trace.test.ts` (5 tests) | spans tile every bit; encoder = decoder trace; field bits equal field values | — |
| Catalog tests | `tests/unit/catalog.test.ts` (7 tests) | every Part I field documented and linked to the right schema type | — |
| **Independent encoders** | `tools/validation/cross_validate.py` — asn1tools 0.169.0, pycrate 0.8.1 | 814/814 encodings byte-identical, 814/814 decodings value-identical, in two independent toolchains (**syntactic correctness**) | that the schema transcription equals SAE’s module (both tools read the same transcription) |
| **Independent bit positions** | same script, 4 096 checks | every traced field span is exactly where an independent encoder puts the field | — |
| **Independent J2735 implementation** | `tests/unit/reference-vectors.test.ts` (131 tests) + script | 129 real BSM MessageFrames (USDOT JPO ODE logs, decoded by asn1c built from SAE’s ASN.1): identical Part I values in TypeScript, asn1tools and pycrate; byte-exact re-encoding (**interoperability**) | Part II content correctness (opaque in Release 1) |
| UI smoke tests (jsdom) | `tests/ui/app.test.tsx` (16 tests) | all modules render; generator→encoder→compare flow; decoder rejects bad hex; research ID stays out of the payload | visual design |
| Layout check (manual, browser) | all 16 main routes at 1280 px and 375 px | no horizontal page overflow after fixes | every device/browser |

## Results (this run)

```text
Vitest: 7 files, 264 tests passed, 0 failed
check                                      pass   fail
decode/asn1tools                            814      0
decode/pycrate                              814      0
encode/asn1tools                            814      0
encode/pycrate                              814      0
reference/asn1tools-reencode                129      0
reference/asn1tools-vs-asn1c                129      0
reference/pycrate-vs-asn1c                  129      0
reference/typescript-vs-asn1c               129      0
trace                                      4096      0
```

A negative control was run: shifting one traced span by one bit and corrupting one payload octet
made the validator report trace, encode and decode failures, confirming the checks are not vacuous.

## Unverified or out of scope

- **Official SAE ASN.1 module**: not available to the project (paid SAE product). Schema fidelity is
  supported indirectly by the 129 asn1c-decoded reference vectors, which exercise every Part I field
  but not every value.
- **Reference vectors cover typical deployed values** (many "unavailable" codes). Extreme values are
  covered only by the asn1tools/pycrate checks against this project’s schema.
- **Application-level requirements** (SAE J2945/1 accuracy, rates, which entry type to transmit, time
  base details) were not among the supplied documents and are not checked.
- **IEEE 1609.2 / WSMP / PC5** handling is out of scope.
- **Interpretations flagged "unverified"** in the field notes (vertical-acceleration −126 comment sign;
  gravity compensation).
- **Accessibility** has been designed for (keyboard navigation, labels, focus styles, ARIA roles) but
  has not been audited with assistive technology.
