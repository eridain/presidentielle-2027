// Persistance locale (localStorage) : aucune donnée ne quitte le navigateur.
import type { UserAnswer } from '../types';

export type Mode = 'rapide' | 'complet';

export interface SavedState {
  mode: Mode | null;
  answers: Record<string, UserAnswer>;
}

const KEY = 'vote-reel:v1';
const EMPTY: SavedState = { mode: null, answers: {} };

export function loadState(): SavedState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY;
    const p = parsed as Partial<SavedState>;
    const answers: Record<string, UserAnswer> = {};
    for (const [k, v] of Object.entries(p.answers ?? {}) as [string, unknown][])
      if (v === 'oui' || v === 'non' || v === 'passe') answers[k] = v;
    return { mode: p.mode === 'rapide' || p.mode === 'complet' ? p.mode : null, answers };
  } catch {
    return EMPTY;
  }
}

export function saveState(state: SavedState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // stockage indisponible (navigation privée) : l'application fonctionne sans persistance
  }
}

export function clearState(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // idem
  }
}

// ---------------------------------------------------------------- mode approfondi (par catégorie)

/**
 * Réponses du mode approfondi, par catégorie : seulement celles des questions propres à la catégorie. Une question du
 * parcours principal reprise dans une catégorie garde une seule réponse, celle du parcours principal (SavedState).
 */
export type ApprofondiAnswers = Record<string, Record<string, UserAnswer>>;

const KEY_APPROFONDI = 'vote-reel:approfondi:v1';

function sanitizeAnswers(value: unknown): Record<string, UserAnswer> {
  const answers: Record<string, UserAnswer> = {};
  if (typeof value !== 'object' || value === null) return answers;
  for (const [k, v] of Object.entries(value) as [string, unknown][])
    if (v === 'oui' || v === 'non' || v === 'passe') answers[k] = v;
  return answers;
}

export function loadApprofondi(): ApprofondiAnswers {
  try {
    const raw = window.localStorage.getItem(KEY_APPROFONDI);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: ApprofondiAnswers = {};
    for (const [categorie, answers] of Object.entries(parsed) as [string, unknown][]) {
      const a = sanitizeAnswers(answers);
      if (/^[a-z0-9-]+$/.test(categorie) && Object.keys(a).length > 0) out[categorie] = a;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveApprofondi(state: ApprofondiAnswers): void {
  try {
    if (Object.keys(state).length === 0) window.localStorage.removeItem(KEY_APPROFONDI);
    else window.localStorage.setItem(KEY_APPROFONDI, JSON.stringify(state));
  } catch {
    // stockage indisponible : l'application fonctionne sans persistance
  }
}
