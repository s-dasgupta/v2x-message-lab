#!/usr/bin/env python3
"""Builds tests/fixtures/reference-vectors.json from independently decoded BSMs.

Source: the U.S. DOT ITS JPO Operational Data Environment (ODE) projects,
licensed Apache-2.0 (see THIRD_PARTY_NOTICES.md). Their test data contains
UPER-encoded MessageFrame/BSM payloads together with the values decoded by
their asn1c-generated J2735 codec (XER / XML output). These decoded values were
produced by a toolchain that is completely independent of V2X Message Lab and
of its schema transcription, which makes them useful for checking both.

Only the hex payloads and the Part I (BSMcoreData) values are extracted.

Usage:  python tools/validation/build_reference_fixture.py [--offline DIR]
"""
from __future__ import annotations

import argparse
import json
import pathlib
import urllib.request
import xml.etree.ElementTree as ET

ASN1_CODEC_SHA = "1749ac5f2dabe8722cf643c17ad021aec77fed2e"
JPO_ODE_SHA = "eb8b142cdf0a5f66af4ef9d0d33567672d4139f4"
RAW = "https://raw.githubusercontent.com/usdot-jpo-ode/{repo}/{sha}/{path}"

SOURCES = {
    "stream_uper": ("asn1_codec", ASN1_CODEC_SHA, "data/examples/j2735.MessageFrame.128.bsms.uper"),
    "stream_xer": ("asn1_codec", ASN1_CODEC_SHA, "data/examples/j2735.MessageFrame.128.bsms.xer"),
    "ode_hex": ("jpo-ode", JPO_ODE_SHA, "jpo-ode-svcs/src/test/resources/us/dot/its/jpo/ode/udp/bsm/BsmReceiverTest_ValidBSM.txt"),
    "ode_xml": ("jpo-ode", JPO_ODE_SHA, "jpo-ode-svcs/src/test/resources/us/dot/its/jpo/ode/services/asn1/decoder-output-bsm.xml"),
}

ENUM_FIELDS = {"transmission", "traction", "abs", "scs", "brakeBoost", "auxBrakes"}
CORE_ORDER = ["msgCnt", "id", "secMark", "lat", "long", "elev", "accuracy", "transmission",
              "speed", "heading", "angle", "accelSet", "brakes", "size"]


def fetch(key: str, offline: pathlib.Path | None) -> bytes:
    repo, sha, path = SOURCES[key]
    if offline:
        return (offline / pathlib.Path(path).name).read_bytes()
    with urllib.request.urlopen(RAW.format(repo=repo, sha=sha, path=path), timeout=60) as r:
        return r.read()


def xer_core(core: ET.Element) -> dict:
    """Converts an asn1c XER <coreData> element into this project's JSON value form."""
    def conv(el: ET.Element):
        children = list(el)
        tag = el.tag
        if tag in ENUM_FIELDS:
            return children[0].tag
        if children:
            return {c.tag: conv(c) for c in children}
        text = (el.text or "").strip()
        if tag == "id":
            return text.replace(" ", "").upper()
        if tag == "wheelBrakes":
            return text
        return int(text)
    out = conv(core)
    assert list(out.keys()) == CORE_ORDER, out.keys()
    return out


def split_frames(data: bytes) -> list[bytes]:
    """Splits a concatenation of MessageFrame(BSM) encodings using their length determinants."""
    frames, i = [], 0
    while i < len(data):
        assert data[i:i + 2] == b"\x00\x14", f"unexpected frame header at {i}"
        b = data[i + 2]
        length, hdr = (((b & 0x3F) << 8) | data[i + 3], 4) if b & 0x80 else (b, 3)
        frames.append(data[i:i + hdr + length])
        i += hdr + length
    return frames


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", type=pathlib.Path, help="directory containing the source files")
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[2] / "tests/fixtures/reference-vectors.json")
    args = ap.parse_args()

    vectors = []
    # 1) JPO ODE receiver test BSM (J2735 2024 decoder output)
    hex1 = fetch("ode_hex", args.offline).decode().strip().upper()
    root = ET.fromstring(fetch("ode_xml", args.offline))
    core = root.find(".//BasicSafetyMessage/coreData")
    xml_hex = root.findtext(".//metadata/asn1").strip().upper()
    assert xml_hex == hex1, "ODE hex and decoder-output asn1 differ"
    vectors.append({
        "name": "jpo-ode/BsmReceiverTest_ValidBSM",
        "source": f"usdot-jpo-ode/jpo-ode@{JPO_ODE_SHA[:12]}",
        "entry": "MessageFrame",
        "hex": hex1,
        "expectedCoreData": xer_core(core),
        "notes": "MessageFrame with Part II (VehicleSafetyExtensions, SupplementalVehicleExtensions); expected values from decoder-output-bsm.xml",
    })

    # 2) asn1_codec stream of 128 MessageFrames with asn1c XER decodes
    frames = split_frames(fetch("stream_uper", args.offline))
    xer_root = ET.fromstring(b"<root>" + fetch("stream_xer", args.offline) + b"</root>")
    cores = xer_root.findall("./MessageFrame/value/BasicSafetyMessage/coreData")
    assert len(frames) == len(cores) == 128, (len(frames), len(cores))
    for i, (frame, core) in enumerate(zip(frames, cores)):
        vectors.append({
            "name": f"asn1_codec/128bsms#{i:03d}",
            "source": f"usdot-jpo-ode/asn1_codec@{ASN1_CODEC_SHA[:12]}",
            "entry": "MessageFrame",
            "hex": frame.hex().upper(),
            "expectedCoreData": xer_core(core),
        })

    doc = {
        "description": "Independently decoded J2735 BSM MessageFrames (asn1c-based USDOT JPO ODE toolchain). Apache-2.0; see THIRD_PARTY_NOTICES.md.",
        "generatedBy": "tools/validation/build_reference_fixture.py",
        "sources": {k: f"https://github.com/usdot-jpo-ode/{v[0]}/blob/{v[1]}/{v[2]}" for k, v in SOURCES.items()},
        "vectors": vectors,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {len(vectors)} vectors to {args.out}")


if __name__ == "__main__":
    main()
