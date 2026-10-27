/**
 * Schema-driven encoder/decoder for the Unaligned Packed Encoding Rules
 * (UPER, ITU-T X.691 "unaligned variant") with bit-level tracing.
 *
 * Every bit written or read is attributed to a component path and a role
 * (extension bit, presence bit, length determinant, value, padding, ...). The
 * resulting trace is what the Bit-Level Explorer displays, so bit positions
 * are never inferred after the fact: they are recorded by the codec itself.
 *
 * Clause numbers below follow ITU-T X.691 (02/2021): 10.1 complete encoding, 10.2 open types,
 * 10.5 constrained whole numbers, 10.6 normally small numbers, 10.8 unconstrained whole numbers,
 * 10.9 length determinants, 12 INTEGER, 13 ENUMERATED, 15 BIT STRING, 16 OCTET STRING,
 * 18 SEQUENCE, 19 SEQUENCE OF.
 */
import { BitReader, BitWriter, bitsForRange, bytesToHex, hexToBytes } from './bits';
import { DecodeError, EncodeError, type DecodeIssue } from './errors';
import {
  EXTENSION_ADDITIONS_KEY,
  isOpaque,
  type AsnType,
  type AsnValue,
  type BitStringType,
  type EnumeratedType,
  type ExtensionAdditionsValue,
  type IntegerType,
  type OctetStringType,
  type OpenType,
  type SequenceOfType,
  type SequenceType,
} from './types';

export type SpanKind =
  | 'extension-bit'
  | 'presence-bit'
  | 'length'
  | 'value'
  | 'padding'
  | 'opaque'
  | 'extension-additions';

/** A run of bits with a single role, attributed to one component. */
export interface BitSpan {
  readonly path: string;
  readonly kind: SpanKind;
  readonly start: number;
  readonly length: number;
  /** ASN.1 type name (or kind for anonymous types). */
  readonly typeName: string;
  /** Non-negative integer held in the bit field (for numeric fields). */
  readonly fieldValue?: number;
  /** Abstract value represented by a 'value' span. */
  readonly value?: AsnValue;
  /** Short explanation of how the bits relate to the value. */
  readonly note: string;
  readonly depth: number;
}

/** Bit extent of a constructed component (SEQUENCE, SEQUENCE OF, open type). */
export interface ContainerSpan {
  readonly path: string;
  readonly typeName: string;
  readonly kind: 'SEQUENCE' | 'SEQUENCE OF' | 'OPEN TYPE';
  readonly start: number;
  readonly length: number;
  readonly depth: number;
}

export interface Trace {
  spans: BitSpan[];
  containers: ContainerSpan[];
}

export interface EncodeResult {
  readonly bytes: Uint8Array;
  /** Number of significant bits before the final octet padding. */
  readonly bitLength: number;
  readonly trace: Trace;
}

export interface DecodeResult {
  /** True when decoding completed with no error-severity issue. */
  readonly ok: boolean;
  /** The decoded value (present whenever the structure was fully decoded). */
  readonly value?: AsnValue;
  /** Bits attributed so far (complete on success, partial on failure). */
  readonly trace: Trace;
  readonly issues: DecodeIssue[];
  /** Bit position just after the last decoded component (before padding). */
  readonly bitsConsumed: number;
  /** The fatal structural error, when decoding could not complete. */
  readonly fatal?: DecodeError;
}

const FRAGMENT_UNIT = 16384; // X.691 10.9: fragments are multiples of 16K units

function typeLabel(type: AsnType): string {
  return type.name ?? type.kind;
}

function childPath(path: string, name: string): string {
  return path ? `${path}.${name}` : name;
}

function sortedRoot(type: EnumeratedType) {
  return [...type.root].sort((a, b) => a.value - b.value);
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

interface EncodeContext {
  readonly w: BitWriter;
  readonly trace: Trace;
}

/**
 * Encodes `value` as an outermost value of `type` (X.691 10.1): the result is
 * padded with zero bits to an octet boundary, and an empty encoding becomes a
 * single zero octet.
 */
export function encode(type: AsnType, value: AsnValue): EncodeResult {
  const ctx: EncodeContext = { w: new BitWriter(), trace: { spans: [], containers: [] } };
  encodeValue(ctx, type, value, '', 0, {});
  const bitLength = ctx.w.length;
  completeOutermost(ctx, '', 0);
  return { bytes: ctx.w.toBytes(), bitLength, trace: ctx.trace };
}

function completeOutermost(ctx: EncodeContext, path: string, depth: number): void {
  if (ctx.w.length === 0) {
    // X.691 10.1.3: an empty complete encoding is replaced by one zero octet.
    const start = ctx.w.length;
    ctx.w.writeBits(0, 8);
    ctx.trace.spans.push({
      path, kind: 'padding', start, length: 8, typeName: 'padding', depth, fieldValue: 0,
      note: 'empty encoding replaced by a single zero octet (X.691 10.1)',
    });
    return;
  }
  const pad = ctx.w.paddingToOctet();
  if (pad > 0) {
    const start = ctx.w.length;
    ctx.w.writeBits(0, pad);
    ctx.trace.spans.push({
      path, kind: 'padding', start, length: pad, typeName: 'padding', depth, fieldValue: 0,
      note: `${pad} zero bit(s) to complete the final octet (X.691 10.1)`,
    });
  }
}

function encodeValue(
  ctx: EncodeContext,
  type: AsnType,
  value: AsnValue | undefined,
  path: string,
  depth: number,
  siblings: Readonly<Record<string, AsnValue>>,
): void {
  if (value === undefined) {
    throw new EncodeError('MISSING_COMPONENT', path, `a value of type ${typeLabel(type)} is required`);
  }
  switch (type.kind) {
    case 'INTEGER':
      return encodeInteger(ctx, type, value, path, depth);
    case 'ENUMERATED':
      return encodeEnumerated(ctx, type, value, path, depth);
    case 'BIT STRING':
      return encodeBitString(ctx, type, value, path, depth);
    case 'OCTET STRING':
      return encodeOctetString(ctx, type, value, path, depth);
    case 'SEQUENCE':
      return encodeSequence(ctx, type, value, path, depth);
    case 'SEQUENCE OF':
      return encodeSequenceOf(ctx, type, value, path, depth);
    case 'OPEN TYPE':
      return encodeOpenType(ctx, type, value, path, depth, siblings);
  }
}

function encodeInteger(ctx: EncodeContext, type: IntegerType, value: AsnValue, path: string, depth: number): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new EncodeError('INVALID_VALUE', path, `${typeLabel(type)} requires an integer, got ${JSON.stringify(value)}`);
  }
  const inRoot = value >= type.lb && value <= type.ub;
  const { w } = ctx;
  if (type.extensible) {
    // X.691 12: one bit saying whether the value lies outside the extension root.
    ctx.trace.spans.push({
      path, kind: 'extension-bit', start: w.length, length: 1, typeName: typeLabel(type), depth,
      fieldValue: inRoot ? 0 : 1, note: inRoot ? 'value within the extension root' : 'value outside the extension root',
    });
    w.writeBit(inRoot ? 0 : 1);
    if (!inRoot) {
      const start = w.length;
      writeUnconstrainedInteger(w, value);
      ctx.trace.spans.push({
        path, kind: 'value', start, length: w.length - start, typeName: typeLabel(type), depth, value,
        note: 'unconstrained whole number: octet count + two\'s-complement octets (X.691 10.8)',
      });
      return;
    }
  } else if (!inRoot) {
    throw new EncodeError(
      'CONSTRAINT_VIOLATION', path,
      `${value} is outside ${typeLabel(type)} (${type.lb}..${type.ub})`,
    );
  }
  const width = bitsForRange(type.ub - type.lb + 1);
  const field = value - type.lb;
  const start = w.length;
  w.writeBits(field, width);
  ctx.trace.spans.push({
    path, kind: 'value', start, length: width, typeName: typeLabel(type), depth, fieldValue: field, value,
    note:
      width === 0
        ? 'single-valued range: no bits are needed'
        : type.lb === 0
          ? `constrained whole number: ${width} bits encode value − 0`
          : `constrained whole number: ${width} bits encode value − (${type.lb}) = ${field}`,
  });
}

function writeUnconstrainedInteger(w: BitWriter, value: number): void {
  // Minimal two's-complement octets, preceded by a general length determinant.
  let big = BigInt(value);
  const octets: number[] = [];
  for (;;) {
    octets.unshift(Number(big & 0xffn));
    const sign = octets[0]! & 0x80;
    big >>= 8n;
    if ((big === 0n && !sign) || (big === -1n && sign)) break;
  }
  writeLengthDeterminant(w, octets.length);
  for (const o of octets) w.writeBits(o, 8);
}

function encodeEnumerated(ctx: EncodeContext, type: EnumeratedType, value: AsnValue, path: string, depth: number): void {
  if (typeof value !== 'string') {
    throw new EncodeError('INVALID_VALUE', path, `${typeLabel(type)} requires an enumeration identifier`);
  }
  const root = sortedRoot(type);
  const rootIndex = root.findIndex((i) => i.name === value);
  const additionIndex = type.additions?.findIndex((i) => i.name === value) ?? -1;
  if (rootIndex < 0 && additionIndex < 0) {
    throw new EncodeError(
      'INVALID_VALUE', path,
      `"${value}" is not an identifier of ${typeLabel(type)} (expected one of ${root.map((i) => i.name).join(', ')})`,
    );
  }
  const { w } = ctx;
  if (type.extensible) {
    ctx.trace.spans.push({
      path, kind: 'extension-bit', start: w.length, length: 1, typeName: typeLabel(type), depth,
      fieldValue: rootIndex >= 0 ? 0 : 1,
      note: rootIndex >= 0 ? 'identifier is in the enumeration root' : 'identifier is an extension addition',
    });
    w.writeBit(rootIndex >= 0 ? 0 : 1);
    if (rootIndex < 0) {
      const start = w.length;
      writeNormallySmallNumber(w, additionIndex);
      ctx.trace.spans.push({
        path, kind: 'value', start, length: w.length - start, typeName: typeLabel(type), depth,
        fieldValue: additionIndex, value, note: `extension addition index ${additionIndex} (normally small number)`,
      });
      return;
    }
  }
  const width = bitsForRange(root.length);
  const start = w.length;
  w.writeBits(rootIndex, width);
  ctx.trace.spans.push({
    path, kind: 'value', start, length: width, typeName: typeLabel(type), depth, fieldValue: rootIndex, value,
    note: `enumeration index ${rootIndex} of ${root.length} root items → ${width} bits`,
  });
}

function encodeBitString(ctx: EncodeContext, type: BitStringType, value: AsnValue, path: string, depth: number): void {
  if (typeof value !== 'string' || !/^[01]*$/.test(value)) {
    throw new EncodeError('INVALID_VALUE', path, `${typeLabel(type)} requires a string of 0/1 characters`);
  }
  if (value.length !== type.size) {
    throw new EncodeError('CONSTRAINT_VIOLATION', path, `${typeLabel(type)} has SIZE(${type.size}) but ${value.length} bits were given`);
  }
  const start = ctx.w.length;
  ctx.w.writeBitString(value);
  ctx.trace.spans.push({
    path, kind: 'value', start, length: type.size, typeName: typeLabel(type), depth, value,
    fieldValue: value.length > 0 ? parseInt(value, 2) : 0,
    note: `fixed-size bit string: ${type.size} bits copied as-is, no length determinant (X.691 15)`,
  });
}

function encodeOctetString(ctx: EncodeContext, type: OctetStringType, value: AsnValue, path: string, depth: number): void {
  if (typeof value !== 'string') {
    throw new EncodeError('INVALID_VALUE', path, `${typeLabel(type)} requires a hexadecimal string`);
  }
  let bytes: Uint8Array;
  try {
    bytes = hexToBytes(value);
  } catch {
    throw new EncodeError('INVALID_VALUE', path, `${typeLabel(type)} requires an even-length hexadecimal string`);
  }
  const n = bytes.length;
  if (n < type.minSize || (type.maxSize !== null && n > type.maxSize)) {
    throw new EncodeError(
      'CONSTRAINT_VIOLATION', path,
      `${typeLabel(type)} requires ${type.minSize === type.maxSize ? type.minSize : `${type.minSize}..${type.maxSize ?? 'MAX'}`} octets, got ${n}`,
    );
  }
  const { w } = ctx;
  if (type.maxSize !== null && type.minSize === type.maxSize) {
    const start = w.length;
    w.writeOctets(bytes);
    ctx.trace.spans.push({
      path, kind: 'value', start, length: n * 8, typeName: typeLabel(type), depth, value: bytesToHex(bytes),
      note: `fixed-size octet string: ${n} octets, no length determinant (X.691 16)`,
    });
    return;
  }
  if (type.maxSize !== null && type.maxSize < 65536) {
    const width = bitsForRange(type.maxSize - type.minSize + 1);
    const lstart = w.length;
    w.writeBits(n - type.minSize, width);
    ctx.trace.spans.push({
      path, kind: 'length', start: lstart, length: width, typeName: typeLabel(type), depth, fieldValue: n - type.minSize,
      note: `constrained length: ${n} octets`,
    });
    const start = w.length;
    w.writeOctets(bytes);
    ctx.trace.spans.push({
      path, kind: 'value', start, length: n * 8, typeName: typeLabel(type), depth, value: bytesToHex(bytes),
      note: `${n} octets`,
    });
    return;
  }
  writeOctetsWithLength(ctx, bytes, path, depth, typeLabel(type), 'value');
}

/** General length determinant + octets, with fragmentation for >= 16K octets (X.691 10.9). */
function writeOctetsWithLength(
  ctx: EncodeContext,
  bytes: Uint8Array,
  path: string,
  depth: number,
  typeName: string,
  contentKind: SpanKind,
): void {
  const { w } = ctx;
  let offset = 0;
  for (;;) {
    const remaining = bytes.length - offset;
    if (remaining >= FRAGMENT_UNIT) {
      const m = Math.min(4, Math.floor(remaining / FRAGMENT_UNIT));
      const lstart = w.length;
      w.writeBits(0b11, 2);
      w.writeBits(m, 6);
      ctx.trace.spans.push({
        path, kind: 'length', start: lstart, length: 8, typeName, depth, fieldValue: m,
        note: `fragment length: ${m} × 16K octets follow`,
      });
      const chunk = bytes.subarray(offset, offset + m * FRAGMENT_UNIT);
      const start = w.length;
      w.writeOctets(chunk);
      ctx.trace.spans.push({ path, kind: contentKind, start, length: chunk.length * 8, typeName, depth, note: 'fragment content' });
      offset += m * FRAGMENT_UNIT;
      continue;
    }
    const lstart = w.length;
    writeLengthDeterminant(w, remaining);
    ctx.trace.spans.push({
      path, kind: 'length', start: lstart, length: w.length - lstart, typeName, depth, fieldValue: remaining,
      note: remaining < 128 ? `length determinant (1 octet, form 0xxxxxxx): ${remaining} octets` : `length determinant (2 octets, form 10xxxxxx xxxxxxxx): ${remaining} octets`,
    });
    if (remaining > 0) {
      const start = w.length;
      w.writeOctets(bytes.subarray(offset));
      ctx.trace.spans.push({ path, kind: contentKind, start, length: remaining * 8, typeName, depth, value: bytesToHex(bytes.subarray(offset)), note: `${remaining} octets` });
    }
    return;
  }
}

/** General (unconstrained) length determinant for n < 16384 (X.691 10.9, unaligned variant). */
function writeLengthDeterminant(w: BitWriter, n: number): void {
  if (n < 128) {
    w.writeBits(n, 8);
  } else if (n < FRAGMENT_UNIT) {
    w.writeBits(0b10, 2);
    w.writeBits(n, 14);
  } else {
    throw new RangeError('lengths >= 16384 must be fragmented by the caller');
  }
}

/** Normally small non-negative whole number (X.691 10.6). */
function writeNormallySmallNumber(w: BitWriter, n: number): void {
  if (n <= 63) {
    w.writeBit(0);
    w.writeBits(n, 6);
  } else {
    w.writeBit(1);
    const octets: number[] = [];
    let v = n;
    do {
      octets.unshift(v % 256);
      v = Math.floor(v / 256);
    } while (v > 0);
    writeLengthDeterminant(w, octets.length);
    for (const o of octets) w.writeBits(o, 8);
  }
}

/** Normally small length, used for the extension-addition bitmap (X.691 10.9). */
function writeNormallySmallLength(w: BitWriter, n: number): void {
  if (n >= 1 && n <= 64) {
    w.writeBit(0);
    w.writeBits(n - 1, 6);
  } else {
    w.writeBit(1);
    writeLengthDeterminant(w, n);
  }
}

function isPlainObject(value: unknown): value is Record<string, AsnValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function encodeSequence(ctx: EncodeContext, type: SequenceType, value: AsnValue, path: string, depth: number): void {
  if (!isPlainObject(value) || isOpaque(value)) {
    throw new EncodeError('INVALID_VALUE', path, `${typeLabel(type)} requires an object with its components`);
  }
  const known = new Set(type.fields.map((f) => f.name));
  for (const key of Object.keys(value)) {
    if (!known.has(key) && key !== EXTENSION_ADDITIONS_KEY && value[key] !== undefined) {
      throw new EncodeError('UNEXPECTED_COMPONENT', childPath(path, key), `${typeLabel(type)} has no component named "${key}"`);
    }
  }
  const { w } = ctx;
  const containerStart = w.length;
  const extensions = (value as Record<string, unknown>)[EXTENSION_ADDITIONS_KEY] as ExtensionAdditionsValue | undefined;
  if (extensions && !type.extensible) {
    throw new EncodeError('UNEXPECTED_COMPONENT', path, `${typeLabel(type)} is not extensible`);
  }
  if (type.extensible) {
    const hasAdditions = !!extensions && extensions.presence.includes('1');
    ctx.trace.spans.push({
      path, kind: 'extension-bit', start: w.length, length: 1, typeName: typeLabel(type), depth: depth + 1,
      fieldValue: hasAdditions ? 1 : 0,
      note: hasAdditions ? 'extension bit = 1: extension additions follow the root components' : 'extension bit = 0: no extension additions present (X.691 18)',
    });
    w.writeBit(hasAdditions ? 1 : 0);
  }
  // Preamble: one presence bit per OPTIONAL root component (X.691 18).
  for (const field of type.fields) {
    if (!field.optional) continue;
    const present = value[field.name] !== undefined;
    ctx.trace.spans.push({
      path: childPath(path, field.name), kind: 'presence-bit', start: w.length, length: 1, typeName: typeLabel(type),
      depth: depth + 1, fieldValue: present ? 1 : 0,
      note: present ? `OPTIONAL component "${field.name}" is present` : `OPTIONAL component "${field.name}" is absent`,
    });
    w.writeBit(present ? 1 : 0);
  }
  for (const field of type.fields) {
    const fieldValue = value[field.name];
    if (fieldValue === undefined) {
      if (field.optional) continue;
      throw new EncodeError('MISSING_COMPONENT', childPath(path, field.name), `mandatory component "${field.name}" of ${typeLabel(type)} is missing`);
    }
    encodeValue(ctx, field.type, fieldValue, childPath(path, field.name), depth + 1, value);
  }
  if (extensions && extensions.presence.includes('1')) {
    const start = w.length;
    writeNormallySmallLength(w, extensions.presence.length);
    w.writeBitString(extensions.presence);
    ctx.trace.spans.push({
      path, kind: 'extension-additions', start, length: w.length - start, typeName: typeLabel(type), depth: depth + 1,
      note: `extension-addition bitmap (${extensions.presence.length} bits)`,
    });
    for (const hex of extensions.openTypes) {
      writeOctetsWithLength(ctx, hexToBytes(hex), path, depth + 1, 'extension addition', 'opaque');
    }
  }
  ctx.trace.containers.push({ path, typeName: typeLabel(type), kind: 'SEQUENCE', start: containerStart, length: w.length - containerStart, depth });
}

function encodeSequenceOf(ctx: EncodeContext, type: SequenceOfType, value: AsnValue, path: string, depth: number): void {
  if (!Array.isArray(value)) {
    throw new EncodeError('INVALID_VALUE', path, `${typeLabel(type)} requires an array`);
  }
  const n = value.length;
  if (n < type.minSize || n > type.maxSize) {
    throw new EncodeError('CONSTRAINT_VIOLATION', path, `${typeLabel(type)} requires ${type.minSize}..${type.maxSize} items, got ${n}`);
  }
  const { w } = ctx;
  const containerStart = w.length;
  if (type.minSize !== type.maxSize) {
    const width = bitsForRange(type.maxSize - type.minSize + 1);
    const start = w.length;
    w.writeBits(n - type.minSize, width);
    ctx.trace.spans.push({
      path, kind: 'length', start, length: width, typeName: typeLabel(type), depth: depth + 1, fieldValue: n - type.minSize,
      note: `item count ${n} encoded as constrained whole number ${n} − ${type.minSize} in ${width} bits (X.691 19)`,
    });
  }
  value.forEach((item, i) => encodeValue(ctx, type.item, item, `${path}[${i}]`, depth + 1, {}));
  ctx.trace.containers.push({ path, typeName: typeLabel(type), kind: 'SEQUENCE OF', start: containerStart, length: w.length - containerStart, depth });
}

function encodeOpenType(
  ctx: EncodeContext,
  type: OpenType,
  value: AsnValue,
  path: string,
  depth: number,
  siblings: Readonly<Record<string, AsnValue>>,
): void {
  const { w } = ctx;
  const containerStart = w.length;
  if (isOpaque(value)) {
    writeOctetsWithLength(ctx, hexToBytes(value.$opaque), path, depth + 1, 'open type', 'opaque');
  } else {
    const inner = type.resolve(siblings);
    if (!inner) {
      throw new EncodeError('UNRESOLVED_OPEN_TYPE', path, `cannot determine the type carried by ${type.notation}`);
    }
    // X.691 10.2: the contained value is encoded as a complete (outermost) encoding ...
    const sub: EncodeContext = { w: new BitWriter(), trace: { spans: [], containers: [] } };
    encodeValue(sub, inner, value, path, depth + 1, {});
    completeOutermost(sub, path, depth + 1);
    const octets = sub.w.toBytes();
    // ... and inserted as an unconstrained-length octet string.
    if (octets.length >= FRAGMENT_UNIT) {
      writeOctetsWithLength(ctx, octets, path, depth + 1, 'open type', 'opaque');
    } else {
      const lstart = w.length;
      writeLengthDeterminant(w, octets.length);
      ctx.trace.spans.push({
        path, kind: 'length', start: lstart, length: w.length - lstart, typeName: 'open type', depth: depth + 1,
        fieldValue: octets.length,
        note: `open-type length determinant: the contained ${typeLabel(inner)} occupies ${octets.length} octets (X.691 10.2)`,
      });
      const offset = w.length;
      w.append(sub.w);
      for (const s of sub.trace.spans) ctx.trace.spans.push({ ...s, start: s.start + offset });
      for (const c of sub.trace.containers) ctx.trace.containers.push({ ...c, start: c.start + offset });
    }
  }
  ctx.trace.containers.push({ path, typeName: 'open type', kind: 'OPEN TYPE', start: containerStart, length: w.length - containerStart, depth });
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

interface DecodeContext {
  readonly trace: Trace;
  readonly issues: DecodeIssue[];
}

export interface DecodeOptions {
  /** Report trailing octets after the outermost value as a warning instead of an error. */
  readonly allowTrailingOctets?: boolean;
}

/** Decodes an outermost value of `type` from `bytes`, never throwing on malformed input. */
export function decode(type: AsnType, bytes: Uint8Array, options: DecodeOptions = {}): DecodeResult {
  const ctx: DecodeContext = { trace: { spans: [], containers: [] }, issues: [] };
  const r = new BitReader(bytes);
  let value: AsnValue;
  try {
    if (bytes.length === 0) {
      throw new DecodeError('TRUNCATED', '', 0, 'the payload is empty');
    }
    value = decodeValue(ctx, r, type, '', 0, {});
  } catch (err) {
    if (err instanceof DecodeError) {
      ctx.issues.push({ severity: 'error', code: err.code, message: err.detail, path: err.path, bitOffset: err.bitOffset });
      return { ok: false, trace: ctx.trace, issues: ctx.issues, bitsConsumed: r.pos, fatal: err };
    }
    throw err;
  }
  const bitsConsumed = r.pos;
  const totalBits = bytes.length * 8;
  const paddedEnd = bitsConsumed === 0 ? 8 : Math.ceil(bitsConsumed / 8) * 8;
  const padBits = Math.min(paddedEnd, totalBits) - bitsConsumed;
  if (padBits > 0) {
    const padValue = r.readBits(padBits, '');
    ctx.trace.spans.push({
      path: '', kind: 'padding', start: bitsConsumed, length: padBits, typeName: 'padding', depth: 0,
      fieldValue: padValue, note: `${padBits} padding bit(s) completing the final octet`,
    });
    if (padValue !== 0) {
      ctx.issues.push({
        severity: 'warning', code: 'NONZERO_PADDING', path: '', bitOffset: bitsConsumed,
        message: 'final padding bits are not zero (X.691 requires zero padding); the payload may be corrupted or misaligned',
      });
    }
  }
  const trailing = (totalBits - paddedEnd) / 8;
  if (trailing > 0) {
    const allZero = bytes.subarray(paddedEnd / 8).every((b) => b === 0);
    ctx.issues.push({
      severity: options.allowTrailingOctets ? 'warning' : 'error',
      code: 'TRAILING_DATA',
      path: '',
      bitOffset: paddedEnd,
      message: `${trailing} unexpected octet(s) follow the end of the encoded value${allZero ? ' (all zero — possibly buffer padding)' : ''}`,
    });
    ctx.trace.spans.push({
      path: '', kind: 'opaque', start: paddedEnd, length: totalBits - paddedEnd, typeName: 'trailing data', depth: 0,
      note: 'octets after the end of the encoded value (not part of it)',
    });
  }
  const ok = !ctx.issues.some((i) => i.severity === 'error');
  return { ok, value, trace: ctx.trace, issues: ctx.issues, bitsConsumed };
}

function decodeValue(
  ctx: DecodeContext,
  r: BitReader,
  type: AsnType,
  path: string,
  depth: number,
  siblings: Readonly<Record<string, AsnValue>>,
): AsnValue {
  switch (type.kind) {
    case 'INTEGER':
      return decodeInteger(ctx, r, type, path, depth);
    case 'ENUMERATED':
      return decodeEnumerated(ctx, r, type, path, depth);
    case 'BIT STRING': {
      const start = r.pos;
      const bits = r.readBitString(type.size, path);
      ctx.trace.spans.push({
        path, kind: 'value', start, length: type.size, typeName: typeLabel(type), depth, value: bits,
        fieldValue: bits.length > 0 ? parseInt(bits, 2) : 0,
        note: `fixed-size bit string: ${type.size} bits copied as-is, no length determinant (X.691 15)`,
      });
      return bits;
    }
    case 'OCTET STRING':
      return decodeOctetString(ctx, r, type, path, depth);
    case 'SEQUENCE':
      return decodeSequence(ctx, r, type, path, depth);
    case 'SEQUENCE OF':
      return decodeSequenceOf(ctx, r, type, path, depth);
    case 'OPEN TYPE':
      return decodeOpenType(ctx, r, type, path, depth, siblings);
  }
}

function decodeInteger(ctx: DecodeContext, r: BitReader, type: IntegerType, path: string, depth: number): number {
  if (type.extensible) {
    const start = r.pos;
    const ext = r.readBit(path);
    ctx.trace.spans.push({
      path, kind: 'extension-bit', start, length: 1, typeName: typeLabel(type), depth, fieldValue: ext,
      note: ext ? 'value outside the extension root' : 'value within the extension root',
    });
    if (ext) {
      const vstart = r.pos;
      const value = readUnconstrainedInteger(r, path);
      ctx.trace.spans.push({
        path, kind: 'value', start: vstart, length: r.pos - vstart, typeName: typeLabel(type), depth, value,
        note: 'unconstrained whole number (X.691 10.8)',
      });
      return value;
    }
  }
  const width = bitsForRange(type.ub - type.lb + 1);
  const start = r.pos;
  const field = r.readBits(width, path);
  const value = field + type.lb;
  ctx.trace.spans.push({
    path, kind: 'value', start, length: width, typeName: typeLabel(type), depth, fieldValue: field, value,
    note:
      width === 0
        ? 'single-valued range: no bits are needed'
        : type.lb === 0
          ? `constrained whole number: value = field = ${field}`
          : `constrained whole number: value = field + (${type.lb}) = ${value}`,
  });
  if (value > type.ub) {
    throw new DecodeError(
      'CONSTRAINT_VIOLATION', path, start,
      `decoded ${typeLabel(type)} value ${value} exceeds the upper bound ${type.ub} (${width}-bit field holds ${field})`,
    );
  }
  return value;
}

function readLengthDeterminant(r: BitReader, path: string): { length: number; fragment: boolean } {
  if (r.readBit(path) === 0) return { length: r.readBits(7, path), fragment: false };
  if (r.readBit(path) === 0) return { length: r.readBits(14, path), fragment: false };
  const m = r.readBits(6, path);
  if (m < 1 || m > 4) {
    throw new DecodeError('UNSUPPORTED_ENCODING', path, r.pos - 8, `invalid fragment multiplier ${m} in length determinant`);
  }
  return { length: m * FRAGMENT_UNIT, fragment: true };
}

function readUnconstrainedInteger(r: BitReader, path: string): number {
  const { length, fragment } = readLengthDeterminant(r, path);
  if (fragment || length < 1 || length > 6) {
    throw new DecodeError('UNSUPPORTED_ENCODING', path, r.pos, `unconstrained integer of ${length} octets is not supported`);
  }
  const octets = r.readOctets(length, path);
  let big = 0n;
  for (const o of octets) big = (big << 8n) | BigInt(o);
  if (octets[0]! & 0x80) big -= 1n << BigInt(8 * length);
  return Number(big);
}

function readNormallySmallNumber(r: BitReader, path: string): number {
  if (r.readBit(path) === 0) return r.readBits(6, path);
  const { length, fragment } = readLengthDeterminant(r, path);
  if (fragment || length < 1 || length > 6) {
    throw new DecodeError('UNSUPPORTED_ENCODING', path, r.pos, 'normally small number too large');
  }
  let v = 0;
  for (const o of r.readOctets(length, path)) v = v * 256 + o;
  return v;
}

function readNormallySmallLength(r: BitReader, path: string): number {
  if (r.readBit(path) === 0) return r.readBits(6, path) + 1;
  const { length, fragment } = readLengthDeterminant(r, path);
  if (fragment) throw new DecodeError('UNSUPPORTED_ENCODING', path, r.pos, 'fragmented extension bitmap');
  return length;
}

function decodeEnumerated(ctx: DecodeContext, r: BitReader, type: EnumeratedType, path: string, depth: number): string {
  const root = sortedRoot(type);
  if (type.extensible) {
    const start = r.pos;
    const ext = r.readBit(path);
    ctx.trace.spans.push({
      path, kind: 'extension-bit', start, length: 1, typeName: typeLabel(type), depth, fieldValue: ext,
      note: ext ? 'identifier is an extension addition' : 'identifier is in the enumeration root',
    });
    if (ext) {
      const vstart = r.pos;
      const idx = readNormallySmallNumber(r, path);
      const item = type.additions?.[idx];
      const value = item ? item.name : `unknownExtension${idx}`;
      ctx.trace.spans.push({
        path, kind: 'value', start: vstart, length: r.pos - vstart, typeName: typeLabel(type), depth, fieldValue: idx, value,
        note: `extension addition index ${idx}`,
      });
      if (!item) {
        ctx.issues.push({
          severity: 'warning', code: 'UNKNOWN_ENUM_EXTENSION', path, bitOffset: vstart,
          message: `${typeLabel(type)} uses extension addition #${idx}, which this release does not know`,
        });
      }
      return value;
    }
  }
  const width = bitsForRange(root.length);
  const start = r.pos;
  const idx = r.readBits(width, path);
  const item = root[idx];
  ctx.trace.spans.push({
    path, kind: 'value', start, length: width, typeName: typeLabel(type), depth, fieldValue: idx, value: item?.name ?? `invalid(${idx})`,
    note: `enumeration index ${idx} of ${root.length} root items`,
  });
  if (!item) {
    throw new DecodeError(
      'INVALID_ENUM_INDEX', path, start,
      `enumeration index ${idx} is not defined for ${typeLabel(type)} (valid indices 0..${root.length - 1})`,
    );
  }
  return item.name;
}

function decodeOctetString(ctx: DecodeContext, r: BitReader, type: OctetStringType, path: string, depth: number): string {
  if (type.maxSize !== null && type.minSize === type.maxSize) {
    const start = r.pos;
    const hex = bytesToHex(r.readOctets(type.minSize, path));
    ctx.trace.spans.push({
      path, kind: 'value', start, length: type.minSize * 8, typeName: typeLabel(type), depth, value: hex,
      note: `fixed-size octet string: ${type.minSize} octets, no length determinant (X.691 16)`,
    });
    return hex;
  }
  if (type.maxSize !== null && type.maxSize < 65536) {
    const width = bitsForRange(type.maxSize - type.minSize + 1);
    const lstart = r.pos;
    const n = r.readBits(width, path) + type.minSize;
    ctx.trace.spans.push({ path, kind: 'length', start: lstart, length: width, typeName: typeLabel(type), depth, fieldValue: n - type.minSize, note: `constrained length: ${n} octets` });
    if (n > type.maxSize) {
      throw new DecodeError('CONSTRAINT_VIOLATION', path, lstart, `length ${n} exceeds SIZE upper bound ${type.maxSize}`);
    }
    const start = r.pos;
    const hex = bytesToHex(r.readOctets(n, path));
    ctx.trace.spans.push({ path, kind: 'value', start, length: n * 8, typeName: typeLabel(type), depth, value: hex, note: `${n} octets` });
    return hex;
  }
  return bytesToHex(readOctetsWithLength(ctx, r, path, depth, typeLabel(type), 'value'));
}

function readOctetsWithLength(
  ctx: DecodeContext,
  r: BitReader,
  path: string,
  depth: number,
  typeName: string,
  contentKind: SpanKind,
): Uint8Array {
  const parts: Uint8Array[] = [];
  for (;;) {
    const lstart = r.pos;
    const { length, fragment } = readLengthDeterminant(r, path);
    ctx.trace.spans.push({
      path, kind: 'length', start: lstart, length: r.pos - lstart, typeName, depth, fieldValue: length,
      note: fragment ? `fragment: ${length} octets follow` : `length determinant: ${length} octets`,
    });
    const start = r.pos;
    const chunk = r.readOctets(length, path);
    if (length > 0) {
      ctx.trace.spans.push({ path, kind: contentKind, start, length: length * 8, typeName, depth, value: bytesToHex(chunk), note: `${length} octets` });
    }
    parts.push(chunk);
    if (!fragment) break;
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function decodeSequence(ctx: DecodeContext, r: BitReader, type: SequenceType, path: string, depth: number): Record<string, AsnValue> {
  const containerStart = r.pos;
  let ext = 0;
  if (type.extensible) {
    const start = r.pos;
    ext = r.readBit(path);
    ctx.trace.spans.push({
      path, kind: 'extension-bit', start, length: 1, typeName: typeLabel(type), depth: depth + 1, fieldValue: ext,
      note: ext ? 'extension bit = 1: extension additions follow the root components' : 'extension bit = 0: no extension additions present (X.691 18)',
    });
  }
  const present = new Map<string, boolean>();
  for (const field of type.fields) {
    if (!field.optional) continue;
    const start = r.pos;
    const bit = r.readBit(childPath(path, field.name));
    present.set(field.name, bit === 1);
    ctx.trace.spans.push({
      path: childPath(path, field.name), kind: 'presence-bit', start, length: 1, typeName: typeLabel(type), depth: depth + 1,
      fieldValue: bit, note: bit ? `OPTIONAL component "${field.name}" is present` : `OPTIONAL component "${field.name}" is absent`,
    });
  }
  const out: Record<string, AsnValue> = {};
  for (const field of type.fields) {
    if (field.optional && !present.get(field.name)) continue;
    out[field.name] = decodeValue(ctx, r, field.type, childPath(path, field.name), depth + 1, out);
  }
  if (ext) {
    const start = r.pos;
    const n = readNormallySmallLength(r, path);
    const presence = r.readBitString(n, path);
    ctx.trace.spans.push({
      path, kind: 'extension-additions', start, length: r.pos - start, typeName: typeLabel(type), depth: depth + 1,
      note: `extension-addition bitmap (${n} bits): ${presence}`,
    });
    const openTypes: string[] = [];
    for (const bit of presence) {
      if (bit === '1') openTypes.push(bytesToHex(readOctetsWithLength(ctx, r, path, depth + 1, 'extension addition', 'opaque')));
    }
    ctx.issues.push({
      severity: 'warning', code: 'UNKNOWN_EXTENSION_ADDITIONS', path, bitOffset: start,
      message: `${typeLabel(type)} carries ${openTypes.length} extension addition(s) not defined in the schema used by this release; they were skipped using their length determinants and kept as opaque data`,
    });
    (out as Record<string, unknown>)[EXTENSION_ADDITIONS_KEY] = { presence, openTypes } satisfies ExtensionAdditionsValue;
  }
  ctx.trace.containers.push({ path, typeName: typeLabel(type), kind: 'SEQUENCE', start: containerStart, length: r.pos - containerStart, depth });
  return out;
}

function decodeSequenceOf(ctx: DecodeContext, r: BitReader, type: SequenceOfType, path: string, depth: number): AsnValue[] {
  const containerStart = r.pos;
  let n = type.minSize;
  if (type.minSize !== type.maxSize) {
    const width = bitsForRange(type.maxSize - type.minSize + 1);
    const start = r.pos;
    const field = r.readBits(width, path);
    n = field + type.minSize;
    ctx.trace.spans.push({
      path, kind: 'length', start, length: width, typeName: typeLabel(type), depth: depth + 1, fieldValue: field,
      note: `item count = field + ${type.minSize} = ${n}`,
    });
    if (n > type.maxSize) {
      throw new DecodeError('CONSTRAINT_VIOLATION', path, start, `item count ${n} exceeds SIZE upper bound ${type.maxSize}`);
    }
  }
  const items: AsnValue[] = [];
  for (let i = 0; i < n; i += 1) items.push(decodeValue(ctx, r, type.item, `${path}[${i}]`, depth + 1, {}));
  ctx.trace.containers.push({ path, typeName: typeLabel(type), kind: 'SEQUENCE OF', start: containerStart, length: r.pos - containerStart, depth });
  return items;
}

function decodeOpenType(
  ctx: DecodeContext,
  r: BitReader,
  type: OpenType,
  path: string,
  depth: number,
  siblings: Readonly<Record<string, AsnValue>>,
): AsnValue {
  const containerStart = r.pos;
  const lstart = r.pos;
  const { length, fragment } = readLengthDeterminant(r, path);
  const inner = type.resolve(siblings);
  if (fragment || !inner) {
    // Unknown (or fragmented) content: skip it using the length determinant(s).
    r.seek(lstart);
    const octets = readOctetsWithLength(ctx, r, path, depth + 1, 'open type', 'opaque');
    if (!inner) {
      ctx.issues.push({
        severity: 'warning', code: 'OPAQUE_OPEN_TYPE', path, bitOffset: containerStart,
        message: `content of ${type.notation} is not modelled by this release; ${octets.length} octet(s) kept as opaque data`,
      });
    }
    ctx.trace.containers.push({ path, typeName: 'open type', kind: 'OPEN TYPE', start: containerStart, length: r.pos - containerStart, depth });
    return { $opaque: bytesToHex(octets) };
  }
  ctx.trace.spans.push({
    path, kind: 'length', start: lstart, length: r.pos - lstart, typeName: 'open type', depth: depth + 1, fieldValue: length,
    note: `open-type length determinant: the contained ${typeLabel(inner)} occupies ${length} octets (X.691 10.2)`,
  });
  const contentStart = r.pos;
  const contentEnd = contentStart + length * 8;
  if (contentEnd > r.endBit) {
    throw new DecodeError(
      'TRUNCATED', path, contentStart,
      `open type announces ${length} octets but only ${Math.floor((r.endBit - contentStart) / 8)} remain`,
    );
  }
  const sub = new BitReader(r.bytes, contentStart, contentEnd);
  const value = decodeValue(ctx, sub, inner, path, depth + 1, {});
  const used = sub.pos - contentStart;
  const leftover = contentEnd - sub.pos;
  if (used === 0 && length === 1) {
    ctx.trace.spans.push({ path, kind: 'padding', start: sub.pos, length: 8, typeName: 'padding', depth: depth + 1, note: 'empty encoding represented by one zero octet' });
  } else if (leftover >= 8) {
    throw new DecodeError(
      'OPEN_TYPE_LENGTH_MISMATCH', path, sub.pos,
      `the contained ${typeLabel(inner)} ends after ${Math.ceil(used / 8)} octet(s) but the length determinant announced ${length}`,
    );
  } else if (leftover > 0) {
    const pad = sub.readBits(leftover, path);
    ctx.trace.spans.push({
      path, kind: 'padding', start: contentEnd - leftover, length: leftover, typeName: 'padding', depth: depth + 1, fieldValue: pad,
      note: `${leftover} padding bit(s) completing the open type's final octet`,
    });
    if (pad !== 0) {
      ctx.issues.push({ severity: 'warning', code: 'NONZERO_PADDING', path, bitOffset: contentEnd - leftover, message: 'open-type padding bits are not zero' });
    }
  }
  r.seek(contentEnd);
  ctx.trace.containers.push({ path, typeName: 'open type', kind: 'OPEN TYPE', start: containerStart, length: r.pos - containerStart, depth });
  return value;
}

/** Leaf spans (everything except containers), sorted by start bit. */
export function leafSpans(trace: Trace): BitSpan[] {
  return [...trace.spans].sort((a, b) => a.start - b.start);
}
