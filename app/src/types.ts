// Types partagés entre le pipeline de données (pipeline/) et l'application (src/).
// Le fichier src/generated/data.json produit par `npm run data` est de type AppData.

/** Position exprimée au scrutin (ou équivalente pour une preuve hors scrutin). */
export type ScrutinPosition = 'pour' | 'contre' | 'abstention';

/** Position traduite dans les termes de la question posée à l'électeur. */
export type Stance = 'oui' | 'non' | 'abstention' | 'inconnu';

/** Réponse de l'utilisateur. */
export type UserAnswer = 'oui' | 'non' | 'passe';

/**
 * Nature de la preuve qui fonde la position d'un candidat, de la plus forte à la plus faible.
 * Les poids correspondants sont dans src/lib/weights.ts.
 */
export type EvidenceType =
  | 'vote_an'
  | 'vote_congres'
  | 'vote_senat'
  | 'vote_pe'
  | 'gouvernement'
  | 'declaration'
  | 'censure_implicite'
  | 'groupe'
  | 'inconnu';

export interface SourceLink {
  titre: string;
  url: string;
}

export interface Argument {
  auteur: string;
  resume: string;
  citation: string | null;
  url: string;
  date: string | null;
}

export interface GroupeVote {
  abrege: string;
  libelle: string;
  membres: number;
  majoritaire: ScrutinPosition | null;
  pour: number;
  contre: number;
  abstention: number;
  nonVotants: number;
}

export interface CandidatePosition {
  /** Position au scrutin (pour / contre / abstention), null si inconnue. */
  position: ScrutinPosition | null;
  /** Position traduite en Oui / Non pour la question. */
  stance: Stance;
  evidence: EvidenceType;
  /** Ce qui fonde la position (phrase affichée). */
  detail: string;
  /** Mention complémentaire : « n'a pas pris part au vote », « vote par délégation »… */
  note: string | null;
  /** Groupe parlementaire du vote nominatif, ou groupe utilisé comme proxy. */
  groupe: string | null;
  /** URL de la preuve (page du scrutin officiel, ou source de la recherche). */
  url: string | null;
  /** Date de la preuve (AAAA-MM-JJ). */
  date: string | null;
  /** Raisons du candidat, paraphrasées (recherche). */
  argument: string | null;
  /** Mots du candidat, verbatim (recherche). */
  citation: string | null;
  /** Source de l'argument / de la citation, si différente de `url`. */
  argumentUrl: string | null;
  /** Précision apportée par la recherche quand la position vient d'une autre source. */
  commentaire: string | null;
  /** Contradiction entre la recherche et le vote officiel (le vote officiel est retenu). */
  incoherence: string | null;
  /** Auteur réel de l'argument et de la citation ; null s'il n'y a ni argument ni citation. */
  attribution: Attribution | null;
}

/**
 * Qui a réellement tenu les propos (argument, citation) affichés sous un candidat.
 * Faute de prise de parole personnelle, la recherche retient souvent l'explication de vote d'un autre
 * député de son groupe : elle ne doit jamais être présentée comme les mots du candidat.
 */
export interface Attribution {
  /** true : propos du candidat ; false : propos d'un tiers (son groupe, le Gouvernement) ; null : non vérifié. */
  duCandidat: boolean | null;
  /** Quand ce ne sont pas ses propos : au nom de qui ils ont été tenus. */
  porteur: 'groupe' | 'gouvernement' | null;
  /** Auteur réel (« Laurent Jacobelli »), quand il est connu. */
  orateur: string | null;
  /** Groupe parlementaire de l'auteur (abréviation : « RN »), quand il est connu. */
  groupe: string | null;
  /**
   * Origine de l'information : « compte-rendu » = orateur relevé dans le compte rendu de séance
   * (data/research/attributions.json) ; « recherche » = indiqué par la recherche (champ detail ou argument).
   */
  verification: 'compte-rendu' | 'recherche' | null;
}

/** Version pédagogique d'une question (data/research/simple/<id>.json). */
export interface EnClair {
  /** La question en langage courant, même polarité que la question officielle. */
  questionSimple: string;
  /** Ce que le texte change concrètement. */
  enBref: string;
  /** Arguments en faveur du Oui à questionSimple (et non du « pour » au scrutin). */
  pourquoiPour: string;
  /** Arguments en faveur du Non à questionSimple. */
  pourquoiContre: string;
  /** Issue réelle du texte. */
  ceQuiSestPasse: string;
  lexique: { terme: string; definition: string }[];
}

export interface ScrutinInfo {
  uid: string;
  assemblee: 'AN' | 'Congrès';
  numero: string;
  date: string;
  titre: string;
  typeVote: string;
  sort: 'adopté' | 'rejeté';
  pour: number;
  contre: number;
  abstention: number;
  /** Page officielle du scrutin. */
  url: string | null;
  /** Dossier législatif ou loi promulguée. */
  urlDossier: string | null;
  /** Le scrutin de référence est une motion de censure (seuls les « pour » sont enregistrés). */
  censure: boolean;
  note: string | null;
}

export interface Question {
  id: string;
  theme: string;
  titre: string;
  question: string;
  /** Position au scrutin qui correspond à « Oui ». */
  ouiSignifie: 'pour' | 'contre';
  contexte: string | null;
  contexteSources: SourceLink[];
  /** Un fichier data/research/<id>.json valide a été fusionné. */
  recherche: boolean;
  /** Version « En clair » ; null si data/research/simple/<id>.json manque ou est invalide. */
  enClair: EnClair | null;
  scrutin: ScrutinInfo;
  groupes: GroupeVote[];
  /** Arguments exprimés lors du scrutin, rangés selon la position au scrutin. */
  arguments: { pour: Argument[]; contre: Argument[]; abstention: Argument[] };
  candidats: Record<string, CandidatePosition>;
  alertes: string[];
}

export interface Candidat {
  id: string;
  nom: string;
  parti: string;
  /** Clé de tri alphabétique (nom de famille). */
  tri: string;
  /** Règle de proxy de groupe (data/candidats.json). */
  proxy: ProxyRule;
  /** Identifiants des partis du candidat (AppData.partis), parti principal en premier. */
  partis: string[];
  /** Biographie sourcée (data/justice/<parti>.json) ; null si absente. */
  bio: { texte: string; sources: SourceLink[] } | null;
}

// ---------------------------------------------------------------- partis et condamnations (data/justice/)

/** Statut d'une condamnation : seule une décision définitive met fin à la présomption d'innocence. */
export type StatutCondamnation = 'definitive' | 'appel_en_cours' | 'pourvoi_en_cours' | 'inconnu';

/**
 * Place de la personne condamnée dans le périmètre retenu (identique pour tous les partis). `ancien_membre` : recherche
 * complémentaire sur les anciens membres (data/justice/anciens/), toujours présentée dans le passif du parti.
 */
export type CategorieCondamnation =
  | 'candidat'
  | 'parti'
  | 'ancien_dirigeant'
  | 'dirigeant'
  | 'depute'
  | 'senateur'
  | 'eurodepute'
  | 'ancien_membre';

/**
 * Lien actuel de la personne condamnée avec le parti (data/justice/membres/<parti>.json, ou bloc `appartenance` d'une
 * condamnation d'ancien membre) ; `inconnu` quand la recherche ne l'a pas établi (fichier ou personne absents).
 */
export type StatutMembre = 'membre' | 'suspendu' | 'exclu' | 'depart' | 'retire' | 'decede' | 'personne_morale' | 'inconnu';

/** La sanction ou le départ est-il motivé par l'affaire ? « non » : autre motif. */
export type LienCondamnation = 'oui' | 'non' | 'inconnu';

/** Appartenance actuelle au parti, sourcée (sans source valide : statut « inconnu »). */
export interface Appartenance {
  statut: StatutMembre;
  /** Date du statut : AAAA-MM-JJ, AAAA-MM ou AAAA ; null si les sources ne la donnent pas. */
  depuis: string | null;
  /** Une phrase factuelle (rôle passé, motif du départ…). */
  detail: string | null;
  lien: LienCondamnation | null;
  /** Réaction du parti à la condamnation (soutien public, sanction…). */
  reactionParti: string | null;
  sources: SourceCondamnation[];
}

export type NatureCondamnation = 'penale' | 'financiere' | 'civile';

/**
 * Famille de l'infraction, d'après la qualification juridique (champ `famille` des fiches). Ordre de gravité
 * affiché (choix éditorial) : probite > violences > haine > diffamation > autres — src/lib/justice.ts, FAMILLES.
 */
export type FamilleCondamnation = 'probite' | 'violences' | 'haine' | 'diffamation' | 'autres';

/** Source d'une condamnation : URL ouverte par la recherche et citation(s) verbatim qui la prouvent. */
export interface SourceCondamnation {
  titre: string;
  url: string;
  /** Au moins une citation ; plusieurs quand la recherche cite plusieurs passages de la même page. */
  citations: string[];
  /** Date de publication (AAAA-MM-JJ). */
  date: string | null;
}

export interface Condamnation {
  /** Identifiant stable (« rn-3 » : parti et rang dans le fichier). */
  id: string;
  personne: string;
  categorie: CategorieCondamnation;
  /** Candidat concerné quand la personne est l'un des candidats rattachés au parti. */
  candidat: string | null;
  roleActuel: string | null;
  infraction: string;
  faits: string | null;
  juridiction: string;
  /** Date de la décision : AAAA-MM-JJ, ou AAAA-MM / AAAA quand les sources ne donnent pas le jour. */
  dateDecision: string;
  peine: string | null;
  statut: StatutCondamnation;
  nature: NatureCondamnation;
  /** Famille de l'infraction ; « autres » quand la fiche ne la précise pas (signalé dans le rapport). */
  famille: FamilleCondamnation;
  lieeMandatPolitique: boolean | null;
  /** Au moins une source valide avec citation (sinon la condamnation est rejetée au build). */
  sources: SourceCondamnation[];
  /**
   * Appartenance actuelle de la personne au parti : décide du niveau d'affichage (src/lib/justice.ts, niveau) — les
   * membres toujours au parti sont comptés, les anciens membres présentés à part (passif), non comptés.
   */
  appartenance: Appartenance;
}

/** Contenu de data/justice/<partiId>.json validé. */
export interface FicheParti {
  /** Date à laquelle les sources ont été consultées (AAAA-MM-JJ). */
  dateConsultation: string;
  predecesseurs: string[];
  fondation: string | null;
  presentation: string | null;
  presentationSources: SourceLink[];
  direction: { nom: string; fonction: string; url: string | null }[];
  effectifs: {
    deputes: number | null;
    senateurs: number | null;
    eurodeputes: number | null;
    sources: SourceLink[];
    /** Précision de la recherche (estimation, rattachements particuliers…). */
    precision: string | null;
  } | null;
  condamnations: Condamnation[];
  /**
   * Liste du fichier : « vide » = la recherche n'a trouvé aucune condamnation ; « remplie » = au moins une entrée
   * (dont certaines ont pu être rejetées au build) ; « absente » = pas de liste exploitable (recherche non publiée).
   */
  liste: 'vide' | 'remplie' | 'absente';
  /** Nombre de personnes du périmètre vérifiées par la recherche. */
  personnesVerifiees: number | null;
  /** data/justice/membres/<id>.json : appartenance actuelle des personnes ; absente → statut « inconnu » pour toutes. */
  appartenance: 'lue' | 'absente' | 'illisible';
  /** Recherche complémentaire sur les anciens membres (data/justice/anciens/<id>.json). */
  anciens: {
    liste: 'vide' | 'remplie' | 'absente';
    personnesVerifiees: number | null;
    /** Date de consultation des sources (AAAA-MM-JJ) ; null si la recherche n'est pas publiée. */
    dateConsultation: string | null;
  };
}

export interface Parti {
  id: string;
  nom: string;
  sigle: string | null;
  /** Candidats rattachés à ce parti ; `rattachement` décrit le lien quand ce n'est pas leur parti principal. */
  candidats: { id: string; rattachement: string | null }[];
  /** null : fichier data/justice/<id>.json absent ou illisible (fiche en cours de documentation). */
  fiche: FicheParti | null;
}

/** Période de validité d'un proxy (bornes incluses, AAAA-MM-JJ ; null = non bornée). */
export interface ProxyPeriode {
  du: string | null;
  au: string | null;
}

export interface ProxyRule {
  /** Groupes AN de référence, par ordre de préférence (vide = aucun proxy). */
  groupes: string[];
  /** Vide : proxy valable à toute date ; sinon seulement pendant l'une de ces périodes. */
  periodes: ProxyPeriode[];
  /** Explication de la limitation dans le temps. */
  motif: string | null;
}

export interface AppData {
  version: 1;
  /** Date de génération du fichier (ISO 8601). */
  genereLe: string;
  /** Date de collecte de l'open data de l'Assemblée nationale (ISO 8601). */
  collecteAN: string | null;
  candidats: Candidat[];
  /** Partis des candidats (data/candidats.json + data/justice/), par ordre de première mention. */
  partis: Parti[];
  themes: string[];
  /** Questions des parcours rapide et complet (data/selection.json, dans son ordre : sert au lien de partage). */
  questions: Question[];
  /** Mode « Approfondir par catégorie » (data/selection-approfondi.json) ; null si le fichier manque. */
  approfondi: ApprofondiIndex | null;
}

// ---------------------------------------------------------------- mode approfondi (par catégorie)

/** Ce sur quoi porte le scrutin de référence d'une question du mode approfondi. */
export type Portee = 'ensemble' | 'article' | 'amendement' | 'motion_censure';

export interface ApprofondiQuestionRef {
  id: string;
  /** Question du parcours principal reprise telle quelle (AppData.questions) ; sinon dans le fichier de la catégorie. */
  existant: boolean;
  portee: Portee;
}

/** Catégorie proposée (index chargé avec le site ; ses nouvelles questions sont chargées à la demande). */
export interface CategorieIndex {
  /** Identifiant d'URL (src/lib/categories.ts). */
  id: string;
  libelle: string;
  /** Questions dans l'ordre de data/selection-approfondi.json (sert au lien de partage de la catégorie). */
  questions: ApprofondiQuestionRef[];
}

export interface ApprofondiIndex {
  categories: CategorieIndex[];
}

/** Fichier src/generated/approfondi/<categorie>.json : les questions propres à la catégorie (hors parcours principal). */
export interface CategorieFile {
  categorie: string;
  questions: Question[];
}
