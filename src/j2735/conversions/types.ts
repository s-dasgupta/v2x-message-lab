import type { AsnValue } from '../../asn1/types';

export type Severity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  readonly severity: Severity;
  readonly code: string;
  /** BSM component path, e.g. "coreData.speed". */
  readonly path: string;
  readonly message: string;
}

/** How the J2735 value was obtained from the input. */
export type Handling =
  | 'quantized' // ordinary scale + round
  | 'exact' // value copied without loss (enumerations, counters, identifiers)
  | 'unavailable' // the defined "unavailable" code was used
  | 'saturated-high' // clipped to the code that means "this value or greater"
  | 'saturated-low' // clipped to the code that means "this value or less"
  | 'wrapped' // angular value folded onto its equivalent in range (e.g. 360° → 0°)
  | 'no-sentinel' // input unavailable but the element defines no unavailable code
  | 'invalid'; // could not be converted; see issues

export interface ConversionStep {
  readonly label: string;
  readonly detail: string;
}

export interface Quantity {
  readonly value: number;
  readonly unit: string;
}

/** Complete record of one sensor → J2735 transformation (Module C). */
export interface FieldConversion {
  readonly path: string;
  /** The input as entered, e.g. "50 km/h" or "unavailable". */
  readonly original: string;
  /** The input expressed in the SI unit the data element is defined in. */
  readonly physical?: Quantity;
  /** Physical value divided by the LSB, before rounding. */
  readonly scaled?: number;
  /** LSB of the element, e.g. "0.02 m/s". */
  readonly resolution?: string;
  readonly quantizationRule?: string;
  /** Value placed into the BSM structure; undefined when conversion failed. */
  readonly j2735Value?: AsnValue;
  readonly handling: Handling;
  /** The physical value the receiver will reconstruct (absent for special codes). */
  readonly reconstructed?: Quantity;
  /** reconstructed − physical, in the SI unit. */
  readonly quantizationError?: Quantity;
  readonly steps: ConversionStep[];
  readonly issues: ValidationIssue[];
}
