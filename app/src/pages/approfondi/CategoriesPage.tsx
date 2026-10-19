import { PageTitle } from '../../components/PageTitle';
import {
  categories,
  categorieHref,
  categorieQuestionHref,
  categorieResultatsHref,
  reponsesCategorie,
} from '../../lib/approfondi';
import { dureeMinutes } from '../../lib/categories';
import { plural } from '../../lib/format';
import { href } from '../../lib/router';
import { useQuiz } from '../../state/useQuiz';

/** Choix d'une catégorie (#/approfondi). */
export function CategoriesPage() {
  const quiz = useQuiz();
  return (
    <div className="prose appro">
      <PageTitle title="Approfondir par catégorie" />
      <p className="lead">
        Pour aller plus loin que les deux parcours&nbsp;: choisissez un thème et répondez à une vingtaine de questions sur
        ce seul sujet. Même principe — vous répondez, vous découvrez les votes réels et les arguments, puis un classement
        des candidats propre à la catégorie.
      </p>
      <ul className="appro-notes-liste small muted">
        <li>
          Certains scrutins portent sur un <strong>article</strong> ou un <strong>amendement</strong> plutôt que sur un texte
          entier&nbsp;: c’est indiqué sur chaque question.
        </li>
        <li>
          Les questions déjà posées dans le parcours principal sont reprises avec votre réponse, s’il y en a une.
        </li>
        <li>
          Vous pouvez faire plusieurs catégories&nbsp;: vos réponses restent dans votre navigateur.{' '}
          <a href={href('/methodologie?section=approfondi')}>Comment les questions sont choisies</a>.
        </li>
      </ul>

      <ul className="categories">
        {categories.map((c) => {
          const answers = reponsesCategorie(c, quiz.answers, quiz.approfondi[c.id]);
          const repondues = c.questions.filter((r) => answers[r.id]).length;
          const exprimees = c.questions.filter((r) => answers[r.id] === 'oui' || answers[r.id] === 'non').length;
          const prochaine = c.questions.find((r) => !answers[r.id]) ?? c.questions[0];
          const existantes = c.questions.filter((r) => r.existant).length;
          const ciblees = c.questions.filter((r) => r.portee === 'article' || r.portee === 'amendement').length;
          const titreId = `cat-${c.id}`;
          return (
            <li key={c.id} className="categorie card">
              <h2 id={titreId} className="categorie__titre">
                <a href={categorieHref(c.id)}>{c.libelle}</a>
              </h2>
              <p className="categorie__meta">
                {plural(c.questions.length, 'question')} · environ {plural(dureeMinutes(c.questions.length), 'minute')}
              </p>
              <p className="small muted categorie__detail">
                {existantes > 0 ? `dont ${String(existantes)} du parcours principal` : 'aucune question du parcours principal'}
                {ciblees > 0 ? ` · ${plural(ciblees, 'vote sur un article ou un amendement', 'votes sur un article ou un amendement')}` : ''}
              </p>
              {repondues > 0 && (
                <div className="categorie__progress">
                  <p className="small">
                    Vous avez répondu à {repondues} question{repondues > 1 ? 's' : ''} sur {c.questions.length}.
                  </p>
                  <progress max={c.questions.length} value={repondues} aria-label={`${c.libelle}\u00a0: ${String(repondues)} sur ${String(c.questions.length)}`} />
                </div>
              )}
              <div className="actions categorie__actions">
                {prochaine && repondues < c.questions.length && (
                  <a className="btn btn--primary" href={categorieQuestionHref(c.id, prochaine.id)}>
                    {repondues > 0 ? 'Reprendre' : 'Commencer'}
                    <span className="sr-only"> la catégorie {c.libelle}</span>
                  </a>
                )}
                {exprimees > 0 && (
                  <a className="btn" href={categorieResultatsHref(c.id)}>
                    Mes résultats<span className="sr-only"> pour {c.libelle}</span>
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p>
        <a href={href('/')}>← Retour aux parcours rapide et complet</a>
      </p>
    </div>
  );
}
