/** Unit conversion and quantization primitives (all pure functions). */

/** Standard gravity used by J2735 DE_VerticalAcceleration (§7.243): 1 G = 9.80665 m/s². */
export const STANDARD_GRAVITY = 9.80665;

export type SpeedUnit = 'km/h' | 'm/s' | 'mph';
export type AccelUnit = 'm/s²' | 'g';
export type YawUnit = 'deg/s' | 'rad/s';
export type LengthUnit = 'm' | 'cm' | 'ft';
export type ElevationUnit = 'm' | 'ft';

export const SPEED_UNITS: readonly SpeedUnit[] = ['km/h', 'm/s', 'mph'];
export const ACCEL_UNITS: readonly AccelUnit[] = ['m/s²', 'g'];
export const YAW_UNITS: readonly YawUnit[] = ['deg/s', 'rad/s'];
export const SIZE_UNITS: readonly LengthUnit[] = ['m', 'cm', 'ft'];
export const ELEVATION_UNITS: readonly ElevationUnit[] = ['m', 'ft'];

const MPH_TO_MPS = 0.44704; // exact: 1 mi = 1609.344 m
const FT_TO_M = 0.3048; // exact

export function speedToMps(value: number, unit: SpeedUnit): number {
  switch (unit) {
    case 'm/s':
      return value;
    case 'km/h':
      return value / 3.6;
    case 'mph':
      return value * MPH_TO_MPS;
  }
}

export function speedConversionText(value: number, unit: SpeedUnit): string {
  switch (unit) {
    case 'm/s':
      return `${value} m/s (already SI)`;
    case 'km/h':
      return `${value} km/h ÷ 3.6`;
    case 'mph':
      return `${value} mph × 0.44704`;
  }
}

export function accelToMps2(value: number, unit: AccelUnit): number {
  return unit === 'g' ? value * STANDARD_GRAVITY : value;
}

export function yawToDegPerSec(value: number, unit: YawUnit): number {
  return unit === 'rad/s' ? (value * 180) / Math.PI : value;
}

export function lengthToMeters(value: number, unit: LengthUnit | ElevationUnit): number {
  switch (unit) {
    case 'm':
      return value;
    case 'cm':
      return value / 100;
    case 'ft':
      return value * FT_TO_M;
  }
}

/**
 * Removes binary floating-point artefacts (e.g. 28.999999999999996) before
 * rounding, so that decimal inputs that land exactly on a half-step are
 * treated as ties. Precision kept: 1e-6 of one LSB.
 */
export function cleanScaled(scaled: number): number {
  return Math.round(scaled * 1e6) / 1e6;
}

/**
 * Round to the nearest integer, ties away from zero.
 *
 * J2735 §11.5 recommends converting to m/s "with full precision" and then
 * rounding to the nearest integer unit of the data element. It does not state
 * a tie-breaking rule; ties away from zero is this project's implementation
 * choice (symmetric for positive and negative quantities).
 */
export function roundHalfAwayFromZero(x: number): number {
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return r === 0 ? 0 : r; // normalise -0
}

export function quantize(scaled: number): number {
  return roundHalfAwayFromZero(cleanScaled(scaled));
}

/** Formats a number with up to `digits` decimals, trimming trailing zeros. */
export function fmt(x: number, digits = 6): string {
  if (!Number.isFinite(x)) return String(x);
  const s = x.toFixed(digits);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/** Parses a user-entered number; returns null for empty/invalid text. */
export function parseNumber(text: string): number | null {
  const t = text.trim();
  if (t === '' || !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}
