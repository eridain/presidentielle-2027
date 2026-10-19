// Attribution des propos (argument, citation) affichés sous chaque candidat.
// Faute de prise de parole personnelle, la recherche retient souvent l'explication de vote d'un autre
// député de son groupe : ces propos ne doivent jamais être présentés comme ceux du candidat.
// Sources, par ordre de priorité :
//   1. data/research/attributions.json (data/scripts/check_attributions.py) : pour une citation tirée d'un
//      compte rendu de séance, orateur relevé dans le compte rendu (« estLeCandidat ») ;
//   2. la recherche : champ detail (« argument = explication de vote du groupe RN (Michaël Taverne) ») ou
//      argument présenté comme celui du groupe (« (Groupe RN) … », « Position du groupe EPR : … ») ou du
//      Gouvernement (« Position du Gouvernement : … », sans citation personnelle).
// Sinon : attribution inconnue (affichage d'origine, « Ses raisons »).
import { z } from 'zod';
import type { Attribution } from '../src/types';
import type { Issue } from './report';
import type { ResearchCandidate } from './research';

/** Entrée de attributions.json, clé « <questionId>/<candidatId> ». */
export interface AttributionCheck {
  /** La citation a été retrouvée dans le compte rendu. */
  trouve: boolean;
  /** Dernier orateur avant la citation (« M. Laurent Jacobelli »). */
  orateur: string | null;
  estLeCandidat: boolean | null;
}

const checkSchema = z.object({
  trouve: z.boolean(),
  orateur: z.string().nullable(),
  estLeCandidat: z.boolean().nullable(),
});

export interface ParsedAttributions {
  /** Le fichier existe et a pu être lu. */
  present: boolean;
  checks: Map<string, AttributionCheck>;
  issues: Issue[];
}

/** Lecture tolérante de attributions.json (absent : null). Une entrée invalide est écartée et signalée. */
export function parseAttributions(content: string | null): ParsedAttributions {
  const checks = new Map<string, AttributionCheck>();
  const issues: Issue[] = [];
  const warn = (message: string): void => {
    issues.push({ severity: 'avertissement', code: 'attributions-invalides', message });
  };
  if (content === null) return { present: false, checks, issues };
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (e) {
    warn(`attributions.json illisible, ignoré (${(e as Error).message}).`);
    return { present: false, checks, issues };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    warn('attributions.json ne contient pas un objet JSON, ignoré.');
    return { present: false, checks, issues };
  }
  for (const [key, value] of Object.entries(raw)) {
    const r = checkSchema.safeParse(value);
    if (!/^[a-z0-9-]+\/[a-z]+$/.test(key) || !r.success) warn(`Entrée « ${key} » invalide, ignorée.`);
    else checks.set(key, r.data);
  }
  return { present: true, checks, issues };
}

/** « M. Laurent Jacobelli » → « Laurent Jacobelli » ; « Mme Rousseau ! Mme Sandrine Rousseau » → « Sandrine Rousseau ». */
export function cleanOrateur(raw: string | null): string | null {
  if (!raw) return null;
  const parts = raw.split(/(?:^|\s)(?:M\.|Mme|MM\.|Mmes)\s+/);
  const last = parts[parts.length - 1]?.replace(/[\s!?.,;:]+$/, '').trim() ?? '';
  return last.length > 1 ? last : null;
}

/** Minuscules sans accents, apostrophes et tirets normalisés. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[\u2010-\u2013]/g, '-');
}

const lastName = (s: string): string => fold(s.trim()).split(/\s+/).at(-1) ?? '';

/** L'orateur est-il le candidat ? (nom de famille : tout sauf le premier prénom, « Le Pen », « Dupont-Aignan ») */
export function sameName(orateur: string, nomCandidat: string): boolean {
  const parts = nomCandidat.trim().split(/\s+/);
  const nom = parts.length > 1 ? parts.slice(1).join(' ') : nomCandidat;
  return new RegExp(`(^|[\\s.-])${fold(nom).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`).test(fold(orateur.trim()));
}

/**
 * Proposition commençant à `start`, jusqu'au prochain « ; » ou « . » de fin de phrase, hors parenthèses
 * et hors initiales (« J.-L. Mélenchon », « R. Ferrand »).
 */
function clauseAt(text: string, start: number): string {
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && ch === ';') return text.slice(start, i);
    else if (depth === 0 && ch === '.') {
      const initial = /(?:^|[\s.-])\p{Lu}$/u.test(text.slice(Math.max(start, i - 2), i));
      if (!initial && /^(\s|$)/.test(text.slice(i + 1, i + 2))) return text.slice(start, i);
    }
  }
  return text.slice(start);
}

const NAME = /^\p{Lu}[\p{L}'’.-]*(?:\s+(?:\p{Lu}[\p{L}'’.-]*|de|du|des|d['’]\p{L}+|le|la))*$/u;

/** Nom de personne (au moins deux mots ou une initiale et un nom), pas un nom de groupe. */
function isName(s: string): boolean {
  const t = s.trim();
  return t.length >= 4 && t.length <= 40 && /\s/.test(t) && !/\d/.test(t) && !/^groupe\b/i.test(t) && NAME.test(t);
}

/** Dernier nom de personne cité dans la proposition : « (Sandrine Rousseau) », « portée par Cyrielle Chatelain ». */
function speakerIn(clause: string): string | null {
  const par = /(?:portée|exprimée|présentée|défendue)\s+par\s+(\p{Lu}[\p{L}'’.-]*(?:\s+(?:\p{Lu}[\p{L}'’.-]*|de|du|d['’]\p{L}+))*)/u.exec(clause);
  if (par?.[1] && isName(par[1])) return par[1].trim();
  const inParens = [...clause.matchAll(/\(([^()]+)\)/g)].map((m) => m[1] ?? '').filter(isName);
  return inParens.at(-1)?.trim() ?? null;
}

/** Nom du groupe dans « groupe GDR (…) », « groupe LR qu'il présidait », « groupe d'alors, LFI-NUPES (…) ». */
function groupIn(text: string): string | null {
  const m = /\b[Gg]roupe\s+(?:d['’]alors,\s*)?([^(),:;]+)/.exec(text);
  const g = m?.[1]
    ?.replace(/\s+(?:en discussion|qu['’](?:il|elle)\b|exprimée|portée|présentée|auquel|dont|lors|le \d|du \d).*$/i, '')
    .replace(/\s+(?:juge|estime|défend|dénonce|soutient|rejette|présente|y voit|revendique).*$/i, '')
    .trim();
  return g && g.length <= 40 && /^\p{Lu}/u.test(g) ? g : null;
}

/** Développe « J.-L. Mélenchon », « M. Karamanli » d'après les auteurs d'arguments de la même recherche. */
export function expandInitials(name: string, auteurs: readonly string[]): string {
  const m = /^((?:\p{Lu}\.-?)+\s+)+(.+)$/u.exec(name);
  const nom = m?.[2];
  if (!nom) return name;
  for (const a of auteurs) {
    const full = a.split(/\s*[(,]/)[0]?.trim() ?? '';
    if (full !== name && isName(full) && fold(full).endsWith(` ${fold(nom)}`)) return full;
  }
  return name;
}

/** Le candidat dit s'être exprimé lui-même (« il s'est exprimé en séance comme président du groupe EPR »). */
const PERSONAL = /\b(?:il|elle) s['’]est exprimée? (?:en séance|personnellement|lui-même|elle-même)/i;
/** Début de la proposition qui décrit l'argument retenu (« argument = … », « l'argument retenu est … »). */
const ARG_CLAUSE = /\bargument(?:\s+retenu)?\s*(?:=|:|est\b)/gi;
const PORTEE_PAR = /\bexplication de vote a été portée par\b/i;
/**
 * Argument présenté comme celui d'un groupe nommé : « (Groupe RN) … », « Position du groupe EPR : … »,
 * « Le groupe GDR juge … », « Explication de vote SOC (Sacha Houlié) : … ».
 */
const ARG_GROUP =
  /^\s*(?:\(?\s*(?:(?:[EÉ]xplication(?: de vote)?|Position|Intervention) du |[Ll]e )?[Gg]roupe (?:\p{Lu}|écologiste)|[EÉ]xplication de vote \p{Lu}+\b)/u;
const ARG_GOUVERNEMENT = /^\s*(?:position du gouvernement|pour le gouvernement)\b/i;

export interface ThirdParty {
  porteur: 'groupe' | 'gouvernement';
  orateur: string | null;
  groupe: string | null;
}

/**
 * La recherche indique-t-elle que l'argument retenu n'est pas celui du candidat ?
 * Renvoie le porteur (groupe ou Gouvernement), l'orateur et le groupe quand ils sont nommés.
 */
export function thirdPartyFromResearch(r: Pick<ResearchCandidate, 'detail' | 'argument' | 'citation'>): ThirdParty | null {
  const detail = r.detail ?? '';
  if (PERSONAL.test(detail)) return null;
  for (const m of detail.matchAll(ARG_CLAUSE)) {
    const clause = clauseAt(detail, m.index);
    if (/\bgroupe\b/i.test(clause)) return { porteur: 'groupe', orateur: speakerIn(clause), groupe: groupIn(clause) };
  }
  const portee = PORTEE_PAR.exec(detail);
  if (portee) {
    const clause = clauseAt(detail, portee.index);
    return { porteur: 'groupe', orateur: speakerIn(clause), groupe: groupIn(detail) };
  }
  const arg = r.argument ?? '';
  if (ARG_GROUP.test(arg)) {
    const head = clauseAt(arg, 0).split(/\s:\s|\s:/)[0] ?? '';
    return { porteur: 'groupe', orateur: speakerIn(head), groupe: groupIn(head) };
  }
  if (ARG_GOUVERNEMENT.test(arg) && !r.citation) return { porteur: 'gouvernement', orateur: null, groupe: null };
  return null;
}

export interface AttributionContext {
  /** Nom du candidat. */
  nom: string;
  research: ResearchCandidate | null;
  /** Groupe du vote nominatif ou du proxy (abréviation AN), groupe du candidat à la date. */
  groupe: string | null;
  /** Vérification dans le compte rendu de séance (attributions.json), si elle existe. */
  check: AttributionCheck | null;
  /** Auteurs des arguments de la même recherche (pour développer « R. Ferrand »). */
  auteurs: readonly string[];
}

export interface AttributionResult {
  attribution: Attribution | null;
  /** Problèmes à signaler (sans question ni candidat : ajoutés par l'appelant). */
  problemes: { severity: Issue['severity']; code: string; message: string }[];
}

const UNKNOWN: Attribution = { duCandidat: null, porteur: null, orateur: null, groupe: null, verification: null };

export function resolveAttribution(ctx: AttributionContext): AttributionResult {
  const { nom, research: r, check } = ctx;
  const problemes: AttributionResult['problemes'] = [];
  if (!r || (!r.argument && !r.citation)) return { attribution: null, problemes };
  const tiers = thirdPartyFromResearch(r);
  const expand = (name: string | null) => (name ? expandInitials(name, ctx.auteurs) : null);

  // 1. Citation retrouvée dans le compte rendu de séance : l'orateur relevé fait foi.
  if (check?.trouve && check.estLeCandidat !== null && r.citation) {
    if (check.estLeCandidat) {
      if (tiers?.porteur === 'groupe')
        problemes.push({
          severity: 'avertissement',
          code: 'attribution-divergente',
          message: `Compte rendu : citation prononcée par le candidat, alors que la recherche présente l'argument comme celui du groupe${tiers.orateur ? ` (${tiers.orateur})` : ''}. Le compte rendu est retenu.`,
        });
      return { attribution: { duCandidat: true, porteur: null, orateur: nom, groupe: null, verification: 'compte-rendu' }, problemes };
    }
    const selonRecherche = expand(tiers?.orateur ?? null);
    const orateur = cleanOrateur(check.orateur) ?? selonRecherche;
    if (orateur && selonRecherche && lastName(orateur) !== lastName(selonRecherche))
      problemes.push({
        severity: 'avertissement',
        code: 'attribution-divergente',
        message: `Orateur relevé dans le compte rendu (${orateur}) différent de celui indiqué par la recherche (${selonRecherche}). Le compte rendu est retenu.`,
      });
    return {
      attribution: {
        duCandidat: false,
        porteur: 'groupe',
        orateur,
        groupe: ctx.groupe ?? tiers?.groupe ?? null,
        verification: 'compte-rendu',
      },
      problemes,
    };
  }
  if (check && !check.trouve)
    problemes.push({ severity: 'info', code: 'citation-non-retrouvee', message: 'Citation non retrouvée dans le compte rendu de séance : attribution déduite de la recherche.' });

  // 2. Indication de la recherche.
  if (tiers) {
    const orateur = expand(tiers.orateur);
    if (orateur && sameName(orateur, nom))
      return { attribution: { duCandidat: true, porteur: null, orateur: nom, groupe: null, verification: 'recherche' }, problemes };
    return {
      attribution: {
        duCandidat: false,
        porteur: tiers.porteur,
        orateur,
        groupe: tiers.porteur === 'groupe' ? (ctx.groupe ?? tiers.groupe) : null,
        verification: 'recherche',
      },
      problemes,
    };
  }
  return { attribution: { ...UNKNOWN }, problemes };
}
