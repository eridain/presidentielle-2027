import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ouiEnPremier } from '../lib/questions';
import type { Question, UserAnswer } from '../types';
import { EnClair } from './EnClair';
import { ExtLink } from './ExtLink';
import { PageTitle } from './PageTitle';
import { Reveal } from './Reveal';

const CHOICES: { value: UserAnswer; label: string }[] = [
  { value: 'oui', label: 'Oui' },
  { value: 'non', label: 'Non' },
  { value: 'passe', label: 'Passer' },
];

export interface QuestionViewProps {
  question: Question;
  /** Questions du parcours en cours (progression, précédente / suivante). */
  parcours: readonly Question[];
  /** Réponses connues (compteur « n répondues »). */
  answers: Readonly<Record<string, UserAnswer>>;
  onAnswer: (value: UserAnswer) => void;
  questionHref: (id: string) => string;
  resultsHref: string;
  /** Lien de la première question vers l'amont (accueil, catégorie). */
  startHref: string;
  startLabel: string;
  /** Ligne au-dessus du titre : thème (parcours principal) ou catégorie (mode approfondi). */
  surtitre: string;
  /** Liste de référence pour l'alternance des camps « En clair ». */
  ordreEnClair: readonly Pick<Question, 'id'>[];
  /** Mentions propres au parcours (portée du scrutin, question commune…), sous la question. */
  mentions?: ReactNode;
  /** Précision affichée dans la révélation, avant le résultat du scrutin. */
  noteRevelation?: ReactNode;
}

/**
 * Une question : formulation (« En clair » si disponible), contexte, réponse Oui / Non / Passer, puis révélation du
 * vote. Même expérience dans le parcours principal et dans le mode approfondi.
 */
export function QuestionView({
  question: q,
  parcours,
  answers,
  onAnswer,
  questionHref,
  resultsHref,
  startHref,
  startLabel,
  surtitre,
  ordreEnClair,
  mentions,
  noteRevelation,
}: QuestionViewProps) {
  const revealRef = useRef<HTMLHeadingElement>(null);
  // Compteur de réponses données sur cette page : après chaque réponse, le focus passe à la révélation.
  const [answerCount, setAnswerCount] = useState(0);

  useEffect(() => {
    if (answerCount === 0) return;
    revealRef.current?.focus({ preventScroll: true });
    // Défilement jusqu'au début de la révélation (rappel de la question compris).
    (revealRef.current?.closest('section') ?? revealRef.current)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [answerCount]);

  const index = parcours.findIndex((x) => x.id === q.id);
  const prev = parcours[index - 1];
  const next = parcours[index + 1];
  const current = answers[q.id];
  // Version « En clair » (facultative) : sans elle, affichage d'origine.
  const e = q.enClair;
  const answeredCount = parcours.filter((x) => answers[x.id]).length;

  const choose = (value: UserAnswer) => {
    onAnswer(value);
    setAnswerCount((n) => n + 1);
  };

  return (
    <article className="question">
      <div className="question__main">
      <div className="progress">
        <p className="progress__label">
          Question {index + 1} sur {parcours.length}
          <span className="muted"> · {answeredCount} répondue{answeredCount > 1 ? 's' : ''}</span>
        </p>
        <progress max={parcours.length} value={index + 1} aria-label={`Question ${index + 1} sur ${parcours.length}`} />
      </div>

      <p className="theme">{surtitre}</p>
      {e ? (
        <>
          <p className="question__titre">{q.titre}</p>
          <PageTitle title={q.titre} focusKey={q.id} className="question__simple">
            {e.questionSimple}
          </PageTitle>
          <p className="question__full">
            <span className="label">Formulation complète&nbsp;:</span> {q.question}
          </p>
          {mentions}
          <EnClair id={q.id} enClair={e} ouiEnPremier={ouiEnPremier(ordreEnClair, q.id)} />
        </>
      ) : (
        <>
          <PageTitle title={q.titre} focusKey={q.id} />
          {/* titre de secours = la question elle-même (mode approfondi sans recherche) : pas de répétition */}
          {q.question !== q.titre && <p className="question__text">{q.question}</p>}
          {mentions}
        </>
      )}

      <details className="context">
        <summary>{e ? 'Le texte en détail (sources)' : 'Contexte et sources'}</summary>
        {q.contexte ? <p>{q.contexte}</p> : <p className="muted">Contexte détaillé en cours de documentation.</p>}
        <p className="small">
          <span className="label">Texte voté&nbsp;:</span> {q.scrutin.titre}
        </p>
        {q.contexteSources.length > 0 && (
          <ul className="small">
            {q.contexteSources.map((s) => (
              <li key={s.url}>
                <ExtLink href={s.url}>{s.titre}</ExtLink>
              </li>
            ))}
          </ul>
        )}
      </details>

      <div className="answer" role="group" aria-label="Votre réponse">
        {CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            className={`answer__btn answer__btn--${c.value}`}
            aria-pressed={current === c.value}
            onClick={() => choose(c.value)}
          >
            {current === c.value && <span aria-hidden="true">✓ </span>}
            {c.label}
          </button>
        ))}
      </div>
      {current && current !== 'passe' && (
        <p className="muted small answer__hint">Vous pouvez changer de réponse à tout moment.</p>
      )}
      </div>

      {current && <Reveal ref={revealRef} question={q} answer={current} note={noteRevelation} />}

      <nav className="qnav" aria-label="Navigation entre les questions">
        {prev ? (
          <a className="btn" href={questionHref(prev.id)}>
            ← Précédente
          </a>
        ) : (
          <a className="btn" href={startHref}>
            ← {startLabel}
          </a>
        )}
        {next ? (
          <a className={`btn${current ? ' btn--primary' : ''}`} href={questionHref(next.id)}>
            {current ? 'Question suivante →' : 'Passer à la suivante →'}
          </a>
        ) : (
          <a className="btn btn--primary" href={resultsHref}>
            Voir mes résultats →
          </a>
        )}
      </nav>
    </article>
  );
}
