// Routes du mode « Approfondir par catégorie » (chargées à la demande : le parcours principal n'en dépend pas).
//   #/approfondi                                  choix d'une catégorie
//   #/approfondi/<categorie>                      présentation de la catégorie
//   #/approfondi/<categorie>/question/<id>        question
//   #/approfondi/<categorie>/resultats[?r=…&k=…]  restitution (partage par URL)
import { PageTitle } from '../../components/PageTitle';
import { categories, categoriesById } from '../../lib/approfondi';
import { href } from '../../lib/router';
import { NotFoundPage } from '../NotFoundPage';
import { CategoriePage } from './CategoriePage';
import { CategorieQuestionPage } from './CategorieQuestionPage';
import { CategorieResultatsPage } from './CategorieResultatsPage';
import { CategoriesPage } from './CategoriesPage';

const ROUTE = /^\/approfondi\/([a-z0-9-]+)(?:\/question\/([a-z0-9-]+)|\/(resultats))?$/;

export default function ApprofondiRoutes({ path, params }: { path: string; params: URLSearchParams }) {
  if (categories.length === 0)
    return (
      <div className="prose">
        <PageTitle title="Approfondir par catégorie" />
        <p>Le mode approfondi n’est pas disponible pour le moment.</p>
        <p>
          <a className="btn btn--primary" href={href('/')}>
            Retour à l’accueil
          </a>
        </p>
      </div>
    );
  if (path === '/approfondi') return <CategoriesPage />;
  const m = ROUTE.exec(path);
  const c = m?.[1] ? categoriesById.get(m[1]) : undefined;
  if (!m || !c) return <NotFoundPage />;
  if (m[2]) return <CategorieQuestionPage key={`${c.id}/${m[2]}`} categorie={c} id={m[2]} />;
  if (m[3]) return <CategorieResultatsPage key={c.id} categorie={c} params={params} />;
  return <CategoriePage key={c.id} categorie={c} />;
}
