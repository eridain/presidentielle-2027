import type { ReactNode, Ref } from 'react';
import { data } from '../lib/data';
import { ANSWER_LABEL, STANCE_LABEL } from '../lib/format';
import { collator } from '../lib/scoring';
import { argumentsFor } from '../lib/questions';
import { candidatHref } from '../lib/router';
import type { Candidat, CandidatePosition, Question, Stance, UserAnswer } from '../types';
import { ArgumentList } from './ArgumentList';
import { CandidateCard } from './CandidateCard';
import { GroupTable } from './GroupTable';
import { ScrutinCard } from './ScrutinCard';

type Entry = { candidat: Candidat; position: CandidatePosition };

function entriesFor(q: Question, stance: Stance): Entry[] {
  return data.candidats
    .filter((c) => q.candidats[c.id]?.stance === stance)
    .map((c) => ({ candidat: c, position: q.candidats[c.id] as CandidatePosition }))
    .sort((a, b) => collator.compare(a.candidat.tri, b.candidat.tri));
}

function Group({ id, title, entries, q, hint }: { id: string; title: string; entries: Entry[]; q: Question; hint?: string }) {
  return (
    <section className={`cgroup cgroup--${id}`} aria-labelledby={`g-${id}-${q.id}`}>
      <h3 id={`g-${id}-${q.id}`} className="cgroup__title" tabIndex={-1}>
        {title} <span className="count">({entries.length})</span>
      </h3>
      {hint && <p className="cgroup__hint">{hint}</p>}
      {entries.length === 0 ? (
        <p className="muted">Aucun candidat.</p>
      ) : (
        <ul className="cands">
          {entries.map((e) => (
            <CandidateCard key={e.candidat.id} candidat={e.candidat} position={e.position} censure={q.scrutin.censure} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function Reveal({
  question: q,
  answer,
  ref,
  note,
}: {
  question: Question;
  answer: UserAnswer;
  ref?: Ref<HTMLHeadingElement>;
  /** Précision affichée avant le résultat du scrutin (mode approfondi : portée du vote). */
  note?: ReactNode;
}) {
  const answered = answer === 'oui' || answer === 'non';
  const opposite: 'oui' | 'non' = answer === 'oui' ? 'non' : 'oui';
  const oppositeEntries = answered ? entriesFor(q, opposite) : [];
  const oppositeArgs = answered ? argumentsFor(q, opposite) : [];

  return (
    <section className="reveal" aria-labelledby={`reveal-${q.id}`}>
      <p className="reveal__q">
        <span className="label">La question&nbsp;:</span> {q.enClair?.questionSimple ?? q.question}
      </p>
      <h2 id={`reveal-${q.id}`} ref={ref} tabIndex={-1} className="reveal__title">
        {answered ? (
          <>
            Vous avez répondu <strong>{ANSWER_LABEL[answer]}</strong>. Voici ce qui a été voté.
          </>
        ) : (
          <>Question passée. Voici ce qui a été voté.</>
        )}
      </h2>

      {note}
      <ScrutinCard question={q} />

      {answered && (oppositeArgs.length > 0 || oppositeEntries.length > 0) && (
        <section className="otherside" aria-labelledby={`other-${q.id}`}>
          <h3 id={`other-${q.id}`}>
            L’autre point de vue&nbsp;: pourquoi{' '}
            <span className="nowrap">«&nbsp;{STANCE_LABEL[opposite]}&nbsp;»&nbsp;?</span>
          </h3>
          {oppositeEntries.length > 0 && (
            <p>
              <span className="label">Candidats ayant pris la position inverse&nbsp;:</span>{' '}
              {oppositeEntries.map((e, i) => (
                <span key={e.candidat.id}>
                  {i > 0 && ', '}
                  <a href={candidatHref(e.candidat.id)}>{e.candidat.nom}</a>
                </span>
              ))}
              .{' '}
              <button
                type="button"
                className="linklike"
                onClick={() => {
                  const target = document.getElementById(`g-other-${q.id}`);
                  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  target?.focus({ preventScroll: true });
                }}
              >
                Voir leurs fiches
              </button>
            </p>
          )}
          {oppositeArgs.length > 0 ? (
            <>
              <h4 className="otherside__sub">Arguments exprimés lors du débat</h4>
              <ArgumentList items={oppositeArgs} />
            </>
          ) : (
            <p className="muted small">Arguments du débat en cours de documentation.</p>
          )}
        </section>
      )}

      <h3 className="section-title">Les candidats</h3>
      <p className="muted small">
        Ordre alphabétique. Le badge indique la nature de la preuve&nbsp;: un vote nominatif pèse plus qu’une déclaration ou
        qu’un vote de groupe (proxy).
      </p>
      {answered ? (
        <>
          <Group id="same" title={`Même position que vous (${ANSWER_LABEL[answer]})`} entries={entriesFor(q, answer)} q={q} />
          <Group
            id="other"
            title={`Position inverse (${STANCE_LABEL[opposite]})`}
            entries={oppositeEntries}
            q={q}
            hint="Leurs raisons, quand elles sont documentées, figurent sur chaque fiche."
          />
        </>
      ) : (
        <>
          <Group id="oui" title="Oui" entries={entriesFor(q, 'oui')} q={q} />
          <Group id="non" title="Non" entries={entriesFor(q, 'non')} q={q} />
        </>
      )}
      <Group id="abst" title="Abstention" entries={entriesFor(q, 'abstention')} q={q} />
      <Group
        id="unknown"
        title="Position inconnue"
        entries={entriesFor(q, 'inconnu')}
        q={q}
        hint="Pas de vote, de déclaration documentée ni de groupe de référence à la date du scrutin, ou absence lors du vote."
      />

      <details className="more">
        <summary>Arguments pour le Oui et pour le Non</summary>
        <h4>Pour le Oui</h4>
        <ArgumentList items={argumentsFor(q, 'oui')} />
        <h4>Pour le Non</h4>
        <ArgumentList items={argumentsFor(q, 'non')} />
        {q.arguments.abstention.length > 0 && (
          <>
            <h4>Abstention</h4>
            <ArgumentList items={q.arguments.abstention} />
          </>
        )}
      </details>

      <details className="more">
        <summary>Vote par groupe parlementaire</summary>
        <GroupTable question={q} />
      </details>

      {q.alertes.length > 0 && (
        <details className="more">
          <summary>Points d’incertitude signalés par la recherche</summary>
          <ul>
            {q.alertes.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
