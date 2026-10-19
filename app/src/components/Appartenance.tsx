import { formatDate, hostname } from '../lib/format';
import { ecartee, libelleAppartenance, MENTION_ECARTEE } from '../lib/justice';
import type { Appartenance } from '../types';
import { ExtLink } from './ExtLink';

/**
 * Badge d'appartenance actuelle au parti (Membre, Suspension depuis…, Parti, Exclusion du parti, Départ du parti,
 * Retrait — adhésion non confirmée, Décès, Statut inconnu) : couleurs neutres, forme distincte du badge de statut
 * judiciaire (qui reste l'information principale de chaque condamnation).
 */
export function AppartenanceBadge({ a }: { a: Pick<Appartenance, 'statut' | 'depuis'> }) {
  return (
    <span className={`appart appart--${a.statut}`}>
      <span className="sr-only">Appartenance au parti&nbsp;: </span>
      {libelleAppartenance(a)}
    </span>
  );
}

/** Sources de l'appartenance, dépliables : le détail sourcé (si demandé), puis chaque source et sa citation. */
export function SourcesAppartenance({ a, detail = true }: { a: Appartenance; detail?: boolean }) {
  if (a.sources.length === 0) return null;
  return (
    <details className="appart__sources">
      <summary>{a.sources.length > 1 ? `Sources de l’appartenance (${String(a.sources.length)})` : 'Source de l’appartenance'}</summary>
      {detail && a.detail && <p className="appart__detail">{a.detail}</p>}
      <ul>
        {a.sources.map((s, i) => (
          <li key={`${s.url}-${String(i)}`}>
            <ExtLink href={s.url}>{s.titre}</ExtLink>{' '}
            <span className="muted small">
              ({hostname(s.url)}
              {s.date ? `, ${formatDate(s.date)}` : ''})
            </span>
            {s.citations.map((q) => (
              <blockquote key={q}>
                <p>«&nbsp;{q}&nbsp;»</p>
              </blockquote>
            ))}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Réaction du parti (soutien public, sanction…), affichée aux deux niveaux quand elle est connue. Relevée par personne
 * (membres/), pas par décision : « à son égard », pour ne pas la rattacher à une condamnation précise.
 */
export function ReactionParti({ a }: { a: Pick<Appartenance, 'reactionParti'> }) {
  if (!a.reactionParti) return null;
  return (
    <p className="appart__reaction">
      <span className="label">Réaction du parti à son égard&nbsp;:</span> {a.reactionParti}
    </p>
  );
}

/** Exclusion motivée par l'affaire : mise en valeur positive, sans couleur. */
export function MentionEcartee({ a }: { a: Pick<Appartenance, 'statut' | 'lien'> }) {
  if (!ecartee(a)) return null;
  return (
    <p className="appart__ecartee">
      <svg className="picto" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M6.2 12.4 2 8.2l1.4-1.4 2.8 2.8 6.4-6.4L14 4.6l-7.8 7.8Z" />
      </svg>
      {MENTION_ECARTEE}
    </p>
  );
}
