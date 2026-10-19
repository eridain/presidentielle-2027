import { formatDate, hostname } from '../lib/format';
import type { Argument } from '../types';
import { ExtLink } from './ExtLink';

export function ArgumentList({ items }: { items: readonly Argument[] }) {
  if (items.length === 0) return <p className="muted">Aucun argument documenté pour l’instant.</p>;
  return (
    <ul className="args">
      {items.map((a, i) => (
        <li key={`${a.url}-${i}`} className="arg">
          <p className="arg__author">{a.auteur}</p>
          <p className="arg__resume">{a.resume}</p>
          {a.citation && (
            <blockquote className="arg__quote">
              <p>«&nbsp;{a.citation}&nbsp;»</p>
            </blockquote>
          )}
          <p className="arg__src">
            <ExtLink href={a.url}>{hostname(a.url)}</ExtLink>
            {a.date && <span> · {formatDate(a.date)}</span>}
          </p>
        </li>
      ))}
    </ul>
  );
}
