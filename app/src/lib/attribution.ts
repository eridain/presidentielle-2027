// Libellés de l'attribution des propos affichés sous un candidat (voir pipeline/attribution.ts).
import type { Attribution } from '../types';
import { deNom } from './format';

/** Les propos affichés sont ceux d'un tiers (son groupe, le Gouvernement), pas du candidat. */
export function proposDeTiers(a: Attribution | null): a is Attribution & { duCandidat: false } {
  return a?.duCandidat === false;
}

/** Titre du bloc d'argument : « Ses raisons », « Argument de son groupe », « Argument du Gouvernement ». */
export function argumentLabel(a: Attribution | null): string {
  if (!proposDeTiers(a)) return 'Ses raisons';
  return a.porteur === 'gouvernement' ? 'Argument du Gouvernement' : 'Argument de son groupe';
}

/** Mention explicite de l'auteur réel : « Propos de Laurent Jacobelli (groupe RN), pas de Marine Le Pen. » */
export function attributionMention(a: Attribution | null, nomCandidat: string): string | null {
  if (!proposDeTiers(a)) return null;
  if (a.porteur === 'gouvernement') return `Position du Gouvernement, pas une déclaration personnelle ${deNom(nomCandidat)}.`;
  if (a.orateur) return `Propos ${deNom(a.orateur)}${a.groupe ? ` (groupe ${a.groupe})` : ''}, pas ${deNom(nomCandidat)}.`;
  return `Explication ${a.groupe ? `du groupe ${a.groupe}` : 'de son groupe'}, pas ${deNom(nomCandidat)}.`;
}
