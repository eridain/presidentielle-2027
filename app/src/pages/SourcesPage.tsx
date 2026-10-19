import { useEffect, useMemo, useRef, useState } from 'react';
import { ExtLink } from '../components/ExtLink';
import { PageTitle } from '../components/PageTitle';
import { categories, categorieQuestionHref, loadCategorie } from '../lib/approfondi';
import { candidatsById, data } from '../lib/data';
import { candidatHref, href } from '../lib/router';
import { collectSources, sourcesDesQuestions, type QuestionSources } from '../lib/sources';

/**
 * Sources des questions propres au mode approfondi : elles sont dans les fichiers des catégories, chargés seulement à
 * la demande (les questions reprises du parcours principal sont déjà listées plus haut).
 */
function SourcesApprofondi() {
  const [etat, setEtat] = useState<'repos' | 'chargement' | 'erreur' | { id: string; libelle: string; questions: QuestionSources[] }[]>('repos');
  const nouvelles = categories.reduce((n, c) => n + c.questions.filter((r) => !r.existant).length, 0);
  // le bouton disparaît une fois les sources chargées : le focus passe au premier titre de catégorie
  const premier = useRef<HTMLHeadingElement>(null);
  const charge = typeof etat !== 'string';
  useEffect(() => {
    if (charge) premier.current?.focus();
  }, [charge]);
  const charger = () => {
    setEtat('chargement');
    Promise.all(
      categories.map(async (c) => {
        const ids = new Set(c.questions.filter((r) => !r.existant).map((r) => r.id));
        const questions = (await loadCategorie(c)).filter((q) => ids.has(q.id));
        return { id: c.id, libelle: c.libelle, questions: sourcesDesQuestions(questions, data.candidats) };
      }),
    ).then(setEtat, () => setEtat('erreur'));
  };
  return (
    <section aria-labelledby="src-approfondi" className="sources">
      <h2 id="src-approfondi">Mode «&nbsp;Approfondir par catégorie&nbsp;»</h2>
      {typeof etat === 'string' ? (
        <>
          <p className="small">
            Les sources des {nouvelles} questions propres aux catégories sont chargées à la demande.
          </p>
          <p>
            <button type="button" className="btn" onClick={charger} disabled={etat === 'chargement'}>
              {etat === 'chargement' ? 'Chargement…' : 'Afficher ces sources'}
            </button>
          </p>
          {etat === 'erreur' && <p role="alert">Le chargement a échoué&nbsp;; vous pouvez réessayer.</p>}
        </>
      ) : (
        etat.map((c, i) => (
          <section key={c.id} aria-labelledby={`src-cat-${c.id}`}>
            <h3 id={`src-cat-${c.id}`} ref={i === 0 ? premier : undefined} tabIndex={i === 0 ? -1 : undefined}>
              {c.libelle}
            </h3>
            {c.questions.map((q) => (
              <div key={q.questionId}>
                <h4>
                  <a href={categorieQuestionHref(c.id, q.questionId)}>{q.titre}</a>
                </h4>
                <ul>
                  {q.sources.map((s) => (
                    <li key={s.url}>
                      <ExtLink href={s.url}>{s.url}</ExtLink>
                      <span className="muted small"> — {s.libelles.join('\u00a0; ')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}
    </section>
  );
}

export function SourcesPage() {
  const { parQuestion, parParti, total } = useMemo(() => collectSources(data), []);
  return (
    <div className="prose">
      <PageTitle title="Sources" />
      <p className="lead">
        {total} adresses distinctes sont citées dans le site{categories.length > 0 ? ' (hors questions propres au mode approfondi, en fin de page)' : ''}. Données de vote&nbsp;:{' '}
        <ExtLink href="https://data.assemblee-nationale.fr">open data de l’Assemblée nationale</ExtLink>.
      </p>
      {parQuestion.map((q) => (
        <section key={q.questionId} aria-labelledby={`src-${q.questionId}`} className="sources">
          <h2 id={`src-${q.questionId}`}>
            <a href={href(`/question/${q.questionId}`)}>{q.titre}</a>
          </h2>
          <ul>
            {q.sources.map((s) => (
              <li key={s.url}>
                <ExtLink href={s.url}>{s.url}</ExtLink>
                <span className="muted small"> — {s.libelles.join('\u00a0; ')}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {parParti.map((p) => (
        <section key={p.partiId} aria-labelledby={`src-parti-${p.partiId}`} className="sources">
          <h2 id={`src-parti-${p.partiId}`}>Parti&nbsp;: {p.nom}</h2>
          <p className="small">
            Fiche{p.candidats.length > 1 ? 's' : ''}&nbsp;:{' '}
            {p.candidats.map((id, i) => (
              <span key={id}>
                {i > 0 && ', '}
                <a href={candidatHref(id)}>{candidatsById.get(id)?.nom ?? id}</a>
              </span>
            ))}
          </p>
          <ul>
            {p.sources.map((s) => (
              <li key={s.url}>
                <ExtLink href={s.url}>{s.url}</ExtLink>
                <span className="muted small"> — {s.libelles.join('\u00a0; ')}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {categories.length > 0 && <SourcesApprofondi />}
    </div>
  );
}
