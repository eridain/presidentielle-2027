// Page « parti / candidat » : vue pure (données en paramètre), rendue par CandidatPage et par les tests.
import { Fragment, useMemo, type MouseEvent } from 'react';
import { EvidenceBadge } from '../components/EvidenceBadge';
import { ExtLink } from '../components/ExtLink';
import { JusticeSection } from '../components/Justice';
import { PageTitle } from '../components/PageTitle';
import { deNom, plural, STANCE_LABEL } from '../lib/format';
import { pageJustice, resumePositions } from '../lib/justice';
import { candidatHref, href } from '../lib/router';
import { EVIDENCE_LABELS } from '../lib/weights';
import type { AppData, Candidat, EvidenceType, Parti, SourceLink, Stance } from '../types';

const STANCES: Stance[] = ['oui', 'non', 'abstention', 'inconnu'];
const nQuestions = (n: number) => (n > 1 ? `les ${String(n)} questions` : `${String(n)} question`);
const PREUVES: EvidenceType[] = ['vote_an', 'vote_congres', 'vote_senat', 'vote_pe', 'gouvernement', 'declaration', 'censure_implicite', 'groupe'];

function Sources({ items, label = 'Sources' }: { items: readonly SourceLink[]; label?: string }) {
  if (items.length === 0) return null;
  return (
    <p className="small fiche__sources">
      <span className="label">{label}&nbsp;:</span>{' '}
      {items.map((s, i) => (
        <span key={s.url}>
          {i > 0 && ' · '}
          <ExtLink href={s.url}>{s.titre}</ExtLink>
        </span>
      ))}
    </p>
  );
}

function FichePartiSection({ parti, rattachement }: { parti: Parti; rattachement: string | null }) {
  const f = parti.fiche;
  const id = `parti-${parti.id}`;
  return (
    <section className="fiche" aria-labelledby={id}>
      <h2 id={id}>
        {parti.nom}
        {parti.sigle && parti.sigle !== parti.nom && <span className="muted"> ({parti.sigle})</span>}
      </h2>
      {rattachement && <p className="fiche__lien">{rattachement}</p>}
      {f === null ? (
        <p className="muted">Présentation du parti en cours de documentation.</p>
      ) : (
        <>
          {f.presentation ? (
            <>
              <p>{f.presentation}</p>
              <Sources items={f.presentationSources} />
            </>
          ) : (
            <p className="muted">Présentation du parti en cours de documentation.</p>
          )}
          {(f.fondation || f.predecesseurs.length > 0) && (
            <p className="small">
              {f.fondation && (
                <>
                  <span className="label">Fondation&nbsp;:</span> {f.fondation}
                </>
              )}
              {f.fondation && f.predecesseurs.length > 0 && ' · '}
              {f.predecesseurs.length > 0 && (
                <>
                  <span className="label">{f.predecesseurs.length > 1 ? 'Prédécesseurs' : 'Prédécesseur'}&nbsp;:</span>{' '}
                  {f.predecesseurs.join(' ; ')}
                </>
              )}
            </p>
          )}
          <h3>Direction</h3>
          {f.direction.length > 0 ? (
            <ul className="fiche__direction">
              {f.direction.map((d) => (
                <li key={`${d.nom}-${d.fonction}`}>
                  {d.url ? <ExtLink href={d.url}>{d.nom}</ExtLink> : d.nom} <span className="muted">— {d.fonction}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Non documentée.</p>
          )}
          <h3>Effectifs parlementaires</h3>
          {f.effectifs ? (
            <>
              <p>
                {[
                  f.effectifs.deputes !== null && plural(f.effectifs.deputes, 'député'),
                  f.effectifs.senateurs !== null && plural(f.effectifs.senateurs, 'sénateur'),
                  f.effectifs.eurodeputes !== null && plural(f.effectifs.eurodeputes, 'député européen', 'députés européens'),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {f.effectifs.precision && <p className="small muted">{f.effectifs.precision}</p>}
              <Sources items={f.effectifs.sources} />
            </>
          ) : (
            <p className="muted">Non documentés.</p>
          )}
        </>
      )}
    </section>
  );
}

function Positions({ data, candidat }: { data: Pick<AppData, 'themes' | 'questions'>; candidat: Candidat }) {
  const r = resumePositions(data, candidat.id);
  const preuves = PREUVES.filter((e) => (r.parPreuve[e] ?? 0) > 0);
  return (
    <section className="positions" aria-labelledby="positions-title">
      <h2 id="positions-title" tabIndex={-1}>
        Ses positions sur {nQuestions(data.questions.length)}
      </h2>
      <p>
        {STANCES.map((s, i) => (
          // séparateur hors du segment insécable : la ligne peut passer à la ligne (écrans étroits)
          <Fragment key={s}>
            {i > 0 && '\u00a0· '}
            <span className="nowrap">
              {STANCE_LABEL[s]}&nbsp;: <strong>{r.parStance[s]}</strong>
            </span>
          </Fragment>
        ))}
      </p>
      {preuves.length > 0 && (
        <p className="small">
          <span className="label">Nature des preuves&nbsp;:</span>{' '}
          {preuves.map((e, i) => (
            <span key={e}>
              {i > 0 && ' · '}
              {EVIDENCE_LABELS[e].court}&nbsp;: {r.parPreuve[e]}
            </span>
          ))}
        </p>
      )}
      <p className="muted small">
        Oui et Non répondent à la question posée dans le quiz (pas au vote pour ou contre le texte). Un proxy est le vote de
        son groupe, pas un vote personnel. <a href={href('/methodologie')}>Hiérarchie des preuves</a>.
      </p>
      <details className="positions__detail">
        <summary>Voir {nQuestions(data.questions.length)}, une par une</summary>
        {r.themes.map((t) => (
          <section key={t.theme} aria-label={t.theme}>
            <h3 className="positions__theme">{t.theme}</h3>
            <ul className="positions__list">
              {t.questions.map((q) => {
                const p = q.candidats[candidat.id];
                const stance = p?.stance ?? 'inconnu';
                return (
                  <li key={q.id} className="positions__item">
                    <span className="positions__q">
                      <a href={href(`/question/${q.id}`)}>{q.titre}</a>
                      <span className="positions__simple">{q.enClair?.questionSimple ?? q.question}</span>
                    </span>
                    <span className="positions__pos">
                      <span className={`stance stance--${stance}`}>{STANCE_LABEL[stance]}</span>
                      {p && p.evidence !== 'inconnu' && <EvidenceBadge evidence={p.evidence} />}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </details>
    </section>
  );
}

/** Page d'un candidat (testable avec des données de test). */
export function CandidatView({ data, candidat }: { data: AppData; candidat: Candidat }) {
  const justice = useMemo(() => pageJustice(data, candidat), [data, candidat]);
  const noms = useMemo(() => new Map(data.candidats.map((c) => [c.id, c.nom])), [data]);
  const partis = candidat.partis.map((id) => data.partis.find((p) => p.id === id)).filter((p): p is Parti => p !== undefined);
  return (
    <article className="candidat prose">
      <p className="small">
        <a href={href('/candidats')}>← Partis &amp; candidats</a>
      </p>
      <PageTitle title={candidat.nom} focusKey={candidat.id} />
      <p className="lead">{candidat.parti}</p>
      <nav aria-label="Sur cette page" className="toc small">
        {[
          ['biographie', 'Biographie'],
          ['positions-title', `Positions sur ${nQuestions(data.questions.length)}`],
          ['justice-title', 'Condamnations en justice'],
        ].map(([target = '', label], i) => (
          <span key={target}>
            {i > 0 && ' · '}
            <a href={candidatHref(candidat.id)} onClick={(e) => jump(e, target)}>
              {label}
            </a>
          </span>
        ))}
      </nav>

      <section aria-labelledby="biographie">
        <h2 id="biographie" tabIndex={-1}>
          Biographie
        </h2>
        {candidat.bio ? (
          <>
            <p>{candidat.bio.texte}</p>
            <Sources items={candidat.bio.sources} />
          </>
        ) : (
          <p className="muted">Biographie en cours de documentation.</p>
        )}
      </section>

      {partis.map((p) => (
        <FichePartiSection key={p.id} parti={p} rattachement={p.candidats.find((c) => c.id === candidat.id)?.rattachement ?? null} />
      ))}

      <Positions data={data} candidat={candidat} />

      {/* key : filtre des familles remis à zéro (tout coché) à chaque changement de candidat */}
      <JusticeSection key={candidat.id} candidat={candidat} page={justice} noms={noms} />

      <p className="small">
        <a href={href('/')}>Comparer vos réponses aux positions {deNom(candidat.nom)}&nbsp;: faire le quiz</a>
      </p>
    </article>
  );
}

/** Lien interne à la page : défilement et focus, sans toucher au fragment (#/…) qui porte la route. */
function jump(e: MouseEvent<HTMLAnchorElement>, id: string) {
  e.preventDefault();
  const target = document.getElementById(id);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  target?.focus({ preventScroll: true });
}

