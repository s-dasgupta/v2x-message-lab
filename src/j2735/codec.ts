/**
 * J2735-level encode/decode entry points built on the generic UPER engine.
 *
 * Two distinct ASN.1 entry types are supported (§5.1 and §5.2):
 *   - BasicSafetyMessage: the BSM structure alone.
 *   - MessageFrame: { messageId = 20, value = BasicSafetyMessage as an open type }.
 * Neither includes IEEE 1609.2 security, WSMP/IEEE 1609.3 headers, or any radio
 * (PC5 / 802.11p) framing — those belong to lower layers of the stack.
 */
import { bytesToHex } from '../asn1/bits';
import type { DecodeIssue } from '../asn1/errors';
import { decode, encode, type DecodeResult, type EncodeResult } from '../asn1/uper';
import type { AsnValue } from '../asn1/types';
import { EncodeError } from '../asn1/errors';
import { BSM_MESSAGE_ID, BasicSafetyMessage, MessageFrame } from './schema';
import type { BsmCoreData } from './bsmBuilder';
import { interpretBsm, type Interpretation } from './interpret';

export type EntryType = 'MessageFrame' | 'BasicSafetyMessage';

export const MESSAGE_ID_NAMES: Readonly<Record<number, string>> = {
  18: 'mapData (MAP)', 19: 'signalPhaseAndTimingMessage (SPaT)', 20: 'basicSafetyMessage (BSM)',
  21: 'commonSafetyRequest (CSR)', 22: 'emergencyVehicleAlert (EVA)', 23: 'intersectionCollision (ICA)',
  24: 'nmeaCorrections (NMEA)', 25: 'probeDataManagement (PDM)', 26: 'probeVehicleData (PVD)',
  27: 'roadSideAlert (RSA)', 28: 'rtcmCorrections (RTCM)', 29: 'signalRequestMessage (SRM)',
  30: 'signalStatusMessage (SSM)', 31: 'travelerInformation (TIM)', 32: 'personalSafetyMessage (PSM)',
  33: 'roadSafetyMessage (RSM)', 34: 'roadWeatherMessage (RWM)', 35: 'probeDataConfigMessage (PDC)',
  36: 'probeDataReportMessage (PDR)', 37: 'tollAdvertisementMessage (TAM)', 38: 'tollUsageMessage (TUM)',
  39: 'tollUsageAckMessage (TUMack)', 40: 'cooperativeControlMessage (CCM)', 41: 'sensorDataSharingMessage (SDSM)',
  42: 'maneuverSharingAndCoordinatingMessage (MSCM)', 43: 'roadGeometryAndAttributes (RGA)',
  44: 'personalSafetyMessage2 (PSM2)', 45: 'trafficSignalPhaseAndTiming (TSPaT)',
  46: 'signalControlAndPrioritizationRequest (SCPR)', 47: 'signalControlAndPrioritizationStatus (SCPS)',
  48: 'roadUserChargingConfigMessage (RUCCM)', 49: 'roadUserChargingReportMessage (RUCRM)',
  50: 'trafficLightStatusMessage (TLSM)',
};

export function messageIdName(id: number): string {
  if (MESSAGE_ID_NAMES[id]) return MESSAGE_ID_NAMES[id];
  if (id >= 240 && id <= 255) return `testMessage${String(id - 240).padStart(2, '0')} (local testing)`;
  if (id <= 17) return 'retired DER-era identifier (not used with UPER)';
  return 'reserved for future standard use';
}

export interface BsmEncoding {
  readonly bsm: EncodeResult;
  readonly frame: EncodeResult;
}

/** Encodes Part I (and optional pass-through Part II/regional content) both ways. */
export function encodeBsm(coreData: BsmCoreData, extra: { partII?: AsnValue; regional?: AsnValue } = {}): BsmEncoding {
  const value: Record<string, AsnValue> = { coreData: coreData as unknown as AsnValue };
  if (extra.partII !== undefined) value.partII = extra.partII;
  if (extra.regional !== undefined) value.regional = extra.regional;
  const bsm = encode(BasicSafetyMessage, value);
  const frame = encode(MessageFrame, { messageId: BSM_MESSAGE_ID, value });
  return { bsm, frame };
}

export function tryEncodeBsm(coreData: BsmCoreData): { ok: true; result: BsmEncoding } | { ok: false; error: string } {
  try {
    return { ok: true, result: encodeBsm(coreData) };
  } catch (e) {
    if (e instanceof EncodeError) return { ok: false, error: `${e.code}: ${e.message}` };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Hex input
// ---------------------------------------------------------------------------

export type HexParse = { ok: true; bytes: Uint8Array; normalized: string } | { ok: false; error: string };

/** Accepts hex with optional whitespace, colons, dashes, commas and 0x prefixes. */
export function parseHexInput(text: string): HexParse {
  const stripped = text.replace(/0x/gi, '').replace(/[\s:,\-]/g, '');
  if (stripped.length === 0) return { ok: false, error: 'No hexadecimal data was entered.' };
  const bad = stripped.match(/[^0-9a-fA-F]/);
  if (bad) return { ok: false, error: `Invalid character "${bad[0]}" at position ${stripped.indexOf(bad[0]) + 1}: only 0-9 and A-F are allowed.` };
  if (stripped.length % 2 !== 0) return { ok: false, error: `Odd number of hex digits (${stripped.length}); every octet needs two digits — the payload looks truncated by half an octet.` };
  const bytes = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(stripped.slice(2 * i, 2 * i + 2), 16);
  return { ok: true, bytes, normalized: stripped.toUpperCase() };
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

export interface PayloadDecode {
  readonly entry: EntryType;
  readonly raw: DecodeResult;
  /** All issues: ASN.1 structural + J2735 semantic + diagnostic hints. */
  readonly issues: DecodeIssue[];
  /** True when the payload is a structurally valid BSM of the selected entry type. */
  readonly ok: boolean;
  readonly messageId?: number;
  /** The decoded BasicSafetyMessage (whether from a frame or directly). */
  readonly bsm?: Record<string, unknown>;
  readonly interpretations?: Interpretation[];
  /** Path prefix of BSM components inside the trace ('' or 'value'). */
  readonly bsmPathPrefix: string;
  readonly hex: string;
}

function diagnose(bytes: Uint8Array, entry: EntryType): DecodeIssue[] {
  const hints: DecodeIssue[] = [];
  if (entry === 'BasicSafetyMessage' && bytes.length >= 2 && bytes[0] === 0x00 && bytes[1] === 0x14) {
    hints.push({ severity: 'info', code: 'LOOKS_LIKE_FRAME', path: '', message: 'The payload starts with 00 14 — the MessageFrame header for messageId 20 (BSM). Try decoding it as a MessageFrame.' });
  }
  if (bytes.length >= 1 && bytes[0] === 0x03) {
    hints.push({
      severity: 'info', code: 'POSSIBLE_1609_2', path: '',
      message: 'The first octet is 0x03, which is how an IEEE 1609.2 Ieee1609Dot2Data (protocolVersion 3) begins. A security-wrapped message must be unwrapped (signature/header removed) before the J2735 payload can be decoded; that extraction is outside this release.',
    });
  }
  return hints;
}

const SEMANTIC_RESERVED: Record<string, (v: unknown) => string | null> = {
  'coreData.secMark': (v) => (typeof v === 'number' && v >= 61000 && v <= 65534 ? 'DSecond value is in the reserved range 61000–65534' : null),
  'coreData.transmission': (v) => (typeof v === 'string' && v.startsWith('reserved') ? `TransmissionState "${v}" is a reserved value` : null),
  'coreData.brakes.auxBrakes': (v) => (v === 'reserved' ? 'AuxiliaryBrakeStatus "reserved" should not be sent' : null),
};

function semanticIssues(bsm: Record<string, unknown>, prefix: string): DecodeIssue[] {
  const out: DecodeIssue[] = [];
  const get = (p: string) => p.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), bsm);
  for (const [path, check] of Object.entries(SEMANTIC_RESERVED)) {
    const msg = check(get(path));
    if (msg) out.push({ severity: 'warning', code: 'RESERVED_VALUE', path: prefix ? `${prefix}.${path}` : path, message: msg });
  }
  const wb = get('coreData.brakes.wheelBrakes');
  if (typeof wb === 'string' && wb[0] === '1' && wb.slice(1).includes('1')) {
    out.push({ severity: 'warning', code: 'INCONSISTENT_BRAKES', path: `${prefix ? `${prefix}.` : ''}coreData.brakes.wheelBrakes`, message: 'BrakeAppliedStatus has "unavailable" set together with per-wheel bits.' });
  }
  if (bsm.partII !== undefined) {
    out.push({ severity: 'info', code: 'PART_II_PRESENT', path: `${prefix ? `${prefix}.` : ''}partII`, message: 'Part II content is present. Its identifiers are shown, but its contents are kept as opaque octets in this release.' });
  }
  if (bsm.regional !== undefined) {
    out.push({ severity: 'info', code: 'REGIONAL_PRESENT', path: `${prefix ? `${prefix}.` : ''}regional`, message: 'Regional extension content is present and kept as opaque octets.' });
  }
  return out;
}

export function decodePayload(bytes: Uint8Array, entry: EntryType): PayloadDecode {
  const hex = bytesToHex(bytes);
  const type = entry === 'MessageFrame' ? MessageFrame : BasicSafetyMessage;
  const raw = decode(type, bytes);
  const issues: DecodeIssue[] = [...raw.issues];
  const prefix = entry === 'MessageFrame' ? 'value' : '';
  let ok = raw.ok;
  let messageId: number | undefined;
  let bsm: Record<string, unknown> | undefined;

  if (raw.value !== undefined) {
    if (entry === 'MessageFrame') {
      const frame = raw.value as Record<string, unknown>;
      messageId = frame.messageId as number;
      if (messageId !== BSM_MESSAGE_ID) {
        ok = false;
        issues.push({
          severity: 'error', code: 'UNSUPPORTED_MESSAGE_TYPE', path: 'messageId',
          message: `messageId ${messageId} = ${messageIdName(messageId)}. Release 1 decodes only the Basic Safety Message (messageId 20); the frame structure was valid and its payload was skipped using its length.`,
        });
        // The resolver produced an opaque value: suppress the generic open-type warning.
        const i = issues.findIndex((x) => x.code === 'OPAQUE_OPEN_TYPE' && x.path === 'value');
        if (i >= 0) issues.splice(i, 1);
      } else {
        bsm = frame.value as Record<string, unknown>;
      }
    } else {
      bsm = raw.value as Record<string, unknown>;
    }
  } else if (raw.fatal && entry === 'MessageFrame' && raw.trace.spans.some((s) => s.path === 'messageId')) {
    const idSpan = raw.trace.spans.find((s) => s.path === 'messageId' && s.kind === 'value');
    if (idSpan && typeof idSpan.value === 'number') messageId = idSpan.value;
  }
  // Collapse generic warnings about opaque Part II / regional open types into one info line.
  const filtered = issues.filter((i) => !(i.code === 'OPAQUE_OPEN_TYPE' && /partII|regional/.test(i.path)));
  if (bsm) filtered.push(...semanticIssues(bsm, prefix));
  filtered.push(...diagnose(bytes, entry));
  return {
    entry, raw, issues: filtered, ok, messageId, bsm,
    interpretations: bsm ? interpretBsm(bsm) : undefined,
    bsmPathPrefix: prefix, hex,
  };
}
