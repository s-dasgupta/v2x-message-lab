#!/usr/bin/env python3
"""Independent cross-validation of the V2X Message Lab UPER codec.

Inputs (produced by `npm run export:vectors`):
    tools/validation/generated/vectors.json

Independent implementations used (test tooling only, not shipped with the app):
    * asn1tools  (MIT)          https://github.com/eerimoq/asn1tools
    * pycrate    (LGPL-2.1+)    https://github.com/pycrate-org/pycrate

Checks
    1. ENCODE   every exported value with asn1tools and with pycrate; the bytes
                must equal the bytes produced by the TypeScript encoder.
    2. DECODE   the TypeScript bytes with both tools; the values must equal the
                exported value.
    3. TRACE    for every traced leaf of the scenario/boundary cases, re-encode
                with asn1tools after setting the leaf to its lower and upper
                bound (or flipping all bits); only the traced bit positions may
                change and they must hold exactly the expected field bits.
    4. REFERENCE vectors from the USDOT JPO ODE asn1c toolchain: Part I values
                decoded by asn1tools, pycrate and the TypeScript decoder must
                all equal the asn1c output, and asn1tools must re-encode each
                payload byte-for-byte.

Exit status is non-zero if any check fails.
Usage: python tools/validation/cross_validate.py [--report docs/validation-report.md]
"""
from __future__ import annotations

import argparse
import copy
import datetime as _dt
import importlib.util
import json
import pathlib
import sys
import tempfile

import asn1tools
from pycrate_asn1c.asnproc import PycrateGenerator, compile_text, generate_modules

HERE = pathlib.Path(__file__).resolve().parent
VECTORS = HERE / "generated" / "vectors.json"

HEX_KEYS = {"id"}
BIT_KEYS = {"wheelBrakes": 5}


# --------------------------------------------------------------- conversions
def to_tool(value, flavor: str, key: str | None = None):
    """Project JSON form -> asn1tools ('a') or pycrate ('p') value form."""
    if isinstance(value, dict):
        if "$opaque" in value:
            return bytes.fromhex(value["$opaque"])
        return {k: to_tool(v, flavor, k) for k, v in value.items()}
    if isinstance(value, list):
        return [to_tool(v, flavor) for v in value]
    if key in HEX_KEYS:
        return bytes.fromhex(value)
    if key in BIT_KEYS:
        n = len(value)
        as_int = int(value, 2)
        if flavor == "p":
            return (as_int, n)
        return ((as_int << ((8 - n % 8) % 8)).to_bytes((n + 7) // 8, "big"), n)
    return value


def from_tool(value, flavor: str, key: str | None = None):
    if isinstance(value, dict):
        return {k: from_tool(v, flavor, k) for k, v in value.items()}
    if isinstance(value, list):
        return [from_tool(v, flavor) for v in value]
    if isinstance(value, (bytes, bytearray)):
        return bytes(value).hex().upper()
    if isinstance(value, tuple) and key in BIT_KEYS:
        if flavor == "p":
            as_int, n = value
            return format(as_int, f"0{n}b")
        data, n = value
        return format(int.from_bytes(data, "big"), f"0{len(data) * 8}b")[:n]
    return value


# ------------------------------------------------------------------- codecs
class Asn1Tools:
    def __init__(self, module: str):
        self.spec = asn1tools.compile_string(module, "uper")

    def encode(self, type_name: str, value) -> bytes:
        if type_name == "MessageFrame":
            inner = self.spec.encode("BasicSafetyMessage", to_tool(value["value"], "a"))
            return self.spec.encode("MessageFrame", {"messageId": value["messageId"], "value": inner})
        return self.spec.encode(type_name, to_tool(value, "a"))

    def decode(self, type_name: str, data: bytes):
        if type_name == "MessageFrame":
            frame = self.spec.decode("MessageFrame", data)
            bsm = self.spec.decode("BasicSafetyMessage", frame["value"])
            return {"messageId": frame["messageId"], "value": from_tool(bsm, "a")}
        return from_tool(self.spec.decode(type_name, data), "a")


class Pycrate:
    def __init__(self, module: str):
        compile_text(module)
        self._tmp = tempfile.TemporaryDirectory()
        path = pathlib.Path(self._tmp.name) / "v2xlab_bsm.py"
        generate_modules(PycrateGenerator, str(path))
        spec = importlib.util.spec_from_file_location("v2xlab_bsm", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        self.m = mod.V2XMessageLab_BSM_PartI

    def encode(self, type_name: str, value) -> bytes:
        obj = getattr(self.m, type_name)
        if type_name == "MessageFrame":
            v = {"messageId": value["messageId"], "value": ("BasicSafetyMessage", to_tool(value["value"], "p"))}
        else:
            v = to_tool(value, "p")
        obj.set_val(v)
        return obj.to_uper()

    def decode(self, type_name: str, data: bytes):
        obj = getattr(self.m, type_name)
        obj.from_uper(data)
        v = obj.get_val()
        if type_name == "MessageFrame":
            kind, inner = v["value"]
            if kind != "BasicSafetyMessage":
                raise ValueError(f"open type resolved to {kind}")
            return {"messageId": v["messageId"], "value": from_tool(inner, "p")}
        return from_tool(v, "p")


# --------------------------------------------------------------- utilities
def bits_of(data: bytes) -> str:
    return "".join(format(b, "08b") for b in data)


def get_path(obj, path: str):
    for part in path.split("."):
        obj = obj[part]
    return obj


def set_path(obj, path: str, value) -> None:
    parts = path.split(".")
    for part in parts[:-1]:
        obj = obj[part]
    obj[parts[-1]] = value


class Results:
    def __init__(self):
        self.counts: dict[str, list[int]] = {}
        self.failures: list[str] = []

    def check(self, category: str, ok: bool, detail: str) -> None:
        c = self.counts.setdefault(category, [0, 0])
        c[0 if ok else 1] += 1
        if not ok and len(self.failures) < 200:
            self.failures.append(f"[{category}] {detail}")


def trace_checks(res: Results, tool: Asn1Tools, case: dict, domains: dict) -> None:
    base_value = case["value"]
    for leaf in case["leaves"]:
        dom = domains.get(leaf["typeName"])
        if dom is None:
            continue
        path = leaf["path"]
        start, length = leaf["start"], leaf["length"]
        variants = []
        if dom["kind"] == "INTEGER":
            width = length
            variants = [(dom["lb"], format(0, f"0{width}b") if width else ""),
                        (dom["ub"], format(dom["ub"] - dom["lb"], f"0{width}b") if width else "")]
        elif dom["kind"] == "ENUMERATED":
            items = dom["items"]
            variants = [(name, format(i, f"0{length}b")) for i, name in enumerate(items)]
        elif dom["kind"] == "BIT STRING":
            cur = get_path(base_value, path)
            flipped = "".join("1" if b == "0" else "0" for b in cur)
            variants = [(flipped, flipped)]
        elif dom["kind"] == "OCTET STRING":
            cur = bytes.fromhex(get_path(base_value, path))
            flipped = bytes(b ^ 0xFF for b in cur)
            variants = [(flipped.hex().upper(), bits_of(flipped))]
        original_bits = bits_of(bytes.fromhex(case["hex"]))
        for new_value, expected_field in variants:
            mutated = copy.deepcopy(base_value)
            set_path(mutated, path, new_value)
            try:
                new_bits = bits_of(tool.encode(case["type"], mutated))
            except Exception as exc:  # noqa: BLE001
                res.check("trace", False, f"{case['name']} {path}={new_value}: asn1tools error {exc}")
                continue
            outside = [i for i in range(min(len(new_bits), len(original_bits)))
                       if new_bits[i] != original_bits[i] and not (start <= i < start + length)]
            field_ok = new_bits[start:start + length] == expected_field
            res.check("trace", not outside and field_ok and len(new_bits) == len(original_bits),
                      f"{case['name']} {path}={new_value}: span [{start},{start + length}) "
                      f"field={new_bits[start:start + length]} expected={expected_field} changed-outside={outside[:8]}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vectors", type=pathlib.Path, default=VECTORS)
    ap.add_argument("--report", type=pathlib.Path)
    args = ap.parse_args()

    doc = json.loads(args.vectors.read_text(encoding="utf-8"))
    a = Asn1Tools(doc["module"])
    p = Pycrate(doc["module"])
    res = Results()

    for case in doc["cases"]:
        name, tname, value = case["name"], case["type"], case["value"]
        ts_bytes = bytes.fromhex(case["hex"])
        for label, tool in (("asn1tools", a), ("pycrate", p)):
            try:
                enc = tool.encode(tname, value)
                res.check(f"encode/{label}", enc == ts_bytes, f"{name}: {label}={enc.hex().upper()} ts={case['hex']}")
            except Exception as exc:  # noqa: BLE001
                res.check(f"encode/{label}", False, f"{name}: {label} raised {exc!r}")
            try:
                dec = tool.decode(tname, ts_bytes)
                res.check(f"decode/{label}", dec == value, f"{name}: {label} decoded {dec} expected {value}")
            except Exception as exc:  # noqa: BLE001
                res.check(f"decode/{label}", False, f"{name}: {label} raised {exc!r}")
        if not name.startswith("random:") or int(name.split(":")[1].split("/")[0]) < 25:
            trace_checks(res, a, case, doc["domains"])

    refs = json.loads((HERE.parents[1] / "tests/fixtures/reference-vectors.json").read_text(encoding="utf-8"))["vectors"]
    ts_refs = {r["name"]: r for r in doc["references"]}
    for ref in refs:
        data = bytes.fromhex(ref["hex"])
        expected = ref["expectedCoreData"]
        try:
            frame = a.spec.decode("MessageFrame", data)
            bsm = a.spec.decode("BasicSafetyMessage", frame["value"])
            res.check("reference/asn1tools-vs-asn1c", from_tool(bsm["coreData"], "a") == expected, f"{ref['name']}")
            reenc = a.spec.encode("MessageFrame", {"messageId": frame["messageId"],
                                                    "value": a.spec.encode("BasicSafetyMessage", bsm)})
            res.check("reference/asn1tools-reencode", reenc == data, f"{ref['name']}")
        except Exception as exc:  # noqa: BLE001
            res.check("reference/asn1tools-vs-asn1c", False, f"{ref['name']}: {exc!r}")
        try:
            dec = p.decode("MessageFrame", data)
            res.check("reference/pycrate-vs-asn1c", dec["value"]["coreData"] == expected, f"{ref['name']}")
        except Exception as exc:  # noqa: BLE001
            res.check("reference/pycrate-vs-asn1c", False, f"{ref['name']}: {exc!r}")
        ts = ts_refs.get(ref["name"])
        res.check("reference/typescript-vs-asn1c", bool(ts and ts["ok"] and ts["decodedCoreData"] == expected), f"{ref['name']}")

    total_fail = sum(c[1] for c in res.counts.values())
    lines = [f"{'check':40s} {'pass':>6s} {'fail':>6s}"]
    for k, (ok, bad) in sorted(res.counts.items()):
        lines.append(f"{k:40s} {ok:6d} {bad:6d}")
    summary = "\n".join(lines)
    print(summary)
    for f in res.failures[:40]:
        print("FAIL", f)

    if args.report:
        versions = f"asn1tools {asn1tools.__version__}; pycrate {_pycrate_version()}; Python {sys.version.split()[0]}"
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(
            "# Independent cross-validation report\n\n"
            f"Generated {_dt.datetime.now(_dt.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} by `tools/validation/cross_validate.py`.\n\n"
            f"Toolchains: {versions}.\n\n"
            f"Cases exported by the TypeScript encoder: {len(doc['cases'])} "
            f"({len(doc['cases']) // 2} BSM Part I values × 2 entry types). Reference vectors: {len(refs)}.\n\n"
            "```text\n" + summary + "\n```\n\n"
            + ("**Result: all checks passed.**\n" if total_fail == 0 else f"**Result: {total_fail} check(s) failed.**\n\n"
               + "\n".join(f"- {f}" for f in res.failures[:50]) + "\n"),
            encoding="utf-8",
        )
    return 1 if total_fail else 0


def _pycrate_version() -> str:
    try:
        from importlib.metadata import version
        return version("pycrate")
    except Exception:  # noqa: BLE001
        return "unknown"


if __name__ == "__main__":
    sys.exit(main())
