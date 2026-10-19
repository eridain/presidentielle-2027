// Restitution : classement par taux d'accord, données insuffisantes, détail par candidat, lien de partage.
// Partagé par les résultats du parcours principal et ceux d'une catégorie du mode approfondi.
import { useState } from 'react';
import { candidatsById } from '../lib/data';
import { ANSWER_LABEL, formatPercent, plural, STANCE_LABEL } from '../lib/format';
import { candidatHref } from '../lib/router';
import { scoreByTheme, type CandidateScore, type Verdict } from '../lib/scoring';
import { CONFIDENCE_THRESHOLDS, MIN_COMPARABLE } from '../lib/weights';
import type { Question } from '../types';
import { EvidenceBadge } from './EvidenceBadge';

const VERDICT_LABEL: Record<Verdict, string> = {
  accord: 'Accord',
  desaccord: 'Désaccord',
  abstention: 'Demi-accord (abstention)',
  'non-comparable': 'Non comparable',
};

const VERDICT_ICON: Record<Verdict, string> = { accord: '✓', desaccord: '✗', abstention: '½', 'non-comparable': '–' };

function confidenceLabel(c: number): string {
  if (c >= CONFIDENCE_THRESHOLDS.elevee) return 'élevée';
  if (c >= CONFIDENCE_THRESHOLDS.moyenne) return 'moyenne';
  return 'faible';
}

export interface DetailOptions {
  /** Thèmes à détailler (parcours principal) ; vide : pas de barres par thème (une catégorie). */
  themes: readonly string[];
  questionHref: (id: string) => string;
  /** Précision affichée après le titre de la question (« amendement »…), le cas échéant. */
  precision?: (q: Question) => string | null;
}

export function CandidateDetail({ s, themes: themeList, questionHref, precision }: { s: CandidateScore } & DetailOptions) {
  const themes = scoreByTheme(s, themeList).filter((t) => t.n > 0);
  const rows = s.details.filter((d) => d.answer);
  return (
    <div className="detail">
      {themes.length > 0 && (
        <>
          <h4>Par thème</h4>
          <ul className="themebars">
            {themes.map((t) => (
              <li key={t.theme}>
                <span className="themebars__name">{t.theme}</span>
                <span className="themebars__bar" aria-hidden="true">
                  <span style={{ width: `${(t.score ?? 0) * 100}%` }} />
                </span>
                <span className="themebars__val">
                  {formatPercent(t.score)} <span className="muted">({plural(t.n, 'question')})</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <h4>Question par question</h4>
      <ul className="qlist">
        {rows.map((d) => {
          const p = precision?.(d.question) ?? null;
          return (
            <li key={d.question.id} className={`qlist__item qlist__item--${d.verdict}`}>
              <span className="qlist__verdict" aria-hidden="true">
                {VERDICT_ICON[d.verdict]}
              </span>
              <span className="qlist__body">
                <a href={questionHref(d.question.id)}>{d.question.titre}</a>
                {p && <span className="qlist__precision"> ({p})</span>}
                <span className="qlist__meta">
                  Vous&nbsp;: {d.answer ? ANSWER_LABEL[d.answer] : '—'} · Candidat&nbsp;: {STANCE_LABEL[d.position?.stance ?? 'inconnu']}{' '}
                  {d.position && d.position.evidence !== 'inconnu' && <EvidenceBadge evidence={d.position.evidence} />}
                  <span className="sr-only"> — {VERDICT_LABEL[d.verdict]}</span>
                  <span aria-hidden="true" className="muted"> · {VERDICT_LABEL[d.verdict]}</span>
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Classement (candidats classés) puis « Données insuffisantes ». */
export function Ranking({ classes, insuffisants, ...detail }: { classes: CandidateScore[]; insuffisants: CandidateScore[] } & DetailOptions) {
  return (
    <>
      <h2>Classement par taux d’accord</h2>
      {classes.length === 0 ? (
        <p>Aucun candidat n’a au moins {MIN_COMPARABLE} questions comparables avec vos réponses.</p>
      ) : (
        <ol className="ranking">
          {classes.map((s, i) => {
            const c = candidatsById.get(s.candidatId);
            return (
              <li key={s.candidatId} className="rank">
                <div className="rank__head">
                  <span className="rank__pos" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="rank__who">
                    <strong className="rank__name">
                      <a href={candidatHref(s.candidatId)}>{c?.nom}</a>
                    </strong>
                    <span className="rank__parti">{c?.parti}</span>
                  </span>
                  <span className="rank__score">{formatPercent(s.score)}</span>
                </div>
                <div className="rank__bar" aria-hidden="true">
                  <span style={{ width: `${(s.score ?? 0) * 100}%` }} />
                </div>
                <p className="rank__meta">
                  {plural(s.comparables, 'question comparable', 'questions comparables')}, dont{' '}
                  {plural(s.votesReels, 'vote nominatif', 'votes nominatifs')} · {s.accords} accord
                  {s.accords > 1 ? 's' : ''}, {s.desaccords} désaccord{s.desaccords > 1 ? 's' : ''}
                  {s.abstentions > 0 ? `, ${plural(s.abstentions, 'abstention')}` : ''} · confiance{' '}
                  <strong>{confidenceLabel(s.confiance)}</strong> ({formatPercent(s.confiance)} du poids issu de votes
                  réels)
                </p>
                <details className="rank__details">
                  <summary>
                    Détail<span className="sr-only"> pour {c?.nom}</span>
                  </summary>
                  <CandidateDetail s={s} {...detail} />
                </details>
              </li>
            );
          })}
        </ol>
      )}

      {insuffisants.length > 0 && (
        <section aria-labelledby="insuffisant-title">
          <h2 id="insuffisant-title">Données insuffisantes</h2>
          <p className="muted small">
            Moins de {MIN_COMPARABLE} questions comparables avec vos réponses&nbsp;: pas de classement.
          </p>
          <ul className="insuff">
            {insuffisants.map((s) => {
              const c = candidatsById.get(s.candidatId);
              return (
                <li key={s.candidatId}>
                  <strong>
                    <a href={candidatHref(s.candidatId)}>{c?.nom}</a>
                  </strong>{' '}
                  <span className="muted">— {c?.parti}</span>&nbsp;:{' '}
                  {plural(s.comparables, 'question comparable', 'questions comparables')}
                  {s.comparables > 0 && (
                    <details className="rank__details">
                      <summary>
                        Détail<span className="sr-only"> pour {c?.nom}</span>
                      </summary>
                      <CandidateDetail s={s} {...detail} />
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

export function VotesToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="toggle">
      <input id="votes-seulement" type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      <label htmlFor="votes-seulement">Ne compter que les votes nominatifs (exclure gouvernement, déclarations et proxies)</label>
    </div>
  );
}

export function ShareBox({ url, explication }: { url: string; explication: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section className="card share" aria-labelledby="share-title">
      <h2 id="share-title">Partager mon résultat</h2>
      <p className="small muted">{explication}</p>
      <div className="share__row">
        <label htmlFor="share-url" className="sr-only">
          Lien de partage
        </label>
        <input id="share-url" type="text" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn btn--primary" onClick={() => void copy()}>
          Copier le lien
        </button>
      </div>
      <p role="status" className="small">
        {copied ? 'Lien copié.' : ''}
      </p>
    </section>
  );
}
