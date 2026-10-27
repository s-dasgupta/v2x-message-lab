/** BSM construction, BSM vs MessageFrame encoding, decoding, malformed input. */
import { describe, expect, it } from 'vitest';
import { bytesToHex, hexToBytes } from '../../src/asn1/bits';
import { decode, encode } from '../../src/asn1/uper';
import { buildBsm } from '../../src/j2735/bsmBuilder';
import { decodePayload, encodeBsm, messageIdName, parseHexInput } from '../../src/j2735/codec';
import { SAMPLES } from '../../src/j2735/data/samples';
import { SCENARIOS, scenarioById } from '../../src/j2735/data/scenarios';
import { MAX_CORE, MIN_CORE, prng, randomCore } from '../../src/j2735/data/testValues';
import { interpretBsm } from '../../src/j2735/interpret';
import { BSMcoreData, BasicSafetyMessage, MessageFrame } from '../../src/j2735/schema';
import { FIELD_SPECS, fixedUperBits } from '../../src/j2735/catalog';

function scenarioCore(id: string) {
  const s = scenarioById(id)!;
  const b = buildBsm(s.inputs, s.system);
  expect(b.ok, JSON.stringify(b.issues)).toBe(true);
  return b.coreData!;
}

describe('BSM Part I construction', () => {
  it.each(SCENARIOS.map((s) => s.id))('scenario "%s" builds a complete BSMcoreData', (id) => {
    const core = scenarioCore(id);
    for (const f of FIELD_SPECS) {
      const value = f.path.split('.').slice(1).reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], core);
      expect(value, f.path).toBeDefined();
    }
  });

  it('produces the expected J2735 values for the normal-driving scenario', () => {
    expect(scenarioCore('normal')).toEqual({
      msgCnt: 17, id: '5A3F09C1', secMark: 12345, lat: 332108712, long: -875462871, elev: 386,
      accuracy: { semiMajor: 24, semiMinor: 17, orientation: 2731 },
      transmission: 'forwardGears', speed: 694, heading: 7200, angle: 0,
      accelSet: { long: 0, lat: 0, vert: 0, yaw: 0 },
      brakes: { wheelBrakes: '00000', traction: 'on', abs: 'on', scs: 'on', brakeBoost: 'off', auxBrakes: 'off' },
      size: { width: 186, length: 497 },
    });
  });

  it('emergency braking, turning and degraded scenarios carry the expected special values', () => {
    const e = scenarioCore('emergency-braking');
    expect([e.speed, e.accelSet.long, e.brakes.wheelBrakes, e.brakes.abs, e.brakes.brakeBoost]).toEqual([1000, -780, '01111', 'engaged', 'on']);
    const t = scenarioCore('turning');
    expect(t.accelSet.yaw).toBe(1989);
    expect(t.accelSet.lat).toBe(241);
    expect(t.angle).toBe(84);
    const d = scenarioCore('degraded');
    expect([d.elev, d.heading, d.angle, d.accelSet.lat, d.accelSet.vert, d.accelSet.yaw, d.transmission]).toEqual([-4096, 28800, 127, 2001, -127, 0, 'unavailable']);
    expect(d.accuracy).toEqual({ semiMajor: 255, semiMinor: 255, orientation: 65535 });
    expect(d.brakes.wheelBrakes).toBe('10000');
    expect(d.size).toEqual({ width: 0, length: 0 });
  });

  it('never returns a partial structure when an input is invalid', () => {
    const s = scenarioById('normal')!;
    const b = buildBsm({ ...s.inputs, speed: { value: 'abc', unit: 'km/h', unavailable: false } }, s.system);
    expect(b.ok).toBe(false);
    expect(b.coreData).toBeUndefined();
    expect(b.issues.find((i) => i.path === 'coreData.speed')?.code).toBe('NOT_A_NUMBER');
  });

  it('flags inconsistent combinations without blocking encoding', () => {
    const s = scenarioById('normal')!;
    const b = buildBsm({ ...s.inputs, transmission: 'park' }, s.system);
    expect(b.ok).toBe(true);
    expect(b.issues.some((i) => i.code === 'PARK_WHILE_MOVING')).toBe(true);
  });
});

describe('UPER sizes derived from the constraints', () => {
  it('BSMcoreData is 290 bits, a Part-I-only BSM 293 bits / 37 octets, a MessageFrame 40 octets', () => {
    expect(fixedUperBits(BSMcoreData)).toBe(290);
    const { bsm, frame } = encodeBsm(scenarioCore('normal'));
    expect(bsm.bitLength).toBe(293);
    expect(bsm.bytes.length).toBe(37);
    expect(frame.bytes.length).toBe(40);
    expect(bytesToHex(frame.bytes.subarray(0, 3))).toBe('001425');
  });

  it('the MessageFrame contains the BSM encoding verbatim after its 3-octet header', () => {
    const { bsm, frame } = encodeBsm(scenarioCore('turning'));
    expect(bytesToHex(frame.bytes.subarray(3))).toBe(bytesToHex(bsm.bytes));
  });

  it('min and max boundary values encode and decode', () => {
    for (const core of [MIN_CORE, MAX_CORE]) {
      const { bsm, frame } = encodeBsm(core);
      expect(decode(BasicSafetyMessage, bsm.bytes).value).toEqual({ coreData: core });
      expect(decode(MessageFrame, frame.bytes).value).toEqual({ messageId: 20, value: { coreData: core } });
    }
  });
});

describe('round trip', () => {
  it('500 random BSMs survive encode → decode unchanged, both entry types', () => {
    const rand = prng(42);
    for (let i = 0; i < 500; i += 1) {
      const core = randomCore(rand);
      const { bsm, frame } = encodeBsm(core);
      const d1 = decodePayload(bsm.bytes, 'BasicSafetyMessage');
      const d2 = decodePayload(frame.bytes, 'MessageFrame');
      expect(d1.raw.ok && d2.raw.ok).toBe(true);
      expect(d1.bsm).toEqual({ coreData: core });
      expect(d2.bsm).toEqual({ coreData: core });
    }
  });

  it('decoded standardized values reconstruct physical values within half an LSB', () => {
    const s = scenarioById('turning')!;
    const b = buildBsm(s.inputs, s.system);
    const d = decodePayload(encodeBsm(b.coreData!).frame.bytes, 'MessageFrame');
    const yaw = d.interpretations!.find((i) => i.path === 'coreData.accelSet.yaw')!;
    expect(Math.abs(yaw.physical!.value - Number(s.inputs.yawRate.value))).toBeLessThanOrEqual(0.005);
    const speed = d.interpretations!.find((i) => i.path === 'coreData.speed')!;
    expect(Math.abs(speed.physical!.value - 25 / 3.6)).toBeLessThanOrEqual(0.01);
  });
});

describe('decoder samples', () => {
  it.each(SAMPLES.map((s) => [s.id, s] as const))('sample "%s" decodes with the documented validity', (_id, s) => {
    expect(decodePayload(hexToBytes(s.hex), s.entry).ok).toBe(s.expectValid);
  });
});

describe('decoder error handling', () => {
  const good = bytesToHex(encodeBsm(scenarioCore('normal')).frame.bytes);

  it('rejects invalid hexadecimal input', () => {
    expect(parseHexInput('00 14 2')).toMatchObject({ ok: false });
    expect(parseHexInput('00 14 zz')).toMatchObject({ ok: false });
    expect(parseHexInput('')).toMatchObject({ ok: false });
    expect(parseHexInput('0x00:14-25')).toMatchObject({ ok: true, normalized: '001425' });
  });

  it('reports truncated payloads', () => {
    const d = decodePayload(hexToBytes(good.slice(0, 30)), 'MessageFrame');
    expect(d.ok).toBe(false);
    expect(d.issues[0]?.code).toBe('TRUNCATED');
    const d2 = decodePayload(hexToBytes(good.slice(0, -2)), 'MessageFrame');
    expect(d2.issues.some((i) => i.code === 'TRUNCATED')).toBe(true);
  });

  it('reports unsupported message types', () => {
    const spat = encode(MessageFrame, { messageId: 19, value: { $opaque: 'C0FFEE' } });
    const d = decodePayload(spat.bytes, 'MessageFrame');
    expect(d.ok).toBe(false);
    expect(d.messageId).toBe(19);
    expect(d.issues.find((i) => i.code === 'UNSUPPORTED_MESSAGE_TYPE')?.message).toMatch(/SPaT/);
    expect(messageIdName(245)).toMatch(/testMessage05/);
  });

  it('reports constraint violations inside the BSM', () => {
    // heading occupies 15 bits; force the field to all ones (32767 > 28800)
    const { bsm, frame } = encodeBsm(scenarioCore('normal'));
    const span = frame.trace.spans.find((s) => s.path === 'value.coreData.heading')!;
    const bytes = frame.bytes.slice();
    for (let i = span.start; i < span.start + span.length; i += 1) bytes[i >> 3] |= 0x80 >> (i & 7);
    const d = decodePayload(bytes, 'MessageFrame');
    expect(d.ok).toBe(false);
    expect(d.raw.fatal?.code).toBe('CONSTRAINT_VIOLATION');
    expect(d.raw.fatal?.path).toBe('value.coreData.heading');
    expect(bsm.bytes.length).toBe(37);
  });

  it('reports invalid enumeration indices (BrakeBoostApplied has only 3 values)', () => {
    const { bsm } = encodeBsm(scenarioCore('normal'));
    const span = bsm.trace.spans.find((s) => s.path === 'coreData.brakes.brakeBoost')!;
    const bytes = bsm.bytes.slice();
    for (let i = span.start; i < span.start + span.length; i += 1) bytes[i >> 3] |= 0x80 >> (i & 7);
    expect(decodePayload(bytes, 'BasicSafetyMessage').raw.fatal?.code).toBe('INVALID_ENUM_INDEX');
  });

  it('does not accept arbitrary bytes as a BSM', () => {
    const rand = prng(7);
    let accepted = 0;
    for (let i = 0; i < 300; i += 1) {
      const len = 1 + Math.floor(rand() * 60);
      const bytes = Uint8Array.from({ length: len }, () => Math.floor(rand() * 256));
      if (decodePayload(bytes, 'MessageFrame').ok) accepted += 1;
    }
    expect(accepted).toBe(0);
  });

  it('flags a MessageFrame decoded with the wrong entry type', () => {
    const d = decodePayload(hexToBytes(good), 'BasicSafetyMessage');
    expect(d.ok).toBe(false);
    expect(d.issues.some((i) => i.code === 'LOOKS_LIKE_FRAME')).toBe(true);
  });

  it('flags a payload that looks like an IEEE 1609.2 wrapper', () => {
    const wrapped = hexToBytes('038100400380' + '81B1' + good);
    const d = decodePayload(wrapped, 'MessageFrame');
    expect(d.ok).toBe(false);
    expect(d.issues.some((i) => i.code === 'POSSIBLE_1609_2')).toBe(true);
  });

  it('warns about reserved values that are syntactically valid', () => {
    const core = { ...scenarioCore('normal'), secMark: 62000, transmission: 'reserved2' };
    const d = decodePayload(encodeBsm(core).frame.bytes, 'MessageFrame');
    expect(d.ok).toBe(true);
    expect(d.issues.filter((i) => i.code === 'RESERVED_VALUE')).toHaveLength(2);
    expect(interpretBsm(d.bsm).find((i) => i.path === 'coreData.secMark')?.status).toBe('reserved');
  });
});
