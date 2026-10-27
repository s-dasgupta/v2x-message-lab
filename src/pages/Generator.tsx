import { useState } from 'react';
import { href } from '../app/router';
import { useApp } from '../app/state';
import { bytesToHex } from '../asn1/bits';
import { AtLeast, Callout, IssueList, PageHead, Ref, useModeAtLeast } from '../components/common';
import { HandlingBadge, Pipeline } from '../components/Pipeline';
import { entry, fieldByPath } from '../j2735/catalog';
import { randomTemporaryId } from '../j2735/conversions/fields';
import { ACCEL_UNITS, ELEVATION_UNITS, SIZE_UNITS, SPEED_UNITS, YAW_UNITS, fmt } from '../j2735/conversions/units';
import { SCENARIOS } from '../j2735/data/scenarios';
import type { InputKey, NumericInput, VehicleInputs } from '../j2735/inputs';

interface NumRow {
  kind: 'number';
  key: InputKey;
  path: string;
  example: string;
  units?: readonly string[];
  hint?: string;
}
interface EnumRow {
  kind: 'enum';
  key: InputKey;
  path: string;
  options: readonly { value: string; label: string }[];
}
type Row = NumRow | EnumRow;

const STATUS = [
  { value: 'unavailable', label: 'unavailable / not equipped' },
  { value: 'off', label: 'off' },
  { value: 'on', label: 'on (armed, not engaged)' },
  { value: 'engaged', label: 'engaged (intervening)' },
] as const;

const GROUPS: { title: string; note: string; rows: Row[] }[] = [
  {
    title: 'Position and time (GNSS)',
    note: 'Measured by the GNSS receiver and translated to the centre of the vehicle outline on the road surface (§11.4).',
    rows: [
      { kind: 'number', key: 'utcSecond', path: 'coreData.secMark', example: '12.345', hint: 'seconds into the UTC minute' },
      { kind: 'number', key: 'latitude', path: 'coreData.lat', example: '33.2108712', hint: '+ north' },
      { kind: 'number', key: 'longitude', path: 'coreData.long', example: '-87.5462871', hint: '+ east' },
      { kind: 'number', key: 'elevation', path: 'coreData.elev', example: '38.6', units: ELEVATION_UNITS, hint: 'above WGS-84 ellipsoid' },
      { kind: 'number', key: 'semiMajor', path: 'coreData.accuracy.semiMajor', example: '1.20', hint: '1σ' },
      { kind: 'number', key: 'semiMinor', path: 'coreData.accuracy.semiMinor', example: '0.85', hint: '1σ' },
      { kind: 'number', key: 'orientation', path: 'coreData.accuracy.orientation', example: '15', hint: 'from true north' },
    ],
  },
  {
    title: 'Motion (vehicle bus / GNSS)',
    note: 'Speed is unsigned; reverse motion is expressed by the transmission state.',
    rows: [
      { kind: 'number', key: 'speed', path: 'coreData.speed', example: '50', units: SPEED_UNITS },
      { kind: 'number', key: 'heading', path: 'coreData.heading', example: '90', hint: 'clockwise from north' },
      { kind: 'number', key: 'steeringWheelAngle', path: 'coreData.angle', example: '-45', hint: '+ = right' },
      {
        kind: 'enum', key: 'transmission', path: 'coreData.transmission',
        options: [
          { value: 'neutral', label: 'neutral' }, { value: 'park', label: 'park' }, { value: 'forwardGears', label: 'forward gears' },
          { value: 'reverseGears', label: 'reverse gears' }, { value: 'unavailable', label: 'unavailable' },
        ],
      },
    ],
  },
  {
    title: 'Acceleration and yaw (IMU / stability control)',
    note: 'Body-frame axes: + forward, + right, + down; positive yaw is clockwise (§6.1).',
    rows: [
      { kind: 'number', key: 'accelLong', path: 'coreData.accelSet.long', example: '-7.8', units: ACCEL_UNITS, hint: '− = braking' },
      { kind: 'number', key: 'accelLat', path: 'coreData.accelSet.lat', example: '2.41', units: ACCEL_UNITS, hint: '+ = right' },
      { kind: 'number', key: 'accelVert', path: 'coreData.accelSet.vert', example: '0', units: ACCEL_UNITS },
      { kind: 'number', key: 'yawRate', path: 'coreData.accelSet.yaw', example: '19.89', units: YAW_UNITS, hint: '+ = turning right' },
    ],
  },
  {
    title: 'Brake system (brake / chassis controllers)',
    note: 'The wheel flags become a 5-bit BIT STRING; the remaining items are enumerations.',
    rows: [
      { kind: 'enum', key: 'traction', path: 'coreData.brakes.traction', options: STATUS },
      { kind: 'enum', key: 'abs', path: 'coreData.brakes.abs', options: STATUS },
      { kind: 'enum', key: 'scs', path: 'coreData.brakes.scs', options: STATUS },
      { kind: 'enum', key: 'brakeBoost', path: 'coreData.brakes.brakeBoost', options: STATUS.slice(0, 3) },
      { kind: 'enum', key: 'auxBrakes', path: 'coreData.brakes.auxBrakes', options: [STATUS[0], STATUS[1], { value: 'on', label: 'on (engaged)' }] },
    ],
  },
  {
    title: 'Vehicle configuration',
    note: 'Static values stored in the on-board unit.',
    rows: [
      { kind: 'number', key: 'vehicleWidth', path: 'coreData.size.width', example: '1.86', units: SIZE_UNITS, hint: 'incl. mirrors' },
      { kind: 'number', key: 'vehicleLength', path: 'coreData.size.length', example: '4.97', units: SIZE_UNITS },
    ],
  },
];

function resultText(v: unknown): string {
  if (v === undefined) return '—';
  return typeof v === 'string' && /^[01]{5}$/.test(v) ? `'${v}'B` : String(v);
}

export function GeneratorPage() {
  const app = useApp();
  const { inputs, setInputs, system, setSystem, build, encoding, scenarioId, loadScenario, openDetail } = app;
  const [active, setActive] = useState('coreData.speed');
  const engineering = useModeAtLeast('engineering');
  const errors = build.issues.filter((i) => i.severity === 'error');
  const warnings = build.issues.filter((i) => i.severity !== 'error');
  const activeConv = build.conversions[active];
  const scenario = SCENARIOS.find((s) => s.id === scenarioId);

  const setNum = (key: InputKey, patch: Partial<NumericInput>) =>
    setInputs((prev) => ({ ...prev, [key]: { ...(prev[key] as NumericInput), ...patch } }) as VehicleInputs);

  const renderRow = (row: Row) => {
    const spec = fieldByPath(row.path)!;
    const conv = build.conversions[row.path];
    const err = conv?.issues.find((i) => i.severity === 'error');
    const warn = conv?.issues.find((i) => i.severity === 'warning');
    const id = `in-${row.key}`;
    return (
      <div key={row.key} className={`field-row${active === row.path ? ' active' : ''}`} onFocusCapture={() => setActive(row.path)} onClick={() => setActive(row.path)}>
        <label className="label" htmlFor={id}>
          {spec.label}
          <small>{row.kind === 'number' && row.hint ? row.hint : entry(spec.entityId).type.name}</small>
        </label>
        <div className="controls">
          {row.kind === 'number' ? (
            <>
              <input
                id={id}
                type="text"
                inputMode="decimal"
                value={(inputs[row.key] as NumericInput).value}
                disabled={(inputs[row.key] as NumericInput).unavailable}
                placeholder={`e.g. ${row.example}`}
                aria-invalid={!!err}
                aria-describedby={err ? `${id}-msg` : undefined}
                onChange={(e) => setNum(row.key, { value: e.target.value })}
              />
              {row.units ? (
                <select aria-label={`${spec.label} unit`} value={(inputs[row.key] as NumericInput).unit} onChange={(e) => setNum(row.key, { unit: e.target.value })}>
                  {row.units.map((u) => <option key={u}>{u}</option>)}
                </select>
              ) : (
                <span className="small muted">{(inputs[row.key] as NumericInput).unit}</span>
              )}
              <label className="small nowrap" title="The source reports this value as unavailable">
                <input type="checkbox" checked={(inputs[row.key] as NumericInput).unavailable} onChange={(e) => setNum(row.key, { unavailable: e.target.checked })} /> n/a
              </label>
            </>
          ) : (
            <select id={id} value={inputs[row.key] as string} onChange={(e) => setInputs((p) => ({ ...p, [row.key]: e.target.value }) as VehicleInputs)}>
              {row.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
        </div>
        <div className="meta">
          <span className="result" title="J2735 field value">{resultText(conv?.j2735Value)}</span>
          <button className="ghost small" aria-label={`Explain ${spec.label}`} onClick={(e) => { e.stopPropagation(); openDetail(row.path); }}>ⓘ</button>
        </div>
        {err && <div id={`${id}-msg`} className="msg" role="alert">{err.message}</div>}
        {!err && warn && <div className="msg warn">{warn.message}</div>}
      </div>
    );
  };

  const wb = inputs.wheelBrakes;
  const wheelConv = build.conversions['coreData.brakes.wheelBrakes'];

  return (
    <div>
      <PageHead title="BSM Generator" module="B + C" actions={<a className="btn" href={href('encoder')}>Go to encoder →</a>}>
        Enter vehicle measurements in everyday units. Each value is converted to its SAE J2735 representation as you type; select a
        row to see the full sensor-to-field transformation.
      </PageHead>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2>Scenarios</h2>
          <span className="small muted">Internally consistent example vehicles</span>
        </div>
        <div className="scenario-list">
          {SCENARIOS.map((s) => (
            <button key={s.id} aria-pressed={scenarioId === s.id} onClick={() => loadScenario(s.id)}>
              <strong>{s.title}</strong>
              <small>{s.summary}</small>
            </button>
          ))}
        </div>
        {scenario && (
          <details style={{ marginTop: 10 }}>
            <summary>Why these numbers are consistent</summary>
            <ul className="small">{scenario.physics.map((p) => <li key={p}>{p}</li>)}</ul>
          </details>
        )}
        {!scenarioId && <p className="small muted" style={{ marginTop: 8 }}>Custom inputs (modified from a scenario).</p>}
      </div>

      <div className="split">
        <div>
          <fieldset className="input-group">
            <legend>System-generated values <span className="badge">not sensor data</span></legend>
            <p className="small muted" style={{ margin: '0 0 6px' }}>Created by the on-board unit itself. See the <a href={href('research')}>Research ID module</a> for why an experiment label never goes here.</p>
            <div className={`field-row${active === 'coreData.msgCnt' ? ' active' : ''}`} onClick={() => setActive('coreData.msgCnt')} onFocusCapture={() => setActive('coreData.msgCnt')}>
              <label className="label" htmlFor="in-msgcnt">Message count<small>MsgCount 0–127</small></label>
              <div className="controls">
                <input id="in-msgcnt" type="number" min={0} max={127} value={system.msgCount} onChange={(e) => setSystem((s) => ({ ...s, msgCount: Number(e.target.value) }))} />
                <button onClick={() => setSystem((s) => ({ ...s, msgCount: (s.msgCount + 1) % 128 }))}>Next</button>
              </div>
              <div className="meta">
                <span className="result">{resultText(build.conversions['coreData.msgCnt']?.j2735Value)}</span>
                <button className="ghost small" aria-label="Explain message count" onClick={() => openDetail('coreData.msgCnt')}>ⓘ</button>
              </div>
            </div>
            <div className={`field-row${active === 'coreData.id' ? ' active' : ''}`} onClick={() => setActive('coreData.id')} onFocusCapture={() => setActive('coreData.id')}>
              <label className="label" htmlFor="in-tid">Temporary ID<small>4 random octets (hex)</small></label>
              <div className="controls">
                <input id="in-tid" type="text" value={system.temporaryId} aria-invalid={!build.conversions['coreData.id']?.j2735Value} onChange={(e) => setSystem((s) => ({ ...s, temporaryId: e.target.value }))} />
                <button onClick={() => setSystem((s) => ({ ...s, temporaryId: randomTemporaryId(), msgCount: Math.floor(Math.random() * 128) }))} title="A new identity also re-initialises the message count">
                  New ID
                </button>
              </div>
              <div className="meta">
                <span className="result">{resultText(build.conversions['coreData.id']?.j2735Value)}</span>
                <button className="ghost small" aria-label="Explain temporary ID" onClick={() => openDetail('coreData.id')}>ⓘ</button>
              </div>
              {build.conversions['coreData.id']?.issues[0] && <div className="msg">{build.conversions['coreData.id']!.issues[0]!.message}</div>}
            </div>
          </fieldset>

          {GROUPS.map((g) => (
            <fieldset key={g.title} className="input-group">
              <legend>{g.title} <span className="badge sensor">sensor data</span></legend>
              <p className="small muted" style={{ margin: '0 0 6px' }}>{g.note}</p>
              {g.title.startsWith('Brake') && (
                <div className={`field-row${active === 'coreData.brakes.wheelBrakes' ? ' active' : ''}`} onClick={() => setActive('coreData.brakes.wheelBrakes')} onFocusCapture={() => setActive('coreData.brakes.wheelBrakes')}>
                  <span className="label">Wheel brakes<small>BrakeAppliedStatus</small></span>
                  <div className="controls checks" role="group" aria-label="Wheel brakes applied">
                    {(['leftFront', 'rightFront', 'leftRear', 'rightRear'] as const).map((w) => (
                      <label key={w}>
                        <input type="checkbox" disabled={wb.unavailable} checked={wb[w]} onChange={(e) => setInputs((p) => ({ ...p, wheelBrakes: { ...p.wheelBrakes, [w]: e.target.checked } }))} />
                        {w.replace(/([A-Z])/, ' $1').toLowerCase()}
                      </label>
                    ))}
                    <label>
                      <input type="checkbox" checked={wb.unavailable} onChange={(e) => setInputs((p) => ({ ...p, wheelBrakes: { ...p.wheelBrakes, unavailable: e.target.checked } }))} /> n/a
                    </label>
                  </div>
                  <div className="meta">
                    <span className="result">{resultText(wheelConv?.j2735Value)}</span>
                    <button className="ghost small" aria-label="Explain wheel brakes" onClick={() => openDetail('coreData.brakes.wheelBrakes')}>ⓘ</button>
                  </div>
                </div>
              )}
              {g.rows.map(renderRow)}
              {g.title.startsWith('Position') && (
                <div className="row" style={{ paddingLeft: 4 }}>
                  <button
                    className="small"
                    onClick={() => {
                      const now = new Date();
                      setNum('utcSecond', { value: (now.getUTCSeconds() + now.getUTCMilliseconds() / 1000).toFixed(3), unavailable: false });
                    }}
                  >
                    Use current UTC clock for time
                  </button>
                </div>
              )}
            </fieldset>
          ))}
        </div>

        <div style={{ position: 'sticky', top: 70 }}>
          <div className="card">
            <div className="card-head">
              <h2>Transformation explorer</h2>
              <span className="badge">Module C</span>
            </div>
            {activeConv ? (
              <>
                <h3>
                  {fieldByPath(active)?.label} <span className="muted small mono">{active}</span>{' '}
                  <Ref s={entry(fieldByPath(active)!.entityId).section} />
                </h3>
                {!engineering && <p className="small">{entry(fieldByPath(active)!.entityId).summary}</p>}
                <Pipeline c={activeConv} />
                <button className="link small" onClick={() => openDetail(active)}>
                  Full explanation of this field
                </button>
              </>
            ) : (
              <p>Select an input row.</p>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Validation</h2>
              {build.ok ? <span className="badge ok">ready to encode</span> : <span className="badge err">{errors.length} error(s)</span>}
            </div>
            {errors.length > 0 && (
              <Callout kind="err">
                <p>The BSM cannot be encoded until these errors are fixed. No mandatory field is ever left out or replaced silently.</p>
              </Callout>
            )}
            <IssueList issues={[...errors, ...warnings]} onPath={(p) => setActive(p)} />
            {build.issues.length === 0 && <p className="small muted">No issues.</p>}
            {encoding?.ok && (
              <p className="small mono" style={{ wordBreak: 'break-all', marginTop: 10 }}>
                <span className="badge bits">MessageFrame {encoding.result.frame.bytes.length} B</span> {bytesToHex(encoding.result.frame.bytes)}
              </p>
            )}
          </div>
        </div>
      </div>

      <AtLeast min="engineering">
        <div className="card" style={{ marginTop: 16 }}>
          <h2>All Part I transformations</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Field</th><th>Input</th><th>Physical (SI)</th><th className="num">J2735 value</th><th>Handling</th><th>Receiver value</th><th className="num">Quantization error</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(build.conversions).map((c) => (
                  <tr key={c.path} className={`clickable${active === c.path ? ' selected' : ''}`} onClick={() => setActive(c.path)}>
                    <td>{fieldByPath(c.path)?.label}</td>
                    <td className="v-sensor">{c.original}</td>
                    <td>{c.physical ? `${fmt(c.physical.value, 7)} ${c.physical.unit}` : '—'}</td>
                    <td className="num v-field">{resultText(c.j2735Value)}</td>
                    <td><HandlingBadge h={c.handling} /></td>
                    <td>{c.reconstructed ? `${fmt(c.reconstructed.value, 7)} ${c.reconstructed.unit}` : '—'}</td>
                    <td className="num">{c.quantizationError ? fmt(c.quantizationError.value, 7) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </AtLeast>
    </div>
  );
}
