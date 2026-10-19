import { Fragment, useRef, useState, type MouseEvent } from 'react';
import { renseigne, SITE } from '../config';
import { formatDate, formatDateCourte, formatDateDecision, hostname, plural } from '../lib/format';
import {
  contexteAppartenance,
  FAMILLE_COURT,
  FAMILLE_LABEL,
  FAMILLES,
  GROUPES_PARTI,
  MENTION_PROBITE,
  NATURE_LABEL,
  STATUT_COMPTEUR,
  STATUTS,
  TITRE_PASSIF,
  type BlocParti,
  type EtatVide,
  type LigneFamille,
  type PageJustice,
  type PersonnePassif,
  type SousGroupe,
} from '../lib/justice';
import { candidatHref, href } from '../lib/router';
import type { Candidat, Condamnation, FamilleCondamnation, StatutCondamnation } from '../types';
import { AppartenanceBadge, MentionEcartee, ReactionParti, SourcesAppartenance } from './Appartenance';
import { ExtLink } from './ExtLink';
import { FamilleBadge, PictoProbite } from './FamilleBadge';
import { StatutBadge } from './StatutBadge';

/** Message affiché quand la recherche a établi une liste vide. */
export const AUCUNE = 'Aucune condamnation trouvée dans les sources consultées pour le périmètre retenu.';
/** Rien d'affiché alors que la liste n'est pas vide (autres catégories, entrées écartées au contrôle). */
export const AUCUNE_RETENUE = 'Aucune condamnation retenue dans les sources consultées pour le périmètre retenu.';
export const EN_COURS = 'Recherche en cours\u00a0: aucune liste n’est encore publiée.';
/** Des condamnations d'anciens membres seulement (passif) : rien à compter pour le parti et ses membres actuels. */
export const AUCUNE_ACTUELS = 'Aucune condamnation du parti ni de ses membres actuels retenue dans les sources consultées.';
const VIDE: Record<EtatVide, string> = { 'en-cours': EN_COURS, 'aucune-trouvee': AUCUNE, 'aucune-retenue': AUCUNE_RETENUE };

function Rectification({ contact }: { contact: string }) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return <a href={`mailto:${contact}`}>{contact}</a>;
  if (/^https?:\/\//.test(contact)) return <ExtLink href={contact}>formulaire de rectification</ExtLink>;
  return <>{contact}</>;
}

/**
 * Bandeau en tête de section : même texte pour tous les partis. La ligne « Demande de rectification » n'apparaît que
 * si `contactRectification` est renseigné (src/config.ts).
 */
export function AvertissementJustice({
  dateConsultation,
  contactRectification = SITE.contactRectification,
}: {
  dateConsultation: string | null;
  contactRectification?: string | null;
}) {
  const contact = renseigne(contactRectification);
  return (
    <div className="card note justice__avert" role="note" aria-label="Périmètre et précautions">
      <p className="label">Périmètre et précautions</p>
      <ul>
        <li>
          Périmètre, identique pour tous les partis&nbsp;: le candidat ou la candidate&nbsp;; le parti en tant que personne
          morale (et ses prédécesseurs directs)&nbsp;; ses présidents, premiers secrétaires ou secrétaires nationaux
          successifs&nbsp;; sa direction nationale actuelle&nbsp;; ses parlementaires en exercice (députés, sénateurs, députés
          européens). Les élus locaux et les militants n’en font pas partie.
        </li>
        <li>
          Seules les condamnations des personnes toujours au parti (la personne candidate, le parti, ses membres actuels)
          sont comptées. Celles d’anciens membres (exclusion, départ, retrait, décès, ou appartenance non établie), dont
          d’anciens parlementaires ou ministres depuis 2012, figurent à part, dans le passif du parti, sans être comptées.
        </li>
        <li>
          {dateConsultation ? (
            <>Liste établie à partir des sources consultées à la date du {formatDateCourte(dateConsultation)}&nbsp;; </>
          ) : (
            <>Liste en cours d’établissement&nbsp;; </>
          )}
          une absence de mention ne signifie pas absence de condamnation.
        </li>
        <li>
          Toute personne est présumée innocente tant qu’une décision n’est pas définitive&nbsp;: une condamnation frappée
          d’appel ou d’un pourvoi en cassation peut encore être infirmée.
        </li>
        <li>
          N’y figurent pas&nbsp;: les mises en examen, gardes à vue, enquêtes, plaintes et procédures en cours sans
          jugement&nbsp;; les relaxes, non-lieux et condamnations annulées ou infirmées&nbsp;; les condamnations amnistiées
          ou effacées par une réhabilitation connue.
        </li>
        {contact !== null && (
          <li>
            Une erreur, une décision manquante ou un statut qui a changé&nbsp;? Demande de rectification&nbsp;:{' '}
            <Rectification contact={contact} />
          </li>
        )}
      </ul>
      <p className="small">
        <a href={href('/methodologie?section=condamnations')}>Périmètre et règles détaillés (Méthodologie)</a>
      </p>
    </div>
  );
}

/**
 * Une condamnation. Niveau 1 : personne, statut, famille, puis son appartenance actuelle (badge, réaction du parti,
 * source dépliable). Passif : la personne et son appartenance sont données une fois, en tête de son bloc.
 */
function CondamnationItem({ c, passif = false }: { c: Condamnation; passif?: boolean }) {
  const lien =
    c.lieeMandatPolitique === true
      ? ' · faits liés à un mandat ou à une activité politique'
      : c.lieeMandatPolitique === false
        ? ' · faits sans lien avec un mandat politique'
        : '';
  return (
    <li className="condamnation" data-famille={c.famille} data-appartenance={c.appartenance.statut}>
      <div className="condamnation__head">
        {!passif && (
          <p className="condamnation__qui">
            <strong>{c.personne}</strong>
            {c.roleActuel && <span className="muted"> — {c.roleActuel}</span>}
          </p>
        )}
        <StatutBadge statut={c.statut} />
      </div>
      <p className="condamnation__famille">
        <FamilleBadge famille={c.famille} />
      </p>
      {!passif && (
        <div className="condamnation__appart">
          <p>
            <AppartenanceBadge a={c.appartenance} />
          </p>
          <MentionEcartee a={c.appartenance} />
          <ReactionParti a={c.appartenance} />
          <SourcesAppartenance a={c.appartenance} />
        </div>
      )}
      <dl className="condamnation__dl">
        <div>
          <dt>Infraction</dt>
          <dd>{c.infraction}</dd>
        </div>
        {c.faits && (
          <div>
            <dt>Faits</dt>
            <dd>{c.faits}</dd>
          </div>
        )}
        <div>
          <dt>Juridiction</dt>
          <dd>{c.juridiction}</dd>
        </div>
        <div>
          <dt>Décision rendue</dt>
          <dd>
            <time dateTime={c.dateDecision}>{formatDateDecision(c.dateDecision)}</time>
          </dd>
        </div>
        <div>
          <dt>Peine</dt>
          <dd>{c.peine ?? <span className="muted">non précisée dans les sources retenues</span>}</dd>
        </div>
        <div>
          <dt>Nature</dt>
          <dd>
            {NATURE_LABEL[c.nature]}
            {lien}
          </dd>
        </div>
      </dl>
      <div className="condamnation__sources">
        <p className="label">{c.sources.length > 1 ? 'Sources' : 'Source'}</p>
        <ul>
          {c.sources.map((s, i) => (
            <li key={`${s.url}-${String(i)}`}>
              <ExtLink href={s.url}>{s.titre}</ExtLink>{' '}
              <span className="muted small">
                ({hostname(s.url)}
                {s.date ? `, ${formatDate(s.date)}` : ''})
              </span>
              <details className="condamnation__citation">
                <summary>
                  {s.citations.length > 1 ? `Citations (${String(s.citations.length)})` : 'Citation'}
                  <span className="sr-only"> de la source «&nbsp;{s.titre}&nbsp;»</span>
                </summary>
                {s.citations.map((q) => (
                  <blockquote key={q}>
                    <p>«&nbsp;{q}&nbsp;»</p>
                  </blockquote>
                ))}
              </details>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

function Liste({ items }: { items: readonly Condamnation[] }) {
  return (
    <ul className="condamnations">
      {items.map((c) => (
        <CondamnationItem key={c.id} c={c} />
      ))}
    </ul>
  );
}

function Count({ n }: { n: number }) {
  return <span className="count">({n})</span>;
}


/** « Marine Le Pen : 1 · Le parti (personne morale) : 2 · Membres actuels : 5 » (niveau 1) */
function QuiEstConcerne({ l, nom, nPartis }: { l: LigneFamille; nom: string; nPartis: number }) {
  const parts: [string, number][] = [
    [nom, l.candidat],
    [nPartis > 1 ? 'Les partis (personnes morales)' : 'Le parti (personne morale)', l.parti],
    ['Membres actuels', l.membres],
  ];
  return (
    <p className="jfam__qui">
      {parts.map(([label, n], i) => (
        // séparateur hors du segment insécable : la ligne peut passer à la ligne après « · »
        <Fragment key={label}>
          {i > 0 && '\u00a0· '}
          <span className="nowrap">
            {label}&nbsp;: {n}
          </span>
        </Fragment>
      ))}
    </p>
  );
}

const STATUT_SYNTHESE: Record<StatutCondamnation, string> = {
  definitive: 'définitive',
  appel_en_cours: 'appel en cours',
  pourvoi_en_cours: 'pourvoi en cours',
  inconnu: 'non confirmé',
};

/** Statut des décisions d'une famille : seules les décisions définitives mettent fin à la présomption d'innocence. */
function StatutsFamille({ l }: { l: LigneFamille }) {
  const parts = STATUTS.filter((s) => l.parStatut[s] > 0);
  if (parts.length === 0) return null;
  return (
    <p className="jfam__statuts">
      <span className="label">Statut des décisions&nbsp;:</span>{' '}
      {parts.map((s, i) => (
        <Fragment key={s}>
          {i > 0 && '\u00a0· '}
          <span className="nowrap">
            {STATUT_SYNTHESE[s]}&nbsp;{l.parStatut[s]}
          </span>
        </Fragment>
      ))}
    </p>
  );
}

/** Lien vers une section de la page : défilement et focus, sans toucher au fragment (#/…) qui porte la route. */
function versSection(e: MouseEvent<HTMLAnchorElement>, id: string) {
  e.preventDefault();
  const target = document.getElementById(id);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  target?.focus({ preventScroll: true });
}

/** Ligne discrète du niveau 2 : « + 17 chez d'anciens membres, non comptées dans ces totaux : Probité 6 · … ». */
function LignePassif({ page, candidatId }: { page: PageJustice; candidatId: string }) {
  const n = page.passif.total;
  if (n === 0) return null;
  const parts = page.synthese.filter((l) => l.passif > 0);
  return (
    <p className="jsynthese__passif">
      +&nbsp;{n} chez d’anciens membres, non {n > 1 ? 'comptées' : 'comptée'} dans ces totaux&nbsp;:{' '}
      {parts.map((l, i) => (
        <Fragment key={l.famille}>
          {i > 0 && '\u00a0· '}
          <span className="nowrap">
            {FAMILLE_COURT[l.famille]}&nbsp;{l.passif}
          </span>
        </Fragment>
      ))}{' '}
      (
      <a href={candidatHref(candidatId)} onClick={(e) => versSection(e, 'justice-passif')}>
        voir le passif
      </a>
      ).
    </p>
  );
}

/**
 * Synthèse en tête de section : une ligne par famille, dans l'ordre de gravité (familles à zéro comprises : même mise
 * en page pour tous), en séparant le candidat, le parti (personne morale) et les membres actuels — niveau 1, seul
 * compté ; puis une ligne discrète pour le passif (anciens membres). Probité d'abord, mise en avant (pictogramme,
 * filet, mention), sans couleur d'alerte.
 */
function SyntheseFamilles({ page, nom, candidatId }: { page: PageJustice; nom: string; candidatId: string }) {
  return (
    <section className="jsynthese" aria-labelledby="justice-synthese">
      <h3 id="justice-synthese">Synthèse par famille d’infractions</h3>
      <p className="small muted">
        Classement d’après la qualification juridique, de la famille la plus grave à la moins grave (
        <a href={href('/methodologie?section=familles')}>familles et ordre retenus</a>).
      </p>
      <ul className="jfams">
        {page.synthese.map((l) => (
          <li key={l.famille} className={`jfam jfam--${l.famille}${l.total === 0 ? ' jfam--vide' : ''}`}>
            <p className="jfam__titre">
              {l.famille === 'probite' && <PictoProbite />}
              <span className="jfam__nom">{FAMILLE_LABEL[l.famille]}</span>
              <span className="jfam__total">
                <span className="sr-only">&nbsp;: </span>
                {l.total}
                <span className="sr-only"> {l.total > 1 ? 'condamnations' : 'condamnation'}</span>
              </span>
            </p>
            {l.famille === 'probite' && <p className="jfam__mention">{MENTION_PROBITE}.</p>}
            <QuiEstConcerne l={l} nom={nom} nPartis={page.partis.length} />
            <StatutsFamille l={l} />
          </li>
        ))}
      </ul>
      <LignePassif page={page} candidatId={candidatId} />
      <div className="compteurs">
        <p>
          <strong>{plural(page.total, 'condamnation comptée', 'condamnations comptées')} sur cette page</strong> (la
          personne candidate, le parti, ses membres actuels), par statut&nbsp;:
        </p>
        <ul>
          {STATUTS.map((s) => (
            <li key={s}>
              {STATUT_COMPTEUR[s]}&nbsp;:&nbsp;{page.compteurs[s]}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Cases à cocher (une par famille, toutes cochées au départ) : filtrent la liste, pas la synthèse. */
function FiltreFamilles({
  page,
  masquees,
  basculer,
  toutAfficher,
}: {
  page: PageJustice;
  masquees: ReadonlySet<FamilleCondamnation>;
  basculer: (f: FamilleCondamnation, visible: boolean) => void;
  toutAfficher: () => void;
}) {
  const affichees = page.familles.filter((g) => !masquees.has(g.famille)).reduce((n, g) => n + g.total, 0);
  const anciens = page.passif.familles.filter((g) => !masquees.has(g.famille)).reduce((n, g) => n + g.total, 0);
  const champ = useRef<HTMLFieldSetElement>(null);
  return (
    <div className="jfiltre">
      <fieldset ref={champ}>
        <legend>Familles affichées dans la liste</legend>
        <div className="jfiltre__opts">
          {page.synthese.map((l) => (
            <label key={l.famille} className={`jfiltre__opt jfiltre__opt--${l.famille}`}>
              <input
                type="checkbox"
                name="famille"
                value={l.famille}
                checked={!masquees.has(l.famille)}
                onChange={(e) => basculer(l.famille, e.currentTarget.checked)}
              />
              <span>
                {FAMILLE_LABEL[l.famille]}{' '}
                <span className="count">
                  ({l.total}
                  {l.passif > 0 && <>, +&nbsp;{l.passif}&nbsp;{l.passif > 1 ? 'anciens' : 'ancien'}</>})
                </span>
              </span>
            </label>
          ))}
        </div>
        {masquees.size > 0 && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              toutAfficher();
              // le bouton disparaît : le focus passe à la première case plutôt que de retomber en haut de page
              champ.current?.querySelector('input')?.focus();
            }}
          >
            Tout afficher
          </button>
        )}
      </fieldset>
      <p className="small muted jfiltre__etat" role="status">
        {masquees.size === 0
          ? `Toutes les familles sont affichées (${plural(page.total, 'condamnation', 'condamnations')}${page.passif.total > 0 ? `, +\u00a0${String(page.passif.total)} chez d’anciens membres` : ''}).`
          : `${plural(affichees, 'condamnation affichée', 'condamnations affichées')} sur ${String(page.total)}${page.passif.total > 0 ? ` (+\u00a0${String(anciens)} sur ${String(page.passif.total)} chez d’anciens membres)` : ''}.`}
      </p>
    </div>
  );
}

function titreSousGroupe(s: SousGroupe, nom: string, nPartis: number): string {
  if (s.cle === 'candidat' || s.parti === null) return nom;
  const titre = GROUPES_PARTI.find((g) => g.cle === s.cle)?.titre ?? s.cle;
  return nPartis > 1 ? `${titre} — ${s.parti.nom}` : titre;
}

/** Liste de niveau 1 : par famille (ordre de gravité), puis par catégorie de personne, puis plus récente d'abord. */
function ListeFamilles({ page, nom, masquees }: { page: PageJustice; nom: string; masquees: ReadonlySet<FamilleCondamnation> }) {
  if (page.total === 0) return null;
  const visibles = page.familles.filter((g) => g.total > 0 && !masquees.has(g.famille));
  if (visibles.length === 0) return <p className="muted">Aucune condamnation dans les familles sélectionnées.</p>;
  return (
    <>
      {visibles.map((g) => {
        const id = `justice-f-${g.famille}`;
        return (
          <section key={g.famille} className={`jfamille jfamille--${g.famille}`} aria-labelledby={id}>
            <h3 id={id}>
              {g.famille === 'probite' && <PictoProbite />}
              {FAMILLE_LABEL[g.famille]} <Count n={g.total} />
            </h3>
            {g.famille === 'probite' && <p className="jfamille__mention small">{MENTION_PROBITE}.</p>}
            {g.sousGroupes.map((s) => {
              const sid = `${id}-${s.cle}${s.parti ? `-${s.parti.id}` : ''}`;
              return (
                <section key={sid} className="jgroupe" aria-labelledby={sid}>
                  <h4 id={sid}>
                    {titreSousGroupe(s, nom, page.partis.length)} <Count n={s.items.length} />
                  </h4>
                  <Liste items={s.items} />
                </section>
              );
            })}
          </section>
        );
      })}
    </>
  );
}

/** Une personne du passif : son appartenance (ligne de contexte, détail, réaction, source), puis ses condamnations. */
function PersonnePassifItem({ p, nPartis }: { p: PersonnePassif; nPartis: number }) {
  const a = p.appartenance;
  return (
    <li className="jpersonne" data-appartenance={a.statut}>
      <div className="jpersonne__head">
        <p className="jpersonne__qui">
          <strong>{p.personne}</strong>
          {p.roleActuel && <span className="muted"> — {p.roleActuel}</span>}
          {nPartis > 1 && <span className="muted"> ({p.parti.nom})</span>}
        </p>
        <AppartenanceBadge a={a} />
      </div>
      <p className="jpersonne__contexte">{contexteAppartenance(a)}</p>
      {p.details.map((d) => (
        <p key={d} className="jpersonne__detail">
          {d}
        </p>
      ))}
      <MentionEcartee a={a} />
      {p.reactions.map((r) => (
        <ReactionParti key={r} a={{ reactionParti: r }} />
      ))}
      <SourcesAppartenance a={a} detail={false} />
      <ul className="condamnations condamnations--passif" aria-label={`Condamnations de ${p.personne}`}>
        {p.items.map((c) => (
          <CondamnationItem key={c.id} c={c} passif />
        ))}
      </ul>
    </li>
  );
}

/**
 * Niveau 2 — passif : anciens membres condamnés, à part, sous la liste principale, en style atténué ; visible, regroupé
 * par famille (ordre de gravité) puis par personne ; jamais compté dans la synthèse ni sur les cartes.
 */
function Passif({ page, masquees }: { page: PageJustice; masquees: ReadonlySet<FamilleCondamnation> }) {
  const p = page.passif;
  if (p.total === 0) return null;
  const visibles = p.familles.filter((g) => g.total > 0 && !masquees.has(g.famille));
  return (
    <section className="jpassif" aria-labelledby="justice-passif">
      <h3 id="justice-passif" tabIndex={-1}>
        {TITRE_PASSIF}
      </h3>
      <p className="jpassif__intro">
        {plural(p.total, 'condamnation', 'condamnations')} de personnes qui ne sont plus membres{' '}
        {page.partis.length > 1 ? 'du parti concerné' : 'du parti'} (exclusion, départ, retrait de la vie politique,
        décès), dont l’appartenance actuelle n’est pas établie, ou relevées par la recherche sur les anciens
        membres&nbsp;: présentées pour mémoire, elles ne sont comptées ni dans la synthèse ni sur les cartes «&nbsp;Partis
        &amp; candidats&nbsp;» (
        <a href={href('/methodologie?section=appartenance')}>règle retenue</a>).
      </p>
      {visibles.length === 0 ? (
        <p className="muted">Aucune condamnation d’ancien membre dans les familles sélectionnées.</p>
      ) : (
        visibles.map((g) => {
          const id = `justice-passif-${g.famille}`;
          return (
            <section key={g.famille} className={`jpassif__famille jpassif__famille--${g.famille}`} aria-labelledby={id}>
              <h4 id={id}>
                {g.famille === 'probite' && <PictoProbite />}
                {FAMILLE_LABEL[g.famille]} <Count n={g.total} />
              </h4>
              <ul className="jpersonnes">
                {g.personnes.map((x) => (
                  <PersonnePassifItem key={x.cle} p={x} nPartis={page.partis.length} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </section>
  );
}

/** Pour le candidat (s'il n'a aucune condamnation présentée) et pour chaque parti : état de la liste et date des sources. */
function EtatRecherche({ page, nom, noms }: { page: PageJustice; nom: string; noms: ReadonlyMap<string, string> }) {
  return (
    <section className="jetat" aria-labelledby="justice-etat">
      <h3 id="justice-etat">État de la recherche</h3>
      <ul>
        {page.candidat.length === 0 && (
          <li>
            <p className="label">{nom}</p>
            <p className={page.candidatVide === 'en-cours' ? 'muted' : 'justice__vide'}>{VIDE[page.candidatVide]}</p>
          </li>
        )}
        {page.partis.map((b) => (
          <EtatParti key={b.parti.id} bloc={b} noms={noms} />
        ))}
      </ul>
    </section>
  );
}

function EtatParti({ bloc, noms }: { bloc: BlocParti; noms: ReadonlyMap<string, string> }) {
  const { parti, autresCandidats, etat, total, passif } = bloc;
  const fiche = parti.fiche;
  const anciens = fiche?.anciens;
  return (
    <li className="jbloc" data-parti={parti.id}>
      <p className="label">{parti.nom}&nbsp;: le parti et ses membres</p>
      {etat === 'en-cours' ? (
        <p className="muted">{EN_COURS}</p>
      ) : etat === 'aucune-trouvee' && passif.length === 0 ? (
        <p className="justice__vide">{AUCUNE}</p>
      ) : total === 0 && passif.length === 0 ? (
        <p className="justice__vide">{AUCUNE_RETENUE}</p>
      ) : total === 0 ? (
        <p className="justice__vide">{AUCUNE_ACTUELS}</p>
      ) : (
        <p>{plural(total, 'condamnation comptée', 'condamnations comptées')} ci-dessus (le parti et ses membres actuels).</p>
      )}
      {passif.length > 0 && (
        <p>
          {plural(passif.length, 'condamnation d’ancien membre', 'condamnations d’anciens membres')} dans le passif, non{' '}
          {passif.length > 1 ? 'comptées' : 'comptée'}.
        </p>
      )}
      {fiche?.appartenance !== undefined && fiche.appartenance !== 'lue' && fiche.condamnations.length > 0 && (
        <p className="muted small">Appartenance actuelle des personnes condamnées&nbsp;: non documentée (statut inconnu).</p>
      )}
      {autresCandidats.map((a) => (
        <p key={a.id} className="small">
          {noms.get(a.id) ?? a.id} (autre candidature issue de ce parti)&nbsp;: {plural(a.n, 'condamnation relevée', 'condamnations relevées')}, présentée
          {a.n > 1 ? 's' : ''} sur <a href={candidatHref(a.id)}>sa page</a>.
        </p>
      ))}
      {fiche && (
        <p className="muted small">
          Sources consultées le {formatDateCourte(fiche.dateConsultation)}
          {fiche.personnesVerifiees !== null && <> · personnes du périmètre vérifiées&nbsp;: {fiche.personnesVerifiees}</>}.
        </p>
      )}
      {anciens && (
        <p className="muted small">
          Recherche sur les anciens membres (anciens dirigeants, anciens parlementaires ou ministres depuis 2012)&nbsp;:{' '}
          {anciens.liste === 'absente'
            ? 'non publiée'
            : `${anciens.liste === 'vide' ? 'aucune condamnation trouvée, ' : ''}sources consultées le ${formatDateCourte(anciens.dateConsultation)}${anciens.personnesVerifiees !== null ? ` · personnes vérifiées\u00a0: ${String(anciens.personnesVerifiees)}` : ''}`}
          .
        </p>
      )}
    </li>
  );
}

/** Section « Condamnations en justice » de la page d'un candidat. */
export function JusticeSection({
  candidat,
  page,
  noms,
}: {
  candidat: Pick<Candidat, 'id' | 'nom'>;
  page: PageJustice;
  noms: ReadonlyMap<string, string>;
}) {
  // familles décochées (toutes cochées au départ)
  const [masquees, setMasquees] = useState<ReadonlySet<FamilleCondamnation>>(() => new Set());
  const basculer = (f: FamilleCondamnation, visible: boolean) =>
    setMasquees((prev) => new Set(FAMILLES.filter((x) => (x === f ? !visible : prev.has(x)))));
  return (
    <section className="justice" aria-labelledby="justice-title">
      <h2 id="justice-title" tabIndex={-1}>
        Condamnations en justice
      </h2>
      {page.documente && <SyntheseFamilles page={page} nom={candidat.nom} candidatId={candidat.id} />}
      <AvertissementJustice dateConsultation={page.dateConsultation} />
      {page.total + page.passif.total > 0 && (
        <>
          <FiltreFamilles page={page} masquees={masquees} basculer={basculer} toutAfficher={() => setMasquees(new Set())} />
          <ListeFamilles page={page} nom={candidat.nom} masquees={masquees} />
          <Passif page={page} masquees={masquees} />
        </>
      )}
      <EtatRecherche page={page} nom={candidat.nom} noms={noms} />
    </section>
  );
}
