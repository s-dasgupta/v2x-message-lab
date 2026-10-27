/**
 * J2735 field value → physical meaning (the receiver's view).
 *
 * Used by the decoder (Module G) and the round-trip comparison (Module H).
 * Special codes (unavailable, saturation, reserved) are reported explicitly
 * instead of being converted into misleading numbers.
 */
import { STANDARD_GRAVITY, fmt } from './conversions/units';

export type InterpretationStatus = 'value' | 'unavailable' | 'saturated' | 'reserved' | 'leap-second' | 'invalid';

export interface Interpretation {
  readonly path: string;
  readonly raw: number | string;
  readonly status: InterpretationStatus;
  /** Physical value in SI (or the element's own unit) when status is value/saturated/leap-second. */
  readonly physical?: { value: number; unit: string };
  /** Human-readable rendering, e.g. "13.88 m/s (49.97 km/h)". */
  readonly display: string;
  readonly note?: string;
}

type Interpreter = (raw: number | string) => Omit<Interpretation, 'path' | 'raw'>;

const linear = (lsb: number, unit: string, digits: number, extra?: (v: number) => string): ((n: number) => Omit<Interpretation, 'path' | 'raw'>) =>
  (n) => {
    const v = n * lsb;
    return { status: 'value', physical: { value: v, unit }, display: `${fmt(v, digits)} ${unit}${extra ? ` ${extra(v)}` : ''}` };
  };

const num = (f: (n: number) => Omit<Interpretation, 'path' | 'raw'>): Interpreter => (raw) =>
  typeof raw === 'number' ? f(raw) : { status: 'invalid', display: String(raw) };

const unavailable = (note?: string): Omit<Interpretation, 'path' | 'raw'> => ({ status: 'unavailable', display: 'unavailable', note });

const enumText = (raw: number | string, reserved: readonly string[] = []): Omit<Interpretation, 'path' | 'raw'> => {
  const s = String(raw);
  if (s === 'unavailable') return unavailable();
  if (reserved.includes(s)) return { status: 'reserved', display: s, note: 'reserved value: should not be sent by conforming senders' };
  return { status: 'value', display: s };
};

export const INTERPRETERS: Readonly<Record<string, Interpreter>> = {
  'coreData.msgCnt': num((n) => ({ status: 'value', display: String(n) })),
  'coreData.id': (raw) => ({ status: 'value', display: String(raw) }),
  'coreData.secMark': num((n) => {
    if (n === 65535) return unavailable();
    if (n >= 61000) return { status: 'reserved', display: `${n} (reserved)`, note: 'values 61000–65534 are reserved (§7.43)' };
    if (n >= 60000) return { status: 'leap-second', physical: { value: n / 1000, unit: 's' }, display: `${fmt(n / 1000, 3)} s (leap second)` };
    return { status: 'value', physical: { value: n / 1000, unit: 's' }, display: `${fmt(n / 1000, 3)} s into the minute` };
  }),
  'coreData.lat': num((n) => (n === 900000001 ? unavailable() : linear(1e-7, 'deg', 7)(n))),
  'coreData.long': num((n) => (n === 1800000001 ? unavailable() : linear(1e-7, 'deg', 7)(n))),
  'coreData.elev': num((n) => {
    if (n === -4096) return unavailable();
    const r = linear(0.1, 'm', 1)(n);
    if (n === 61439) return { ...r, status: 'saturated', note: '+6143.9 m or higher' };
    if (n === -4095) return { ...r, status: 'saturated', note: '−409.5 m or lower' };
    return r;
  }),
  'coreData.accuracy.semiMajor': num((n) => axis(n)),
  'coreData.accuracy.semiMinor': num((n) => axis(n)),
  'coreData.accuracy.orientation': num((n) => (n === 65535 ? unavailable() : linear(360 / 65535, 'deg', 4)(n))),
  'coreData.transmission': (raw) => enumText(raw, ['reserved1', 'reserved2', 'reserved3']),
  'coreData.speed': num((n) => (n === 8191 ? unavailable() : linear(0.02, 'm/s', 2, (v) => `(${fmt(v * 3.6, 2)} km/h)`)(n))),
  'coreData.heading': num((n) => (n === 28800 ? unavailable() : linear(0.0125, 'deg', 4)(n))),
  'coreData.angle': num((n) => {
    if (n === 127) return unavailable();
    const r = linear(1.5, 'deg', 1)(n);
    if (n === 126) return { ...r, status: 'saturated', note: '+189° or beyond' };
    if (n === -126) return { ...r, status: 'saturated', note: '−189° or beyond' };
    return r;
  }),
  'coreData.accelSet.long': num((n) => accel(n)),
  'coreData.accelSet.lat': num((n) => accel(n)),
  'coreData.accelSet.vert': num((n) => {
    if (n === -127) return unavailable();
    const g = n * 0.02;
    const r = { status: 'value' as const, physical: { value: g * STANDARD_GRAVITY, unit: 'm/s²' }, display: `${fmt(g, 2)} G (${fmt(g * STANDARD_GRAVITY, 4)} m/s²)` };
    if (n === 127) return { ...r, status: 'saturated', note: '+2.54 G or greater' };
    if (n === -126) return { ...r, status: 'saturated', note: '−2.52 G or less' };
    return r;
  }),
  'coreData.accelSet.yaw': num((n) => ({
    ...linear(0.01, 'deg/s', 2)(n),
    note: n === 0 ? 'DE_YawRate has no unavailable code; 0 may also be used by senders that lack a yaw sensor' : undefined,
  })),
  'coreData.brakes.wheelBrakes': (raw) => {
    const bits = String(raw);
    if (bits[0] === '1') return { status: 'unavailable', display: 'unavailable', note: bits.slice(1).includes('1') ? 'wheel bits set together with unavailable' : undefined };
    const names = ['leftFront', 'leftRear', 'rightFront', 'rightRear'].filter((_, i) => bits[i + 1] === '1');
    return { status: 'value', display: names.length ? `applied: ${names.join(', ')}` : 'no wheel braking' };
  },
  'coreData.brakes.traction': (raw) => enumText(raw),
  'coreData.brakes.abs': (raw) => enumText(raw),
  'coreData.brakes.scs': (raw) => enumText(raw),
  'coreData.brakes.brakeBoost': (raw) => enumText(raw),
  'coreData.brakes.auxBrakes': (raw) => enumText(raw, ['reserved']),
  'coreData.size.width': num((n) => (n === 0 ? unavailable() : linear(0.01, 'm', 2)(n))),
  'coreData.size.length': num((n) => (n === 0 ? unavailable() : linear(0.01, 'm', 2)(n))),
};

function axis(n: number): Omit<Interpretation, 'path' | 'raw'> {
  if (n === 255) return unavailable();
  const r = linear(0.05, 'm', 2)(n);
  if (n === 254) return { ...r, status: 'saturated', note: '12.70 m or greater' };
  return r;
}

function accel(n: number): Omit<Interpretation, 'path' | 'raw'> {
  if (n === 2001) return unavailable();
  const r = linear(0.01, 'm/s²', 2)(n);
  if (n === 2000) return { ...r, status: 'saturated', note: '+20.00 m/s² or greater' };
  if (n === -2000) return { ...r, status: 'saturated', note: '−20.00 m/s² or less' };
  return r;
}

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

/** Interprets every Part I leaf of a BasicSafetyMessage value. */
export function interpretBsm(bsm: unknown): Interpretation[] {
  return Object.entries(INTERPRETERS).map(([path, f]) => {
    const raw = get(bsm, path);
    if (typeof raw !== 'number' && typeof raw !== 'string') {
      return { path, raw: String(raw), status: 'invalid' as const, display: 'missing' };
    }
    return { path, raw, ...f(raw) };
  });
}
