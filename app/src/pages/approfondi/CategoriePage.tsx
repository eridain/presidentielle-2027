import { useEffect, useRef, useState } from 'react';
import { PageTitle } from '../../components/PageTitle';
import {
  approfondiHref,
  categorieQuestionHref,
  categorieResultatsHref,
  reponsesCategorie,
  useCategorie,
} from '../../lib/approfondi';
import { dureeMinutes } from '../../lib/categories';
import { PORTEE_COURT } from '../../lib/portee';
import { ANSWER_LABEL, plural } from '../../lib/format';
import type { CategorieIndex } from '../../types';
import { useQuiz } from '../../state/useQuiz';
import { Chargement } from './Chargement';

/** Présentation d'une catégorie (#/approfondi/<id>) : progression, liste des questions, effacement. */
export function CategoriePage({ categorie: c }: { categorie: CategorieIndex }) {
  const quiz = useQuiz();
  const state = useCategorie(c);
  const answers = reponsesCategorie(c, quiz.answers, quiz.approfondi[c.id]);
  const repondues = c.questions.filter((r) => answers[r.id]).length;
  const exprimees = c.questions.filter((r) => answers[r.id] === 'oui' || answers[r.id] === 'non').length;
  const prochaine = c.questions.find((r) => !answers[r.id]) ?? c.questions[0];
  const propres = c.questions.filter((r) => !r.existant && answers[r.id]).length;
  // après l'effacement, le bouton disparaît : le focus passe au message de confirmation
  const [efface, setEfface] = useState(false);
  const confirmation = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (efface) confirmation.current?.focus();
  }, [efface]);

  return (
    <div className="prose appro">
      <p className="theme">Approfondir par catégorie</p>
      <PageTitle title={c.libelle} />
      <p className="lead">
        {plural(c.questions.length, 'question')} · environ {plural(dureeMinutes(c.questions.length), 'minute')}.{' '}
        {repondues > 0
          ? `Vous avez répondu à ${String(repondues)} question${repondues > 1 ? 's' : ''} sur ${String(c.questions.length)}.`
          : 'Vous n’avez pas encore répondu à ces questions.'}
      </p>
      <div className="actions">
        {prochaine && repondues < c.questions.length && (
          <a className="btn btn--primary" href={categorieQuestionHref(c.id, prochaine.id)}>
            {repondues > 0 ? 'Reprendre' : 'Commencer'}
          </a>
        )}
        {exprimees > 0 && (
          <a className="btn" href={categorieResultatsHref(c.id)}>
            Mes résultats pour cette catégorie
          </a>
        )}
        <a className="btn" href={approfondiHref()}>
          Autres catégories
        </a>
      </div>

      <h2>Les questions</h2>
      {state.status !== 'ready' ? (
        <Chargement state={state} />
      ) : (
        <ol className="appro-liste">
          {state.questions.map((q) => {
            const ref = c.questions.find((r) => r.id === q.id);
            const portee = ref ? PORTEE_COURT[ref.portee] : null;
            const a = answers[q.id];
            return (
              <li key={q.id}>
                <a href={categorieQuestionHref(c.id, q.id)}>{q.enClair?.questionSimple ?? q.titre}</a>
                <span className="small muted appro-liste__meta">
                  {' '}
                  — {q.scrutin.date.slice(0, 4)}
                  {portee ? ` · ${portee}` : ''}
                  {ref?.existant ? ' · aussi dans le parcours principal' : ''}
                  {a ? ` · votre réponse\u00a0: ${ANSWER_LABEL[a]}` : ''}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {propres > 0 && (
        <div className="appro-effacer">
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (window.confirm(`Effacer vos réponses aux questions de la catégorie «\u00a0${c.libelle}\u00a0»\u00a0?`)) {
                quiz.resetCategorie(c.id);
                setEfface(true);
              }
            }}
          >
            Effacer mes réponses de cette catégorie
          </button>
          <p className="small muted">Les questions communes au parcours principal gardent leur réponse.</p>
        </div>
      )}
      <p role="status" ref={confirmation} tabIndex={-1} className="small">
        {efface && propres === 0 ? 'Vos réponses aux questions propres à cette catégorie ont été effacées.' : ''}
      </p>
    </div>
  );
}
