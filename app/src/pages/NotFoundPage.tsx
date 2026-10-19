import { PageTitle } from '../components/PageTitle';
import { href } from '../lib/router';

export function NotFoundPage() {
  return (
    <div>
      <PageTitle title="Page introuvable" />
      <p>
        Cette page n’existe pas. <a href={href('/')}>Retour à l’accueil</a>.
      </p>
    </div>
  );
}
