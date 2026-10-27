import { useMemo, useState } from 'react';
import { useApp } from '../app/state';
import { bytesToHex } from '../asn1/bits';
import type { AsnValue } from '../asn1/types';
import type { BitSpan } from '../asn1/uper';
import { BitGrid, BitLegend, HexView } from '../components/BitGrid';
import { AtLeast, Callout, IssueList, PageHead, Ref, Segmented, Tabs, formatJson } from '../components/common';
import { StructureTree } from '../components/StructureTree';
import { LEAF_FIELDS } from '../j2735/catalog';
import { decodePayload, messageIdName, parseHexInput, type EntryType, type PayloadDecode } from '../j2735/codec';
import { SAMPLES } from '../j2735/data/samples';
import { BasicSafetyMessage, MessageFrame } from '../j2735/schema';
import { SpanDetails, SpanTable } from './BitExplorer';

type View = 'physical' | 'structure' | 'json' | 'bits';

function looksLikeHexText(bytes: Uint8Array): boolean {
  return bytes.length > 0 && Array.from(bytes).every((b) => /[0-9a-fA-F\s:,x-]/.test(String.fromCharCode(b)));
}

export function DecoderPage() {
  const { encoding, openDetail } = useApp();
  const [text, setText] = useState(SAMPLES[0]!.hex);
  const [entryType, setEntryType] = useState<EntryType>('MessageFrame');
  const [view, setView] = useState<View>('physical');
  const [result, setResult] = useState<{ parseError?: string; decoded?: PayloadDecode; bytes?: Uint8Array } | null>(null);
  const [selected, setSelected] = useState<BitSpan | null>(null);
  const [fileNote, setFileNote] = useState<string | null>(null);

  const run = (hexText: string, entry: EntryType) => {
    const parsed = parseHexInput(hexText);
    setSelected(null);
    if (!parsed.ok) {
      setResult({ parseError: parsed.error });
      return;
    }
    setResult({ decoded: decodePayload(parsed.bytes, entry), bytes: parsed.bytes });
  };

  const onFile = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (looksLikeHexText(bytes)) {
      const t = new TextDecoder().decode(bytes);
      setText(t.trim());
      setFileNote(`${file.name}: ${bytes.length} bytes of hexadecimal text`);
      run(t, entryType);
    } else {
      const hex = bytesToHex(bytes);
      setText(hex);
      setFileNote(`${file.name}: ${bytes.length} raw binary octets`);
      run(hex, entryType);
    }
  };

  const d = result?.decoded;
  const statusKind = !result ? null : result.parseError ? 'err' : d?.ok ? 'ok' : 'err';
  const interps = useMemo(() => Object.fromEntries((d?.interpretations ?? []).map((i) => [i.path, i])), [d]);

  return (
    <div>
      <PageHead title="BSM Decoder" module="G">
        Paste hexadecimal, upload a binary file, or try a sample. The decoder checks the bytes against the ASN.1 constraints and rejects
        anything that is not a well-formed BSM of the selected entry type.
      </PageHead>

      <div className="split">
        <div className="card">
          <div className="card-head">
            <h2>Input payload</h2>
            <Segmented label="Decode as" value={entryType} onChange={(v) => { setEntryType(v); }} options={[{ value: 'MessageFrame', label: 'MessageFrame' }, { value: 'BasicSafetyMessage', label: 'BasicSafetyMessage' }]} />
          </div>
          <label htmlFor="hexin" className="visually-hidden">Hexadecimal payload</label>
          <textarea id="hexin" rows={6} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} placeholder="e.g. 00 14 25 …" />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="primary" onClick={() => run(text, entryType)}>Decode</button>
            <label className="btn">
              Upload file…
              <input type="file" className="visually-hidden" accept=".uper,.bin,.per,.txt,.hex,application/octet-stream,text/plain" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
            {encoding?.ok && (
              <button onClick={() => { const h = bytesToHex(entryType === 'MessageFrame' ? encoding.result.frame.bytes : encoding.result.bsm.bytes); setText(h); run(h, entryType); }}>
                Use the generator’s message
              </button>
            )}
          </div>
          {fileNote && <p className="small muted">{fileNote}</p>}
          <h3 style={{ marginTop: 14 }}>Samples</h3>
          <div className="stack">
            {SAMPLES.map((s) => (
              <div key={s.id} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <button onClick={() => { setText(s.hex); setEntryType(s.entry); run(s.hex, s.entry); }} style={{ minWidth: 70 }}>Load</button>
                <div className="small">
                  <strong>{s.title}</strong> {s.expectValid ? <span className="badge ok">valid</span> : <span className="badge err">invalid</span>}
                  <div className="muted">{s.description} <em>Source: {s.source}.</em></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Unsigned payload vs. security-wrapped message</h2>
          <p className="small">
            This decoder expects the <strong>J2735 application payload</strong>: either a MessageFrame <Ref s="5.1" /> or a bare
            BasicSafetyMessage <Ref s="5.2" />, UPER-encoded. Messages captured over the air are normally inside an <strong>IEEE 1609.2</strong>
            security envelope (Ieee1609Dot2Data with a signature and certificate data) and sometimes behind a WSMP header. Those layers are
            not part of J2735 and must be removed first; extracting the payload from IEEE 1609.2 is outside Release 1.
          </p>
          <p className="small">
            Typical clues: a BSM MessageFrame starts with <code>00 14</code>; an Ieee1609Dot2Data (protocol version 3) starts with
            <code> 03</code>. The decoder reports such hints, but never guesses an offset into a wrapped message.
          </p>
          <AtLeast min="engineering">
            <p className="small">
              Checks performed: hex syntax · length determinants vs. available data · every constrained INTEGER against its upper bound ·
              enumeration indices · open-type lengths vs. contents · padding bits · trailing data · message type · reserved values.
            </p>
          </AtLeast>
        </div>
      </div>

      {result && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <h2>Result</h2>
            {statusKind === 'ok' ? <span className="badge ok">valid {d?.entry}</span> : <span className="badge err">not a valid {entryType} BSM</span>}
          </div>
          {result.parseError && (
            <Callout kind="err"><p><strong>Invalid hexadecimal input.</strong> {result.parseError}</p></Callout>
          )}
          {d && (
            <>
              <p className="small">
                {d.hex.length / 2} octets ({d.hex.length * 4} bits) · decoded {d.raw.bitsConsumed} bits
                {d.messageId !== undefined && <> · messageId {d.messageId} = {messageIdName(d.messageId)}</>}
              </p>
              <IssueList issues={d.issues} />
              {(d.bsm || d.raw.trace.spans.length > 0) && (
                <>
                  <Tabs
                    label="Result views"
                    value={view}
                    onChange={setView}
                    tabs={[
                      { id: 'physical', label: 'Physical values' },
                      { id: 'structure', label: 'J2735 structure' },
                      { id: 'json', label: 'JSON' },
                      { id: 'bits', label: 'Original bits' },
                    ]}
                  />
                  {view === 'physical' && (
                    d.interpretations ? (
                      <div className="table-wrap">
                        <table className="data">
                          <thead><tr><th>Field</th><th className="num">J2735 value</th><th>Meaning</th><th>Status</th></tr></thead>
                          <tbody>
                            {LEAF_FIELDS.map((f) => {
                              const i = interps[f.path];
                              return (
                                <tr key={f.path} className="clickable" onClick={() => openDetail(f.path)}>
                                  <td>{f.label}</td>
                                  <td className="num v-field">{String(i?.raw)}</td>
                                  <td className="v-sensor">{i?.display}{i?.note ? <span className="muted small"> — {i.note}</span> : null}</td>
                                  <td><span className={`badge ${i?.status === 'value' ? 'ok' : i?.status === 'unavailable' ? 'info' : 'warn'}`}>{i?.status}</span></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : <p className="small muted">No BSM content was decoded.</p>
                  )}
                  {view === 'structure' && d.raw.value !== undefined && (
                    <StructureTree
                      type={d.entry === 'MessageFrame' ? MessageFrame : BasicSafetyMessage}
                      value={d.raw.value as AsnValue}
                      rootName={d.entry}
                      showTypes
                      interpretations={interps}
                      onSelect={(p) => { const c = p.replace(/^value\./, ''); if (LEAF_FIELDS.some((f) => f.path === c)) openDetail(c); }}
                      resolveOpen={(p) => (p === 'value' && d.messageId === 20 ? BasicSafetyMessage : undefined)}
                    />
                  )}
                  {view === 'json' && <pre className="code">{d.raw.value !== undefined ? formatJson(d.raw.value) : '(no value: decoding failed)'}</pre>}
                  {view === 'bits' && result.bytes && (
                    <>
                      <BitGrid bytes={result.bytes} spans={d.raw.trace.spans} selected={selected ? [selected] : []} onSelect={setSelected} errorAt={d.raw.fatal?.bitOffset} />
                      <BitLegend />
                      {d.raw.fatal && <p className="small" style={{ color: 'var(--err)' }}>Decoding stopped at bit {d.raw.fatal.bitOffset} (outlined in red); bits after that point are not attributed.</p>}
                      <HexView bytes={result.bytes} highlight={selected ?? undefined} />
                      <div className="split" style={{ marginTop: 12 }}>
                        <div>{selected ? <SpanDetails span={selected} bytes={result.bytes} /> : <p className="small muted">Click a bit to inspect it.</p>}</div>
                        <SpanTable trace={d.raw.trace} selected={selected} onSelect={setSelected} />
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
