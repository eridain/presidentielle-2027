import { ErreurChargement } from '../../components/LimiteChargement';
import type { CategorieState } from '../../lib/approfondi';

/** État d'attente ou d'échec du chargement des questions d'une catégorie (fichier chargé à la demande). */
export function Chargement({ state }: { state: Exclude<CategorieState, { status: 'ready' }> }) {
  if (state.status === 'loading')
    return (
      <p className="muted chargement" role="status">
        Chargement des questions de la catégorie…
      </p>
    );
  return (
    <ErreurChargement>
      <button type="button" className="btn" onClick={state.retry}>
        Réessayer
      </button>
    </ErreurChargement>
  );
}
