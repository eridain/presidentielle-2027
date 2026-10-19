// Lecture tolérante d'un fichier data/research/<id>.json (schéma : data/research/BRIEF.md).
// Les fichiers sont produits en parallèle par la recherche : un champ invalide est écarté
// (et signalé) sans faire échouer le build ; seul un fichier illisible est ignoré en entier.
import type { Argument, ScrutinPosition, SourceLink } from '../src/types';
import { argumentSchema, isHttpUrl, sourceLinkSchema } from './schemas';
import type { Issue } from './report';

/** Fichiers du dossier data/research/ qui ne sont pas des recherches par question. */
export const NOT_RESEARCH: ReadonlySet<string> = new Set(['tasks.json', 'attributions.json', 'deputes_par_groupe_2026.json']);

export type ResearchType =
  | 'vote_an'
  | 'vote_senat'
  | 'vote_congres'
  | 'vote_pe'
  | 'gouvernement'
  | 'declaration'
  | 'groupe';

export interface ResearchCandidate {
  position: ScrutinPosition | 'inconnu';
  type: ResearchType | null;
  detail: string | null;
  argument: string | null;
  citation: string | null;
  url: string | null;
  date: string | null;
}

export interface Research {
  id: string;
  titre: string | null;
  question: string | null;
  ouiSignifie: 'pour' | 'contre' | null;
  contexte: string | null;
  contexteSources: SourceLink[];
  urlScrutin: string | null;
  urlDossier: string | null;
  argumentsPour: Argument[];
  argumentsContre: Argument[];
  argumentsAbstention: Argument[];
  candidats: Record<string, ResearchCandidate>;
  alertes: string[];
}

const TYPES: readonly ResearchType[] = [
  'vote_an',
  'vote_senat',
  'vote_congres',
  'vote_pe',
  'gouvernement',
  'declaration',
  'groupe',
];

const TYPE_ALIASES: Record<string, ResearchType> = {
  proxy: 'groupe',
  proxy_groupe: 'groupe',
  vote_parlement_europeen: 'vote_pe',
  vote_europeen: 'vote_pe',
};

const POSITION_ALIASES: Record<string, ScrutinPosition | 'inconnu'> = {
  pour: 'pour',
  contre: 'contre',
  abstention: 'abstention',
  abstenu: 'abstention',
  inconnu: 'inconnu',
  inconnue: 'inconnu',
  absent: 'inconnu',
  'non-votant': 'inconnu',
  'non votant': 'inconnu',
};

function show(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function looseDate(value: unknown): string | null {
  const t = text(value);
  return t !== null && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(t) ? t : null;
}

export interface ParseResult {
  research: Research | null;
  issues: Issue[];
}

/**
 * Analyse le contenu texte d'un fichier de recherche.
 * @param expectedId identifiant attendu (nom du fichier)
 * @param candidateIds identifiants des candidats connus
 */
export function parseResearch(expectedId: string, content: string, candidateIds: readonly string[]): ParseResult {
  const issues: Issue[] = [];
  const warn = (code: string, message: string, candidat?: string): void => {
    issues.push({ severity: 'avertissement', code, question: expectedId, candidat, message });
  };

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (e) {
    warn('recherche-illisible', `JSON invalide, fichier ignoré (${(e as Error).message}).`);
    return { research: null, issues };
  }
  if (!isRecord(raw)) {
    warn('recherche-illisible', 'Le fichier ne contient pas un objet JSON, fichier ignoré.');
    return { research: null, issues };
  }

  if (raw.id !== expectedId) {
    warn('recherche-id', `Champ id « ${show(raw.id)} » différent du nom de fichier « ${expectedId} ».`);
  }

  const titre = text(raw.titre);
  const question = text(raw.question);
  if (!titre) warn('champ-manquant', 'Champ « titre » manquant ou vide.');
  if (!question) warn('champ-manquant', 'Champ « question » manquant ou vide.');

  let ouiSignifie: 'pour' | 'contre' | null = null;
  if (raw.ouiSignifie === 'pour' || raw.ouiSignifie === 'contre') ouiSignifie = raw.ouiSignifie;
  else if (raw.ouiSignifie !== undefined && raw.ouiSignifie !== null)
    warn('champ-invalide', `ouiSignifie « ${show(raw.ouiSignifie)} » invalide (pour|contre attendu), ignoré.`);

  const contexte = text(raw.contexte);
  if (!contexte) warn('champ-manquant', 'Champ « contexte » manquant ou vide.');

  const contexteSources: SourceLink[] = [];
  for (const [i, item] of (Array.isArray(raw.contexteSources) ? raw.contexteSources : []).entries()) {
    const r = sourceLinkSchema.safeParse(item);
    if (r.success) contexteSources.push(r.data);
    else warn('url-invalide', `contexteSources[${i}] écartée : ${r.error.issues.map((x) => x.message).join(', ')}.`);
  }
  if (contexte && contexteSources.length === 0) warn('champ-manquant', 'Contexte sans source valide.');

  const url = (key: 'urlScrutin' | 'urlDossier'): string | null => {
    const v = raw[key];
    if (v === undefined || v === null || v === '') return null;
    if (isHttpUrl(v)) return v;
    warn('url-invalide', `${key} « ${show(v)} » n'est pas une URL http(s), ignorée.`);
    return null;
  };

  const args = (key: 'argumentsPour' | 'argumentsContre' | 'argumentsAbstention'): Argument[] => {
    const out: Argument[] = [];
    const list = raw[key];
    if (list === undefined || list === null) return out;
    if (!Array.isArray(list)) {
      warn('champ-invalide', `${key} n'est pas une liste, ignoré.`);
      return out;
    }
    for (const [i, item] of list.entries()) {
      const r = argumentSchema.safeParse(isRecord(item) ? { ...item, date: looseDate(item.date) } : item);
      if (r.success) {
        out.push({
          auteur: r.data.auteur,
          resume: r.data.resume,
          citation: text(r.data.citation),
          url: r.data.url,
          date: r.data.date ?? null,
        });
      } else {
        warn(
          'argument-invalide',
          `${key}[${i}] écarté : ${r.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join(', ')}.`,
        );
      }
    }
    return out;
  };

  const candidats: Record<string, ResearchCandidate> = {};
  const rawCands: [string, unknown][] = isRecord(raw.candidats)
    ? Object.entries(raw.candidats)
    : Array.isArray(raw.candidats)
      ? raw.candidats.filter(isRecord).map((c) => [String(c.id), c])
      : [];
  if (rawCands.length === 0) warn('champ-manquant', 'Aucune entrée « candidats ».');
  for (const [cid, value] of rawCands) {
    if (!candidateIds.includes(cid)) {
      warn('candidat-inconnu', `Entrée pour un candidat inconnu « ${cid} », ignorée.`);
      continue;
    }
    if (!isRecord(value)) {
      warn('champ-invalide', 'Entrée candidat non objet, ignorée.', cid);
      continue;
    }
    const rawPos = text(value.position)?.toLowerCase() ?? 'inconnu';
    const position = POSITION_ALIASES[rawPos];
    if (!position) warn('champ-invalide', `Position « ${rawPos} » invalide, traitée comme inconnue.`, cid);
    const rawType = text(value.type)?.toLowerCase() ?? null;
    let type: ResearchType | null = null;
    if (rawType !== null) {
      type = (TYPES as readonly string[]).includes(rawType) ? (rawType as ResearchType) : (TYPE_ALIASES[rawType] ?? null);
      if (type === null) warn('champ-invalide', `Type de preuve « ${rawType} » invalide, entrée non utilisée comme preuve.`, cid);
    }
    let candUrl: string | null = null;
    if (value.url !== undefined && value.url !== null && value.url !== '') {
      if (isHttpUrl(value.url)) candUrl = value.url;
      else warn('url-invalide', `URL « ${show(value.url)} » invalide, ignorée.`, cid);
    }
    if (value.date !== undefined && value.date !== null && looseDate(value.date) === null)
      warn('champ-invalide', `Date « ${show(value.date)} » invalide, ignorée.`, cid);
    candidats[cid] = {
      position: position ?? 'inconnu',
      type,
      detail: text(value.detail),
      argument: text(value.argument),
      citation: text(value.citation),
      url: candUrl,
      date: looseDate(value.date),
    };
  }

  const alertes = Array.isArray(raw.alertes) ? raw.alertes.map(text).filter((a): a is string => a !== null) : [];

  return {
    research: {
      id: expectedId,
      titre,
      question,
      ouiSignifie,
      contexte,
      contexteSources,
      urlScrutin: url('urlScrutin'),
      urlDossier: url('urlDossier'),
      argumentsPour: args('argumentsPour'),
      argumentsContre: args('argumentsContre'),
      argumentsAbstention: args('argumentsAbstention'),
      candidats,
      alertes,
    },
    issues,
  };
}
