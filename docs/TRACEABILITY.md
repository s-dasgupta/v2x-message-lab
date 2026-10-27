# Requirements and traceability (Release 1)

Field-level details (constraint, UPER width, LSB, special values, converter) are in the generated
[FIELD_TRACEABILITY.md](FIELD_TRACEABILITY.md). This document traces the project requirements to the
standard, to the implementation and to the tests — in the spirit of the needs → requirements →
design → verification chain described in FHWA-JPO-13-046.

## 1. Standards requirements implemented

| ID | Requirement (paraphrased; see the cited section for the normative text) | J2735:2024 | Implementation | Verification |
|---|---|---|---|---|
| S-1 | Encode with UPER when no application specification names another encoding | §4.4, §11.1 | `src/asn1/uper.ts` | `tests/unit/uper-engine.test.ts`; cross-validation |
| S-2 | MessageFrame = messageId (DSRCmsgID 0..32767) + open-type value; extensible | §5.1, §7.44 | `src/j2735/schema/index.ts` `MessageFrame` | `bsm-codec.test.ts` (00 14 header); pycrate table-constraint decode |
| S-3 | BSM identified by messageId 20 | §7.44 | `BSM_MESSAGE_ID` | `bsm-codec.test.ts`, reference vectors |
| S-4 | BSM = coreData (mandatory) + partII (1..8, OPTIONAL) + regional (1..4, OPTIONAL), extensible | §5.2 | `BasicSafetyMessage` | `bit-trace.test.ts` (3-bit preamble), cross-validation |
| S-5 | Part I in every BSM; BSM without Part II is valid | §5.2 | generator emits Part I only; builder refuses incomplete Part I | `bsm-codec.test.ts` “never returns a partial structure” |
| S-6 | BSMcoreData: 14 mandatory components in fixed order | §6.10 | `BSMcoreData` | `catalog.test.ts` (order), 290-bit size test |
| S-7 | Nested frames: PositionalAccuracy, AccelerationSet4Way, BrakeSystemStatus, VehicleSize | §6.97, §6.1, §6.9, §6.169 | schema + converters | conversion and codec tests |
| S-8 | Data element ranges, LSBs, unavailable and saturation codes | §7.x (see field table) | `src/j2735/conversions/fields.ts`, `interpret.ts` | `conversions.test.ts` |
| S-9 | Reserved values (DSecond 61000–65534, TransmissionState 4–6, AuxiliaryBrakeStatus 3) | §7.43, §7.226, §7.16 | not selectable in the generator; flagged by decoder | `bsm-codec.test.ts` “reserved values” |
| S-10 | Convert speed with full precision, then round to the element’s LSB | §11.5 (recommended) | `quantize()` | §11.5 Table 1 reproduced in `conversions.test.ts` |
| S-11 | Axes: +x forward, +y right, +z down, +yaw clockwise; WGS-84 position at vehicle-outline centre | §6.1, §11.4, §11.5 | input hints, scenarios | scenario physics (`scenarios.ts`) |
| S-12 | Conformance: required fields present, order, ranges, valid ASN.1 encoding | §10 | builder + encoder validation | cross-validation with two independent toolchains |
| S-13 | Receivers must not break on unknown content (extensions, regional, other messages) | §5.1 remarks, §11.2 | open types and extension additions are skipped by length and preserved | `uper-engine.test.ts`, reference vectors with Part II |

## 2. Project requirements (from the specification) → modules

| Spec item | Module / feature | Main files | Tests |
|---|---|---|---|
| Learn J2735 (9 topics) | A — Learn | `src/pages/Learn.tsx` | `tests/ui/app.test.tsx` (all lessons render) |
| Real measurements, units, examples, ranges, unavailable/reserved handling, validation, scenarios | B — Generator | `src/pages/Generator.tsx`, `src/j2735/inputs.ts`, `data/scenarios.ts` | `bsm-codec.test.ts`, UI tests |
| Raw → physical → quantization → J2735 → reconstructed → error, every Part I field | C — Transformation explorer | `src/components/Pipeline.tsx`, `conversions/` | `conversions.test.ts` |
| Four synchronized views, expandable tree, detail panel | D — Structure | `src/pages/Structure.tsx`, `StructureTree.tsx`, `FieldDetail.tsx` | UI tests, `catalog.test.ts` |
| Real UPER for BSM and MessageFrame; hex/binary/size/download/copy/status | E — Encoder | `src/pages/Encoder.tsx`, `src/j2735/codec.ts` | codec tests, cross-validation |
| Verified bit positions, field selection, encoding rules | F — Bit explorer | `src/pages/BitExplorer.tsx`, `BitGrid.tsx`, trace in `uper.ts` | `bit-trace.test.ts`, 4096 independent trace checks |
| Hex/file/sample decoding with error classes; 1609.2 explanation | G — Decoder | `src/pages/Decoder.tsx`, `data/samples.ts` | `bsm-codec.test.ts` (errors, samples), UI test |
| Inputs → values → bytes → decoded → recovered, with quantization | H — Compare | `src/pages/Compare.tsx` | round-trip tests (500 random) |
| Research ID kept out of the BSM; logs and exports | I — Research | `src/pages/Research.tsx`, `src/app/state.tsx` | UI test (logged payload unchanged) |
| Searchable reference with section numbers | J — Reference | `src/pages/Reference.tsx`, `src/j2735/catalog/` | `catalog.test.ts` (search) |
| Beginner / Engineering / Advanced modes | all | `AtLeast`, `useModeAtLeast` | manual |
| Light/dark, responsive, keyboard | all | `src/styles/app.css`, `App.tsx` | manual + automated overflow check (see VERIFICATION.md) |
| GitHub Pages, relative paths | deployment | `vite.config.ts`, `.github/workflows/deploy.yml` | CI build |

## 3. Error classes required for the decoder

| Required error | Code(s) produced | Where |
|---|---|---|
| Invalid hexadecimal strings | parse error (odd digits, bad characters, empty) | `parseHexInput` |
| Truncated payloads | `TRUNCATED` | `BitReader`, open types |
| Malformed encoding | `OPEN_TYPE_LENGTH_MISMATCH`, `NONZERO_PADDING`, `TRAILING_DATA`, `UNSUPPORTED_ENCODING` | `uper.ts` |
| Unsupported ASN.1 structures / extension content | `UNKNOWN_EXTENSION_ADDITIONS`, `OPAQUE_OPEN_TYPE`, `UNKNOWN_ENUM_EXTENSION` | `uper.ts` |
| Incorrect message types | `UNSUPPORTED_MESSAGE_TYPE`, `LOOKS_LIKE_FRAME`, `POSSIBLE_1609_2` | `codec.ts` |
| Constraint violations | `CONSTRAINT_VIOLATION`, `INVALID_ENUM_INDEX`, `RESERVED_VALUE` (warning) | `uper.ts`, `codec.ts` |
