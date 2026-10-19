import { formatDate } from '../lib/format';
import type { Question } from '../types';
import { ExtLink } from './ExtLink';
import { VoteBar } from './VoteBar';

const OPEN_DATA = 'https://data.assemblee-nationale.fr';

export function ScrutinCard({ question }: { question: Question }) {
  const s = question.scrutin;
  const lieu = s.assemblee === 'Congrès' ? 'Congrès du Parlement' : 'Assemblée nationale';
  const issue = s.censure
    ? s.sort === 'adopté'
      ? 'Motion de censure adoptée'
      : 'Motion de censure rejetée'
    : s.sort === 'adopté'
      ? 'Adopté'
      : 'Rejeté';
  return (
    <div className="scrutin">
      <p className="scrutin__meta">
        {lieu} · {formatDate(s.date)} · scrutin n°&nbsp;{s.numero}
      </p>
      <p className="scrutin__issue">
        <strong>{issue}</strong>
      </p>
      {s.censure ? (
        <p className="scrutin__count">
          {s.pour} député(e)s ont voté la censure. Lors d’une motion de censure, seuls les votes «&nbsp;pour&nbsp;» sont enregistrés.
        </p>
      ) : (
        <VoteBar pour={s.pour} contre={s.contre} abstention={s.abstention} />
      )}
      {s.note && <p className="scrutin__note">{s.note}</p>}
      <p className="scrutin__object">
        <span className="label">Objet du vote&nbsp;:</span> {s.titre}
      </p>
      <p className="scrutin__links">
        {s.url && s.url !== OPEN_DATA ? (
          <ExtLink href={s.url}>Page officielle du scrutin</ExtLink>
        ) : (
          <span>
            Scrutin {s.uid}&nbsp;: <ExtLink href={OPEN_DATA}>open data de l’Assemblée nationale</ExtLink>
          </span>
        )}
        {s.urlDossier && (
          <>
            {' · '}
            <ExtLink href={s.urlDossier}>Dossier législatif</ExtLink>
          </>
        )}
      </p>
    </div>
  );
}
