// Typographie française : espaces insécables à l'intérieur des guillemets « … » et avant
// les ponctuations hautes ( : ; ! ? ), pour qu'un guillemet ou un signe ne passe jamais seul à la ligne.

export const NBSP = '\u00a0';

/** Espace sécable (espace, tabulation, saut de ligne), hors espaces insécables. */
const BREAKABLE = '[ \\t\\r\\n]';

/** Repère un espace sécable collé à un guillemet français ou devant une ponctuation haute. */
export const BREAKABLE_TYPO = new RegExp(`«${BREAKABLE}|${BREAKABLE}[»:;!?]`);

/**
 * Remplace les espaces sécables autour des guillemets français et devant : ; ! ? par une espace
 * insécable, et ajoute l'espace manquante à l'intérieur des guillemets (« mot » plutôt que «mot»).
 */
export function frenchSpacing(text: string): string {
  return text
    .replace(/«[ \t\r\n\u00a0\u202f]*/g, `«${NBSP}`)
    .replace(/[ \t\r\n\u00a0\u202f]*»/g, `${NBSP}»`)
    .replace(/[ \t\r\n]+([:;!?])/g, `${NBSP}$1`);
}

/** Applique frenchSpacing à toutes les chaînes d'une structure JSON (objets, tableaux). */
export function deepFrenchSpacing<T>(value: T): T {
  if (typeof value === 'string') return frenchSpacing(value) as T;
  if (Array.isArray(value)) return value.map((v: unknown) => deepFrenchSpacing(v)) as T;
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepFrenchSpacing(v)])) as T;
  return value;
}
