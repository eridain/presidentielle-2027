// Partage du résultat par URL : les réponses sont encodées dans l'adresse, aucun serveur.
// Un caractère par question, dans l'ordre des questions du fichier de données :
// o = oui, n = non, p = passée, _ = pas de réponse (les « _ » finaux sont omis).
import type { Question, UserAnswer } from '../types';
import type { Answers } from './scoring';

const TO_CODE: Record<UserAnswer, string> = { oui: 'o', non: 'n', passe: 'p' };
const FROM_CODE: Record<string, UserAnswer> = { o: 'oui', n: 'non', p: 'passe' };

export function encodeAnswers(questions: readonly Question[], answers: Answers): string {
  const code = questions.map((q) => {
    const a = answers[q.id];
    return a ? TO_CODE[a] : '_';
  });
  return code.join('').replace(/_+$/, '');
}

export function decodeAnswers(questions: readonly Question[], code: string | null): Answers | null {
  if (code === null || !/^[onp_]{1,200}$/.test(code)) return null;
  const answers: Answers = {};
  Array.from(code).forEach((c, i) => {
    const q = questions[i];
    const a = FROM_CODE[c];
    if (q && a) answers[q.id] = a;
  });
  return Object.keys(answers).length > 0 ? answers : null;
}

export function shareUrl(base: string, questions: readonly Question[], answers: Answers): string {
  return `${base}#/resultats?r=${encodeAnswers(questions, answers)}`;
}

/**
 * Clé de contrôle d'un lien de partage de catégorie : empreinte (FNV-1a 32 bits, base 36) des identifiants des
 * questions couvertes par le code, dans l'ordre. Ajouter des questions en fin de catégorie ne change pas la clé des
 * liens existants ; réordonner ou retirer une question la change, et le lien est alors signalé comme périmé au lieu
 * d'attribuer des réponses aux mauvaises questions.
 */
export function cleQuestions(ids: readonly string[]): string {
  let h = 0x811c9dc5;
  for (const ch of ids.join('|')) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** Paramètres du lien de partage d'une catégorie (`r` = réponses, `k` = clé de contrôle). */
export function encodeCategorie(questions: readonly Question[], answers: Answers): { r: string; k: string } {
  const r = encodeAnswers(questions, answers);
  return { r, k: cleQuestions(questions.slice(0, r.length).map((q) => q.id)) };
}

/**
 * Relit un lien de partage de catégorie. `perime` : la clé ne correspond plus aux questions actuelles (catégorie
 * modifiée depuis le partage) — les réponses ne sont alors pas relues.
 */
export function decodeCategorie(
  questions: readonly Question[],
  code: string | null,
  cle: string | null,
): { answers: Answers | null; perime: boolean } {
  if (code === null || !/^[onp_]{1,200}$/.test(code)) return { answers: null, perime: false };
  if (code.length > questions.length || cle !== cleQuestions(questions.slice(0, code.length).map((q) => q.id)))
    return { answers: null, perime: true };
  return { answers: decodeAnswers(questions, code), perime: false };
}
