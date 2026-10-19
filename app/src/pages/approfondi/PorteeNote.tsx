import { PORTEE_LABEL, PORTEE_PRECISION } from '../../lib/portee';
import type { Portee, Question } from '../../types';

/** Sous la question (mode approfondi) : portée du scrutin, question commune au parcours principal, recherche en cours. */
export function PorteeNote({ portee, existant, recherche }: { portee: Portee; existant: boolean; recherche: boolean }) {
  const precision = PORTEE_PRECISION[portee];
  return (
    <div className="appro-notes">
      <p className={`portee portee--${portee}`}>
        <strong className="portee__label">{PORTEE_LABEL[portee]}</strong>
        {precision && <span className="portee__precision">{precision}</span>}
      </p>
      {existant && (
        <p className="small muted">
          Question aussi posée dans le parcours principal&nbsp;: une seule réponse pour les deux (la modifier ici la modifie
          aussi là-bas).
        </p>
      )}
      {!recherche && (
        <p className="small muted appro-notes__recherche">
          Recherche documentaire en cours pour cette question&nbsp;: positions issues des votes nominatifs officiels et, à
          défaut, du vote du groupe du parti (proxy)&nbsp;; contexte et arguments à venir.
        </p>
      )}
    </div>
  );
}

/**
 * Dans la révélation, avant le résultat : pour un vote sur un article ou un amendement, « Adopté » / « Rejeté » se
 * rapporte à cette disposition, et répondre Oui revenait à voter pour (ou contre) elle.
 */
export function PorteeRevelation({ portee, question: q }: { portee: Portee; question: Question }) {
  if (portee !== 'article' && portee !== 'amendement') return null;
  const objet = portee === 'article' ? 'cet article' : 'cet amendement';
  return (
    <p className={`portee portee--${portee} portee--revelation`}>
      <strong className="portee__label">{PORTEE_LABEL[portee]}</strong>
      <span className="portee__precision">
        Le résultat ci-dessous («&nbsp;{q.scrutin.sort === 'adopté' ? 'Adopté' : 'Rejeté'}&nbsp;») porte sur {objet}, pas sur le
        texte entier. Répondre «&nbsp;Oui&nbsp;» à la question revenait à voter {q.ouiSignifie} {objet}.
      </span>
    </p>
  );
}
