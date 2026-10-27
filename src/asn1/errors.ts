/** Error and issue types reported by the UPER engine. */

export type EncodeErrorCode =
  | 'CONSTRAINT_VIOLATION'
  | 'MISSING_COMPONENT'
  | 'UNEXPECTED_COMPONENT'
  | 'INVALID_VALUE'
  | 'UNRESOLVED_OPEN_TYPE';

export class EncodeError extends Error {
  readonly code: EncodeErrorCode;
  readonly path: string;

  constructor(code: EncodeErrorCode, path: string, message: string) {
    super(`${path || '(root)'}: ${message}`);
    this.name = 'EncodeError';
    this.code = code;
    this.path = path;
  }
}

export type DecodeErrorCode =
  | 'TRUNCATED'
  | 'CONSTRAINT_VIOLATION'
  | 'INVALID_ENUM_INDEX'
  | 'OPEN_TYPE_LENGTH_MISMATCH'
  | 'TRAILING_DATA'
  | 'UNSUPPORTED_ENCODING';

export class DecodeError extends Error {
  readonly code: DecodeErrorCode;
  readonly path: string;
  readonly bitOffset: number;
  /** The message without the path/offset prefix. */
  readonly detail: string;

  constructor(code: DecodeErrorCode, path: string, bitOffset: number, message: string) {
    super(`${path || '(root)'} @ bit ${bitOffset}: ${message}`);
    this.name = 'DecodeError';
    this.code = code;
    this.path = path;
    this.bitOffset = bitOffset;
    this.detail = `${message} (at bit ${bitOffset})`;
  }
}

export type IssueSeverity = 'error' | 'warning' | 'info';

/** A non-fatal (or post-hoc fatal) observation made while decoding. */
export interface DecodeIssue {
  readonly severity: IssueSeverity;
  readonly code: string;
  readonly message: string;
  readonly path: string;
  readonly bitOffset?: number;
}
