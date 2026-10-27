/**
 * Sample payloads for the decoder.
 *
 * "Independent" samples come from the USDOT ITS JPO Operational Data
 * Environment test data (Apache-2.0, see THIRD_PARTY_NOTICES.md); they were
 * encoded by equipment/software unrelated to this project. Negative samples
 * are deliberately malformed to demonstrate error handling.
 */
import { bytesToHex } from '../../asn1/bits';
import { encode } from '../../asn1/uper';
import { buildBsm } from '../bsmBuilder';
import { encodeBsm, type EntryType } from '../codec';
import { MessageFrame } from '../schema';
import { SCENARIOS } from './scenarios';

/** A valid scenario BSM with its 15-bit heading field forced to all ones (32767 > 28800). */
function headingViolation(): string {
  const s = SCENARIOS[0]!;
  const { bsm } = encodeBsm(buildBsm(s.inputs, s.system).coreData!);
  const span = bsm.trace.spans.find((x) => x.path === 'coreData.heading' && x.kind === 'value')!;
  const bytes = bsm.bytes.slice();
  for (let i = span.start; i < span.start + span.length; i += 1) bytes[i >> 3] |= 0x80 >> (i & 7);
  return bytesToHex(bytes);
}

export interface SamplePayload {
  readonly id: string;
  readonly title: string;
  readonly entry: EntryType;
  readonly hex: string;
  readonly description: string;
  readonly source: string;
  readonly expectValid: boolean;
}

const ODE_BSM =
  '001480B8494C4C950CD8CDE6E9651116579F22A424DD78FFFFF00761E4FD7EB7D07F7FFF80005F11D1020214C1C0FFC7C016AFF4017A0FF65403B0FD204C20FFCCC04F8FE40C420FFE6404CEFE60E9A10133408FCFDE1438103AB4138F00E1EEC1048EC160103E237410445C171104E26BC103DC4154305C2C84103B1C1C8F0A82F42103F34262D1123198103DAC25FB12034CE10381C259F12038CA103574251B10E3B2210324C23AD0F23D8EFFFE0000209340D10000004264BF00';
const CODEC_BSM_SHORT =
  '00144647866EC00039E8E717075F1665FF53ACFA7FFFFFFFF0007080FDFA1FA1007FFF8000000000007CC0410024C01C702FFFFA1FFFFC02B7FFFFFFA1FFFFC0551FFFFFFAFFFE0000';
const WRAPPED_1609 =
  '03810040038081B1001480AD4644A9EA5442BC26E97C7496576E052569B214000070007050FD7D0FA1007FFF8000681250020214C1C0FF64BFFA0FB84F720FF71BFF9500DFFFC0FF564006D001FFFC0FF5BBFE5B031FFFC0FF573FF73075FFFC0FF973FFB708FFFFC0FFEFC00B50B5FFFC0FFF0401150BBFFFC0FFDF4015D0C1FFFC0FFB9C01690C7FFFC0FFC0401550C9FFFC0FFBAC014F0C9FFFC0FFBBC01530CBFFFC0FFBB400B30E7FFFC100383FFCD0E3FFFCFFFEC800400120000243450D45B978805B073A8672E91E9D80824A65C65F85E35B61502149263F000FE804E6B84AF66507D51690DE76F30D1468A68F8986B58E6AECB2C5FC4766C223F0B977E87678DDF714FE123C483622CC7500';

export const SAMPLES: readonly SamplePayload[] = [
  {
    id: 'ode-bsm',
    title: 'Real BSM with Part II (JPO ODE)',
    entry: 'MessageFrame',
    hex: ODE_BSM,
    description: 'MessageFrame captured in USDOT JPO ODE tests: Part I plus VehicleSafetyExtensions (path history) and SupplementalVehicleExtensions in Part II.',
    source: 'usdot-jpo-ode/jpo-ode test resources (Apache-2.0)',
    expectValid: true,
  },
  {
    id: 'codec-bsm',
    title: 'Logged BSM, many fields unavailable (asn1_codec)',
    entry: 'MessageFrame',
    hex: CODEC_BSM_SHORT,
    description: 'From a 128-message log in the JPO ODE asn1_codec examples. Accuracy, transmission, steering, accelerations and size are reported as unavailable.',
    source: 'usdot-jpo-ode/asn1_codec data/examples (Apache-2.0)',
    expectValid: true,
  },
  {
    id: 'wrapped-1609',
    title: 'Security-wrapped message (IEEE 1609.2)',
    entry: 'MessageFrame',
    hex: WRAPPED_1609,
    description: 'An Ieee1609Dot2Data structure that contains a BSM MessageFrame. It is not a J2735 payload itself; the security layer must be removed first (out of scope for Release 1).',
    source: 'usdot-jpo-ode/jpo-ode test resources (Apache-2.0)',
    expectValid: false,
  },
  {
    id: 'truncated',
    title: 'Truncated MessageFrame',
    entry: 'MessageFrame',
    hex: ODE_BSM.slice(0, 64),
    description: 'The first 32 octets of a valid frame: the length determinant announces 184 octets that never arrive.',
    source: 'derived (malformed on purpose)',
    expectValid: false,
  },
  {
    id: 'spat-frame',
    title: 'Different message type (messageId 19)',
    entry: 'MessageFrame',
    hex: bytesToHex(encode(MessageFrame, { messageId: 19, value: { $opaque: '0A0B0C0D' } }).bytes),
    description: 'A syntactically valid MessageFrame whose messageId is 19 (SPaT). Release 1 only decodes BSMs, so the payload is skipped by its length.',
    source: 'constructed with this encoder (frame header + 4 opaque octets)',
    expectValid: false,
  },
  {
    id: 'constraint',
    title: 'Constraint violation (heading > 28800)',
    entry: 'BasicSafetyMessage',
    hex: headingViolation(),
    description: 'The normal-driving BSM with its 15-bit heading field overwritten with 32767, above the DE_Heading upper bound of 28800.',
    source: 'derived from a scenario (malformed on purpose)',
    expectValid: false,
  },
  {
    id: 'random',
    title: 'Arbitrary bytes',
    entry: 'MessageFrame',
    hex: '48656C6C6F2C20563258210A',
    description: 'ASCII text "Hello, V2X!" — not a J2735 message; the decoder must not accept it.',
    source: 'constructed',
    expectValid: false,
  },
];
