import { useState } from 'react';
import { describeType, isOpaque, type AsnType, type AsnValue } from '../asn1/types';
import { fieldByPath } from '../j2735/catalog';
import type { Interpretation } from '../j2735/interpret';

export interface TreeProps {
  type: AsnType;
  value: AsnValue | undefined;
  /** Root path used for selection callbacks (e.g. '' for a BSM, 'value' inside a frame). */
  rootPath?: string;
  rootName: string;
  selected?: string | null;
  onSelect?: (path: string) => void;
  /** Show constraints and type names (ASN.1 view) vs. values only. */
  showTypes?: boolean;
  /** Optional receiver interpretation per BSM path, displayed next to values. */
  interpretations?: Readonly<Record<string, Interpretation>>;
  /** Resolves the type of an open-type value. */
  resolveOpen?: (path: string) => AsnType | undefined;
}

function displayValue(type: AsnType, v: AsnValue | undefined): string {
  if (v === undefined) return '(absent)';
  if (isOpaque(v)) return `opaque ${v.$opaque.length / 2} octets: ${v.$opaque.slice(0, 24)}${v.$opaque.length > 24 ? '…' : ''}`;
  if (type.kind === 'BIT STRING') return `'${String(v)}'B`;
  if (type.kind === 'OCTET STRING') return `'${String(v)}'H`;
  return String(v);
}

/** Expandable ASN.1 hierarchy of a value, generated from the encoder's schema. */
export function StructureTree(props: TreeProps) {
  return (
    <div className="tree">
      <ul>
        <Node {...props} name={props.rootName} path={props.rootPath ?? ''} depth={0} />
      </ul>
    </div>
  );
}

function bsmPath(path: string): string {
  return path.replace(/^value\./, '');
}

function Node(props: TreeProps & { name: string; path: string; depth: number; optional?: boolean }) {
  const { type, value, name, path, depth, selected, onSelect, showTypes, interpretations, resolveOpen, optional } = props;
  const [open, setOpen] = useState(depth < 3);
  const opaque = value !== undefined && isOpaque(value);
  let children: { name: string; type: AsnType; value: AsnValue | undefined; path: string; optional?: boolean }[] = [];
  let effectiveType: AsnType = type;
  if (type.kind === 'OPEN TYPE' && !opaque) {
    const inner = resolveOpen?.(path);
    if (inner) effectiveType = inner;
  }
  if (!opaque && effectiveType.kind === 'SEQUENCE' && value && typeof value === 'object') {
    const obj = value as Record<string, AsnValue>;
    children = effectiveType.fields.map((f) => ({ name: f.name, type: f.type, value: obj[f.name], path: path ? `${path}.${f.name}` : f.name, optional: f.optional }));
  } else if (!opaque && effectiveType.kind === 'SEQUENCE OF' && Array.isArray(value)) {
    children = value.map((v, i) => ({ name: `[${i}]`, type: effectiveType.kind === 'SEQUENCE OF' ? effectiveType.item : effectiveType, value: v, path: `${path}[${i}]` }));
  }
  const isLeaf = children.length === 0;
  const spec = fieldByPath(bsmPath(path));
  const interp = interpretations?.[bsmPath(path)];
  const typeName = effectiveType.name ?? (effectiveType.kind === 'SEQUENCE OF' ? describeType(effectiveType) : effectiveType.kind);
  return (
    <li>
      <span
        className={`node${selected === path ? ' sel' : ''}`}
        role="button"
        tabIndex={0}
        aria-expanded={isLeaf ? undefined : open}
        onClick={() => {
          if (!isLeaf) setOpen(!open);
          onSelect?.(path);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!isLeaf) setOpen(!open);
            onSelect?.(path);
          }
          if (e.key === 'ArrowRight' && !isLeaf) setOpen(true);
          if (e.key === 'ArrowLeft' && !isLeaf) setOpen(false);
        }}
      >
        <span className="twisty">{isLeaf ? '' : open ? '▾' : '▸'}</span>
        <span>{name}</span>
        {showTypes && <span className="tname">{typeName}</span>}
        {showTypes && isLeaf && !opaque && effectiveType.kind !== 'OPEN TYPE' && <span className="cons">{describeType(effectiveType).replace(/^[A-Z ]+ /, '')}</span>}
        {optional && <span className="cons">OPTIONAL</span>}
        {isLeaf && <span className="v-field">{displayValue(effectiveType, value)}</span>}
        {isLeaf && interp && interp.display !== String(value) && <span className="v-sensor">≙ {interp.display}</span>}
        {!showTypes && spec && depth > 0 && !isLeaf && <span className="tname">{spec.label}</span>}
      </span>
      {!isLeaf && open && (
        <ul>
          {children.map((c) => (
            <Node key={c.path} {...props} type={c.type} value={c.value} name={c.name} path={c.path} depth={depth + 1} optional={c.optional} />
          ))}
        </ul>
      )}
    </li>
  );
}
