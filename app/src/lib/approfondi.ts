// Mode « Approfondir par catégorie » côté application : index des catégories (chargé avec le site) et chargement à la
// demande des questions propres à chaque catégorie (un fichier par catégorie : le parcours principal ne les télécharge
// jamais). Les questions du parcours principal reprises dans une catégorie sont les mêmes objets (AppData.questions).
import { useEffect, useState } from 'react';
import type { CategorieFile, CategorieIndex, Question } from '../types';
import { data, questionsById } from './data';
import { href } from './router';
export { estExistante, porteeDe, reponsesCategorie } from './categories';

/** Catégories proposées (vide si data/selection-approfondi.json manque). */
export const categories: readonly CategorieIndex[] = data.approfondi?.categories ?? [];
export const categoriesById = new Map(categories.map((c) => [c.id, c]));

const loaders = import.meta.glob<CategorieFile>('../generated/approfondi/*.json', { import: 'default' });

const pending = new Map<string, Promise<readonly Question[]>>();
const loaded = new Map<string, readonly Question[]>();

/** Questions de la catégorie, dans l'ordre de la sélection (questions du parcours principal comprises). */
export function loadCategorie(c: CategorieIndex): Promise<readonly Question[]> {
  const deja = pending.get(c.id);
  if (deja) return deja;
  const loader = loaders[`../generated/approfondi/${c.id}.json`];
  const p = (loader ? loader() : Promise.resolve<CategorieFile>({ categorie: c.id, questions: [] })).then((file) => {
    const propres = new Map(file.questions.map((q) => [q.id, q]));
    const questions = c.questions
      .map((ref) => (ref.existant ? questionsById.get(ref.id) : propres.get(ref.id)))
      .filter((q): q is Question => q !== undefined);
    loaded.set(c.id, questions);
    return questions;
  });
  // échec réseau : une nouvelle tentative reste possible
  p.catch(() => pending.delete(c.id));
  pending.set(c.id, p);
  return p;
}

export type CategorieState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; questions: readonly Question[] };

export function useCategorie(c: CategorieIndex): CategorieState {
  const [state, setState] = useState<{ id: string; questions: readonly Question[] | null; error: boolean; essai: number }>(() => ({
    id: c.id,
    questions: loaded.get(c.id) ?? null,
    error: false,
    essai: 0,
  }));
  const current = state.id === c.id ? state : { id: c.id, questions: loaded.get(c.id) ?? null, error: false, essai: 0 };
  const { essai } = current;
  useEffect(() => {
    // promesse partagée (déjà résolue si le fichier est chargé) : l'état suit même un chargement fini entre le rendu
    // et l'effet ; rien ne change (pas de nouveau rendu) si les questions sont déjà là
    let actif = true;
    loadCategorie(c).then(
      (questions) => {
        if (actif) setState((s) => (s.id === c.id && s.questions === questions ? s : { id: c.id, questions, error: false, essai }));
      },
      () => {
        if (actif) setState({ id: c.id, questions: null, error: true, essai });
      },
    );
    return () => {
      actif = false;
    };
  }, [c, essai]);
  if (current.questions) return { status: 'ready', questions: current.questions };
  if (current.error) return { status: 'error', retry: () => setState({ id: c.id, questions: null, error: false, essai: essai + 1 }) };
  return { status: 'loading' };
}

export const approfondiHref = (): string => href('/approfondi');
export const categorieHref = (c: string): string => href(`/approfondi/${c}`);
export const categorieQuestionHref = (c: string, q: string): string => href(`/approfondi/${c}/question/${q}`);
export const categorieResultatsHref = (c: string): string => href(`/approfondi/${c}/resultats`);
