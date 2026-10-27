import { useApp } from '../app/state';
import { Callout, PageHead, Ref, downloadBlob } from '../components/common';

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ResearchPage() {
  const { research, setResearch, system, log, recordMessage, clearLog, encoding } = useApp();
  const set = (k: keyof typeof research) => (e: { target: { value: string } }) => setResearch({ ...research, [k]: e.target.value });
  const idOk = ID_PATTERN.test(research.researchVehicleId);
  const expOk = ID_PATTERN.test(research.experimentId);

  const exportJson = () => {
    const doc = {
      format: 'v2x-message-lab/experiment-log@1',
      note: 'Experiment metadata is stored alongside, never inside, the SAE J2735 messages. Each payload is an unmodified, standard-conformant UPER encoding.',
      metadata: { ...research, exportedAt: new Date().toISOString() },
      messages: log,
    };
    downloadBlob(JSON.stringify(doc, null, 2), `${research.experimentId || 'experiment'}-log.json`, 'application/json');
  };
  const exportCsv = () => {
    const header = ['recordedAt', 'researchVehicleId', 'experimentId', 'runLabel', 'scenario', 'msgCount', 'temporaryId', 'messageFrameHex', 'bsmHex'];
    const lines = [header.join(','), ...log.map((e) => header.map((h) => csvCell(e[h as keyof typeof e])).join(','))];
    downloadBlob(lines.join('\n') + '\n', `${research.experimentId || 'experiment'}-log.csv`, 'text/csv');
  };

  return (
    <div>
      <PageHead title="Research Vehicle Identifier" module="I">
        Label your test vehicles and experiments for analysis — without altering the standardized message that goes on the air.
      </PageHead>
      <div className="split">
        <div className="card">
          <h2>Experiment metadata</h2>
          <div className="stack">
            <label>Research vehicle ID<br />
              <input type="text" value={research.researchVehicleId} onChange={set('researchVehicleId')} aria-invalid={!idOk} placeholder="UA-CAR-07" />
            </label>
            <label>Experiment identifier<br />
              <input type="text" value={research.experimentId} onChange={set('experimentId')} aria-invalid={!expOk} placeholder="EXP-2026-001" />
            </label>
            <label>Run label<br /><input type="text" value={research.runLabel} onChange={set('runLabel')} /></label>
            <label>Operator<br /><input type="text" value={research.operator} onChange={set('operator')} /></label>
            <label>Notes<br /><textarea rows={3} value={research.notes} onChange={set('notes')} style={{ fontFamily: 'var(--font)' }} /></label>
          </div>
          {(!idOk || !expOk) && <p className="small" style={{ color: 'var(--err)' }}>IDs may use letters, digits and . _ : - (1–64 characters).</p>}
          <p className="small muted">Stored only in this browser (local storage). Nothing is uploaded.</p>
        </div>
        <div className="card">
          <h2>Four different identifiers</h2>
          <table className="data">
            <thead><tr><th>Identifier</th><th>Current value</th><th>In the BSM?</th></tr></thead>
            <tbody>
              <tr><td>Research vehicle ID</td><td className="mono">{research.researchVehicleId}</td><td><span className="badge warn">no — metadata only</span></td></tr>
              <tr><td>Experiment identifier</td><td className="mono">{research.experimentId}</td><td><span className="badge warn">no — metadata only</span></td></tr>
              <tr><td>J2735 TemporaryID <Ref s="7.204" /></td><td className="mono">{system.temporaryId}</td><td><span className="badge ok">yes — coreData.id</span></td></tr>
              <tr><td>Message count <Ref s="7.113" /></td><td className="mono">{system.msgCount}</td><td><span className="badge ok">yes — coreData.msgCnt</span></td></tr>
            </tbody>
          </table>
          <h3 style={{ marginTop: 14 }}>Why not put “{research.researchVehicleId || 'UA-CAR-07'}” in the message?</h3>
          <ul className="small">
            <li><strong>It does not fit the standard.</strong> TemporaryID is exactly 4 octets of opaque data. Ten ASCII characters cannot be placed there, and re-purposing any Part I field breaks its meaning for every receiver.</li>
            <li><strong>Privacy.</strong> A random ID that changes periodically lets nearby vehicles track an encounter for a few seconds without enabling long-term tracking. A fixed, human-readable ID defeats that protection.</li>
            <li><strong>Interoperability.</strong> Receivers from other manufacturers decode only standard content. Proprietary additions would need regional extensions, whose use J2735 discourages for security reasons <Ref s="4.1" /> <Ref s="11.2" />, and the result would no longer be a plain standard BSM.</li>
            <li><strong>Research practice.</strong> Associate each transmitted payload with the vehicle and run in your own log, keyed by time, TemporaryID and message count — as below.</li>
          </ul>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2>Local experiment log ({log.length})</h2>
          <div className="row">
            <button className="primary" disabled={!encoding?.ok} onClick={recordMessage}>Record current message</button>
            <button disabled={!log.length} onClick={exportJson}>Export JSON</button>
            <button disabled={!log.length} onClick={exportCsv}>Export CSV</button>
            <button disabled={!log.length} onClick={() => window.confirm('Delete all log entries stored in this browser?') && clearLog()}>Clear</button>
          </div>
        </div>
        <Callout><p className="small">Recording stores the unmodified MessageFrame and BSM bytes together with the metadata, then advances the message count by one (as the next transmission from the same sender would).</p></Callout>
        {log.length ? (
          <div className="table-wrap" style={{ maxHeight: 360 }}>
            <table className="data">
              <thead><tr><th>Recorded (UTC)</th><th>Vehicle</th><th>Experiment / run</th><th>TemporaryID</th><th className="num">msgCnt</th><th>MessageFrame</th></tr></thead>
              <tbody>
                {[...log].reverse().map((e) => (
                  <tr key={e.recordedAt + e.msgCount}>
                    <td className="small nowrap">{e.recordedAt.replace('T', ' ').replace('Z', '')}</td>
                    <td className="mono small">{e.researchVehicleId}</td>
                    <td className="small">{e.experimentId} / {e.runLabel}</td>
                    <td className="mono small">{e.temporaryId}</td>
                    <td className="num">{e.msgCount}</td>
                    <td className="mono small" style={{ wordBreak: 'break-all' }}>{e.messageFrameHex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="small muted">No messages recorded yet.</p>
        )}
      </div>
    </div>
  );
}
