/**
 * Builds the structured BSM (Part I) from vehicle inputs and system values.
 *
 * The result contains the BSMcoreData object exactly as the encoder consumes
 * it, the per-field conversion records (Module C), and all validation issues.
 * If any field fails to convert, `coreData` is undefined: the tool never
 * silently omits or invents a mandatory field.
 */
import type { AsnValue } from '../asn1/types';
import * as C from './conversions/fields';
import type { FieldConversion, ValidationIssue } from './conversions/types';
import { accelToMps2, parseNumber, speedToMps, yawToDegPerSec } from './conversions/units';
import type { SystemInputs, VehicleInputs } from './inputs';

export interface BsmCoreData {
  msgCnt: number;
  id: string;
  secMark: number;
  lat: number;
  long: number;
  elev: number;
  accuracy: { semiMajor: number; semiMinor: number; orientation: number };
  transmission: string;
  speed: number;
  heading: number;
  angle: number;
  accelSet: { long: number; lat: number; vert: number; yaw: number };
  brakes: { wheelBrakes: string; traction: string; abs: string; scs: string; brakeBoost: string; auxBrakes: string };
  size: { width: number; length: number };
}

export interface BuildResult {
  readonly coreData?: BsmCoreData;
  /** Conversion records keyed by component path ("coreData.speed", ...). */
  readonly conversions: Readonly<Record<string, FieldConversion>>;
  readonly issues: readonly ValidationIssue[];
  readonly ok: boolean;
}

export function convertAll(inputs: VehicleInputs, system: SystemInputs): FieldConversion[] {
  return [
    C.convertMsgCount(system.msgCount),
    C.convertTemporaryId(system.temporaryId),
    C.convertSecMark(inputs.utcSecond),
    C.convertLatitude(inputs.latitude),
    C.convertLongitude(inputs.longitude),
    C.convertElevation(inputs.elevation),
    C.convertSemiMajor(inputs.semiMajor),
    C.convertSemiMinor(inputs.semiMinor),
    C.convertOrientation(inputs.orientation),
    C.convertTransmission(inputs.transmission),
    C.convertSpeed(inputs.speed),
    C.convertHeading(inputs.heading),
    C.convertSteeringWheelAngle(inputs.steeringWheelAngle),
    C.convertAccelLong(inputs.accelLong),
    C.convertAccelLat(inputs.accelLat),
    C.convertAccelVert(inputs.accelVert),
    C.convertYawRate(inputs.yawRate),
    C.convertWheelBrakes(inputs.wheelBrakes),
    C.convertTraction(inputs.traction),
    C.convertAbs(inputs.abs),
    C.convertScs(inputs.scs),
    C.convertBrakeBoost(inputs.brakeBoost),
    C.convertAuxBrakes(inputs.auxBrakes),
    C.convertVehicleWidth(inputs.vehicleWidth),
    C.convertVehicleLength(inputs.vehicleLength),
  ];
}

function setPath(target: Record<string, unknown>, path: string, value: AsnValue): void {
  const parts = path.split('.');
  let node = target;
  for (const part of parts.slice(0, -1)) {
    node[part] ??= {};
    node = node[part] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]!] = value;
}

/** Plausibility checks across fields. These never block encoding. */
export function consistencyIssues(inputs: VehicleInputs): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const val = (i: { value: string; unavailable: boolean }) => (i.unavailable ? null : parseNumber(i.value));
  const speedRaw = val(inputs.speed);
  const speed = speedRaw === null ? null : speedToMps(speedRaw, inputs.speed.unit);
  const along = val(inputs.accelLong);
  const accelLong = along === null ? null : accelToMps2(along, inputs.accelLong.unit);
  const yawRaw = val(inputs.yawRate);
  const yaw = yawRaw === null ? null : yawToDegPerSec(yawRaw, inputs.yawRate.unit);
  const wb = inputs.wheelBrakes;
  const anyWheel = wb.leftFront || wb.leftRear || wb.rightFront || wb.rightRear;

  if (speed !== null && speed > 0.5 && inputs.transmission === 'park') {
    out.push({ severity: 'warning', code: 'PARK_WHILE_MOVING', path: 'coreData.transmission', message: 'Transmission is in park while the speed is above 0.5 m/s.' });
  }
  const major = val(inputs.semiMajor);
  const minor = val(inputs.semiMinor);
  if (major !== null && minor !== null && minor > major) {
    out.push({ severity: 'warning', code: 'MINOR_GT_MAJOR', path: 'coreData.accuracy.semiMinor', message: 'The semi-minor axis is larger than the semi-major axis; by definition it should not be.' });
  }
  if (!wb.unavailable && !anyWheel && inputs.brakeBoost === 'on') {
    out.push({ severity: 'warning', code: 'BOOST_WITHOUT_BRAKES', path: 'coreData.brakes.brakeBoost', message: 'Brake boost is on but no wheel brake is reported as applied.' });
  }
  if (!wb.unavailable && !anyWheel && inputs.abs === 'engaged') {
    out.push({ severity: 'warning', code: 'ABS_WITHOUT_BRAKES', path: 'coreData.brakes.abs', message: 'ABS is engaged but no wheel brake is reported as applied.' });
  }
  if (!wb.unavailable && !anyWheel && accelLong !== null && accelLong < -3) {
    out.push({ severity: 'info', code: 'DECEL_WITHOUT_BRAKES', path: 'coreData.brakes.wheelBrakes', message: 'Strong deceleration (< −3 m/s²) is reported without any wheel brake applied.' });
  }
  if (speed === 0 && yaw !== null && Math.abs(yaw) > 1) {
    out.push({ severity: 'warning', code: 'YAW_WHILE_STOPPED', path: 'coreData.accelSet.yaw', message: 'The vehicle is stopped but reports a yaw rate above 1 deg/s.' });
  }
  if (speed !== null && speed > 0 && inputs.transmission === 'reverseGears' && accelLong !== null && accelLong > 0) {
    out.push({ severity: 'info', code: 'REVERSE_ACCEL', path: 'coreData.accelSet.long', message: 'In reverse, longitudinal acceleration is still measured along the vehicle\'s forward axis.' });
  }
  return out;
}

export function buildBsm(inputs: VehicleInputs, system: SystemInputs): BuildResult {
  const list = convertAll(inputs, system);
  const conversions: Record<string, FieldConversion> = {};
  const issues: ValidationIssue[] = [];
  const core: Record<string, unknown> = {};
  let complete = true;
  for (const c of list) {
    conversions[c.path] = c;
    issues.push(...c.issues);
    if (c.j2735Value === undefined) complete = false;
    else setPath(core, c.path.replace(/^coreData\./, ''), c.j2735Value);
  }
  issues.push(...consistencyIssues(inputs));
  const ok = complete && !issues.some((i) => i.severity === 'error');
  return { coreData: ok ? (core as unknown as BsmCoreData) : undefined, conversions, issues, ok };
}
