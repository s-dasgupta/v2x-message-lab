# Standards references and copyright policy

## Primary authority

**SAE J2735_202409 — V2X Communications Message Set Dictionary** (issued 2006-12,
revised 2024-09, superseding J2735 SEP2023). All message definitions, field
structures, ranges, resolutions, units, special values and encoding requirements
implemented here follow this revision. Official publication:
<https://www.sae.org/standards/content/j2735_202409/>.

**Background:** *SAE J2735 Standard: Applying the Systems Engineering Process*,
FHWA-JPO-13-046, USDOT ITS JPO, January 2013. Used to explain motivation,
interoperability and the user-need → requirement → data-concept chain. Where it
differs from J2735:2024 (it describes the 2009-era standard), J2735:2024 wins.

**Encoding rules:** ITU-T X.680 (ASN.1 notation) and ITU-T X.691 (Packed
Encoding Rules, unaligned variant). These are freely available from the ITU.

## Normative vs. informative

| Statement type in this project | Meaning | Example |
|---|---|---|
| **normative** | Required by J2735:2024 (ASN.1, ASN.1 comments, or "Use"/"Remarks" text of Sections 5–7, or a "shall" in other sections) | Speed ::= INTEGER (0..8191), 8191 = unavailable (§7.196) |
| **recommended** | A "should"/"recommended" practice in J2735 | round to nearest LSB after full-precision conversion (§11.5) |
| **informative** | Descriptive text, marked informative in J2735 | ~10 BSMs per second is typical (§5.2) |
| **implementation** | A choice made by this project where the standard is silent | ties round away from zero; secMark truncated to ms |
| **unverified** | A point that could not be confirmed from the supplied documents | gravity compensation of vertical acceleration |

These labels appear in the field detail panels (`notes` in `src/j2735/catalog/entries.ts`).

## What this repository does and does not contain

- ✅ Original explanations written for this project, citing section numbers.
- ✅ A minimal machine-readable schema of the BSM Part I types
  (`src/j2735/schema/index.ts`): type names, component names and order,
  integer ranges, sizes and enumeration values. This is the information any
  interoperable implementation must contain; it is written independently and
  contains no SAE prose. The "ASN.1 module text" shown in the app is generated
  from this schema.
- ❌ No copy of the SAE J2735 PDF or any substantial portion of its text.
- ❌ No SAE ASN.1 module files (J2735ASN_202409 is a separate SAE product).
- ❌ No code generated from SAE's ASN.1 files.

**Action for maintainers:** the schema transcription is limited to what BSM
Part I interoperability requires, but SAE's licence terms for the standard and
its ASN.1 files should be reviewed by the repository owner before publication.
If in doubt, contact SAE (CustomerService@sae.org).

## Section map used by Release 1

| Topic | J2735:2024 section |
|---|---|
| V2X overview, WAVE, security (informative) | 4.1, 4.2, 4.2.1, 4.2.2 |
| Message/DF/DE philosophy | 4.3 |
| Message encoding — UPER default (normative) | 4.4 |
| Additional constraints in other standards | 4.5 |
| MSG_MessageFrame | 5.1 |
| MSG_BasicSafetyMessage | 5.2 |
| DF_AccelerationSet4Way | 6.1 |
| DF_BrakeSystemStatus | 6.9 |
| DF_BSMcoreData | 6.10 |
| DF_PositionalAccuracy | 6.97 |
| DF_VehicleSize | 6.169 |
| Data elements | 7.1, 7.11, 7.16, 7.20, 7.21, 7.43, 7.44, 7.48, 7.60, 7.99, 7.103, 7.113, 7.163, 7.184–7.186, 7.196, 7.198, 7.202, 7.204, 7.215, 7.226, 7.236, 7.240, 7.243, 7.255 |
| Conformance | 10 |
| ASN.1 syntax and UPER | 11.1 |
| Regional extensions | 11.2 |
| Frames of reference | 11.4 |
| Position, velocity, acceleration; rounding; Table 1 | 11.5 |
| ASN.1 module collection | Appendix A |
