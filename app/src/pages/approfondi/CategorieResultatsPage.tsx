import { useMemo, useState } from 'react';
import { PageTitle } from '../../components/PageTitle';
import { Ranking, ShareBox, VotesToggle } from '../../components/Ranking';
import {
  approfondiHref,
  categorieHref,
  categorieQuestionHref,
  porteeDe,
  reponsesCategorie,
  useCategorie,
} from '../../lib/approfondi';
import { PORTEE_COURT } from '../../lib/portee';
import { data } from '../../lib/data';
import { plural } from '../../lib/format';
import { href } from '../../lib/router';
import { collator, isRealVote, rankCandidates, type Answers } from '../../lib/scoring';
import { decodeCategorie, encodeCategorie } from '../../lib/share';
import { EVIDENCE_WEIGHTS } from '../../lib/weights';
import type { CategorieIndex, Question } from '../../types';
import { useQuiz } from '../../state/useQuiz';
import { Chargement } from './Chargement';

const AUCUNE: readonly Question[] = [];

/**
 * Restitution d'une catégorie (#/approfondi/<id>/resultats, ou ?r=…&k=… pour un lien partagé) : mêmes règles de score,
 * de pondération, de couverture et de seuil que le parcours principal, sur les seules questions de la catégorie.
 */
export function CategorieResultatsPage({ categorie: c, params }: { categorie: CategorieIndex; params: URLSearchParams }) {
  const quiz = useQuiz();
  const state = useCategorie(c);
  const [votesSeulement, setVotesSeulement] = useState(false);
  const code = params.get('r');
  const cle = params.get('k');
  const isShared = code !== null;
  const questions = state.status === 'ready' ? state.questions : AUCUNE;
  const partage = useMemo(() => (isShared ? decodeCategorie(questions, code, cle) : null), [isShared, questions, code, cle]);
  const propres = quiz.approfondi[c.id];
  const answers: Answers = useMemo(
    () => (partage ? (partage.answers ?? {}) : reponsesCategorie(c, quiz.answers, propres)),
    [partage, c, quiz.answers, propres],
  );
  const { classes, insuffisants } = useMemo(
    () => rankCandidates(data, questions, answers, { votesSeulement }),
    [questions, answers, votesSeulement],
  );
  const titre = `${isShared ? 'Résultats partagés' : 'Vos résultats'} — ${c.libelle}`;
  if (state.status !== 'ready')
    return (
      <div className="results">
        <PageTitle title={titre} />
        <Chargement state={state} />
      </div>
    );

  const answered = questions.filter((q) => answers[q.id]);
  const expressed = answered.filter((q) => answers[q.id] !== 'passe');
  const sansVote = data.candidats
    .filter((cand) => expressed.every((q) => !isRealVote(q.candidats[cand.id]?.evidence ?? 'inconnu')))
    .sort((a, b) => collator.compare(a.tri, b.tri))
    .map((cand) => cand.nom);
  const restantes = isShared ? [] : questions.filter((q) => !answers[q.id]);
  const ciblees = c.questions.some((r) => r.portee === 'article' || r.portee === 'amendement');

  if (expressed.length === 0) {
    return (
      <div className="results">
        <PageTitle title={titre} />
        {partage?.perime ? (
          <p className="card note">
            Ce lien a été créé pour une version précédente des questions de cette catégorie&nbsp;: les réponses ne peuvent
            plus être relues sans risque de les attribuer aux mauvaises questions.
          </p>
        ) : (
          <p>
            {isShared
              ? 'Ce lien ne contient aucune réponse exploitable.'
              : 'Vous n’avez encore répondu Oui ou Non à aucune question de cette catégorie.'}
          </p>
        )}
        <p>
          <a className="btn btn--primary" href={categorieHref(c.id)}>
            {isShared ? 'Répondre moi-même à cette catégorie' : 'Aller à la catégorie'}
          </a>
        </p>
      </div>
    );
  }

  const { r, k } = encodeCategorie(questions, answers);
  return (
    <div className="results">
      <p className="theme">Approfondir par catégorie</p>
      <PageTitle title={titre} />
      {isShared && (
        <p className="card note">
          Ces résultats proviennent d’un lien partagé&nbsp;: les réponses sont lues dans l’adresse de la page. Vos propres
          réponses ne sont pas modifiées. <a href={categorieHref(c.id)}>Répondre moi-même à cette catégorie</a>.
        </p>
      )}
      <p className="lead">
        {plural(expressed.length, 'réponse')} Oui/Non sur les {questions.length} questions de la catégorie
        {answered.length > expressed.length ? `, ${plural(answered.length - expressed.length, 'question passée', 'questions passées')}` : ''}. Taux
        d’accord pondéré par la nature de la preuve, avec les mêmes règles que le parcours principal.
      </p>

      <VotesToggle checked={votesSeulement} onChange={setVotesSeulement} />

      <Ranking
        classes={classes}
        insuffisants={insuffisants}
        themes={[]}
        questionHref={(id) => categorieQuestionHref(c.id, id)}
        precision={(q) => PORTEE_COURT[porteeDe(c, q.id)]}
      />

      <section className="card limits" aria-labelledby="limits-title">
        <h2 id="limits-title">Limites à garder en tête</h2>
        <ul>
          <li>
            Le score ne porte que sur les questions de cette catégorie et sur vos réponses&nbsp;: il peut différer de votre
            résultat sur le parcours principal, et ce n’est ni un programme, ni une consigne de vote.
          </li>
          {ciblees && (
            <li>
              Certains scrutins portent sur un <strong>article</strong> ou un <strong>amendement</strong>, pas sur le texte
              entier&nbsp;: le vote sur une disposition ne résume pas la position sur l’ensemble du texte.
            </li>
          )}
          <li>
            Un <strong>proxy</strong> est le vote majoritaire du groupe parlementaire du parti du candidat (aux seules dates
            où il y était rattaché), pas son vote personnel&nbsp;: il ne compte que pour {String(EVIDENCE_WEIGHTS.groupe).replace('.', ',')} d’un vote nominatif.
          </li>
          <li>
            Un député absent lors d’un scrutin n’a pas de position&nbsp;: la question est exclue de la comparaison pour lui.
          </li>
          {sansVote.length > 0 && (
            <li>
              Aucun vote nominatif sur les questions que vous avez tranchées pour&nbsp;: {sansVote.join(', ')}. Leurs scores
              reposent sur des rôles au gouvernement, des déclarations ou des proxies.
            </li>
          )}
          <li>
            Les positions ont pu évoluer depuis le vote. <a href={href('/methodologie?section=approfondi')}>Méthodologie du mode approfondi</a>.
          </li>
        </ul>
      </section>

      {!isShared && (
        <ShareBox
          url={`${window.location.origin}${window.location.pathname}#/approfondi/${c.id}/resultats?r=${r}&k=${k}`}
          explication={'Vos réponses à cette catégorie sont encodées dans le lien lui-même (une lettre par question)\u00a0: rien n’est envoyé à un serveur.'}
        />
      )}

      <div className="actions">
        {restantes[0] && (
          <a className="btn btn--primary" href={categorieQuestionHref(c.id, restantes[0].id)}>
            Affiner&nbsp;: répondre aux {restantes.length} autres questions
          </a>
        )}
        <a className="btn" href={approfondiHref()}>
          Choisir une autre catégorie
        </a>
        <a className="btn" href={href('/resultats')}>
          Résultats du parcours principal
        </a>
      </div>
    </div>
  );
}
