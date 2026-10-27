/** Sensor → J2735 conversions (Module C), checked against SAE J2735_202409 Section 7. */
import { describe, expect, it } from 'vitest';
import * as C from '../../src/j2735/conversions/fields';
import { quantize, roundHalfAwayFromZero, speedToMps } from '../../src/j2735/conversions/units';
import { num } from '../../src/j2735/inputs';

const v = (r: { j2735Value?: unknown }) => r.j2735Value;
const errors = (r: { issues: readonly { severity: string; code: string }[] }) => r.issues.filter((i) => i.severity === 'error').map((i) => i.code);

describe('rounding', () => {
  it('rounds to nearest, ties away from zero, without float artefacts', () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(Object.is(roundHalfAwayFromZero(-0.4), 0)).toBe(true);
    expect(quantize(0.29 * 100)).toBe(29); // 28.999999999999996
    expect(quantize(0.015 * 100)).toBe(2); // decimal tie 1.5
  });
});

describe('Speed (§7.196, LSB 0.02 m/s, 8191 = unavailable)', () => {
  it('converts 50 km/h as in the worked example: 13.8889 m/s → 694.44 → 694', () => {
    const r = C.convertSpeed(num('50', 'km/h'));
    expect(r.physical?.value).toBeCloseTo(13.888889, 6);
    expect(r.scaled).toBeCloseTo(694.444444, 5);
    expect(v(r)).toBe(694);
    expect(r.reconstructed?.value).toBeCloseTo(13.88, 10);
    expect(r.quantizationError?.value).toBeCloseTo(-0.008889, 6);
  });
  it('reproduces the §11.5 Table 1 DE_Velocity column (same 0.02 m/s LSB)', () => {
    const table: [number, number][] = [[0, 0], [5, 112], [15, 335], [25, 559], [30, 671], [45, 1006], [60, 1341], [70, 1565], [80, 1788]];
    for (const [mph, expected] of table) expect(v(C.convertSpeed(num(mph, 'mph')))).toBe(expected);
    expect(speedToMps(30, 'mph')).toBeCloseTo(13.4112, 10);
  });
  it('handles zero, maximum and unavailable', () => {
    expect(v(C.convertSpeed(num('0', 'm/s')))).toBe(0);
    expect(v(C.convertSpeed(num('163.8', 'm/s')))).toBe(8190);
    expect(v(C.convertSpeed(num('', 'm/s', true)))).toBe(8191);
  });
  it('rejects speeds that would collide with the unavailable code or are negative', () => {
    expect(errors(C.convertSpeed(num('163.81', 'm/s')))).toContain('OUT_OF_RANGE');
    expect(errors(C.convertSpeed(num('-1', 'km/h')))).toContain('NEGATIVE');
    expect(errors(C.convertSpeed(num('fast', 'km/h')))).toContain('NOT_A_NUMBER');
  });
});

describe('Latitude / Longitude (§7.99, §7.103)', () => {
  it('handles positive and negative coordinates', () => {
    expect(v(C.convertLatitude(num('33.2108712', 'deg')))).toBe(332108712);
    expect(v(C.convertLatitude(num('-33.8688197', 'deg')))).toBe(-338688197);
    expect(v(C.convertLongitude(num('-87.5462871', 'deg')))).toBe(-875462871);
    expect(v(C.convertLongitude(num('151.2092955', 'deg')))).toBe(1512092955);
  });
  it('handles the extremes and the unavailable codes', () => {
    expect(v(C.convertLatitude(num('90', 'deg')))).toBe(900000000);
    expect(v(C.convertLatitude(num('-90', 'deg')))).toBe(-900000000);
    expect(v(C.convertLatitude(num('', 'deg', true)))).toBe(900000001);
    expect(v(C.convertLongitude(num('180', 'deg')))).toBe(1800000000);
    expect(v(C.convertLongitude(num('', 'deg', true)))).toBe(1800000001);
    expect(errors(C.convertLatitude(num('90.0000001', 'deg')))).toContain('OUT_OF_RANGE');
    expect(errors(C.convertLongitude(num('-180.1', 'deg')))).toContain('OUT_OF_RANGE');
  });
  it('folds −180° onto +180° because the range starts at −179.9999999°', () => {
    const r = C.convertLongitude(num('-180', 'deg'));
    expect(v(r)).toBe(1800000000);
    expect(r.handling).toBe('wrapped');
    expect(v(C.convertLongitude(num('-179.9999999', 'deg')))).toBe(-1799999999);
  });
});

describe('Elevation (§7.48)', () => {
  it('quantizes to 0.1 m and saturates at both ends', () => {
    expect(v(C.convertElevation(num('38.6', 'm')))).toBe(386);
    expect(v(C.convertElevation(num('100', 'ft')))).toBe(305);
    const hi = C.convertElevation(num('7000', 'm'));
    expect([v(hi), hi.handling]).toEqual([61439, 'saturated-high']);
    const lo = C.convertElevation(num('-500', 'm'));
    expect([v(lo), lo.handling]).toEqual([-4095, 'saturated-low']);
    expect(v(C.convertElevation(num('-409.6', 'm')))).toBe(-4095); // never collides with −4096
    expect(v(C.convertElevation(num('', 'm', true)))).toBe(-4096);
  });
});

describe('Heading (§7.60) near 0° and 360°', () => {
  it.each([
    ['0', 0], ['0.00624', 0], ['0.00625', 1], ['90', 7200], ['359.9875', 28799],
    ['359.99', 28799], ['359.99374', 28799], ['359.99375', 0], ['359.9999', 0],
  ])('%s° → %i', (deg, code) => {
    expect(v(C.convertHeading(num(deg, 'deg')))).toBe(code);
  });
  it('normalizes out-of-range angles with a warning and uses 28800 for unavailable', () => {
    const r = C.convertHeading(num('360', 'deg'));
    expect(v(r)).toBe(0);
    expect(r.issues[0]?.code).toBe('NORMALIZED');
    expect(v(C.convertHeading(num('-90', 'deg')))).toBe(21600);
    expect(v(C.convertHeading(num('', 'deg', true)))).toBe(28800);
  });
});

describe('Steering wheel angle (§7.202)', () => {
  it('quantizes in 1.5° steps and saturates at ±126', () => {
    expect(v(C.convertSteeringWheelAngle(num('-45', 'deg')))).toBe(-30);
    expect(v(C.convertSteeringWheelAngle(num('189', 'deg')))).toBe(126);
    expect(C.convertSteeringWheelAngle(num('400', 'deg')).handling).toBe('saturated-high');
    expect(v(C.convertSteeringWheelAngle(num('-400', 'deg')))).toBe(-126);
    expect(v(C.convertSteeringWheelAngle(num('', 'deg', true)))).toBe(127);
  });
});

describe('Accelerations and yaw rate (§7.1, §7.243, §7.255)', () => {
  it('signed longitudinal/lateral acceleration with saturation', () => {
    expect(v(C.convertAccelLong(num('-7.8', 'm/s²')))).toBe(-780);
    expect(v(C.convertAccelLat(num('0.25', 'g')))).toBe(245); // 2.4516625 m/s²
    expect(v(C.convertAccelLong(num('-25', 'm/s²')))).toBe(-2000);
    expect(v(C.convertAccelLong(num('25', 'm/s²')))).toBe(2000);
    expect(v(C.convertAccelLong(num('', 'm/s²', true)))).toBe(2001);
  });
  it('vertical acceleration in 0.02 G steps', () => {
    expect(v(C.convertAccelVert(num('1', 'g')))).toBe(50);
    expect(v(C.convertAccelVert(num('-0.5', 'g')))).toBe(-25);
    expect(v(C.convertAccelVert(num('9.80665', 'm/s²')))).toBe(50);
    expect(v(C.convertAccelVert(num('3', 'g')))).toBe(127);
    expect(v(C.convertAccelVert(num('-3', 'g')))).toBe(-126);
    expect(v(C.convertAccelVert(num('', 'g', true)))).toBe(-127);
  });
  it('signed yaw rate, unit conversion and limits', () => {
    expect(v(C.convertYawRate(num('19.89', 'deg/s')))).toBe(1989);
    expect(v(C.convertYawRate(num('-0.5', 'rad/s')))).toBe(-2865); // −28.6479 deg/s
    expect(v(C.convertYawRate(num('327.67', 'deg/s')))).toBe(32767);
    expect(errors(C.convertYawRate(num('327.68', 'deg/s')))).toContain('OUT_OF_RANGE');
  });
  it('yaw rate has no unavailable code: sends 0 with a warning', () => {
    const r = C.convertYawRate(num('', 'deg/s', true));
    expect(v(r)).toBe(0);
    expect(r.handling).toBe('no-sentinel');
    expect(r.issues[0]?.severity).toBe('warning');
  });
});

describe('Positional accuracy (§7.184–7.186)', () => {
  it('quantizes axes in 0.05 m and saturates at 254', () => {
    expect(v(C.convertSemiMajor(num('1.2', 'm')))).toBe(24);
    expect(v(C.convertSemiMinor(num('12.70', 'm')))).toBe(254);
    expect(v(C.convertSemiMinor(num('50', 'm')))).toBe(254);
    expect(v(C.convertSemiMajor(num('', 'm', true)))).toBe(255);
    expect(errors(C.convertSemiMajor(num('-1', 'm')))).toContain('NEGATIVE');
  });
  it('orientation uses 360/65535 deg and wraps 360° to 0', () => {
    expect(v(C.convertOrientation(num('180', 'deg')))).toBe(32768); // 32767.5 → tie away from zero
    expect(v(C.convertOrientation(num('359.999', 'deg')))).toBe(0);
    expect(v(C.convertOrientation(num('', 'deg', true)))).toBe(65535);
  });
});

describe('Time (§7.43)', () => {
  it('milliseconds within the minute, leap second and unavailable', () => {
    expect(v(C.convertSecMark(num('12.345', 's')))).toBe(12345);
    expect(v(C.convertSecMark(num('59.9996', 's')))).toBe(59999);
    const leap = C.convertSecMark(num('60.5', 's'));
    expect(v(leap)).toBe(60500);
    expect(leap.issues[0]?.code).toBe('LEAP_SECOND');
    expect(v(C.convertSecMark(num('', 's', true)))).toBe(65535);
    expect(errors(C.convertSecMark(num('61', 's')))).toContain('OUT_OF_RANGE');
  });
  it('parses ISO timestamps including a leap second', () => {
    expect(C.secondsWithinMinuteFromIso('2026-10-26T14:30:12.345Z')).toBeCloseTo(12.345, 9);
    expect(C.secondsWithinMinuteFromIso('2016-12-31T23:59:60.250Z')).toBeCloseTo(60.25, 9);
    expect(C.secondsWithinMinuteFromIso('not a time')).toBeNull();
  });
});

describe('Vehicle size (§7.236, §7.240)', () => {
  it('centimetre resolution, 0 = unavailable', () => {
    expect(v(C.convertVehicleWidth(num('1.86', 'm')))).toBe(186);
    expect(v(C.convertVehicleLength(num('16.5', 'ft')))).toBe(503);
    expect(v(C.convertVehicleLength(num('', 'm', true)))).toBe(0);
    expect(errors(C.convertVehicleWidth(num('10.24', 'm')))).toContain('OUT_OF_RANGE');
    expect(errors(C.convertVehicleWidth(num('0.004', 'm')))).toContain('COLLIDES_WITH_UNAVAILABLE');
  });
});

describe('Enumerations, bit strings and system values', () => {
  it('maps brake flags onto BrakeAppliedStatus bit positions', () => {
    expect(v(C.convertWheelBrakes({ unavailable: false, leftFront: true, leftRear: false, rightFront: true, rightRear: false }))).toBe('01010');
    expect(v(C.convertWheelBrakes({ unavailable: false, leftFront: false, leftRear: true, rightFront: false, rightRear: true }))).toBe('00101');
    expect(v(C.convertWheelBrakes({ unavailable: true, leftFront: true, leftRear: true, rightFront: true, rightRear: true }))).toBe('10000');
  });
  it('passes enumeration identifiers through', () => {
    expect(v(C.convertTransmission('reverseGears'))).toBe('reverseGears');
    expect(C.convertTransmission('unavailable').handling).toBe('unavailable');
    expect(v(C.convertAbs('engaged'))).toBe('engaged');
  });
  it('validates message count and temporary ID', () => {
    expect(v(C.convertMsgCount(127))).toBe(127);
    expect(errors(C.convertMsgCount(128))).toContain('OUT_OF_RANGE');
    expect(v(C.convertTemporaryId('0x5a3f09c1'))).toBe('5A3F09C1');
    expect(errors(C.convertTemporaryId('UA-CAR-07'))).toContain('INVALID_ID');
    expect(C.randomTemporaryId()).toMatch(/^[0-9A-F]{8}$/);
  });
});
