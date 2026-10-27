/**
 * Application state shared by all modules: the vehicle inputs, the derived
 * BSM structure and encodings (single source of truth for every view), the
 * learning mode, theme, research metadata and the local experiment log.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildBsm, type BuildResult } from '../j2735/bsmBuilder';
import { tryEncodeBsm, type BsmEncoding } from '../j2735/codec';
import { SCENARIOS, scenarioById } from '../j2735/data/scenarios';
import type { SystemInputs, VehicleInputs } from '../j2735/inputs';
import { bytesToHex } from '../asn1/bits';
import { load, save } from './storage';

export type Mode = 'beginner' | 'engineering' | 'advanced';
export type Theme = 'light' | 'dark' | 'system';

export interface ResearchMetadata {
  researchVehicleId: string;
  experimentId: string;
  runLabel: string;
  operator: string;
  notes: string;
}

export interface LogEntry {
  readonly recordedAt: string;
  readonly researchVehicleId: string;
  readonly experimentId: string;
  readonly runLabel: string;
  readonly scenario: string;
  readonly msgCount: number;
  readonly temporaryId: string;
  readonly messageFrameHex: string;
  readonly bsmHex: string;
}

interface AppState {
  mode: Mode;
  setMode: (m: Mode) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  scenarioId: string | null;
  inputs: VehicleInputs;
  system: SystemInputs;
  setInputs: (update: (prev: VehicleInputs) => VehicleInputs) => void;
  setSystem: (update: (prev: SystemInputs) => SystemInputs) => void;
  loadScenario: (id: string) => void;
  build: BuildResult;
  encoding: { ok: true; result: BsmEncoding } | { ok: false; error: string } | null;
  research: ResearchMetadata;
  setResearch: (r: ResearchMetadata) => void;
  log: LogEntry[];
  recordMessage: () => void;
  clearLog: () => void;
  detail: string | null;
  openDetail: (entityOrPath: string | null) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const initial = SCENARIOS[0]!;
  const [mode, setModeState] = useState<Mode>(() => load('mode', 'engineering'));
  const [theme, setThemeState] = useState<Theme>(() => load('theme', 'system'));
  const [scenarioId, setScenarioId] = useState<string | null>(() => load('scenario', initial.id));
  const [inputs, setInputsState] = useState<VehicleInputs>(() => {
    const saved = load<Partial<VehicleInputs>>('inputs', initial.inputs);
    // Discard stored inputs from an incompatible (older) version of the app.
    return Object.keys(initial.inputs).every((k) => k in saved) ? (saved as VehicleInputs) : initial.inputs;
  });
  const [system, setSystemState] = useState<SystemInputs>(() => load('system', initial.system));
  const [research, setResearchState] = useState<ResearchMetadata>(() =>
    load('research', { researchVehicleId: 'UA-CAR-07', experimentId: 'EXP-2026-001', runLabel: 'run-01', operator: '', notes: '' }),
  );
  const [log, setLog] = useState<LogEntry[]>(() => load('log', []));
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    save('theme', theme);
  }, [theme]);
  useEffect(() => save('mode', mode), [mode]);
  useEffect(() => save('inputs', inputs), [inputs]);
  useEffect(() => save('system', system), [system]);
  useEffect(() => save('scenario', scenarioId), [scenarioId]);
  useEffect(() => save('research', research), [research]);
  useEffect(() => save('log', log), [log]);

  const build = useMemo(() => buildBsm(inputs, system), [inputs, system]);
  const encoding = useMemo(() => (build.coreData ? tryEncodeBsm(build.coreData) : null), [build]);

  const setInputs = useCallback((update: (prev: VehicleInputs) => VehicleInputs) => {
    setInputsState(update);
    setScenarioId(null);
  }, []);
  const setSystem = useCallback((update: (prev: SystemInputs) => SystemInputs) => setSystemState(update), []);
  const loadScenario = useCallback((id: string) => {
    const s = scenarioById(id);
    if (!s) return;
    setInputsState(s.inputs);
    setSystemState(s.system);
    setScenarioId(id);
  }, []);

  const recordMessage = useCallback(() => {
    if (!encoding?.ok) return;
    const entry: LogEntry = {
      recordedAt: new Date().toISOString(),
      researchVehicleId: research.researchVehicleId,
      experimentId: research.experimentId,
      runLabel: research.runLabel,
      scenario: scenarioId ?? 'custom',
      msgCount: system.msgCount,
      temporaryId: system.temporaryId.toUpperCase(),
      messageFrameHex: bytesToHex(encoding.result.frame.bytes),
      bsmHex: bytesToHex(encoding.result.bsm.bytes),
    };
    setLog((l) => [...l, entry].slice(-500));
    // The next message from the same sender carries the next sequence number.
    setSystemState((s) => ({ ...s, msgCount: (s.msgCount + 1) % 128 }));
  }, [encoding, research, scenarioId, system]);

  const value: AppState = {
    mode, setMode: setModeState, theme, setTheme: setThemeState,
    scenarioId, inputs, system, setInputs, setSystem, loadScenario,
    build, encoding,
    research, setResearch: setResearchState,
    log, recordMessage, clearLog: () => setLog([]),
    detail, openDetail: setDetail,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppStateProvider');
  return v;
}
