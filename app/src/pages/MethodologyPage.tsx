import { useEffect } from 'react';
import { ExtLink } from '../components/ExtLink';
import { PageTitle } from '../components/PageTitle';
import { renseigne, SITE } from '../config';
import { categories } from '../lib/approfondi';
import { MIN_QUESTIONS_CATEGORIE } from '../lib/categories';
import { data, periode, quickQuestions } from '../lib/data';
import { formatDate, formatPercent, formatPeriodes } from '../lib/format';
import {
  APPARTENANCE_LABEL,
  FAMILLE_CONTENU,
  FAMILLE_LABEL,
  FAMILLES,
  MENTION_ECARTEE,
  MENTION_PROBITE,
  STATUT_LABEL,
  STATUTS,
  TITRE_PASSIF,
} from '../lib/justice';
import { collator } from '../lib/scoring';
import { href } from '../lib/router';
import {
  AGREEMENT,
  CONFIDENCE_THRESHOLDS,
  EVIDENCE_LABELS,
  EVIDENCE_WEIGHTS,
  MIN_COMPARABLE,
  QUICK_COUNT,
} from '../lib/weights';
import type { EvidenceType } from '../types';

const ORDER: EvidenceType[] = [
  'vote_an',
  'vote_congres',
  'vote_senat',
  'vote_pe',
  'gouvernement',
  'declaration',
  'censure_implicite',
  'groupe',
];

const num = (n: number) => String(n).replace('.', ',');

/** Candidats dont le proxy de groupe est limité dans le temps (ordre alphabétique). */
const proxiesDates = data.candidats
  .filter((c) => c.proxy.periodes.length > 0)
  .sort((a, b) => collator.compare(a.tri, b.tri));

/** Citations confrontées au compte rendu de séance (orateur réel identifié). */
const attributions = data.questions.flatMap((q) => Object.values(q.candidats).map((p) => p.attribution));
const citationsVerifiees = attributions.filter((a) => a?.verification === 'compte-rendu').length;
const citationsDeTiers = attributions.filter((a) => a?.verification === 'compte-rendu' && a.duCandidat === false).length;

const fichesPartis = data.partis.filter((p) => p.fiche !== null).length;
const fichesAppartenance = data.partis.filter((p) => p.fiche?.appartenance === 'lue').length;
const fichesAnciens = data.partis.filter((p) => p.fiche && p.fiche.anciens.liste !== 'absente').length;

/** Mode approfondi : nombre total de questions et nombre de questions reprises du parcours principal. */
const approTotal = categories.reduce((n, c) => n + c.questions.length, 0);
const approExistantes = categories.reduce((n, c) => n + c.questions.filter((r) => r.existant).length, 0);
const approCiblees = categories.reduce((n, c) => n + c.questions.filter((r) => r.portee === 'article' || r.portee === 'amendement').length, 0);

export function MethodologyPage({ section = null }: { section?: string | null }) {
  const withResearch = data.questions.filter((q) => q.recherche).length;
  // #/methodologie?section=<id> : arrivée directe sur une section (après le défilement en haut de page du titre) ;
  // le focus suit, pour que la tabulation reparte de la section.
  useEffect(() => {
    const target = section ? document.getElementById(section) : null;
    target?.scrollIntoView({ block: 'start' });
    target?.focus({ preventScroll: true });
  }, [section]);
  return (
    <div className="prose">
      <PageTitle title="Méthodologie" />
      <p className="lead">
        Vote réel compare vos réponses à des positions <strong>documentées</strong> des candidats sur{' '}
        {data.questions.length} questions votées au Parlement entre {periode.debut} et {periode.fin}. Chaque position
        affichée indique sa nature de preuve et sa source.
      </p>

      <h2>Sources des données</h2>
      <ul>
        <li>
          <strong>Votes officiels</strong>&nbsp;: open data de l’Assemblée nationale (
          <ExtLink href="https://data.assemblee-nationale.fr">data.assemblee-nationale.fr</ExtLink>) — scrutins des
          législatures 14 à 17, acteurs, mandats et organes, collectés le {formatDate(data.collecteAN?.slice(0, 10) ?? null)}.
          Pour chaque question&nbsp;: résultat, ventilation par groupe, vote nominatif de chaque candidat député (ou membre du
          Congrès) et appartenance au gouvernement à la date du vote. Ces votes font foi.
        </li>
        <li>
          <strong>Recherche documentaire</strong> ({withResearch} questions sur {data.questions.length} documentées à
          ce jour)&nbsp;: contexte, arguments des groupes (de préférence tirés des comptes rendus de séance), positions des
          candidats sans vote à l’Assemblée (Sénat, Congrès, Parlement européen, gouvernement, déclarations). Chaque
          élément porte une URL et, quand c’est possible, une citation copiée mot pour mot de la source. Une recherche
          qui contredit un vote officiel est signalée et le vote officiel est retenu.
        </li>
        <li>
          <strong>Choix des questions</strong>&nbsp;: une question par grand texte ou débat de la période, formulée de façon
          neutre et vérifiée contre le contenu du texte&nbsp;; le scrutin de référence est en principe le vote solennel sur
          l’ensemble du texte.
        </li>
      </ul>

      <h2>Qui parle&nbsp;? Propos du candidat ou de son groupe</h2>
      <p>
        Sous chaque candidat, <strong>«&nbsp;Ses raisons&nbsp;»</strong> rapporte ses propres propos. Quand aucune prise de
        parole personnelle n’a été retrouvée, l’argument affiché est celui d’un autre député de son groupe (le plus
        souvent son explication de vote)&nbsp;: il est alors titré <strong>«&nbsp;Argument de son groupe&nbsp;»</strong> et son
        auteur réel est nommé («&nbsp;Propos de X (groupe Y), pas de Z&nbsp;»)&nbsp;; de même, une position du Gouvernement est
        titrée «&nbsp;Argument du Gouvernement&nbsp;». Les citations tirées des comptes rendus de séance ont été
        rapprochées de l’orateur qui les a prononcées ({citationsVerifiees} citations vérifiées, dont {citationsDeTiers}{' '}
        prononcées par un autre député que le candidat).
      </p>

      <h2>Version «&nbsp;En clair&nbsp;»</h2>
      <p>
        Chaque question est aussi reformulée en langage courant, avec le même sens (Oui veut toujours dire la même
        chose)&nbsp;: un résumé de ce que change le texte, les arguments de chaque camp et ce qui s’est passé ensuite. Ces
        textes s’appuient uniquement sur la recherche documentaire sourcée. «&nbsp;Ceux qui disent Oui&nbsp;» et «&nbsp;Ceux
        qui disent Non&nbsp;» se rapportent à la question posée, pas au vote pour ou contre le texte (pour les retraites, le
        scrutin est une motion de censure&nbsp;: dire Oui à la réforme revenait à ne pas voter la censure). Les deux camps
        ont la même présentation et leur ordre alterne d’une question à l’autre. La formulation complète et le contexte
        détaillé, avec leurs sources, restent accessibles sur chaque question.
      </p>

      <h2>Hiérarchie des preuves</h2>
      <p>Pour chaque candidat et chaque question, la position retenue est la première disponible dans cet ordre&nbsp;:</p>
      <ol>
        <li>
          <strong>Vote nominatif officiel</strong> à l’Assemblée nationale ou au Congrès (open data).
        </li>
        <li>
          <strong>Preuve documentée par la recherche</strong>&nbsp;: vote nominatif au Sénat, au Congrès ou au Parlement
          européen, rôle au gouvernement qui a porté le texte, ou déclaration publique datée et sourcée.
        </li>
        <li>
          <strong>Motion de censure</strong>&nbsp;: un député en mandat qui ne figure pas parmi les votants n’a pas voté la
          censure — soutien implicite au texte, à faible poids.
        </li>
        <li>
          <strong>Membre du gouvernement</strong> à la date du vote&nbsp;: position du gouvernement, si la recherche la
          documente.
        </li>
        <li>
          <strong>Proxy</strong>&nbsp;: position majoritaire, dans ce scrutin, du groupe parlementaire du parti du candidat,
          seulement si le candidat appartenait à ce parti (ou à une formation alliée) à la date du scrutin. Ce n’est
          pas un vote du candidat&nbsp;; c’est toujours signalé comme tel.
        </li>
        <li>
          Sinon&nbsp;: <strong>position inconnue</strong>. Un député présent dans l’hémicycle à cette date mais qui n’a pas
          pris part au vote est classé «&nbsp;inconnu&nbsp;» (mention «&nbsp;n’a pas pris part au vote&nbsp;»), sans proxy.
        </li>
      </ol>
      {proxiesDates.length > 0 && (
        <>
          <p>Proxies limités dans le temps (en dehors de ces périodes, aucun proxy n’est appliqué)&nbsp;:</p>
          <ul className="proxies-dates">
            {proxiesDates.map((c) => (
              <li key={c.id}>
                <strong>{c.nom}</strong>&nbsp;:{' '}
                {c.proxy.motif ?? `groupe${c.proxy.groupes.length > 1 ? 's' : ''} ${c.proxy.groupes.join(', ')}, ${formatPeriodes(c.proxy.periodes)}.`}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Calcul du score</h2>
      <p>Pour chaque question à laquelle vous avez répondu Oui ou Non et où la position du candidat est connue&nbsp;:</p>
      <ul>
        <li>
          même position que vous&nbsp;: accord ({num(AGREEMENT.accord)})&nbsp;; position opposée&nbsp;: désaccord (
          {num(AGREEMENT.desaccord)})&nbsp;; abstention du candidat&nbsp;: demi-accord ({num(AGREEMENT.abstention)})&nbsp;;
        </li>
        <li>question passée ou position inconnue&nbsp;: exclue du calcul.</li>
      </ul>
      <p>Chaque question est pondérée selon la nature de la preuve&nbsp;:</p>
      <div className="table-scroll">
        <table className="weights">
          <caption className="sr-only">Poids par nature de preuve</caption>
          <thead>
            <tr>
              <th scope="col">Nature de la preuve</th>
              <th scope="col">Poids</th>
            </tr>
          </thead>
          <tbody>
            {ORDER.map((e) => (
              <tr key={e}>
                <th scope="row">{EVIDENCE_LABELS[e].long}</th>
                <td>{num(EVIDENCE_WEIGHTS[e])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="formula">
        Score = Σ (poids × accord) ÷ Σ (poids), sur les questions comparables.
      </p>
      <ul>
        <li>
          Le score est toujours affiché avec sa <strong>couverture</strong>&nbsp;: nombre de questions comparables, dont
          votes nominatifs.
        </li>
        <li>
          <strong>Indice de confiance</strong>&nbsp;: part du poids total issue de votes nominatifs (élevée à partir de{' '}
          {formatPercent(CONFIDENCE_THRESHOLDS.elevee)}, moyenne à partir de{' '}
          {formatPercent(CONFIDENCE_THRESHOLDS.moyenne)}, faible en dessous).
        </li>
        <li>
          Un candidat avec moins de {MIN_COMPARABLE} questions comparables n’est pas classé («&nbsp;données
          insuffisantes&nbsp;»).
        </li>
        <li>Une option permet de ne compter que les votes nominatifs.</li>
        <li>À égalité de score, les candidats sont présentés par ordre alphabétique.</li>
      </ul>

      <h2>Mode rapide</h2>
      <p>
        Le mode rapide propose {quickQuestions.length} questions (paramètre&nbsp;: {QUICK_COUNT}), choisies automatiquement
        pour couvrir tous les thèmes&nbsp;: à chaque tour, chaque thème fournit sa question la mieux documentée (le plus de
        candidats ayant un vote nominatif, puis le plus de positions connues, puis la plus récente). Aucune question
        n’est choisie à la main.
      </p>

      {categories.length > 0 && (
        <>
          <h2 id="approfondi" tabIndex={-1}>
            Mode «&nbsp;Approfondir par catégorie&nbsp;»
          </h2>
          <p>
            Pour aller plus loin que les deux parcours, {categories.length} catégories proposent chacune une série de
            questions sur un même sujet ({approTotal} questions au total, dont {approExistantes} reprises telles quelles du
            parcours principal)&nbsp;:{' '}
            {categories.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ', '}
                {c.libelle} ({c.questions.length})
              </span>
            ))}
            .
          </p>
          <ul>
            <li>
              <strong>Choix des scrutins</strong>&nbsp;: le vote sur l’ensemble d’un texte est retenu en priorité. En
              complément, quand un débat important s’est joué sur une disposition précise, le scrutin retenu peut porter sur
              un article ou un amendement emblématique ({approCiblees} question{approCiblees > 1 ? 's' : ''} sur{' '}
              {approTotal}). Cette portée est indiquée sur chaque question («&nbsp;Vote sur un article&nbsp;», «&nbsp;Vote sur
              un amendement&nbsp;»), dans la liste des questions et dans le détail des résultats&nbsp;: un vote sur une
              disposition ne résume pas la position sur l’ensemble du texte.
            </li>
            <li>
              <strong>Même traitement que le parcours principal</strong>&nbsp;: votes officiels extraits de l’open data de
              l’Assemblée nationale (résultat, ventilation par groupe, vote nominatif des candidats députés, appartenance au
              gouvernement à la date), même hiérarchie des preuves, mêmes proxies datés, même recherche documentaire
              (contexte, arguments, version «&nbsp;En clair&nbsp;») et même présentation. Une question dont la recherche
              n’est pas encore disponible s’affiche avec les votes nominatifs et, à défaut, les proxies de groupe&nbsp;; elle
              est signalée comme telle.
            </li>
            <li>
              <strong>Résultat par catégorie</strong>&nbsp;: classement des candidats sur les seules questions de la
              catégorie, avec les mêmes poids, la même couverture, le même indice de confiance et le même seuil de{' '}
              {MIN_COMPARABLE} questions comparables. Il ne se cumule pas avec le résultat du parcours principal.
            </li>
            <li>
              <strong>Vos réponses</strong>&nbsp;: enregistrées dans votre navigateur, catégorie par catégorie&nbsp;; vous
              pouvez en faire plusieurs et reprendre plus tard. Une question du parcours principal reprise dans une catégorie
              n’a qu’une réponse&nbsp;: si vous y avez déjà répondu, votre réponse est reprise, et la modifier dans la
              catégorie la modifie aussi dans le parcours principal.
            </li>
            <li>
              <strong>Partage</strong>&nbsp;: le lien encode vos réponses à la catégorie (une lettre par question, dans
              l’ordre de la catégorie) et une clé de contrôle&nbsp;; si la liste des questions a changé depuis, le lien est
              signalé comme périmé plutôt que relu de travers. Les liens du parcours principal ne changent pas.
            </li>
            <li>Une catégorie n’est proposée qu’à partir de {MIN_QUESTIONS_CATEGORIE} questions.</li>
          </ul>
        </>
      )}

      <h2>Cas particuliers</h2>
      <ul>
        <li>
          <strong>Correspondance Oui / Non</strong>&nbsp;: pour chaque question, la recherche précise quelle position au
          scrutin correspond à «&nbsp;Oui&nbsp;» (en général «&nbsp;pour&nbsp;»).
        </li>
        <li>
          <strong>Retraites 2023</strong>&nbsp;: la réforme a été adoptée sans vote sur le texte (article 49.3). Le scrutin
          de référence est la motion de censure transpartisane du 20 mars 2023&nbsp;: voter la censure revient à répondre
          Non à la réforme. Seuls les votes «&nbsp;pour&nbsp;» la censure sont enregistrés.
        </li>
        <li>
          <strong>Position majoritaire des groupes</strong>&nbsp;: elle est recalculée à partir du décompte nominatif, le
          champ correspondant de l’open data étant parfois incohérent avec ce décompte. Pour une motion de censure, un
          groupe est réputé l’avoir votée si plus de la moitié de ses membres l’ont votée.
        </li>
        <li>
          <strong>Ordre des candidats</strong>&nbsp;: toujours alphabétique (nom de famille), sauf dans le classement qui
          dépend de vos réponses. Aucune couleur de parti n’est utilisée.
        </li>
      </ul>

      <h2>Limites</h2>
      <ul>
        <li>
          Plusieurs candidats n’ont jamais siégé à l’Assemblée sur la période ou n’y siégeaient plus&nbsp;: leurs positions
          reposent sur d’autres preuves, moins directes, ou sont inconnues.
        </li>
        <li>
          Un proxy de groupe peut ne pas refléter l’avis personnel du candidat. L’appartenance d’un candidat à un parti
          a pu changer au fil du temps&nbsp;: le proxy est alors limité aux périodes indiquées ci-dessus.
        </li>
        <li>Un vote porte sur un texte entier&nbsp;: on peut voter contre un texte pour des raisons très différentes.</li>
        <li>Les positions ont pu évoluer depuis le vote.</li>
        <li>
          La sélection de {data.questions.length} questions ne couvre pas tous les sujets&nbsp;; le score n’est pas une
          recommandation de vote.
        </li>
      </ul>

      <h2 id="condamnations" tabIndex={-1}>
        Condamnations&nbsp;: périmètre et règles
      </h2>
      <p>
        La page de chaque candidat (rubrique <a href={href('/candidats')}>Partis &amp; candidats</a>) présente les
        condamnations en justice relevées par la recherche documentaire, selon les mêmes règles et la même mise en page
        pour tous les partis ({fichesPartis} fiche{fichesPartis > 1 ? 's' : ''} de parti publiée{fichesPartis > 1 ? 's' : ''}{' '}
        sur {data.partis.length} à ce jour). Mieux vaut une liste incomplète et exacte qu’une liste complète et fausse.
      </p>
      <h3>Périmètre (identique pour tous les partis)</h3>
      <ol>
        <li>le candidat ou la candidate&nbsp;;</li>
        <li>
          le parti en tant que personne morale, et ses prédécesseurs directs (Front national pour le Rassemblement
          national, UMP pour Les Républicains, La République en marche pour Renaissance, EELV pour Les Écologistes…)&nbsp;;
        </li>
        <li>ses présidents, premiers secrétaires ou secrétaires nationaux successifs, prédécesseurs compris&nbsp;;</li>
        <li>sa direction nationale actuelle (président, vice-présidents, secrétaire général, trésorier, porte-parole)&nbsp;;</li>
        <li>
          ses parlementaires en exercice&nbsp;: députés membres ou apparentés (d’après l’open data de l’Assemblée nationale),
          sénateurs, députés européens.
        </li>
      </ol>
      <p>
        Les élus locaux et les militants n’en font partie que s’ils relèvent aussi de l’une de ces catégories. Une
        recherche complémentaire porte sur les <strong>anciens membres</strong> (départ, exclusion ou décès) qui ont
        exercé une fonction de direction nationale du parti (à toute époque) ou, depuis 2012, un mandat parlementaire ou
        une fonction ministérielle sous son étiquette ou celle de son prédécesseur direct&nbsp;: leurs condamnations
        figurent dans le passif du parti, sans être comptées (voir{' '}
        <a href={href('/methodologie?section=appartenance')}>Appartenance actuelle</a>).
      </p>
      <h3>Ce qui est retenu</h3>
      <ul>
        <li>
          Les décisions pénales de culpabilité (tribunal correctionnel, cour d’appel, cour d’assises, Cour de cassation qui
          rejette un pourvoi, Cour de justice de la République), y compris en droit de la presse (diffamation, injure,
          provocation)&nbsp;; les condamnations de la Cour de discipline budgétaire et financière (nature «&nbsp;financière&nbsp;»)&nbsp;;
          une condamnation civile pour diffamation clairement rapportée (nature «&nbsp;civile&nbsp;»).
        </li>
        <li>
          Sans limite de date. La date de la décision est indiquée au jour près quand les sources la donnent, sinon au mois
          ou à l’année («&nbsp;en mai 2015&nbsp;», «&nbsp;en 1998&nbsp;»).
        </li>
        <li>
          Chaque condamnation porte un statut&nbsp;:{' '}
          {STATUTS.map((s, i) => (
            <span key={s}>
              {i > 0 && ', '}«&nbsp;{STATUT_LABEL[s]}&nbsp;»
            </span>
          ))}
          . «&nbsp;Statut non confirmé&nbsp;» signifie que la recherche n’a pas pu établir si un recours est en cours.
          Toute personne est présumée innocente tant qu’une décision n’est pas définitive.
        </li>
      </ul>
      <h3>Ce qui est exclu</h3>
      <ul>
        <li>les mises en examen, gardes à vue, enquêtes, plaintes et procès en cours sans jugement&nbsp;;</li>
        <li>
          les relaxes et non-lieux, et les condamnations de première instance infirmées en appel ou annulées&nbsp;;
        </li>
        <li>les condamnations amnistiées ou dont la réhabilitation est connue&nbsp;;</li>
        <li>
          les décisions purement civiles, prud’homales ou administratives (hors diffamation), et les sanctions disciplinaires
          internes aux partis.
        </li>
      </ul>
      <h3 id="familles" tabIndex={-1}>
        Familles de condamnations
      </h3>
      <p>
        Chaque condamnation est rangée dans une famille d’après sa qualification juridique (l’infraction retenue par la
        juridiction, telle que la rapportent les sources). Les familles sont présentées dans cet ordre, de la plus grave à
        la moins grave&nbsp;:
      </p>
      <div className="table-scroll">
        <table className="familles">
          <caption className="sr-only">Familles de condamnations, de la plus grave à la moins grave</caption>
          <thead>
            <tr>
              <th scope="col">Rang</th>
              <th scope="col">Famille</th>
              <th scope="col">Ce qu’elle regroupe</th>
            </tr>
          </thead>
          <tbody>
            {FAMILLES.map((f, i) => (
              <tr key={f}>
                <td>{i + 1}</td>
                <th scope="row">{FAMILLE_LABEL[f]}</th>
                <td>{FAMILLE_CONTENU[f]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul>
        <li>
          <strong>L’ordre de gravité est un choix éditorial</strong> de l’utilisateur à l’origine de ce site (usage
          personnel)&nbsp;: il ne reproduit ni une hiérarchie fixée par la loi ni l’échelle des peines encourues. La probité
          passe en premier («&nbsp;{MENTION_PROBITE}&nbsp;»)&nbsp;: sur la page de chaque candidat, cette famille est mise en
          avant par un pictogramme et un filet, sans couleur d’alerte.
        </li>
        <li>
          Le classement suit la qualification juridique, pas une appréciation des faits&nbsp;; une décision qui retient
          plusieurs infractions est rangée dans la famille de la plus grave d’entre elles.
        </li>
        <li>
          La famille ne dit rien du statut&nbsp;: une condamnation frappée d’appel ou d’un pourvoi n’est pas une condamnation
          définitive. Le badge de statut reste l’information principale de chaque condamnation.
        </li>
        <li>
          Sur la page d’un candidat, une synthèse compte les condamnations de chaque famille en distinguant la personne
          candidate, le parti (personne morale) et les membres actuels, avec le statut des décisions&nbsp;; la liste est
          regroupée par famille, puis par catégorie de personne, puis par date (la plus récente d’abord), et peut être
          filtrée par famille. Dans la liste <a href={href('/candidats')}>Partis &amp; candidats</a>, chaque carte indique
          les familles non nulles (option «&nbsp;Probité uniquement&nbsp;»)&nbsp;; les candidats restent dans l’ordre
          alphabétique, sans classement par nombre de condamnations.
        </li>
        <li>
          Une condamnation dont la fiche ne précise pas la famille, ou en donne une invalide, est affichée dans «&nbsp;
          {FAMILLE_LABEL.autres}&nbsp;» et signalée dans le rapport de contrôle des données. Une famille qui semble ne pas
          correspondre à la qualification juridique est signalée pour relecture, jamais corrigée automatiquement.
        </li>
      </ul>
      <h3 id="appartenance" tabIndex={-1}>
        Appartenance actuelle
      </h3>
      <p>
        Une condamnation ne pèse pas de la même façon selon que la personne est toujours au parti ou qu’elle l’a
        quitté&nbsp;: le parti répond d’abord des personnes qu’il garde. Chaque condamnation porte donc un badge
        d’appartenance actuelle, avec sa source quand la recherche l’a établie (lien et citation dépliables), et se range
        dans l’un de deux niveaux&nbsp;:
      </p>
      <ol>
        <li>
          <strong>Toujours au parti (comptées)</strong>&nbsp;: la personne candidate elle-même, toujours&nbsp;; le parti
          en tant que personne morale («&nbsp;{APPARTENANCE_LABEL.personne_morale}&nbsp;»)&nbsp;; ses membres
          («&nbsp;{APPARTENANCE_LABEL.membre}&nbsp;»), y compris en cas de suspension sans exclusion
          («&nbsp;{APPARTENANCE_LABEL.suspendu} depuis…&nbsp;»). Ce sont <strong>les seules</strong> condamnations comptées
          dans la synthèse de la page d’un candidat et sur les cartes «&nbsp;Partis &amp; candidats&nbsp;», y compris avec
          l’option «&nbsp;Probité uniquement&nbsp;».
        </li>
        <li>
          <strong>Anciens membres (passif, non comptées)</strong>&nbsp;: exclusion («&nbsp;{APPARTENANCE_LABEL.exclu}&nbsp;»),
          départ («&nbsp;{APPARTENANCE_LABEL.depart}&nbsp;»), retrait de la vie politique sans adhésion confirmée
          («&nbsp;{APPARTENANCE_LABEL.retire}&nbsp;»), décès («&nbsp;{APPARTENANCE_LABEL.decede}&nbsp;»), ou appartenance
          que la recherche n’a pas pu établir («&nbsp;{APPARTENANCE_LABEL.inconnu}&nbsp;»)&nbsp;; et toutes les
          condamnations de la recherche complémentaire sur les anciens membres, quel que soit le statut qu’elle
          indique. Elles restent visibles, à part, sous la
          liste principale, dans une section «&nbsp;{TITRE_PASSIF}&nbsp;» au style atténué, regroupées par famille puis
          par personne, avec une ligne de contexte («&nbsp;Exclusion du parti en 2015 — en lien avec l’affaire&nbsp;»,
          «&nbsp;A quitté le parti en 2019&nbsp;», «&nbsp;Décès en 2025&nbsp;»). La synthèse en donne une ligne discrète,
          les cartes un «&nbsp;(+N anciens)&nbsp;».
        </li>
      </ol>
      <ul>
        <li>
          Une exclusion décidée à cause de l’affaire est mise en valeur&nbsp;: «&nbsp;{MENTION_ECARTEE}&nbsp;». La
          réaction connue du parti envers la personne (soutien public, sanction) est indiquée aux deux niveaux.
        </li>
        <li>
          L’appartenance est relevée à la date des fiches, pour chaque personne condamnée&nbsp;: un apparenté n’est pas un
          membre, un groupe parlementaire n’est pas un parti, une suspension n’est pas une exclusion. Sans source, ou si
          la personne n’est pas documentée, le statut est «&nbsp;{APPARTENANCE_LABEL.inconnu}&nbsp;» et la condamnation
          va au passif&nbsp;; la personne candidate reste toujours comptée. Appartenance documentée pour{' '}
          {fichesAppartenance} fiche{fichesAppartenance > 1 ? 's' : ''} de parti, recherche sur les anciens membres
          publiée pour {fichesAnciens}.
        </li>
        <li>
          Les familles et les statuts judiciaires (définitive, appel, pourvoi) s’appliquent à l’identique dans chaque
          niveau. Les libellés d’appartenance sont épicènes, comme ceux du statut.
        </li>
      </ul>
      <h3>Sources et contrôles</h3>
      <ul>
        <li>
          Chaque condamnation affichée s’appuie sur au moins une source fiable consultée par la recherche (presse nationale
          ou régionale de référence, AFP, communiqué ou décision de juridiction, Légifrance, Judilibre&nbsp;; Wikipédia
          seulement si elle renvoie à une source secondaire elle-même consultée), avec une courte citation copiée mot pour
          mot qui établit la condamnation et sa nature. La citation se déplie sous chaque source.
        </li>
        <li>
          À la construction du site, une condamnation sans source http(s) accompagnée d’une citation, dont le statut, la
          catégorie ou la nature est invalide, ou dont la date est invalide (AAAA, AAAA-MM ou AAAA-MM-JJ attendue) ou
          postérieure à la construction, est écartée&nbsp;: elle n’est jamais affichée et figure dans le rapport de contrôle
          des données, pour correction.
        </li>
        <li>
          Chaque liste indique la date à laquelle les sources ont été consultées&nbsp;: une absence de mention ne signifie pas
          absence de condamnation. «&nbsp;Aucune condamnation trouvée&nbsp;»&nbsp;: la recherche n’en a relevé aucune pour
          ce parti&nbsp;; «&nbsp;aucune condamnation retenue&nbsp;»&nbsp;: aucune entrée de cette catégorie ne figure dans la
          liste ou n’a passé les contrôles&nbsp;; «&nbsp;recherche en cours&nbsp;»&nbsp;: la liste du parti n’est pas encore
          publiée.
        </li>
      </ul>
      <h3>Neutralité</h3>
      <ul>
        <li>même périmètre, même effort de recherche, même mise en page pour tous les partis&nbsp;;</li>
        <li>
          compteurs par statut et par famille seulement, selon la même règle d’appartenance pour tous&nbsp;: aucun
          classement des partis ou des candidats par nombre de condamnations (ordre alphabétique), aucune couleur
          d’alerte&nbsp;;
        </li>
        <li>
          présentation des partis et biographies factuelles, chacune avec ses sources
          {renseigne(SITE.contactRectification) !== null && <>&nbsp;; une demande de rectification peut être adressée depuis chaque page</>}.
        </li>
      </ul>

      <h2>Mise à jour</h2>
      <p>
        Données générées le {formatDate(data.genereLe.slice(0, 10))}&nbsp;; open data de l’Assemblée nationale collectée le{' '}
        {formatDate(data.collecteAN?.slice(0, 10) ?? null)}. Toutes les URLs utilisées sont listées sur la page{' '}
        <a href={href('/sources')}>Sources</a>.
      </p>
    </div>
  );
}
