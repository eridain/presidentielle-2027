// Mode « Approfondir par catégorie » (facultatif) :
//   data/selection-approfondi.json (questions par catégorie, dont les 33 du parcours principal : existant = true)
// + data/build/votes-approfondi.json (extract_votes.py --approfondi : votes officiels des nouveaux scrutins)
// + data/research/<id>.json et simple/<id>.json des nouvelles questions (lus par build.ts, facultatifs)
// → index des catégories (AppData.approfondi) + un fichier de questions par catégorie, chargé à la demande.
//
// Tout est toléré : fichier absent = pas de mode approfondi ; entrée invalide, catégorie inconnue, vote manquant =
// entrée écartée et signalée dans data-report.md. Rien ici n'est bloquant ni ne modifie le parcours principal : les
// questions existantes sont reprises telles quelles (même objet, même recherche) et les nouvelles sont construites par
// la même fonction (build.ts, buildQuestion), avec les mêmes règles de résolution.
import { z } from 'zod';
import { CATEGORIES, CIBLE_QUESTIONS_CATEGORIE, MIN_QUESTIONS_CATEGORIE, normaliserCategorie, PORTEES } from '../src/lib/categories';
import type { ApprofondiIndex, ApprofondiQuestionRef, CategorieFile, Portee, Question } from '../src/types';
import type { QuestionSpec } from './build';
import { emptyPreuves, type ApprofondiReport, type Issue } from './report';
import {
  looseDate,
  questionId,
  questionOutSchema,
  scrutinUid,
  voteApprofondiSchema,
  type SelectionEntry,
  type VoteEntry,
} from './schemas';

type Categorie = (typeof CATEGORIES)[number];

/** Entrée de data/selection-approfondi.json validée. */
export interface ApprofondiEntry {
  /** Rang dans le fichier (0 = première entrée). */
  index: number;
  id: string;
  categorie: Categorie;
  scrutin: string;
  date: string | null;
  portee: Portee;
  question: string;
  sens: 'pour=oui' | 'contre=oui' | 'motion_censure=non';
  titreScrutin: string | null;
  resultat: string | null;
  /** Question du parcours principal (même identifiant), reprise telle quelle. */
  existant: boolean;
}

const entrySchema = z.object({
  id: questionId,
  categorie: z.string().trim().min(1),
  scrutin: scrutinUid,
  date: looseDate.nullable().optional(),
  typeVote: z.enum(PORTEES),
  question: z.string().trim().min(1),
  sens: z.enum(['pour=oui', 'contre=oui', 'motion_censure=non']),
  titreScrutin: z.string().nullable().optional(),
  resultat: z.string().nullable().optional(),
  existant: z.boolean().nullable().optional(),
  justification: z.string().nullable().optional(),
});

export function emptyApprofondiReport(): ApprofondiReport {
  return {
    selection: 'absent',
    votes: 'absent',
    entrees: 0,
    ecartees: [],
    categories: [],
    existantesNonReprises: [],
    issues: [],
    questionsSansRecherche: [],
    enClairManquants: [],
    preuves: emptyPreuves(),
    couverture: {},
    proxies: [],
    incoherences: [],
    proposDeTiers: [],
  };
}

/**
 * Portée d'un scrutin d'après son intitulé officiel (« l'amendement n° 12… », « l'article premier… »,
 * « la motion de censure… », « l'ensemble du projet de loi… ») ; null si l'intitulé ne permet pas de conclure.
 * Le vote sur l'article unique d'un texte vaut vote sur l'ensemble (il n'y a pas d'autre vote) : « ensemble ».
 */
export function porteeDepuisTitre(titre: string): Portee | null {
  const t = titre.trim().toLowerCase().replace(/’/g, "'");
  if (/^l'article unique\b/.test(t)) return 'ensemble';
  if (/^(l'|les )(sous-)?amendements?\b/.test(t)) return 'amendement';
  if (/^(l'|les )articles?\b/.test(t)) return 'article';
  if (/^la motion de censure\b/.test(t)) return 'motion_censure';
  if (/^l'ensemble\b/.test(t)) return 'ensemble';
  return null;
}

/** Résultat de la sélection (« adopté », « rejeté 278/0/0 » = pour / contre / abstentions) conforme à l'open data AN. */
export function resultatConforme(resultat: string, vote: Pick<VoteEntry, 'sort' | 'pour' | 'contre' | 'abstention'>): boolean {
  const m = /^\s*(adopté|rejeté)e?s?(?:\s+(\d+)\/(\d+)\/(\d+))?\s*$/.exec(resultat);
  if (!m || m[1] !== vote.sort) return false;
  return m[2] === undefined || (Number(m[2]) === vote.pour && Number(m[3]) === vote.contre && Number(m[4]) === vote.abstention);
}

function categorieDe(libelle: string): { categorie: Categorie; exacte: boolean } | null {
  const exacte = CATEGORIES.find((c) => c.libelle === libelle);
  if (exacte) return { categorie: exacte, exacte: true };
  const proche = CATEGORIES.find((c) => normaliserCategorie(c.libelle) === normaliserCategorie(libelle));
  return proche ? { categorie: proche, exacte: false } : null;
}

export interface ParsedSelectionApprofondi {
  entries: ApprofondiEntry[];
  /** Tous les identifiants du fichier, entrées écartées comprises (leurs recherches ne sont pas « orphelines »). */
  ids: Set<string>;
  report: ApprofondiReport;
}

/**
 * Lecture tolérante de data/selection-approfondi.json (contenu brut ; null si le fichier manque).
 * @param mainIds identifiants des questions du parcours principal (data/selection.json)
 */
export function parseSelectionApprofondi(content: string | null, mainIds: ReadonlySet<string>): ParsedSelectionApprofondi {
  const report = emptyApprofondiReport();
  const entries: ApprofondiEntry[] = [];
  const ids = new Set<string>();
  const add = (i: Issue): void => {
    report.issues.push(i);
  };
  if (content === null) return { entries, ids, report };
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (e) {
    report.selection = 'illisible';
    add({ severity: 'avertissement', code: 'approfondi-illisible', message: `selection-approfondi.json : JSON invalide, mode approfondi désactivé (${(e as Error).message}).` });
    return { entries, ids, report };
  }
  if (!Array.isArray(raw)) {
    report.selection = 'illisible';
    add({ severity: 'avertissement', code: 'approfondi-illisible', message: 'selection-approfondi.json ne contient pas une liste, mode approfondi désactivé.' });
    return { entries, ids, report };
  }
  report.selection = 'lu';
  report.entrees = raw.length;
  const vus = new Set<string>();
  for (const [index, item] of raw.entries()) {
    const id = typeof item === 'object' && item !== null && typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id : null;
    if (id !== null) ids.add(id);
    const ecarter = (motifs: string[]): void => {
      report.ecartees.push({ index, id, motifs });
    };
    const r = entrySchema.safeParse(item);
    if (!r.success) {
      ecarter(r.error.issues.map((x) => `${x.path.join('.') || 'entrée'} : ${x.message}`));
      continue;
    }
    const e = r.data;
    const cat = categorieDe(e.categorie);
    if (!cat) {
      ecarter([`catégorie « ${e.categorie} » inconnue (attendu : ${CATEGORIES.map((c) => `« ${c.libelle} »`).join(', ')})`]);
      continue;
    }
    if (!cat.exacte)
      add({ severity: 'info', code: 'approfondi-categorie-proche', question: e.id, message: `Catégorie « ${e.categorie} » lue comme « ${cat.categorie.libelle} ».` });
    if (vus.has(e.id)) {
      ecarter(['identifiant déjà utilisé plus haut dans le fichier (doublon)']);
      continue;
    }
    vus.add(e.id);
    const principal = mainIds.has(e.id);
    if (e.existant === true && !principal)
      add({ severity: 'avertissement', code: 'approfondi-existant-inconnu', question: e.id, message: 'Marquée « existant » mais absente de selection.json : traitée comme une nouvelle question (vote officiel requis).' });
    if (e.existant !== true && principal)
      add({ severity: 'avertissement', code: 'approfondi-id-principal', question: e.id, message: 'Identifiant d’une question du parcours principal : la question principale est reprise telle quelle.' });
    entries.push({
      index,
      id: e.id,
      categorie: cat.categorie,
      scrutin: e.scrutin,
      date: e.date ?? null,
      portee: e.typeVote,
      question: e.question,
      sens: e.sens,
      titreScrutin: e.titreScrutin ?? null,
      resultat: e.resultat ?? null,
      existant: principal,
    });
  }
  return { entries, ids, report };
}

export interface ApprofondiContext {
  entries: readonly ApprofondiEntry[];
  /** Contenu brut de data/build/votes-approfondi.json ; null si le fichier manque. */
  votes: string | null;
  /** Questions du parcours principal effectivement construites. */
  mainQuestions: readonly Question[];
  mainSelection: readonly SelectionEntry[];
  /** Bilan du mode approfondi (rempli par parseSelectionApprofondi puis ici). */
  report: ApprofondiReport;
  /** Construit une nouvelle question (build.ts, buildQuestion : mêmes règles que le parcours principal). */
  build: (spec: QuestionSpec, vote: VoteEntry) => Question;
}

export interface ApprofondiOutput {
  index: ApprofondiIndex | null;
  categories: CategorieFile[];
}

function parseVotes(content: string | null, report: ApprofondiReport): Map<string, VoteEntry> {
  const votes = new Map<string, VoteEntry>();
  const add = (i: Issue): void => {
    report.issues.push(i);
  };
  if (content === null) {
    report.votes = 'absent';
    return votes;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (e) {
    report.votes = 'illisible';
    add({ severity: 'avertissement', code: 'approfondi-votes-illisible', message: `votes-approfondi.json : JSON invalide, ignoré (${(e as Error).message}).` });
    return votes;
  }
  if (!Array.isArray(raw)) {
    report.votes = 'illisible';
    add({ severity: 'avertissement', code: 'approfondi-votes-illisible', message: 'votes-approfondi.json ne contient pas une liste, ignoré.' });
    return votes;
  }
  report.votes = 'lu';
  for (const [i, item] of raw.entries()) {
    const r = voteApprofondiSchema.safeParse(item);
    const id = typeof item === 'object' && item !== null && typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id : undefined;
    if (!r.success)
      add({
        severity: 'avertissement',
        code: 'approfondi-vote-invalide',
        question: id,
        message: `votes-approfondi.json[${String(i)}] écarté : ${r.error.issues.slice(0, 3).map((x) => `${x.path.join('.')} ${x.message}`).join(', ')}.`,
      });
    else votes.set(r.data.id, r.data);
  }
  return votes;
}

/** Construit les catégories du mode approfondi. */
export function buildApprofondi(ctx: ApprofondiContext): ApprofondiOutput {
  const { report } = ctx;
  if (report.selection !== 'lu') return { index: null, categories: [] };
  const add = (i: Issue): void => {
    report.issues.push(i);
  };
  const ecarter = (e: ApprofondiEntry, motifs: string[]): void => {
    report.ecartees.push({ index: e.index, id: e.id, motifs });
  };
  const nouvelles = ctx.entries.filter((e) => !e.existant);
  const votes = nouvelles.length > 0 ? parseVotes(ctx.votes, report) : new Map<string, VoteEntry>();
  if (nouvelles.length > 0 && report.votes === 'absent')
    add({
      severity: 'avertissement',
      code: 'approfondi-votes-absent',
      message: `data/build/votes-approfondi.json absent : ${String(nouvelles.length)} nouvelle(s) question(s) écartée(s). Lancer « python3 data/scripts/extract_votes.py --approfondi ».`,
    });
  const mainById = new Map(ctx.mainQuestions.map((q) => [q.id, q]));
  const mainScrutin = new Map(ctx.mainSelection.map((s) => [s.id, s.scrutin]));

  type Retenue = { ref: ApprofondiQuestionRef; question: Question };
  const parCategorie = new Map<string, Retenue[]>(CATEGORIES.map((c) => [c.id, []]));
  for (const e of ctx.entries) {
    if (e.existant) {
      const q = mainById.get(e.id);
      if (!q) {
        ecarter(e, ['question du parcours principal non construite (voir les erreurs du parcours principal)']);
        continue;
      }
      if (mainScrutin.get(e.id) !== e.scrutin)
        add({
          severity: 'avertissement',
          code: 'approfondi-scrutin-existant',
          question: e.id,
          message: `Scrutin ${e.scrutin} dans selection-approfondi.json, ${mainScrutin.get(e.id) ?? '?'} dans selection.json : la question du parcours principal est reprise telle quelle.`,
        });
      const titre = porteeDepuisTitre(q.scrutin.titre);
      if (titre && titre !== e.portee && !(q.scrutin.censure && e.portee === 'motion_censure'))
        add({ severity: 'info', code: 'approfondi-portee', question: e.id, message: `Portée déclarée « ${e.portee} », intitulé officiel : « ${q.scrutin.titre} ».` });
      parCategorie.get(e.categorie.id)?.push({ ref: { id: e.id, existant: true, portee: q.scrutin.censure ? 'motion_censure' : e.portee }, question: q });
      continue;
    }
    const vote = votes.get(e.id);
    if (!vote) {
      ecarter(e, [report.votes === 'lu' ? 'absente de votes-approfondi.json (relancer extract_votes.py --approfondi)' : 'votes-approfondi.json absent ou illisible']);
      continue;
    }
    if (vote.scrutin !== e.scrutin) {
      ecarter(e, [`votes-approfondi.json (${vote.scrutin}) ne correspond pas à la sélection (${e.scrutin}) : relancer extract_votes.py --approfondi`]);
      continue;
    }
    if (e.date && e.date !== vote.date)
      add({ severity: 'info', code: 'approfondi-date', question: e.id, message: `Date de la sélection ${e.date}, date officielle du scrutin ${vote.date} (retenue).` });
    if (e.resultat && !resultatConforme(e.resultat, vote))
      add({
        severity: 'avertissement',
        code: 'approfondi-resultat',
        question: e.id,
        message: `Résultat « ${e.resultat} » dans la sélection, « ${vote.sort} ${String(vote.pour)}/${String(vote.contre)}/${String(vote.abstention)} » dans l’open data AN (retenu).`,
      });
    const titre = porteeDepuisTitre(vote.titreScrutin);
    // La motion de censure change la résolution (députés absents = soutien implicite, majorité des membres) : une
    // portée déclarée que l'intitulé officiel contredit sur ce point écarte la question au lieu de fausser les positions.
    const censureDeclaree = e.portee === 'motion_censure' || e.sens === 'motion_censure=non';
    if (titre !== null && censureDeclaree !== (titre === 'motion_censure')) {
      ecarter(e, [
        `${censureDeclaree ? 'déclarée motion de censure' : 'non déclarée motion de censure'} alors que l’intitulé officiel dit « ${vote.titreScrutin} » : à corriger dans la sélection`,
      ]);
      continue;
    }
    if (titre && titre !== e.portee)
      add({
        severity: 'avertissement',
        code: 'approfondi-portee',
        question: e.id,
        message: `Portée déclarée « ${e.portee} » alors que l’intitulé officiel évoque « ${titre} » (« ${vote.titreScrutin} ») : la portée déclarée est affichée, à vérifier.`,
      });
    const question = ctx.build(
      {
        id: e.id,
        theme: e.categorie.libelle,
        question: e.question,
        censure: censureDeclaree,
        defaultOui: e.sens === 'pour=oui' ? 'pour' : 'contre',
        note: null,
        // sans recherche, la formulation de la sélection sert de titre (jamais tronquée)
        titreSecours: e.question,
      },
      vote,
    );
    const valid = questionOutSchema.safeParse(question);
    if (!valid.success) {
      ecarter(e, valid.error.issues.slice(0, 5).map((x) => `sortie invalide : ${x.path.join('.')} ${x.message}`));
      continue;
    }
    parCategorie.get(e.categorie.id)?.push({ ref: { id: e.id, existant: false, portee: e.portee }, question });
  }

  const categories: CategorieFile[] = [];
  const index: ApprofondiIndex = { categories: [] };
  for (const c of CATEGORIES) {
    const retenues = parCategorie.get(c.id) ?? [];
    const proposee = retenues.length >= MIN_QUESTIONS_CATEGORIE;
    report.categories.push({
      id: c.id,
      libelle: c.libelle,
      questions: retenues.length,
      existantes: retenues.filter((r) => r.ref.existant).length,
      nouvelles: retenues.filter((r) => !r.ref.existant).length,
      avecRecherche: retenues.filter((r) => r.question.recherche).length,
      avecEnClair: retenues.filter((r) => r.question.enClair !== null).length,
      proposee,
    });
    if (retenues.length > 0 && !proposee)
      add({
        severity: 'avertissement',
        code: 'approfondi-categorie-insuffisante',
        message: `Catégorie « ${c.libelle} » : ${String(retenues.length)} question(s) retenue(s), moins de ${String(MIN_QUESTIONS_CATEGORIE)} — non proposée sur le site.`,
      });
    else if (proposee && retenues.length < CIBLE_QUESTIONS_CATEGORIE)
      add({ severity: 'info', code: 'approfondi-categorie-courte', message: `Catégorie « ${c.libelle} » : ${String(retenues.length)} questions (objectif : ${String(CIBLE_QUESTIONS_CATEGORIE)}).` });
    if (!proposee) continue;
    index.categories.push({ id: c.id, libelle: c.libelle, questions: retenues.map((r) => r.ref) });
    categories.push({ categorie: c.id, questions: retenues.filter((r) => !r.ref.existant).map((r) => r.question) });
  }
  const reprises = new Set(ctx.entries.filter((e) => e.existant).map((e) => e.id));
  report.existantesNonReprises = ctx.mainQuestions.map((q) => q.id).filter((id) => !reprises.has(id));
  return { index: index.categories.length > 0 ? index : null, categories };
}
