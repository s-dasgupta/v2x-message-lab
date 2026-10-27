# Third-party notices

## Shipped in the web application bundle

| Package | Version | Licence | Use |
|---|---|---|---|
| react | 18.3.1 | MIT | UI rendering |
| react-dom | 18.3.1 | MIT | UI rendering |
| scheduler | 0.23.2 | MIT | dependency of react-dom |
| loose-envify | 1.4.0 | MIT | dependency of react |
| js-tokens | 4.0.0 | MIT | dependency of loose-envify |

Copyright notices for these packages are retained in their published source
(`node_modules/<package>/LICENSE`) and in the generated bundle's legal comments.

## Development and test tooling (not shipped)

Vite, Vitest, TypeScript, @vitejs/plugin-react, jsdom, Testing Library and tsx
are used only to build and test the project (MIT / Apache-2.0 / BSD licences;
see `package-lock.json` for exact versions).

Independent cross-validation (`tools/validation`, run in CI only):

| Package | Version | Licence |
|---|---|---|
| asn1tools | 0.169.0 | MIT |
| pycrate | 0.8.1 | LGPL-2.1-or-later (used as an unmodified external tool) |
| bitstruct | 8.24.0 | MIT |
| pyparsing | 3.3.3 | MIT |

## Reference test vectors

`tests/fixtures/reference-vectors.json` and the "independent" samples in
`src/j2735/data/samples.ts` contain UPER payloads and decoded Part I values
extracted from test data of the U.S. Department of Transportation ITS Joint
Program Office **Operational Data Environment (ODE)** projects:

- usdot-jpo-ode/jpo-ode @ `eb8b142cdf0a5f66af4ef9d0d33567672d4139f4`
- usdot-jpo-ode/asn1_codec @ `1749ac5f2dabe8722cf643c17ad021aec77fed2e`

Both repositories are licensed under the **Apache License, Version 2.0**
(<https://www.apache.org/licenses/LICENSE-2.0>). The extracted data has been
reformatted into JSON (hex payloads and Part I values only) by
`tools/validation/build_reference_fixture.py`; no other changes were made to
the values. This project is not endorsed by USDOT.

## Standards

SAE J2735 is © SAE International. This repository does **not** contain the
SAE J2735 document, its text, or SAE's official ASN.1 module files
(J2735ASN_202409), which SAE distributes separately. Section numbers are cited
for reference only. See `docs/STANDARDS_AND_COPYRIGHT.md`.

ITU-T X.680 and X.691 are cited for the ASN.1 notation and Packed Encoding Rules.

FHWA-JPO-13-046 (USDOT, 2013) is a U.S. Government report cited for background.
