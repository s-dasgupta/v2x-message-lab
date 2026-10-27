/**
 * Sensor-measurement → SAE J2735 field conversions for every BSM Part I leaf.
 *
 * Each function is pure and returns a FieldConversion that records every
 * intermediate step (unit conversion, scaling, quantization, range handling,
 * reconstruction and quantization error) so the UI can show the complete
 * transformation and tests can check each stage independently.
 *
 * Ranges, LSBs and special codes follow SAE J2735_202409 Section 7 (cited per
 * function). Quantization follows the §11.5 recommendation "convert with full
 * precision, then round to the nearest integer unit of the data element";
 * ties are rounded away from zero (implementation choice, see units.ts).
 */
import type { NumericInput, SystemStatusChoice, TransmissionChoice, WheelBrakesInput } from '../inputs';
import type { ConversionStep, FieldConversion, Handling, Quantity, ValidationIssue } from './types';
import {
  STANDARD_GRAVITY,
  accelToMps2,
  fmt,
  lengthToMeters,
  parseNumber,
  quantize,
  speedConversionText,
  speedToMps,
  yawToDegPerSec,
  type AccelUnit,
  type ElevationUnit,
  type LengthUnit,
  type SpeedUnit,
  type YawUnit,
} from './units';

export const ROUNDING_RULE = 'round to nearest integer, ties away from zero (§11.5 recommendation)';

function issue(severity: ValidationIssue['severity'], code: string, path: string, message: string): ValidationIssue {
  return { severity, code, path, message };
}

function showInput(input: NumericInput): string {
  return input.unavailable ? 'unavailable' : `${input.value.trim() || '(empty)'} ${input.unit}`;
}

/** Shared failure result. */
function invalid(path: string, original: string, steps: ConversionStep[], issues: ValidationIssue[]): FieldConversion {
  return { path, original, handling: 'invalid', steps, issues };
}

function parseOrFail(path: string, input: NumericInput, label: string): { value: number } | { fail: FieldConversion } {
  const v = parseNumber(input.value);
  if (v === null) {
    return {
      fail: invalid(path, showInput(input), [{ label: 'Input', detail: `"${input.value}"` }], [
        issue('error', 'NOT_A_NUMBER', path, `${label}: "${input.value}" is not a valid number. Enter a decimal number, or mark the value as unavailable.`),
      ]),
    };
  }
  return { value: v };
}

interface LinearSpec {
  readonly path: string;
  readonly label: string;
  readonly siUnit: string;
  /** LSB text, e.g. "0.02 m/s". */
  readonly resolution: string;
  /** LSB size in SI units (used for reconstruction). */
  readonly lsb: number;
  /** SI value → unrounded LSB count (computed the most exact way). */
  readonly scale: (si: number) => number;
  readonly scaleText: (si: number) => string;
  /** Inclusive range of codes that carry ordinary measurements. */
  readonly min: number;
  readonly max: number;
  readonly unavailableCode?: number;
  /** Code used for "max or greater"; when absent, exceeding max is an error. */
  readonly saturateHigh?: { code: number; meaning: string };
  readonly saturateLow?: { code: number; meaning: string };
  readonly overflowMessage?: string;
  /** For angles: code that is equivalent to code 0 (full circle). */
  readonly fullCircleCode?: number;
}

/** Generic scale → round → range-handle conversion for linear numeric elements. */
function linear(spec: LinearSpec, input: NumericInput, si: number, siSteps: ConversionStep[], preIssues: ValidationIssue[] = []): FieldConversion {
  const { path } = spec;
  const issues = [...preIssues];
  const steps = [...siSteps];
  const scaled = spec.scale(si);
  steps.push({ label: 'Scale by LSB', detail: `${spec.scaleText(si)} = ${fmt(scaled, 6)} LSB (LSB = ${spec.resolution})` });
  let code = quantize(scaled);
  steps.push({ label: 'Quantize', detail: `${ROUNDING_RULE} → ${code}` });
  let handling: Handling = 'quantized';
  if (spec.fullCircleCode !== undefined && code === spec.fullCircleCode) {
    steps.push({ label: 'Wrap', detail: `${code} represents a full turn (≡ 0) and is reserved for "unavailable" → 0` });
    code = 0;
    handling = 'wrapped';
  }
  if (code > spec.max) {
    if (spec.saturateHigh) {
      steps.push({ label: 'Range handling', detail: `${code} > ${spec.max} → ${spec.saturateHigh.code} (${spec.saturateHigh.meaning})` });
      code = spec.saturateHigh.code;
      handling = 'saturated-high';
      issues.push(issue('info', 'SATURATED', path, `${spec.label} exceeds the representable range and is sent as ${code}, meaning "${spec.saturateHigh.meaning}".`));
    } else {
      issues.push(issue('error', 'OUT_OF_RANGE', path, spec.overflowMessage ?? `${spec.label} code ${code} exceeds the maximum ${spec.max}.`));
      return { path, original: showInput(input), physical: { value: si, unit: spec.siUnit }, scaled, resolution: spec.resolution, quantizationRule: ROUNDING_RULE, handling: 'invalid', steps, issues };
    }
  } else if (code < spec.min) {
    if (spec.saturateLow) {
      steps.push({ label: 'Range handling', detail: `${code} < ${spec.min} → ${spec.saturateLow.code} (${spec.saturateLow.meaning})` });
      code = spec.saturateLow.code;
      handling = 'saturated-low';
      issues.push(issue('info', 'SATURATED', path, `${spec.label} is below the representable range and is sent as ${code}, meaning "${spec.saturateLow.meaning}".`));
    } else {
      issues.push(issue('error', 'OUT_OF_RANGE', path, spec.overflowMessage ?? `${spec.label} code ${code} is below the minimum ${spec.min}.`));
      return { path, original: showInput(input), physical: { value: si, unit: spec.siUnit }, scaled, resolution: spec.resolution, quantizationRule: ROUNDING_RULE, handling: 'invalid', steps, issues };
    }
  } else {
    steps.push({ label: 'Range check', detail: `${spec.min} ≤ ${code} ≤ ${spec.max} ✓${spec.unavailableCode !== undefined ? ` (${spec.unavailableCode} is reserved for unavailable)` : ''}` });
  }
  const reconstructed: Quantity = { value: code * spec.lsb, unit: spec.siUnit };
  const quantizationError: Quantity = { value: reconstructed.value - si, unit: spec.siUnit };
  steps.push({ label: 'Reconstructed by receiver', detail: `${code} × ${spec.resolution} = ${fmt(reconstructed.value, 7)} ${spec.siUnit}` });
  if (handling === 'quantized' || handling === 'wrapped') {
    steps.push({ label: 'Quantization error', detail: `${fmt(quantizationError.value, 7)} ${spec.siUnit}` });
  }
  return {
    path,
    original: showInput(input),
    physical: { value: si, unit: spec.siUnit },
    scaled,
    resolution: spec.resolution,
    quantizationRule: ROUNDING_RULE,
    j2735Value: code,
    handling,
    reconstructed,
    quantizationError: handling === 'saturated-high' || handling === 'saturated-low' ? undefined : quantizationError,
    steps,
    issues,
  };
}

function unavailableResult(path: string, code: number, label: string, resolution?: string): FieldConversion {
  return {
    path,
    original: 'unavailable',
    resolution,
    j2735Value: code,
    handling: 'unavailable',
    steps: [
      { label: 'Input', detail: 'marked unavailable' },
      { label: 'Special value', detail: `${label} uses ${code} to signal "unavailable"` },
    ],
    issues: [],
  };
}

// ---------------------------------------------------------------------------
// Position (§7.99, §7.103, §7.48)
// ---------------------------------------------------------------------------

export function convertLatitude(input: NumericInput<'deg'>): FieldConversion {
  const path = 'coreData.lat';
  if (input.unavailable) return unavailableResult(path, 900000001, 'DE_Latitude', '0.1 µdeg');
  const p = parseOrFail(path, input, 'Latitude');
  if ('fail' in p) return p.fail;
  const steps: ConversionStep[] = [{ label: 'Input', detail: `${p.value}° (WGS-84, + north)` }];
  if (p.value < -90 || p.value > 90) {
    return invalid(path, showInput(input), steps, [issue('error', 'OUT_OF_RANGE', path, `Latitude ${p.value}° is outside −90° … +90°.`)]);
  }
  return linear(
    {
      path, label: 'Latitude', siUnit: 'deg', resolution: '1e-7 deg', lsb: 1e-7,
      scale: (d) => d * 1e7, scaleText: (d) => `${d}° × 10⁷`,
      min: -900000000, max: 900000000, unavailableCode: 900000001,
    },
    input, p.value, steps,
  );
}

export function convertLongitude(input: NumericInput<'deg'>): FieldConversion {
  const path = 'coreData.long';
  if (input.unavailable) return unavailableResult(path, 1800000001, 'DE_Longitude', '0.1 µdeg');
  const p = parseOrFail(path, input, 'Longitude');
  if ('fail' in p) return p.fail;
  const steps: ConversionStep[] = [{ label: 'Input', detail: `${p.value}° (WGS-84, + east)` }];
  if (p.value < -180 || p.value > 180) {
    return invalid(path, showInput(input), steps, [issue('error', 'OUT_OF_RANGE', path, `Longitude ${p.value}° is outside −180° … +180°.`)]);
  }
  const r = linear(
    {
      path, label: 'Longitude', siUnit: 'deg', resolution: '1e-7 deg', lsb: 1e-7,
      scale: (d) => d * 1e7, scaleText: (d) => `${d}° × 10⁷`,
      // −1 800 000 000 is outside the ASN.1 range; it is folded onto +180° below.
      min: -1800000000, max: 1800000000, unavailableCode: 1800000001,
    },
    input, p.value, steps,
  );
  if (r.j2735Value === -1800000000) {
    return {
      ...r,
      j2735Value: 1800000000,
      handling: 'wrapped',
      reconstructed: { value: 180, unit: 'deg' },
      quantizationError: { value: 180 - p.value - 360, unit: 'deg' },
      steps: [...r.steps, { label: 'Wrap', detail: '−180° is the same meridian as +180°; DE_Longitude starts at −179.9999999°, so +1800000000 is sent' }],
      issues: [...r.issues, issue('info', 'WRAPPED', path, 'Longitude −180° was sent as +180° (same meridian); the ASN.1 range begins at −1799999999.')],
    };
  }
  return r;
}

export function convertElevation(input: NumericInput<ElevationUnit>): FieldConversion {
  const path = 'coreData.elev';
  if (input.unavailable) return unavailableResult(path, -4096, 'DE_Elevation', '0.1 m');
  const p = parseOrFail(path, input, 'Elevation');
  if ('fail' in p) return p.fail;
  const m = lengthToMeters(p.value, input.unit);
  const steps: ConversionStep[] = [
    { label: 'Input', detail: `${p.value} ${input.unit} above the WGS-84 ellipsoid` },
    { label: 'Convert to SI', detail: input.unit === 'ft' ? `${p.value} ft × 0.3048 = ${fmt(m)} m` : `${fmt(m)} m (already SI)` },
  ];
  return linear(
    {
      path, label: 'Elevation', siUnit: 'm', resolution: '0.1 m', lsb: 0.1,
      scale: (x) => x * 10, scaleText: (x) => `${fmt(x)} m × 10`,
      min: -4095, max: 61439, unavailableCode: -4096,
      saturateHigh: { code: 61439, meaning: '+6143.9 m or higher' },
      saturateLow: { code: -4095, meaning: '−409.5 m or lower' },
    },
    input, m, steps,
  );
}

// ---------------------------------------------------------------------------
// Time (§7.43)
// ---------------------------------------------------------------------------

export function convertSecMark(input: NumericInput<'s'>): FieldConversion {
  const path = 'coreData.secMark';
  if (input.unavailable) return unavailableResult(path, 65535, 'DE_DSecond', '1 ms');
  const p = parseOrFail(path, input, 'Seconds within the minute');
  if ('fail' in p) return p.fail;
  const steps: ConversionStep[] = [{ label: 'Input', detail: `${p.value} s after the start of the current UTC minute` }];
  if (p.value < 0 || p.value >= 61) {
    return invalid(path, showInput(input), steps, [
      issue('error', 'OUT_OF_RANGE', path, `Seconds within the minute must be 0 ≤ s < 61 (60.000–60.999 only during a leap second); got ${p.value}.`),
    ]);
  }
  const scaled = p.value * 1000;
  const code = Math.floor(Math.round(scaled * 1e6) / 1e6);
  steps.push({ label: 'Scale by LSB', detail: `${p.value} s × 1000 = ${fmt(scaled, 6)} ms (LSB = 1 ms)` });
  steps.push({ label: 'Quantize', detail: `truncate to the whole millisecond → ${code} (implementation choice: never rounds into the next second)` });
  const issues: ValidationIssue[] = [];
  if (code >= 60000) {
    steps.push({ label: 'Range check', detail: `60000 ≤ ${code} ≤ 60999: leap-second range` });
    issues.push(issue('info', 'LEAP_SECOND', path, 'Value lies in 60000–60999, which J2735 reserves for a leap second.'));
  } else {
    steps.push({ label: 'Range check', detail: `0 ≤ ${code} ≤ 59999 ✓ (61000–65534 reserved, 65535 unavailable)` });
  }
  const reconstructed = { value: code / 1000, unit: 's' };
  steps.push({ label: 'Reconstructed by receiver', detail: `${code} ms = ${fmt(reconstructed.value, 3)} s` });
  steps.push({ label: 'Quantization error', detail: `${fmt(reconstructed.value - p.value, 6)} s` });
  return {
    path, original: showInput(input), physical: { value: p.value, unit: 's' }, scaled, resolution: '1 ms',
    quantizationRule: 'truncate to whole milliseconds', j2735Value: code, handling: 'quantized', reconstructed,
    quantizationError: { value: reconstructed.value - p.value, unit: 's' }, steps, issues,
  };
}

/**
 * Extracts "seconds within the minute" from an ISO-8601 UTC timestamp,
 * accepting ss = 60 for a leap second (which JavaScript Date cannot represent).
 */
export function secondsWithinMinuteFromIso(iso: string): number | null {
  const m = /^\s*\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:(\d{2})(\.\d+)?\s*(Z|[+-]00:?00)?\s*$/i.exec(iso);
  if (!m) return null;
  const sec = Number(m[1]);
  if (sec > 60) return null;
  return sec + (m[2] ? Number(`0${m[2]}`) : 0);
}

// ---------------------------------------------------------------------------
// Positional accuracy (§6.97, §7.184–7.186)
// ---------------------------------------------------------------------------

function convertAxisAccuracy(path: string, label: string, input: NumericInput<'m'>): FieldConversion {
  if (input.unavailable) return unavailableResult(path, 255, label, '0.05 m');
  const p = parseOrFail(path, input, label);
  if ('fail' in p) return p.fail;
  const steps: ConversionStep[] = [{ label: 'Input', detail: `${p.value} m (1-σ error ellipse axis)` }];
  if (p.value < 0) {
    return invalid(path, showInput(input), steps, [issue('error', 'NEGATIVE', path, `${label} must not be negative.`)]);
  }
  return linear(
    {
      path, label, siUnit: 'm', resolution: '0.05 m', lsb: 0.05,
      scale: (x) => x * 20, scaleText: (x) => `${fmt(x)} m ÷ 0.05 m`,
      min: 0, max: 253, unavailableCode: 255,
      saturateHigh: { code: 254, meaning: '12.70 m or greater' },
    },
    input, p.value, steps,
  );
}

export const convertSemiMajor = (input: NumericInput<'m'>) => convertAxisAccuracy('coreData.accuracy.semiMajor', 'Semi-major axis accuracy', input);
export const convertSemiMinor = (input: NumericInput<'m'>) => convertAxisAccuracy('coreData.accuracy.semiMinor', 'Semi-minor axis accuracy', input);

/** Folds an angle into [0, 360) and reports whether that changed it. */
function normalizeAngle(path: string, label: string, deg: number, steps: ConversionStep[], issues: ValidationIssue[]): number {
  if (deg >= 0 && deg < 360) return deg;
  const n = ((deg % 360) + 360) % 360;
  steps.push({ label: 'Normalize', detail: `${deg}° → ${fmt(n)}° (angles are measured 0 ≤ θ < 360°)` });
  issues.push(issue('warning', 'NORMALIZED', path, `${label} ${deg}° was normalized to ${fmt(n)}°.`));
  return n;
}

export function convertOrientation(input: NumericInput<'deg'>): FieldConversion {
  const path = 'coreData.accuracy.orientation';
  if (input.unavailable) return unavailableResult(path, 65535, 'DE_SemiMajorAxisOrientation', '360/65535 deg');
  const p = parseOrFail(path, input, 'Semi-major axis orientation');
  if ('fail' in p) return p.fail;
  const steps: ConversionStep[] = [{ label: 'Input', detail: `${p.value}° from true north` }];
  const issues: ValidationIssue[] = [];
  const deg = normalizeAngle(path, 'Orientation', p.value, steps, issues);
  return linear(
    {
      path, label: 'Orientation', siUnit: 'deg', resolution: '360/65535 deg (≈0.0054932 deg)', lsb: 360 / 65535,
      scale: (d) => (d * 65535) / 360, scaleText: (d) => `${fmt(d)}° × 65535 / 360`,
      min: 0, max: 65534, unavailableCode: 65535, fullCircleCode: 65535,
    },
    input, deg, steps, issues,
  );
}

// ---------------------------------------------------------------------------
// Motion (§7.196, §7.60, §7.202)
// ---------------------------------------------------------------------------

export function convertSpeed(input: NumericInput<SpeedUnit>): FieldConversion {
  const path = 'coreData.speed';
  if (input.unavailable) return unavailableResult(path, 8191, 'DE_Speed', '0.02 m/s');
  const p = parseOrFail(path, input, 'Speed');
  if ('fail' in p) return p.fail;
  const mps = speedToMps(p.value, input.unit);
  const steps: ConversionStep[] = [
    { label: 'Input', detail: `${p.value} ${input.unit}` },
    { label: 'Convert to SI', detail: `${speedConversionText(p.value, input.unit)} = ${fmt(mps)} m/s` },
  ];
  if (p.value < 0) {
    return invalid(path, showInput(input), steps, [
      issue('error', 'NEGATIVE', path, 'Speed is an unsigned magnitude. Report reverse motion through the transmission state (reverseGears), not a negative speed.'),
    ]);
  }
  return linear(
    {
      path, label: 'Speed', siUnit: 'm/s', resolution: '0.02 m/s', lsb: 0.02,
      scale: (v) => v * 50, scaleText: (v) => `${fmt(v)} m/s ÷ 0.02 m/s`,
      min: 0, max: 8190, unavailableCode: 8191,
      overflowMessage: 'Speed exceeds 163.80 m/s (589.68 km/h), the largest value DE_Speed can carry (8190). J2735 defines no saturation code for DE_Speed, so the value cannot be encoded.',
    },
    input, mps, steps,
  );
}

export function convertHeading(input: NumericInput<'deg'>): FieldConversion {
  const path = 'coreData.heading';
  if (input.unavailable) return unavailableResult(path, 28800, 'DE_Heading', '0.0125 deg');
  const p = parseOrFail(path, input, 'Heading');
  if ('fail' in p) return p.fail;
  const steps: ConversionStep[] = [{ label: 'Input', detail: `${p.value}° clockwise from WGS-84 north` }];
  const issues: ValidationIssue[] = [];
  const deg = normalizeAngle(path, 'Heading', p.value, steps, issues);
  return linear(
    {
      path, label: 'Heading', siUnit: 'deg', resolution: '0.0125 deg', lsb: 0.0125,
      scale: (d) => d * 80, scaleText: (d) => `${fmt(d)}° ÷ 0.0125°`,
      min: 0, max: 28799, unavailableCode: 28800, fullCircleCode: 28800,
    },
    input, deg, steps, issues,
  );
}

export function convertSteeringWheelAngle(input: NumericInput<'deg'>): FieldConversion {
  const path = 'coreData.angle';
  if (input.unavailable) return unavailableResult(path, 127, 'DE_SteeringWheelAngle', '1.5 deg');
  const p = parseOrFail(path, input, 'Steering wheel angle');
  if ('fail' in p) return p.fail;
  const steps: ConversionStep[] = [{ label: 'Input', detail: `${p.value}° (positive = turned to the right)` }];
  return linear(
    {
      path, label: 'Steering wheel angle', siUnit: 'deg', resolution: '1.5 deg', lsb: 1.5,
      scale: (d) => d / 1.5, scaleText: (d) => `${fmt(d)}° ÷ 1.5°`,
      min: -126, max: 126, unavailableCode: 127,
      saturateHigh: { code: 126, meaning: '+189° and beyond' },
      saturateLow: { code: -126, meaning: '−189° and beyond' },
    },
    input, p.value, steps,
  );
}

// ---------------------------------------------------------------------------
// Acceleration set (§6.1, §7.1, §7.243, §7.255)
// ---------------------------------------------------------------------------

function convertAcceleration(path: string, label: string, axisNote: string, input: NumericInput<AccelUnit>): FieldConversion {
  if (input.unavailable) return unavailableResult(path, 2001, 'DE_Acceleration', '0.01 m/s²');
  const p = parseOrFail(path, input, label);
  if ('fail' in p) return p.fail;
  const a = accelToMps2(p.value, input.unit);
  const steps: ConversionStep[] = [
    { label: 'Input', detail: `${p.value} ${input.unit} (${axisNote})` },
    { label: 'Convert to SI', detail: input.unit === 'g' ? `${p.value} g × 9.80665 = ${fmt(a)} m/s²` : `${fmt(a)} m/s² (already SI)` },
  ];
  return linear(
    {
      path, label, siUnit: 'm/s²', resolution: '0.01 m/s²', lsb: 0.01,
      scale: (x) => x * 100, scaleText: (x) => `${fmt(x)} m/s² ÷ 0.01 m/s²`,
      min: -2000, max: 2000, unavailableCode: 2001,
      saturateHigh: { code: 2000, meaning: '+20.00 m/s² or greater' },
      saturateLow: { code: -2000, meaning: '−20.00 m/s² or less' },
    },
    input, a, steps,
  );
}

export const convertAccelLong = (input: NumericInput<AccelUnit>) =>
  convertAcceleration('coreData.accelSet.long', 'Longitudinal acceleration', '+ forward, − braking', input);
export const convertAccelLat = (input: NumericInput<AccelUnit>) =>
  convertAcceleration('coreData.accelSet.lat', 'Lateral acceleration', '+ toward the right side', input);

export function convertAccelVert(input: NumericInput<AccelUnit>): FieldConversion {
  const path = 'coreData.accelSet.vert';
  if (input.unavailable) return unavailableResult(path, -127, 'DE_VerticalAcceleration', '0.02 G');
  const p = parseOrFail(path, input, 'Vertical acceleration');
  if ('fail' in p) return p.fail;
  const a = accelToMps2(p.value, input.unit);
  const steps: ConversionStep[] = [
    { label: 'Input', detail: `${p.value} ${input.unit} along the vehicle vertical axis` },
    { label: 'Convert to SI', detail: input.unit === 'g' ? `${p.value} g × 9.80665 = ${fmt(a)} m/s²` : `${fmt(a)} m/s² (already SI)` },
  ];
  const lsb = 0.02 * STANDARD_GRAVITY;
  return linear(
    {
      path, label: 'Vertical acceleration', siUnit: 'm/s²', resolution: '0.02 G (0.196133 m/s²)', lsb,
      scale: (x) => (input.unit === 'g' ? p.value * 50 : x / lsb),
      scaleText: (x) => (input.unit === 'g' ? `${p.value} g ÷ 0.02 g` : `${fmt(x)} m/s² ÷ 0.196133 m/s²`),
      min: -126, max: 127, unavailableCode: -127,
      saturateHigh: { code: 127, meaning: '+2.54 G or greater' },
      // The standard's comment reads "<= 2.52 G"; the signed code −126 can only mean −2.52 G or less.
      saturateLow: { code: -126, meaning: '−2.52 G or less' },
    },
    input, a, steps,
  );
}

export function convertYawRate(input: NumericInput<YawUnit>): FieldConversion {
  const path = 'coreData.accelSet.yaw';
  if (input.unavailable) {
    return {
      path,
      original: 'unavailable',
      resolution: '0.01 deg/s',
      j2735Value: 0,
      handling: 'no-sentinel',
      steps: [
        { label: 'Input', detail: 'marked unavailable' },
        { label: 'Special value', detail: 'DE_YawRate (§7.255) defines no "unavailable" code; 0 is sent' },
      ],
      issues: [
        issue('warning', 'NO_UNAVAILABLE_CODE', path,
          'J2735 DE_YawRate has no code for "unavailable". This tool sends 0 (a convention seen in deployed data, not a requirement of the standard); receivers cannot distinguish it from a true zero yaw rate.'),
      ],
    };
  }
  const p = parseOrFail(path, input, 'Yaw rate');
  if ('fail' in p) return p.fail;
  const d = yawToDegPerSec(p.value, input.unit);
  const steps: ConversionStep[] = [
    { label: 'Input', detail: `${p.value} ${input.unit} (positive = clockwise / turning right)` },
    { label: 'Convert to SI', detail: input.unit === 'rad/s' ? `${p.value} rad/s × 180/π = ${fmt(d)} deg/s` : `${fmt(d)} deg/s (unit of the element)` },
  ];
  return linear(
    {
      path, label: 'Yaw rate', siUnit: 'deg/s', resolution: '0.01 deg/s', lsb: 0.01,
      scale: (x) => x * 100, scaleText: (x) => `${fmt(x)} deg/s ÷ 0.01 deg/s`,
      min: -32767, max: 32767,
      overflowMessage: 'Yaw rate magnitude exceeds 327.67 deg/s, the limit of DE_YawRate. J2735 defines no saturation code for this element.',
    },
    input, d, steps,
  );
}

// ---------------------------------------------------------------------------
// Vehicle size (§6.169, §7.236, §7.240)
// ---------------------------------------------------------------------------

function convertDimension(path: string, label: string, max: number, input: NumericInput<LengthUnit>): FieldConversion {
  if (input.unavailable) return unavailableResult(path, 0, label, '1 cm');
  const p = parseOrFail(path, input, label);
  if ('fail' in p) return p.fail;
  const m = lengthToMeters(p.value, input.unit);
  const steps: ConversionStep[] = [
    { label: 'Input', detail: `${p.value} ${input.unit}` },
    { label: 'Convert to SI', detail: input.unit === 'm' ? `${fmt(m)} m (already SI)` : `${p.value} ${input.unit} → ${fmt(m)} m` },
  ];
  if (m < 0) return invalid(path, showInput(input), steps, [issue('error', 'NEGATIVE', path, `${label} must be positive.`)]);
  const r = linear(
    {
      path, label, siUnit: 'm', resolution: '1 cm', lsb: 0.01,
      scale: (x) => x * 100, scaleText: (x) => `${fmt(x)} m ÷ 0.01 m`,
      min: 0, max,
      overflowMessage: `${label} exceeds ${fmt(max / 100, 2)} m, the largest value the element can carry. J2735 defines no saturation code for it.`,
    },
    input, m, steps,
  );
  if (r.j2735Value === 0) {
    return {
      ...r,
      handling: 'invalid',
      j2735Value: undefined,
      issues: [...r.issues, issue('error', 'COLLIDES_WITH_UNAVAILABLE', path, `${label} rounds to 0 cm, which J2735 reserves for "unavailable". Enter a realistic dimension or mark it unavailable.`)],
    };
  }
  return r;
}

export const convertVehicleWidth = (input: NumericInput<LengthUnit>) => convertDimension('coreData.size.width', 'Vehicle width', 1023, input);
export const convertVehicleLength = (input: NumericInput<LengthUnit>) => convertDimension('coreData.size.length', 'Vehicle length', 4095, input);

// ---------------------------------------------------------------------------
// Enumerations and bit strings (§7.226, §6.9 / §7.20, 7.215, 7.11, 7.198, 7.21, 7.16)
// ---------------------------------------------------------------------------

const TRANSMISSION_VALUES: Record<TransmissionChoice, number> = {
  neutral: 0, park: 1, forwardGears: 2, reverseGears: 3, unavailable: 7,
};

export function convertTransmission(choice: TransmissionChoice): FieldConversion {
  const path = 'coreData.transmission';
  const value = TRANSMISSION_VALUES[choice];
  return {
    path,
    original: choice,
    j2735Value: choice,
    handling: choice === 'unavailable' ? 'unavailable' : 'exact',
    steps: [
      { label: 'Input', detail: `transmission state "${choice}"` },
      { label: 'Enumeration', detail: `TransmissionState.${choice} has enumeration value ${value} (values 4–6 are reserved)` },
      { label: 'UPER', detail: `8 root items → 3-bit index ${value}` },
    ],
    issues: [],
  };
}

export function convertWheelBrakes(input: WheelBrakesInput): FieldConversion {
  const path = 'coreData.brakes.wheelBrakes';
  const issues: ValidationIssue[] = [];
  let bits: string;
  if (input.unavailable) {
    bits = '10000';
    if (input.leftFront || input.leftRear || input.rightFront || input.rightRear) {
      issues.push(issue('info', 'IGNORED', path, 'Per-wheel flags are cleared because the brake-applied status is marked unavailable.'));
    }
  } else {
    bits = ['0', input.leftFront, input.leftRear, input.rightFront, input.rightRear].map((b) => (b === true ? '1' : b === false ? '0' : b)).join('');
  }
  return {
    path,
    original: input.unavailable
      ? 'unavailable'
      : (['leftFront', 'leftRear', 'rightFront', 'rightRear'] as const).filter((k) => input[k]).join(', ') || 'no wheel braking',
    j2735Value: bits,
    handling: input.unavailable ? 'unavailable' : 'exact',
    steps: [
      { label: 'Input', detail: input.unavailable ? 'brake-applied status unavailable' : 'per-wheel brake activity' },
      { label: 'Bit mapping', detail: 'bit 0 unavailable · bit 1 leftFront · bit 2 leftRear · bit 3 rightFront · bit 4 rightRear' },
      { label: 'BIT STRING', detail: `'${bits}'B (fixed SIZE(5): 5 bits, no length field)` },
    ],
    issues,
  };
}

function convertStatusEnum(path: string, typeName: string, choice: string, items: readonly string[]): FieldConversion {
  const value = items.indexOf(choice);
  const width = Math.ceil(Math.log2(items.length));
  return {
    path,
    original: choice,
    j2735Value: choice,
    handling: choice === 'unavailable' ? 'unavailable' : 'exact',
    steps: [
      { label: 'Input', detail: `"${choice}"` },
      { label: 'Enumeration', detail: `${typeName}.${choice} = ${value}` },
      { label: 'UPER', detail: `${items.length} root items → ${width}-bit index ${value}` },
    ],
    issues: [],
  };
}

const STATUS_ITEMS = ['unavailable', 'off', 'on', 'engaged'] as const;

export const convertTraction = (c: SystemStatusChoice) => convertStatusEnum('coreData.brakes.traction', 'TractionControlStatus', c, STATUS_ITEMS);
export const convertAbs = (c: SystemStatusChoice) => convertStatusEnum('coreData.brakes.abs', 'AntiLockBrakeStatus', c, STATUS_ITEMS);
export const convertScs = (c: SystemStatusChoice) => convertStatusEnum('coreData.brakes.scs', 'StabilityControlStatus', c, STATUS_ITEMS);
export const convertBrakeBoost = (c: string) => convertStatusEnum('coreData.brakes.brakeBoost', 'BrakeBoostApplied', c, ['unavailable', 'off', 'on']);
export const convertAuxBrakes = (c: string) => convertStatusEnum('coreData.brakes.auxBrakes', 'AuxiliaryBrakeStatus', c, ['unavailable', 'off', 'on', 'reserved']);

// ---------------------------------------------------------------------------
// System-generated values (§7.113, §7.204)
// ---------------------------------------------------------------------------

export function convertMsgCount(count: number): FieldConversion {
  const path = 'coreData.msgCnt';
  const steps: ConversionStep[] = [{ label: 'Source', detail: 'sequence number maintained by the sending device' }];
  if (!Number.isInteger(count) || count < 0 || count > 127) {
    return invalid(path, String(count), steps, [issue('error', 'OUT_OF_RANGE', path, `Message count must be an integer 0…127; got ${count}.`)]);
  }
  steps.push({ label: 'UPER', detail: `INTEGER (0..127) → 7 bits` });
  return { path, original: String(count), j2735Value: count, handling: 'exact', steps, issues: [] };
}

export function convertTemporaryId(hex: string): FieldConversion {
  const path = 'coreData.id';
  const clean = hex.trim().replace(/^0x/i, '').replace(/\s+/g, '').toUpperCase();
  const steps: ConversionStep[] = [{ label: 'Source', detail: 'random identifier generated by the sending device' }];
  if (!/^[0-9A-F]{8}$/.test(clean)) {
    return invalid(path, hex, steps, [issue('error', 'INVALID_ID', path, 'Temporary ID must be exactly 4 octets: 8 hexadecimal digits, e.g. 3A7F01C4.')]);
  }
  steps.push({ label: 'UPER', detail: 'OCTET STRING (SIZE(4)) → 32 bits, no length field' });
  return { path, original: clean, j2735Value: clean, handling: 'exact', steps, issues: [] };
}

/** Generates a random TemporaryID using the platform CSPRNG. */
export function randomTemporaryId(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}
