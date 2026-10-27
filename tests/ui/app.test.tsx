// @vitest-environment jsdom
/** Smoke tests: every module renders, and key interactions update the shared state. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { AppStateProvider } from '../../src/app/state';

function renderApp(hash = '#/home') {
  window.location.hash = hash;
  return render(
    <AppStateProvider>
      <App />
    </AppStateProvider>,
  );
}

async function go(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

beforeEach(() => {
  localStorage.clear();
  window.scrollTo = () => {};
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
});
afterEach(cleanup);

describe('application shell', () => {
  it.each([
    ['#/home', 'V2X Message Lab'],
    ['#/learn', 'Learn SAE J2735'],
    ['#/generator', 'BSM Generator'],
    ['#/structure', 'BSM Structure Explorer'],
    ['#/encoder', 'ASN.1 UPER Encoder'],
    ['#/bits', 'Bit-Level Explorer'],
    ['#/decoder', 'BSM Decoder'],
    ['#/compare', 'Encoding / Decoding Comparison'],
    ['#/research', 'Research Vehicle Identifier'],
    ['#/reference', 'Standard Reference Explorer'],
    ['#/about', 'Verification, limitations and sources'],
  ])('%s renders "%s"', (hash, heading) => {
    renderApp(hash);
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeTruthy();
  });

  it('renders all nine lessons', async () => {
    renderApp('#/learn');
    for (const id of ['v2x', 'why-standards', 'scope', 'hierarchy', 'bsm', 'asn1', 'uper', 'encoding', 'stack']) {
      await go(`#/learn/${id}`);
      expect(document.querySelector('article h2')?.textContent).toMatch(/^\d · /);
    }
  });
});

describe('generator → encoder data flow', () => {
  it('shows the encoded MessageFrame for the default scenario and updates when speed changes', async () => {
    renderApp('#/generator');
    const speed = document.getElementById('in-speed') as HTMLInputElement;
    expect(speed.value).toBe('50');
    await act(async () => {
      fireEvent.change(speed, { target: { value: '72' } });
    });
    await go('#/encoder');
    expect(screen.getByText(/Encoding status: success/)).toBeTruthy();
    expect(document.body.textContent).toMatch(/00142504/);
    await go('#/compare');
    expect(screen.getByText(/Round trip successful/)).toBeTruthy();
  });

  it('blocks encoding and explains invalid input', async () => {
    renderApp('#/generator');
    const lat = document.getElementById('in-latitude') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(lat, { target: { value: '95' } });
    });
    expect(screen.getAllByText(/outside −90° … \+90°/).length).toBeGreaterThan(0);
    await go('#/encoder');
    expect(screen.getByText(/Encoding status: not encoded/)).toBeTruthy();
  });
});

describe('decoder', () => {
  it('decodes the real JPO ODE sample and rejects invalid hex', async () => {
    renderApp('#/decoder');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    });
    expect(screen.getByText('valid MessageFrame')).toBeTruthy();
    const textarea = screen.getByLabelText('Hexadecimal payload');
    await act(async () => {
      fireEvent.change(textarea, { target: { value: '00 14 2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    });
    expect(screen.getByText(/Invalid hexadecimal input/)).toBeTruthy();
  });
});

describe('research identifiers', () => {
  it('records messages with metadata but never changes the BSM', async () => {
    renderApp('#/research');
    expect(screen.getByText('Local experiment log (0)')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Record current message' }));
    });
    expect(screen.getByText('Local experiment log (1)')).toBeTruthy();
    // The research ID appears in metadata and the log, while the logged payload is the standard 40-octet frame.
    expect(screen.getAllByText('UA-CAR-07').length).toBeGreaterThan(1);
    const logged = screen.getAllByText(/^001425/);
    expect(logged[0]!.textContent!.length).toBe(80);
    expect(logged[0]!.textContent).not.toMatch(/55412D4341522D3037/); // "UA-CAR-07" in ASCII hex
  });
});
