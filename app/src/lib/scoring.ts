// Calcul du taux d'accord entre l'utilisateur et chaque candidat.
import type { AppData, CandidatePosition, EvidenceType, Question, Stance, UserAnswer } from '../types';
import { AGREEMENT, EVIDENCE_WEIGHTS, MIN_COMPARABLE, REAL_VOTE_EVIDENCE } from './weights';

export type Answers = Record<string, UserAnswer>;
export type Verdict = 'accord' | 'desaccord' | 'abstention' | 'non-comparable';

export interface ScoreOptions {
  /** Ne retenir que les votes nominatifs (AN, Congrès, Sénat, Parlement européen). */
  votesSeulement?: boolean;
}

export interface QuestionComparison {
  question: Question;
  answer: UserAnswer | undefined;
  position: CandidatePosition | undefined;
  verdict: Verdict;
  weight: number;
}

export interface CandidateScore {
  candidatId: string;
  /** Taux d'accord pondéré entre 0 et 1, null si aucune question comparable. */
  score: number | null;
  comparables: number;
  /** Dont questions fondées sur un vote nominatif du candidat. */
  votesReels: number;
  /** Part du poids total apportée par des votes réels (0-1). */
  confiance: number;
  accords: number;
  desaccords: number;
  abstentions: number;
  classe: boolean;
  details: QuestionComparison[];
}

export function verdict(answer: UserAnswer | undefined, stance: Stance | undefined): Verdict {
  if (answer !== 'oui' && answer !== 'non') return 'non-comparable';
  if (stance === 'abstention') return 'abstention';
  if (stance === 'oui' || stance === 'non') return stance === answer ? 'accord' : 'desaccord';
  return 'non-comparable';
}

export function isRealVote(e: EvidenceType): boolean {
  return REAL_VOTE_EVIDENCE.includes(e);
}

export function scoreCandidate(
  candidatId: string,
  questions: readonly Question[],
  answers: Answers,
  options: ScoreOptions = {},
): CandidateScore {
  let num = 0;
  let den = 0;
  let realWeight = 0;
  const s: CandidateScore = {
    candidatId,
    score: null,
    comparables: 0,
    votesReels: 0,
    confiance: 0,
    accords: 0,
    desaccords: 0,
    abstentions: 0,
    classe: false,
    details: [],
  };
  for (const q of questions) {
    const answer = answers[q.id];
    const position = q.candidats[candidatId];
    let v = verdict(answer, position?.stance);
    if (v !== 'non-comparable' && options.votesSeulement && position && !isRealVote(position.evidence))
      v = 'non-comparable';
    const weight = v === 'non-comparable' || !position ? 0 : EVIDENCE_WEIGHTS[position.evidence];
    if (v !== 'non-comparable' && weight > 0 && position) {
      num += weight * AGREEMENT[v];
      den += weight;
      s.comparables += 1;
      if (isRealVote(position.evidence)) {
        s.votesReels += 1;
        realWeight += weight;
      }
      if (v === 'accord') s.accords += 1;
      else if (v === 'desaccord') s.desaccords += 1;
      else s.abstentions += 1;
    }
    s.details.push({ question: q, answer, position, verdict: weight > 0 ? v : 'non-comparable', weight });
  }
  s.score = den > 0 ? num / den : null;
  s.confiance = den > 0 ? realWeight / den : 0;
  s.classe = s.comparables >= MIN_COMPARABLE && s.score !== null;
  return s;
}

/** Collator français pour l'ordre alphabétique des noms. */
export const collator = new Intl.Collator('fr', { sensitivity: 'base' });

/**
 * Classement : candidats classés par score décroissant (égalité : ordre alphabétique),
 * puis candidats aux données insuffisantes, par ordre alphabétique.
 */
export function rankCandidates(data: AppData, questions: readonly Question[], answers: Answers, options: ScoreOptions = {}) {
  const byName = new Map(data.candidats.map((c) => [c.id, c]));
  const scores = data.candidats.map((c) => scoreCandidate(c.id, questions, answers, options));
  const alpha = (a: CandidateScore, b: CandidateScore) =>
    collator.compare(byName.get(a.candidatId)?.tri ?? '', byName.get(b.candidatId)?.tri ?? '');
  const classes = scores.filter((s) => s.classe).sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || alpha(a, b));
  const insuffisants = scores.filter((s) => !s.classe).sort(alpha);
  return { classes, insuffisants };
}

/** Taux d'accord par thème pour un candidat. */
export function scoreByTheme(score: CandidateScore, themes: readonly string[]) {
  return themes.map((theme) => {
    let num = 0;
    let den = 0;
    let n = 0;
    for (const d of score.details) {
      if (d.question.theme !== theme || d.verdict === 'non-comparable') continue;
      num += d.weight * AGREEMENT[d.verdict];
      den += d.weight;
      n += 1;
    }
    return { theme, score: den > 0 ? num / den : null, n };
  });
}
