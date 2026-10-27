/**
 * Bit-level writer and reader used by the UPER engine.
 *
 * Bits are stored most-significant-bit first, matching X.691: the first bit of
 * an encoding is the most significant bit of the first octet.
 *
 * Values up to 52 bits wide are handled with exact floating-point arithmetic
 * (JavaScript bitwise operators are limited to 32 bits and are signed, so they
 * are deliberately not used for the multi-bit paths).
 */
import { DecodeError } from './errors';

export const MAX_FIELD_BITS = 52;

/** Number of bits needed by X.691 (unaligned) for a constrained whole number with `range` values. */
export function bitsForRange(range: number): number {
  if (!Number.isSafeInteger(range) || range < 1) {
    throw new RangeError(`invalid range ${range}`);
  }
  let bits = 0;
  while (2 ** bits < range) bits += 1;
  return bits;
}

export class BitWriter {
  private readonly bits: number[] = [];

  get length(): number {
    return this.bits.length;
  }

  writeBit(bit: number): void {
    this.bits.push(bit ? 1 : 0);
  }

  /** Writes `value` as an unsigned big-endian integer in exactly `width` bits. */
  writeBits(value: number, width: number): void {
    if (width === 0) return;
    if (width < 0 || width > MAX_FIELD_BITS) throw new RangeError(`unsupported bit width ${width}`);
    if (!Number.isSafeInteger(value) || value < 0 || value >= 2 ** width) {
      throw new RangeError(`value ${value} does not fit in ${width} bits`);
    }
    for (let i = width - 1; i >= 0; i -= 1) {
      this.bits.push(Math.floor(value / 2 ** i) % 2);
    }
  }

  writeBitString(bits: string): void {
    for (const ch of bits) this.bits.push(ch === '1' ? 1 : 0);
  }

  writeOctets(bytes: Uint8Array): void {
    for (const byte of bytes) this.writeBits(byte, 8);
  }

  /** Appends all bits of another writer. */
  append(other: BitWriter): void {
    for (const b of other.bits) this.bits.push(b);
  }

  /** Number of zero bits needed to reach the next octet boundary. */
  paddingToOctet(): number {
    return (8 - (this.bits.length % 8)) % 8;
  }

  /** Returns the bits as octets, zero-padding the final octet. */
  toBytes(): Uint8Array {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8));
    this.bits.forEach((bit, i) => {
      if (bit) out[i >> 3] |= 0x80 >> (i & 7);
    });
    return out;
  }

  toBitString(): string {
    return this.bits.join('');
  }
}

export class BitReader {
  private position: number;
  readonly startBit: number;
  readonly endBit: number;

  constructor(
    readonly bytes: Uint8Array,
    startBit = 0,
    endBit = bytes.length * 8,
  ) {
    this.position = startBit;
    this.startBit = startBit;
    this.endBit = endBit;
  }

  get pos(): number {
    return this.position;
  }

  get remaining(): number {
    return this.endBit - this.position;
  }

  bitAt(index: number): number {
    return (this.bytes[index >> 3] >> (7 - (index & 7))) & 1;
  }

  private ensure(width: number, path: string): void {
    if (this.position + width > this.endBit) {
      const available = this.endBit - this.position;
      throw new DecodeError(
        'TRUNCATED',
        path,
        this.position,
        `needed ${width} bit(s) but only ${available} remain${this.endBit < this.bytes.length * 8 ? ' inside the enclosing open type' : ' in the payload'}`,
      );
    }
  }

  readBit(path: string): number {
    this.ensure(1, path);
    const bit = this.bitAt(this.position);
    this.position += 1;
    return bit;
  }

  readBits(width: number, path: string): number {
    if (width === 0) return 0;
    if (width < 0 || width > MAX_FIELD_BITS) throw new RangeError(`unsupported bit width ${width}`);
    this.ensure(width, path);
    let value = 0;
    for (let i = 0; i < width; i += 1) {
      value = value * 2 + this.bitAt(this.position + i);
    }
    this.position += width;
    return value;
  }

  readBitString(width: number, path: string): string {
    this.ensure(width, path);
    let out = '';
    for (let i = 0; i < width; i += 1) out += this.bitAt(this.position + i) ? '1' : '0';
    this.position += width;
    return out;
  }

  readOctets(count: number, path: string): Uint8Array {
    this.ensure(count * 8, path);
    const out = new Uint8Array(count);
    for (let i = 0; i < count; i += 1) out[i] = this.readBits(8, path);
    return out;
  }

  /** Moves the cursor (used when an open type's content has been fully consumed). */
  seek(bit: number): void {
    this.position = bit;
  }
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s.toUpperCase();
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
    throw new RangeError('hex string must contain an even number of hexadecimal digits');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export function bytesToBitString(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(2).padStart(8, '0');
  return s;
}
