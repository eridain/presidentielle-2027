// Sélection déterministe du mode rapide : questions équilibrées par thème.
import type { Question } from '../types';
import { isRealVote } from './scoring';

/** Nombre de candidats dont la position repose sur un vote nominatif. */
export function realVoteCount(q: Question): number {
  return Object.values(q.candidats).filter((p) => isRealVote(p.evidence)).length;
}

function knownCount(q: Question): number {
  return Object.values(q.candidats).filter((p) => p.stance !== 'inconnu').length;
}

/**
 * Tour par tour sur les thèmes : à chaque tour, chaque thème fournit sa question la mieux
 * documentée non encore retenue (le plus de votes nominatifs, puis de positions connues,
 * puis la plus récente). Les thèmes qui comptent le plus de questions passent en premier
 * à partir du deuxième tour. Les questions retenues sont rendues dans l'ordre d'origine.
 */
export function selectQuick(questions: readonly Question[], themes: readonly string[], count: number): Question[] {
  if (count >= questions.length) return [...questions];
  const byTheme = new Map<string, Question[]>();
  for (const t of themes) byTheme.set(t, []);
  for (const q of questions) {
    if (!byTheme.has(q.theme)) byTheme.set(q.theme, []);
    byTheme.get(q.theme)?.push(q);
  }
  for (const list of byTheme.values())
    list.sort(
      (a, b) =>
        realVoteCount(b) - realVoteCount(a) ||
        knownCount(b) - knownCount(a) ||
        b.scrutin.date.localeCompare(a.scrutin.date) ||
        a.id.localeCompare(b.id),
    );
  const order = [...byTheme.keys()];
  const chosen = new Set<string>();
  for (let round = 0; chosen.size < count; round += 1) {
    const themesThisRound =
      round === 0
        ? order
        : [...order].sort((a, b) => (byTheme.get(b)?.length ?? 0) - (byTheme.get(a)?.length ?? 0) || order.indexOf(a) - order.indexOf(b));
    let added = false;
    for (const t of themesThisRound) {
      const q = byTheme.get(t)?.[round];
      if (q && chosen.size < count) {
        chosen.add(q.id);
        added = true;
      }
    }
    if (!added) break;
  }
  return questions.filter((q) => chosen.has(q.id));
}
