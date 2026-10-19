import { STATUT_LABEL } from '../lib/justice';
import type { StatutCondamnation } from '../types';

/** Badge de statut d'une condamnation : forme distincte selon le statut, couleurs neutres. */
export function StatutBadge({ statut }: { statut: StatutCondamnation }) {
  return (
    <span className={`statut statut--${statut}`}>
      <span className="sr-only">Statut&nbsp;: </span>
      {STATUT_LABEL[statut]}
    </span>
  );
}
