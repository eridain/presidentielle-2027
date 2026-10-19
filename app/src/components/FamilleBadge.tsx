import { FAMILLE_LABEL } from '../lib/justice';
import type { FamilleCondamnation } from '../types';

/** Pictogramme de la famille Probité (édifice public) : décoratif, la famille est toujours nommée en toutes lettres. */
export function PictoProbite() {
  return (
    <svg className="picto" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M8 1 1 4.6V6h14V4.6L8 1ZM2.5 7h2.2v5H2.5V7Zm4.4 0h2.2v5H6.9V7Zm4.4 0h2.2v5h-2.2V7ZM1 13h14v2H1v-2Z" />
    </svg>
  );
}

/**
 * Famille d'une condamnation : étiquette discrète, visuellement secondaire par rapport au badge de statut (une
 * condamnation en appel n'est pas une condamnation définitive). Probité : pictogramme, sans couleur d'alerte.
 */
export function FamilleBadge({ famille }: { famille: FamilleCondamnation }) {
  return (
    <span className={`famille famille--${famille}`}>
      {famille === 'probite' && <PictoProbite />}
      <span className="sr-only">Famille&nbsp;: </span>
      {FAMILLE_LABEL[famille]}
    </span>
  );
}
