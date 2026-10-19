import { createContext } from 'react';
import type { ApprofondiAnswers, Mode } from '../lib/storage';
import type { Question, UserAnswer } from '../types';

export interface QuizState {
  mode: Mode | null;
  answers: Record<string, UserAnswer>;
  /** Questions du parcours en cours (mode rapide ou complet). */
  parcours: readonly Question[];
  start: (mode: Mode) => void;
  answer: (questionId: string, value: UserAnswer) => void;
  reset: () => void;
  /** Mode approfondi : réponses aux questions propres à chaque catégorie (catégorie → question → réponse). */
  approfondi: ApprofondiAnswers;
  answerApprofondi: (categorie: string, questionId: string, value: UserAnswer) => void;
  /** Efface les réponses propres à une catégorie (les questions du parcours principal gardent la leur). */
  resetCategorie: (categorie: string) => void;
}

export const QuizContext = createContext<QuizState | null>(null);
