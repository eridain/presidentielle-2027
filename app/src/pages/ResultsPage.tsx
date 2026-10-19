import { useMemo, useState } from 'react';
import { PageTitle } from '../components/PageTitle';
import { Ranking, ShareBox, VotesToggle } from '../components/Ranking';
import { approfondiHref, categories } from '../lib/approfondi';
import { candidatsById, data } from '../lib/data';
import { formatPercent, plural } from '../lib/format';
import { candidatHref, href, navigate } from '../lib/router';
import { collator, isRealVote, rankCandidates, scoreByTheme, type Answers } from '../lib/scoring';
import { decodeAnswers, encodeAnswers } from '../lib/share';
import { EVIDENCE_WEIGHTS } from '../lib/weights';
import { useQuiz } from '../state/useQuiz';

const questionHref = (id: string) => href(`/question/${id}`);

export function ResultsPage({ shared }: { shared: string | null }) {
  const quiz = useQuiz();
  const [votesSeulement, setVotesSeulement] = useState(false);
  const sharedAnswers = useMemo(() => decodeAnswers(data.questions, shared), [shared]);
  const isShared = shared !== null;
  const answers: Answers = useMemo(
    () => (isShared ? (sharedAnswers ?? {}) : quiz.answers),
    [isShared, sharedAnswers, quiz.answers],
  );
  const answered = data.questions.filter((q) => answers[q.id]);
  const expressed = answered.filter((q) => answers[q.id] !== 'passe');

  const { classes, insuffisants } = useMemo(
    () => rankCandidates(data, data.questions, answers, { votesSeulement }),
    [answers, votesSeulement],
  );
  const sansVote = data.candidats
    .filter((c) => expressed.every((q) => !isRealVote(q.candidats[c.id]?.evidence ?? 'inconnu')))
    .sort((a, b) => collator.compare(a.tri, b.tri))
    .map((c) => c.nom);
  const remaining = quiz.mode === 'rapide' ? data.questions.filter((q) => !answers[q.id]) : [];

  if (expressed.length === 0) {
    return (
      <div>
        <PageTitle title={isShared ? 'Résultats partagés' : 'Vos résultats'} />
        <p>
          {isShared
            ? 'Ce lien ne contient aucune réponse exploitable.'
            : 'Vous n’avez encore répondu Oui ou Non à aucune question.'}
        </p>
        <p>
          <a className="btn btn--primary" href={href('/')}>
            Commencer le quiz
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="results">
      <PageTitle title={isShared ? 'Résultats partagés' : 'Vos résultats'} />
      {isShared && (
        <p className="card note">
          Ces résultats proviennent d’un lien partagé&nbsp;: les réponses sont lues dans l’adresse de la page. Vos propres
          réponses ne sont pas modifiées. <a href={href('/')}>Faire le quiz moi-même</a>.
        </p>
      )}
      <p className="lead">
        {plural(expressed.length, 'réponse')} Oui/Non
        {answered.length > expressed.length ? `, ${plural(answered.length - expressed.length, 'question passée', 'questions passées')}` : ''}. Taux
        d’accord pondéré par la nature de la preuve.
      </p>

      <VotesToggle checked={votesSeulement} onChange={setVotesSeulement} />

      <Ranking classes={classes} insuffisants={insuffisants} themes={data.themes} questionHref={questionHref} />

      <section aria-labelledby="themes-title">
        <h2 id="themes-title">Répartition par thème</h2>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- zone défilante horizontalement : doit être atteignable au clavier */}
        <div className="table-scroll" role="region" aria-labelledby="themes-title" tabIndex={0}>
          <table className="matrix">
            <caption className="sr-only">Taux d’accord par candidat et par thème</caption>
            <thead>
              <tr>
                <th scope="col">Candidat</th>
                {data.themes
                  .filter((t) => expressed.some((q) => q.theme === t))
                  .map((t) => (
                    <th scope="col" key={t}>
                      {t}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {[...classes, ...insuffisants].map((s) => {
                const byTheme = new Map(scoreByTheme(s, data.themes).map((t) => [t.theme, t]));
                return (
                  <tr key={s.candidatId}>
                    <th scope="row">
                      <a href={candidatHref(s.candidatId)}>{candidatsById.get(s.candidatId)?.nom}</a>
                    </th>
                    {data.themes
                      .filter((t) => expressed.some((q) => q.theme === t))
                      .map((t) => {
                        const v = byTheme.get(t);
                        return (
                          <td key={t} data-level={v?.score == null ? 'none' : Math.round(v.score * 4)}>
                            {v?.score == null ? '—' : formatPercent(v.score)}
                          </td>
                        );
                      })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card limits" aria-labelledby="limits-title">
        <h2 id="limits-title">Limites à garder en tête</h2>
        <ul>
          <li>
            Le score ne porte que sur ces questions et sur vos réponses&nbsp;: ce n’est ni un programme, ni une consigne de
            vote.
          </li>
          <li>
            Un <strong>proxy</strong> est le vote majoritaire du groupe parlementaire du parti du candidat (aux seules dates
            où il y était rattaché), pas son vote personnel&nbsp;: il ne compte que pour {String(EVIDENCE_WEIGHTS.groupe).replace('.', ',')} d’un vote nominatif.
          </li>
          <li>
            Un député absent lors d’un scrutin n’a pas de position&nbsp;: la question est exclue de la comparaison pour lui.
          </li>
          <li>
            Sur les fiches des questions, «&nbsp;Ses raisons&nbsp;» rapporte les propos du candidat&nbsp;; «&nbsp;Argument de son
            groupe&nbsp;» rapporte ceux d’un autre député de son groupe, nommé, faute de prise de parole personnelle retrouvée.
          </li>
          {sansVote.length > 0 && (
            <li>
              Aucun vote nominatif sur les questions que vous avez tranchées pour&nbsp;: {sansVote.join(', ')}. Leurs scores
              reposent sur des rôles au gouvernement, des déclarations ou des proxies.
            </li>
          )}
          <li>
            Les positions ont pu évoluer depuis le vote. <a href={href('/methodologie')}>Méthodologie complète</a>.
          </li>
        </ul>
      </section>

      {!isShared && (
        <ShareBox
          url={`${window.location.origin}${window.location.pathname}#/resultats?r=${encodeAnswers(data.questions, answers)}`}
          explication={'Vos réponses sont encodées dans le lien lui-même (une lettre par question)\u00a0: rien n’est envoyé à un serveur.'}
        />
      )}

      <div className="actions">
        {!isShared && remaining.length > 0 && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              quiz.start('complet');
              const first = remaining[0];
              if (first) navigate(`/question/${first.id}`);
            }}
          >
            Affiner&nbsp;: répondre aux {remaining.length} autres questions
          </button>
        )}
        {categories.length > 0 && (
          <a className="btn" href={approfondiHref()}>
            Pour aller plus loin&nbsp;: approfondir par catégorie
          </a>
        )}
        {!isShared && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (window.confirm('Effacer toutes vos réponses et recommencer\u00a0?')) {
                quiz.reset();
                navigate('/');
              }
            }}
          >
            Recommencer à zéro
          </button>
        )}
      </div>
    </div>
  );
}
