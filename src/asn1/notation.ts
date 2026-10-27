/**
 * Renders the engine's type model back into ASN.1 notation.
 *
 * The output is generated from the very objects the encoder uses, so the
 * "ASN.1 view" in the app and the module fed to the independent validators in
 * tools/validation can never drift from the codec's actual behaviour.
 */
import type { AsnType, SequenceType } from './types';

const INDENT = '    ';

/** Right-hand side notation of a type; named sub-types are referenced by name. */
export function typeNotation(type: AsnType, indent = '', isDefinition = false): string {
  if (!isDefinition && type.name) return type.name;
  switch (type.kind) {
    case 'INTEGER':
      return `INTEGER (${type.lb}..${type.ub}${type.extensible ? ', ...' : ''})`;
    case 'ENUMERATED': {
      const items = [...type.root].sort((a, b) => a.value - b.value).map((i) => `${indent}${INDENT}${i.name} (${i.value})`);
      if (type.extensible) items.push(`${indent}${INDENT}...`);
      for (const a of type.additions ?? []) items.push(`${indent}${INDENT}${a.name} (${a.value})`);
      return `ENUMERATED {\n${items.join(',\n')}\n${indent}}`;
    }
    case 'BIT STRING': {
      const bits = type.namedBits.map((b) => `${indent}${INDENT}${b.name} (${b.bit})`);
      return `BIT STRING {\n${bits.join(',\n')}\n${indent}} (SIZE (${type.size}))`;
    }
    case 'OCTET STRING':
      if (type.maxSize === null) return 'OCTET STRING';
      return type.minSize === type.maxSize
        ? `OCTET STRING (SIZE (${type.minSize}))`
        : `OCTET STRING (SIZE (${type.minSize}..${type.maxSize}))`;
    case 'SEQUENCE':
      return sequenceNotation(type, indent);
    case 'SEQUENCE OF':
      return `SEQUENCE (SIZE (${type.minSize}..${type.maxSize})) OF ${typeNotation(type.item, indent + INDENT)}`;
    case 'OPEN TYPE':
      return type.notation;
  }
}

function sequenceNotation(type: SequenceType, indent: string): string {
  const width = Math.max(...type.fields.map((f) => f.name.length));
  const lines = type.fields.map((f) => {
    const t = f.notation ?? typeNotation(f.type, indent + INDENT);
    return `${indent}${INDENT}${f.name.padEnd(width)} ${t}${f.optional ? ' OPTIONAL' : ''}`;
  });
  if (type.extensible) lines.push(`${indent}${INDENT}...`);
  return `SEQUENCE {\n${lines.join(',\n')}\n${indent}}`;
}

/** Collects every named type reachable from `roots`, in first-seen order. */
export function collectNamedTypes(roots: readonly AsnType[]): AsnType[] {
  const seen = new Map<string, AsnType>();
  const visit = (t: AsnType): void => {
    if (t.name) {
      const prev = seen.get(t.name);
      if (prev) {
        if (prev !== t) throw new Error(`two different types are both named ${t.name}`);
        return;
      }
      seen.set(t.name, t);
    }
    if (t.kind === 'SEQUENCE') t.fields.forEach((f) => visit(f.type));
    if (t.kind === 'SEQUENCE OF') visit(t.item);
  };
  roots.forEach(visit);
  return [...seen.values()];
}

export interface ModuleSpec {
  readonly name: string;
  readonly header?: string;
  readonly roots: readonly AsnType[];
  /** Additional assignments written verbatim (classes, object sets, value assignments). */
  readonly extraAssignments?: readonly string[];
}

export function moduleNotation(spec: ModuleSpec): string {
  const parts: string[] = [];
  if (spec.header) parts.push(spec.header);
  parts.push(`${spec.name} DEFINITIONS AUTOMATIC TAGS ::= BEGIN`, '');
  for (const t of collectNamedTypes(spec.roots)) {
    parts.push(`${t.name} ::= ${typeNotation(t, '', true)}`, '');
  }
  for (const extra of spec.extraAssignments ?? []) parts.push(extra, '');
  parts.push('END', '');
  return parts.join('\n');
}
