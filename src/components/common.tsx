import { useState, type ReactNode } from 'react';
import type { Severity } from '../j2735/conversions/types';
import { useApp, type Mode } from '../app/state';

/** Section reference to SAE J2735_202409 (clickable: opens the reference explorer). */
export function Ref({ s, title }: { s: string; title?: string }) {
  return (
    <span className="ref" title={title ?? `SAE J2735 (SEP2024) section ${s}`}>
      {s}
    </span>
  );
}

const SEVERITY_BADGE: Record<Severity, string> = { error: 'err', warning: 'warn', info: 'info' };

export function IssueList({ issues, onPath }: { issues: readonly { severity: Severity; message: string; path?: string; code?: string }[]; onPath?: (p: string) => void }) {
  if (issues.length === 0) return null;
  return (
    <ul className="issues">
      {issues.map((i, k) => (
        <li key={k}>
          <span className={`badge ${SEVERITY_BADGE[i.severity]}`}>{i.severity}</span>
          <span>
            {i.path && onPath ? (
              <button className="link mono small" onClick={() => onPath(i.path!)}>{i.path}</button>
            ) : i.path ? (
              <code className="small">{i.path}</code>
            ) : null}{' '}
            {i.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Callout({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'err' | 'ok'; children: ReactNode }) {
  return <div className={`callout ${kind === 'info' ? '' : kind}`}>{children}</div>;
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt('Copy to clipboard:', text);
        }
      }}
    >
      {done ? 'Copied ✓' : label}
    </button>
  );
}

export function downloadBlob(data: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, tabs, onChange, label }: { value: T; tabs: readonly { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => {
            const i = tabs.findIndex((x) => x.id === value);
            if (e.key === 'ArrowRight') onChange(tabs[(i + 1) % tabs.length]!.id);
            if (e.key === 'ArrowLeft') onChange(tabs[(i - 1 + tabs.length) % tabs.length]!.id);
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

const MODE_RANK: Record<Mode, number> = { beginner: 0, engineering: 1, advanced: 2 };

/** Renders children only when the current learning mode is at least `min`. */
export function AtLeast({ min, children }: { min: Mode; children: ReactNode }) {
  const { mode } = useApp();
  return MODE_RANK[mode] >= MODE_RANK[min] ? <>{children}</> : null;
}

export function useModeAtLeast(min: Mode): boolean {
  return MODE_RANK[useApp().mode] >= MODE_RANK[min];
}

export function PageHead({ title, module, children, actions }: { title: string; module?: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {module && <div className="muted small">Module {module}</div>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
