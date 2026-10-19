import { ExtLink } from '../components/ExtLink';
import { PageTitle } from '../components/PageTitle';
import { renseigne, SITE } from '../config';
import { navigate } from '../lib/router';
import { useQuiz } from '../state/useQuiz';

/** Message affiché quand aucun champ éditorial n'est renseigné (src/config.ts). */
export const USAGE_PERSONNEL = 'Site à usage personnel.';

function Valeur({ value }: { value: string }) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return <a href={`mailto:${value}`}>{value}</a>;
  if (/^https?:\/\//.test(value)) return <ExtLink href={value}>{value}</ExtLink>;
  return <>{value}</>;
}

/** Éditeur, contact, hébergeur : seuls les champs renseignés sont affichés ; aucun → « Site à usage personnel. » */
export function Edition({ site = SITE }: { site?: Pick<typeof SITE, 'editeur' | 'contact' | 'hebergeur'> }) {
  const champs = [
    { label: 'Éditeur', value: renseigne(site.editeur) },
    { label: 'Contact', value: renseigne(site.contact) },
    { label: 'Hébergeur', value: renseigne(site.hebergeur) },
  ].filter((c): c is { label: string; value: string } => c.value !== null);
  if (champs.length === 0) return <p>{USAGE_PERSONNEL}</p>;
  return (
    <ul className="edition">
      {champs.map((c) => (
        <li key={c.label}>
          {c.label}&nbsp;: <Valeur value={c.value} />
        </li>
      ))}
    </ul>
  );
}

export function MentionsPage() {
  const { reset } = useQuiz();
  return (
    <div className="prose">
      <PageTitle title="Mentions" />
      <h2>Indépendance</h2>
      <p>
        {SITE.nom} est un site indépendant. Il n’est affilié à aucun parti, candidat, groupe parlementaire, ni à
        l’Assemblée nationale, au Sénat ou au Parlement européen, et n’est financé par aucun d’entre eux. Il ne donne
        aucune consigne de vote.
      </p>
      <h2>Éditeur et hébergement</h2>
      <Edition />
      <h2>Données personnelles</h2>
      <p>
        Aucune donnée personnelle n’est collectée&nbsp;: pas de compte, pas de cookie, pas de mesure d’audience, aucune
        ressource chargée depuis un service tiers. Vos réponses sont enregistrées uniquement dans votre navigateur
        (stockage local) pour vous permettre de reprendre le quiz&nbsp;; le lien de partage contient vos réponses et
        n’est transmis qu’aux personnes à qui vous l’envoyez.
      </p>
      <p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            reset();
            navigate('/');
          }}
        >
          Effacer mes réponses de ce navigateur
        </button>
      </p>
      <h2>Données publiques</h2>
      <p>
        Les votes proviennent de l’open data de l’Assemblée nationale (
        <ExtLink href="https://data.assemblee-nationale.fr">data.assemblee-nationale.fr</ExtLink>), réutilisée selon
        les conditions publiées sur ce site. Les citations sont reproduites à titre de courte citation, avec leur
        source.
      </p>
      <h2>Erreurs</h2>
      <p>
        Chaque position est accompagnée de sa source afin de pouvoir être vérifiée. Une erreur peut subsister malgré
        les contrôles&nbsp;: la source primaire fait foi.
      </p>
    </div>
  );
}
