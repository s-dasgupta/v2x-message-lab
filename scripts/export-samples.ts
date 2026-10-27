/**
 * Regenerates the files in samples/ from the scenarios, using the real codec:
 *   samples/inputs/<scenario>.json         vehicle inputs + system values
 *   samples/encoded/<scenario>.bsm.uper     BasicSafetyMessage (binary)
 *   samples/encoded/<scenario>.frame.uper   MessageFrame (binary)
 *   samples/encoded/<scenario>.json         hex of both + J2735 values
 *   samples/decoded/<scenario>.json         decoder output: J2735 values + physical interpretation
 * Every file is computed; nothing is hand-written. Run: npm run export:samples
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bytesToHex } from '../src/asn1/bits';
import { buildBsm } from '../src/j2735/bsmBuilder';
import { decodePayload, encodeBsm } from '../src/j2735/codec';
import { SCENARIOS } from '../src/j2735/data/scenarios';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'samples');
for (const dir of ['inputs', 'encoded', 'decoded']) mkdirSync(resolve(root, dir), { recursive: true });

const index: unknown[] = [];
for (const s of SCENARIOS) {
  const build = buildBsm(s.inputs, s.system);
  if (!build.coreData) throw new Error(`scenario ${s.id} has errors`);
  const { bsm, frame } = encodeBsm(build.coreData);
  writeFileSync(resolve(root, 'inputs', `${s.id}.json`), JSON.stringify({ scenario: s.id, title: s.title, summary: s.summary, physics: s.physics, inputs: s.inputs, system: s.system }, null, 2) + '\n');
  writeFileSync(resolve(root, 'encoded', `${s.id}.bsm.uper`), bsm.bytes);
  writeFileSync(resolve(root, 'encoded', `${s.id}.frame.uper`), frame.bytes);
  writeFileSync(
    resolve(root, 'encoded', `${s.id}.json`),
    JSON.stringify({
      scenario: s.id,
      basicSafetyMessage: { hex: bytesToHex(bsm.bytes), octets: bsm.bytes.length, bits: bsm.bitLength },
      messageFrame: { hex: bytesToHex(frame.bytes), octets: frame.bytes.length, bits: frame.bitLength },
      coreData: build.coreData,
      warnings: build.issues.filter((i) => i.severity !== 'error'),
    }, null, 2) + '\n',
  );
  const d = decodePayload(frame.bytes, 'MessageFrame');
  writeFileSync(
    resolve(root, 'decoded', `${s.id}.json`),
    JSON.stringify({ scenario: s.id, ok: d.ok, messageId: d.messageId, decoded: d.raw.value, interpretation: d.interpretations, issues: d.issues }, null, 2) + '\n',
  );
  index.push({ scenario: s.id, title: s.title, messageFrameHex: bytesToHex(frame.bytes) });
}
writeFileSync(resolve(root, 'index.json'), JSON.stringify({ generatedBy: 'scripts/export-samples.ts', samples: index }, null, 2) + '\n');
console.log(`wrote ${SCENARIOS.length} scenario samples to ${root}`);
