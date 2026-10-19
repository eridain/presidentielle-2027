import { EVIDENCE_LABELS, EVIDENCE_WEIGHTS } from '../lib/weights';
import type { EvidenceType } from '../types';

const KIND: Record<EvidenceType, string> = {
  vote_an: 'vote',
  vote_congres: 'vote',
  vote_senat: 'vote',
  vote_pe: 'vote',
  gouvernement: 'gouv',
  declaration: 'decl',
  censure_implicite: 'implicite',
  groupe: 'proxy',
  inconnu: 'inconnu',
};

/** Badge de nature de preuve (forme distincte, pas seulement la couleur). */
export function EvidenceBadge({ evidence }: { evidence: EvidenceType }) {
  const label = EVIDENCE_LABELS[evidence];
  const weight = EVIDENCE_WEIGHTS[evidence];
  return (
    <span className={`badge badge--${KIND[evidence]}`} title={`${label.long}${weight > 0 ? ` — poids ${String(weight).replace('.', ',')}` : ''}`}>
      <span className="sr-only">Nature de la preuve&nbsp;: </span>
      {label.court}
    </span>
  );
}
