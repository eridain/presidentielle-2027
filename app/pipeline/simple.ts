// Lecture tolérante d'un fichier data/research/simple/<id>.json (version « En clair », schéma dans
// data/research/BRIEF-SIMPLE.md). Facultatif : absent ou invalide, la question garde son affichage d'origine.
// Un champ obligatoire manquant fait ignorer le fichier ; une entrée de lexique invalide est seulement écartée.
import type { EnClair } from '../src/types';
import type { Issue } from './report';

const REQUIRED = ['questionSimple', 'enBref', 'pourquoiPour', 'pourquoiContre', 'ceQuiSestPasse'] as const;

/** Seuils du brief : question ≤ 20 mots, écart de longueur entre les deux camps ≤ 30 %, lexique ≤ 3 entrées. */
export const EN_CLAIR_LIMITS = { motsQuestion: 20, ecartCamps: 0.3, lexique: 3 } as const;

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/** Nombre de mots (les signes isolés comme « : » ou « « » ne comptent pas). */
export function wordCount(s: string): number {
  return s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export interface SimpleResult {
  enClair: EnClair | null;
  issues: Issue[];
}

export function parseSimple(expectedId: string, content: string): SimpleResult {
  const issues: Issue[] = [];
  const add = (severity: Issue['severity'], code: string, message: string): void => {
    issues.push({ severity, code, question: expectedId, message });
  };

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (e) {
    add('avertissement', 'en-clair-illisible', `simple/${expectedId}.json : JSON invalide, fichier ignoré (${(e as Error).message}).`);
    return { enClair: null, issues };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    add('avertissement', 'en-clair-illisible', `simple/${expectedId}.json ne contient pas un objet JSON, fichier ignoré.`);
    return { enClair: null, issues };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.id !== expectedId)
    add('avertissement', 'en-clair-id', `simple/${expectedId}.json : champ id « ${String(obj.id)} » différent du nom de fichier.`);

  const missing = REQUIRED.filter((k) => text(obj[k]) === null);
  if (missing.length > 0) {
    add('avertissement', 'en-clair-incomplet', `simple/${expectedId}.json : champ(s) ${missing.join(', ')} manquant(s) ou vide(s), fichier ignoré.`);
    return { enClair: null, issues };
  }

  const lexique: EnClair['lexique'] = [];
  const rawLex = obj.lexique;
  if (rawLex !== undefined && rawLex !== null && !Array.isArray(rawLex))
    add('avertissement', 'en-clair-lexique', `simple/${expectedId}.json : lexique n'est pas une liste, ignoré.`);
  for (const [i, item] of (Array.isArray(rawLex) ? rawLex : []).entries()) {
    const it = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
    const terme = text(it.terme);
    const definition = text(it.definition);
    if (terme && definition) lexique.push({ terme, definition });
    else add('avertissement', 'en-clair-lexique', `simple/${expectedId}.json : lexique[${i}] sans terme ou sans définition, écarté.`);
  }

  const enClair: EnClair = {
    questionSimple: text(obj.questionSimple) ?? '',
    enBref: text(obj.enBref) ?? '',
    pourquoiPour: text(obj.pourquoiPour) ?? '',
    pourquoiContre: text(obj.pourquoiContre) ?? '',
    ceQuiSestPasse: text(obj.ceQuiSestPasse) ?? '',
    lexique,
  };

  // Contrôles du brief : signalés pour relecture, jamais bloquants.
  const mots = wordCount(enClair.questionSimple);
  if (mots > EN_CLAIR_LIMITS.motsQuestion)
    add('info', 'en-clair-longueur', `questionSimple de ${mots} mots (brief : ${EN_CLAIR_LIMITS.motsQuestion} au plus).`);
  if (!/\?\s*$/.test(enClair.questionSimple)) add('info', 'en-clair-forme', 'questionSimple ne se termine pas par « ? ».');
  const [a, b] = [enClair.pourquoiPour.length, enClair.pourquoiContre.length];
  const ecart = Math.abs(a - b) / Math.max(a, b);
  if (ecart > EN_CLAIR_LIMITS.ecartCamps)
    add('info', 'en-clair-equilibre', `Arguments du Oui (${a} caractères) et du Non (${b}) : écart de ${Math.round(ecart * 100)} % (brief : 30 % au plus).`);
  if (lexique.length > EN_CLAIR_LIMITS.lexique)
    add('info', 'en-clair-lexique', `${lexique.length} entrées de lexique (brief : ${EN_CLAIR_LIMITS.lexique} au plus).`);

  return { enClair, issues };
}
