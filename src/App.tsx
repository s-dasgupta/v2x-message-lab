import { useState } from 'react';
import { href, useRoute, type RouteId } from './app/router';
import { useApp, type Mode, type Theme } from './app/state';
import { Segmented } from './components/common';
import { FieldDetailDrawer } from './components/FieldDetail';
import { HomePage } from './pages/Home';
import { LearnPage } from './pages/Learn';
import { GeneratorPage } from './pages/Generator';
import { StructurePage } from './pages/Structure';
import { EncoderPage } from './pages/Encoder';
import { BitExplorerPage } from './pages/BitExplorer';
import { DecoderPage } from './pages/Decoder';
import { ComparePage } from './pages/Compare';
import { ResearchPage } from './pages/Research';
import { ReferencePage } from './pages/Reference';
import { AboutPage } from './pages/About';

const NAV: { group: string; items: { id: RouteId; label: string; mod?: string }[] }[] = [
  { group: 'Start', items: [{ id: 'home', label: 'Overview' }, { id: 'learn', label: 'Learn SAE J2735', mod: 'A' }] },
  {
    group: 'Build & encode',
    items: [
      { id: 'generator', label: 'BSM Generator', mod: 'B' },
      { id: 'structure', label: 'BSM Structure', mod: 'D' },
      { id: 'encoder', label: 'UPER Encoder', mod: 'E' },
      { id: 'bits', label: 'Bit Explorer', mod: 'F' },
    ],
  },
  {
    group: 'Decode & verify',
    items: [
      { id: 'decoder', label: 'BSM Decoder', mod: 'G' },
      { id: 'compare', label: 'Round-trip Compare', mod: 'H' },
    ],
  },
  {
    group: 'Research & reference',
    items: [
      { id: 'research', label: 'Research Vehicle ID', mod: 'I' },
      { id: 'reference', label: 'Standard Reference', mod: 'J' },
      { id: 'about', label: 'Verification & limits' },
    ],
  },
];

const MODES: { value: Mode; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'advanced', label: 'Advanced' },
];

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function App() {
  const route = useRoute();
  const { mode, setMode, theme, setTheme } = useApp();
  const [navOpen, setNavOpen] = useState(false);
  const page = (() => {
    switch (route.id) {
      case 'learn': return <LearnPage lesson={route.param} />;
      case 'generator': return <GeneratorPage />;
      case 'structure': return <StructurePage />;
      case 'encoder': return <EncoderPage />;
      case 'bits': return <BitExplorerPage initialPath={route.param} />;
      case 'decoder': return <DecoderPage />;
      case 'compare': return <ComparePage />;
      case 'research': return <ResearchPage />;
      case 'reference': return <ReferencePage entityId={route.param} />;
      case 'about': return <AboutPage />;
      default: return <HomePage />;
    }
  })();
  return (
    <div className="app">
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>
      <header className="topbar">
        <button className="menu-toggle ghost" aria-expanded={navOpen} aria-controls="sidenav" onClick={() => setNavOpen(!navOpen)} aria-label="Toggle navigation">
          ☰
        </button>
        <a className="brand" href={href('home')}>
          <strong>V2X Message Lab</strong>
          <span>Learn, Build, Encode, and Decode SAE J2735 Messages</span>
        </a>
        <div className="spacer" />
        <div className="wide-only row">
          <Segmented label="Explanation depth" value={mode} options={MODES} onChange={setMode} />
          <Segmented label="Colour theme" value={theme} options={THEMES} onChange={setTheme} />
        </div>
        <div className="narrow-only row">
          <select aria-label="Explanation depth" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select aria-label="Colour theme" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
            {THEMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </header>
      <nav id="sidenav" className={`sidenav${navOpen ? ' open' : ''}`} aria-label="Modules">
        {NAV.map((g) => (
          <div key={g.group}>
            <h4>{g.group}</h4>
            {g.items.map((it) => (
              <a key={it.id} href={href(it.id)} aria-current={route.id === it.id ? 'page' : undefined} onClick={() => setNavOpen(false)}>
                <span className="mod">{it.mod ?? ''}</span>
                {it.label}
              </a>
            ))}
          </div>
        ))}
        <p className="small muted" style={{ padding: '14px 10px 0' }}>
          Release 1 · BSM Part I · SAE J2735 SEP2024
          <br />
          <a href="https://github.com/s-dasgupta/v2x-message-lab" target="_blank" rel="noreferrer">Source code on GitHub</a>
        </p>
      </nav>
      <main id="main" tabIndex={-1}>
        {page}
      </main>
      <FieldDetailDrawer />
    </div>
  );
}
