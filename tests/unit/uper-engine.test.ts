/**
 * Generic X.691 (unaligned) engine tests, independent of J2735.
 * Expected bit patterns are derived by hand from the X.691 rules.
 */
import { describe, expect, it } from 'vitest';
import { BitReader, BitWriter, bitsForRange, bytesToBitString, bytesToHex, hexToBytes } from '../../src/asn1/bits';
import { decode, encode } from '../../src/asn1/uper';
import type { AsnType, SequenceType } from '../../src/asn1/types';

const int = (lb: number, ub: number, extensible = false): AsnType => ({ kind: 'INTEGER', lb, ub, extensible });
const bits = (r: { bytes: Uint8Array; bitLength: number }) => bytesToBitString(r.bytes).slice(0, r.bitLength);

describe('bitsForRange (constrained whole number width, X.691 10.5)', () => {
  it.each([
    [1, 0], [2, 1], [3, 2], [4, 2], [5, 3], [128, 7], [255, 8], [256, 8], [257, 9],
    [4002, 12], [28801, 15], [65535, 16], [65536, 16], [1800000002, 31], [3600000001, 32],
  ])('range %i needs %i bits', (range, width) => {
    expect(bitsForRange(range)).toBe(width);
  });

  it('rejects invalid ranges', () => {
    expect(() => bitsForRange(0)).toThrow();
  });
});

describe('BitWriter / BitReader', () => {
  it('packs MSB first and pads with zeros', () => {
    const w = new BitWriter();
    w.writeBits(0b101, 3);
    w.writeBits(0x3ff, 10);
    expect(w.length).toBe(13);
    expect(bytesToHex(w.toBytes())).toBe('BFF8');
  });

  it('handles widths up to 32 bits exactly', () => {
    const w = new BitWriter();
    w.writeBits(4294967295, 32);
    w.writeBits(1, 1);
    const r = new BitReader(w.toBytes());
    expect(r.readBits(32, '')).toBe(4294967295);
    expect(r.readBit('')).toBe(1);
  });

  it('refuses values that do not fit', () => {
    expect(() => new BitWriter().writeBits(8, 3)).toThrow();
    expect(() => new BitWriter().writeBits(-1, 3)).toThrow();
  });

  it('reports truncation', () => {
    const r = new BitReader(new Uint8Array([0xff]));
    expect(() => r.readBits(9, 'x')).toThrow(/needed 9 bit/);
  });

  it('round-trips hex', () => {
    expect(bytesToHex(hexToBytes('00ff7a'))).toBe('00FF7A');
    expect(() => hexToBytes('abc')).toThrow();
  });
});

describe('INTEGER', () => {
  it('encodes value minus lower bound in the minimum number of bits', () => {
    const r = encode(int(-2000, 2001), -2000);
    expect(r.bitLength).toBe(12);
    expect(bits(r)).toBe('000000000000');
    expect(bits(encode(int(-2000, 2001), 2001))).toBe('111110100001'); // 4001
  });

  it('uses zero bits for a single-valued range (outermost encoding becomes one zero octet)', () => {
    const r = encode(int(5, 5), 5);
    expect(r.bitLength).toBe(0);
    expect(bytesToHex(r.bytes)).toBe('00');
    expect(decode(int(5, 5), r.bytes).value).toBe(5);
  });

  it('rejects out-of-range values', () => {
    expect(() => encode(int(0, 127), 128)).toThrow(/CONSTRAINT|outside/);
    expect(() => encode(int(0, 127), 1.5)).toThrow(/integer/);
  });

  it('detects decoded values above the upper bound', () => {
    // 0..28800 uses 15 bits; 0x7FFF = 32767 > 28800
    const r = decode(int(0, 28800), new Uint8Array([0xff, 0xfe]));
    expect(r.ok).toBe(false);
    expect(r.fatal?.code).toBe('CONSTRAINT_VIOLATION');
  });

  it('extensible INTEGER: root values carry a 0 extension bit; others are unconstrained', () => {
    const t = int(1, 10, true);
    expect(bits(encode(t, 3))).toBe('0' + '0010');
    const out = encode(t, 300);
    // 1 + length octet (2) + 0x012C
    expect(bits(out)).toBe('1' + '00000010' + '0000000100101100');
    expect(decode(t, out.bytes).value).toBe(300);
    expect(decode(t, encode(t, -5).bytes).value).toBe(-5);
  });
});

describe('ENUMERATED', () => {
  const e: AsnType = { kind: 'ENUMERATED', extensible: false, root: [{ name: 'c', value: 7 }, { name: 'a', value: 0 }, { name: 'b', value: 3 }] };
  it('uses the index in ascending value order', () => {
    expect(bits(encode(e, 'a'))).toBe('00');
    expect(bits(encode(e, 'b'))).toBe('01');
    expect(bits(encode(e, 'c'))).toBe('10');
  });
  it('rejects unknown identifiers and invalid indices', () => {
    expect(() => encode(e, 'zzz')).toThrow(/not an identifier/);
    const r = decode(e, new Uint8Array([0xc0]));
    expect(r.fatal?.code).toBe('INVALID_ENUM_INDEX');
  });
  it('extensible ENUMERATED encodes additions as a normally small number', () => {
    const x: AsnType = { kind: 'ENUMERATED', extensible: true, root: [{ name: 'a', value: 0 }, { name: 'b', value: 1 }], additions: [{ name: 'z', value: 2 }] };
    expect(bits(encode(x, 'b'))).toBe('0' + '1');
    expect(bits(encode(x, 'z'))).toBe('1' + '0000000');
    expect(decode(x, encode(x, 'z').bytes).value).toBe('z');
  });
});

describe('BIT STRING and OCTET STRING', () => {
  it('fixed-size BIT STRING has no length determinant', () => {
    const t: AsnType = { kind: 'BIT STRING', size: 5, namedBits: [] };
    expect(bits(encode(t, '10010'))).toBe('10010');
    expect(() => encode(t, '1001')).toThrow(/SIZE/);
  });
  it('fixed-size OCTET STRING has no length determinant', () => {
    const t: AsnType = { kind: 'OCTET STRING', minSize: 4, maxSize: 4 };
    expect(bytesToHex(encode(t, 'deadBEEF').bytes)).toBe('DEADBEEF');
    expect(() => encode(t, 'DEAD')).toThrow(/octets/);
  });
  it('constrained-size OCTET STRING has a constrained length', () => {
    const t: AsnType = { kind: 'OCTET STRING', minSize: 1, maxSize: 4 };
    expect(bits(encode(t, 'AB'))).toBe('00' + '10101011');
  });
  it('unconstrained OCTET STRING uses a general length determinant', () => {
    const t: AsnType = { kind: 'OCTET STRING', minSize: 0, maxSize: null };
    const small = encode(t, '0102');
    expect(bytesToHex(small.bytes)).toBe('020102');
    const big = 'AA'.repeat(200);
    const r = encode(t, big);
    expect(bytesToHex(r.bytes.subarray(0, 2))).toBe('80C8'); // 10 + 14-bit 200
    expect(decode(t, r.bytes).value).toBe(big);
  });
  it('fragments lengths of 16K octets or more', () => {
    const t: AsnType = { kind: 'OCTET STRING', minSize: 0, maxSize: null };
    const hex = '5A'.repeat(16384 + 3);
    const r = encode(t, hex);
    expect(r.bytes[0]).toBe(0xc1); // 11 000001: one 16K fragment
    expect(r.bytes[16385]).toBe(0x03); // then a 3-octet final length
    expect(decode(t, r.bytes).value).toBe(hex);
  });
});

describe('SEQUENCE and SEQUENCE OF', () => {
  const inner: SequenceType = { kind: 'SEQUENCE', name: 'Inner', extensible: false, fields: [{ name: 'x', type: int(0, 3) }] };
  const seq: SequenceType = {
    kind: 'SEQUENCE',
    name: 'Outer',
    extensible: true,
    fields: [
      { name: 'a', type: int(0, 7) },
      { name: 'b', type: int(0, 1), optional: true },
      { name: 'list', type: { kind: 'SEQUENCE OF', item: inner, minSize: 1, maxSize: 8 }, optional: true },
    ],
  };

  it('writes extension bit, presence bitmap, then components', () => {
    expect(bits(encode(seq, { a: 5 }))).toBe('0' + '00' + '101');
    expect(bits(encode(seq, { a: 5, b: 1 }))).toBe('0' + '10' + '101' + '1');
    expect(bits(encode(seq, { a: 5, list: [{ x: 1 }, { x: 2 }] }))).toBe('0' + '01' + '101' + '001' + '01' + '10');
  });

  it('rejects missing and unexpected components', () => {
    expect(() => encode(seq, {})).toThrow(/mandatory component "a"/);
    expect(() => encode(seq, { a: 1, q: 2 })).toThrow(/no component named "q"/);
    expect(() => encode(seq, { a: 1, list: [] })).toThrow(/1\.\.8 items/);
  });

  it('skips unknown extension additions and preserves them for re-encoding', () => {
    // ext bit 1, bitmap absent, a=5 | normally small length (n-1=1) | bitmap '11' | 2 open types
    const w = new BitWriter();
    w.writeBit(1); w.writeBits(0, 2); w.writeBits(5, 3);
    w.writeBit(0); w.writeBits(1, 6); w.writeBits(0b11, 2);
    w.writeBits(1, 8); w.writeBits(0xab, 8);
    w.writeBits(2, 8); w.writeBits(0xcdef, 16);
    const r = decode(seq, w.toBytes());
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => i.code === 'UNKNOWN_EXTENSION_ADDITIONS')).toBe(true);
    expect(bytesToHex(encode(seq, r.value!).bytes)).toBe(bytesToHex(w.toBytes()));
  });
});

describe('open types and outermost encodings', () => {
  const payload: SequenceType = { kind: 'SEQUENCE', name: 'P', extensible: false, fields: [{ name: 'v', type: int(0, 1023) }] };
  const frame: SequenceType = {
    kind: 'SEQUENCE',
    name: 'Frame',
    extensible: false,
    fields: [
      { name: 'id', type: int(0, 255) },
      { name: 'body', type: { kind: 'OPEN TYPE', notation: 'X', resolve: (s) => (s.id === 1 ? payload : undefined) } },
    ],
  };

  it('wraps the contained value as an octet-aligned complete encoding with a length', () => {
    const r = encode(frame, { id: 1, body: { v: 1023 } });
    // id=01, length 02, contents 1111111111 + 6 pad bits
    expect(bytesToHex(r.bytes)).toBe('0102FFC0');
    const d = decode(frame, r.bytes);
    expect(d.ok).toBe(true);
    expect(d.value).toEqual({ id: 1, body: { v: 1023 } });
  });

  it('keeps unknown open types as opaque octets', () => {
    const d = decode(frame, hexToBytes('0703AABBCC'));
    expect(d.value).toEqual({ id: 7, body: { $opaque: 'AABBCC' } });
    expect(d.issues.some((i) => i.code === 'OPAQUE_OPEN_TYPE')).toBe(true);
    expect(bytesToHex(encode(frame, d.value!).bytes)).toBe('0703AABBCC');
  });

  it('detects an open type whose length disagrees with its contents', () => {
    const d = decode(frame, hexToBytes('0103FFC000'));
    expect(d.fatal?.code).toBe('OPEN_TYPE_LENGTH_MISMATCH');
  });

  it('detects open types that run past the end of the payload', () => {
    const d = decode(frame, hexToBytes('0105FFC0'));
    expect(d.fatal?.code).toBe('TRUNCATED');
  });

  it('reports trailing octets and non-zero padding', () => {
    const t = int(0, 7);
    const trailing = decode(t, hexToBytes('A000'));
    expect(trailing.ok).toBe(false);
    expect(trailing.issues.find((i) => i.code === 'TRAILING_DATA')?.message).toMatch(/1 unexpected octet/);
    const pad = decode(t, hexToBytes('A1'));
    expect(pad.issues.some((i) => i.code === 'NONZERO_PADDING')).toBe(true);
  });

  it('rejects an empty payload', () => {
    expect(decode(int(0, 7), new Uint8Array()).fatal?.code).toBe('TRUNCATED');
  });
});
