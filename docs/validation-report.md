# Independent cross-validation report

Generated 2026-10-26 20:22 UTC by `tools/validation/cross_validate.py`.

Toolchains: asn1tools 0.169.0; pycrate 0.8.1; Python 3.14.4.

Cases exported by the TypeScript encoder: 814 (407 BSM Part I values × 2 entry types). Reference vectors: 129.

```text
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

**Result: all checks passed.**
