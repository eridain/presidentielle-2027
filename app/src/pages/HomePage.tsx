import { PageTitle } from '../components/PageTitle';
import { approfondiHref, categories } from '../lib/approfondi';
import { dureeMinutes } from '../lib/categories';
import { data, periode, quickQuestions } from '../lib/data';
import { candidatHref, href, navigate } from '../lib/router';
import { collator } from '../lib/scoring';
import type { Mode } from '../lib/storage';
import { useQuiz } from '../state/useQuiz';

/** « 20 à 24 », ou « 22 » si toutes les valeurs sont égales. */
function fourchette(valeurs: readonly number[]): string {
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  return min === max ? String(min) : `${String(min)} à ${String(max)}`;
}

/** Les trois premières catégories, initiale en minuscule (« économie & travail, fiscalité & budget… »). */
const apercu =
  categories
    .slice(0, 3)
    .map((c) => c.libelle.charAt(0).toLocaleLowerCase('fr') + c.libelle.slice(1))
    .join(', ') + (categories.length > 3 ? '…' : '');

export function HomePage() {
  const { start, answers, parcours, mode } = useQuiz();
  const answeredInParcours = parcours.filter((q) => answers[q.id]).length;
  const totalAnswered = data.questions.filter((q) => answers[q.id]).length;
  const candidats = [...data.candidats].sort((a, b) => collator.compare(a.tri, b.tri));

  const go = (m: Mode) => {
    start(m);
    const list = m === 'rapide' ? quickQuestions : data.questions;
    const next = list.find((q) => !answers[q.id]) ?? list[0];
    if (next) navigate(`/question/${next.id}`);
  };

  const resume = parcours.find((q) => !answers[q.id]);

  return (
    <div className="home">
      <PageTitle title="Accueil">
        Présidentielle 2027&nbsp;: <span className="nowrap">vos choix</span> face aux <span className="nowrap">votes réels</span>
      </PageTitle>
      <p className="lead">
        Les actes, pas les promesses. Répondez à des questions tranchées par le Parlement entre {periode.debut} et{' '}
        {periode.fin}, puis découvrez comment chaque candidat a réellement voté — et pourquoi.
      </p>

      <ol className="steps">
        <li>
          <strong>Vous répondez</strong> Oui ou Non (ou passez) à une question qui a fait l’objet d’un vote.
        </li>
        <li>
          <strong>Vous découvrez</strong> le résultat du scrutin, la position de chaque candidat avec sa preuve (vote
          nominatif, déclaration…), ses arguments et ceux du camp opposé.
        </li>
        <li>
          <strong>Vous comparez</strong>&nbsp;: taux d’accord avec chaque candidat, nombre de questions comparables et part
          fondée sur des votes réels.
        </li>
      </ol>

      {totalAnswered > 0 && mode && (
        <div className="resume card">
          <p>
            Vous avez déjà répondu à {answeredInParcours} question{answeredInParcours > 1 ? 's' : ''} sur {parcours.length}{' '}
            (mode {mode}).
          </p>
          <div className="actions">
            {resume && (
              <a className="btn btn--primary" href={href(`/question/${resume.id}`)}>
                Reprendre
              </a>
            )}
            <a className="btn" href={href('/resultats')}>
              Voir mes résultats
            </a>
          </div>
        </div>
      )}

      <h2>Choisissez votre parcours</h2>
      <div className="modes">
        <button type="button" className="mode" onClick={() => go('rapide')}>
          <span className="mode__title">Mode rapide</span>
          <span className="mode__desc">
            {quickQuestions.length} questions, au moins une par thème · environ 5 minutes
          </span>
        </button>
        <button type="button" className="mode" onClick={() => go('complet')}>
          <span className="mode__title">Mode complet</span>
          <span className="mode__desc">Les {data.questions.length} questions · environ 15 minutes</span>
        </button>
        {categories.length > 0 && (
          <a className="mode mode--plus" href={approfondiHref()}>
            <span className="mode__kicker">Pour aller plus loin</span>
            <span className="mode__title">Approfondir par catégorie</span>
            <span className="mode__desc">
              {categories.length} catégories ({apercu}), {fourchette(categories.map((c) => c.questions.length))} questions
              chacune · environ {fourchette(categories.map((c) => dureeMinutes(c.questions.length)))} minutes par catégorie
            </span>
          </a>
        )}
      </div>

      <h2>Les {candidats.length} candidats comparés</h2>
      <p className="muted small">
        Par ordre alphabétique. Biographie, parti, positions et condamnations en justice&nbsp;:{' '}
        <a href={href('/candidats')}>Partis &amp; candidats</a>.
      </p>
      <ul className="cand-list">
        {candidats.map((c) => (
          <li key={c.id}>
            <strong>
              <a href={candidatHref(c.id)}>{c.nom}</a>
            </strong>{' '}
            <span className="muted">— {c.parti}</span>
          </li>
        ))}
      </ul>

      <div className="card note">
        <p>
          <strong>À savoir.</strong> Tous les candidats n’ont pas siégé à l’Assemblée nationale sur la période&nbsp;: quand il
          n’existe pas de vote nominatif, la position s’appuie sur un vote au Sénat, au Congrès ou au Parlement européen,
          un rôle au gouvernement, une déclaration sourcée ou, à défaut, le vote du groupe de son parti (proxy, clairement
          signalé). <a href={href('/methodologie')}>Lire la méthodologie</a>.
        </p>
        <p>Vos réponses restent dans votre navigateur&nbsp;: aucun compte, aucun cookie, aucun traceur.</p>
      </div>
    </div>
  );
}
