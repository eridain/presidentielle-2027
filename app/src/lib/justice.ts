// Section « Partis & candidats » : libellés et regroupement des condamnations pour la page d'un candidat.
// Même mise en page et mêmes règles pour tous les partis ; aucun classement par nombre de condamnations.
import type {
  AppData,
  Appartenance,
  Candidat,
  CategorieCondamnation,
  Condamnation,
  EvidenceType,
  FamilleCondamnation,
  LienCondamnation,
  NatureCondamnation,
  Parti,
  Question,
  SourceCondamnation,
  Stance,
  StatutCondamnation,
  StatutMembre,
} from '../types';
import { formatDepuis } from './format';
import { collator } from './scoring';

/**
 * Badge de statut : seule une décision définitive met fin à la présomption d'innocence. Libellés épicènes
 * (valables pour une femme, un homme ou un parti).
 */
export const STATUT_LABEL: Record<StatutCondamnation, string> = {
  definitive: 'Définitive',
  appel_en_cours: 'Appel en cours — présomption d’innocence',
  pourvoi_en_cours: 'Pourvoi en cassation en cours — présomption d’innocence',
  inconnu: 'Statut non confirmé',
};

/** Libellés des compteurs (sans la mention de présomption d'innocence, rappelée dans l'avertissement). */
export const STATUT_COMPTEUR: Record<StatutCondamnation, string> = {
  definitive: 'Définitive',
  appel_en_cours: 'Appel en cours',
  pourvoi_en_cours: 'Pourvoi en cassation en cours',
  inconnu: 'Statut non confirmé',
};

export const STATUTS: readonly StatutCondamnation[] = ['definitive', 'appel_en_cours', 'pourvoi_en_cours', 'inconnu'];

export const NATURE_LABEL: Record<NatureCondamnation, string> = {
  penale: 'pénale',
  financiere: 'financière',
  civile: 'civile',
};

export const CATEGORIE_LABEL: Record<CategorieCondamnation, string> = {
  candidat: 'candidat',
  parti: 'parti (personne morale)',
  ancien_dirigeant: 'ancien dirigeant',
  dirigeant: 'direction actuelle',
  depute: 'député',
  senateur: 'sénateur',
  eurodepute: 'député européen',
  ancien_membre: 'ancien membre',
};

export type CleGroupeParti = 'parti' | 'anciens' | 'direction' | 'parlementaires';

/** Groupes d'une fiche de parti, dans cet ordre, pour tous les partis. */
export const GROUPES_PARTI: readonly { cle: CleGroupeParti; titre: string; categories: readonly CategorieCondamnation[] }[] = [
  { cle: 'parti', titre: 'Le parti (personne morale)', categories: ['parti'] },
  { cle: 'anciens', titre: 'Anciens dirigeants', categories: ['ancien_dirigeant'] },
  { cle: 'direction', titre: 'Direction actuelle', categories: ['dirigeant'] },
  { cle: 'parlementaires', titre: 'Parlementaires en exercice', categories: ['depute', 'senateur', 'eurodepute'] },
];

// ---------------------------------------------------------------- familles de condamnations

/**
 * Familles, de la plus grave à la moins grave : ordre d'affichage partout (synthèse, liste, filtre, compteurs).
 * Le classement d'une condamnation suit sa qualification juridique ; l'ordre de gravité est un choix éditorial.
 */
export const FAMILLES: readonly FamilleCondamnation[] = ['probite', 'violences', 'haine', 'diffamation', 'autres'];

export const FAMILLE_LABEL: Record<FamilleCondamnation, string> = {
  probite: 'Probité\u00a0: argent public, corruption, fraude',
  violences: 'Violences contre les personnes',
  haine: 'Propos\u00a0: haine, discrimination, négationnisme',
  diffamation: 'Propos\u00a0: diffamation, injure',
  autres: 'Autres infractions',
};

/** Libellés courts : ligne de compteurs des cartes « Partis & candidats ». */
export const FAMILLE_COURT: Record<FamilleCondamnation, string> = {
  probite: 'Probité',
  violences: 'Violences',
  haine: 'Propos haine',
  diffamation: 'Diffamation',
  autres: 'Autres',
};

/** Contenu de chaque famille (Méthodologie). */
export const FAMILLE_CONTENU: Record<FamilleCondamnation, string> = {
  probite:
    'détournement de fonds publics, corruption, trafic d’influence, prise illégale d’intérêts, financement illégal de campagne, abus de biens sociaux et abus de confiance (et leur recel), escroquerie, fraude fiscale et blanchiment, omission dans une déclaration de patrimoine, sanctions financières (Cour des comptes, Cour de discipline budgétaire et financière), avantages illicites procurés par des laboratoires, association de malfaiteurs (affaire du financement libyen)',
  violences: 'violences volontaires, conjugales, en réunion, avec arme',
  haine:
    'provocation à la haine ou à la discrimination, injure à caractère raciste ou homophobe, contestation de crime contre l’humanité',
  diffamation: 'diffamation et injure envers une personne, un élu, une association',
  autres:
    'rébellion et outrage, conduite en état d’ivresse, destruction et vol, affichage électoral illégal, blessures involontaires, intrusion',
};

/** Mise en avant de la famille Probité (synthèse de la page d'un candidat). */
export const MENTION_PROBITE = 'Atteintes à la probité\u00a0: manquement au devoir d’exemplarité des élus';

export const isFamille = (value: unknown): value is FamilleCondamnation => FAMILLES.includes(value as FamilleCondamnation);

// ---------------------------------------------------------------- appartenance actuelle au parti (niveaux)

/** Statuts d'appartenance : toujours au parti, puis anciens membres, puis appartenance non établie. */
export const STATUTS_MEMBRE: readonly StatutMembre[] = ['membre', 'suspendu', 'personne_morale', 'exclu', 'depart', 'retire', 'decede', 'inconnu'];

/** Niveau 1 — toujours au parti : seules ces condamnations (et celles du candidat) sont comptées dans les totaux. */
export const STATUTS_NIVEAU_1: readonly StatutMembre[] = ['membre', 'suspendu', 'personne_morale'];

export const isStatutMembre = (value: unknown): value is StatutMembre => STATUTS_MEMBRE.includes(value as StatutMembre);

/**
 * Niveau d'affichage : 1 = toujours au parti (le candidat lui-même, quel que soit son statut ; les membres, y compris
 * suspendus ; le parti en tant que personne morale), compté dans les totaux ; 2 = passif du parti (anciens membres
 * exclus, partis, retirés, décédés, ou appartenance non établie), présenté à part et non compté. Les condamnations de la
 * recherche « anciens membres » (data/justice/anciens/, catégorie `ancien_membre`) sont toujours au niveau 2.
 */
export type Niveau = 1 | 2;

export function niveau(c: Pick<Condamnation, 'candidat' | 'categorie' | 'appartenance'>): Niveau {
  if (c.candidat !== null) return 1;
  if (c.categorie === 'ancien_membre') return 2;
  return STATUTS_NIVEAU_1.includes(c.appartenance.statut) ? 1 : 2;
}

/** Badge d'appartenance : libellés épicènes (valables pour une femme, un homme ou un parti), comme le statut judiciaire. */
export const APPARTENANCE_LABEL: Record<StatutMembre, string> = {
  membre: 'Membre',
  suspendu: 'Suspension',
  personne_morale: 'Parti',
  exclu: 'Exclusion du parti',
  depart: 'Départ du parti',
  retire: 'Retrait — adhésion non confirmée',
  decede: 'Décès',
  inconnu: 'Statut inconnu',
};

/** Texte du badge : « Suspension depuis le 25 septembre 2026 » quand la date est connue. */
export function libelleAppartenance(a: Pick<Appartenance, 'statut' | 'depuis'>): string {
  return a.statut === 'suspendu' && a.depuis ? `${APPARTENANCE_LABEL.suspendu} ${formatDepuis(a.depuis)}` : APPARTENANCE_LABEL[a.statut];
}

const LIEN_SUFFIXE: Record<LienCondamnation, string> = {
  oui: ' — en lien avec l’affaire',
  non: ' — pour un autre motif',
  inconnu: '',
};

/**
 * Ligne de contexte d'une personne : « Exclusion du parti en 2015 — en lien avec l'affaire », « A quitté le parti en
 * 2019 », « Décès en 2025 ». Épicène ; l'année seule (le détail sourcé donne la date précise et le motif).
 */
export function contexteAppartenance(a: Pick<Appartenance, 'statut' | 'depuis' | 'lien'>): string {
  const en = a.depuis ? ` en ${a.depuis.slice(0, 4)}` : '';
  const lien = a.lien ? LIEN_SUFFIXE[a.lien] : '';
  switch (a.statut) {
    case 'membre':
      return 'Toujours membre du parti';
    case 'suspendu':
      return `Suspension du parti${a.depuis ? ` ${formatDepuis(a.depuis)}` : ''}${lien}`;
    case 'personne_morale':
      return 'Le parti lui-même (personne morale)';
    case 'exclu':
      return `Exclusion du parti${en}${lien}`;
    case 'depart':
      return `A quitté le parti${en}${lien}`;
    case 'retire':
      return `Retrait de la vie politique${en}, adhésion au parti non confirmée${lien}`;
    case 'decede':
      return `Décès${en}`;
    case 'inconnu':
      return 'Appartenance actuelle au parti non établie par la recherche';
  }
}

/** Mise en valeur positive d'une exclusion motivée par l'affaire. */
export const MENTION_ECARTEE = 'Le parti a écarté cette personne après l’affaire.';

export const ecartee = (a: Pick<Appartenance, 'statut' | 'lien'>): boolean => a.statut === 'exclu' && a.lien === 'oui';

/** Titre de la section de niveau 2 (page d'un candidat). */
export const TITRE_PASSIF = 'Passif\u00a0: anciens membres condamnés (non comptés dans les totaux)';

/** Mots d'un nom propre, sans accents ni casse ni ponctuation (« Dupont-Aignan » → dupont, aignan). */
export function nameTokens(nom: string): string[] {
  return nom
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Précision d'une date de décision : les sources ne donnent pas toujours le jour, ni le mois. */
export type PrecisionDate = 'annee' | 'mois' | 'jour';

export interface PeriodeDecision {
  precision: PrecisionDate;
  /** Premier et dernier jour possibles de la décision (AAAA-MM-JJ) : « 1998 » → 1998-01-01 … 1998-12-31. */
  debut: string;
  fin: string;
}

function joursDansLeMois(annee: number, mois: number): number {
  if (mois === 2) return annee % 4 === 0 && (annee % 100 !== 0 || annee % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(mois) ? 30 : 31;
}

/**
 * Date de décision « AAAA », « AAAA-MM » ou « AAAA-MM-JJ » (date calendaire valide : 2021-02-30 et 2021-13 sont
 * refusées) ; null pour toute autre valeur.
 */
export function periodeDecision(value: unknown): PeriodeDecision | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value);
  const a = m?.[1];
  if (!m || a === undefined) return null;
  const [, , mo, j] = m;
  const annee = Number(a);
  if (annee < 1) return null; // « 0000 » : année invalide (et attribut HTML datetime invalide)
  if (mo === undefined) return { precision: 'annee', debut: `${a}-01-01`, fin: `${a}-12-31` };
  const mois = Number(mo);
  if (mois < 1 || mois > 12) return null;
  const dernier = joursDansLeMois(annee, mois);
  if (j === undefined) return { precision: 'mois', debut: `${a}-${mo}-01`, fin: `${a}-${mo}-${String(dernier)}` };
  const jour = Number(j);
  if (jour < 1 || jour > dernier) return null;
  return { precision: 'jour', debut: value, fin: value };
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Ordre chronologique de deux dates de décision (négatif si `a` est antérieure), indépendant de la langue : par
 * premier jour possible, puis par dernier jour (« 1998-01-01 » avant « 1998 », lui-même avant « 1998-05-12 »).
 * Une valeur illisible se place avant toutes les autres.
 */
export function compareDateDecision(a: string, b: string): number {
  const pa = periodeDecision(a);
  const pb = periodeDecision(b);
  if (!pa || !pb) return (pa ? 1 : 0) - (pb ? 1 : 0) || cmp(a, b);
  return cmp(pa.debut, pb.debut) || cmp(pa.fin, pb.fin);
}

/** Deux dates qui peuvent désigner le même jour : identiques, ou l'une précise l'autre (« 2015-05 » et « 2015-05-12 »). */
export function datesCompatibles(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}-`) || b.startsWith(`${a}-`);
}

/** Même décision : même personne (mots du nom dans n'importe quel ordre), même date, même juridiction. */
export function cleDecision(c: Pick<Condamnation, 'personne' | 'dateDecision' | 'juridiction'>): string {
  return [nameTokens(c.personne).sort().join(' '), c.dateDecision, nameTokens(c.juridiction).join(' ')].join('|');
}

/**
 * Clé de fusion automatique (doublon rejeté au build, décision d'un candidat citée par deux fiches affichée une fois) :
 * seulement pour une date au jour près. Avec une date partielle, deux décisions distinctes de la même juridiction la
 * même année auraient la même clé : null, jamais fusionnées (signalées pour relecture par le pipeline).
 */
export function cleMemeDecision(c: Pick<Condamnation, 'personne' | 'dateDecision' | 'juridiction'>): string | null {
  return periodeDecision(c.dateDecision)?.precision === 'jour' ? cleDecision(c) : null;
}

export type Compteurs = Record<StatutCondamnation, number>;

export function compter(items: readonly Condamnation[]): Compteurs {
  const n: Compteurs = { definitive: 0, appel_en_cours: 0, pourvoi_en_cours: 0, inconnu: 0 };
  for (const c of items) n[c.statut] += 1;
  return n;
}

/** Sources de deux fiches pour la même décision : une entrée par URL, citations réunies. */
function fusionSources(a: readonly SourceCondamnation[], b: readonly SourceCondamnation[]): SourceCondamnation[] {
  const out = a.map((s) => ({ ...s, citations: [...s.citations] }));
  for (const s of b) {
    const deja = out.find((o) => o.url === s.url);
    if (!deja) out.push({ ...s, citations: [...s.citations] });
    else for (const c of s.citations) if (!deja.citations.includes(c)) deja.citations.push(c);
  }
  return out;
}

/** Plus récente d'abord ; à date égale, ordre stable (juridiction, puis identifiant). */
const parDate = (a: Condamnation, b: Condamnation) =>
  compareDateDecision(b.dateDecision, a.dateDecision) || collator.compare(a.juridiction, b.juridiction) || cmp(a.id, b.id);

export interface GroupeCondamnations {
  cle: CleGroupeParti;
  titre: string;
  items: Condamnation[];
}

/**
 * Message quand rien n'est affiché : « en-cours » = pas de liste publiée ; « aucune-trouvee » = la recherche n'a
 * trouvé aucune condamnation ; « aucune-retenue » = des entrées existent mais aucune ne concerne ce groupe ou n'a passé
 * les contrôles (jamais « aucune trouvée » dans ce cas).
 */
export type EtatVide = 'en-cours' | 'aucune-trouvee' | 'aucune-retenue';

export interface BlocParti {
  parti: Parti;
  /** Fiche sans liste exploitable, liste vide, ou groupes à afficher. */
  etat: Exclude<EtatVide, 'aucune-retenue'> | 'groupes';
  /** Niveau 1 : membres toujours au parti, par catégorie, plus récente d'abord (vides si la fiche est absente). */
  groupes: GroupeCondamnations[];
  /** Condamnations de niveau 1 du parti et de ses membres actuels présentées sur la page (hors candidats). */
  total: number;
  /** Niveau 2 : condamnations d'anciens membres (passif du parti), plus récente d'abord ; non comptées dans `total`. */
  passif: Condamnation[];
  /** Autres candidats rattachés à ce parti dont la fiche cite des condamnations (affichées sur leur page). */
  autresCandidats: { id: string; n: number }[];
}

/** Catégorie de personne à l'intérieur d'une famille : le candidat, puis chaque groupe de chaque parti. */
export interface SousGroupe {
  cle: 'candidat' | CleGroupeParti;
  /** Parti des membres ; null pour le candidat lui-même. */
  parti: Parti | null;
  /** Plus récente d'abord. */
  items: Condamnation[];
}

export interface GroupeFamille {
  famille: FamilleCondamnation;
  /** Sous-groupes non vides : candidat, parti (personne morale), anciens dirigeants, direction, parlementaires. */
  sousGroupes: SousGroupe[];
  total: number;
}

/** Une personne du passif dans une famille : une ligne de contexte (son appartenance), puis ses condamnations. */
export interface PersonnePassif {
  /** Clé stable : parti, personne et appartenance. */
  cle: string;
  parti: Parti;
  personne: string;
  /** Rôle tiré de sa condamnation la plus récente. */
  roleActuel: string | null;
  /** Appartenance de sa condamnation la plus récente, sources de ses autres entrées réunies. */
  appartenance: Appartenance;
  /** Détails et réactions du parti distincts de ses entrées (plus récente d'abord) : aucun n'est perdu. */
  details: string[];
  reactions: string[];
  /** Plus récente d'abord. */
  items: Condamnation[];
}

export interface FamillePassif {
  famille: FamilleCondamnation;
  /** Personnes, celle dont la décision est la plus récente d'abord. */
  personnes: PersonnePassif[];
  total: number;
}

/** Niveau 2 de la page : le passif des partis du candidat (anciens membres), non compté dans les totaux. */
export interface Passif {
  /** Les cinq familles dans l'ordre de gravité (familles vides comprises, `personnes` vide). */
  familles: FamillePassif[];
  compteurs: Compteurs;
  total: number;
}

/** Compteurs d'une famille pour la synthèse : qui est concerné, et statut des décisions (niveau 1). */
export interface LigneFamille {
  famille: FamilleCondamnation;
  /** Le candidat lui-même. */
  candidat: number;
  /** Le ou les partis en tant que personnes morales. */
  parti: number;
  /** Membres actuels : anciens dirigeants toujours membres, direction actuelle, parlementaires. */
  membres: number;
  /** Niveau 1 : candidat + parti + membres actuels. */
  total: number;
  parStatut: Compteurs;
  /** Niveau 2 : condamnations d'anciens membres de cette famille (passif), non comptées dans `total`. */
  passif: number;
}

export interface PageJustice {
  /** Condamnations du candidat lui-même, toutes fiches de ses partis confondues (doublons fusionnés). */
  candidat: Condamnation[];
  /** Message pour le candidat quand il n'a aucune condamnation présentée. */
  candidatVide: EtatVide;
  /**
   * Message quand la page ne présente aucune condamnation : une fiche non publiée → « en cours » ; toutes les listes
   * vides → « aucune trouvée » ; sinon « aucune retenue ».
   */
  pageVide: EtatVide;
  /** Au moins une fiche de ses partis a une liste de condamnations exploitable. */
  documente: boolean;
  partis: BlocParti[];
  /** Liste de niveau 1 : les cinq familles dans l'ordre de gravité (sous-groupes vides omis). */
  familles: GroupeFamille[];
  /** Synthèse : une ligne par famille, dans l'ordre de gravité, familles à zéro comprises. */
  synthese: LigneFamille[];
  /** Niveau 1 (candidat, parti, membres actuels), par statut : les seuls comptés. */
  compteurs: Compteurs;
  total: number;
  /** Niveau 2 : anciens membres, présentés à part et non comptés. */
  passif: Passif;
  /** Date de consultation la plus ancienne des fiches lues (AAAA-MM-JJ). */
  dateConsultation: string | null;
}

/**
 * Condamnations affichées sur la page d'un candidat : les siennes et celles de chacun de ses partis. Niveau 1 (le
 * candidat, le parti, ses membres actuels) : regroupé par famille (ordre de gravité), puis par catégorie de personne,
 * puis par date (plus récente d'abord) ; seul compté. Niveau 2 (passif : anciens membres) : par famille, puis par
 * personne (une ligne de contexte chacune), puis par date ; présenté à part.
 */
export function pageJustice(data: Pick<AppData, 'partis'>, candidat: Pick<Candidat, 'id' | 'partis'>): PageJustice {
  const partis = candidat.partis
    .map((id) => data.partis.find((p) => p.id === id))
    .filter((p): p is Parti => p !== undefined);

  // Ses propres condamnations (toujours niveau 1) : une même décision citée par deux fiches n'apparaît qu'une fois.
  const siennes = new Map<string, Condamnation>();
  for (const p of partis)
    for (const c of p.fiche?.condamnations ?? []) {
      if (c.candidat !== candidat.id) continue;
      const cle = cleMemeDecision(c) ?? c.id;
      const deja = siennes.get(cle);
      if (!deja) siennes.set(cle, c);
      else
        siennes.set(cle, { ...deja, sources: fusionSources(deja.sources, c.sources) });
    }
  const candidatItems = [...siennes.values()].sort(parDate);

  // Membres et anciens membres : une même décision (au jour près) citée par deux fiches du candidat, pour une personne
  // des deux partis, n'apparaît qu'une fois (sources réunies) — sinon elle serait comptée deux fois : au niveau 1 si
  // l'une des fiches l'y place (la personne est toujours membre de l'un des partis), sinon dans le premier parti.
  const entrees = partis.flatMap((p, i) =>
    (p.fiche?.condamnations ?? []).filter((c) => c.candidat === null).map((c) => ({ i, c, n: niveau(c) })),
  );
  const retenues: typeof entrees = [];
  const vus = new Map<string, number>();
  for (const e of [...entrees.filter((x) => x.n === 1), ...entrees.filter((x) => x.n === 2)]) {
    const cle = cleMemeDecision(e.c);
    const rang = cle === null ? undefined : vus.get(cle);
    const premier = rang === undefined ? undefined : retenues[rang];
    if (rang !== undefined && premier && premier.i !== e.i) {
      retenues[rang] = { ...premier, c: { ...premier.c, sources: fusionSources(premier.c.sources, e.c.sources) } };
      continue;
    }
    if (cle !== null) vus.set(cle, retenues.length);
    retenues.push(e);
  }

  const blocs = partis.map((parti, i): BlocParti => {
    const all = parti.fiche?.condamnations ?? [];
    const miennes = retenues.filter((e) => e.i === i);
    const membres = miennes.filter((e) => e.n === 1).map((e) => e.c);
    const autres = new Map<string, number>();
    for (const c of all) if (c.candidat !== null && c.candidat !== candidat.id) autres.set(c.candidat, (autres.get(c.candidat) ?? 0) + 1);
    const liste = parti.fiche?.liste ?? 'absente';
    const groupes = parti.fiche
      ? GROUPES_PARTI.map((g) => ({
          cle: g.cle,
          titre: g.titre,
          items: membres.filter((c) => g.categories.includes(c.categorie)).sort(parDate),
        }))
      : [];
    return {
      parti,
      etat: liste === 'absente' ? 'en-cours' : liste === 'vide' ? 'aucune-trouvee' : 'groupes',
      groupes,
      total: groupes.reduce((n, g) => n + g.items.length, 0),
      passif: miennes.filter((e) => e.n === 2).map((e) => e.c).sort(parDate),
      autresCandidats: [...autres].map(([id, n]) => ({ id, n })),
    };
  });

  // niveau 1 : famille → catégorie de personne (candidat, puis chaque groupe, parti par parti) → date
  const familles = FAMILLES.map((famille): GroupeFamille => {
    const de = (items: readonly Condamnation[]) => items.filter((c) => c.famille === famille);
    const lui: SousGroupe = { cle: 'candidat', parti: null, items: de(candidatItems) };
    const membres = GROUPES_PARTI.flatMap((g) =>
      blocs.map((b): SousGroupe => ({ cle: g.cle, parti: b.parti, items: de(b.groupes.find((x) => x.cle === g.cle)?.items ?? []) })),
    );
    const sousGroupes = [lui, ...membres].filter((s) => s.items.length > 0);
    return { famille, sousGroupes, total: sousGroupes.reduce((n, s) => n + s.items.length, 0) };
  });

  // niveau 2 : famille → personne (parti, nom et appartenance) → date
  const passifItems = blocs.flatMap((b) => b.passif.map((c) => ({ parti: b.parti, c })));
  const famillesPassif = FAMILLES.map((famille): FamillePassif => {
    const personnes = new Map<string, PersonnePassif>();
    // plus récente d'abord : la première entrée d'une personne est sa décision la plus récente
    for (const { parti, c } of passifItems.filter((x) => x.c.famille === famille).sort((a, b) => parDate(a.c, b.c))) {
      const a = c.appartenance;
      const cle = [parti.id, c.personne, a.statut, a.depuis ?? '', a.lien ?? ''].join('|');
      const p = personnes.get(cle) ?? { cle, parti, personne: c.personne, roleActuel: c.roleActuel, appartenance: a, details: [], reactions: [], items: [] };
      if (p.items.length > 0) p.appartenance = { ...p.appartenance, sources: fusionSources(p.appartenance.sources, a.sources) };
      p.items.push(c);
      if (a.detail && !p.details.includes(a.detail)) p.details.push(a.detail);
      if (a.reactionParti && !p.reactions.includes(a.reactionParti)) p.reactions.push(a.reactionParti);
      personnes.set(cle, p);
    }
    const liste = [...personnes.values()];
    return { famille, personnes: liste, total: liste.reduce((n, p) => n + p.items.length, 0) };
  });

  const synthese = familles.map((f, i): LigneFamille => {
    const n = (pred: (s: SousGroupe) => boolean) => f.sousGroupes.filter(pred).reduce((k, s) => k + s.items.length, 0);
    return {
      famille: f.famille,
      candidat: n((s) => s.cle === 'candidat'),
      parti: n((s) => s.cle === 'parti'),
      membres: n((s) => s.cle !== 'candidat' && s.cle !== 'parti'),
      total: f.total,
      parStatut: compter(f.sousGroupes.flatMap((s) => s.items)),
      passif: famillesPassif[i]?.total ?? 0,
    };
  });

  const affichees = [...candidatItems, ...blocs.flatMap((b) => b.groupes.flatMap((g) => g.items))];
  const dates = partis.map((p) => p.fiche?.dateConsultation).filter((d): d is string => d !== undefined).sort();
  const listes = partis.map((p) => p.fiche?.liste ?? 'absente');
  return {
    candidat: candidatItems,
    // fiche du parti principal non publiée : recherche en cours ; toutes les listes vides : aucune trouvée
    candidatVide: (listes[0] ?? 'absente') === 'absente' ? 'en-cours' : listes.every((l) => l === 'vide') ? 'aucune-trouvee' : 'aucune-retenue',
    documente: listes.some((l) => l !== 'absente'),
    pageVide:
      listes.length === 0 || listes.includes('absente') ? 'en-cours' : listes.every((l) => l === 'vide') ? 'aucune-trouvee' : 'aucune-retenue',
    partis: blocs,
    familles,
    synthese,
    compteurs: compter(affichees),
    total: affichees.length,
    passif: { familles: famillesPassif, compteurs: compter(passifItems.map((x) => x.c)), total: passifItems.length },
    dateConsultation: dates[0] ?? null,
  };
}

/** Segment de la ligne de compteurs d'une carte « Partis & candidats » (niveau 1). */
export interface CompteurFamille {
  famille: FamilleCondamnation;
  n: number;
  /** Dont le candidat lui-même. */
  candidat: number;
}

/**
 * Compteurs d'une carte « Partis & candidats », dans l'ordre de gravité, niveau 1 seulement (candidat, parti, membres
 * actuels) : familles non nulles seulement ; avec `probiteSeule`, la seule famille Probité, même à zéro.
 */
export function compteursCarte(synthese: readonly LigneFamille[], probiteSeule = false): CompteurFamille[] {
  return synthese
    .filter((l) => (probiteSeule ? l.famille === 'probite' : l.total > 0))
    .map((l) => ({ famille: l.famille, n: l.total, candidat: l.candidat }));
}

/** « (+N anciens) » d'une carte : condamnations d'anciens membres (passif), non comptées ; Probité seule avec l'option. */
export function passifCarte(synthese: readonly LigneFamille[], probiteSeule = false): number {
  return synthese.filter((l) => !probiteSeule || l.famille === 'probite').reduce((n, l) => n + l.passif, 0);
}

/** « Probité : 8 (dont candidat : 1) » ; « dont candidat » seulement s'il est non nul. */
export function formatCompteur(c: CompteurFamille): string {
  return `${FAMILLE_COURT[c.famille]}\u00a0: ${String(c.n)}${c.candidat > 0 ? ` (dont candidat\u00a0: ${String(c.candidat)})` : ''}`;
}

// ---------------------------------------------------------------- positions du candidat sur les questions

export interface ResumePositions {
  parStance: Record<Stance, number>;
  /** Positions connues par nature de preuve. */
  parPreuve: Partial<Record<EvidenceType, number>>;
  /** Questions par thème (ordre des thèmes et des questions du quiz). */
  themes: { theme: string; questions: Question[] }[];
}

export function resumePositions(data: Pick<AppData, 'themes' | 'questions'>, candidatId: string): ResumePositions {
  const parStance: Record<Stance, number> = { oui: 0, non: 0, abstention: 0, inconnu: 0 };
  const parPreuve: Partial<Record<EvidenceType, number>> = {};
  for (const q of data.questions) {
    const p = q.candidats[candidatId];
    parStance[p?.stance ?? 'inconnu'] += 1;
    if (p && p.evidence !== 'inconnu') parPreuve[p.evidence] = (parPreuve[p.evidence] ?? 0) + 1;
  }
  return {
    parStance,
    parPreuve,
    themes: data.themes
      .map((theme) => ({ theme, questions: data.questions.filter((q) => q.theme === theme) }))
      .filter((t) => t.questions.length > 0),
  };
}
