// Mise en forme (français).
import type { ScrutinPosition, Stance, UserAnswer } from '../types';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 2017-11-28 » → « 28 novembre 2017 » ; accepte AAAA et AAAA-MM. */
export function formatDate(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const mois = mo ? MOIS[Number(mo) - 1] : undefined;
  if (!mois) return y ?? iso;
  if (!d) return `${mois} ${y}`;
  return `${Number(d) === 1 ? '1er' : Number(d)} ${mois} ${y}`;
}

/** Date d'une décision selon sa précision : « en 1998 », « en mai 2015 », « le 16 décembre 2025 ». */
export function formatDateDecision(iso: string): string {
  if (/^\d{4}(-\d{2})?$/.test(iso)) return `en ${formatDate(iso)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `le ${formatDate(iso)}`;
  return iso;
}

/** Début d'une situation selon sa précision : « depuis 2019 », « depuis mai 2015 », « depuis le 25 septembre 2026 ». */
export function formatDepuis(iso: string): string {
  return `depuis ${formatDateDecision(iso).replace(/^en /, '')}`;
}

/** « 2026-10-18 » → « 18/10/2026 ». */
export function formatDateCourte(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? '');
}

/** Période (bornes incluses, AAAA-MM-JJ) : « à partir du 1er mars 2019 », « jusqu'au 31 mars 2026 »… */
export interface Periode {
  du?: string | null | undefined;
  au?: string | null | undefined;
}

/** « jusqu'au 10 décembre 2017 et à partir du 1er octobre 2021 », « du 1er janvier 2020 au 31 décembre 2020 »… */
export function formatPeriodes(periodes: readonly Periode[]): string {
  const one = (p: Periode): string => {
    if (p.du && p.au) return `du ${formatDate(p.du)} au ${formatDate(p.au)}`;
    if (p.du) return `à partir du ${formatDate(p.du)}`;
    return `jusqu'au ${formatDate(p.au ?? null)}`;
  };
  const parts = periodes.map(one);
  const last = parts.pop();
  if (last === undefined) return '';
  return parts.length > 0 ? `${parts.join(', ')} et ${last}` : last;
}

export function formatPercent(x: number | null): string {
  return x === null ? '—' : `${Math.round(x * 100)}\u202f%`;
}

export const STANCE_LABEL: Record<Stance, string> = {
  oui: 'Oui',
  non: 'Non',
  abstention: 'Abstention',
  inconnu: 'Inconnue',
};

export const ANSWER_LABEL: Record<UserAnswer, string> = { oui: 'Oui', non: 'Non', passe: 'Passée' };

export const POSITION_LABEL: Record<ScrutinPosition, string> = {
  pour: 'pour',
  contre: 'contre',
  abstention: 'abstention',
};

/** « de Marine Le Pen », « d’Édouard Philippe » (élision devant voyelle ou h muet). */
export function deNom(nom: string): string {
  return /^[aeiouyàâäéèêëîïôöùûüœæh]/i.test(nom.trim()) ? `d’${nom}` : `de ${nom}`;
}

export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
