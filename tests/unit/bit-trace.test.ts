/**
 * The bit-level trace must be complete and truthful: spans tile the whole
 * payload with no gaps or overlaps, encoder and decoder agree, and the bits
 * inside every value span decode to exactly the traced value.
 * (Independent confirmation of span positions: tools/validation/cross_validate.py.)
 */
import { describe, expect, it } from 'vitest';
import { BitReader, hexToBytes } from '../../src/asn1/bits';
import { decode } from '../../src/asn1/uper';
import type { BitSpan, Trace } from '../../src/asn1/uper';
import { buildBsm } from '../../src/j2735/bsmBuilder';
import { encodeBsm } from '../../src/j2735/codec';
import { SCENARIOS } from '../../src/j2735/data/scenarios';
import { prng, randomCore } from '../../src/j2735/data/testValues';
import { BasicSafetyMessage, MessageFrame } from '../../src/j2735/schema';
import { LEAF_FIELDS } from '../../src/j2735/catalog';
import fixture from '../fixtures/reference-vectors.json';

function expectTiling(trace: Trace, totalBits: number): void {
  const spans = [...trace.spans].filter((s) => s.length > 0).sort((a, b) => a.start - b.start);
  let pos = 0;
  for (const s of spans) {
    expect(s.start, `${s.path} (${s.kind}) starts at ${s.start}, expected ${pos}`).toBe(pos);
    pos += s.length;
  }
  expect(pos).toBe(totalBits);
}

const strip = (spans: BitSpan[]) => spans.map(({ path, kind, start, length, fieldValue }) => ({ path, kind, start, length, fieldValue })).sort((a, b) => a.start - b.start || a.path.localeCompare(b.path));

describe('bit trace', () => {
  const rand = prng(99);
  const cores = [
    ...SCENARIOS.map((s) => buildBsm(s.inputs, s.system).coreData!),
    ...Array.from({ length: 50 }, () => randomCore(rand)),
  ];

  it('tiles every encoded bit exactly once (BSM and MessageFrame)', () => {
    for (const core of cores) {
      const { bsm, frame } = encodeBsm(core);
      expectTiling(bsm.trace, bsm.bytes.length * 8);
      expectTiling(frame.trace, frame.bytes.length * 8);
    }
  });

  it('encoder and decoder produce identical traces', () => {
    for (const core of cores) {
      const { bsm, frame } = encodeBsm(core);
      expect(strip(decode(BasicSafetyMessage, bsm.bytes).trace.spans)).toEqual(strip(bsm.trace.spans));
      expect(strip(decode(MessageFrame, frame.bytes).trace.spans)).toEqual(strip(frame.trace.spans));
    }
  });

  it('every Part I leaf has exactly one value span whose bits hold the field value', () => {
    const { frame } = encodeBsm(cores[0]!);
    const r = new BitReader(frame.bytes);
    for (const leaf of LEAF_FIELDS) {
      const spans = frame.trace.spans.filter((s) => s.path === `value.${leaf.path}` && s.kind === 'value');
      expect(spans, leaf.path).toHaveLength(1);
      const s = spans[0]!;
      r.seek(s.start);
      if (s.length <= 52 && s.fieldValue !== undefined) expect(r.readBits(s.length, '')).toBe(s.fieldValue);
    }
  });

  it('places the Part I fields at the bit offsets implied by the constraints', () => {
    const { bsm } = encodeBsm(cores[0]!);
    const at = (p: string) => bsm.trace.spans.find((s) => s.path === p && s.kind === 'value')!;
    // 1 extension bit + 2 presence bits precede coreData
    expect([at('coreData.msgCnt').start, at('coreData.msgCnt').length]).toEqual([3, 7]);
    expect([at('coreData.id').start, at('coreData.id').length]).toEqual([10, 32]);
    expect([at('coreData.lat').start, at('coreData.lat').length]).toEqual([58, 31]);
    expect([at('coreData.long').start, at('coreData.long').length]).toEqual([89, 32]);
    expect([at('coreData.speed').start, at('coreData.speed').length]).toEqual([172, 13]);
    expect([at('coreData.heading').start, at('coreData.heading').length]).toEqual([185, 15]);
    expect([at('coreData.size.length').start, at('coreData.size.length').length]).toEqual([281, 12]);
  });

  it('traces real-world payloads containing Part II, including opaque open types', () => {
    const v = (fixture as { vectors: { hex: string }[] }).vectors[0]!;
    const bytes = hexToBytes(v.hex);
    const d = decode(MessageFrame, bytes);
    expect(d.ok).toBe(true);
    expectTiling(d.trace, bytes.length * 8);
    expect(d.trace.spans.some((s) => s.kind === 'opaque' && s.path === 'value.partII[0].partII-Value')).toBe(true);
  });
});
