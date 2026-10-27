/**
 * Machine-readable schema for the SAE J2735 (SEP2024) types needed by
 * Release 1: MessageFrame, BasicSafetyMessage, and the complete BSM Part I
 * (DF_BSMcoreData) tree.
 *
 * This is an independently written transcription of the type structure and
 * constraints (component names, order, ranges, sizes, enumeration values) that
 * any interoperable implementation must reproduce. It intentionally contains
 * no text from the standard; the explanatory content lives in ../catalog and is
 * original. Section numbers refer to SAE J2735_202409.
 *
 * Part II content and regional extensions are carried as opaque open types:
 * their octets are preserved byte-for-byte but not interpreted (Release 1).
 */
import type {
  AsnType,
  BitStringType,
  EnumeratedType,
  IntegerType,
  OctetStringType,
  OpenType,
  SequenceType,
} from '../../asn1/types';

// --- Data elements (Section 7) ---------------------------------------------

/** §7.113 */
export const MsgCount: IntegerType = { kind: 'INTEGER', name: 'MsgCount', lb: 0, ub: 127 };
/** §7.204 */
export const TemporaryID: OctetStringType = { kind: 'OCTET STRING', name: 'TemporaryID', minSize: 4, maxSize: 4 };
/** §7.43 */
export const DSecond: IntegerType = { kind: 'INTEGER', name: 'DSecond', lb: 0, ub: 65535 };
/** §7.99 */
export const Latitude: IntegerType = { kind: 'INTEGER', name: 'Latitude', lb: -900000000, ub: 900000001 };
/** §7.103 */
export const Longitude: IntegerType = { kind: 'INTEGER', name: 'Longitude', lb: -1799999999, ub: 1800000001 };
/** §7.48 */
export const Elevation: IntegerType = { kind: 'INTEGER', name: 'Elevation', lb: -4096, ub: 61439 };
/** §7.184 */
export const SemiMajorAxisAccuracy: IntegerType = { kind: 'INTEGER', name: 'SemiMajorAxisAccuracy', lb: 0, ub: 255 };
/** §7.186 */
export const SemiMinorAxisAccuracy: IntegerType = { kind: 'INTEGER', name: 'SemiMinorAxisAccuracy', lb: 0, ub: 255 };
/** §7.185 */
export const SemiMajorAxisOrientation: IntegerType = { kind: 'INTEGER', name: 'SemiMajorAxisOrientation', lb: 0, ub: 65535 };

/** §7.226 */
export const TransmissionState: EnumeratedType = {
  kind: 'ENUMERATED',
  name: 'TransmissionState',
  extensible: false,
  root: [
    { name: 'neutral', value: 0 },
    { name: 'park', value: 1 },
    { name: 'forwardGears', value: 2 },
    { name: 'reverseGears', value: 3 },
    { name: 'reserved1', value: 4 },
    { name: 'reserved2', value: 5 },
    { name: 'reserved3', value: 6 },
    { name: 'unavailable', value: 7 },
  ],
};

/** §7.196 */
export const Speed: IntegerType = { kind: 'INTEGER', name: 'Speed', lb: 0, ub: 8191 };
/** §7.60 */
export const Heading: IntegerType = { kind: 'INTEGER', name: 'Heading', lb: 0, ub: 28800 };
/** §7.202 */
export const SteeringWheelAngle: IntegerType = { kind: 'INTEGER', name: 'SteeringWheelAngle', lb: -126, ub: 127 };
/** §7.1 */
export const Acceleration: IntegerType = { kind: 'INTEGER', name: 'Acceleration', lb: -2000, ub: 2001 };
/** §7.243 */
export const VerticalAcceleration: IntegerType = { kind: 'INTEGER', name: 'VerticalAcceleration', lb: -127, ub: 127 };
/** §7.255 */
export const YawRate: IntegerType = { kind: 'INTEGER', name: 'YawRate', lb: -32767, ub: 32767 };

/** §7.20 */
export const BrakeAppliedStatus: BitStringType = {
  kind: 'BIT STRING',
  name: 'BrakeAppliedStatus',
  size: 5,
  namedBits: [
    { name: 'unavailable', bit: 0 },
    { name: 'leftFront', bit: 1 },
    { name: 'leftRear', bit: 2 },
    { name: 'rightFront', bit: 3 },
    { name: 'rightRear', bit: 4 },
  ],
};

const offOnEngaged = (name: string): EnumeratedType => ({
  kind: 'ENUMERATED',
  name,
  extensible: false,
  root: [
    { name: 'unavailable', value: 0 },
    { name: 'off', value: 1 },
    { name: 'on', value: 2 },
    { name: 'engaged', value: 3 },
  ],
});

/** §7.215 */
export const TractionControlStatus = offOnEngaged('TractionControlStatus');
/** §7.11 */
export const AntiLockBrakeStatus = offOnEngaged('AntiLockBrakeStatus');
/** §7.198 */
export const StabilityControlStatus = offOnEngaged('StabilityControlStatus');

/** §7.21 */
export const BrakeBoostApplied: EnumeratedType = {
  kind: 'ENUMERATED',
  name: 'BrakeBoostApplied',
  extensible: false,
  root: [
    { name: 'unavailable', value: 0 },
    { name: 'off', value: 1 },
    { name: 'on', value: 2 },
  ],
};

/** §7.16 */
export const AuxiliaryBrakeStatus: EnumeratedType = {
  kind: 'ENUMERATED',
  name: 'AuxiliaryBrakeStatus',
  extensible: false,
  root: [
    { name: 'unavailable', value: 0 },
    { name: 'off', value: 1 },
    { name: 'on', value: 2 },
    { name: 'reserved', value: 3 },
  ],
};

/** §7.240 */
export const VehicleWidth: IntegerType = { kind: 'INTEGER', name: 'VehicleWidth', lb: 0, ub: 1023 };
/** §7.236 */
export const VehicleLength: IntegerType = { kind: 'INTEGER', name: 'VehicleLength', lb: 0, ub: 4095 };

/** §7.44 */
export const DSRCmsgID: IntegerType = { kind: 'INTEGER', name: 'DSRCmsgID', lb: 0, ub: 32767 };
/** §5.2 (PartII-Id) */
export const PartIIId: IntegerType = { kind: 'INTEGER', name: 'PartII-Id', lb: 0, ub: 63 };
/** §7.163 */
export const RegionId: IntegerType = { kind: 'INTEGER', name: 'RegionId', lb: 0, ub: 255 };

// --- Data frames (Section 6) -----------------------------------------------

/** §6.97 */
export const PositionalAccuracy: SequenceType = {
  kind: 'SEQUENCE',
  name: 'PositionalAccuracy',
  extensible: false,
  fields: [
    { name: 'semiMajor', type: SemiMajorAxisAccuracy },
    { name: 'semiMinor', type: SemiMinorAxisAccuracy },
    { name: 'orientation', type: SemiMajorAxisOrientation },
  ],
};

/** §6.1 */
export const AccelerationSet4Way: SequenceType = {
  kind: 'SEQUENCE',
  name: 'AccelerationSet4Way',
  extensible: false,
  fields: [
    { name: 'long', type: Acceleration },
    { name: 'lat', type: Acceleration },
    { name: 'vert', type: VerticalAcceleration },
    { name: 'yaw', type: YawRate },
  ],
};

/** §6.9 */
export const BrakeSystemStatus: SequenceType = {
  kind: 'SEQUENCE',
  name: 'BrakeSystemStatus',
  extensible: false,
  fields: [
    { name: 'wheelBrakes', type: BrakeAppliedStatus },
    { name: 'traction', type: TractionControlStatus },
    { name: 'abs', type: AntiLockBrakeStatus },
    { name: 'scs', type: StabilityControlStatus },
    { name: 'brakeBoost', type: BrakeBoostApplied },
    { name: 'auxBrakes', type: AuxiliaryBrakeStatus },
  ],
};

/** §6.169 */
export const VehicleSize: SequenceType = {
  kind: 'SEQUENCE',
  name: 'VehicleSize',
  extensible: false,
  fields: [
    { name: 'width', type: VehicleWidth },
    { name: 'length', type: VehicleLength },
  ],
};

/** §6.10 — BSM Part I. No OPTIONAL components and no extension marker. */
export const BSMcoreData: SequenceType = {
  kind: 'SEQUENCE',
  name: 'BSMcoreData',
  extensible: false,
  fields: [
    { name: 'msgCnt', type: MsgCount },
    { name: 'id', type: TemporaryID },
    { name: 'secMark', type: DSecond },
    { name: 'lat', type: Latitude },
    { name: 'long', type: Longitude },
    { name: 'elev', type: Elevation },
    { name: 'accuracy', type: PositionalAccuracy },
    { name: 'transmission', type: TransmissionState },
    { name: 'speed', type: Speed },
    { name: 'heading', type: Heading },
    { name: 'angle', type: SteeringWheelAngle },
    { name: 'accelSet', type: AccelerationSet4Way },
    { name: 'brakes', type: BrakeSystemStatus },
    { name: 'size', type: VehicleSize },
  ],
};

// --- Part II and regional extension containers (opaque in Release 1) -------

const opaquePartIIValue: OpenType = {
  kind: 'OPEN TYPE',
  notation: 'PARTII-EXT-ID-AND-TYPE.&Type({BSMpartIIExtension}{@partII-Id})',
  resolve: () => undefined,
};

/** §5.2 PartIIcontent{{BSMpartIIExtension}} (value carried as an opaque open type). */
export const PartIIcontent: SequenceType = {
  kind: 'SEQUENCE',
  name: 'PartIIcontent',
  extensible: false,
  fields: [
    { name: 'partII-Id', type: PartIIId, notation: 'PARTII-EXT-ID-AND-TYPE.&id({BSMpartIIExtension})' },
    { name: 'partII-Value', type: opaquePartIIValue },
  ],
};

const opaqueRegionalValue: OpenType = {
  kind: 'OPEN TYPE',
  notation: 'REG-EXT-ID-AND-TYPE.&Type({Reg-BasicSafetyMessage}{@regionId})',
  resolve: () => undefined,
};

/** §5.1 RegionalExtension{{Reg-BasicSafetyMessage}} (value carried as an opaque open type). */
export const RegionalExtensionBSM: SequenceType = {
  kind: 'SEQUENCE',
  name: 'RegionalExtension-BSM',
  extensible: false,
  fields: [
    { name: 'regionId', type: RegionId, notation: 'REG-EXT-ID-AND-TYPE.&id({Reg-BasicSafetyMessage})' },
    { name: 'regExtValue', type: opaqueRegionalValue },
  ],
};

// --- Messages (Section 5) ---------------------------------------------------

/** §5.2 */
export const BasicSafetyMessage: SequenceType = {
  kind: 'SEQUENCE',
  name: 'BasicSafetyMessage',
  extensible: true,
  fields: [
    { name: 'coreData', type: BSMcoreData },
    {
      name: 'partII',
      optional: true,
      type: { kind: 'SEQUENCE OF', item: PartIIcontent, minSize: 1, maxSize: 8 },
    },
    {
      name: 'regional',
      optional: true,
      type: { kind: 'SEQUENCE OF', item: RegionalExtensionBSM, minSize: 1, maxSize: 4 },
    },
  ],
};

/** DSRCmsgID value assigned to the BSM (§7.44). */
export const BSM_MESSAGE_ID = 20;

/** Message types this release can decode inside a MessageFrame. */
export const SUPPORTED_MESSAGE_TYPES: ReadonlyMap<number, AsnType> = new Map([[BSM_MESSAGE_ID, BasicSafetyMessage]]);

/** §5.1 */
export const MessageFrame: SequenceType = {
  kind: 'SEQUENCE',
  name: 'MessageFrame',
  extensible: true,
  fields: [
    { name: 'messageId', type: DSRCmsgID, notation: 'MESSAGE-ID-AND-TYPE.&id({MessageTypes})' },
    {
      name: 'value',
      type: {
        kind: 'OPEN TYPE',
        notation: 'MESSAGE-ID-AND-TYPE.&Type({MessageTypes}{@.messageId})',
        resolve: (siblings) =>
          typeof siblings.messageId === 'number' ? SUPPORTED_MESSAGE_TYPES.get(siblings.messageId) : undefined,
      },
    },
  ],
};

/** Information object classes and sets referenced by the open types above. */
export const CLASS_ASSIGNMENTS: readonly string[] = [
  `MESSAGE-ID-AND-TYPE ::= CLASS {
    &id     DSRCmsgID UNIQUE,
    &Type
} WITH SYNTAX {&Type IDENTIFIED BY &id}`,
  `MessageTypes MESSAGE-ID-AND-TYPE ::= {
    { BasicSafetyMessage IDENTIFIED BY basicSafetyMessage },
    ... -- other J2735 messages are outside the scope of this release
}`,
  `basicSafetyMessage DSRCmsgID ::= ${BSM_MESSAGE_ID}`,
  `PARTII-EXT-ID-AND-TYPE ::= CLASS {
    &id     PartII-Id UNIQUE,
    &Type
} WITH SYNTAX {&Type IDENTIFIED BY &id}`,
  `BSMpartIIExtension PARTII-EXT-ID-AND-TYPE ::= {
    ... -- Part II content types are not modelled in this release
}`,
  `REG-EXT-ID-AND-TYPE ::= CLASS {
    &id     RegionId UNIQUE,
    &Type
} WITH SYNTAX {&Type IDENTIFIED BY &id}`,
  `Reg-BasicSafetyMessage REG-EXT-ID-AND-TYPE ::= { ... }`,
];

/** All named types in Release 1, for reference/search features. */
export const RELEASE1_ROOTS: readonly AsnType[] = [MessageFrame];
