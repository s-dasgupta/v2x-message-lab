/** Educational metadata must cover every Part I component and agree with the schema. */
import { describe, expect, it } from 'vitest';
import { collectNamedTypes } from '../../src/asn1/notation';
import { bsmModuleText } from '../../src/j2735/asn1Module';
import { ENTRIES, FIELD_SPECS, entry, fixedUperBits, searchCatalog } from '../../src/j2735/catalog';
import { INTERPRETERS } from '../../src/j2735/interpret';
import { BSMcoreData, MessageFrame } from '../../src/j2735/schema';
import type { SequenceType } from '../../src/asn1/types';

function schemaPaths(seq: SequenceType, prefix: string): string[] {
  return seq.fields.flatMap((f) => {
    const p = `${prefix}.${f.name}`;
    return f.type.kind === 'SEQUENCE' ? [p, ...schemaPaths(f.type, p)] : [p];
  });
}

describe('catalog and field registry', () => {
  it('FIELD_SPECS lists every BSMcoreData component, in encoding order, and nothing else', () => {
    expect(FIELD_SPECS.map((f) => f.path)).toEqual(['coreData', ...schemaPaths(BSMcoreData, 'coreData')]);
  });

  it('every field links to a catalog entry whose type matches the schema component', () => {
    for (const f of FIELD_SPECS) {
      const e = entry(f.entityId);
      const parts = f.path.split('.').slice(1);
      let t: SequenceType = BSMcoreData;
      let type = t as unknown as { name?: string };
      for (const part of parts) {
        const field = t.fields.find((x) => x.name === part)!;
        type = field.type;
        if (field.type.kind === 'SEQUENCE') t = field.type;
      }
      if (parts.length) expect(e.type.name, f.path).toBe(type.name);
      expect(e.section).toMatch(/^\d+\.\d+$/);
    }
  });

  it('every catalog entry answers the core educational questions', () => {
    for (const e of ENTRIES) {
      for (const key of ['summary', 'what', 'source', 'why', 'representation'] as const) {
        expect(e[key].length, `${e.id}.${key}`).toBeGreaterThan(20);
      }
      if (e.kind === 'data-element' && e.type.kind === 'INTEGER') {
        expect(e.unavailable ?? e.specialValues, e.id).toBeDefined();
      }
    }
  });

  it('every Part I leaf has a receiver-side interpreter', () => {
    const leaves = FIELD_SPECS.filter((f) => f.origin !== 'structure').map((f) => f.path).sort();
    expect(Object.keys(INTERPRETERS).sort()).toEqual(leaves);
  });

  it('per-type UPER widths match the documented representation text', () => {
    expect(fixedUperBits(entry('DE_Latitude').type)).toBe(31);
    expect(fixedUperBits(entry('DE_Longitude').type)).toBe(32);
    expect(fixedUperBits(entry('DE_TransmissionState').type)).toBe(3);
    expect(fixedUperBits(entry('DF_AccelerationSet4Way').type)).toBe(48);
    expect(fixedUperBits(entry('DF_BrakeSystemStatus').type)).toBe(15);
  });

  it('search finds entities by name, unit and keyword', () => {
    expect(searchCatalog('yaw').map((e) => e.id)).toContain('DE_YawRate');
    expect(searchCatalog('m/s').map((e) => e.id)).toContain('DE_Speed');
    expect(searchCatalog('7.196').map((e) => e.id)).toEqual(['DE_Speed']);
    expect(searchCatalog('privacy').map((e) => e.id)).toContain('DE_TemporaryID');
  });

  it('generated ASN.1 module defines every named type exactly once', () => {
    const text = bsmModuleText();
    for (const t of collectNamedTypes([MessageFrame])) {
      expect(text.match(new RegExp(`^${t.name} ::=`, 'gm')), t.name).toHaveLength(1);
    }
    expect(text).toContain('MESSAGE-ID-AND-TYPE.&Type({MessageTypes}{@.messageId})');
    expect(text).toMatch(/END\s*$/);
  });
});
