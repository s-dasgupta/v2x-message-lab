import type { AsnType } from '../../asn1/types';

export type EntityKind = 'message' | 'data-frame' | 'data-element';

/** How authoritative a statement is. */
export type Authority = 'normative' | 'recommended' | 'informative' | 'implementation' | 'unverified';

export interface Note {
  readonly authority: Authority;
  readonly text: string;
}

export interface SpecialValue {
  readonly code: string;
  readonly meaning: string;
}

/**
 * Educational metadata for one J2735 message, data frame or data element.
 * All prose is original to this project; `section` points to SAE J2735_202409.
 */
export interface CatalogEntry {
  /** Formal J2735 name, e.g. "DE_Speed". */
  readonly id: string;
  readonly kind: EntityKind;
  readonly section: string;
  readonly type: AsnType;
  /** One-sentence beginner explanation. */
  readonly summary: string;
  /** What is this? */
  readonly what: string;
  /** Where does the value come from? */
  readonly source: string;
  /** Why is it needed? (role in V2X communication) */
  readonly why: string;
  /** How is it converted from a physical measurement? */
  readonly conversion?: string;
  /** How is it represented in ASN.1 / UPER? */
  readonly representation: string;
  /** What happens when the value is unavailable? */
  readonly unavailable?: string;
  readonly unit?: string;
  readonly resolution?: string;
  /** Physical range carried by ordinary codes. */
  readonly physicalRange?: string;
  readonly specialValues?: readonly SpecialValue[];
  readonly notes?: readonly Note[];
  readonly keywords?: readonly string[];
}

/** A component (leaf or frame) inside the BSM, linked to its catalog entry. */
export interface FieldSpec {
  /** Component path inside BasicSafetyMessage, e.g. "coreData.accelSet.yaw". */
  readonly path: string;
  /** Component name as written in the ASN.1 SEQUENCE. */
  readonly component: string;
  readonly label: string;
  readonly entityId: string;
  readonly parentId: string;
  readonly required: boolean;
  /** Where the value originates. */
  readonly origin: 'sensor' | 'system' | 'configuration' | 'structure';
}
