// Informations éditoriales du site public (https://eridain.github.io/presidentielle-2027/). Un champ à null ou vide
// n'est pas affiché ; si aucun champ n'est renseigné, la page Mentions indique « Site à usage personnel. ». Ne rien
// inventer : ni téléphone, ni identité civile de l'éditeur au-delà de ce qu'il a choisi de publier.
export const SITE = {
  nom: 'Vote réel',
  /** Nom de la personne ou de l'organisation éditrice (null = non affiché). */
  editeur: 'eridain' as string | null,
  /** Adresse de contact : courriel ou URL (null = non affichée). */
  contact: 'aerdannq@gmail.com' as string | null,
  /**
   * Hébergeur : nom, adresse (null = non affiché). Adresse publiée par GitHub dans sa déclaration de confidentialité
   * (docs.github.com, « GitHub General Privacy Statement »).
   */
  hebergeur: 'GitHub Pages — GitHub, Inc., 88 Colin P. Kelly Jr. St., San Francisco, CA 94107, États-Unis' as string | null,
  /**
   * Demandes de rectification de la section « Partis & candidats » : courriel ou URL d'un formulaire
   * (null ou vide = aucune ligne « Demande de rectification » sous l'avertissement des condamnations).
   */
  contactRectification: 'aerdannq@gmail.com' as string | null,
};

/** Valeur affichable d'un champ éditorial, ou null s'il n'est pas renseigné (null, undefined, vide). */
export function renseigne(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
