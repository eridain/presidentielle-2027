// Dates de décision partielles (AAAA, AAAA-MM, AAAA-MM-JJ) : lecture, affichage, tri chronologique.
// Familles de condamnations : libellés, ordre de gravité, regroupement de la page d'un candidat, compteurs.
import { describe, expect, it } from 'vitest';
import type { Appartenance, CategorieCondamnation, Condamnation, FamilleCondamnation, Parti, StatutMembre } from '../types';
import { formatDateDecision } from './format';
import {
  APPARTENANCE_LABEL,
  cleMemeDecision,
  compareDateDecision,
  compteursCarte,
  contexteAppartenance,
  ecartee,
  libelleAppartenance,
  niveau,
  passifCarte,
  STATUTS_MEMBRE,
  datesCompatibles,
  FAMILLE_COURT,
  FAMILLE_LABEL,
  FAMILLES,
  formatCompteur,
  isFamille,
  MENTION_PROBITE,
  pageJustice,
  periodeDecision,
  STATUT_LABEL,
} from './justice';

describe('date de décision', () => {
  it('précision et période couverte', () => {
    expect(periodeDecision('1998')).toEqual({ precision: 'annee', debut: '1998-01-01', fin: '1998-12-31' });
    expect(periodeDecision('2015-05')).toEqual({ precision: 'mois', debut: '2015-05-01', fin: '2015-05-31' });
    expect(periodeDecision('2024-02')).toEqual({ precision: 'mois', debut: '2024-02-01', fin: '2024-02-29' });
    expect(periodeDecision('2023-02')?.fin).toBe('2023-02-28');
    expect(periodeDecision('1900-02')?.fin).toBe('1900-02-28');
    expect(periodeDecision('2000-02')?.fin).toBe('2000-02-29');
    expect(periodeDecision('2025-04')?.fin).toBe('2025-04-30');
    expect(periodeDecision('2025-12-16')).toEqual({ precision: 'jour', debut: '2025-12-16', fin: '2025-12-16' });
  });

  it('date calendaire valide uniquement', () => {
    for (const v of ['2024-02-29', '2025-12-31', '2025-01', '2025-12']) expect(periodeDecision(v), v).not.toBeNull();
    for (const v of ['2023-02-29', '2025-04-31', '2025-13', '2025-00', '2025-01-00', '2025-6', '2025-06-1', '98', '2025-', '2025-06-01T00:00', ' 2025', 'mai 2015', '0000', '0000-01-01', '', null, 2025, undefined])
      expect(periodeDecision(v), String(v)).toBeNull();
  });

  it('affichage selon la précision : « en 1998 », « en mai 2015 », « le 16 décembre 2025 »', () => {
    expect(formatDateDecision('1998')).toBe('en 1998');
    expect(formatDateDecision('2015-05')).toBe('en mai 2015');
    expect(formatDateDecision('2015-08')).toBe('en août 2015');
    expect(formatDateDecision('2025-12-16')).toBe('le 16 décembre 2025');
    expect(formatDateDecision('2019-03-01')).toBe('le 1er mars 2019');
    expect(formatDateDecision('2019-03-05')).toBe('le 5 mars 2019');
  });

  it('tri chronologique : dates partielles et précises mêlées, quel que soit l’ordre de départ', () => {
    const attendu = ['1990-05', '1997-12-26', '1998-01-01', '1998', '1998-05-12', '2014-12-31', '2015', '2015-05-01', '2015-05', '2015-05-12', '2016'];
    const melanges = [[...attendu].reverse(), ['2015', '1998-05-12', '2016', '1990-05', '2015-05-12', '1998', '2014-12-31', '2015-05-01', '1997-12-26', '2015-05', '1998-01-01']];
    for (const m of melanges) expect([...m].sort(compareDateDecision)).toEqual(attendu);
    expect(compareDateDecision('2015', '2015')).toBe(0);
    // antisymétrie
    for (const a of attendu) for (const b of attendu) expect(Math.sign(compareDateDecision(a, b)) + Math.sign(compareDateDecision(b, a))).toBe(0);
    // une valeur illisible (impossible après le build) passe avant les autres, sans exception
    expect(['2015', 'inconnue', '1998'].sort(compareDateDecision)).toEqual(['inconnue', '1998', '2015']);
  });

  it('fusion automatique d’une même décision : seulement au jour près', () => {
    const c = { personne: 'Dupont Camille', juridiction: 'tribunal correctionnel de Paris' };
    expect(cleMemeDecision({ ...c, dateDecision: '2015-05-12' })).toBe(cleMemeDecision({ ...c, personne: 'Camille DUPONT', dateDecision: '2015-05-12' }));
    expect(cleMemeDecision({ ...c, dateDecision: '2015-05' })).toBeNull();
    expect(cleMemeDecision({ ...c, dateDecision: '2015' })).toBeNull();
  });

  it('dates compatibles : identiques, ou l’une précise l’autre', () => {
    expect(datesCompatibles('2015', '2015-05-12')).toBe(true);
    expect(datesCompatibles('2015-05-12', '2015-05')).toBe(true);
    expect(datesCompatibles('2015-05', '2015-05')).toBe(true);
    expect(datesCompatibles('2015-05', '2015-06-01')).toBe(false);
    expect(datesCompatibles('201', '2015')).toBe(false);
    expect(datesCompatibles('2015', '2016')).toBe(false);
  });
});

describe('libellés de statut', () => {
  it('épicènes : « présomption d’innocence », jamais « présumé innocent »', () => {
    expect(STATUT_LABEL.appel_en_cours).toBe('Appel en cours — présomption d’innocence');
    expect(STATUT_LABEL.pourvoi_en_cours).toBe('Pourvoi en cassation en cours — présomption d’innocence');
    expect(Object.values(STATUT_LABEL).join(' ')).not.toMatch(/présumée?s? innocente?s?/);
  });
});

// ---------------------------------------------------------------- familles

let rang = 0;
function k(
  partiId: string,
  famille: FamilleCondamnation,
  categorie: CategorieCondamnation,
  dateDecision: string,
  extra: Partial<Condamnation> = {},
): Condamnation {
  rang += 1;
  return {
    id: `${partiId}-${String(rang)}`,
    personne: `Personne ${String(rang)}`,
    categorie,
    candidat: null,
    roleActuel: null,
    infraction: 'infraction',
    faits: null,
    juridiction: 'tribunal correctionnel de Paris',
    dateDecision,
    peine: null,
    statut: 'definitive',
    nature: 'penale',
    famille,
    lieeMandatPolitique: null,
    sources: [{ titre: 'Source', url: `https://www.example.fr/${String(rang)}`, citations: ['Citation.'], date: null }],
    // toujours membre par défaut (niveau 1)
    appartenance: appart('membre'),
    ...extra,
  };
}

function appart(statut: StatutMembre, extra: Partial<Appartenance> = {}): Appartenance {
  return {
    statut,
    depuis: null,
    detail: null,
    lien: null,
    reactionParti: null,
    sources: statut === 'inconnu' ? [] : [{ titre: 'Source', url: 'https://www.example.fr/appartenance', citations: ['Citation.'], date: null }],
    ...extra,
  };
}

function parti(id: string, condamnations: Condamnation[], liste: 'vide' | 'remplie' | 'absente' = 'remplie'): Parti {
  return {
    id,
    nom: `Parti ${id}`,
    sigle: null,
    candidats: [],
    fiche: {
      dateConsultation: '2026-10-18',
      predecesseurs: [],
      fondation: null,
      presentation: null,
      presentationSources: [],
      direction: [],
      effectifs: null,
      condamnations,
      liste,
      personnesVerifiees: null,
      appartenance: 'lue',
      anciens: { liste: 'absente', personnesVerifiees: null, dateConsultation: null },
    },
  };
}

describe('familles de condamnations', () => {
  it('ordre de gravité, libellés de l’interface et mention Probité', () => {
    expect(FAMILLES).toEqual(['probite', 'violences', 'haine', 'diffamation', 'autres']);
    expect(FAMILLES.map((f) => FAMILLE_LABEL[f])).toEqual([
      'Probité\u00a0: argent public, corruption, fraude',
      'Violences contre les personnes',
      'Propos\u00a0: haine, discrimination, négationnisme',
      'Propos\u00a0: diffamation, injure',
      'Autres infractions',
    ]);
    expect(FAMILLES.map((f) => FAMILLE_COURT[f])).toEqual(['Probité', 'Violences', 'Propos haine', 'Diffamation', 'Autres']);
    expect(MENTION_PROBITE).toBe('Atteintes à la probité\u00a0: manquement au devoir d’exemplarité des élus');
    expect(FAMILLES.every(isFamille)).toBe(true);
    for (const v of ['Probite', 'probité', 'fraude', '', null, undefined, 3]) expect(isFamille(v), String(v)).toBe(false);
  });

  // Parti principal « pa », second parti « pb » ; candidat « c1 ».
  const pa = parti('pa', [
    k('pa', 'autres', 'depute', '2024-01-01'),
    k('pa', 'probite', 'depute', '2001-05-05'),
    k('pa', 'probite', 'depute', '2023'),
    k('pa', 'probite', 'parti', '2015-03-03'),
    k('pa', 'probite', 'candidat', '2010-01-01', { candidat: 'c1', personne: 'Candidat Un' }),
    k('pa', 'haine', 'dirigeant', '2019-01-01', { statut: 'inconnu' }),
    k('pa', 'probite', 'ancien_dirigeant', '1999', { statut: 'appel_en_cours' }),
    k('pa', 'diffamation', 'candidat', '2018-06-01', { candidat: 'c1', personne: 'Candidat Un' }),
    // autre candidat du parti : jamais compté sur la page de c1
    k('pa', 'probite', 'candidat', '2012-01-01', { candidat: 'c2', personne: 'Candidat Deux' }),
  ]);
  const pb = parti('pb', [k('pb', 'probite', 'senateur', '2022-02-02', { statut: 'pourvoi_en_cours' }), k('pb', 'violences', 'parti', '2016-01-01')]);
  const page = pageJustice({ partis: [pa, pb] }, { id: 'c1', partis: ['pa', 'pb'] });

  it('regroupement : famille (ordre de gravité), puis catégorie de personne (parti par parti), puis date décroissante', () => {
    expect(page.familles.map((f) => [f.famille, f.total])).toEqual([
      ['probite', 6],
      ['violences', 1],
      ['haine', 1],
      ['diffamation', 1],
      ['autres', 1],
    ]);
    const probite = page.familles[0];
    expect(probite?.sousGroupes.map((s) => [s.cle, s.parti?.id ?? null, s.items.map((c) => c.dateDecision)])).toEqual([
      ['candidat', null, ['2010-01-01']],
      ['parti', 'pa', ['2015-03-03']],
      ['anciens', 'pa', ['1999']],
      ['parlementaires', 'pa', ['2023', '2001-05-05']],
      ['parlementaires', 'pb', ['2022-02-02']],
    ]);
    // sous-groupes vides omis ; la catégorie « parti » d'un second parti vient après celle du premier
    expect(page.familles[1]?.sousGroupes.map((s) => [s.cle, s.parti?.id])).toEqual([['parti', 'pb']]);
    // chaque condamnation affichée une fois et une seule
    const ids = page.familles.flatMap((f) => f.sousGroupes.flatMap((s) => s.items.map((c) => c.id)));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(page.total);
    expect(ids).not.toContain(pa.fiche?.condamnations.find((c) => c.candidat === 'c2')?.id);
  });

  it('synthèse : une ligne par famille, familles à zéro comprises, candidat / parti / autres membres et statuts', () => {
    expect(page.synthese.map((l) => [l.famille, l.candidat, l.parti, l.membres, l.total])).toEqual([
      ['probite', 1, 1, 4, 6],
      ['violences', 0, 1, 0, 1],
      ['haine', 0, 0, 1, 1],
      ['diffamation', 1, 0, 0, 1],
      ['autres', 0, 0, 1, 1],
    ]);
    expect(page.synthese[0]?.parStatut).toEqual({ definitive: 4, appel_en_cours: 1, pourvoi_en_cours: 1, inconnu: 0 });
    expect(page.synthese.reduce((n, l) => n + l.total, 0)).toBe(page.total);
    // aucune condamnation : cinq lignes à zéro
    const vide = pageJustice({ partis: [parti('pv', [], 'vide')] }, { id: 'c1', partis: ['pv'] });
    expect(vide.synthese.map((l) => l.total)).toEqual([0, 0, 0, 0, 0]);
    expect(vide.familles.every((f) => f.sousGroupes.length === 0)).toBe(true);
  });

  it('compteurs des cartes : familles non nulles dans l’ordre de gravité ; « Probité uniquement », même à zéro', () => {
    expect(compteursCarte(page.synthese).map(formatCompteur)).toEqual([
      'Probité\u00a0: 6 (dont candidat\u00a0: 1)',
      'Violences\u00a0: 1',
      'Propos haine\u00a0: 1',
      'Diffamation\u00a0: 1 (dont candidat\u00a0: 1)',
      'Autres\u00a0: 1',
    ]);
    expect(compteursCarte(page.synthese, true).map(formatCompteur)).toEqual(['Probité\u00a0: 6 (dont candidat\u00a0: 1)']);
    const sansProbite = pageJustice({ partis: [parti('px', [k('px', 'haine', 'depute', '2020')])] }, { id: 'c1', partis: ['px'] });
    expect(compteursCarte(sansProbite.synthese).map(formatCompteur)).toEqual(['Propos haine\u00a0: 1']);
    expect(compteursCarte(sansProbite.synthese, true).map(formatCompteur)).toEqual(['Probité\u00a0: 0']);
  });
});

describe('membre cité par les deux fiches d’un candidat', () => {
  const commun = (partiId: string, dateDecision: string, url: string) =>
    k(partiId, 'probite', 'senateur', dateDecision, {
      personne: 'Membre Commun',
      sources: [{ titre: 'Source', url, citations: [`Citation ${partiId}.`], date: null }],
    });

  it('même décision au jour près : présentée et comptée une fois, dans la fiche du premier parti, sources réunies', () => {
    const page = pageJustice(
      { partis: [parti('pa', [commun('pa', '2020-03-04', 'https://a.example.fr')]), parti('pb', [commun('pb', '2020-03-04', 'https://b.example.fr')])] },
      { id: 'c1', partis: ['pa', 'pb'] },
    );
    expect(page.total).toBe(1);
    expect(page.synthese[0]).toMatchObject({ famille: 'probite', total: 1, membres: 1 });
    const [sg] = page.familles[0]?.sousGroupes ?? [];
    expect(sg?.parti?.id).toBe('pa');
    expect(sg?.items[0]?.sources.map((x) => x.url)).toEqual(['https://a.example.fr', 'https://b.example.fr']);
    expect(page.partis.map((b) => b.total)).toEqual([1, 0]);
    expect(compteursCarte(page.synthese).map(formatCompteur)).toEqual(['Probité\u00a0: 1']);
  });

  it('date partielle : jamais fusionnée (deux décisions possibles)', () => {
    const page = pageJustice(
      { partis: [parti('pa', [commun('pa', '2020', 'https://a.example.fr')]), parti('pb', [commun('pb', '2020', 'https://b.example.fr')])] },
      { id: 'c1', partis: ['pa', 'pb'] },
    );
    expect(page.total).toBe(2);
  });

  it('message de page vide : une fiche non publiée → en cours ; toutes vides → trouvée ; sinon retenue', () => {
    const absente: Parti = { ...parti('px', []), fiche: null };
    const vide = parti('pv', [], 'vide');
    const rejetees = parti('pr', [], 'remplie');
    const etat = (partis: Parti[]) => pageJustice({ partis }, { id: 'c1', partis: partis.map((p) => p.id) }).pageVide;
    expect(etat([absente, vide])).toBe('en-cours');
    expect(etat([vide, absente])).toBe('en-cours');
    expect(etat([vide])).toBe('aucune-trouvee');
    expect(etat([vide, rejetees])).toBe('aucune-retenue');
    expect(etat([])).toBe('en-cours');
  });
});

// ---------------------------------------------------------------- appartenance actuelle (round 7)

describe('appartenance actuelle : niveaux', () => {
  it('niveau 1 : membre, suspendu, parti (personne morale) ; niveau 2 : exclu, départ, retiré, décédé, inconnu', () => {
    const niv = (statut: StatutMembre, extra: Partial<Condamnation> = {}) => niveau(k('pa', 'probite', 'depute', '2020', { appartenance: appart(statut), ...extra }));
    expect(STATUTS_MEMBRE.map((st) => [st, niv(st)])).toEqual([
      ['membre', 1],
      ['suspendu', 1],
      ['personne_morale', 1],
      ['exclu', 2],
      ['depart', 2],
      ['retire', 2],
      ['decede', 2],
      ['inconnu', 2],
    ]);
    // le candidat lui-même : toujours niveau 1, quel que soit son statut
    for (const st of STATUTS_MEMBRE) expect(niv(st, { categorie: 'candidat', candidat: 'c1' }), st).toBe(1);
    // recherche « anciens membres » : toujours niveau 2, même « suspendu » ou « membre »
    for (const st of STATUTS_MEMBRE) expect(niv(st, { categorie: 'ancien_membre' }), st).toBe(2);
  });

  it('badges épicènes, « Suspension depuis … », « Retrait — adhésion non confirmée »', () => {
    expect(STATUTS_MEMBRE.map((st) => APPARTENANCE_LABEL[st])).toEqual([
      'Membre',
      'Suspension',
      'Parti',
      'Exclusion du parti',
      'Départ du parti',
      'Retrait — adhésion non confirmée',
      'Décès',
      'Statut inconnu',
    ]);
    expect(libelleAppartenance({ statut: 'suspendu', depuis: '2026-09-25' })).toBe('Suspension depuis le 25 septembre 2026');
    expect(libelleAppartenance({ statut: 'suspendu', depuis: '2026-01' })).toBe('Suspension depuis janvier 2026');
    expect(libelleAppartenance({ statut: 'suspendu', depuis: null })).toBe('Suspension');
    expect(libelleAppartenance({ statut: 'exclu', depuis: '2015-08-20' })).toBe('Exclusion du parti');
    // aucun libellé genré (« exclu », « décédé », « retiré », « suspendu »)
    expect(Object.values(APPARTENANCE_LABEL).join(' ')).not.toMatch(/\b(exclue?|décédée?|retirée?|suspendue?)\b/i);
  });

  it('ligne de contexte : année, lien avec l’affaire, épicène', () => {
    expect(contexteAppartenance({ statut: 'exclu', depuis: '2015-08-20', lien: 'oui' })).toBe('Exclusion du parti en 2015 — en lien avec l’affaire');
    expect(contexteAppartenance({ statut: 'exclu', depuis: '2012-05-29', lien: 'non' })).toBe('Exclusion du parti en 2012 — pour un autre motif');
    expect(contexteAppartenance({ statut: 'depart', depuis: '2019', lien: null })).toBe('A quitté le parti en 2019');
    expect(contexteAppartenance({ statut: 'depart', depuis: null, lien: 'inconnu' })).toBe('A quitté le parti');
    expect(contexteAppartenance({ statut: 'decede', depuis: '2025-01-07', lien: 'oui' })).toBe('Décès en 2025');
    expect(contexteAppartenance({ statut: 'retire', depuis: '2016-11', lien: null })).toBe('Retrait de la vie politique en 2016, adhésion au parti non confirmée');
    expect(contexteAppartenance({ statut: 'inconnu', depuis: null, lien: null })).toBe('Appartenance actuelle au parti non établie par la recherche');
    expect(contexteAppartenance({ statut: 'suspendu', depuis: '2023-11-18', lien: 'oui' })).toBe('Suspension du parti depuis le 18 novembre 2023 — en lien avec l’affaire');
  });

  it('mise en valeur positive : exclusion en lien avec l’affaire seulement', () => {
    expect(ecartee({ statut: 'exclu', lien: 'oui' })).toBe(true);
    for (const [statut, lien] of [['exclu', 'non'], ['exclu', null], ['depart', 'oui'], ['decede', 'oui'], ['suspendu', 'oui']] as const)
      expect(ecartee({ statut, lien }), `${statut}/${String(lien)}`).toBe(false);
  });

  // Parti « pa » : candidat (statut inconnu : compté quand même), parti, membre, suspendu ; anciens : exclu (affaire),
  // deux décisions d'une personne partie, décédé, retiré, statut inconnu, et une entrée de la recherche anciens/.
  const pa = parti('pa', [
    k('pa', 'probite', 'candidat', '2010-01-01', { candidat: 'c1', personne: 'Candidat Un', appartenance: appart('inconnu') }),
    k('pa', 'probite', 'parti', '2015-03-03', { appartenance: appart('personne_morale') }),
    k('pa', 'probite', 'depute', '2020-01-01', { personne: 'Membre Actuel' }),
    k('pa', 'autres', 'senateur', '2021-01-01', { personne: 'Membre Suspendu', appartenance: appart('suspendu', { depuis: '2026-09-25' }) }),
    k('pa', 'haine', 'ancien_dirigeant', '1990', { personne: 'Fondateur Exclu', appartenance: appart('exclu', { depuis: '2015', lien: 'oui', reactionParti: 'Le bureau l’a exclu.' }) }),
    k('pa', 'haine', 'ancien_dirigeant', '2016-01-01', { personne: 'Fondateur Exclu', appartenance: appart('exclu', { depuis: '2015', lien: 'oui' }) }),
    k('pa', 'probite', 'depute', '2018-05-05', { personne: 'Député Parti', appartenance: appart('depart', { depuis: '2019' }) }),
    k('pa', 'probite', 'depute', '2022-05-05', { personne: 'Député Parti', appartenance: appart('depart', { depuis: '2019' }) }),
    k('pa', 'probite', 'ancien_dirigeant', '2000', { personne: 'Ancien Décédé', appartenance: appart('decede', { depuis: '2024' }) }),
    k('pa', 'probite', 'ancien_dirigeant', '2012', { personne: 'Ancien Retiré', appartenance: appart('retire', { depuis: '2017' }) }),
    k('pa', 'diffamation', 'eurodepute', '2019', { personne: 'Statut Inconnu', appartenance: appart('inconnu') }),
    k('pa', 'violences', 'ancien_membre', '2023-01-01', { personne: 'Ancien Sénateur', appartenance: appart('suspendu', { depuis: '2023' }) }),
  ]);
  const page = pageJustice({ partis: [pa] }, { id: 'c1', partis: ['pa'] });

  it('compteurs principaux : niveau 1 seul (candidat, parti, membres actuels, suspendus compris)', () => {
    expect(page.total).toBe(4);
    expect(page.synthese.map((l) => [l.famille, l.candidat, l.parti, l.membres, l.total, l.passif])).toEqual([
      ['probite', 1, 1, 1, 3, 4],
      ['violences', 0, 0, 0, 0, 1],
      ['haine', 0, 0, 0, 0, 2],
      ['diffamation', 0, 0, 0, 0, 1],
      ['autres', 0, 0, 1, 1, 0],
    ]);
    expect(page.compteurs).toEqual({ definitive: 4, appel_en_cours: 0, pourvoi_en_cours: 0, inconnu: 0 });
    expect(page.partis[0]?.total).toBe(3);
    expect(page.partis[0]?.passif).toHaveLength(8);
    const n1 = page.familles.flatMap((f) => f.sousGroupes.flatMap((g) => g.items.map((c) => c.appartenance.statut)));
    expect(n1.sort()).toEqual(['inconnu', 'membre', 'personne_morale', 'suspendu']);
  });

  it('passif : à part, par famille puis par personne (une ligne de contexte chacune), date décroissante', () => {
    expect(page.passif.total).toBe(8);
    expect(page.passif.familles.map((f) => [f.famille, f.total])).toEqual([
      ['probite', 4],
      ['violences', 1],
      ['haine', 2],
      ['diffamation', 1],
      ['autres', 0],
    ]);
    const probite = page.passif.familles[0]?.personnes ?? [];
    // personne dont la décision est la plus récente d'abord ; ses décisions, plus récente d'abord
    expect(probite.map((p) => [p.personne, p.items.map((c) => c.dateDecision)])).toEqual([
      ['Député Parti', ['2022-05-05', '2018-05-05']],
      ['Ancien Retiré', ['2012']],
      ['Ancien Décédé', ['2000']],
    ]);
    // deux décisions d'une même personne : un seul bloc, l'appartenance de la plus récente ; aucune réaction perdue
    const haine = page.passif.familles[2]?.personnes ?? [];
    expect(haine).toHaveLength(1);
    expect(haine[0]?.appartenance.reactionParti).toBe(null);
    expect(haine[0]?.reactions).toEqual(['Le bureau l’a exclu.']);
    expect(haine[0]?.items).toHaveLength(2);
    expect(page.passif.familles[1]?.personnes[0]?.personne).toBe('Ancien Sénateur');
    // chaque condamnation une fois et une seule, dans l'un des deux niveaux
    const ids = [
      ...page.familles.flatMap((f) => f.sousGroupes.flatMap((g) => g.items.map((c) => c.id))),
      ...page.passif.familles.flatMap((f) => f.personnes.flatMap((p) => p.items.map((c) => c.id))),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(12);
  });

  it('cartes : niveau 1 seulement, « (+N anciens) » à part ; « Probité uniquement » : Probité des deux niveaux', () => {
    expect(compteursCarte(page.synthese).map(formatCompteur)).toEqual(['Probité\u00a0: 3 (dont candidat\u00a0: 1)', 'Autres\u00a0: 1']);
    expect(passifCarte(page.synthese)).toBe(8);
    expect(compteursCarte(page.synthese, true).map(formatCompteur)).toEqual(['Probité\u00a0: 3 (dont candidat\u00a0: 1)']);
    expect(passifCarte(page.synthese, true)).toBe(4);
  });

  it('même décision, membre actuel d’un parti et ancien membre de l’autre : présentée une fois, au niveau 1', () => {
    const commun = (partiId: string, statut: StatutMembre, url: string) =>
      k(partiId, 'probite', 'senateur', '2020-03-04', {
        personne: 'Membre Commun',
        appartenance: appart(statut),
        sources: [{ titre: 'Source', url, citations: [`Citation ${partiId}.`], date: null }],
      });
    const p = pageJustice(
      { partis: [parti('pa', [commun('pa', 'depart', 'https://a.example.fr')]), parti('pb', [commun('pb', 'membre', 'https://b.example.fr')])] },
      { id: 'c1', partis: ['pa', 'pb'] },
    );
    expect([p.total, p.passif.total]).toEqual([1, 0]);
    expect(p.partis.map((b) => [b.total, b.passif.length])).toEqual([
      [0, 0],
      [1, 0],
    ]);
    const item = p.familles[0]?.sousGroupes[0]?.items[0];
    expect(item?.appartenance.statut).toBe('membre');
    expect(item?.sources.map((x) => x.url)).toEqual(['https://b.example.fr', 'https://a.example.fr']);
  });
});
