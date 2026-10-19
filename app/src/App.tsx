import { lazy, Suspense, useEffect } from 'react';
import { data } from './lib/data';
import { LimiteChargement } from './components/LimiteChargement';
import { formatDate } from './lib/format';
import { href, useRoute } from './lib/router';
import { CandidatPage } from './pages/CandidatPage';
import { CandidatsPage } from './pages/CandidatsPage';
import { HomePage } from './pages/HomePage';
import { MentionsPage } from './pages/MentionsPage';
import { MethodologyPage } from './pages/MethodologyPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { QuestionPage } from './pages/QuestionPage';
import { ResultsPage } from './pages/ResultsPage';
import { SourcesPage } from './pages/SourcesPage';

// Mode « Approfondir par catégorie » : pages chargées à la demande (le parcours principal ne les télécharge pas).
const ApprofondiRoutes = lazy(() => import('./pages/approfondi/ApprofondiRoutes'));

function Page() {
  const { path, params } = useRoute();
  if (path === '/') return <HomePage />;
  const question = /^\/question\/([a-z0-9-]+)$/.exec(path);
  if (question?.[1]) return <QuestionPage key={question[1]} id={question[1]} />;
  if (path === '/resultats') return <ResultsPage shared={params.get('r')} />;
  if (path === '/candidats') return <CandidatsPage />;
  const candidat = /^\/candidat\/([a-z]+)$/.exec(path);
  if (candidat?.[1]) return <CandidatPage key={candidat[1]} id={candidat[1]} />;
  if (path === '/methodologie') return <MethodologyPage section={params.get('section')} />;
  if (path === '/sources') return <SourcesPage />;
  if (path === '/mentions') return <MentionsPage />;
  if (path === '/approfondi' || path.startsWith('/approfondi/'))
    return (
      <LimiteChargement>
        <Suspense
          fallback={
            <p className="muted chargement" role="status">
              Chargement…
            </p>
          }
        >
          <ApprofondiRoutes path={path} params={params} />
        </Suspense>
      </LimiteChargement>
    );
  return <NotFoundPage />;
}

export function App() {
  const { path } = useRoute();
  useEffect(() => {
    document.documentElement.lang = 'fr';
  }, []);
  const current = (p: string) => (path === p ? 'page' : undefined);
  // Page d'un candidat : la rubrique « Partis & candidats » reste signalée comme rubrique courante.
  const currentPartis = path === '/candidats' ? 'page' : path.startsWith('/candidat/') ? 'true' : undefined;
  return (
    <>
      <a className="skip" href="#contenu" onClick={(e) => {
        e.preventDefault();
        document.getElementById('contenu')?.focus();
      }}>
        Aller au contenu
      </a>
      <header className="site-header">
        <div className="wrap site-header__inner">
          <a className="brand" href={href('/')} aria-current={current('/')}>
            Vote réel <span className="brand__sub">présidentielle 2027</span>
          </a>
          <nav aria-label="Navigation principale">
            <ul className="nav">
              <li>
                <a href={href('/resultats')} aria-current={current('/resultats')}>
                  Résultats
                </a>
              </li>
              <li>
                <a href={href('/candidats')} aria-current={currentPartis}>
                  Partis &amp; candidats
                </a>
              </li>
              <li>
                <a href={href('/methodologie')} aria-current={current('/methodologie')}>
                  Méthodologie
                </a>
              </li>
              <li>
                <a href={href('/sources')} aria-current={current('/sources')}>
                  Sources
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </header>
      <main id="contenu" tabIndex={-1} className="wrap">
        <Page />
      </main>
      <footer className="site-footer">
        <div className="wrap">
          <p>
            Site indépendant, non affilié à un parti, à un candidat ou au Parlement. Votes&nbsp;: open data de l’Assemblée
            nationale. Données mises à jour le {formatDate(data.genereLe.slice(0, 10))}.
          </p>
          <p>
            <a href={href('/candidats')}>Partis &amp; candidats</a> · <a href={href('/methodologie')}>Méthodologie</a> ·{' '}
            <a href={href('/sources')}>Sources</a> ·{' '}
            <a href={href('/mentions')}>Mentions et confidentialité</a>
          </p>
        </div>
      </footer>
    </>
  );
}
