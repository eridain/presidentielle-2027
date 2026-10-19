import type { EnClair as EnClairData } from '../types';

/**
 * Bloc « En clair » : l'enjeu en quelques phrases, les arguments des deux camps (même poids visuel)
 * et l'issue réelle. « Ceux qui disent Oui / Non » se rapportent à la question simplifiée, pas au
 * « pour » ou au « contre » du scrutin (cas de la motion de censure sur les retraites).
 */
export function EnClair({ id, enClair: e, ouiEnPremier }: { id: string; enClair: EnClairData; ouiEnPremier: boolean }) {
  const camps = [
    { key: 'oui', titre: 'Ceux qui disent Oui', texte: e.pourquoiPour },
    { key: 'non', titre: 'Ceux qui disent Non', texte: e.pourquoiContre },
  ];
  if (!ouiEnPremier) camps.reverse();
  return (
    <section className="enclair" aria-labelledby={`enclair-${id}`}>
      <h2 id={`enclair-${id}`} className="enclair__title">
        En clair
      </h2>
      <p className="enclair__bref">{e.enBref}</p>
      <div className="camps">
        {camps.map((c) => (
          <section key={c.key} className={`camp camp--${c.key}`} aria-labelledby={`camp-${c.key}-${id}`}>
            <h3 id={`camp-${c.key}-${id}`} className="camp__title">
              {c.titre}
            </h3>
            <p>{c.texte}</p>
          </section>
        ))}
      </div>
      <h3 className="enclair__sub">Ce qui s’est passé</h3>
      <p className="enclair__issue">{e.ceQuiSestPasse}</p>
      {e.lexique.length > 0 && (
        <>
          <h3 className="enclair__sub">Mots à connaître</h3>
          <dl className="lexique">
            {e.lexique.map((l) => (
              <div key={l.terme} className="lexique__item">
                <dt>{l.terme}</dt>
                <dd>{l.definition}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
