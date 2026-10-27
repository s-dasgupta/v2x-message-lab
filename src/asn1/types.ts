/**
 * Minimal ASN.1 type model used by the UPER (ITU-T X.691, unaligned variant)
 * engine in this folder.
 *
 * Only the constructs needed for SAE J2735 BSM Part I and MessageFrame are
 * modelled, but each is implemented according to the general X.691 rules (not
 * special-cased for particular J2735 fields) so that new data frames and
 * messages can be described declaratively and encoded by the same engine.
 *
 * Abstract values are plain JSON-compatible JavaScript values:
 *   INTEGER       -> number (safe integer)
 *   ENUMERATED    -> string (the identifier, e.g. "forwardGears")
 *   BIT STRING    -> string of '0'/'1' characters, bit 0 first (e.g. "10000")
 *   OCTET STRING  -> upper-case hexadecimal string (e.g. "BEA10000")
 *   SEQUENCE      -> object keyed by component name (absent OPTIONAL = missing key)
 *   SEQUENCE OF   -> array
 *   open type     -> the value of the resolved type, or an OpaqueValue when the
 *                    contained type is not known to this release.
 */

export interface IntegerType {
  readonly kind: 'INTEGER';
  readonly name?: string;
  readonly lb: number;
  readonly ub: number;
  /** INTEGER (lb..ub, ...) — values outside the root are encoded as unconstrained. */
  readonly extensible?: boolean;
}

export interface EnumItem {
  readonly name: string;
  readonly value: number;
}

export interface EnumeratedType {
  readonly kind: 'ENUMERATED';
  readonly name?: string;
  /** Root enumeration items (any order; the engine sorts by value per X.691). */
  readonly root: readonly EnumItem[];
  readonly extensible: boolean;
  /** Extension additions, in definition order. */
  readonly additions?: readonly EnumItem[];
}

export interface NamedBit {
  readonly name: string;
  readonly bit: number;
}

export interface BitStringType {
  readonly kind: 'BIT STRING';
  readonly name?: string;
  /** Fixed SIZE constraint (the only form needed by Release 1). */
  readonly size: number;
  readonly namedBits: readonly NamedBit[];
}

export interface OctetStringType {
  readonly kind: 'OCTET STRING';
  readonly name?: string;
  readonly minSize: number;
  /** null means no upper bound (unconstrained length). */
  readonly maxSize: number | null;
}

export interface SequenceField {
  readonly name: string;
  readonly type: AsnType;
  readonly optional?: boolean;
  /**
   * ASN.1 notation to print for this component's type when it differs from the
   * referenced type name (e.g. information-object-class field references).
   * Display only: it never changes how the component is encoded.
   */
  readonly notation?: string;
}

export interface SequenceType {
  readonly kind: 'SEQUENCE';
  readonly name?: string;
  readonly fields: readonly SequenceField[];
  /** True when the type contains the extension marker "...". */
  readonly extensible: boolean;
}

export interface SequenceOfType {
  readonly kind: 'SEQUENCE OF';
  readonly name?: string;
  readonly item: AsnType;
  readonly minSize: number;
  readonly maxSize: number;
}

/**
 * An open type ("hole") such as MessageFrame.value or PartIIcontent.partII-Value.
 * The actual type is selected from already-decoded sibling components through
 * a table constraint, which the schema expresses as a resolver function.
 */
export interface OpenType {
  readonly kind: 'OPEN TYPE';
  readonly name?: string;
  /** ASN.1 notation of the open type, used only for display / generated modules. */
  readonly notation: string;
  readonly resolve: (siblings: Readonly<Record<string, AsnValue>>) => AsnType | undefined;
}

export type AsnType =
  | IntegerType
  | EnumeratedType
  | BitStringType
  | OctetStringType
  | SequenceType
  | SequenceOfType
  | OpenType;

/** Content of an open type whose contained type is not modelled (kept byte-exact). */
export interface OpaqueValue {
  readonly $opaque: string;
}

/** Unknown SEQUENCE extension additions preserved by the decoder for byte-exact re-encoding. */
export interface ExtensionAdditionsValue {
  /** Presence bitmap of the extension additions, as '0'/'1' characters. */
  readonly presence: string;
  /** Hex contents (open-type octets) of each present addition, in order. */
  readonly openTypes: readonly string[];
}

export type AsnValue =
  | number
  | string
  | AsnValue[]
  | OpaqueValue
  | { [key: string]: AsnValue | ExtensionAdditionsValue | undefined };

export const EXTENSION_ADDITIONS_KEY = '$extensionAdditions';

export function isOpaque(value: unknown): value is OpaqueValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && '$opaque' in value;
}

/** Human-readable constraint text, e.g. "INTEGER (0..8191)". */
export function describeType(type: AsnType): string {
  switch (type.kind) {
    case 'INTEGER':
      return `INTEGER (${type.lb}..${type.ub}${type.extensible ? ', ...' : ''})`;
    case 'ENUMERATED':
      return `ENUMERATED {${type.root.map((i) => `${i.name}(${i.value})`).join(', ')}${type.extensible ? ', ...' : ''}}`;
    case 'BIT STRING':
      return `BIT STRING (SIZE(${type.size}))`;
    case 'OCTET STRING':
      if (type.maxSize === null) return 'OCTET STRING';
      return type.minSize === type.maxSize
        ? `OCTET STRING (SIZE(${type.minSize}))`
        : `OCTET STRING (SIZE(${type.minSize}..${type.maxSize}))`;
    case 'SEQUENCE':
      return `SEQUENCE {${type.fields.length} components${type.extensible ? ', ...' : ''}}`;
    case 'SEQUENCE OF':
      return `SEQUENCE (SIZE(${type.minSize}..${type.maxSize})) OF ${type.item.name ?? type.item.kind}`;
    case 'OPEN TYPE':
      return type.notation;
  }
}
