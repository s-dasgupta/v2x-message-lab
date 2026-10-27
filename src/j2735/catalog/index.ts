import { bitsForRange } from '../../asn1/bits';
import type { AsnType } from '../../asn1/types';
import { ENTRIES } from './entries';
import type { CatalogEntry, FieldSpec } from './types';

export * from './types';
export { ENTRIES };

const byId = new Map(ENTRIES.map((e) => [e.id, e]));

export function entry(id: string): CatalogEntry {
  const e = byId.get(id);
  if (!e) throw new Error(`unknown catalog entry ${id}`);
  return e;
}

/** Every component of BasicSafetyMessage Part I, in encoding order. */
export const FIELD_SPECS: readonly FieldSpec[] = [
  { path: 'coreData', component: 'coreData', label: 'Core data (Part I)', entityId: 'DF_BSMcoreData', parentId: 'MSG_BasicSafetyMessage', required: true, origin: 'structure' },
  { path: 'coreData.msgCnt', component: 'msgCnt', label: 'Message count', entityId: 'DE_MsgCount', parentId: 'DF_BSMcoreData', required: true, origin: 'system' },
  { path: 'coreData.id', component: 'id', label: 'Temporary ID', entityId: 'DE_TemporaryID', parentId: 'DF_BSMcoreData', required: true, origin: 'system' },
  { path: 'coreData.secMark', component: 'secMark', label: 'Time (secMark)', entityId: 'DE_DSecond', parentId: 'DF_BSMcoreData', required: true, origin: 'sensor' },
  { path: 'coreData.lat', component: 'lat', label: 'Latitude', entityId: 'DE_Latitude', parentId: 'DF_BSMcoreData', required: true, origin: 'sensor' },
  { path: 'coreData.long', component: 'long', label: 'Longitude', entityId: 'DE_Longitude', parentId: 'DF_BSMcoreData', required: true, origin: 'sensor' },
  { path: 'coreData.elev', component: 'elev', label: 'Elevation', entityId: 'DE_Elevation', parentId: 'DF_BSMcoreData', required: true, origin: 'sensor' },
  { path: 'coreData.accuracy', component: 'accuracy', label: 'Positional accuracy', entityId: 'DF_PositionalAccuracy', parentId: 'DF_BSMcoreData', required: true, origin: 'structure' },
  { path: 'coreData.accuracy.semiMajor', component: 'semiMajor', label: 'Semi-major axis', entityId: 'DE_SemiMajorAxisAccuracy', parentId: 'DF_PositionalAccuracy', required: true, origin: 'sensor' },
  { path: 'coreData.accuracy.semiMinor', component: 'semiMinor', label: 'Semi-minor axis', entityId: 'DE_SemiMinorAxisAccuracy', parentId: 'DF_PositionalAccuracy', required: true, origin: 'sensor' },
  { path: 'coreData.accuracy.orientation', component: 'orientation', label: 'Ellipse orientation', entityId: 'DE_SemiMajorAxisOrientation', parentId: 'DF_PositionalAccuracy', required: true, origin: 'sensor' },
  { path: 'coreData.transmission', component: 'transmission', label: 'Transmission state', entityId: 'DE_TransmissionState', parentId: 'DF_BSMcoreData', required: true, origin: 'sensor' },
  { path: 'coreData.speed', component: 'speed', label: 'Speed', entityId: 'DE_Speed', parentId: 'DF_BSMcoreData', required: true, origin: 'sensor' },
  { path: 'coreData.heading', component: 'heading', label: 'Heading', entityId: 'DE_Heading', parentId: 'DF_BSMcoreData', required: true, origin: 'sensor' },
  { path: 'coreData.angle', component: 'angle', label: 'Steering wheel angle', entityId: 'DE_SteeringWheelAngle', parentId: 'DF_BSMcoreData', required: true, origin: 'sensor' },
  { path: 'coreData.accelSet', component: 'accelSet', label: 'Acceleration set', entityId: 'DF_AccelerationSet4Way', parentId: 'DF_BSMcoreData', required: true, origin: 'structure' },
  { path: 'coreData.accelSet.long', component: 'long', label: 'Longitudinal accel.', entityId: 'DE_Acceleration', parentId: 'DF_AccelerationSet4Way', required: true, origin: 'sensor' },
  { path: 'coreData.accelSet.lat', component: 'lat', label: 'Lateral accel.', entityId: 'DE_Acceleration', parentId: 'DF_AccelerationSet4Way', required: true, origin: 'sensor' },
  { path: 'coreData.accelSet.vert', component: 'vert', label: 'Vertical accel.', entityId: 'DE_VerticalAcceleration', parentId: 'DF_AccelerationSet4Way', required: true, origin: 'sensor' },
  { path: 'coreData.accelSet.yaw', component: 'yaw', label: 'Yaw rate', entityId: 'DE_YawRate', parentId: 'DF_AccelerationSet4Way', required: true, origin: 'sensor' },
  { path: 'coreData.brakes', component: 'brakes', label: 'Brake system status', entityId: 'DF_BrakeSystemStatus', parentId: 'DF_BSMcoreData', required: true, origin: 'structure' },
  { path: 'coreData.brakes.wheelBrakes', component: 'wheelBrakes', label: 'Wheel brakes', entityId: 'DE_BrakeAppliedStatus', parentId: 'DF_BrakeSystemStatus', required: true, origin: 'sensor' },
  { path: 'coreData.brakes.traction', component: 'traction', label: 'Traction control', entityId: 'DE_TractionControlStatus', parentId: 'DF_BrakeSystemStatus', required: true, origin: 'sensor' },
  { path: 'coreData.brakes.abs', component: 'abs', label: 'ABS', entityId: 'DE_AntiLockBrakeStatus', parentId: 'DF_BrakeSystemStatus', required: true, origin: 'sensor' },
  { path: 'coreData.brakes.scs', component: 'scs', label: 'Stability control', entityId: 'DE_StabilityControlStatus', parentId: 'DF_BrakeSystemStatus', required: true, origin: 'sensor' },
  { path: 'coreData.brakes.brakeBoost', component: 'brakeBoost', label: 'Brake boost', entityId: 'DE_BrakeBoostApplied', parentId: 'DF_BrakeSystemStatus', required: true, origin: 'sensor' },
  { path: 'coreData.brakes.auxBrakes', component: 'auxBrakes', label: 'Auxiliary brakes', entityId: 'DE_AuxiliaryBrakeStatus', parentId: 'DF_BrakeSystemStatus', required: true, origin: 'sensor' },
  { path: 'coreData.size', component: 'size', label: 'Vehicle size', entityId: 'DF_VehicleSize', parentId: 'DF_BSMcoreData', required: true, origin: 'structure' },
  { path: 'coreData.size.width', component: 'width', label: 'Vehicle width', entityId: 'DE_VehicleWidth', parentId: 'DF_VehicleSize', required: true, origin: 'configuration' },
  { path: 'coreData.size.length', component: 'length', label: 'Vehicle length', entityId: 'DE_VehicleLength', parentId: 'DF_VehicleSize', required: true, origin: 'configuration' },
];

export const LEAF_FIELDS: readonly FieldSpec[] = FIELD_SPECS.filter((f) => f.origin !== 'structure');

const byPath = new Map(FIELD_SPECS.map((f) => [f.path, f]));

/** Looks up a field spec by a BSM path, ignoring a MessageFrame "value." prefix and array indices. */
export function fieldByPath(path: string): FieldSpec | undefined {
  return byPath.get(path.replace(/^value\./, ''));
}

/** UPER width in bits of a fixed-width type (undefined for variable-width types). */
export function fixedUperBits(type: AsnType): number | undefined {
  switch (type.kind) {
    case 'INTEGER':
      return type.extensible ? undefined : bitsForRange(type.ub - type.lb + 1);
    case 'ENUMERATED':
      return type.extensible ? undefined : bitsForRange(type.root.length);
    case 'BIT STRING':
      return type.size;
    case 'OCTET STRING':
      return type.maxSize !== null && type.minSize === type.maxSize ? type.minSize * 8 : undefined;
    case 'SEQUENCE': {
      if (type.extensible || type.fields.some((f) => f.optional)) return undefined;
      let sum = 0;
      for (const f of type.fields) {
        const b = fixedUperBits(f.type);
        if (b === undefined) return undefined;
        sum += b;
      }
      return sum;
    }
    default:
      return undefined;
  }
}

/** Free-text search across the catalog (Module J). */
export function searchCatalog(query: string): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...ENTRIES];
  return ENTRIES.filter((e) => {
    const hay = [
      e.id, e.type.name, e.section, e.summary, e.what, e.unit, e.resolution, e.representation,
      e.type.kind, ...(e.keywords ?? []), ...FIELD_SPECS.filter((f) => f.entityId === e.id).flatMap((f) => [f.component, f.label, f.path]),
    ].filter(Boolean).join(' ').toLowerCase();
    return q.split(/\s+/).every((t) => hay.includes(t));
  });
}
