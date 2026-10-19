// Routage par fragment (#/chemin?param=…) : compatible avec tout hébergement statique,
// y compris dans un sous-dossier.
import { useSyncExternalStore } from 'react';

export interface Route {
  path: string;
  params: URLSearchParams;
}

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '');
  const [rawPath = '', query = ''] = h.split('?', 2);
  const path = `/${rawPath.replace(/^\/+/, '').replace(/\/+$/, '')}`;
  return { path, params: new URLSearchParams(query) };
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  );
  return parseHash(hash);
}

export function href(path: string): string {
  return `#${path}`;
}

export function navigate(path: string): void {
  window.location.hash = path;
}

/** Page « parti / candidat » d'un candidat. */
export function candidatHref(id: string): string {
  return href(`/candidat/${id}`);
}
