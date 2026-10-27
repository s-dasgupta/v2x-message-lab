/**
 * Deterministic BSMcoreData value generators used by tests and by the
 * independent cross-validation export. Values are drawn directly in the J2735
 * integer domain so that every code (including special values) is exercised.
 */
import type { BsmCoreData } from '../bsmBuilder';

/** Small deterministic PRNG (mulberry32). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomCore(rand: () => number): BsmCoreData {
  const int = (lb: number, ub: number) => lb + Math.floor(rand() * (ub - lb + 1));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const hex = () => Array.from({ length: 4 }, () => int(0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  const bits = (n: number) => Array.from({ length: n }, () => (rand() < 0.5 ? '0' : '1')).join('');
  const st = ['unavailable', 'off', 'on', 'engaged'] as const;
  return {
    msgCnt: int(0, 127),
    id: hex(),
    secMark: int(0, 65535),
    lat: int(-900000000, 900000001),
    long: int(-1799999999, 1800000001),
    elev: int(-4096, 61439),
    accuracy: { semiMajor: int(0, 255), semiMinor: int(0, 255), orientation: int(0, 65535) },
    transmission: pick(['neutral', 'park', 'forwardGears', 'reverseGears', 'reserved1', 'reserved2', 'reserved3', 'unavailable']),
    speed: int(0, 8191),
    heading: int(0, 28800),
    angle: int(-126, 127),
    accelSet: { long: int(-2000, 2001), lat: int(-2000, 2001), vert: int(-127, 127), yaw: int(-32767, 32767) },
    brakes: {
      wheelBrakes: bits(5),
      traction: pick(st), abs: pick(st), scs: pick(st),
      brakeBoost: pick(['unavailable', 'off', 'on']),
      auxBrakes: pick(['unavailable', 'off', 'on', 'reserved']),
    },
    size: { width: int(0, 1023), length: int(0, 4095) },
  };
}

/** Every component at its ASN.1 lower bound / upper bound. */
export const MIN_CORE: BsmCoreData = {
  msgCnt: 0, id: '00000000', secMark: 0, lat: -900000000, long: -1799999999, elev: -4096,
  accuracy: { semiMajor: 0, semiMinor: 0, orientation: 0 },
  transmission: 'neutral', speed: 0, heading: 0, angle: -126,
  accelSet: { long: -2000, lat: -2000, vert: -127, yaw: -32767 },
  brakes: { wheelBrakes: '00000', traction: 'unavailable', abs: 'unavailable', scs: 'unavailable', brakeBoost: 'unavailable', auxBrakes: 'unavailable' },
  size: { width: 0, length: 0 },
};

export const MAX_CORE: BsmCoreData = {
  msgCnt: 127, id: 'FFFFFFFF', secMark: 65535, lat: 900000001, long: 1800000001, elev: 61439,
  accuracy: { semiMajor: 255, semiMinor: 255, orientation: 65535 },
  transmission: 'unavailable', speed: 8191, heading: 28800, angle: 127,
  accelSet: { long: 2001, lat: 2001, vert: 127, yaw: 32767 },
  brakes: { wheelBrakes: '11111', traction: 'engaged', abs: 'engaged', scs: 'engaged', brakeBoost: 'on', auxBrakes: 'reserved' },
  size: { width: 1023, length: 4095 },
};
