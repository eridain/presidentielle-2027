import { useContext } from 'react';
import { QuizContext, type QuizState } from './context';

export function useQuiz(): QuizState {
  const ctx = useContext(QuizContext);
  if (!ctx) throw new Error('useQuiz doit être utilisé dans <QuizProvider>');
  return ctx;
}
