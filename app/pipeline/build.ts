// Fusion des données (pure, sans accès disque) :
//   votes.json (source de vérité des votes nominatifs AN / Congrès)
// + data/research/<id>.json (contexte, arguments, positions hors AN)
// + candidats.json (groupes proxy et leurs périodes de validité)
// + data/research/simple/<id>.json (version « En clair », facultative)
// + data/research/attributions.json (orateur réel des citations de séance, facultatif)
// + data/justice/<parti>.json (présentation des partis, biographies, condamnations ; facultatifs)
// + data/justice/membres/<parti>.json et data/justice/anciens/<parti>.json (appartenance actuelle, anciens membres)
// → AppData validé + rapport.
import { deepFrenchSpacing } from '../src/lib/typo';
import type { AppData, Candidat, CandidatePosition, CategorieFile, EnClair, EvidenceType, Question } from '../src/types';
import { buildApprofondi, emptyApprofondiReport, parseSelectionApprofondi } from './approfondi';
import { parseAttributions, type AttributionCheck } from './attribution';
import { fallbackTitle } from './fallback';
import { buildPartis, emptyJusticeReport, type JusticeFile } from './justice';
import { emptyPreuves, type BuildReport, type Issue, type QuestionsReport } from './report';
import { parseResearch, type Research } from './research';
import { governmentPosition, groupMajority, resolvePosition, scrutinNumero } from './resolve';
import { parseSimple } from './simple';
import {
  appDataSchema,
  candidatsSchema,
  selectionSchema,
  votesSchema,
  type CandidatInput,
  type SelectionEntry,
  type VoteEntry,
} from './schemas';

export interface BuildInputs {
  /** Contenu JSON déjà parsé de data/selection.json. */
  selection: unknown;
  /** Contenu JSON déjà parsé de data/build/votes.json. */
  votes: unknown;
  /** Contenu JSON déjà parsé de data/candidats.json. */
  candidats: unknown;
  /** Fichiers de recherche : id (nom de fichier sans .json) → contenu texte brut. */
  research: Record<string, string>;
  /** Fichiers « En clair » (data/research/simple/) : id → contenu texte brut. Facultatif. */
  simple?: Record<string, string>;
  /** Contenu brut de data/research/attributions.json ; null ou absent si le fichier manque. */
  attributions?: string | null;
  /** Fichiers data/justice/<partiId>.json : partiId → contenu brut et date de modification. Facultatif. */
  justice?: Record<string, JusticeFile>;
  /** data/justice/membres/<partiId>.json (appartenance actuelle des personnes condamnées). Facultatif. */
  justiceMembres?: Record<string, JusticeFile>;
  /** data/justice/anciens/<partiId>.json (condamnations d'anciens membres : passif des partis). Facultatif. */
  justiceAnciens?: Record<string, JusticeFile>;
  /**
   * Mode approfondi (facultatif) : contenu brut de data/selection-approfondi.json et de
   * data/build/votes-approfondi.json ; null ou absent si le fichier manque (pas de mode approfondi).
   */
  selectionApprofondi?: string | null;
  votesApprofondi?: string | null;
  /** Date de collecte de l'open data AN (data/raw/COLLECTED_AT). */
  collecteAN: string | null;
  /** Horodatage de génération. */
  now: Date;
}

export interface BuildOutput {
  data: AppData | null;
  report: BuildReport;
  /** Questions propres à chaque catégorie du mode approfondi (src/generated/approfondi/<id>.json), chargées à la demande. */
  categories: CategorieFile[];
}


const REAL_VOTES: EvidenceType[] = ['vote_an', 'vote_congres', 'vote_senat', 'vote_pe'];

function emptyReport(): BuildReport {
  return {
    issues: [],
    questionsSansRecherche: [],
    fichiersRechercheIgnores: [],
    preuves: emptyPreuves(),
    couverture: {},
    proxies: [],
    incoherences: [],
    enClairManquants: [],
    attributionsLues: false,
    proposDeTiers: [],
    justice: emptyJusticeReport(),
    approfondi: emptyApprofondiReport(),
  };
}


/** Clé de tri alphabétique : le nom sans le premier prénom (« Marine Le Pen » → « Le Pen »). */
export function sortKey(nom: string): string {
  const parts = nom.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : nom;
}

function defaultOuiSignifie(sel: SelectionEntry): 'pour' | 'contre' {
  // « motion_censure=non » : voter la censure (pour) = Non à la réforme, donc Oui = contre la censure.
  return sel.sens === 'motion_censure=non' ? 'contre' : 'pour';
}

export function buildData(inputs: BuildInputs): BuildOutput {
  const report = emptyReport();
  const issue = (i: Issue): void => {
    report.issues.push(i);
  };

  // ------------------------------------------------------------ entrées de référence (strictes)
  const selR = selectionSchema.safeParse(inputs.selection);
  const votesR = votesSchema.safeParse(inputs.votes);
  const candR = candidatsSchema.safeParse(inputs.candidats);
  for (const [name, r] of [
    ['selection.json', selR],
    ['votes.json', votesR],
    ['candidats.json', candR],
  ] as const) {
    if (!r.success)
      for (const e of r.error.issues.slice(0, 20))
        issue({ severity: 'erreur', code: 'schema-entree', message: `${name} ${e.path.join('.')} : ${e.message}` });
  }
  if (!selR.success || !votesR.success || !candR.success) return { data: null, report, categories: [] };

  const selection = selR.data;
  const candidats: CandidatInput[] = candR.data;
  const candidateIds = candidats.map((c) => c.id);
  const votesById = new Map<string, VoteEntry>(votesR.data.map((v) => [v.id, v]));

  const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
  for (const d of dupes(selection.map((s) => s.id)))
    issue({ severity: 'erreur', code: 'id-duplique', question: d, message: 'Identifiant de question dupliqué dans selection.json.' });
  for (const d of dupes(candidateIds))
    issue({ severity: 'erreur', code: 'id-duplique', candidat: d, message: 'Identifiant de candidat dupliqué dans candidats.json.' });
  for (const v of votesR.data)
    for (const cid of Object.keys(v.candidats))
      if (!candidateIds.includes(cid))
        issue({ severity: 'avertissement', code: 'candidat-inconnu', question: v.id, candidat: cid, message: 'Candidat de votes.json absent de candidats.json.' });

  // ------------------------------------------------------------ mode approfondi : sélection (tolérante, facultative)
  // Lue avant la recherche : les fichiers data/research/<id>.json de ses nouvelles questions ne sont pas orphelins.
  const mainIds = new Set(selection.map((s) => s.id));
  const appro = parseSelectionApprofondi(inputs.selectionApprofondi ?? null, mainIds);
  report.approfondi = appro.report;
  const approIds = new Set([...appro.ids].filter((id) => !mainIds.has(id)));
  /** Les anomalies propres au mode approfondi vont dans son bilan, jamais dans celui du parcours principal. */
  const pushFor = (id: string, issues: readonly Issue[]): void => {
    (mainIds.has(id) || !approIds.has(id) ? report.issues : report.approfondi.issues).push(...issues);
  };

  // ------------------------------------------------------------ recherche (tolérante)
  const research = new Map<string, Research>();
  for (const [id, content] of Object.entries(inputs.research)) {
    if (!mainIds.has(id) && !approIds.has(id)) {
      issue({ severity: 'avertissement', code: 'recherche-orpheline', question: id, message: 'Fichier de recherche sans question correspondante dans selection.json (ni dans selection-approfondi.json), ignoré.' });
      report.fichiersRechercheIgnores.push(`${id}.json (orphelin)`);
      continue;
    }
    const parsed = parseResearch(id, content, candidateIds);
    pushFor(id, parsed.issues);
    if (parsed.research) research.set(id, parsed.research);
    else if (mainIds.has(id)) report.fichiersRechercheIgnores.push(`${id}.json (illisible)`);
  }

  // ------------------------------------------------------------ « En clair » et attributions (facultatifs)
  const enClair = new Map<string, EnClair>();
  for (const [id, content] of Object.entries(inputs.simple ?? {})) {
    if (!mainIds.has(id) && !approIds.has(id)) {
      issue({ severity: 'avertissement', code: 'en-clair-orphelin', question: id, message: `simple/${id}.json sans question correspondante dans selection.json (ni dans selection-approfondi.json), ignoré.` });
      continue;
    }
    const parsed = parseSimple(id, content);
    pushFor(id, parsed.issues);
    if (parsed.enClair) enClair.set(id, parsed.enClair);
  }
  const attributions = parseAttributions(inputs.attributions ?? null);
  report.issues.push(...attributions.issues);
  report.attributionsLues = attributions.present;
  for (const key of attributions.checks.keys()) {
    const [qid, cid] = key.split('/');
    if ((!mainIds.has(qid ?? '') && !approIds.has(qid ?? '')) || !candidateIds.includes(cid ?? ''))
      issue({ severity: 'avertissement', code: 'attribution-orpheline', message: `attributions.json : « ${key} » ne correspond à aucune question ou à aucun candidat.` });
    else if (!research.get(qid ?? '')?.candidats[cid ?? '']?.citation)
      pushFor(qid ?? '', [
        { severity: 'info', code: 'attribution-sans-citation', question: qid, candidat: cid, message: 'attributions.json vérifie une citation absente de la recherche actuelle : ignoré.' },
      ]);
  }

  // ------------------------------------------------------------ partis et condamnations (facultatifs)
  // date du jour à Paris, comme les dates des fiches
  const aujourdhui = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(inputs.now);
  const justice = buildPartis(candidats, inputs.justice ?? {}, aujourdhui, {
    membres: inputs.justiceMembres ?? {},
    anciens: inputs.justiceAnciens ?? {},
  });
  report.issues.push(...justice.issues);
  report.justice = justice.report;

  // ------------------------------------------------------------ questions
  const ctx: QuestionContext = { candidats, research, enClair, attributions: attributions.checks };
  const questions: Question[] = [];
  for (const sel of selection) {
    const vote = votesById.get(sel.id);
    if (!vote) {
      issue({ severity: 'erreur', code: 'vote-manquant', question: sel.id, message: 'Question sans entrée dans votes.json : exclue.' });
      continue;
    }
    if (vote.scrutin !== sel.scrutin) {
      issue({ severity: 'erreur', code: 'scrutin-different', question: sel.id, message: `votes.json (${vote.scrutin}) ne correspond pas à selection.json (${sel.scrutin}) : relancer extract_votes.py.` });
      continue;
    }
    questions.push(
      buildQuestion(
        {
          id: sel.id,
          theme: sel.theme,
          question: sel.question,
          censure: sel.sens.startsWith('motion_censure'),
          defaultOui: defaultOuiSignifie(sel),
          note: sel.note ?? null,
        },
        vote,
        ctx,
        report,
      ),
    );
  }

  const themes: string[] = [];
  for (const q of questions) if (!themes.includes(q.theme)) themes.push(q.theme);

  // ------------------------------------------------------------ mode approfondi (par catégorie)
  // Les questions du parcours principal sont reprises telles quelles (même objet, même recherche) ;
  // seules les nouvelles questions sont construites ici, avec les mêmes règles.
  const approfondi = buildApprofondi({
    entries: appro.entries,
    votes: inputs.votesApprofondi ?? null,
    mainQuestions: questions,
    mainSelection: selection,
    report: report.approfondi,
    build: (spec, vote) => deepFrenchSpacing(buildQuestion(spec, vote, ctx, report.approfondi)),
  });

  // Typographie : espaces insécables autour des guillemets et avant : ; ! ? dans tous les textes
  // (recherche comprise) — un guillemet fermant ne passe jamais seul à la ligne.
  const data: AppData = deepFrenchSpacing({
    version: 1,
    genereLe: inputs.now.toISOString(),
    collecteAN: inputs.collecteAN,
    candidats: candidats.map(
      (c): Candidat => ({
        id: c.id,
        nom: c.nom,
        parti: c.parti,
        tri: sortKey(c.nom),
        proxy: {
          groupes: c.proxyGroupe,
          periodes: (c.proxyPeriodes ?? []).map((p) => ({ du: p.du ?? null, au: p.au ?? null })),
          motif: c.proxyMotif ?? null,
        },
        partis: (c.partis ?? []).map((p) => p.id),
        bio: justice.bios.get(c.id) ?? null,
      }),
    ),
    partis: justice.partis,
    themes,
    questions,
    approfondi: approfondi.index,
  } satisfies AppData);

  // ------------------------------------------------------------ validation finale du fichier produit
  const out = appDataSchema.safeParse(data);
  if (!out.success) {
    for (const e of out.error.issues.slice(0, 50))
      issue({ severity: 'erreur', code: 'schema-sortie', message: `${e.path.join('.')} : ${e.message}` });
  }
  return { data, report, categories: approfondi.categories };
}

/** Ce qui définit une question, quel que soit le fichier de sélection (parcours principal ou mode approfondi). */
export interface QuestionSpec {
  id: string;
  /** Thème (parcours principal) ou catégorie (mode approfondi). */
  theme: string;
  question: string;
  /** Le scrutin de référence est une motion de censure. */
  censure: boolean;
  /** Position au scrutin qui correspond à « Oui », sauf si la recherche en décide autrement. */
  defaultOui: 'pour' | 'contre';
  note: string | null;
  /** Titre à défaut de recherche (sinon pipeline/fallback.ts) : le mode approfondi y met la question entière. */
  titreSecours?: string;
}

export interface QuestionContext {
  candidats: CandidatInput[];
  research: ReadonlyMap<string, Research>;
  enClair: ReadonlyMap<string, EnClair>;
  attributions: ReadonlyMap<string, AttributionCheck>;
}

/**
 * Fusionne le vote officiel, la recherche et la version « En clair » d'une question et résout la position de chaque
 * candidat (resolve.ts). Les anomalies et compteurs vont dans `acc` (bilan du parcours principal ou du mode approfondi).
 */
export function buildQuestion(sel: QuestionSpec, vote: VoteEntry, ctx: QuestionContext, acc: QuestionsReport): Question {
  const { candidats, research, enClair, attributions } = ctx;
  const issue = (i: Issue): void => {
    acc.issues.push(i);
  };
  const r = research.get(sel.id) ?? null;
  if (!enClair.has(sel.id)) acc.enClairManquants.push(sel.id);
  if (!r) {
    acc.questionsSansRecherche.push(sel.id);
    issue({ severity: 'avertissement', code: 'recherche-absente', question: sel.id, message: 'Pas de fichier de recherche valide : question issue de selection.json / votes.json, positions AN + proxies.' });
  }

  const censure = sel.censure;
  const defaultOui = sel.defaultOui;
  let ouiSignifie = defaultOui;
  if (r?.ouiSignifie) {
    ouiSignifie = r.ouiSignifie;
    if (r.ouiSignifie !== defaultOui) {
      issue({
        severity: censure ? 'avertissement' : 'info',
        code: 'sens-inverse',
        question: sel.id,
        message: `La recherche fixe ouiSignifie = « ${r.ouiSignifie} » (sélection : « ${defaultOui} »)${r.question ? ' avec une question reformulée' : ''} : à vérifier.`,
      });
    }
  } else if (r?.question && r.question !== sel.question) {
    issue({ severity: 'info', code: 'sens-defaut', question: sel.id, message: `Question reformulée sans ouiSignifie : « ${defaultOui} » par défaut.` });
  }

  if (censure && r) {
    for (const [cid, c] of Object.entries(r.candidats)) {
      if (c.type === 'gouvernement' && c.position === 'pour')
        issue({
          severity: 'avertissement',
          code: 'censure-suspecte',
          question: sel.id,
          candidat: cid,
          message: 'Motion de censure : un membre du Gouvernement noté « pour » (la censure) — position peut-être exprimée par rapport à la réforme et non au scrutin.',
        });
    }
  }

  const scrutinUrl = vote.urlScrutin ?? r?.urlScrutin ?? null;
  if (vote.urlScrutin && r?.urlScrutin && r.urlScrutin !== vote.urlScrutin)
    issue({ severity: 'info', code: 'url-scrutin', question: sel.id, message: `urlScrutin de la recherche (${r.urlScrutin}) différente de celle de l'AN : l'URL officielle est retenue.` });
  if (!scrutinUrl)
    issue({ severity: 'avertissement', code: 'url-scrutin-absente', question: sel.id, message: 'Aucune URL de page officielle du scrutin.' });

  if (!censure)
    for (const g of vote.groupes) {
      const computed = groupMajority(g, false);
      if (g.majoritaire !== computed)
        issue({
          severity: 'info',
          code: 'majorite-recalculee',
          question: sel.id,
          message: `Groupe ${g.abrege ?? g.libelle} : positionMajoritaire AN « ${g.majoritaire} » incohérente avec le décompte (${g.pour} pour, ${g.contre} contre, ${g.abstention} abst.) → « ${computed ?? 'aucune'} » retenue.`,
        });
    }

  const govPosition = governmentPosition(r, candidats);
  const positions: Record<string, CandidatePosition> = {};
  for (const c of candidats) {
    const res = resolvePosition({
      candidat: c,
      vote,
      research: r,
      ouiSignifie,
      censure,
      govPosition,
      attributionCheck: attributions.get(`${sel.id}/${c.id}`) ?? null,
    });
    positions[c.id] = res.position;
    const att = res.position.attribution;
    if (att?.duCandidat === false)
      acc.proposDeTiers.push({
        question: sel.id,
        candidat: c.id,
        porteur: att.porteur,
        orateur: att.orateur,
        groupe: att.groupe,
        verification: att.verification,
        citation: r?.candidats[c.id]?.citation != null,
      });
    for (const i of res.issues) {
      acc.issues.push(i);
      if (i.code === 'incoherence-vote') acc.incoherences.push(i);
    }
    acc.preuves[res.position.evidence] += 1;
    const cov = (acc.couverture[c.id] ??= { connues: 0, inconnues: 0, votes: 0, proxies: 0 });
    if (res.position.stance === 'inconnu') cov.inconnues += 1;
    else cov.connues += 1;
    if (REAL_VOTES.includes(res.position.evidence)) cov.votes += 1;
    if (res.position.evidence === 'groupe') {
      cov.proxies += 1;
      acc.proxies.push({ question: sel.id, candidat: c.id, groupe: res.position.groupe ?? '?' });
    }
    if (r && !r.candidats[c.id])
      issue({ severity: 'info', code: 'candidat-sans-entree', question: sel.id, candidat: c.id, message: 'Pas d’entrée pour ce candidat dans la recherche.' });
  }

  return {
    id: sel.id,
    theme: sel.theme,
    titre: r?.titre ?? sel.titreSecours ?? fallbackTitle(sel.id, sel.question, vote.date),
    question: r?.question ?? sel.question,
    ouiSignifie,
    contexte: r?.contexte ?? null,
    contexteSources: r?.contexteSources ?? [],
    recherche: r !== null,
    enClair: enClair.get(sel.id) ?? null,
    scrutin: {
      uid: vote.scrutin,
      assemblee: vote.scrutin.startsWith('VTCG') ? 'Congrès' : 'AN',
      numero: scrutinNumero(vote.scrutin),
      date: vote.date,
      titre: vote.titreScrutin,
      typeVote: vote.typeVote,
      sort: vote.sort,
      pour: vote.pour,
      contre: vote.contre,
      abstention: vote.abstention,
      url: scrutinUrl,
      urlDossier: r?.urlDossier ?? null,
      censure,
      note: sel.note,
    },
    groupes: vote.groupes.map((g) => ({
      abrege: g.abrege ?? g.libelle,
      libelle: g.libelle,
      membres: g.membres,
      majoritaire: groupMajority(g, censure),
      pour: g.pour,
      contre: g.contre,
      abstention: g.abstention,
      nonVotants: g.nonVotants,
    })),
    arguments: {
      pour: r?.argumentsPour ?? [],
      contre: r?.argumentsContre ?? [],
      abstention: r?.argumentsAbstention ?? [],
    },
    candidats: positions,
    alertes: r?.alertes ?? [],
  };
}
