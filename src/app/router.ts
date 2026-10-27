/**
 * Minimal hash router. Hash URLs (…/v2x-message-lab/#/decoder) work on GitHub
 * Pages without server-side rewrites and with relative asset paths.
 */
import { useEffect, useState } from 'react';

export type RouteId =
  | 'home' | 'learn' | 'generator' | 'structure' | 'encoder' | 'bits'
  | 'decoder' | 'compare' | 'research' | 'reference' | 'about';

export interface Route {
  readonly id: RouteId;
  /** Optional sub-path, e.g. a lesson id or a catalog entry id. */
  readonly param?: string;
}

const IDS: readonly RouteId[] = ['home', 'learn', 'generator', 'structure', 'encoder', 'bits', 'decoder', 'compare', 'research', 'reference', 'about'];

export function parseHash(hash: string): Route {
  const [id, ...rest] = hash.replace(/^#\/?/, '').split('/');
  const route = (IDS as readonly string[]).includes(id ?? '') ? (id as RouteId) : 'home';
  const param = rest.length ? decodeURIComponent(rest.join('/')) : undefined;
  return { id: route, param };
}

export function href(id: RouteId, param?: string): string {
  return `#/${id}${param ? `/${encodeURIComponent(param)}` : ''}`;
}

export function navigate(id: RouteId, param?: string): void {
  window.location.hash = href(id, param);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash));
      document.getElementById('main')?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
