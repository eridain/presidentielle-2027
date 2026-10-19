// Lecture des fichiers data/justice/<partiId>.json (schéma et règles : data/justice/BRIEF.md) : présentation du
// parti, biographies des candidats, condamnations en justice dans le périmètre retenu.
//
// Les fichiers sont produits en parallèle par la recherche et sont facultatifs : un fichier absent ou illisible
// laisse la fiche du parti vide (« en cours de documentation »), sans bloquer le build. Les éléments descriptifs
// (présentation, direction, effectifs, biographies) sont lus avec tolérance : un élément invalide ou sans source
// est écarté et signalé. Les condamnations suivent une règle stricte : une entrée incomplète (personne, catégorie,
// infraction, juridiction), mal datée, de statut ou de nature invalide, ou sans au moins une source http(s)
// accompagnée d'une citation, est REJETÉE en entier, listée dans le rapport et jamais affichée. La date de décision
// peut être partielle (AAAA ou AAAA-MM) quand les sources ne donnent pas le jour : elle est alors affichée « en 1998 »,
// « en mai 2015 ». La famille (probité, violences, haine, diffamation, autres) classe l'infraction d'après sa
// qualification juridique : absente ou invalide, l'entrée reste affichée, classée « autres », et c'est signalé.
//
// Appartenance actuelle (data/justice/membres/<partiId>.json, schéma : data/justice/BRIEF-MEMBRES.md) : jointure par la
// chaîne exacte du champ « personne » ; fichier ou personne absents → statut « inconnu ». Condamnations d'anciens membres
// (data/justice/anciens/<partiId>.json, BRIEF-ANCIENS.md) : mêmes contrôles stricts que la fiche (rejet sans source
// et citation), chacune avec son bloc « appartenance » ; toujours au niveau 2 (passif du parti, non compté).
import type {
  Appartenance,
  CategorieCondamnation,
  Condamnation,
  FamilleCondamnation,
  FicheParti,
  NatureCondamnation,
  Parti,
  SourceCondamnation,
  SourceLink,
  StatutCondamnation,
  StatutMembre,
  LienCondamnation,
} from '../src/types';
import { formatDateDecision } from '../src/lib/format';
import {
  cleDecision,
  cleMemeDecision,
  datesCompatibles,
  FAMILLE_LABEL,
  FAMILLES,
  isFamille,
  isStatutMembre,
  nameTokens,
  niveau,
  periodeDecision,
  STATUTS,
  STATUTS_MEMBRE,
  STATUTS_NIVEAU_1,
  type Niveau,
} from '../src/lib/justice';
import type { Issue } from './report';
import { isHttpUrl } from './schemas';
import { wordCount } from './simple';
export const CATEGORIES: readonly CategorieCondamnation[] = [
  'candidat',
  'parti',
  'ancien_dirigeant',
  'dirigeant',
  'depute',
  'senateur',
  'eurodepute',
];
/** Catégorie des entrées de data/justice/anciens/ (recherche complémentaire sur les anciens membres). */
export const CATEGORIES_ANCIENS: readonly CategorieCondamnation[] = ['ancien_membre'];
export const NATURES: readonly NatureCondamnation[] = ['penale', 'financiere', 'civile'];
const LIENS: readonly LienCondamnation[] = ['oui', 'non', 'inconnu'];

/** Longueur maximale d'une citation selon le brief (au-delà : signalé, pas rejeté). */
export const CITATION_MAX_MOTS = 40;

/**
 * Mots de la qualification juridique propres à chaque famille : contrôle de cohérence du champ `famille` (une
 * discordance est signalée pour relecture, jamais corrigée automatiquement). « Autres » n'a pas de mots propres.
 */
const MOTS_FAMILLE: readonly (readonly [FamilleCondamnation, RegExp])[] = [
  [
    'probite',
    /détourn|corruption(?! de mineur)|corrompu|trafic d['’]influence|prise illégale d['’]intérêt|financement (illégal|illicite)|abus de (biens sociaux|confiance)|escroquer|fraude|blanchiment|patrimo|favoritisme|concussion|avantages? (non autorisés|illicites)|juridictions financières|discipline budgétaire/iu,
  ],
  // « provocation à la violence » est un délit de presse (famille haine), pas une violence contre les personnes
  ['violences', /(?<!à la )violen/iu],
  [
    'haine',
    /haine|discriminat|racis|racial|antisémit|xénophob|ethni|raison d(e|u|es) (son |sa |ses |leur |leurs |l['’])?(origine|religion|orientation|sexe|identité|handicap|appartenance|ethnie|nation|race)|orientation sexuelle|homophob|sexis|crimes? contre l['’]humanité|négationn|chambres à gaz/iu,
  ],
  ['diffamation', /diffam|injur/iu],
];

/**
 * Familles évoquées par une qualification juridique, dans l'ordre de gravité. Les chefs dont la personne a été relaxée
 * (« vol (relaxée du chef de tentative d'escroquerie) », « relaxé en première instance, condamné en appel pour… » :
 * jusqu'à « condamné ») sont ignorés ; une injure à caractère raciste relève de la haine, pas de la diffamation.
 */
export function famillesEvoquees(infraction: string): FamilleCondamnation[] {
  const retenue = infraction.replace(/\([^()]*relax[^()]*\)|relax[^;()]*?(?=[,;]\s*(?:puis\s+)?condamn|[;()]|$)/giu, ' ');
  const out = MOTS_FAMILLE.filter(([, re]) => re.test(retenue)).map(([f]) => f);
  return out.includes('haine') ? out.filter((f) => f !== 'diffamation') : out;
}

/** Mots qui désignent une décision hors périmètre (relaxe, mise en examen…) : entrée signalée pour relecture. */
const HORS_PERIMETRE =
  /(?<!\p{L})(relax\p{L}*|non-lieu|mise?s? en examen|garde à vue|amnisti\p{L}*|réhabilit\p{L}*|infirm\p{L}*|annul\p{L}*)(?!\p{L})/iu;

/** Contenu d'un fichier data/justice/<partiId>.json et dates connues (AAAA-MM-JJ). */
export interface JusticeFile {
  content: string;
  /** Date de consultation relevée dans data/justice-dates.json (prudente : jamais postérieure à la recherche). */
  releve?: string | null | undefined;
  /** Dernière modification de la fiche (commit git ou date du fichier). */
  modifieLe: string | null;
}

export interface JusticeContext {
  partiId: string;
  /** Candidats rattachés à ce parti (data/candidats.json). */
  rattaches: readonly { id: string; nom: string }[];
  /** Tous les candidats connus. */
  candidats: readonly { id: string; nom: string }[];
  /** Date de génération (AAAA-MM-JJ) : une décision postérieure est rejetée. */
  aujourdhui: string;
  /** Date relevée dans data/justice-dates.json, à défaut de date de consultation dans la fiche. */
  releve?: string | null | undefined;
  /** Date de modification du fichier (AAAA-MM-JJ), en dernier recours. */
  modifieLe: string | null;
  /** Contenu de data/justice/membres/<partiId>.json (facultatif) : appartenance actuelle des personnes condamnées. */
  membres?: string | null | undefined;
  /** data/justice/anciens/<partiId>.json (facultatif) : condamnations d'anciens membres (passif du parti). */
  anciens?: JusticeFile | null | undefined;
}

/** Condamnation rejetée : jamais affichée, listée dans data-report.md. */
export interface Rejet {
  parti: string;
  /** Fiche du parti, ou recherche sur les anciens membres (data/justice/anciens/). */
  liste: 'fiche' | 'anciens';
  index: number;
  personne: string | null;
  motifs: string[];
}

export interface Bio {
  texte: string;
  sources: SourceLink[];
}

export interface JusticeResult {
  fiche: FicheParti | null;
  /** Champ « nom » du fichier (contrôlé contre data/candidats.json). */
  nom: string | null;
  sigle: string | null;
  bios: Map<string, Bio>;
  rejets: Rejet[];
  issues: Issue[];
  /** Éléments réservés à la relecture éditoriale (data-report.md), jamais affichés sur le site. */
  relecture: {
    methode: string | null;
    limites: string | null;
    alertes: string[];
    /** Origine de la date de consultation affichée. */
    origineDate: 'fichier' | 'releve' | 'modification' | 'generation';
    /** Entrées affichées mais à relire (vocabulaire de relaxe, mise en examen…, citation trop longue). */
    aRelire: string[];
    /** Condamnations affichées dont la date de décision est partielle (AAAA ou AAAA-MM). */
    datesPartielles: number;
    /** data/justice/anciens/<partiId>.json : lu, absent, illisible, ou ignoré (fiche du parti illisible). */
    etatAnciens: 'lu' | 'absent' | 'illisible' | 'ignoré';
    methodeAnciens: string | null;
    limitesAnciens: string | null;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function show(value: unknown): string {
  if (value === undefined) return 'absent';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Date calendaire valide au format AAAA-MM-JJ (2023-02-30 est refusée). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function hostname(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

const motsDuNom = (nom: string) => [...new Set(nameTokens(nom.replace(/\([^)]*\)/g, ' ')))].sort();

/**
 * La personne citée est ce candidat : exactement les mêmes mots que son nom, dans n'importe quel ordre, sans tenir
 * compte des précisions entre parenthèses (« Le Pen Marine (députée) » oui ; « Marine Le Pen et Louis Aliot » non).
 */
export function memePersonne(personne: string, nomCandidat: string): boolean {
  const c = motsDuNom(nomCandidat);
  return c.length > 0 && motsDuNom(personne).join(' ') === c.join(' ');
}

/** Le nom du candidat figure dans « personne » sans la désigner exactement (à relire). */
export function mentionPartielle(personne: string, nomCandidat: string): boolean {
  const p = new Set(nameTokens(personne));
  const c = nameTokens(nomCandidat);
  return c.length > 0 && c.every((t) => p.has(t)) && !memePersonne(personne, nomCandidat);
}

function sourceLinks(list: unknown, where: string, warn: (code: string, message: string) => void): SourceLink[] {
  const out: SourceLink[] = [];
  if (list === undefined || list === null) return out;
  if (!Array.isArray(list)) {
    warn('justice-champ-invalide', `${where} n'est pas une liste, ignoré.`);
    return out;
  }
  for (const [i, item] of list.entries()) {
    const it: Record<string, unknown> = isRecord(item) ? item : { url: item };
    if (!isHttpUrl(it.url)) {
      warn('justice-url-invalide', `${where}[${i}] écartée : URL « ${show(it.url)} » invalide.`);
      continue;
    }
    if (!out.some((o) => o.url === it.url)) out.push({ titre: text(it.titre) ?? hostname(it.url), url: it.url });
  }
  return out;
}

/** Liste des députés par groupe fournie à la recherche (data/research/), tirée de l'open data AN. */
const OPEN_DATA_AN: SourceLink = {
  titre: 'Open data de l’Assemblée nationale (députés par groupe)',
  url: 'https://data.assemblee-nationale.fr',
};

/**
 * Sources des effectifs : URL, objet { url, titre }, liste, ou texte libre citant plusieurs URL
 * (« sénateurs : https://… ; https://… ») et la liste des députés par groupe (open data AN).
 */
export function effectifsSources(value: unknown): SourceLink[] {
  const out: SourceLink[] = [];
  const push = (s: SourceLink) => {
    if (!out.some((o) => o.url === s.url)) out.push(s);
  };
  for (const item of Array.isArray(value) ? value : [value]) {
    if (isRecord(item)) {
      if (isHttpUrl(item.url)) push({ titre: text(item.titre) ?? hostname(item.url), url: item.url });
      continue;
    }
    if (typeof item !== 'string') continue;
    for (const m of item.matchAll(/https?:\/\/[^\s;]+/g)) {
      let url = m[0].replace(/[.,]+$/, '');
      // parenthèse fermante finale non ouverte dans l'URL : ponctuation du texte
      while (url.endsWith(')') && (url.match(/\(/g) ?? []).length < (url.match(/\)/g) ?? []).length) url = url.slice(0, -1);
      if (isHttpUrl(url)) push({ titre: hostname(url), url });
    }
    if (/deputes_par_groupe_\d{4}\.json/.test(item)) push(OPEN_DATA_AN);
  }
  return out;
}

/** Date un an avant (AAAA-MM-JJ). */
function ilYaUnAn(iso: string): string {
  return `${String(Number(iso.slice(0, 4)) - 1)}${iso.slice(4)}`;
}

const parFamilleVide = (): Record<FamilleCondamnation, number> => ({ probite: 0, violences: 0, haine: 0, diffamation: 0, autres: 0 });

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Appartenance non établie : niveau 2, badge « Statut inconnu ». */
export const APPARTENANCE_INCONNUE: Appartenance = { statut: 'inconnu', depuis: null, detail: null, lien: null, reactionParti: null, sources: [] };

/**
 * Sources avec citation (condamnation ou appartenance) : URL http(s) et citation obligatoires pour chacune ; une même page
 * citée plusieurs fois donne un seul lien, citations réunies. `ecartees` : motifs des sources écartées.
 */
function lireSources(list: readonly unknown[], where: string, aRelire: string[]): { sources: SourceCondamnation[]; ecartees: string[] } {
  const sources: SourceCondamnation[] = [];
  const ecartees: string[] = [];
  for (const [j, s] of list.entries()) {
    const src = isRecord(s) ? s : {};
    const { url } = src;
    const citation = text(src.citation);
    if (!isHttpUrl(url) || !citation) {
      const pb = [!isHttpUrl(url) && `URL « ${show(url)} » invalide`, !citation && 'citation manquante'];
      ecartees.push(`sources[${j}] : ${pb.filter(Boolean).join(', ')}`);
      continue;
    }
    let date: string | null = null;
    if (src.date !== undefined && src.date !== null && src.date !== '') {
      if (isIsoDate(src.date)) date = src.date;
      else ecartees.push(`sources[${j}] : date « ${show(src.date)} » invalide, ignorée (source conservée)`);
    }
    if (wordCount(citation) > CITATION_MAX_MOTS)
      aRelire.push(`${where} sources[${j}] : citation de ${wordCount(citation)} mots (brief : ${CITATION_MAX_MOTS} au plus).`);
    // même page citée plusieurs fois : un seul lien, citations réunies
    const deja = sources.find((x) => x.url === url);
    if (deja) {
      if (!deja.citations.includes(citation)) deja.citations.push(citation);
      deja.date ??= date;
    } else sources.push({ titre: text(src.titre) ?? hostname(url), url, citations: [citation], date });
  }
  return { sources, ecartees };
}

/**
 * Appartenance actuelle (entrée de membres/<parti>.json, ou bloc « appartenance » d'une condamnation d'anciens/).
 * Tolérante, mais jamais sans preuve : sans source valide (URL http(s) et citation), le statut devient « inconnu »
 * (niveau 2) et rien n'est affiché de l'entrée ; statut invalide → « inconnu » ; date ou lien invalides ignorés.
 */
export function lireAppartenance(
  raw: unknown,
  where: string,
  aujourdhui: string,
  warn: (code: string, message: string) => void,
  aRelire: string[],
): Appartenance {
  if (!isRecord(raw)) {
    warn('appartenance-invalide', `${where} : absente ou qui n'est pas un objet, statut « inconnu ».`);
    return APPARTENANCE_INCONNUE;
  }
  let statut: StatutMembre = 'inconnu';
  if (isStatutMembre(raw.statutMembre)) statut = raw.statutMembre;
  else warn('appartenance-statut-invalide', `${where} : statutMembre « ${show(raw.statutMembre)} » invalide (${STATUTS_MEMBRE.join('|')}), statut « inconnu ».`);
  let depuis: string | null = null;
  if (raw.depuis !== undefined && raw.depuis !== null && raw.depuis !== '') {
    const p = periodeDecision(raw.depuis);
    if (!p) warn('appartenance-date-invalide', `${where} : depuis « ${show(raw.depuis)} » invalide (AAAA, AAAA-MM ou AAAA-MM-JJ attendu), ignorée.`);
    else if (p.debut > aujourdhui) warn('appartenance-date-invalide', `${where} : depuis ${show(raw.depuis)} postérieure à la date de génération, ignorée.`);
    else depuis = raw.depuis as string;
  }
  let lien: LienCondamnation | null = null;
  if (raw.lienAvecCondamnation !== undefined && raw.lienAvecCondamnation !== null && raw.lienAvecCondamnation !== '') {
    if (LIENS.includes(raw.lienAvecCondamnation as LienCondamnation)) lien = raw.lienAvecCondamnation as LienCondamnation;
    else warn('appartenance-lien-invalide', `${where} : lienAvecCondamnation « ${show(raw.lienAvecCondamnation)} » invalide (${LIENS.join('|')}), ignoré.`);
  }
  const { sources, ecartees } = lireSources(Array.isArray(raw.sources) ? raw.sources : [], where, aRelire);
  for (const e of ecartees) warn('appartenance-source-ecartee', `${where} ${e}.`);
  // sans source : rien de l'entrée n'est affiché (ni détail ni réaction) ; le parti lui-même n'a pas à être prouvé
  if (sources.length === 0 && statut === 'personne_morale') return { ...APPARTENANCE_INCONNUE, statut };
  if (sources.length === 0) {
    if (statut !== 'inconnu' || text(raw.detail) || text(raw.reactionParti))
      warn('appartenance-sans-source', `${where} : statut « ${statut} » sans source valide (URL http(s) et citation obligatoires) : statut « inconnu », détail et réaction non affichés.`);
    return APPARTENANCE_INCONNUE;
  }
  // « membre » : le brief demande une source récente (12 derniers mois) montrant l'appartenance
  if (statut === 'membre' && !sources.some((s) => s.date !== null && s.date >= ilYaUnAn(aujourdhui)))
    aRelire.push(`${where} : statut « membre » sans source datée des 12 derniers mois (brief : une source récente suffit).`);
  return { statut, depuis, detail: text(raw.detail), lien, reactionParti: text(raw.reactionParti), sources };
}

/** data/justice/membres/<partiId>.json : appartenance par chaîne exacte du champ « personne ». */
function lireMembres(
  content: string,
  partiId: string,
  aujourdhui: string,
  warn: (code: string, message: string) => void,
  aRelire: string[],
): { etat: 'lue' | 'illisible'; personnes: Map<string, Appartenance>; alertes: string[] } {
  const personnes = new Map<string, Appartenance>();
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (e) {
    warn('appartenance-illisible', `membres/${partiId}.json : JSON invalide, ignoré (${(e as Error).message}).`);
    return { etat: 'illisible', personnes, alertes: [] };
  }
  if (!isRecord(raw) || !Array.isArray(raw.personnes)) {
    warn('appartenance-illisible', `membres/${partiId}.json : objet avec une liste « personnes » attendu, ignoré.`);
    return { etat: 'illisible', personnes, alertes: [] };
  }
  if (raw.partiId !== partiId)
    warn('justice-id', `membres/${partiId}.json : champ partiId « ${show(raw.partiId)} » différent du nom de fichier : le nom de fichier fait foi.`);
  for (const [i, item] of raw.personnes.entries()) {
    const personne = isRecord(item) ? text(item.personne) : null;
    if (!personne) {
      warn('appartenance-invalide', `membres/${partiId}.json personnes[${i}] sans champ personne, ignorée.`);
      continue;
    }
    if (personnes.has(personne)) {
      warn('appartenance-doublon', `membres/${partiId}.json personnes[${i}] : « ${personne} » déjà citée, première entrée retenue.`);
      continue;
    }
    personnes.set(personne, lireAppartenance(item, `membres/${partiId}.json personnes[${i}] (${personne})`, aujourdhui, warn, aRelire));
  }
  const alertes = (Array.isArray(raw.alertes) ? raw.alertes : []).map(text).filter((a): a is string => a !== null);
  return { etat: 'lue', personnes, alertes };
}

/**
 * Analyse le contenu texte d'un fichier data/justice/<partiId>.json.
 * Ne lève jamais d'exception : les problèmes sont rendus dans `issues` et `rejets`.
 */
export function parseJustice(content: string, ctx: JusticeContext): JusticeResult {
  const { partiId } = ctx;
  const issues: Issue[] = [];
  const rejets: Rejet[] = [];
  const bios = new Map<string, Bio>();
  const aRelire: string[] = [];
  const add = (severity: Issue['severity'], code: string, message: string, candidat?: string): void => {
    issues.push({ severity, code, parti: partiId, candidat, message });
  };
  const warn = (code: string, message: string): void => add('avertissement', code, message);
  const empty = (): JusticeResult => ({
    fiche: null,
    nom: null,
    sigle: null,
    bios,
    rejets,
    issues,
    relecture: {
      methode: null,
      limites: null,
      alertes: [],
      origineDate: 'generation',
      aRelire,
      datesPartielles: 0,
      etatAnciens: ctx.anciens ? 'ignoré' : 'absent',
      methodeAnciens: null,
      limitesAnciens: null,
    },
  });

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (e) {
    warn('justice-illisible', `${partiId}.json : JSON invalide, fiche ignorée (${(e as Error).message}).`);
    return empty();
  }
  if (!isRecord(raw)) {
    warn('justice-illisible', `${partiId}.json ne contient pas un objet JSON, fiche ignorée.`);
    return empty();
  }
  if (raw.partiId !== partiId)
    warn('justice-id', `Champ partiId « ${show(raw.partiId)} » différent du nom de fichier « ${partiId} » : le nom de fichier fait foi.`);

  const perimetre = isRecord(raw.perimetre) ? raw.perimetre : {};

  // ------------------------------------------------------------ date de consultation des sources
  const explicite = [raw.dateConsultation, perimetre.dateConsultation, perimetre.date].find(isIsoDate);
  let origineDate: JusticeResult['relecture']['origineDate'] = 'generation';
  let dateConsultation = ctx.aujourdhui;
  if (explicite) {
    dateConsultation = explicite;
    origineDate = 'fichier';
  } else if (isIsoDate(ctx.releve)) {
    dateConsultation = ctx.releve;
    origineDate = 'releve';
  } else if (ctx.modifieLe && isIsoDate(ctx.modifieLe)) {
    dateConsultation = ctx.modifieLe;
    origineDate = 'modification';
  }

  // ------------------------------------------------------------ présentation du parti (tolérante)
  const presentationSources = sourceLinks(raw.presentationSources, 'presentationSources', warn);
  let presentation = text(raw.presentation);
  if (presentation && presentationSources.length === 0) {
    warn('justice-sans-source', 'Présentation du parti sans source valide : non affichée.');
    presentation = null;
  } else if (!presentation) warn('justice-champ-manquant', 'Présentation du parti manquante.');

  const direction: FicheParti['direction'] = [];
  for (const [i, item] of (Array.isArray(raw.direction) ? raw.direction : []).entries()) {
    const nom = isRecord(item) ? text(item.nom) : null;
    const fonction = isRecord(item) ? text(item.fonction) : null;
    if (!isRecord(item) || !nom || !fonction) {
      warn('justice-champ-invalide', `direction[${i}] sans nom ou sans fonction, écartée.`);
      continue;
    }
    let url: string | null = null;
    if (item.url !== undefined && item.url !== null && item.url !== '') {
      if (isHttpUrl(item.url)) url = item.url;
      else warn('justice-url-invalide', `direction[${i}] (${nom}) : URL « ${show(item.url)} » invalide, ignorée.`);
    }
    direction.push({ nom, fonction, url });
  }

  let effectifs: FicheParti['effectifs'] = null;
  if (isRecord(raw.effectifs)) {
    const e = raw.effectifs;
    const sources = effectifsSources(e.sources ?? e.source);
    const n = { deputes: count(e.deputes), senateurs: count(e.senateurs), eurodeputes: count(e.eurodeputes) };
    if (sources.length === 0)
      warn('justice-sans-source', `Effectifs parlementaires sans source valide (« ${show(e.sources ?? e.source)} ») : non affichés.`);
    else if (n.deputes === null && n.senateurs === null && n.eurodeputes === null)
      warn('justice-champ-invalide', 'Effectifs parlementaires sans aucun nombre valide : non affichés.');
    else effectifs = { ...n, sources, precision: text(e.precision) };
  } else warn('justice-champ-manquant', 'Effectifs parlementaires manquants.');

  const predecesseurs = (Array.isArray(raw.predecesseurs) ? raw.predecesseurs : [])
    .map(text)
    .filter((p): p is string => p !== null);
  const fondation = text(raw.fondation) ?? (typeof raw.fondation === 'number' ? String(raw.fondation) : null);

  // ------------------------------------------------------------ biographies des candidats
  for (const [i, item] of (Array.isArray(raw.candidats) ? raw.candidats : []).entries()) {
    const id = isRecord(item) ? text(item.id) : null;
    if (!isRecord(item) || !id) {
      warn('justice-champ-invalide', `candidats[${i}] sans id, ignoré.`);
      continue;
    }
    if (!ctx.candidats.some((c) => c.id === id)) {
      warn('justice-candidat-inconnu', `candidats[${i}] : candidat « ${id} » absent de candidats.json, ignoré.`);
      continue;
    }
    if (!ctx.rattaches.some((c) => c.id === id)) {
      add('avertissement', 'justice-candidat-non-rattache', `Biographie d'un candidat non rattaché à ce parti dans candidats.json, ignorée.`, id);
      continue;
    }
    const texte = text(item.bio);
    const sources = sourceLinks(item.sources, `candidats[${i}].sources`, warn);
    if (!texte) add('avertissement', 'justice-champ-manquant', 'Biographie vide, ignorée.', id);
    else if (sources.length === 0) add('avertissement', 'justice-sans-source', 'Biographie sans source valide : non affichée.', id);
    else bios.set(id, { texte, sources });
  }

  // ------------------------------------------------------------ appartenance actuelle (data/justice/membres/)
  // Jointure par la chaîne exacte du champ « personne ». Fichier ou personne absents : statut « inconnu » (niveau 2).
  const alertes = (Array.isArray(raw.alertes) ? raw.alertes : []).map(text).filter((a): a is string => a !== null);
  const membres = new Map<string, Appartenance>();
  let etatMembres: FicheParti['appartenance'] = 'absente';
  if (typeof ctx.membres === 'string') {
    const m = lireMembres(ctx.membres, partiId, ctx.aujourdhui, warn, aRelire);
    etatMembres = m.etat;
    for (const [k, v] of m.personnes) membres.set(k, v);
    alertes.push(...m.alertes.map((a) => `membres/ : ${a}`));
  }
  const joints = new Set<string>();
  const sansAppartenance = new Set<string>();
  const appartenanceDe = (personne: string, categorie: CategorieCondamnation, ref: string): Appartenance => {
    const a = membres.get(personne);
    if (a) {
      joints.add(personne);
      if (categorie === 'parti' && a.statut !== 'personne_morale')
        aRelire.push(`${ref} (${personne}) : le parti (personne morale), mais statut d'appartenance « ${a.statut} » dans membres/.`);
      if (categorie !== 'parti' && a.statut === 'personne_morale') {
        aRelire.push(`${ref} (${personne}) : statut « personne_morale » dans membres/ pour une personne de catégorie « ${categorie} ».`);
        // une personne physique n'est jamais « le parti » sans preuve
        if (a.sources.length === 0) return APPARTENANCE_INCONNUE;
      }
      return a;
    }
    // le parti lui-même ne peut pas être un « ancien membre » de lui-même : personne morale, sans autre preuve
    if (categorie === 'parti') return { ...APPARTENANCE_INCONNUE, statut: 'personne_morale' };
    sansAppartenance.add(personne);
    return APPARTENANCE_INCONNUE;
  };

  // ------------------------------------------------------------ condamnations (règle stricte)
  const condamnations: Condamnation[] = [];
  /** Référence de chaque condamnation affichée dans le rapport (« condamnations[3] », « anciens/condamnations[0] »). */
  const refs = new Map<string, string>();
  const vues = new Map<string, string>();
  let datesPartielles = 0;

  /**
   * Une entrée de la fiche (`fiche`) ou de la recherche sur les anciens membres (`anciens`) : mêmes contrôles, même
   * rejet. Les anciens membres ont la catégorie `ancien_membre` et leur propre bloc `appartenance` ; jamais rattachés à
   * la page d'un candidat.
   */
  const lireCondamnation = (item: unknown, index: number, origine: 'fiche' | 'anciens', consultation: { date: string; datee: boolean }): void => {
    const ref = `${origine === 'anciens' ? 'anciens/' : ''}condamnations[${index}]`;
    const categoriesAdmises = origine === 'anciens' ? CATEGORIES_ANCIENS : CATEGORIES;
    const motifs: string[] = [];
    const c = isRecord(item) ? item : {};
    if (!isRecord(item)) motifs.push('entrée qui n’est pas un objet');
    const personne = text(c.personne);
    if (!personne) motifs.push('personne manquante');

    const categorie = c.categorie as CategorieCondamnation;
    if (!categoriesAdmises.includes(categorie)) motifs.push(`catégorie « ${show(c.categorie)} » invalide (${categoriesAdmises.join('|')})`);
    const infraction = text(c.infraction);
    if (!infraction) motifs.push('infraction manquante');
    const juridiction = text(c.juridiction);
    if (!juridiction) motifs.push('juridiction manquante');

    // AAAA, AAAA-MM ou AAAA-MM-JJ ; postérieure à la génération = période qui commence après aujourd'hui
    const periode = periodeDecision(c.dateDecision);
    const dateDecision = periode ? (c.dateDecision as string) : null;
    if (!periode) motifs.push(`dateDecision « ${show(c.dateDecision)} » invalide (AAAA, AAAA-MM ou AAAA-MM-JJ attendu, date calendaire valide)`);
    else if (periode.debut > ctx.aujourdhui) motifs.push(`dateDecision ${show(c.dateDecision)} postérieure à la date de génération`);

    const statut = c.statut as StatutCondamnation;
    if (!STATUTS.includes(statut)) motifs.push(`statut « ${show(c.statut)} » invalide (${STATUTS.join('|')})`);
    const nature = c.nature as NatureCondamnation;
    if (!NATURES.includes(nature)) motifs.push(`nature « ${show(c.nature)} » invalide (${NATURES.join('|')})`);

    // Sources : chacune doit avoir une URL http(s) et une citation ; il en faut au moins une.
    let sources: SourceCondamnation[] = [];
    let sourcesEcartees: string[] = [];
    if (!Array.isArray(c.sources) || c.sources.length === 0) motifs.push('aucune source');
    else {
      ({ sources, ecartees: sourcesEcartees } = lireSources(c.sources, `${ref} (${personne ?? '?'})`, aRelire));
      if (sources.length === 0) motifs.push(`aucune source valide (URL http(s) et citation obligatoires) — ${sourcesEcartees.join(' ; ')}`);
    }

    // Personne = l'un des candidats rattachés au parti ? (jamais pour le parti en tant que personne morale, ni pour un
    // ancien membre : le candidat est toujours compté avec ses propres condamnations, au niveau 1)
    const candidat =
      personne && categorie !== 'parti' && origine === 'fiche' ? (ctx.rattaches.find((r) => memePersonne(personne, r.nom))?.id ?? null) : null;
    for (const r of personne ? ctx.rattaches : [])
      if (origine === 'anciens' && memePersonne(personne ?? '', r.nom))
        aRelire.push(`${ref} : « ${personne ?? ''} » désigne ${r.nom}, candidat du parti — présentée dans le passif (anciens membres), pas avec ses propres condamnations : vérifier.`);
      else if (mentionPartielle(personne ?? '', r.nom))
        aRelire.push(`${ref} : « ${personne ?? ''} » cite ${r.nom} sans le désigner exactement — non rattachée à sa page.`);
    if (categorie === 'candidat' && personne && candidat === null)
      motifs.push(`catégorie « candidat » mais « ${personne} » ne correspond à aucun candidat rattaché à ce parti (${ctx.rattaches.map((r) => r.nom).join(', ') || 'aucun'})`);

    // doublon : date au jour près seulement (même année ou même mois ne prouve pas la même décision) ; une entrée
    // d'anciens/ qui reprend une décision de la fiche est un doublon (la fiche fait foi)
    const cle = personne && juridiction && dateDecision ? cleMemeDecision({ personne, dateDecision, juridiction }) : null;
    if (motifs.length === 0 && cle !== null) {
      const premier = vues.get(cle);
      if (premier !== undefined) motifs.push(`doublon de ${premier} (même personne, même date, même juridiction)`);
      else vues.set(cle, ref);
    }

    if (motifs.length > 0 || !personne || !infraction || !juridiction || !dateDecision || !periode) {
      rejets.push({ parti: partiId, liste: origine, index, personne, motifs });
      return;
    }
    for (const e of sourcesEcartees) warn('justice-source-ecartee', `${ref} (${personne}) ${e}.`);
    if (candidat !== null && categorie !== 'candidat')
      add('info', 'justice-categorie-candidat', `${ref} : « ${personne} » est le candidat ; affichée avec ses propres condamnations (catégorie du fichier : ${categorie}).`, candidat);

    // Famille : jamais un motif de rejet (l'entrée est sourcée) ; absente ou invalide → « autres », signalé.
    const evoquees = famillesEvoquees(infraction);
    const famille: FamilleCondamnation = isFamille(c.famille) ? c.famille : 'autres';
    const indice = evoquees.length ? ` ; la qualification évoque : ${evoquees.map((f) => `« ${FAMILLE_LABEL[f]} »`).join(', ')}` : '';
    if (c.famille === undefined || c.famille === null || c.famille === '')
      warn('justice-famille-absente', `${ref} (${personne}) : famille absente, classée « ${FAMILLE_LABEL.autres} »${indice}.`);
    else if (!isFamille(c.famille))
      warn('justice-famille-invalide', `${ref} (${personne}) : famille « ${show(c.famille)} » invalide (${FAMILLES.join('|')}), classée « ${FAMILLE_LABEL.autres} »${indice}.`);
    // plusieurs infractions : rangée dans la plus grave (Méthodologie) — la famille doit être la plus grave évoquée
    else if (evoquees[0] !== undefined && evoquees[0] !== famille)
      aRelire.push(`${ref} (${personne}) : famille « ${FAMILLE_LABEL[famille]} », mais la qualification « ${infraction} » évoque ${evoquees.map((f) => `« ${FAMILLE_LABEL[f]} »`).join(', ')} (la plus grave d'abord) — vérifier le classement.`);

    // Appartenance : membres/<parti>.json pour la fiche, bloc propre pour un ancien membre (toujours au niveau 2)
    let appartenance: Appartenance;
    if (origine === 'fiche') appartenance = appartenanceDe(personne, categorie, ref);
    else {
      appartenance = lireAppartenance(c.appartenance, `${ref} (${personne}) appartenance`, ctx.aujourdhui, warn, aRelire);
      if (STATUTS_NIVEAU_1.includes(appartenance.statut))
        aRelire.push(`${ref} (${personne}) : statut d'appartenance « ${appartenance.statut} » (toujours au parti) dans la recherche sur les anciens membres — présentée dans le passif (niveau 2), comme toute entrée de anciens/ : vérifier l'appartenance actuelle.`);
    }

    const liee = typeof c.lieeMandatPolitique === 'boolean' ? c.lieeMandatPolitique : null;
    const condamnation: Condamnation = {
      id: origine === 'anciens' ? `${partiId}-ancien-${String(index)}` : `${partiId}-${String(index)}`,
      personne,
      categorie,
      candidat,
      roleActuel: text(c.roleActuel),
      infraction,
      faits: text(c.faits),
      juridiction,
      dateDecision,
      peine: text(c.peine),
      statut,
      nature,
      famille,
      lieeMandatPolitique: liee,
      sources,
      appartenance,
    };
    if (!condamnation.peine) warn('justice-champ-manquant', `${ref} (${personne}) : peine non précisée.`);
    const libelle = [condamnation.infraction, condamnation.faits, condamnation.peine].filter(Boolean).join(' ');
    if (HORS_PERIMETRE.test(libelle))
      aRelire.push(`${ref} (${personne}) : vocabulaire de relaxe, d'annulation ou de procédure en cours (« ${HORS_PERIMETRE.exec(libelle)?.[0] ?? ''} ») — vérifier que la condamnation est bien maintenue.`);
    // date partielle : récente si la décision a pu être rendue dans l'année écoulée (dernier jour possible)
    if (statut === 'inconnu' && periode.fin > ilYaUnAn(ctx.aujourdhui))
      aRelire.push(`${ref} (${personne}) : décision récente (${dateDecision}) au statut non confirmé — vérifier l'existence d'un appel ou d'un pourvoi.`);
    if (periode.precision !== 'jour') {
      datesPartielles += 1;
      add('info', 'justice-date-partielle', `${ref} (${personne}) : date de décision partielle « ${dateDecision} » (${periode.precision === 'annee' ? 'ni mois ni jour' : 'sans le jour'}), affichée « ${formatDateDecision(dateDecision)} ».`);
    }
    // même personne, dates compatibles (« 2015 » et « 2015-05-12 ») ou même date partielle : peut-être la même
    // décision saisie deux fois (les deux entrées restent affichées)
    for (const autre of condamnations) {
      const memeDate = autre.dateDecision === dateDecision;
      if ((memeDate && periode.precision === 'jour') || !datesCompatibles(autre.dateDecision, dateDecision) || !memePersonne(autre.personne, personne)) continue;
      const dates = memeDate ? `même date partielle (« ${dateDecision} »)` : `dates compatibles (« ${autre.dateDecision} » / « ${dateDecision} »)`;
      aRelire.push(`${refs.get(autre.id) ?? autre.id} et ${ref} (${personne}) : ${dates} — vérifier qu'il ne s'agit pas de la même décision.`);
    }
    if (sources.every((s) => /(^|\.)wikipedia\.org$/.test(new URL(s.url).hostname)))
      aRelire.push(`${ref} (${personne}) : seule source Wikipédia (le brief exige aussi la source secondaire consultée).`);
    if (consultation.datee)
      for (const s of sources)
        if (s.date && s.date > consultation.date)
          aRelire.push(`${ref} (${personne}) : source datée du ${s.date}, après la date de consultation retenue (${consultation.date}).`);
    refs.set(condamnation.id, ref);
    condamnations.push(condamnation);
  };

  const list = raw.condamnations;
  // Liste absente ou mal formée : la recherche n'est pas publiée (jamais « aucune condamnation trouvée »).
  if (!Array.isArray(list))
    warn('justice-champ-invalide', `Champ « condamnations » ${list === undefined ? 'absent' : 'qui n’est pas une liste'} : condamnations « en cours de recherche » sur le site.`);
  for (const [index, item] of (Array.isArray(list) ? list : []).entries())
    lireCondamnation(item, index, 'fiche', { date: dateConsultation, datee: origineDate !== 'generation' });
  if (Array.isArray(list) && list.length === 0)
    add('info', 'justice-aucune', 'Aucune condamnation trouvée dans les sources consultées (liste vide).');
  const liste: FicheParti['liste'] = !Array.isArray(list) ? 'absente' : list.length === 0 ? 'vide' : 'remplie';

  // appartenance : personnes sans entrée, entrées sans condamnation (la jointure exige la chaîne exacte)
  if (sansAppartenance.size > 0) {
    const qui = [...sansAppartenance].map((p) => `« ${p} »`).join(', ');
    if (etatMembres === 'lue')
      warn('appartenance-personne-absente', `membres/${partiId}.json ne cite pas ${qui} : statut « inconnu », présentées dans le passif (niveau 2, non comptées).`);
    else
      warn('appartenance-absente', `membres/${partiId}.json ${etatMembres === 'absente' ? 'absent' : 'illisible'} : statut « inconnu » pour ${qui}, présentées dans le passif (niveau 2, non comptées) ; le candidat et le parti restent comptés.`);
  }
  for (const p of membres.keys())
    if (!joints.has(p)) {
      const proche = condamnations.find((k) => k.categorie !== 'ancien_membre' && memePersonne(k.personne, p));
      warn('appartenance-orpheline', `membres/${partiId}.json : « ${p} » ne correspond à aucune condamnation de la fiche (jointure par la chaîne exacte du champ personne)${proche ? ` — même personne que « ${proche.personne} » ?` : ''}.`);
    }

  // ------------------------------------------------------------ anciens membres (data/justice/anciens/)
  const anciens: FicheParti['anciens'] = { liste: 'absente', personnesVerifiees: null, dateConsultation: null };
  let etatAnciens: JusticeResult['relecture']['etatAnciens'] = 'absent';
  let methodeAnciens: string | null = null;
  let limitesAnciens: string | null = null;
  if (ctx.anciens) {
    let rawA: unknown;
    try {
      rawA = JSON.parse(ctx.anciens.content);
    } catch (e) {
      warn('anciens-illisible', `anciens/${partiId}.json : JSON invalide, ignoré (${(e as Error).message}).`);
    }
    if (rawA !== undefined && !isRecord(rawA)) warn('anciens-illisible', `anciens/${partiId}.json ne contient pas un objet JSON, ignoré.`);
    etatAnciens = 'illisible';
    if (isRecord(rawA)) {
      etatAnciens = 'lu';
      if (rawA.partiId !== partiId)
        warn('justice-id', `anciens/${partiId}.json : champ partiId « ${show(rawA.partiId)} » différent du nom de fichier : le nom de fichier fait foi.`);
      const perimA = isRecord(rawA.perimetre) ? rawA.perimetre : {};
      const expliciteA = [rawA.dateConsultation, perimA.dateConsultation, perimA.date].find(isIsoDate);
      const modifA = ctx.anciens.modifieLe && isIsoDate(ctx.anciens.modifieLe) ? ctx.anciens.modifieLe : null;
      const dateA = expliciteA ?? modifA ?? dateConsultation;
      anciens.dateConsultation = dateA;
      anciens.personnesVerifiees = count(perimA.personnesVerifiees);
      methodeAnciens = text(perimA.methode);
      limitesAnciens = text(perimA.limites);
      for (const a of (Array.isArray(rawA.alertes) ? rawA.alertes : []).map(text)) if (a) alertes.push(`anciens/ : ${a}`);
      // personnes écartées par la recherche faute de preuve de départ (relecture seulement)
      for (const n of Array.isArray(rawA.statutMembreNonEtabli) ? rawA.statutMembreNonEtabli : [])
        if (isRecord(n) && text(n.personne))
          aRelire.push(`anciens/ : ${text(n.personne) ?? ''} non retenu(e) par la recherche (appartenance actuelle non établie), donc absent(e) du site${text(n.pourquoiNonRetenu) ? ` — ${text(n.pourquoiNonRetenu) ?? ''}` : ''}`);
      const listA = rawA.condamnations;
      if (!Array.isArray(listA)) warn('justice-champ-invalide', `anciens/${partiId}.json : champ « condamnations » ${listA === undefined ? 'absent' : 'qui n’est pas une liste'}, ignoré.`);
      else {
        anciens.liste = listA.length === 0 ? 'vide' : 'remplie';
        const n = condamnations.length;
        for (const [index, item] of listA.entries()) lireCondamnation(item, index, 'anciens', { date: dateA, datee: expliciteA !== undefined || modifA !== null });
        // le brief exclut les personnes déjà présentes dans la fiche : leur appartenance vient de membres/
        for (const k of condamnations.slice(n)) {
          const fiche = condamnations.slice(0, n).find((x) => memePersonne(x.personne, k.personne));
          if (fiche)
            aRelire.push(`${refs.get(k.id) ?? k.id} (${k.personne}) : personne déjà présente dans la fiche (${refs.get(fiche.id) ?? fiche.id}, appartenance « ${fiche.appartenance.statut} ») — le brief des anciens membres l'exclut : vérifier.`);
        }
      }
    }
  }

  const personnesVerifiees = count(perimetre.personnesVerifiees);

  return {
    fiche: {
      dateConsultation,
      predecesseurs,
      fondation,
      presentation,
      presentationSources: presentation ? presentationSources : [],
      direction,
      effectifs,
      condamnations,
      liste,
      personnesVerifiees,
      appartenance: etatMembres,
      anciens,
    },
    nom: text(raw.nom),
    sigle: text(raw.sigle),
    bios,
    rejets,
    issues,
    relecture: {
      methode: text(perimetre.methode),
      limites: text(perimetre.limites),
      alertes,
      origineDate,
      aRelire,
      datesPartielles,
      etatAnciens,
      methodeAnciens,
      limitesAnciens,
    },
  };
}

// ---------------------------------------------------------------- assemblage : candidats → partis → fiches

/** Bilan par parti pour data-report.md. */
export interface JusticeReportParti {
  id: string;
  nom: string;
  candidats: string[];
  fichier: 'lu' | 'absent' | 'illisible';
  dateConsultation: string | null;
  origineDate: JusticeResult['relecture']['origineDate'] | null;
  affichees: number;
  rejetees: number;
  parStatut: Record<StatutCondamnation, number>;
  /** Affichées par famille (absente ou invalide : comptée dans « autres »). */
  parFamille: Record<FamilleCondamnation, number>;
  /** Affichées avec une date de décision partielle (AAAA ou AAAA-MM). */
  datesPartielles: number;
  personnesVerifiees: number | null;
  methode: string | null;
  limites: string | null;
  alertes: string[];
  aRelire: string[];
  bios: string[];
  /** data/justice/membres/<id>.json et data/justice/anciens/<id>.json (« ignoré » : la fiche du parti est illisible). */
  membres: 'lu' | 'absent' | 'illisible' | 'ignoré';
  anciens: 'lu' | 'absent' | 'illisible' | 'ignoré';
  /** Affichées par niveau (1 : candidat, parti, membres actuels — comptées ; 2 : passif, anciens membres) et par famille. */
  niveaux: Record<Niveau, Record<FamilleCondamnation, number>>;
  /** Dont entrées de anciens/ (toutes au niveau 2). */
  anciensAffichees: number;
  /** Affichées par statut d'appartenance. */
  parAppartenance: Record<StatutMembre, number>;
  /** Personnes affichées au statut « inconnu » (fichier membres/ absent, personne absente, ou statut non sourcé). */
  inconnus: string[];
  personnesVerifieesAnciens: number | null;
  methodeAnciens: string | null;
  limitesAnciens: string | null;
}

export interface JusticeReport {
  partis: JusticeReportParti[];
  rejets: Rejet[];
  /** Fichiers data/justice/*.json (et membres/, anciens/) sans parti correspondant dans candidats.json. */
  fichiersOrphelins: string[];
  candidatsSansBio: string[];
}

export function emptyJusticeReport(): JusticeReport {
  return { partis: [], rejets: [], fichiersOrphelins: [], candidatsSansBio: [] };
}

interface CandidatPartis {
  id: string;
  nom: string;
  partis?: { id: string; nom: string; rattachement?: string | undefined }[] | undefined;
}

/** Fichiers complémentaires d'un parti, par partiId : data/justice/membres/ et data/justice/anciens/ (facultatifs). */
export interface JusticeAnnexes {
  membres?: Readonly<Record<string, JusticeFile>>;
  anciens?: Readonly<Record<string, JusticeFile>>;
}

export interface PartisOutput {
  partis: Parti[];
  bios: Map<string, Bio>;
  report: JusticeReport;
  issues: Issue[];
}

/**
 * Rattache les candidats à leurs partis (data/candidats.json), lit la fiche de chaque parti
 * (data/justice/<id>.json, facultative) et choisit la biographie de chaque candidat
 * (fiche de son parti principal d'abord).
 */
export function buildPartis(
  candidats: readonly CandidatPartis[],
  files: Readonly<Record<string, JusticeFile>>,
  aujourdhui: string,
  annexes: JusticeAnnexes = {},
): PartisOutput {
  const membresFiles = annexes.membres ?? {};
  const anciensFiles = annexes.anciens ?? {};
  const issues: Issue[] = [];
  const report = emptyJusticeReport();
  const refs = new Map<string, { nom: string; candidats: { id: string; nom: string; rattachement: string | null }[] }>();
  for (const c of candidats) {
    if (!c.partis?.length) {
      issues.push({ severity: 'info', code: 'candidat-sans-parti', candidat: c.id, message: 'Aucun parti dans candidats.json (champ partis) : pas de fiche parti.' });
      continue;
    }
    for (const p of c.partis) {
      const ref = refs.get(p.id) ?? { nom: p.nom, candidats: [] };
      if (ref.nom !== p.nom)
        issues.push({ severity: 'avertissement', code: 'parti-nom', parti: p.id, candidat: c.id, message: `Nom « ${p.nom} » différent de « ${ref.nom} » (première mention), retenu : « ${ref.nom} ».` });
      ref.candidats.push({ id: c.id, nom: c.nom, rattachement: p.rattachement ?? null });
      refs.set(p.id, ref);
    }
  }
  for (const [dossier, liste] of [['', files], ['membres/', membresFiles], ['anciens/', anciensFiles]] as const)
    for (const f of Object.keys(liste).sort())
      if (!refs.has(f)) {
        report.fichiersOrphelins.push(`${dossier}${f}.json`);
        issues.push({ severity: 'avertissement', code: 'justice-orphelin', parti: f, message: `data/justice/${dossier}${f}.json ne correspond à aucun parti de candidats.json : ignoré.` });
      }

  const partis: Parti[] = [];
  const biosParParti = new Map<string, Map<string, Bio>>();
  for (const [id, ref] of refs) {
    const file = files[id];
    const base = { id, nom: ref.nom, candidats: ref.candidats.map((c) => ({ id: c.id, rattachement: c.rattachement })) };
    const bilan: JusticeReportParti = {
      id,
      nom: ref.nom,
      candidats: ref.candidats.map((c) => c.id),
      fichier: 'absent',
      dateConsultation: null,
      origineDate: null,
      affichees: 0,
      rejetees: 0,
      parStatut: { definitive: 0, appel_en_cours: 0, pourvoi_en_cours: 0, inconnu: 0 },
      parFamille: parFamilleVide(),
      datesPartielles: 0,
      personnesVerifiees: null,
      methode: null,
      limites: null,
      alertes: [],
      aRelire: [],
      bios: [],
      membres: membresFiles[id] ? 'lu' : 'absent',
      anciens: anciensFiles[id] ? 'lu' : 'absent',
      niveaux: { 1: parFamilleVide(), 2: parFamilleVide() },
      anciensAffichees: 0,
      parAppartenance: { membre: 0, suspendu: 0, personne_morale: 0, exclu: 0, depart: 0, retire: 0, decede: 0, inconnu: 0 },
      inconnus: [],
      personnesVerifieesAnciens: null,
      methodeAnciens: null,
      limitesAnciens: null,
    };
    report.partis.push(bilan);
    if (!file) {
      issues.push({ severity: 'avertissement', code: 'justice-absent', parti: id, message: `data/justice/${id}.json absent : fiche du parti « en cours de documentation ».` });
      for (const [dossier, annexe] of [['membres/', membresFiles[id]], ['anciens/', anciensFiles[id]]] as const)
        if (annexe)
          issues.push({ severity: 'avertissement', code: 'justice-annexe-sans-fiche', parti: id, message: `data/justice/${dossier}${id}.json ignoré : la fiche data/justice/${id}.json est absente.` });
      partis.push({ ...base, sigle: null, fiche: null });
      continue;
    }
    const r = parseJustice(file.content, {
      partiId: id,
      rattaches: ref.candidats,
      candidats,
      aujourdhui,
      releve: file.releve,
      modifieLe: file.modifieLe,
      membres: membresFiles[id]?.content ?? null,
      anciens: anciensFiles[id] ?? null,
    });
    issues.push(...r.issues);
    report.rejets.push(...r.rejets);
    for (const rej of r.rejets)
      issues.push({ severity: 'avertissement', code: 'condamnation-rejetee', parti: id, message: `${rej.liste === 'anciens' ? 'anciens/' : ''}condamnations[${rej.index}] (${rej.personne ?? '?'}) rejetée, non affichée : ${rej.motifs.join(' ; ')}.` });
    if (r.nom && nameTokens(r.nom).join(' ') !== nameTokens(ref.nom).join(' '))
      issues.push({ severity: 'info', code: 'parti-nom', parti: id, message: `Nom du fichier « ${r.nom} », nom affiché (candidats.json) : « ${ref.nom} ».` });
    biosParParti.set(id, r.bios);
    Object.assign(bilan, {
      fichier: r.fiche ? 'lu' : 'illisible',
      dateConsultation: r.fiche?.dateConsultation ?? null,
      origineDate: r.fiche ? r.relecture.origineDate : null,
      affichees: r.fiche?.condamnations.length ?? 0,
      rejetees: r.rejets.length,
      datesPartielles: r.relecture.datesPartielles,
      personnesVerifiees: r.fiche?.personnesVerifiees ?? null,
      methode: r.relecture.methode,
      limites: r.relecture.limites,
      alertes: r.relecture.alertes,
      aRelire: r.relecture.aRelire,
      bios: [...r.bios.keys()],
      membres: !r.fiche ? (membresFiles[id] ? 'ignoré' : 'absent') : r.fiche.appartenance === 'lue' ? 'lu' : r.fiche.appartenance === 'illisible' ? 'illisible' : 'absent',
      anciens: r.relecture.etatAnciens,
      personnesVerifieesAnciens: r.fiche?.anciens.personnesVerifiees ?? null,
      methodeAnciens: r.relecture.methodeAnciens,
      limitesAnciens: r.relecture.limitesAnciens,
    } satisfies Partial<JusticeReportParti>);
    for (const c of r.fiche?.condamnations ?? []) {
      bilan.parStatut[c.statut] += 1;
      bilan.parFamille[c.famille] += 1;
      bilan.niveaux[niveau(c)][c.famille] += 1;
      bilan.parAppartenance[c.appartenance.statut] += 1;
      if (c.categorie === 'ancien_membre') bilan.anciensAffichees += 1;
      if (c.appartenance.statut === 'inconnu' && !bilan.inconnus.includes(c.personne)) bilan.inconnus.push(c.personne);
    }
    partis.push({ ...base, sigle: r.sigle, fiche: r.fiche });
  }

  // Une même décision citée par deux fiches d'un candidat (la sienne, ou celle d'une personne membre des deux partis) :
  // la page la montre une fois (fiche du premier parti) ; les écarts de statut, de peine ou de famille entre fiches, et
  // les quasi-doublons (juridiction libellée autrement, date plus ou moins précise), sont signalés.
  const signalees = new Set<string>();
  for (const c of candidats) {
    const entrees = (c.partis ?? []).flatMap((p) =>
      (partis.find((x) => x.id === p.id)?.fiche?.condamnations ?? [])
        .filter((k) => k.candidat === c.id || k.candidat === null)
        .map((k) => ({ parti: p.id, k })),
    );
    for (const [i, a] of entrees.entries())
      for (const b of entrees.slice(i + 1)) {
        if (a.parti === b.parti || (a.k.candidat === null) !== (b.k.candidat === null)) continue;
        if (!memePersonne(a.k.personne, b.k.personne) || !datesCompatibles(a.k.dateDecision, b.k.dateDecision)) continue;
        const where = `${a.parti}/${a.k.id} et ${b.parti}/${b.k.id}`;
        // deux candidats rattachés aux deux mêmes partis : une seule alerte par paire de membres
        if (signalees.has(where)) continue;
        signalees.add(where);
        const memeDate = a.k.dateDecision === b.k.dateDecision;
        const dates = !memeDate
          ? `dates compatibles (« ${a.k.dateDecision} » / « ${b.k.dateDecision} »)`
          : periodeDecision(a.k.dateDecision)?.precision === 'jour'
            ? 'même date'
            : `même date partielle (« ${a.k.dateDecision} »)`;
        const juridictions =
          cleDecision({ ...a.k, dateDecision: '' }) === cleDecision({ ...b.k, dateDecision: '' })
            ? 'même juridiction'
            : `juridictions libellées différemment (« ${a.k.juridiction} » / « ${b.k.juridiction} »)`;
        // fusionnées sur la page (src/lib/justice.ts, pageJustice) seulement au jour près
        const cleA = cleMemeDecision(a.k);
        if (cleA === null || cleA !== cleMemeDecision(b.k))
          issues.push({ severity: 'avertissement', code: 'condamnation-quasi-doublon', candidat: c.id, message: `${where} : ${dates}, ${juridictions} : les deux entrées sont affichées sur la page — vérifier s'il s'agit de la même décision.` });
        else if (a.k.statut !== b.k.statut || a.k.peine !== b.k.peine || a.k.famille !== b.k.famille)
          issues.push({ severity: 'avertissement', code: 'condamnation-divergente', candidat: c.id, message: `${where} : même décision, statut, peine ou famille différents entre les fiches ; la page affiche ceux de ${niveau(a.k) <= niveau(b.k) ? a.parti : b.parti}.` });
        else if (niveau(a.k) !== niveau(b.k))
          issues.push({ severity: 'info', code: 'condamnation-niveaux', candidat: c.id, message: `${where} : même décision, la personne est membre actuelle d'un parti et ancienne membre de l'autre ; présentée une fois, au niveau 1 (${niveau(a.k) === 1 ? a.parti : b.parti}).` });
      }
  }

  const bios = new Map<string, Bio>();
  for (const c of candidats) {
    const sources = (c.partis ?? []).map((p) => biosParParti.get(p.id)?.get(c.id)).filter((b): b is Bio => b !== undefined);
    const [bio, ...autres] = sources;
    if (bio) bios.set(c.id, bio);
    else if (c.partis?.length) report.candidatsSansBio.push(c.id);
    if (autres.length > 0)
      issues.push({ severity: 'info', code: 'bio-multiple', candidat: c.id, message: 'Biographie présente dans plusieurs fiches : celle du parti principal est retenue.' });
  }
  return { partis, bios, report, issues };
}
