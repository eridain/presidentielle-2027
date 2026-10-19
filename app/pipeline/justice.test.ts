// Partis, biographies et condamnations (data/justice/) : validation stricte des condamnations, fichiers facultatifs.
// Noms et faits fictifs.
import { describe, expect, it } from 'vitest';
import { buildData } from './build';
import {
  ancienne,
  anciensFile,
  candidat,
  condamnation,
  inputs,
  justice,
  justiceFile,
  membre,
  membresDe,
  membresFile,
  source,
} from './fixtures';
import { famillesEvoquees, isIsoDate, memePersonne, mentionPartielle } from './justice';
import { appDataSchema } from './schemas';

// alpha : parti « pa » ; beta : parti « pb » (principal) et « pa » (rattachement secondaire).
const CANDS = [
  candidat('alpha', ['A'], 'PA1', { partis: [{ id: 'pa', nom: 'Parti A' }] }),
  candidat('beta', ['B'], 'PA2', {
    partis: [
      { id: 'pb', nom: 'Parti B' },
      { id: 'pa', nom: 'Parti A', rattachement: 'Prénom Beta est membre du Parti A.' },
    ],
  }),
];

/** Build ; par défaut, chaque personne condamnée est « membre » de son parti (membres/ généré, niveau 1). */
function build(
  files: Record<string, unknown>,
  modifieLe?: string | null,
  annexes: { membres?: Record<string, unknown>; anciens?: Record<string, unknown> } = {},
) {
  return buildData({
    ...inputs([{ id: 'q1' }], CANDS),
    justice: justice(files, modifieLe),
    justiceMembres: justice(annexes.membres ?? membresDe(files)),
    justiceAnciens: justice(annexes.anciens ?? {}),
  });
}
const errorsOf = (r: ReturnType<typeof buildData>) => r.report.issues.filter((i) => i.severity === 'erreur');
const parti = (r: ReturnType<typeof buildData>, id: string) => r.data?.partis.find((p) => p.id === id);
const affichees = (r: ReturnType<typeof buildData>, id: string) => parti(r, id)?.fiche?.condamnations ?? [];

describe('fiche de parti valide', () => {
  const r = build({
    pa: justiceFile('pa', {
      candidats: [{ id: 'alpha', bio: 'Parcours de Prénom Alpha.', sources: [{ titre: 'Bio', url: 'https://www.bio.example.fr/alpha' }] }],
      condamnations: [condamnation(), condamnation({ personne: 'Alpha Prénom', categorie: 'candidat', roleActuel: null, dateDecision: '2019-03-04' })],
    }),
    pb: justiceFile('pb'),
  });

  it('build sans erreur, schéma de sortie respecté, partis dans l’ordre de première mention', () => {
    expect(errorsOf(r)).toEqual([]);
    expect(appDataSchema.safeParse(r.data).success).toBe(true);
    expect(r.data?.partis.map((p) => p.id)).toEqual(['pa', 'pb']);
    expect(parti(r, 'pa')?.candidats).toEqual([
      { id: 'alpha', rattachement: null },
      { id: 'beta', rattachement: 'Prénom Beta est membre du Parti A.' },
    ]);
    expect(r.data?.candidats.find((c) => c.id === 'beta')?.partis).toEqual(['pb', 'pa']);
  });

  it('présentation, direction, effectifs et biographie repris avec leurs sources', () => {
    const fiche = parti(r, 'pa')?.fiche;
    expect(fiche).toMatchObject({
      presentation: 'Parti fondé en 2016.',
      fondation: '2016',
      direction: [{ nom: 'Martin Dominique', fonction: 'président', url: 'https://www.parti.example.fr/direction' }],
      effectifs: {
        deputes: 10,
        senateurs: 2,
        eurodeputes: 0,
        sources: [{ titre: 'assemblee-nationale.fr', url: 'https://www.assemblee-nationale.fr/dyn/deputes' }],
        precision: null,
      },
      personnesVerifiees: 25,
      dateConsultation: '2026-10-18',
    });
    expect(r.data?.candidats.find((c) => c.id === 'alpha')?.bio).toEqual({
      texte: 'Parcours de Prénom Alpha.',
      sources: [{ titre: 'Bio', url: 'https://www.bio.example.fr/alpha' }],
    });
    // méthode, limites et alertes de la recherche : rapport seulement, pas dans les données du site
    expect(JSON.stringify(r.data)).not.toContain('Sénateurs non vérifiés');
    expect(r.report.justice.partis.find((p) => p.id === 'pa')?.limites).toBe('Sénateurs non vérifiés.');
  });

  it('condamnations affichées avec tous leurs champs ; la personne « candidat » est rattachée au candidat', () => {
    const [depute, cand] = affichees(r, 'pa');
    expect(depute).toMatchObject({
      id: 'pa-0',
      personne: 'Dupont Camille',
      categorie: 'depute',
      candidat: null,
      statut: 'definitive',
      nature: 'penale',
      dateDecision: '2021-06-01',
      lieeMandatPolitique: true,
      sources: [{ url: 'https://www.journal.example.fr/article-1', citations: ['Le tribunal a condamné la personne à une amende.'], date: '2021-06-02' }],
    });
    expect(cand).toMatchObject({ id: 'pa-1', categorie: 'candidat', candidat: 'alpha', roleActuel: null });
    expect(r.report.justice.partis.find((p) => p.id === 'pa')).toMatchObject({ fichier: 'lu', affichees: 2, rejetees: 0, parStatut: { definitive: 2 } });
  });

  it('liste vide : fiche lue, aucune condamnation (et non « fiche absente »)', () => {
    expect(parti(r, 'pb')?.fiche?.condamnations).toEqual([]);
    expect(r.report.justice.partis.find((p) => p.id === 'pb')?.fichier).toBe('lu');
  });
});

describe('condamnations rejetées (jamais affichées, listées dans le rapport)', () => {
  const cas: [string, Record<string, unknown>, RegExp][] = [
    ['sans source', { sources: [] }, /aucune source/],
    ['champ sources absent', { sources: undefined }, /aucune source/],
    ['source sans citation', { sources: [source({ citation: '' })] }, /aucune source valide.*citation manquante/],
    ['source sans URL http(s)', { sources: [source({ url: 'ftp://archive.example.fr/x' })] }, /aucune source valide.*URL/],
    ['URL sans domaine', { sources: [source({ url: 'https://localhost/x' })] }, /aucune source valide/],
    ['statut invalide (accent)', { statut: 'définitive' }, /statut « définitive » invalide/],
    ['statut invalide', { statut: 'en_appel' }, /statut « en_appel » invalide/],
    ['statut absent', { statut: undefined }, /statut .* invalide/],
    ['date nulle', { dateDecision: null }, /dateDecision « null » invalide/],
    ['date absente', { dateDecision: undefined }, /dateDecision « absent » invalide/],
    ['date impossible', { dateDecision: '2021-02-30' }, /dateDecision « 2021-02-30 » invalide/],
    ['29 février d’une année non bissextile', { dateDecision: '2023-02-29' }, /dateDecision « 2023-02-29 » invalide/],
    ['mois impossible', { dateDecision: '2021-13' }, /dateDecision « 2021-13 » invalide/],
    ['mois zéro', { dateDecision: '2021-00' }, /dateDecision « 2021-00 » invalide/],
    ['mois sur un chiffre', { dateDecision: '2021-6' }, /dateDecision « 2021-6 » invalide/],
    ['année sur deux chiffres', { dateDecision: '21' }, /dateDecision « 21 » invalide/],
    ['année en nombre', { dateDecision: 2021 }, /dateDecision « 2021 » invalide/],
    ['date au format français', { dateDecision: '01/06/2021' }, /dateDecision .* invalide/],
    ['date future', { dateDecision: '2030-01-01' }, /postérieure à la date de génération/],
    ['année future', { dateDecision: '2027' }, /dateDecision 2027 postérieure à la date de génération/],
    ['mois futur (génération le 17 octobre 2026)', { dateDecision: '2026-11' }, /dateDecision 2026-11 postérieure/],
    ['catégorie invalide', { categorie: 'militant' }, /catégorie « militant » invalide/],
    ['nature invalide', { nature: 'administrative' }, /nature « administrative » invalide/],
    ['personne manquante', { personne: '  ' }, /personne manquante/],
    ['infraction manquante', { infraction: null }, /infraction manquante/],
    ['juridiction manquante', { juridiction: '' }, /juridiction manquante/],
    ['« candidat » qui n’est pas un candidat du parti', { categorie: 'candidat', personne: 'Durand Lou' }, /ne correspond à aucun candidat rattaché/],
  ];
  for (const [nom, extra, motif] of cas) {
    it(nom, () => {
      const r = build({ pa: justiceFile('pa', { condamnations: [condamnation({ dateDecision: '2020-01-01', personne: 'Valide Sacha' }), condamnation(extra)] }) });
      expect(errorsOf(r)).toEqual([]); // non bloquant : le reste du site est construit
      expect(affichees(r, 'pa').map((c) => c.personne)).toEqual(['Valide Sacha']);
      expect(r.report.justice.rejets).toHaveLength(1);
      expect(r.report.justice.rejets[0]?.index).toBe(1);
      expect(r.report.justice.rejets[0]?.motifs.join(' ; ')).toMatch(motif);
      expect(r.report.issues.filter((i) => i.code === 'condamnation-rejetee')).toHaveLength(1);
      expect(r.report.justice.partis.find((p) => p.id === 'pa')).toMatchObject({ affichees: 1, rejetees: 1 });
    });
  }

  it('entrée non objet et doublon (même personne, même date, même juridiction)', () => {
    const r = build({ pa: justiceFile('pa', { condamnations: ['texte libre', condamnation(), condamnation({ infraction: 'autre libellé' })] }) });
    expect(affichees(r, 'pa')).toHaveLength(1);
    expect(r.report.justice.rejets.map((x) => x.motifs.join(' ; '))).toEqual([
      expect.stringMatching(/pas un objet/),
      expect.stringMatching(/doublon de condamnations\[1\]/),
    ]);
  });

  it('une source invalide parmi d’autres est écartée seule ; une date de source invalide est ignorée', () => {
    const r = build({
      pa: justiceFile('pa', {
        condamnations: [condamnation({ sources: [source({ url: 'javascript:alert(1)' }), source({ url: 'https://www.autre.example.fr/a', date: '2 juin 2021', titre: '' })] })],
      }),
    });
    expect(affichees(r, 'pa')[0]?.sources).toEqual([
      { titre: 'autre.example.fr', url: 'https://www.autre.example.fr/a', citations: ['Le tribunal a condamné la personne à une amende.'], date: null },
    ]);
    expect(r.report.issues.filter((i) => i.code === 'justice-source-ecartee')).toHaveLength(2);
    expect(r.report.justice.rejets).toEqual([]);
  });

  it('même page citée deux fois : un seul lien, deux citations', () => {
    const r = build({
      pa: justiceFile('pa', { condamnations: [condamnation({ sources: [source(), source({ citation: 'Second passage.', date: null })] })] }),
    });
    expect(affichees(r, 'pa')[0]?.sources).toEqual([
      expect.objectContaining({ citations: ['Le tribunal a condamné la personne à une amende.', 'Second passage.'], date: '2021-06-02' }),
    ]);
  });

  it('le rapport Markdown liste chaque rejet avec son motif', async () => {
    const { formatReport } = await import('./report');
    const r = build({ pa: justiceFile('pa', { condamnations: [condamnation({ statut: 'en_appel' })] }) });
    const md = formatReport(r.report, r.data);
    expect(md).toContain('### Erreurs : condamnations rejetées (non affichées)');
    expect(md).toMatch(/\[REJET\] pa \/ condamnations\[0\] \(Dupont Camille\) : statut « en_appel » invalide/);
    expect(md).toMatch(/\| pa \| alpha, beta \| lu \| 2026-10-18 \(dernière modification\) \| 0 \| 1 \|/);
  });
});

describe('fichiers manquants, illisibles ou orphelins : le site fonctionne sans', () => {
  it('parti manquant : fiche nulle, avertissement, aucune erreur, autres partis intacts', () => {
    const r = build({ pa: justiceFile('pa', { condamnations: [condamnation()] }) });
    expect(errorsOf(r)).toEqual([]);
    expect(appDataSchema.safeParse(r.data).success).toBe(true);
    expect(parti(r, 'pb')).toEqual({ id: 'pb', nom: 'Parti B', sigle: null, candidats: [{ id: 'beta', rattachement: null }], fiche: null });
    expect(affichees(r, 'pa')).toHaveLength(1);
    expect(r.report.issues).toContainEqual(expect.objectContaining({ code: 'justice-absent', parti: 'pb', severity: 'avertissement' }));
    expect(r.report.justice.partis.find((p) => p.id === 'pb')?.fichier).toBe('absent');
  });

  it('aucun fichier : tous les partis sont « en cours de documentation »', () => {
    const r = buildData(inputs([{ id: 'q1' }], CANDS));
    expect(errorsOf(r)).toEqual([]);
    expect(r.data?.partis.map((p) => [p.id, p.fiche])).toEqual([
      ['pa', null],
      ['pb', null],
    ]);
    expect(r.report.justice.candidatsSansBio).toEqual(['alpha', 'beta']);
  });

  it('JSON illisible ou non objet : fiche ignorée', () => {
    const r = build({ pa: '{ pas du json', pb: '[1, 2]' });
    expect(errorsOf(r)).toEqual([]);
    expect(parti(r, 'pa')?.fiche).toBeNull();
    expect(parti(r, 'pb')?.fiche).toBeNull();
    expect(r.report.justice.partis.map((p) => p.fichier)).toEqual(['illisible', 'illisible']);
  });

  it('fichier sans parti dans candidats.json : ignoré et signalé', () => {
    const r = build({ pz: justiceFile('pz', { condamnations: [condamnation()] }) }, undefined, { membres: {} });
    expect(r.data?.partis.map((p) => p.id)).toEqual(['pa', 'pb']);
    expect(r.report.justice.fichiersOrphelins).toEqual(['pz.json']);
  });

  it('candidat sans champ partis : pas de fiche, simple info', () => {
    const r = buildData({ ...inputs([{ id: 'q1' }]), justice: justice({ pa: justiceFile('pa') }) });
    expect(errorsOf(r)).toEqual([]);
    expect(r.data?.partis).toEqual([]);
    expect(r.data?.candidats[0]?.partis).toEqual([]);
    expect(r.report.issues.filter((i) => i.code === 'candidat-sans-parti')).toHaveLength(2);
  });
});

describe('contrôles des éléments descriptifs (tolérants)', () => {
  it('ids candidats : inconnu ou non rattaché → biographie ignorée ; biographie sans source → non affichée', () => {
    const r = build({
      pa: justiceFile('pa', {
        candidats: [
          { id: 'gamma', bio: 'Inconnu.', sources: [{ titre: 'x', url: 'https://www.x.example.fr' }] },
          { id: 'alpha', bio: 'Sans source.', sources: [] },
        ],
      }),
      pb: justiceFile('pb', { candidats: [{ id: 'alpha', bio: 'Pas son parti.', sources: [{ titre: 'x', url: 'https://www.x.example.fr' }] }] }),
    });
    const codes = r.report.issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['justice-candidat-inconnu', 'justice-sans-source', 'justice-candidat-non-rattache']));
    expect(r.data?.candidats.find((c) => c.id === 'alpha')?.bio).toBeNull();
  });

  it('biographie : celle du parti principal prime', () => {
    const bio = (texte: string) => ({ id: 'beta', bio: texte, sources: [{ titre: 'x', url: 'https://www.x.example.fr' }] });
    const r = build({ pa: justiceFile('pa', { candidats: [bio('Depuis la fiche A.')] }), pb: justiceFile('pb', { candidats: [bio('Depuis la fiche B.')] }) });
    expect(r.data?.candidats.find((c) => c.id === 'beta')?.bio?.texte).toBe('Depuis la fiche B.');
    expect(r.report.issues.map((i) => i.code)).toContain('bio-multiple');
  });

  it('effectifs : sources multiples dans un texte libre, liste des députés par groupe, précision', () => {
    const r = build({
      pa: justiceFile('pa', {
        effectifs: {
          deputes: 3,
          senateurs: 1,
          source:
            'députés : data/research/deputes_par_groupe_2026.json (groupe X) ; sénateurs : https://fr.wikipedia.org/wiki/Parti_(France) (liste), https://www.senat.fr/groupe.html.',
          precision: 'Députés : estimation.',
        },
      }),
    });
    expect(parti(r, 'pa')?.fiche?.effectifs).toEqual({
      deputes: 3,
      senateurs: 1,
      eurodeputes: null,
      sources: [
        { titre: 'fr.wikipedia.org', url: 'https://fr.wikipedia.org/wiki/Parti_(France)' },
        { titre: 'senat.fr', url: 'https://www.senat.fr/groupe.html' },
        { titre: 'Open data de l’Assemblée nationale (députés par groupe)', url: 'https://data.assemblee-nationale.fr' },
      ],
      precision: 'Députés\u00a0: estimation.', // typographie française appliquée
    });
  });

  it('présentation ou effectifs sans source valide : non affichés ; direction sans fonction écartée', () => {
    const r = build({
      pa: justiceFile('pa', {
        presentationSources: [{ titre: 'x', url: 'pas une url' }],
        effectifs: { deputes: 3, source: '' },
        direction: [{ nom: 'Sans Fonction' }, { nom: 'Lee Sam', fonction: 'trésorier', url: 'ftp://x' }],
      }),
    });
    const fiche = parti(r, 'pa')?.fiche;
    expect(fiche?.presentation).toBeNull();
    expect(fiche?.presentationSources).toEqual([]);
    expect(fiche?.effectifs).toBeNull();
    expect(fiche?.direction).toEqual([{ nom: 'Lee Sam', fonction: 'trésorier', url: null }]);
  });

  it('personne morale ou mention partielle d’un candidat : jamais rattachée à sa page, signalée pour relecture', () => {
    const r = build({
      pa: justiceFile('pa', {
        condamnations: [
          condamnation({ categorie: 'parti', personne: 'Parti A (présidé par Prénom Alpha)' }),
          condamnation({ categorie: 'dirigeant', personne: 'Prénom Alpha et Dupont Camille', dateDecision: '2020-01-01' }),
          condamnation({ categorie: 'candidat', personne: 'Prénom Alpha et Dupont Camille', dateDecision: '2019-01-01' }),
        ],
      }),
    });
    expect(affichees(r, 'pa').map((c) => [c.categorie, c.candidat])).toEqual([
      ['parti', null],
      ['dirigeant', null],
    ]);
    expect(r.report.justice.rejets[0]?.motifs.join()).toMatch(/ne correspond à aucun candidat rattaché/);
    expect(r.report.justice.partis.find((p) => p.id === 'pa')?.aRelire.join('\n')).toMatch(/cite Prénom Alpha sans le désigner exactement/);
  });

  it('personne = un candidat du parti, rangée dans une autre catégorie : rattachée au candidat', () => {
    const r = build({ pa: justiceFile('pa', { condamnations: [condamnation({ personne: 'Prénom Beta', categorie: 'dirigeant' })] }) });
    expect(affichees(r, 'pa')[0]).toMatchObject({ categorie: 'dirigeant', candidat: 'beta' });
    expect(r.report.issues.map((i) => i.code)).toContain('justice-categorie-candidat');
  });

  it('vocabulaire de relaxe / mise en examen et citation trop longue : affichées mais signalées pour relecture', () => {
    const longue = Array.from({ length: 45 }, (_, i) => `mot${i}`).join(' ');
    const r = build({
      pa: justiceFile('pa', { condamnations: [condamnation({ peine: 'relaxé en appel', sources: [source({ citation: longue })] })] }),
    });
    expect(affichees(r, 'pa')).toHaveLength(1);
    const aRelire = r.report.justice.partis.find((p) => p.id === 'pa')?.aRelire.join('\n');
    expect(aRelire).toMatch(/relaxé/);
    expect(aRelire).toMatch(/45 mots/);
  });

  it('seule source Wikipédia : affichée, signalée pour relecture', () => {
    const r = build({ pa: justiceFile('pa', { condamnations: [condamnation({ sources: [source({ url: 'https://fr.wikipedia.org/wiki/X' })] })] }) });
    expect(affichees(r, 'pa')).toHaveLength(1);
    expect(r.report.justice.partis.find((p) => p.id === 'pa')?.aRelire.join('\n')).toMatch(/seule source Wikipédia/);
  });

  it('liste des condamnations : vide, remplie ou absente (jamais « aucune trouvée » sans liste)', () => {
    const etat = (condamnations: unknown) =>
      parti(build({ pa: justiceFile('pa', { condamnations }) }), 'pa')?.fiche?.liste;
    expect(etat([])).toBe('vide');
    expect(etat([condamnation({ sources: [] })])).toBe('remplie'); // entrée rejetée : la liste n'était pas vide
    expect(etat(undefined)).toBe('absente');
    expect(etat({ a: 1 })).toBe('absente');
    expect(etat('aucune')).toBe('absente');
  });

  it('décision récente au statut non confirmé : signalée pour relecture (appel possible)', () => {
    const r = build({ pa: justiceFile('pa', { condamnations: [condamnation({ statut: 'inconnu', dateDecision: '2026-04-16' })] }) });
    expect(r.report.justice.partis.find((p) => p.id === 'pa')?.aRelire.join('\n')).toMatch(/décision récente \(2026-04-16\) au statut non confirmé/);
  });

  it('même décision d’un candidat dans ses deux fiches : écart de statut ou libellé de juridiction signalés', () => {
    const cand = (extra: Record<string, unknown>) => condamnation({ personne: 'Prénom Beta', categorie: 'candidat', ...extra });
    const r = build({
      pb: justiceFile('pb', { condamnations: [cand({}), cand({ dateDecision: '2019-01-01' })] }),
      pa: justiceFile('pa', { condamnations: [cand({ statut: 'appel_en_cours' }), cand({ dateDecision: '2019-01-01', juridiction: 'tribunal correctionnel de Paris (16e chambre)' })] }),
    });
    const codes = r.report.issues.filter((i) => i.candidat === 'beta').map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['condamnation-divergente', 'condamnation-quasi-doublon']));
  });

  it('date de consultation : champ du fichier, sinon date de modification, sinon date de génération', () => {
    expect(parti(build({ pa: justiceFile('pa', { dateConsultation: '2026-10-15' }) }), 'pa')?.fiche?.dateConsultation).toBe('2026-10-15');
    expect(parti(build({ pa: justiceFile('pa', { perimetre: { date: '2026-10-14' } }) }), 'pa')?.fiche?.dateConsultation).toBe('2026-10-14');
    expect(parti(build({ pa: justiceFile('pa') }, '2026-10-16'), 'pa')?.fiche?.dateConsultation).toBe('2026-10-16');
    // relevé data/justice-dates.json : prioritaire sur la date de modification
    const releve = buildData({ ...inputs([{ id: 'q1' }], CANDS), justice: { pa: { content: JSON.stringify(justiceFile('pa')), releve: '2026-10-01', modifieLe: '2026-10-16' } } });
    expect(parti(releve, 'pa')?.fiche?.dateConsultation).toBe('2026-10-01');
    expect(releve.report.justice.partis.find((p) => p.id === 'pa')?.origineDate).toBe('releve');
    const r = build({ pa: justiceFile('pa') }, null);
    expect(parti(r, 'pa')?.fiche?.dateConsultation).toBe('2026-10-17');
    expect(r.report.justice.partis.find((p) => p.id === 'pa')?.origineDate).toBe('generation');
  });

  it('partiId différent du nom de fichier : le nom de fichier fait foi', () => {
    const r = build({ pa: justiceFile('autre') });
    expect(parti(r, 'pa')?.fiche).not.toBeNull();
    expect(r.report.issues.map((i) => i.code)).toContain('justice-id');
  });

  it('typographie française appliquée aux textes des fiches', () => {
    const r = build({ pa: justiceFile('pa', { condamnations: [condamnation({ faits: 'Il a déclaré « oui » : fin.' })] }) });
    expect(affichees(r, 'pa')[0]?.faits).toBe('Il a déclaré « oui » : fin.');
  });
});

describe('dates de décision partielles (AAAA, AAAA-MM)', () => {
  const r = build({
    pa: justiceFile('pa', {
      condamnations: [
        condamnation({ personne: 'Annee Sacha', dateDecision: '1998' }),
        condamnation({ personne: 'Mois Sacha', dateDecision: '2015-05' }),
        condamnation({ personne: 'Jour Sacha', dateDecision: '2025-12-16' }),
        condamnation({ personne: 'Bissextile Sacha', dateDecision: '2024-02-29' }),
        // la période a commencé avant la génération (17 octobre 2026) : acceptée
        condamnation({ personne: 'Courant Sacha', dateDecision: '2026-10' }),
        condamnation({ personne: 'Annee Courante Sacha', dateDecision: '2026' }),
      ],
    }),
  });

  it('acceptées et affichées telles quelles, sans erreur ni avertissement', () => {
    expect(r.report.justice.rejets).toEqual([]);
    expect(affichees(r, 'pa').map((c) => c.dateDecision)).toEqual(['1998', '2015-05', '2025-12-16', '2024-02-29', '2026-10', '2026']);
    expect(appDataSchema.safeParse(r.data).success).toBe(true);
    expect(r.report.issues.filter((i) => i.parti === 'pa' && i.severity !== 'info')).toEqual([]);
  });

  it('signalées en info et comptées dans le rapport', async () => {
    const { formatReport } = await import('./report');
    const infos = r.report.issues.filter((i) => i.code === 'justice-date-partielle').map((i) => i.message);
    expect(infos).toHaveLength(4);
    expect(infos[0]).toBe('condamnations[0] (Annee Sacha) : date de décision partielle « 1998 » (ni mois ni jour), affichée « en 1998 ».');
    expect(infos[1]).toBe('condamnations[1] (Mois Sacha) : date de décision partielle « 2015-05 » (sans le jour), affichée « en mai 2015 ».');
    expect(r.report.justice.partis.find((p) => p.id === 'pa')).toMatchObject({ affichees: 6, rejetees: 0, datesPartielles: 4 });
    expect(formatReport(r.report, r.data)).toContain('avec une date de décision partielle (AAAA ou AAAA-MM, affichée « en 1998 », « en mai 2015 ») : 4 (pa 4).');
  });

  it('même personne, date partielle et date précise compatibles : affichées, signalées pour relecture', () => {
    const d = build({
      pa: justiceFile('pa', {
        condamnations: [
          condamnation({ dateDecision: '2015-05-12' }),
          condamnation({ dateDecision: '2015-05', juridiction: 'cour d’appel de Paris' }),
          condamnation({ dateDecision: '2015' }),
          condamnation({ dateDecision: '2016' }), // incompatible : rien à signaler
        ],
      }),
    });
    expect(affichees(d, 'pa')).toHaveLength(4);
    const relire = d.report.justice.partis.find((p) => p.id === 'pa')?.aRelire ?? [];
    expect(relire.filter((x) => x.includes('dates compatibles'))).toEqual([
      'condamnations[0] et condamnations[1] (Dupont Camille) : dates compatibles (« 2015-05-12 » / « 2015-05 ») — vérifier qu\'il ne s\'agit pas de la même décision.',
      'condamnations[0] et condamnations[2] (Dupont Camille) : dates compatibles (« 2015-05-12 » / « 2015 ») — vérifier qu\'il ne s\'agit pas de la même décision.',
      'condamnations[1] et condamnations[2] (Dupont Camille) : dates compatibles (« 2015-05 » / « 2015 ») — vérifier qu\'il ne s\'agit pas de la même décision.',
    ]);
  });

  it('même date partielle, même personne, même juridiction : deux décisions possibles, jamais rejetées comme doublon', () => {
    // deux décisions distinctes du même tribunal la même année auraient la même clé : affichées, signalées
    const d = build({
      pa: justiceFile('pa', { condamnations: [condamnation({ dateDecision: '1998' }), condamnation({ dateDecision: '1998', infraction: 'diffamation' })] }),
    });
    expect(affichees(d, 'pa')).toHaveLength(2);
    expect(d.report.justice.rejets).toEqual([]);
    expect(d.report.justice.partis.find((p) => p.id === 'pa')?.aRelire).toContain(
      'condamnations[0] et condamnations[1] (Dupont Camille) : même date partielle (« 1998 ») — vérifier qu\'il ne s\'agit pas de la même décision.',
    );
    // au jour près : doublon rejeté, comme avant
    const j = build({ pa: justiceFile('pa', { condamnations: [condamnation(), condamnation({ infraction: 'diffamation' })] }) });
    expect(affichees(j, 'pa')).toHaveLength(1);
    expect(j.report.justice.rejets[0]?.motifs.join(' ; ')).toMatch(/doublon de condamnations\[0\]/);
  });

  it('statut non confirmé : une date partielle est « récente » si la décision a pu être rendue dans l’année', () => {
    const relire = (dateDecision: string) =>
      build({ pa: justiceFile('pa', { condamnations: [condamnation({ statut: 'inconnu', dateDecision })] }) }).report.justice.partis[0]?.aRelire.join('\n') ?? '';
    expect(relire('2025')).toMatch(/décision récente \(2025\) au statut non confirmé/); // jusqu'au 31 décembre 2025
    expect(relire('2025-11')).toMatch(/décision récente/);
    expect(relire('2025-09')).not.toMatch(/décision récente/); // au plus tard le 30 septembre 2025
    expect(relire('2024')).not.toMatch(/décision récente/);
  });

  it('candidat à deux fiches, même décision datée plus ou moins précisément : quasi-doublon signalé', () => {
    const cand = (extra: Record<string, unknown>) => condamnation({ personne: 'Prénom Beta', categorie: 'candidat', ...extra });
    const d = build({ pb: justiceFile('pb', { condamnations: [cand({ dateDecision: '2015-05-12' })] }), pa: justiceFile('pa', { condamnations: [cand({ dateDecision: '2015' })] }) });
    const msg = d.report.issues.find((i) => i.code === 'condamnation-quasi-doublon')?.message;
    expect(msg).toBe('pb/pb-0 et pa/pa-0 : dates compatibles (« 2015-05-12 » / « 2015 »), même juridiction : les deux entrées sont affichées sur la page — vérifier s\'il s\'agit de la même décision.');
    // même date partielle, même juridiction, même statut : pas de fusion automatique, donc signalé aussi
    const p = build({ pb: justiceFile('pb', { condamnations: [cand({ dateDecision: '2015' })] }), pa: justiceFile('pa', { condamnations: [cand({ dateDecision: '2015' })] }) });
    expect(p.report.issues.filter((i) => i.code === 'condamnation-quasi-doublon').map((i) => i.message)).toEqual([
      'pb/pb-0 et pa/pa-0 : même date partielle (« 2015 »), même juridiction : les deux entrées sont affichées sur la page — vérifier s\'il s\'agit de la même décision.',
    ]);
    expect(p.report.issues.map((i) => i.code)).not.toContain('condamnation-divergente');
  });
});

describe('familles de condamnations (champ « famille »)', () => {
  const r = build({
    pa: justiceFile('pa', {
      condamnations: [
        condamnation({ personne: 'Probite Sacha' }),
        condamnation({ personne: 'Violences Sacha', infraction: 'violences volontaires en réunion', famille: 'violences' }),
        condamnation({ personne: 'Haine Sacha', infraction: 'injure publique à caractère raciste', famille: 'haine' }),
        condamnation({ personne: 'Diffamation Sacha', infraction: 'diffamation publique envers un élu', famille: 'diffamation' }),
        condamnation({ personne: 'Autres Sacha', infraction: 'conduite en état d’ivresse', famille: 'autres' }),
        condamnation({ personne: 'Absente Sacha', infraction: 'abus de biens sociaux', famille: undefined }),
        condamnation({ personne: 'Nulle Sacha', infraction: 'blessures involontaires', famille: null }),
        condamnation({ personne: 'Invalide Sacha', famille: 'Probité' }),
        condamnation({ personne: 'Inconnue Sacha', famille: 'fraude' }),
      ],
    }),
  });
  const familleDe = (personne: string) => affichees(r, 'pa').find((c) => c.personne === personne)?.famille;

  it('famille valide reprise telle quelle ; schéma de sortie respecté', () => {
    expect(['Probite', 'Violences', 'Haine', 'Diffamation', 'Autres'].map((p) => familleDe(`${p} Sacha`))).toEqual([
      'probite',
      'violences',
      'haine',
      'diffamation',
      'autres',
    ]);
    expect(appDataSchema.safeParse(r.data).success).toBe(true);
    expect(errorsOf(r)).toEqual([]);
  });

  it('absente ou invalide : condamnation affichée (jamais rejetée), classée « autres », avertissement dans le rapport', () => {
    expect(r.report.justice.rejets).toEqual([]);
    expect(['Absente', 'Nulle', 'Invalide', 'Inconnue'].map((p) => familleDe(`${p} Sacha`))).toEqual(['autres', 'autres', 'autres', 'autres']);
    const avert = r.report.issues.filter((i) => i.code.startsWith('justice-famille')).map((i) => [i.severity, i.code, i.message]);
    expect(avert).toEqual([
      [
        'avertissement',
        'justice-famille-absente',
        'condamnations[5] (Absente Sacha) : famille absente, classée « Autres infractions » ; la qualification évoque : « Probité\u00a0: argent public, corruption, fraude ».',
      ],
      ['avertissement', 'justice-famille-absente', 'condamnations[6] (Nulle Sacha) : famille absente, classée « Autres infractions ».'],
      [
        'avertissement',
        'justice-famille-invalide',
        'condamnations[7] (Invalide Sacha) : famille « Probité » invalide (probite|violences|haine|diffamation|autres), classée « Autres infractions » ; la qualification évoque : « Probité\u00a0: argent public, corruption, fraude ».',
      ],
      [
        'avertissement',
        'justice-famille-invalide',
        'condamnations[8] (Inconnue Sacha) : famille « fraude » invalide (probite|violences|haine|diffamation|autres), classée « Autres infractions » ; la qualification évoque : « Probité\u00a0: argent public, corruption, fraude ».',
      ],
    ]);
  });

  it('compteurs par famille dans le bilan et dans data-report.md', async () => {
    const { formatReport } = await import('./report');
    expect(r.report.justice.partis.find((p) => p.id === 'pa')?.parFamille).toEqual({ probite: 1, violences: 1, haine: 1, diffamation: 1, autres: 5 });
    const md = formatReport(r.report, r.data);
    expect(md).toContain(
      '- Condamnations affichées par famille (ordre de gravité) : Probité 1, Violences 1, Propos haine 1, Diffamation 1, Autres 5 — famille absente ou invalide, classée « Autres » : 4.',
    );
    expect(md).toContain('| Parti | Probité | Violences | Propos haine | Diffamation | Autres | Affichées |');
    expect(md).toContain('| pa | 1 | 1 | 1 | 1 | 5 | 9 |');
    expect(md).toContain('| pb | 0 | 0 | 0 | 0 | 0 | 0 |');
    expect(md).toContain('- [AVERT.] pa (justice-famille-absente) : condamnations[5] (Absente Sacha) : famille absente');
  });

  it('famille qui ne correspond pas à la qualification juridique : affichée telle quelle, signalée pour relecture', () => {
    const d = build({
      pa: justiceFile('pa', {
        condamnations: [
          condamnation({ personne: 'Classement Sacha', infraction: 'détournement de fonds publics', famille: 'autres' }),
          condamnation({ personne: 'Raciste Sacha', infraction: 'injure publique en raison de l’origine', famille: 'diffamation' }),
          // cohérentes : aucun signalement
          condamnation({ personne: 'Relaxe Sacha', infraction: 'vol (relaxée du chef de tentative d’escroquerie)', famille: 'autres' }),
          condamnation({ personne: 'Multiple Sacha', infraction: 'outrage et violence', famille: 'violences' }),
          condamnation({ personne: 'Libyen Sacha', infraction: 'association de malfaiteurs', famille: 'probite' }),
          condamnation({ personne: 'Presse Sacha', infraction: 'provocation à la haine ou à la violence à raison de la religion', famille: 'haine' }),
          // plusieurs infractions : la famille doit être la plus grave (Méthodologie)
          condamnation({ personne: 'Cumul Sacha', infraction: 'diffamation publique et abus de biens sociaux', famille: 'diffamation' }),
        ],
      }),
    });
    expect(affichees(d, 'pa').map((c) => c.famille)).toEqual(['autres', 'diffamation', 'autres', 'violences', 'probite', 'haine', 'diffamation']);
    const relire = d.report.justice.partis.find((p) => p.id === 'pa')?.aRelire.filter((a) => a.includes('vérifier le classement'));
    expect(relire).toEqual([
      'condamnations[0] (Classement Sacha) : famille « Autres infractions », mais la qualification « détournement de fonds publics » évoque « Probité\u00a0: argent public, corruption, fraude » (la plus grave d\'abord) — vérifier le classement.',
      'condamnations[1] (Raciste Sacha) : famille « Propos\u00a0: diffamation, injure », mais la qualification « injure publique en raison de l’origine » évoque « Propos\u00a0: haine, discrimination, négationnisme » (la plus grave d\'abord) — vérifier le classement.',
      'condamnations[6] (Cumul Sacha) : famille « Propos\u00a0: diffamation, injure », mais la qualification « diffamation publique et abus de biens sociaux » évoque « Probité\u00a0: argent public, corruption, fraude », « Propos\u00a0: diffamation, injure » (la plus grave d\'abord) — vérifier le classement.',
    ]);
    expect(d.report.issues.filter((i) => i.code.startsWith('justice-famille'))).toEqual([]);
  });

  it('familles évoquées par une qualification juridique (contrôle de cohérence)', () => {
    const cas: [string, string[]][] = [
      ['détournement de fonds publics', ['probite']],
      ['recel d’abus de biens sociaux', ['probite']],
      ['prise illégale d’intérêts', ['probite']],
      ['omission dans la déclaration de patrimoine et blanchiment de fraude fiscale', ['probite']],
      ['infractions de l’article L. 131-14 du code des juridictions financières', ['probite']],
      ['violences sans incapacité commises par conjoint', ['violences']],
      ['provocation à la discrimination raciale', ['haine']],
      ['injure publique à raison de l’orientation sexuelle', ['haine']],
      ["injure publique envers un groupe de personnes à raison de leur origine", ['haine']],
      ['contestation de crime contre l’humanité', ['haine']],
      ['provocation à la haine ou à la violence à raison de l’origine', ['haine']],
      ['outrage et violence', ['violences']],
      ['injure publique à caractère antisémite', ['haine']],
      ['injure publique en raison du sexe', ['haine']],
      ['injure envers un groupe à raison de leur appartenance à une religion', ['haine']],
      ['prise illégale d’intérêt', ['probite']],
      ['omission dans la déclaration de situation patrimoniale', ['probite']],
      ['corruption de mineur', []],
      ['relaxé en première instance, condamné en appel pour détournement de fonds publics', ['probite']],
      ['injure publique et diffamation publique', ['diffamation']],
      ['outrage et diffamation non publique (relaxe pour injure raciste)', ['diffamation']],
      ['association de malfaiteurs (relaxé des chefs de corruption passive et de détournement de fonds publics)', []],
      ['vol (relaxée du chef de tentative d’escroquerie)', []],
      ['conduite en état d’ivresse et outrage', []],
      ['dénonciation calomnieuse (blanchie par la cour d’appel du chef de faux)', []],
      ['affichage électoral illégal', []],
    ];
    for (const [infraction, attendu] of cas) expect(famillesEvoquees(infraction), infraction).toEqual(attendu);
  });
});

describe('même décision d’un membre citée par les deux fiches d’un candidat', () => {
  // beta : Parti B (principal) et Parti A ; « Membre Commun » figure dans les deux fiches
  const membre = (extra: Record<string, unknown> = {}) =>
    condamnation({ personne: 'Membre Commun', categorie: 'senateur', dateDecision: '2020-03-04', ...extra });
  const issuesDe = (r: ReturnType<typeof build>) =>
    r.report.issues.filter((i) => i.code === 'condamnation-divergente' || i.code === 'condamnation-quasi-doublon').map((i) => [i.code, i.message]);

  it('identique : aucune alerte (affichée une fois sur la page, src/lib/justice.ts)', () => {
    expect(issuesDe(build({ pb: justiceFile('pb', { condamnations: [membre()] }), pa: justiceFile('pa', { condamnations: [membre()] }) }))).toEqual([]);
  });

  it('famille, statut ou peine différents : divergence signalée (la page retient la fiche du parti principal)', () => {
    const r = build({
      pb: justiceFile('pb', { condamnations: [membre({ famille: 'diffamation' })] }),
      pa: justiceFile('pa', { condamnations: [membre({ famille: 'probite' })] }),
    });
    expect(issuesDe(r)).toEqual([
      ['condamnation-divergente', 'pb/pb-0 et pa/pa-0 : même décision, statut, peine ou famille différents entre les fiches ; la page affiche ceux de pb.'],
    ]);
  });

  it('date plus ou moins précise : quasi-doublon signalé (les deux entrées restent affichées)', () => {
    const r = build({
      pb: justiceFile('pb', { condamnations: [membre({ dateDecision: '2020' })] }),
      pa: justiceFile('pa', { condamnations: [membre()] }),
    });
    expect(issuesDe(r).map(([code]) => code)).toEqual(['condamnation-quasi-doublon']);
    // personnes différentes : rien
    const autres = build({
      pb: justiceFile('pb', { condamnations: [membre({ personne: 'Autre Personne' })] }),
      pa: justiceFile('pa', { condamnations: [membre()] }),
    });
    expect(issuesDe(autres)).toEqual([]);
  });
});

describe('candidats.json : rattachement aux partis', () => {
  it('identifiant de parti invalide ou parti cité deux fois : erreur bloquante', () => {
    for (const partis of [[{ id: 'Parti A', nom: 'A' }], [{ id: 'pa', nom: 'A' }, { id: 'pa', nom: 'A' }], []]) {
      const r = buildData(inputs([{ id: 'q1' }], [candidat('alpha', [], 'PA1', { partis })]));
      expect(errorsOf(r).map((e) => e.code)).toEqual(['schema-entree']);
    }
  });

  it('noms de parti divergents entre deux candidats : le premier est retenu', () => {
    const r = buildData(
      inputs([{ id: 'q1' }], [
        candidat('alpha', [], 'PA1', { partis: [{ id: 'pa', nom: 'Parti A' }] }),
        candidat('beta', [], 'PA2', { partis: [{ id: 'pa', nom: 'Le Parti A' }] }),
      ]),
    );
    expect(r.data?.partis[0]?.nom).toBe('Parti A');
    expect(r.report.issues.map((i) => i.code)).toContain('parti-nom');
  });
});

describe('utilitaires', () => {
  it('dates ISO calendaires', () => {
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2023-02-29')).toBe(false);
    expect(isIsoDate('2023-1-01')).toBe(false);
    expect(isIsoDate(20230101)).toBe(false);
  });
  it('même personne : ordre, accents, casse et traits d’union indifférents ; homonymes partiels exclus', () => {
    expect(memePersonne('Le Pen Marine', 'Marine Le Pen')).toBe(true);
    expect(memePersonne('DUPONT-AIGNAN Nicolas', 'Nicolas Dupont-Aignan')).toBe(true);
    expect(memePersonne('Melenchon Jean-Luc', 'Jean-Luc Mélenchon')).toBe(true);
    expect(memePersonne('Le Pen Marine (députée du Pas-de-Calais)', 'Marine Le Pen')).toBe(true);
    expect(memePersonne('Martine Le Penhoat', 'Marine Le Pen')).toBe(false);
    expect(memePersonne('Jean Mélenchon', 'Jean-Luc Mélenchon')).toBe(false);
    // mots en plus : pas la même personne (et signalé pour relecture)
    expect(memePersonne('Marine Le Pen et Louis Aliot', 'Marine Le Pen')).toBe(false);
    expect(memePersonne('Front national (présidé par Marine Le Pen)', 'Marine Le Pen')).toBe(false);
    expect(memePersonne('Le Pen Jean-Marie Marine', 'Marine Le Pen')).toBe(false);
    expect(mentionPartielle('Marine Le Pen et Louis Aliot', 'Marine Le Pen')).toBe(true);
    expect(mentionPartielle('Le Pen Marine', 'Marine Le Pen')).toBe(false);
  });
});

// ---------------------------------------------------------------- appartenance actuelle et anciens membres (round 7)

describe('appartenance actuelle (data/justice/membres/) : jointure par la chaîne exacte du champ personne', () => {
  const fiche = justiceFile('pa', {
    condamnations: [
      condamnation({ personne: 'Dupont Camille' }),
      condamnation({ personne: 'Martin Alex', categorie: 'ancien_dirigeant', dateDecision: '2010-01-01' }),
      condamnation({ personne: 'Parti A (personne morale)', categorie: 'parti', roleActuel: null, dateDecision: '2012-01-01' }),
      condamnation({ personne: 'Prénom Alpha', categorie: 'candidat', roleActuel: null, dateDecision: '2014-01-01' }),
      condamnation({ personne: 'Oublié Sacha', dateDecision: '2015-01-01' }),
    ],
  });
  const r = build({ pa: fiche, pb: justiceFile('pb') }, '2026-10-18', {
    membres: {
      pa: membresFile('pa', [
        membre('Dupont Camille', { statutMembre: 'suspendu', depuis: '2026-09-25', lienAvecCondamnation: 'non', reactionParti: 'Le parti l’a soutenu publiquement.' }),
        membre('Martin Alex', { statutMembre: 'exclu', depuis: '2015-08-20', lienAvecCondamnation: 'oui', detail: 'Exclu en 2015 après ses propos.' }),
        // « Alpha Prénom » ≠ « Prénom Alpha » : jamais joint (chaîne exacte), signalé
        membre('Alpha Prénom'),
      ]),
    },
  });
  const par = (personne: string) => affichees(r, 'pa').find((c) => c.personne === personne)?.appartenance;

  it('statut, date, lien, détail, réaction et sources repris ; schéma de sortie respecté', () => {
    expect(errorsOf(r)).toEqual([]);
    expect(appDataSchema.safeParse(r.data).success).toBe(true);
    expect(par('Dupont Camille')).toMatchObject({
      statut: 'suspendu',
      depuis: '2026-09-25',
      lien: 'non',
      reactionParti: 'Le parti l’a soutenu publiquement.',
      sources: [{ url: 'https://www.parti.example.fr/membres', citations: ['Membre du parti.'] }],
    });
    expect(par('Martin Alex')).toMatchObject({ statut: 'exclu', lien: 'oui', detail: 'Exclu en 2015 après ses propos.' });
    expect(parti(r, 'pa')?.fiche?.appartenance).toBe('lue');
  });

  it('personne absente du fichier : statut « inconnu », avertissement ; le parti lui-même : personne morale', () => {
    expect(par('Oublié Sacha')).toMatchObject({ statut: 'inconnu', sources: [] });
    expect(par('Prénom Alpha')?.statut).toBe('inconnu');
    expect(par('Parti A (personne morale)')?.statut).toBe('personne_morale');
    const msg = r.report.issues.filter((i) => i.code === 'appartenance-personne-absente').map((i) => i.message);
    expect(msg).toHaveLength(1);
    expect(msg[0]).toContain('« Prénom Alpha », « Oublié Sacha »');
    const orph = r.report.issues.find((i) => i.code === 'appartenance-orpheline');
    expect(orph?.message).toMatch(/« Alpha Prénom » ne correspond à aucune condamnation.*même personne que « Prénom Alpha »/);
    expect(orph?.severity).toBe('avertissement');
  });

  it('fichier membres/ absent : statut « inconnu » pour toutes les personnes, un avertissement par parti', () => {
    const sans = build({ pa: fiche }, '2026-10-18', { membres: {} });
    const statuts = affichees(sans, 'pa').map((c) => [c.personne, c.appartenance.statut]);
    expect(statuts).toEqual([
      ['Dupont Camille', 'inconnu'],
      ['Martin Alex', 'inconnu'],
      ['Parti A (personne morale)', 'personne_morale'],
      ['Prénom Alpha', 'inconnu'],
      ['Oublié Sacha', 'inconnu'],
    ]);
    expect(parti(sans, 'pa')?.fiche?.appartenance).toBe('absente');
    expect(sans.report.issues.filter((i) => i.code === 'appartenance-absente')).toHaveLength(1);
    expect(sans.report.justice.partis.find((p) => p.id === 'pa')?.inconnus).toEqual(['Dupont Camille', 'Martin Alex', 'Prénom Alpha', 'Oublié Sacha']);
    // JSON illisible : même traitement
    const illisible = build({ pa: fiche }, '2026-10-18', { membres: { pa: '{ pas du json' } });
    expect(parti(illisible, 'pa')?.fiche?.appartenance).toBe('illisible');
    expect(affichees(illisible, 'pa')[0]?.appartenance.statut).toBe('inconnu');
  });

  it('statut affirmé sans source valide → « inconnu » ; statut, date et lien invalides → ignorés et signalés', () => {
    const r2 = build({ pa: fiche }, '2026-10-18', {
      membres: {
        pa: membresFile('pa', [
          membre('Dupont Camille', { sources: [{ url: 'https://www.x.example.fr', citation: '' }, { url: 'pas-une-url', citation: 'Texte.' }] }),
          membre('Martin Alex', { statutMembre: 'Exclu', depuis: '2015-13', lienAvecCondamnation: 'peut-être' }),
          membre('Oublié Sacha', { depuis: '2099-01-01' }),
        ]),
      },
    });
    const a = (p: string) => affichees(r2, 'pa').find((c) => c.personne === p)?.appartenance;
    expect(a('Dupont Camille')).toEqual({ statut: 'inconnu', depuis: null, detail: null, lien: null, reactionParti: null, sources: [] });
    expect(a('Martin Alex')).toMatchObject({ statut: 'inconnu', depuis: null, lien: null });
    expect(a('Oublié Sacha')).toMatchObject({ statut: 'membre', depuis: null });
    const codes = r2.report.issues.map((i) => i.code);
    for (const code of ['appartenance-sans-source', 'appartenance-statut-invalide', 'appartenance-date-invalide', 'appartenance-lien-invalide', 'appartenance-source-ecartee'])
      expect(codes, code).toContain(code);
    expect(appDataSchema.safeParse(r2.data).success).toBe(true);
  });

  it('sans source : ni détail ni réaction affichés ; le parti lui-même reste « personne morale » sans source', () => {
    const r3 = build({ pa: fiche }, '2026-10-18', {
      membres: {
        pa: membresFile('pa', [
          membre('Dupont Camille', { statutMembre: 'inconnu', detail: 'Exclue en 2015.', reactionParti: 'Le parti l’a soutenue.', sources: [] }),
          membre('Parti A (personne morale)', { statutMembre: 'personne_morale', depuis: null, sources: [] }),
          // une personne physique n'est jamais « le parti » sans preuve
          membre('Martin Alex', { statutMembre: 'personne_morale', sources: [] }),
        ]),
      },
    });
    const a = (p: string) => affichees(r3, 'pa').find((c) => c.personne === p)?.appartenance;
    expect(a('Dupont Camille')).toEqual({ statut: 'inconnu', depuis: null, detail: null, lien: null, reactionParti: null, sources: [] });
    expect(a('Parti A (personne morale)')?.statut).toBe('personne_morale');
    expect(a('Martin Alex')?.statut).toBe('inconnu');
    expect(r3.report.issues.filter((i) => i.code === 'appartenance-sans-source').map((i) => i.message.slice(0, 50))).toHaveLength(1);
    // fiche du parti illisible : membres/ et anciens/ « ignorés » dans le bilan (jamais « absents »)
    const ill = build({ pa: '{' }, '2026-10-18', { membres: { pa: membresFile('pa', []) }, anciens: { pa: anciensFile('pa', []) } });
    expect(ill.report.justice.partis.find((p) => p.id === 'pa')).toMatchObject({ fichier: 'illisible', membres: 'ignoré', anciens: 'ignoré' });
  });

  it('bilan : affichées par niveau et par famille, par statut d’appartenance ; data-report.md', async () => {
    const bilan = r.report.justice.partis.find((p) => p.id === 'pa');
    // niveau 1 : suspendu (Dupont), parti, candidat (statut inconnu, compté quand même) ; niveau 2 : exclu, inconnu
    expect(bilan?.niveaux[1].probite).toBe(3);
    expect(bilan?.niveaux[2].probite).toBe(2);
    expect(bilan?.parAppartenance).toMatchObject({ suspendu: 1, exclu: 1, personne_morale: 1, inconnu: 2 });
    const { formatReport } = await import('./report');
    const md = formatReport(r.report, r.data);
    expect(md).toContain('### Appartenance actuelle et niveaux');
    expect(md).toMatch(/\| pa \| alpha, beta \| lu \| absent \| 3 \| 0 \| 0 \| 0 \| 0 \| 3 \| 2 \| 0 \| 0 \| 0 \| 0 \| 2 \|/);
  });
});

describe('condamnations d’anciens membres (data/justice/anciens/) : passif, mêmes contrôles stricts', () => {
  const fiches = { pa: justiceFile('pa', { condamnations: [condamnation()] }), pb: justiceFile('pb') };
  const r = build(fiches, '2026-10-18', {
    anciens: {
      pa: anciensFile('pa', [
        ancienne(),
        ancienne({ personne: 'Sans Source', sources: [] }),
        ancienne({ personne: 'Mauvaise Catégorie', categorie: 'depute' }),
        // même décision que la fiche (même personne, date, juridiction) : doublon, la fiche fait foi
        ancienne({ personne: 'Dupont Camille', dateDecision: '2021-06-01' }),
        ancienne({ personne: 'Exclu Affaire', dateDecision: '2019-01-01' }, { statutMembre: 'exclu', depuis: '2018', lienAvecCondamnation: 'oui' }),
        ancienne({ personne: 'Sénateur Suspendu', dateDecision: '2024-01-01' }, { statutMembre: 'suspendu', depuis: '2023-11-18' }),
        ancienne({ personne: 'Sans Appartenance', dateDecision: '2020-01-01', appartenance: undefined }),
        ancienne({ personne: 'Prénom Alpha', dateDecision: '2013-01-01' }),
      ], { statutMembreNonEtabli: [{ personne: 'Douteux Claude', pourquoiNonRetenu: 'Aucune source de départ.' }] }),
    },
  });
  const anciens = affichees(r, 'pa').filter((c) => c.categorie === 'ancien_membre');

  it('entrées valides affichées (catégorie ancien_membre, appartenance propre) ; invalides rejetées et listées', () => {
    expect(errorsOf(r)).toEqual([]);
    expect(appDataSchema.safeParse(r.data).success).toBe(true);
    expect(anciens.map((c) => [c.id, c.personne, c.appartenance.statut])).toEqual([
      ['pa-ancien-0', 'Ancien Député', 'depart'],
      ['pa-ancien-4', 'Exclu Affaire', 'exclu'],
      ['pa-ancien-5', 'Sénateur Suspendu', 'suspendu'],
      ['pa-ancien-6', 'Sans Appartenance', 'inconnu'],
      ['pa-ancien-7', 'Prénom Alpha', 'depart'],
    ]);
    // jamais rattachées à la page d'un candidat, même si le nom est celui d'un candidat du parti
    expect(anciens.every((c) => c.candidat === null)).toBe(true);
    expect(r.report.justice.rejets.map((x) => [x.liste, x.index, x.motifs.join(' ; ')])).toEqual([
      ['anciens', 1, 'aucune source'],
      ['anciens', 2, 'catégorie « depute » invalide (ancien_membre)'],
      ['anciens', 3, 'doublon de condamnations[0] (même personne, même date, même juridiction)'],
    ]);
    expect(parti(r, 'pa')?.fiche?.anciens).toEqual({ liste: 'remplie', personnesVerifiees: 12, dateConsultation: '2026-10-18' });
    expect(parti(r, 'pb')?.fiche?.anciens.liste).toBe('absente');
  });

  it('points à relire : statut « toujours au parti » dans anciens/, candidat cité, personne non retenue', () => {
    const bilan = r.report.justice.partis.find((p) => p.id === 'pa');
    const relire = bilan?.aRelire.join('\n') ?? '';
    expect(relire).toMatch(/anciens\/condamnations\[5\] \(Sénateur Suspendu\) : statut d'appartenance « suspendu »/);
    expect(relire).toMatch(/anciens\/condamnations\[7\] : « Prénom Alpha » désigne Prénom Alpha, candidat du parti/);
    expect(relire).toContain('Douteux Claude non retenu(e) par la recherche');
    expect(r.report.issues.some((i) => i.code === 'appartenance-invalide' && i.message.includes('Sans Appartenance'))).toBe(true);
    expect(bilan?.anciensAffichees).toBe(5);
    expect(bilan?.niveaux[2].probite).toBe(5);
    expect(bilan?.niveaux[1].probite).toBe(1);
    expect(bilan?.methodeAnciens).toBe('Anciens parlementaires depuis 2012.');
  });

  it('affichées + rejetées = entrées des deux fichiers ; fichiers orphelins ou sans fiche signalés', () => {
    const bilan = r.report.justice.partis.find((p) => p.id === 'pa');
    expect((bilan?.affichees ?? 0) + (bilan?.rejetees ?? 0)).toBe(1 + 8);
    const o = build({ pa: justiceFile('pa') }, '2026-10-18', { anciens: { zz: anciensFile('zz', []), pb: anciensFile('pb', [ancienne()]) }, membres: { yy: membresFile('yy', []) } });
    expect(o.report.justice.fichiersOrphelins).toEqual(expect.arrayContaining(['anciens/zz.json', 'membres/yy.json']));
    expect(o.report.issues.find((i) => i.code === 'justice-annexe-sans-fiche')?.message).toContain('anciens/pb.json ignoré');
    // JSON illisible : ignoré, signalé, la fiche reste intacte
    const ill = build(fiches, '2026-10-18', { anciens: { pa: '{' } });
    expect(affichees(ill, 'pa')).toHaveLength(1);
    expect(ill.report.issues.some((i) => i.code === 'anciens-illisible')).toBe(true);
    expect(ill.report.justice.partis.find((p) => p.id === 'pa')?.anciens).toBe('illisible');
  });
});
