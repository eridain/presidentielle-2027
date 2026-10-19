// Libellés de la portée d'un scrutin (mode approfondi) : utilisés seulement par les pages chargées à la demande.
import type { Portee } from '../types';

/** Ce sur quoi porte le scrutin, affiché sur chaque question du mode approfondi. */
export const PORTEE_LABEL: Record<Portee, string> = {
  ensemble: 'Vote sur l’ensemble du texte',
  article: 'Vote sur un article',
  amendement: 'Vote sur un amendement',
  motion_censure: 'Vote sur une motion de censure',
};

/** Précision affichée sous le libellé : un article ou un amendement n'est pas le texte entier. */
export const PORTEE_PRECISION: Record<Portee, string | null> = {
  ensemble: null,
  article:
    'Ce scrutin porte sur un seul article du texte, pas sur le texte entier\u00a0: un député a pu voter cet article et rejeter le reste, ou l’inverse.',
  amendement:
    'Ce scrutin porte sur un amendement (une modification proposée au texte), pas sur le texte entier\u00a0: un député a pu soutenir l’amendement et rejeter le texte, ou l’inverse.',
  motion_censure:
    'Lors d’une motion de censure, seuls les votes «\u00a0pour\u00a0» sont enregistrés\u00a0: un député qui ne l’a pas votée ne figure pas parmi les votants.',
};

/** Mention courte (listes, détail des résultats) ; rien pour un vote sur l'ensemble du texte. */
export const PORTEE_COURT: Record<Portee, string | null> = {
  ensemble: null,
  article: 'vote sur un article',
  amendement: 'vote sur un amendement',
  motion_censure: 'motion de censure',
};
