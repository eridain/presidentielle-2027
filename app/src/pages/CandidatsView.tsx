// Liste « Partis & candidats » : vue pure (données en paramètre), rendue par CandidatsPage et par les tests.
// Ordre alphabétique des candidats, jamais de tri par nombre de condamnations.
import { Fragment, useMemo, useState } from 'react';
import { PictoProbite } from '../components/FamilleBadge';
import { compteursCarte, formatCompteur, pageJustice, passifCarte, type PageJustice } from '../lib/justice';
import { candidatHref } from '../lib/router';
import { collator } from '../lib/scoring';
import type { AppData } from '../types';

/**
 * « (+N anciens) » : condamnations d'anciens membres (passif), discrètes et non comptées ; texte complet à l'oral.
 * Précédé d'une espace sécable : il peut passer à la ligne après le dernier compteur (écrans étroits).
 */
function PlusAnciens({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <>
      {' '}
      <span className="pcard__passif">
        <span aria-hidden="true">(+{n}&nbsp;{n > 1 ? 'anciens' : 'ancien'})</span>
        <span className="sr-only">
          (+{n} {n > 1 ? 'condamnations d’anciens membres, non comptées' : 'condamnation d’ancien membre, non comptée'})
        </span>
      </span>
    </>
  );
}

/**
 * Ligne compacte de compteurs par famille (niveau 1 : candidat, parti, membres actuels ; familles non nulles, ordre de
 * gravité), suivie de « (+N anciens) » pour le passif, ou état de la recherche.
 */
function LigneFamilles({ page, probiteSeule }: { page: PageJustice; probiteSeule: boolean }) {
  // aucune liste publiée, ou rien de présenté alors qu'une fiche manque : jamais « aucune trouvée »
  const anciens = passifCarte(page.synthese, probiteSeule);
  if (!page.documente || (page.total === 0 && page.pageVide === 'en-cours'))
    return (
      <p className="pcard__familles muted">
        Condamnations&nbsp;: recherche en cours
        <PlusAnciens n={anciens} />
      </p>
    );
  const compteurs = compteursCarte(page.synthese, probiteSeule);
  if (compteurs.length === 0)
    return (
      <p className="pcard__familles muted">
        Condamnations&nbsp;:{' '}
        {anciens > 0
          ? 'aucune chez la personne candidate, le parti ou ses membres actuels'
          : `aucune ${page.pageVide === 'aucune-trouvee' ? 'trouvée' : 'retenue'} dans les sources consultées`}
        <PlusAnciens n={anciens} />
      </p>
    );
  return (
    <p className="pcard__familles">
      <span className="sr-only">Condamnations par famille&nbsp;: </span>
      {compteurs.map((c, i) => (
        // séparateur hors du segment (insécable) : une ligne ne commence jamais par « · »
        <Fragment key={c.famille}>
          {i > 0 && '\u00a0· '}
          <span className={`pcard__famille pcard__famille--${c.famille}`}>
            {c.famille === 'probite' ? (
              <strong>
                <PictoProbite />
                {formatCompteur(c)}
              </strong>
            ) : (
              formatCompteur(c)
            )}
          </span>
        </Fragment>
      ))}
      <PlusAnciens n={anciens} />
    </p>
  );
}

export function CandidatsView({ data, probiteSeuleInitiale = false }: { data: AppData; probiteSeuleInitiale?: boolean }) {
  const [probiteSeule, setProbiteSeule] = useState(probiteSeuleInitiale);
  const candidats = useMemo(
    () => [...data.candidats].sort((a, b) => collator.compare(a.tri, b.tri)).map((c) => ({ c, page: pageJustice(data, c) })),
    [data],
  );
  return (
    <>
      <p className="lead">
        Les {candidats.length} candidats comparés, par ordre alphabétique. Chaque fiche présente le parti, les positions sur
        les {data.questions.length} questions du quiz et les condamnations en justice relevées selon un périmètre identique
        pour tous les partis.
      </p>
      <p className="small muted">
        Sous chaque nom&nbsp;: les condamnations comptées sur sa page (la personne candidate, son parti et ses membres
        actuels, dans le périmètre retenu), par famille, de la plus grave à la moins grave&nbsp;; «&nbsp;dont
        candidat&nbsp;»&nbsp;: celles qui concernent la personne candidate elle-même&nbsp;; «&nbsp;(+N anciens)&nbsp;»&nbsp;:
        condamnations d’anciens membres (exclusion, départ, retrait, décès) ou de personnes dont l’appartenance actuelle
        n’est pas établie, présentées à part sur la page, dans le passif du parti, et non comptées. Les décisions définitives et celles frappées d’appel ou d’un pourvoi (présomption
        d’innocence) sont comptées ensemble&nbsp;: le statut de chaque décision figure sur la page du candidat.
      </p>
      <div className="toggle">
        <input id="probite-seule" type="checkbox" checked={probiteSeule} onChange={(e) => setProbiteSeule(e.currentTarget.checked)} />
        <label htmlFor="probite-seule">
          Probité uniquement&nbsp;: n’afficher que les compteurs d’atteintes à la probité (argent public, corruption, fraude)
        </label>
      </div>
      <ul className="pcards">
        {candidats.map(({ c, page }) => (
          <li key={c.id} className="pcard">
            <a className="pcard__nom" href={candidatHref(c.id)}>
              {c.nom}
            </a>
            <span className="pcard__parti">{c.parti}</span>
            <LigneFamilles page={page} probiteSeule={probiteSeule} />
          </li>
        ))}
      </ul>
    </>
  );
}
