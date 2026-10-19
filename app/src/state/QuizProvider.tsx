import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { data, quickQuestions } from '../lib/data';
import {
  clearState,
  loadApprofondi,
  loadState,
  saveApprofondi,
  saveState,
  type ApprofondiAnswers,
  type Mode,
  type SavedState,
} from '../lib/storage';
import type { UserAnswer } from '../types';
import { QuizContext, type QuizState } from './context';

export function QuizProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SavedState>(() => loadState());
  // Mode approfondi : stockage séparé, le parcours principal n'en dépend pas.
  const [approfondi, setApprofondi] = useState<ApprofondiAnswers>(() => loadApprofondi());

  useEffect(() => {
    saveState(state);
  }, [state]);
  useEffect(() => {
    saveApprofondi(approfondi);
  }, [approfondi]);

  const start = useCallback((mode: Mode) => setState((s) => ({ ...s, mode })), []);
  const answer = useCallback(
    (questionId: string, value: UserAnswer) =>
      setState((s) => ({ ...s, answers: { ...s.answers, [questionId]: value } })),
    [],
  );
  const reset = useCallback(() => {
    clearState();
    setState({ mode: null, answers: {} });
  }, []);
  const answerApprofondi = useCallback(
    (categorie: string, questionId: string, value: UserAnswer) =>
      setApprofondi((s) => ({ ...s, [categorie]: { ...s[categorie], [questionId]: value } })),
    [],
  );
  const resetCategorie = useCallback(
    (categorie: string) =>
      setApprofondi((s) => Object.fromEntries(Object.entries(s).filter(([c]) => c !== categorie))),
    [],
  );

  const value = useMemo<QuizState>(
    () => ({
      mode: state.mode,
      answers: state.answers,
      parcours: state.mode === 'rapide' ? quickQuestions : data.questions,
      start,
      answer,
      reset,
      approfondi,
      answerApprofondi,
      resetCategorie,
    }),
    [state, start, answer, reset, approfondi, answerApprofondi, resetCategorie],
  );
  return <QuizContext.Provider value={value}>{children}</QuizContext.Provider>;
}
