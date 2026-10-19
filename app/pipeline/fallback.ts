// Titres courts utilisés uniquement quand data/research/<id>.json est absent ou sans titre.
// Noms usuels des textes, sans qualificatif.
export const FALLBACK_TITLES: Record<string, string> = {
  'ordonnances-travail': 'Ordonnances travail (2017)',
  'isf-ifi': "Remplacement de l'ISF par l'IFI (2017)",
  'asile-immigration-2018': 'Loi asile et immigration (2018)',
  anticasseurs: 'Loi anticasseurs (2019)',
  ceta: 'Ratification du CETA (2019)',
  'neonicotinoides-2020': 'Néonicotinoïdes et betterave (2020)',
  'securite-globale': 'Loi sécurité globale (2020)',
  separatisme: 'Loi « séparatisme » (2021)',
  'climat-resilience': 'Loi Climat et résilience (2021)',
  'pma-pour-toutes': 'Ouverture de la PMA (2021)',
  'pass-vaccinal': 'Pass vaccinal (2022)',
  'pouvoir-achat-2022': "Paquet pouvoir d'achat (2022)",
  'assurance-chomage-2022': 'Assurance chômage (2022)',
  'retraites-64': 'Retraite à 64 ans (2023)',
  'nucleaire-2023': 'Accélération du nucléaire (2023)',
  'anti-squat': 'Loi anti-squat (2023)',
  'lpm-2024-2030': 'Programmation militaire 2024-2030 (2023)',
  'rsa-15h': 'RSA et France Travail (2023)',
  'immigration-2023': 'Loi immigration (2023)',
  'ivg-constitution': 'IVG dans la Constitution (2024)',
  'ukraine-accord': 'Accord de sécurité France-Ukraine (2024)',
  'nouvelle-caledonie-2024': 'Corps électoral de Nouvelle-Calédonie (2024)',
  mercosur: 'Accord UE-Mercosur (2024)',
  'taxe-zucman': 'Taxe Zucman (2025)',
  narcotrafic: 'Loi narcotrafic (2025)',
  'loi-duplomb': 'Loi Duplomb (2025)',
  'retention-210j': 'Rétention jusqu’à 210 jours (2025)',
  'suspension-retraites': 'Suspension de la réforme des retraites (2025)',
  arcelormittal: 'Nationalisation d’ArcelorMittal France (2025)',
  'corse-autonome': 'Autonomie de la Corse (2026)',
  'legitime-defense-policiers': 'Présomption de légitime défense (2026)',
  'aide-a-mourir': 'Aide à mourir (2026)',
  'reseaux-sociaux-15': 'Réseaux sociaux avant 15 ans (2026)',
};

export function fallbackTitle(id: string, question: string, date: string): string {
  return FALLBACK_TITLES[id] ?? `${question.slice(0, 60)}${question.length > 60 ? '…' : ''} (${date.slice(0, 4)})`;
}
