/**
 * Realistic, internally consistent vehicle scenarios for the BSM Generator.
 *
 * Location: University Boulevard area, Tuscaloosa, Alabama. Elevations are
 * heights above the WGS-84 ellipsoid (what J2735 DE_Elevation carries), not
 * above mean sea level: the local geoid lies about 29 m below the ellipsoid,
 * so a road at ≈68 m MSL is at ≈39 m ellipsoidal height. (Geoid offset is an
 * approximate, illustrative value.)
 */
import { num, type SystemInputs, type VehicleInputs } from '../inputs';

export interface Scenario {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  /** Why the numbers are mutually consistent. */
  readonly physics: readonly string[];
  readonly inputs: VehicleInputs;
  readonly system: SystemInputs;
}

const sedan = { vehicleWidth: num('1.86', 'm'), vehicleLength: num('4.97', 'm') } as const;

const base: VehicleInputs = {
  latitude: num('33.2108712', 'deg'),
  longitude: num('-87.5462871', 'deg'),
  elevation: num('38.6', 'm'),
  utcSecond: num('12.345', 's'),
  semiMajor: num('1.20', 'm'),
  semiMinor: num('0.85', 'm'),
  orientation: num('15', 'deg'),
  transmission: 'forwardGears',
  speed: num('50', 'km/h'),
  heading: num('90', 'deg'),
  steeringWheelAngle: num('0', 'deg'),
  accelLong: num('0', 'm/s²'),
  accelLat: num('0', 'm/s²'),
  accelVert: num('0', 'm/s²'),
  yawRate: num('0', 'deg/s'),
  wheelBrakes: { unavailable: false, leftFront: false, leftRear: false, rightFront: false, rightRear: false },
  traction: 'on',
  abs: 'on',
  scs: 'on',
  brakeBoost: 'off',
  auxBrakes: 'off',
  ...sedan,
};

const allWheels = { unavailable: false, leftFront: true, leftRear: true, rightFront: true, rightRear: true };

// Turning scenario geometry: v = 25 km/h, radius R = 20 m, wheelbase L = 2.83 m, steering ratio 15.7.
const TURN_V = 25 / 3.6; // 6.944 m/s
const TURN_R = 20;
const turnYawDeg = ((TURN_V / TURN_R) * 180) / Math.PI; // 19.89 deg/s
const turnLatAccel = (TURN_V * TURN_V) / TURN_R; // 2.411 m/s²
const turnSteering = ((Math.atan(2.83 / TURN_R) * 180) / Math.PI) * 15.7; // ≈126 deg at the wheel

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'normal',
    title: 'Normal driving',
    summary: 'A sedan cruising east at a steady 50 km/h on a straight road with good GNSS reception.',
    physics: [
      'Constant speed and heading → longitudinal, lateral acceleration and yaw rate are all zero.',
      'Steering wheel centred; no brakes applied; stability systems switched on but not intervening.',
      'Elevation is the ellipsoidal height (≈ 68 m above sea level minus a ≈ 29 m geoid separation).',
    ],
    inputs: base,
    system: { msgCount: 17, temporaryId: '5A3F09C1' },
  },
  {
    id: 'emergency-braking',
    title: 'Emergency braking',
    summary: 'The driver stamps on the brake at 72 km/h: about 0.8 g of deceleration with ABS and brake assist active.',
    physics: [
      'Longitudinal acceleration −7.8 m/s² (≈ −0.80 g) is typical of an ABS stop on dry asphalt.',
      'All four wheel brakes are applied, ABS is engaged, and brake boost (brake assist) is on — the combination J2735 associates with emergency braking.',
      'Heading stays constant and the yaw rate is near zero because the car brakes in a straight line.',
    ],
    inputs: {
      ...base,
      utcSecond: num('31.900', 's'),
      speed: num('72', 'km/h'),
      accelLong: num('-7.8', 'm/s²'),
      accelLat: num('0.1', 'm/s²'),
      yawRate: num('0.2', 'deg/s'),
      wheelBrakes: allWheels,
      abs: 'engaged',
      brakeBoost: 'on',
    },
    system: { msgCount: 52, temporaryId: '5A3F09C1' },
  },
  {
    id: 'turning',
    title: 'Turning vehicle',
    summary: 'A right turn at 25 km/h around a 20 m radius corner, captured mid-turn while heading south-east.',
    physics: [
      `Yaw rate = v / R = 6.944 m/s ÷ 20 m = 0.347 rad/s = ${turnYawDeg.toFixed(2)} deg/s (positive: turning right, clockwise).`,
      `Lateral acceleration = v² / R = ${turnLatAccel.toFixed(3)} m/s², positive toward the right side (the centre of a right turn).`,
      `Steering wheel ≈ atan(L/R) × steering ratio = atan(2.83/20) × 15.7 ≈ ${turnSteering.toFixed(0)}° to the right.`,
      'A light lift off the accelerator gives a small negative longitudinal acceleration.',
    ],
    inputs: {
      ...base,
      utcSecond: num('45.020', 's'),
      speed: num('25', 'km/h'),
      heading: num('135', 'deg'),
      steeringWheelAngle: num(turnSteering.toFixed(1), 'deg'),
      accelLong: num('-0.3', 'm/s²'),
      accelLat: num(turnLatAccel.toFixed(3), 'm/s²'),
      yawRate: num(turnYawDeg.toFixed(2), 'deg/s'),
    },
    system: { msgCount: 88, temporaryId: '5A3F09C1' },
  },
  {
    id: 'stationary',
    title: 'Stationary at an intersection',
    summary: 'Stopped at a red light, in Drive with the foot on the brake, facing north.',
    physics: [
      'Speed, accelerations and yaw rate are zero.',
      'All wheel brakes are applied (service brake held) while the transmission stays in a forward gear.',
      'Heading 0° is the last reliable direction of travel: §7.60 allows the past heading to be used when stopped and the path is well known.',
    ],
    inputs: {
      ...base,
      latitude: num('33.2099018', 'deg'),
      longitude: num('-87.5418310', 'deg'),
      utcSecond: num('5.500', 's'),
      speed: num('0', 'km/h'),
      heading: num('0', 'deg'),
      wheelBrakes: allWheels,
    },
    system: { msgCount: 3, temporaryId: 'C47E2B90' },
  },
  {
    id: 'degraded',
    title: 'Unavailable / degraded sensors',
    summary: 'GNSS is degraded under an overpass and several vehicle-bus signals are missing.',
    physics: [
      'Position is a dead-reckoned estimate: latitude/longitude are still sent, but elevation and the accuracy ellipse are unavailable.',
      'Speed comes from wheel-speed sensors and remains available; heading is not reliable and is sent as unavailable.',
      'Yaw rate is unavailable, but DE_YawRate has no unavailable code — the tool must send 0 and warns about it.',
      'Brake, stability, transmission and size information is not provided by this vehicle integration.',
    ],
    inputs: {
      ...base,
      utcSecond: num('59.999', 's'),
      elevation: num('', 'm', true),
      semiMajor: num('', 'm', true),
      semiMinor: num('', 'm', true),
      orientation: num('', 'deg', true),
      transmission: 'unavailable',
      speed: num('30', 'km/h'),
      heading: num('', 'deg', true),
      steeringWheelAngle: num('', 'deg', true),
      accelLong: num('-0.2', 'm/s²'),
      accelLat: num('', 'm/s²', true),
      accelVert: num('', 'm/s²', true),
      yawRate: num('', 'deg/s', true),
      wheelBrakes: { unavailable: true, leftFront: false, leftRear: false, rightFront: false, rightRear: false },
      traction: 'unavailable',
      abs: 'unavailable',
      scs: 'unavailable',
      brakeBoost: 'unavailable',
      auxBrakes: 'unavailable',
      vehicleWidth: num('', 'm', true),
      vehicleLength: num('', 'm', true),
    },
    system: { msgCount: 127, temporaryId: '0B91D6E4' },
  },
];

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
