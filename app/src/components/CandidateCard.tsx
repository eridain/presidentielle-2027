import { argumentLabel, attributionMention, proposDeTiers } from '../lib/attribution';
import { formatDate, hostname, STANCE_LABEL } from '../lib/format';
import { candidatHref } from '../lib/router';
import type { Candidat, CandidatePosition } from '../types';
import { EvidenceBadge } from './EvidenceBadge';
import { ExtLink } from './ExtLink';

function positionText(p: CandidatePosition, censure: boolean): string | null {
  if (p.position === null) return null;
  if (censure) {
    if (p.position === 'pour') return 'pour la censure';
    if (p.position === 'contre')
      return p.evidence === 'censure_implicite' || p.evidence === 'groupe' ? 'censure non votée' : 'contre la censure';
  }
  return `position au scrutin\u00a0: ${p.position}`;
}

export function CandidateCard({ candidat, position, censure }: { candidat: Candidat; position: CandidatePosition; censure: boolean }) {
  const posText = positionText(position, censure);
  // Propos d'un autre député de son groupe (ou du Gouvernement) : jamais présentés comme ceux du candidat.
  const tiers = proposDeTiers(position.attribution);
  const label = argumentLabel(position.attribution);
  const mention = attributionMention(position.attribution, candidat.nom);
  return (
    <li className="cand">
      <div className="cand__head">
        <h4 className="cand__name">
          <a href={candidatHref(candidat.id)}>{candidat.nom}</a>
        </h4>
        <span className="cand__parti">{candidat.parti}</span>
      </div>
      <p className="cand__pos">
        <span className={`stance stance--${position.stance}`}>{STANCE_LABEL[position.stance]}</span>
        {posText && <span className="cand__raw">({posText})</span>}
        <EvidenceBadge evidence={position.evidence} />
        {position.note && <span className="cand__note">{position.note}</span>}
      </p>
      <p className="cand__detail">{position.detail}</p>
      {(position.argument || position.citation) && (
        <div className={`cand__propos${tiers ? ' cand__propos--tiers' : ''}`}>
          {position.argument ? (
            <p className="cand__arg">
              <span className="label">{label}&nbsp;:</span> {position.argument}
            </p>
          ) : (
            tiers && (
              <p className="cand__arg">
                <span className="label">{label}</span>
              </p>
            )
          )}
          {position.citation && (
            <blockquote className="cand__quote">
              <p>«&nbsp;{position.citation}&nbsp;»</p>
            </blockquote>
          )}
          {mention && <p className="cand__attrib">{mention}</p>}
        </div>
      )}
      {(position.url || position.argumentUrl) && (
        <p className="cand__src">
          {position.url && (
            <ExtLink href={position.url}>
              Source{position.evidence === 'groupe' ? ' (scrutin)' : ''}&nbsp;: {hostname(position.url)}
            </ExtLink>
          )}
          {position.date && <span> · {formatDate(position.date)}</span>}
          {position.argumentUrl && (
            <>
              {' · '}
              <ExtLink href={position.argumentUrl}>Source de l’argument&nbsp;: {hostname(position.argumentUrl)}</ExtLink>
            </>
          )}
        </p>
      )}
      {position.commentaire && position.commentaire !== position.detail && (
        <details className="cand__comment">
          <summary>Précision de la recherche</summary>
          <p>{position.commentaire}</p>
        </details>
      )}
      {position.incoherence && (
        <p className="cand__warn" role="note">
          <span aria-hidden="true">⚠ </span>
          {position.incoherence}
        </p>
      )}
    </li>
  );
}
