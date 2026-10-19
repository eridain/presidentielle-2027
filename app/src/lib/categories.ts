// Mode « Approfondir par catégorie » : catégories, portée des scrutins, durée estimée.
// Partagé entre le pipeline (pipeline/approfondi.ts) et l'application.
import type { CategorieIndex, Portee, UserAnswer } from '../types';
import type { Answers } from './scoring';

/** Les dix catégories, dans l'ordre d'affichage. `libelle` = valeur exacte du champ `categorie` de la sélection. */
export const CATEGORIES = [
  { id: 'economie-travail', libelle: 'Économie & travail' },
  { id: 'fiscalite-budget', libelle: 'Fiscalité & budget' },
  { id: 'commerce-europe', libelle: 'Commerce international & Europe' },
  { id: 'immigration', libelle: 'Immigration' },
  { id: 'securite-justice', libelle: 'Sécurité & justice' },
  { id: 'libertes-institutions', libelle: 'Libertés publiques & institutions' },
  { id: 'societe-bioethique', libelle: 'Société & bioéthique' },
  { id: 'environnement-energie', libelle: 'Environnement, agriculture & énergie' },
  { id: 'sante-protection-sociale', libelle: 'Santé & protection sociale' },
  { id: 'defense-international', libelle: 'Défense & international' },
] as const;

export const PORTEES = ['ensemble', 'article', 'amendement', 'motion_censure'] as const satisfies readonly Portee[];

/**
 * Une catégorie n'est proposée qu'à partir de ce nombre de questions (la sélection en vise au moins 20) :
 * en dessous, elle n'apporterait guère plus que le parcours principal. Elle est alors signalée dans data-report.md.
 */
export const MIN_QUESTIONS_CATEGORIE = 10;

/** Nombre de questions visé par catégorie (signalé dans data-report.md en dessous). */
export const CIBLE_QUESTIONS_CATEGORIE = 20;

/** Durée moyenne d'une question (lecture, réponse, coup d'œil à la révélation), pour l'estimation affichée. */
export const SECONDES_PAR_QUESTION = 25;

export function dureeMinutes(questions: number): number {
  return Math.max(1, Math.round((questions * SECONDES_PAR_QUESTION) / 60));
}

/** Comparaison tolérante d'un libellé de catégorie (casse, accents, espaces, « & » / « et »). */
export function normaliserCategorie(libelle: string): string {
  return libelle
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' et ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function porteeDe(c: CategorieIndex, questionId: string): Portee {
  return c.questions.find((r) => r.id === questionId)?.portee ?? 'ensemble';
}

export function estExistante(c: CategorieIndex, questionId: string): boolean {
  return c.questions.some((r) => r.id === questionId && r.existant);
}

/**
 * Réponses de l'utilisateur sur une catégorie : celles du parcours principal pour les questions reprises (une seule
 * réponse par question sur tout le site), celles de la catégorie pour les autres.
 */
export function reponsesCategorie(
  c: CategorieIndex,
  principales: Readonly<Record<string, UserAnswer>>,
  propres: Readonly<Record<string, UserAnswer>> | undefined,
): Answers {
  const out: Answers = {};
  for (const ref of c.questions) {
    const a = ref.existant ? principales[ref.id] : propres?.[ref.id];
    if (a) out[ref.id] = a;
  }
  return out;
}
