import type { Argument, Question, Stance } from '../types';

/** Arguments exprimés en faveur d'une réponse (Oui / Non / abstention), via ouiSignifie. */
export function argumentsFor(q: Question, stance: Exclude<Stance, 'inconnu'>): readonly Argument[] {
  if (stance === 'abstention') return q.arguments.abstention;
  const pourEstOui = q.ouiSignifie === 'pour';
  return (stance === 'oui') === pourEstOui ? q.arguments.pour : q.arguments.contre;
}

/**
 * « En clair » : les deux camps sont présentés dans un ordre qui alterne d'une question à l'autre
 * (rang dans la liste complète), pour qu'aucun camp ne soit systématiquement lu en premier.
 */
export function ouiEnPremier(questions: readonly Pick<Question, 'id'>[], id: string): boolean {
  return Math.max(0, questions.findIndex((q) => q.id === id)) % 2 === 0;
}
