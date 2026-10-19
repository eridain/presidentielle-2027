// Constantes du score — module unique, affiché tel quel dans la page Méthodologie.
import type { EvidenceType } from '../types';

/** Poids de chaque nature de preuve dans le score d'accord. */
export const EVIDENCE_WEIGHTS: Record<EvidenceType, number> = {
  vote_an: 1,
  vote_congres: 1,
  vote_senat: 1,
  vote_pe: 1,
  gouvernement: 0.75,
  declaration: 0.5,
  censure_implicite: 0.5,
  groupe: 0.25,
  inconnu: 0,
};

/** Natures de preuve considérées comme des « votes réels » (vote nominatif officiel du candidat). */
export const REAL_VOTE_EVIDENCE: readonly EvidenceType[] = ['vote_an', 'vote_congres', 'vote_senat', 'vote_pe'];

/** Valeur d'accord : même position = 1, abstention du candidat = 0,5, position opposée = 0. */
export const AGREEMENT = { accord: 1, abstention: 0.5, desaccord: 0 } as const;

/** En dessous de ce nombre de questions comparables, le candidat n'est pas classé. */
export const MIN_COMPARABLE = 3;

/** Indice de confiance = part du poids issue de votes nominatifs : seuils des libellés. */
export const CONFIDENCE_THRESHOLDS = { elevee: 0.75, moyenne: 0.4 } as const;

/** Nombre de questions du mode rapide. */
export const QUICK_COUNT = 15;

export const EVIDENCE_LABELS: Record<EvidenceType, { court: string; long: string }> = {
  vote_an: { court: 'Vote AN', long: "Vote nominatif à l'Assemblée nationale" },
  vote_congres: { court: 'Vote Congrès', long: 'Vote nominatif au Congrès du Parlement' },
  vote_senat: { court: 'Vote Sénat', long: 'Vote nominatif au Sénat' },
  vote_pe: { court: 'Vote Parlement européen', long: 'Vote nominatif au Parlement européen' },
  gouvernement: { court: 'Membre du gouvernement', long: 'Membre du gouvernement qui a porté ou soutenu le texte' },
  declaration: { court: 'Déclaration', long: 'Déclaration publique datée et sourcée' },
  censure_implicite: {
    court: "N'a pas voté la censure",
    long: 'Député(e) en mandat qui n’a pas voté la motion de censure (soutien implicite)',
  },
  groupe: { court: 'Proxy\u00a0: vote du groupe', long: 'Proxy\u00a0: vote majoritaire du groupe de son parti — pas un vote du candidat' },
  inconnu: { court: 'Inconnu', long: 'Position inconnue' },
};
