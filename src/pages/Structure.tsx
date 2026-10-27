import { useMemo, useState, type ReactNode } from 'react';
import { href } from '../app/router';
import { useApp } from '../app/state';
import type { AsnValue } from '../asn1/types';
import { Callout, CopyButton, PageHead, Segmented, formatJson } from '../components/common';
import { StructureTree } from '../components/StructureTree';
import { bsmModuleText } from '../j2735/asn1Module';
import { FIELD_SPECS, LEAF_FIELDS, entry } from '../j2735/catalog';
import { interpretBsm, type Interpretation } from '../j2735/interpret';
import { BasicSafetyMessage, BSM_MESSAGE_ID, MessageFrame } from '../j2735/schema';

/** JSON with clickable keys (paths relative to the BSM). */
export function JsonView({ value, onSelect, selected, basePath = '' }: { value: unknown; onSelect: (p: string) => void; selected: string | null; basePath?: string }) {
  const render = (v: unknown, path: string, indent: number, key?: string, last = true): ReactNode => {
    const pad = '  '.repeat(indent);
    const comma = last ? '' : ',';
    const keyNode = key !== undefined ? (
      <button className={`link mono${selected === path ? ' sel' : ''}`} style={{ textDecoration: 'none', color: 'var(--text)' }} onClick={() => onSelect(path)}>
        "{key}"
      </button>
    ) : null;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const entries = Object.entries(v as Record<string, unknown>);
      return (
        <>
          {pad}{keyNode}{key !== undefined ? ': ' : ''}{'{'}
          {'\n'}
          {entries.map(([k, child], i) => (
            <span key={k}>{render(child, path ? `${path}.${k}` : k, indent + 1, k, i === entries.length - 1)}</span>
          ))}
          {pad}{'}'}{comma}{'\n'}
        </>
      );
    }
    if (Array.isArray(v)) {
      return (
        <>
          {pad}{keyNode}{key !== undefined ? ': ' : ''}[{'\n'}
          {v.map((child, i) => <span key={i}>{render(child, `${path}[${i}]`, indent + 1, undefined, i === v.length - 1)}</span>)}
          {pad}]{comma}{'\n'}
        </>
      );
    }
    return (
      <>
        {pad}{keyNode}{key !== undefined ? ': ' : ''}<span className="v-field">{JSON.stringify(v)}</span>{comma}{'\n'}
      </>
    );
  };
  return <pre className="code">{render(value, basePath, 0)}</pre>;
}

export function StructurePage() {
  const { build, encoding, openDetail } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const [asnView, setAsnView] = useState<'tree' | 'module'>('tree');
  const [wrap, setWrap] = useState<'bsm' | 'frame'>('bsm');
  const bsm = build.coreData ? { coreData: build.coreData } : undefined;
  const interps = useMemo(() => (bsm ? Object.fromEntries(interpretBsm(bsm).map((i) => [i.path, i])) : {}), [bsm]) as Record<string, Interpretation>;
  const select = (p: string) => {
    const clean = p.replace(/^value\./, '').replace(/^value$/, '');
    setSelected(clean);
    if (FIELD_SPECS.some((f) => f.path === clean)) openDetail(clean);
  };

  if (!bsm) {
    return (
      <div>
        <PageHead title="BSM Structure Explorer" module="D" />
        <Callout kind="err">
          <p>The current inputs do not form a valid BSM. <a href={href('generator')}>Fix the errors in the generator</a> first.</p>
        </Callout>
      </div>
    );
  }
  const frameValue = { messageId: BSM_MESSAGE_ID, value: bsm };

  return (
    <div>
      <PageHead title="BSM Structure Explorer" module="D">
        One message, four synchronized views — all generated from the same structured object the encoder consumes. Click any field to
        open its detail panel.
      </PageHead>
      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h2>1 · Vehicle information</h2>
            <span className="badge sensor">human-readable</span>
          </div>
          <div className="table-wrap">
          <table className="data">
            <tbody>
              {LEAF_FIELDS.map((f) => (
                <tr key={f.path} className={`clickable${selected === f.path ? ' selected' : ''}`} onClick={() => select(f.path)}>
                  <td>{f.label}</td>
                  <td className="v-sensor">{interps[f.path]?.display}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h2>2 · SAE J2735 field values</h2>
            <span className="badge field">standardized integers</span>
          </div>
          <div className="table-wrap">
          <table className="data">
            <tbody>
              {LEAF_FIELDS.map((f) => {
                const v = f.path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], bsm);
                return (
                  <tr key={f.path} className={`clickable${selected === f.path ? ' selected' : ''}`} onClick={() => select(f.path)}>
                    <td className="mono small">{f.path.replace('coreData.', '')}</td>
                    <td className="v-field">{typeof v === 'string' && /^[01]{5}$/.test(v) ? `'${v}'B` : String(v)}</td>
                    <td className="small muted">{entry(f.entityId).type.name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h2>3 · ASN.1 structure</h2>
            <Segmented label="ASN.1 view" value={asnView} onChange={setAsnView} options={[{ value: 'tree', label: 'Value tree' }, { value: 'module', label: 'Module text' }]} />
          </div>
          {asnView === 'tree' ? (
            <>
              <div className="row" style={{ marginBottom: 8 }}>
                <Segmented label="Entry type" value={wrap} onChange={setWrap} options={[{ value: 'bsm', label: 'BasicSafetyMessage' }, { value: 'frame', label: 'MessageFrame' }]} />
              </div>
              {wrap === 'bsm' ? (
                <StructureTree type={BasicSafetyMessage} value={bsm as unknown as AsnValue} rootName="BasicSafetyMessage" showTypes selected={selected} onSelect={select} interpretations={interps} />
              ) : (
                <StructureTree
                  type={MessageFrame}
                  value={frameValue as unknown as AsnValue}
                  rootName="MessageFrame"
                  showTypes
                  selected={selected ? `value.${selected}` : null}
                  onSelect={select}
                  interpretations={interps}
                  resolveOpen={(p) => (p === 'value' ? BasicSafetyMessage : undefined)}
                />
              )}
              <p className="small muted" style={{ marginTop: 8 }}>
                Absent OPTIONAL components (partII, regional) are shown as “(absent)”: their presence bits are 0. All Part I components are mandatory.
              </p>
            </>
          ) : (
            <>
              <div className="row" style={{ marginBottom: 8 }}>
                <CopyButton text={bsmModuleText()} label="Copy module" />
                <span className="small muted">Generated from the encoder’s schema — not the official SAE ASN.1 file.</span>
              </div>
              <pre className="code">{bsmModuleText()}</pre>
            </>
          )}
        </div>
        <div className="card">
          <div className="card-head">
            <h2>4 · JSON</h2>
            <CopyButton text={formatJson(wrap === 'frame' ? frameValue : bsm)} />
          </div>
          <JsonView value={wrap === 'frame' ? frameValue : bsm} onSelect={select} selected={selected ? (wrap === 'frame' ? `value.${selected}` : selected) : null} />
          <p className="small muted">BIT STRING values are written as strings of bits and OCTET STRING values as hexadecimal.</p>
        </div>
      </div>
      {encoding?.ok && (
        <p className="small muted" style={{ marginTop: 12 }}>
          Encoded size: {encoding.result.bsm.bitLength} bits for the BasicSafetyMessage. <a href={href('encoder')}>See the UPER output →</a>
        </p>
      )}
    </div>
  );
}
