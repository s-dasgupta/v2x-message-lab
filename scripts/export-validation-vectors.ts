/**
 * Exports encoder output for independent cross-validation.
 *
 * Writes tools/validation/generated/vectors.json containing:
 *   - the ASN.1 module text generated from the encoder's schema,
 *   - cases (value + hex + traced leaf bit spans) for BasicSafetyMessage and
 *     MessageFrame: all scenarios, min/max boundary values and 400 seeded
 *     random values.
 * tools/validation/cross_validate.py re-encodes/decodes every case with
 * independent ASN.1 toolchains and compares bit-for-bit.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bytesToHex, hexToBytes } from '../src/asn1/bits';
import { collectNamedTypes } from '../src/asn1/notation';
import { encode } from '../src/asn1/uper';
import { bsmModuleText } from '../src/j2735/asn1Module';
import { buildBsm, type BsmCoreData } from '../src/j2735/bsmBuilder';
import { decodePayload } from '../src/j2735/codec';
import { SCENARIOS } from '../src/j2735/data/scenarios';
import { MAX_CORE, MIN_CORE, prng, randomCore } from '../src/j2735/data/testValues';
import { BasicSafetyMessage, BSM_MESSAGE_ID, MessageFrame } from '../src/j2735/schema';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'tools/validation/generated/vectors.json');

interface Case {
  name: string;
  type: 'BasicSafetyMessage' | 'MessageFrame';
  value: unknown;
  hex: string;
  bitLength: number;
  leaves: { path: string; start: number; length: number; typeName: string }[];
}

const cases: Case[] = [];

// Value domains of every named leaf type, used by the validator to mutate fields.
const domains: Record<string, unknown> = {};
for (const t of collectNamedTypes([MessageFrame, BasicSafetyMessage])) {
  if (t.kind === 'INTEGER') domains[t.name!] = { kind: t.kind, lb: t.lb, ub: t.ub };
  if (t.kind === 'ENUMERATED') domains[t.name!] = { kind: t.kind, items: t.root.map((i) => i.name) };
  if (t.kind === 'BIT STRING') domains[t.name!] = { kind: t.kind, size: t.size };
  if (t.kind === 'OCTET STRING') domains[t.name!] = { kind: t.kind, size: t.minSize };
}

// Reference vectors decoded by this project's decoder, for three-way comparison.
const refDoc = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/reference-vectors.json'), 'utf8')) as {
  vectors: { name: string; hex: string }[];
};
const references = refDoc.vectors.map((v) => {
  const d = decodePayload(hexToBytes(v.hex), 'MessageFrame');
  return { name: v.name, hex: v.hex, ok: d.ok, decodedCoreData: (d.bsm as { coreData?: unknown } | undefined)?.coreData ?? null };
});

function add(name: string, core: BsmCoreData): void {
  const bsmValue = { coreData: core };
  for (const [type, schema, value] of [
    ['BasicSafetyMessage', BasicSafetyMessage, bsmValue],
    ['MessageFrame', MessageFrame, { messageId: BSM_MESSAGE_ID, value: bsmValue }],
  ] as const) {
    const r = encode(schema, value as never);
    cases.push({
      name: `${name}/${type}`,
      type,
      value,
      hex: bytesToHex(r.bytes),
      bitLength: r.bitLength,
      leaves: r.trace.spans
        .filter((s) => s.kind === 'value')
        .map((s) => ({ path: s.path, start: s.start, length: s.length, typeName: s.typeName })),
    });
  }
}

for (const s of SCENARIOS) {
  const b = buildBsm(s.inputs, s.system);
  if (!b.coreData) throw new Error(`scenario ${s.id} does not build`);
  add(`scenario:${s.id}`, b.coreData);
}
add('boundary:min', MIN_CORE);
add('boundary:max', MAX_CORE);
const rand = prng(2735);
for (let i = 0; i < 400; i += 1) add(`random:${i}`, randomCore(rand));

mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify({ generatedBy: 'scripts/export-validation-vectors.ts', module: bsmModuleText(), domains, cases, references }, null, 1),
);
console.log(`wrote ${cases.length} cases to ${out}`);
