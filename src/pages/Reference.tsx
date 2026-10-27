import { useMemo, useState } from 'react';
import { href, navigate } from '../app/router';
import { PageHead, Ref, Segmented } from '../components/common';
import { EntryExplanation, EntryFacts } from '../components/FieldDetail';
import { ENTRIES, FIELD_SPECS, searchCatalog, type EntityKind } from '../j2735/catalog';

const SAE_URL = 'https://www.sae.org/standards/content/j2735_202409/';

const KEY_SECTIONS: { s: string; title: string; status: string; why: string }[] = [
  { s: '4.2', title: 'V2X communications overview', status: 'informative', why: 'Where J2735 sits relative to IEEE 802.11 / 3GPP sidelink, IEEE 1609.3 (WSMP) and IEEE 1609.2 (security).' },
  { s: '4.3', title: 'Philosophy of message design', status: 'informative', why: 'Defines the message → data frame → data element hierarchy.' },
  { s: '4.4', title: 'Message encoding', status: 'normative', why: 'UPER is used unless an application specification names another encoding.' },
  { s: '5.1', title: 'MSG_MessageFrame', status: 'normative', why: 'The messageId + open-type wrapper for all messages.' },
  { s: '5.2', title: 'MSG_BasicSafetyMessage', status: 'normative', why: 'Part I in every BSM; Part II optional.' },
  { s: '6.10', title: 'DF_BSMcoreData', status: 'normative', why: 'The 14 Part I components.' },
  { s: '10', title: 'Conformance', status: 'normative', why: 'Required fields present, correct order, values in range, encoding validates against the ASN.1.' },
  { s: '11.1', title: 'ASN.1 syntax and encoding', status: 'normative', why: 'ASN.1 plus its comments and the text are normative; UPER by default.' },
  { s: '11.2', title: 'Regional extensions', status: 'normative / informative', why: 'How regions add content without breaking decoders; extension markers reserved for SAE.' },
  { s: '11.4', title: 'Frames of reference', status: 'normative', why: 'The reported position is the centre of the vehicle outline projected on the road (WGS-84).' },
  { s: '11.5', title: 'Position, velocity, acceleration', status: 'informative / recommended', why: 'Convert with full precision, then round to the element’s LSB.' },
];

export function ReferencePage({ entityId }: { entityId?: string }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | EntityKind>('all');
  const results = useMemo(() => searchCatalog(query).filter((e) => kind === 'all' || e.kind === kind), [query, kind]);
  const selected = ENTRIES.find((e) => e.id === entityId) ?? results[0];
  const usedAt = selected ? FIELD_SPECS.filter((f) => f.entityId === selected.id) : [];
  return (
    <div>
      <PageHead title="Standard Reference Explorer" module="J">
        Search every message, data frame and data element used by BSM Part I — by name, field, unit, constraint or encoding type. All
        explanations are original; section numbers point to the official SAE J2735 (SEP2024) publication.
      </PageHead>
      <div className="split">
        <div className="card">
          <div className="row" style={{ marginBottom: 10 }}>
            <label htmlFor="refq" className="visually-hidden">Search</label>
            <input id="refq" type="text" placeholder="Search: yaw, m/s, BIT STRING, 7.196, privacy…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
            <Segmented label="Kind" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'message', label: 'MSG' }, { value: 'data-frame', label: 'DF' }, { value: 'data-element', label: 'DE' }]} />
          </div>
          <div className="table-wrap" style={{ maxHeight: 560 }}>
            <table className="data">
              <thead><tr><th>Entity</th><th>§</th><th>ASN.1</th><th>Unit</th></tr></thead>
              <tbody>
                {results.map((e) => (
                  <tr key={e.id} className={`clickable${selected?.id === e.id ? ' selected' : ''}`} onClick={() => navigate('reference', e.id)}>
                    <td><code>{e.id}</code><div className="small muted">{e.summary}</div></td>
                    <td className="mono small">{e.section}</td>
                    <td className="small">{e.type.kind}</td>
                    <td className="small">{e.unit ?? ''}</td>
                  </tr>
                ))}
                {results.length === 0 && <tr><td colSpan={4} className="muted">No matches.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          {selected ? (
            <>
              <div className="muted small">{selected.kind.replace('-', ' ')}</div>
              <h2>{selected.id}</h2>
              <p className="muted">{selected.summary}</p>
              <EntryFacts e={selected} path={usedAt.length === 1 ? usedAt[0]!.path : undefined} />
              {usedAt.length > 0 && (
                <p className="small" style={{ marginTop: 10 }}>
                  Used in the BSM at: {usedAt.map((f) => <code key={f.path} style={{ marginRight: 8 }}>{f.path}</code>)}{' '}
                  <a href={href('bits', usedAt[0]!.path)}>see bits</a>
                </p>
              )}
              <EntryExplanation e={selected} />
              <p className="small">
                Official definition: SAE J2735 (SEP2024) <Ref s={selected.section} /> — <a href={SAE_URL} target="_blank" rel="noreferrer">SAE publication page</a>.
              </p>
            </>
          ) : (
            <p>Select an entity.</p>
          )}
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Key sections of SAE J2735 (SEP2024) for the BSM</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>§</th><th>Topic</th><th>Status</th><th>Why it matters here</th></tr></thead>
            <tbody>
              {KEY_SECTIONS.map((k) => (
                <tr key={k.s}><td className="mono">{k.s}</td><td>{k.title}</td><td className="small">{k.status}</td><td className="small">{k.why}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">
          Section 5 states that the ASN.1, its comments and the “Use”/“Remarks” text are normative for messages, data frames and data
          elements. The status column summarizes how each listed section labels itself.
        </p>
      </div>
    </div>
  );
}
