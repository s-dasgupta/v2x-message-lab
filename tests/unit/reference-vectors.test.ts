/**
 * Interoperability regression: payloads encoded by deployed equipment / the
 * USDOT JPO ODE toolchain, with Part I values decoded by their asn1c-generated
 * codec (tests/fixtures/reference-vectors.json, Apache-2.0).
 *
 * These are NOT produced by this project, so agreement checks both the schema
 * transcription and the UPER engine against an independent implementation.
 */
import { describe, expect, it } from 'vitest';
import { bytesToHex, hexToBytes } from '../../src/asn1/bits';
import { encode } from '../../src/asn1/uper';
import { decodePayload } from '../../src/j2735/codec';
import { MessageFrame } from '../../src/j2735/schema';
import fixture from '../fixtures/reference-vectors.json';

interface Vector {
  name: string;
  hex: string;
  expectedCoreData: unknown;
}

const vectors = (fixture as { vectors: Vector[] }).vectors;

describe('independent reference vectors (asn1c via USDOT JPO ODE)', () => {
  it('fixture contains the expected number of vectors', () => {
    expect(vectors.length).toBe(129);
  });

  it.each(vectors.map((v) => [v.name, v] as const))('%s: Part I matches asn1c and re-encodes byte-for-byte', (_name, v) => {
    const bytes = hexToBytes(v.hex);
    const d = decodePayload(bytes, 'MessageFrame');
    expect(d.ok, JSON.stringify(d.issues)).toBe(true);
    expect(d.messageId).toBe(20);
    expect(d.bsm?.coreData).toEqual(v.expectedCoreData);
    expect(bytesToHex(encode(MessageFrame, d.raw.value!).bytes)).toBe(v.hex);
  });

  it('Part II content is located and preserved (identifiers decoded, contents opaque)', () => {
    const d = decodePayload(hexToBytes(vectors[0]!.hex), 'MessageFrame');
    const partII = d.bsm?.partII as { 'partII-Id': number; 'partII-Value': { $opaque: string } }[];
    expect(partII.map((p) => p['partII-Id'])).toEqual([0, 2]);
    expect(partII[0]!['partII-Value'].$opaque.length / 2).toBe(133);
    expect(d.issues.some((i) => i.code === 'PART_II_PRESENT')).toBe(true);
  });
});
