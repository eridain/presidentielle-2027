import { describe, expect, it } from 'vitest';
import {
  cleanOrateur,
  expandInitials,
  parseAttributions,
  resolveAttribution,
  sameName,
  thirdPartyFromResearch,
  type AttributionContext,
} from './attribution';
import type { ResearchCandidate } from './research';

const rc = (fields: Partial<ResearchCandidate>): ResearchCandidate => ({
  position: 'pour',
  type: 'vote_an',
  detail: null,
  argument: 'Un argument.',
  citation: null,
  url: 'https://www.assemblee-nationale.fr/dyn/16/comptes-rendus/seance/x',
  date: '2023-06-07',
  ...fields,
});

describe('orateur relevé dans le compte rendu', () => {
  it('civilité retirée, dernier nom cité retenu', () => {
    expect(cleanOrateur('M. Laurent Jacobelli')).toBe('Laurent Jacobelli');
    expect(cleanOrateur('Mme Rousseau ! Mme Sandrine Rousseau')).toBe('Sandrine Rousseau');
    expect(cleanOrateur("M. Loïc Prud'homme")).toBe("Loïc Prud'homme");
    expect(cleanOrateur(null)).toBeNull();
    expect(cleanOrateur('M. ')).toBeNull();
  });

  it('même personne que le candidat : nom de famille complet', () => {
    expect(sameName('Marine Le Pen', 'Marine Le Pen')).toBe(true);
    expect(sameName('Mme Marine Le Pen', 'Marine Le Pen')).toBe(true);
    expect(sameName('J.-L. Mélenchon', 'Jean-Luc Mélenchon')).toBe(true);
    expect(sameName('Laurent Jacobelli', 'Marine Le Pen')).toBe(false);
    expect(sameName('Sandrine Rousseau', 'Delphine Batho')).toBe(false);
  });

  it('initiales développées d’après les auteurs d’arguments de la même recherche', () => {
    const auteurs = ['Marietta Karamanli (Socialistes)', 'Richard Ferrand (LaREM), rapporteur', 'Jean-Luc Mélenchon (La France insoumise)'];
    expect(expandInitials('M. Karamanli', auteurs)).toBe('Marietta Karamanli');
    expect(expandInitials('R. Ferrand', auteurs)).toBe('Richard Ferrand');
    expect(expandInitials('J.-L. Mélenchon', auteurs)).toBe('Jean-Luc Mélenchon');
    expect(expandInitials('X. Inconnu', auteurs)).toBe('X. Inconnu');
    expect(expandInitials('Sandrine Rousseau', auteurs)).toBe('Sandrine Rousseau');
  });
});

describe('la recherche indique un argument de groupe ou du Gouvernement', () => {
  const tiers = (detail: string | null, argument: string | null = 'Un argument.', citation: string | null = null) =>
    thirdPartyFromResearch({ detail, argument, citation });

  it('champ detail : « argument = explication de vote du groupe X (Nom) » et variantes', () => {
    expect(tiers("Vote nominatif ; aucune explication personnelle trouvée : argument = explication de vote du groupe GDR (Stéphane Peu).")).toEqual({
      porteur: 'groupe',
      orateur: 'Stéphane Peu',
      groupe: 'GDR',
    });
    expect(tiers('argument = intervention du groupe Écologiste et social en discussion générale (Sandrine Rousseau).')).toEqual({
      porteur: 'groupe',
      orateur: 'Sandrine Rousseau',
      groupe: 'Écologiste et social',
    });
    expect(tiers("argument = explication de vote de son groupe d'alors, LFI-NUPES (Danielle Simonnet).")?.groupe).toBe('LFI-NUPES');
    expect(tiers('argument = explication de vote du groupe LR qu’il présidait (Philippe Mouiller).')).toMatchObject({ orateur: 'Philippe Mouiller', groupe: 'LR' });
    expect(tiers('argument = explication de vote du groupe (Aurélien Taché).')).toEqual({ porteur: 'groupe', orateur: 'Aurélien Taché', groupe: null });
    expect(tiers('argument = explication de vote du groupe La France insoumise (J.-L. Mélenchon).')?.orateur).toBe('J.-L. Mélenchon');
    expect(tiers("l'argument retenu est l'explication de vote de son groupe Écologiste-NUPES, portée par Cyrielle Chatelain.")).toEqual({
      porteur: 'groupe',
      orateur: 'Cyrielle Chatelain',
      groupe: 'Écologiste-NUPES',
    });
    expect(tiers('argument = position du groupe EPR exprimée par Pierre Cazeneuve le 22 janvier 2026.')).toEqual({
      porteur: 'groupe',
      orateur: 'Pierre Cazeneuve',
      groupe: 'EPR',
    });
    expect(tiers("président du groupe EPR, dont l'explication de vote a été portée par Pierre Cazeneuve. Pas de citation.")?.orateur).toBe('Pierre Cazeneuve');
    expect(tiers('aucune déclaration personnelle retrouvée, argument = explication de vote du groupe EcoS.')).toEqual({
      porteur: 'groupe',
      orateur: null,
      groupe: 'EcoS',
    });
  });

  it('argument présenté comme celui d’un groupe nommé', () => {
    expect(tiers(null, '(Groupe RN) Vote pour, « sans enthousiasme ».')).toEqual({ porteur: 'groupe', orateur: null, groupe: 'RN' });
    expect(tiers(null, 'Groupe Écologiste et Social (Sandra Regol) : les Corses votent depuis dix ans.')).toEqual({
      porteur: 'groupe',
      orateur: 'Sandra Regol',
      groupe: 'Écologiste et Social',
    });
    expect(tiers(null, 'Le groupe FI y voit une question d’égalité.')).toMatchObject({ porteur: 'groupe', groupe: 'FI' });
    expect(tiers(null, 'Explication de vote SOC (Sacha Houlié) : risques constitutionnels.')).toMatchObject({ porteur: 'groupe', orateur: 'Sacha Houlié' });
    expect(tiers(null, 'Position du groupe Horizons (Loïc Kervran) : soutien au gouvernement.')?.orateur).toBe('Loïc Kervran');
  });

  it('pas de faux positif : propos personnels ou simple mention du groupe', () => {
    // le candidat, président de groupe, parle lui-même au nom du groupe
    expect(tiers("Vote nominatif abstention ; il s'est exprimé en séance comme président du groupe EPR.", 'Le groupe a défendu la réforme.')).toBeNull();
    expect(tiers(null, 'Le groupe a défendu la réforme mais ne veut pas bloquer le compromis.')).toBeNull();
    expect(tiers("Vote nominatif contre ; argument tiré de son tweet.", 'Il dénonce une restriction.')).toBeNull();
    expect(tiers('Le groupe LFI a voté pour (61 pour, 2 contre).', 'Il salue le texte.')).toBeNull();
    expect(tiers(null, 'Le gouvernement aurait méprisé les Kanaks ; il faut retirer le texte.')).toBeNull();
  });

  it('position du Gouvernement sans citation personnelle', () => {
    expect(tiers('Ministre ; aucune déclaration personnelle trouvée.', 'Position du gouvernement : le texte répond aux propriétaires.')).toEqual({
      porteur: 'gouvernement',
      orateur: null,
      groupe: null,
    });
    expect(tiers(null, 'Pour le gouvernement, l’ISF est inefficace.')?.porteur).toBe('gouvernement');
    // une citation personnelle est jointe : ce ne sont pas seulement les mots du Gouvernement
    expect(tiers(null, 'Position du Gouvernement : il faut agir.', 'Nous agirons.')).toBeNull();
  });
});

describe('resolveAttribution', () => {
  const ctx = (fields: Partial<AttributionContext>): AttributionContext => ({
    nom: 'Marine Le Pen',
    research: null,
    groupe: 'RN',
    check: null,
    auteurs: [],
    ...fields,
  });
  const lpm = rc({
    detail: 'Pas d’intervention personnelle retrouvée : argument = explication de vote de son groupe RN (Laurent Jacobelli).',
    argument: '(Groupe RN) Vote pour, « sans enthousiasme ».',
    citation: 'nous voterons pour cette LPM.',
  });

  it('ni argument ni citation : pas d’attribution', () => {
    expect(resolveAttribution(ctx({ research: rc({ argument: null }) })).attribution).toBeNull();
    expect(resolveAttribution(ctx({ research: null })).attribution).toBeNull();
  });

  it('compte rendu : orateur ≠ candidat → propos de son groupe, auteur nommé, groupe du vote', () => {
    const r = resolveAttribution(ctx({ research: lpm, check: { trouve: true, orateur: 'M. Laurent Jacobelli', estLeCandidat: false } }));
    expect(r.attribution).toEqual({ duCandidat: false, porteur: 'groupe', orateur: 'Laurent Jacobelli', groupe: 'RN', verification: 'compte-rendu' });
    expect(r.problemes).toEqual([]);
  });

  it('compte rendu : orateur = candidat → ses propos, même si l’argument parle du groupe (signalé si la recherche dit le contraire)', () => {
    const r = resolveAttribution(ctx({ research: lpm, check: { trouve: true, orateur: 'Mme Marine Le Pen', estLeCandidat: true } }));
    expect(r.attribution).toMatchObject({ duCandidat: true, porteur: null, verification: 'compte-rendu' });
    expect(r.problemes.map((p) => p.code)).toEqual(['attribution-divergente']);
  });

  it('compte rendu et recherche désignent deux orateurs différents : le compte rendu fait foi, écart signalé', () => {
    const r = resolveAttribution(ctx({ research: lpm, check: { trouve: true, orateur: 'M. Thomas Ménagé', estLeCandidat: false } }));
    expect(r.attribution?.orateur).toBe('Thomas Ménagé');
    expect(r.problemes.map((p) => p.code)).toEqual(['attribution-divergente']);
  });

  it('sans vérification (fichier absent, source hors séance) : indication de la recherche', () => {
    expect(resolveAttribution(ctx({ research: lpm })).attribution).toEqual({
      duCandidat: false,
      porteur: 'groupe',
      orateur: 'Laurent Jacobelli',
      groupe: 'RN',
      verification: 'recherche',
    });
    // groupe du vote prioritaire, groupe cité par la recherche sinon
    expect(resolveAttribution(ctx({ research: lpm, groupe: null })).attribution?.groupe).toBe('RN');
  });

  it('citation non retrouvée dans le compte rendu : repli sur la recherche, signalé', () => {
    const r = resolveAttribution(ctx({ research: lpm, check: { trouve: false, orateur: null, estLeCandidat: null } }));
    expect(r.attribution).toMatchObject({ duCandidat: false, verification: 'recherche' });
    expect(r.problemes.map((p) => p.code)).toEqual(['citation-non-retrouvee']);
  });

  it('aucune indication : attribution inconnue (affichage d’origine)', () => {
    expect(resolveAttribution(ctx({ research: rc({ detail: 'Déclaration sur France Inter.', citation: 'Mes mots.' }) })).attribution).toEqual({
      duCandidat: null,
      porteur: null,
      orateur: null,
      groupe: null,
      verification: null,
    });
  });

  it('la recherche nomme le candidat lui-même comme orateur du groupe : ses propos', () => {
    const r = rc({ detail: 'argument = explication de vote du groupe RN (Marine Le Pen).' });
    expect(resolveAttribution(ctx({ research: r })).attribution).toMatchObject({ duCandidat: true, porteur: null });
  });

  it('position du Gouvernement : pas de groupe', () => {
    const r = rc({ type: 'gouvernement', argument: 'Position du Gouvernement : le texte traduit la Convention citoyenne.' });
    expect(resolveAttribution(ctx({ nom: 'Gabriel Attal', research: r, groupe: null })).attribution).toEqual({
      duCandidat: false,
      porteur: 'gouvernement',
      orateur: null,
      groupe: null,
      verification: 'recherche',
    });
  });
});

describe('lecture de attributions.json', () => {
  it('absent, illisible, entrées invalides', () => {
    expect(parseAttributions(null)).toMatchObject({ present: false, issues: [] });
    const bad = parseAttributions('{"lpm/lepen": ');
    expect(bad.present).toBe(false);
    expect(bad.issues.map((i) => i.code)).toEqual(['attributions-invalides']);
    const mixed = parseAttributions(
      JSON.stringify({
        'lpm-2024-2030/lepen': { trouve: true, orateur: 'M. Laurent Jacobelli', estLeCandidat: false },
        'cle invalide': { trouve: true, orateur: null, estLeCandidat: null },
        'q/x': { trouve: 'oui' },
      }),
    );
    expect(mixed.present).toBe(true);
    expect([...mixed.checks.keys()]).toEqual(['lpm-2024-2030/lepen']);
    expect(mixed.issues).toHaveLength(2);
  });
});
