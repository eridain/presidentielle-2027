// Mode « Approfondir par catégorie » : lecture de data/selection-approfondi.json et de votes-approfondi.json,
// reprise des questions existantes, nouvelles questions, seuils, anomalies jamais bloquantes.
import { describe, expect, it } from 'vitest';
import { MIN_QUESTIONS_CATEGORIE } from '../src/lib/categories';
import { porteeDepuisTitre, resultatConforme } from './approfondi';
import { buildData, type BuildInputs } from './build';
import { candidat, decl, groupe, inputs, researchFile, voteCand } from './fixtures';
import { frenchSpacing as nb } from '../src/lib/typo';
import { appDataSchema, questionOutSchema } from './schemas';

const ECO = 'Économie & travail';
const IMMIG = 'Immigration';

interface EntreeTest {
  id: string;
  categorie?: string;
  scrutin?: string;
  typeVote?: string;
  sens?: string;
  existant?: boolean;
  date?: string;
  resultat?: string;
}

/** Entrée de selection-approfondi.json (nouvelle question par défaut). */
function entree(e: EntreeTest, i: number) {
  return {
    id: e.id,
    categorie: e.categorie ?? ECO,
    scrutin: e.scrutin ?? `VTANR5L17V${String(500 + i)}`,
    date: e.date ?? '2025-01-20',
    typeVote: e.typeVote ?? 'ensemble',
    question: `Question approfondie ${e.id} ?`,
    sens: e.sens ?? 'pour=oui',
    titreScrutin: `l'ensemble du texte ${e.id}`,
    resultat: e.resultat ?? 'adopté',
    existant: e.existant ?? false,
    justification: 'Test.',
  };
}

/** Entrée de votes-approfondi.json correspondant à une entrée de sélection. */
function voteDe(sel: ReturnType<typeof entree>, extra: Record<string, unknown> = {}) {
  return {
    id: sel.id,
    categorie: sel.categorie,
    scrutin: sel.scrutin,
    question: sel.question,
    sens: sel.sens,
    existant: sel.existant,
    portee: sel.typeVote,
    date: '2025-01-20',
    titreScrutin:
      sel.typeVote === 'amendement'
        ? `l'amendement n° 12 au texte ${sel.id}`
        : sel.typeVote === 'motion_censure'
          ? `la motion de censure déposée sur le texte ${sel.id}`
          : `l'ensemble du texte ${sel.id}`,
    typeVote: 'scrutin public ordinaire',
    sort: 'adopté',
    pour: 120,
    contre: 80,
    abstention: 3,
    dossier: null,
    dossierRef: null,
    urlScrutin: `https://www.assemblee-nationale.fr/dyn/17/scrutins/${sel.scrutin.replace(/.*V/, '')}`,
    groupes: [groupe('A', 10, 2, 0), groupe('B', 1, 20, 3)],
    candidats: { alpha: voteCand('contre', { groupe: 'A' }) },
    ...extra,
  };
}

/** Deux questions principales (q1, q2) + une sélection approfondie. */
function avecApprofondi(
  entrees: EntreeTest[],
  opts: { votes?: (sel: ReturnType<typeof entree>[]) => unknown[]; research?: Record<string, unknown>; simple?: Record<string, string>; brut?: string | null } = {},
): BuildInputs {
  const base = inputs([{ id: 'q1' }, { id: 'q2', scrutin: 'VTANR5L16V200' }], undefined, opts.research ?? {});
  const sel = entrees.map((e, i) => {
    const x = entree(e, i);
    // une question existante porte le scrutin de selection.json
    if (e.existant && e.scrutin === undefined) x.scrutin = e.id === 'q1' ? 'VTANR5L16V100' : 'VTANR5L16V200';
    return x;
  });
  const votes = opts.votes ? opts.votes(sel) : sel.filter((s) => !s.existant).map((s) => voteDe(s));
  return {
    ...base,
    simple: opts.simple ?? {},
    selectionApprofondi: opts.brut !== undefined ? opts.brut : JSON.stringify(sel),
    votesApprofondi: JSON.stringify(votes),
  };
}

/** n nouvelles questions dans une catégorie (assez pour qu'elle soit proposée). */
const nouvelles = (n: number, prefix = 'n', extra: Partial<EntreeTest> = {}): EntreeTest[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${String(i + 1)}`, ...extra }));

const errorsOf = (r: ReturnType<typeof buildData>) => r.report.issues.filter((i) => i.severity === 'erreur');
const codesAppro = (r: ReturnType<typeof buildData>) => r.report.approfondi.issues.map((i) => i.code);

describe('mode approfondi — absence du fichier', () => {
  it('fichier absent : pas de mode approfondi, parcours principal identique', () => {
    const sans = buildData(inputs([{ id: 'q1' }, { id: 'q2' }]));
    const avecNull = buildData({ ...inputs([{ id: 'q1' }, { id: 'q2' }]), selectionApprofondi: null, votesApprofondi: null });
    for (const r of [sans, avecNull]) {
      expect(errorsOf(r)).toEqual([]);
      expect(r.data?.approfondi).toBeNull();
      expect(r.categories).toEqual([]);
      expect(r.report.approfondi.selection).toBe('absent');
      expect(appDataSchema.safeParse(r.data).success).toBe(true);
    }
    expect(avecNull.data?.questions).toEqual(sans.data?.questions);
  });

  it('fichier illisible ou qui n’est pas une liste : désactivé, signalé, jamais bloquant', () => {
    for (const brut of ['{ pas du json', '{"id": "x"}']) {
      const r = buildData(avecApprofondi([], { brut }));
      expect(errorsOf(r)).toEqual([]);
      expect(r.data?.approfondi).toBeNull();
      expect(r.report.approfondi.selection).toBe('illisible');
      expect(codesAppro(r)).toContain('approfondi-illisible');
    }
  });
});

describe('mode approfondi — construction', () => {
  const entrees: EntreeTest[] = [
    { id: 'q1', existant: true },
    ...nouvelles(MIN_QUESTIONS_CATEGORIE - 1),
    { id: 'amdt', typeVote: 'amendement' },
    { id: 'inverse', sens: 'contre=oui' },
    { id: 'censure', typeVote: 'motion_censure', sens: 'contre=oui' },
    { id: 'q2', existant: true, categorie: IMMIG },
    ...nouvelles(3, 'i', { categorie: IMMIG }),
  ];
  const research = { n1: researchFile('n1', { beta: decl('pour') }) };
  const simple = {
    n1: JSON.stringify({ id: 'n1', questionSimple: 'Faut-il n1 ?', enBref: 'Bref.', pourquoiPour: 'Pour.', pourquoiContre: 'Contre.', ceQuiSestPasse: 'Adopté.' }),
  };
  const r = buildData(
    avecApprofondi(entrees, {
      research,
      simple,
      // motion de censure : alpha, député(e) en mandat, ne figure pas parmi les votants
      votes: (sel) => sel.filter((s) => !s.existant).map((s) => voteDe(s, s.id === 'censure' ? { candidats: { alpha: voteCand('absent') } } : {})),
    }),
  );
  const eco = r.categories.find((c) => c.categorie === 'economie-travail');
  const q = (id: string) => {
    const found = eco?.questions.find((x) => x.id === id);
    if (!found) throw new Error(`question ${id} absente`);
    return found;
  };

  it('aucune erreur bloquante, schéma de sortie respecté, parcours principal inchangé', () => {
    expect(errorsOf(r)).toEqual([]);
    expect(r.report.approfondi.issues.filter((i) => i.severity === 'erreur')).toEqual([]);
    expect(appDataSchema.safeParse(r.data).success).toBe(true);
    // même parcours principal, sans sélection approfondie (ni la recherche de n1, qui y serait orpheline)
    const sans = buildData(inputs([{ id: 'q1' }, { id: 'q2', scrutin: 'VTANR5L16V200' }]));
    expect(r.data?.questions).toEqual(sans.data?.questions);
    expect(r.data?.themes).toEqual(sans.data?.themes);
    // les anomalies du mode approfondi ne se mêlent pas au bilan du parcours principal
    expect(r.report.issues.map((i) => i.code)).toEqual(sans.report.issues.map((i) => i.code));
    expect(r.report.preuves).toEqual(sans.report.preuves);
  });

  it('index : catégories proposées dans l’ordre, questions dans l’ordre du fichier, portée', () => {
    expect(r.data?.approfondi?.categories.map((c) => c.id)).toEqual(['economie-travail']);
    const refs = r.data?.approfondi?.categories[0]?.questions ?? [];
    expect(refs.map((x) => x.id)).toEqual(['q1', ...nouvelles(MIN_QUESTIONS_CATEGORIE - 1).map((e) => e.id), 'amdt', 'inverse', 'censure']);
    expect(refs[0]).toEqual({ id: 'q1', existant: true, portee: 'ensemble' });
    expect(refs.find((x) => x.id === 'amdt')?.portee).toBe('amendement');
    expect(refs.find((x) => x.id === 'censure')?.portee).toBe('motion_censure');
  });

  it('une question existante est reprise telle quelle : elle n’est pas dupliquée dans le fichier de la catégorie', () => {
    expect(eco?.questions.some((x) => x.id === 'q1')).toBe(false);
    expect(r.data?.questions.find((x) => x.id === 'q1')?.theme).toBe('Thème');
  });

  it('nouvelle question : mêmes règles de résolution que le parcours principal', () => {
    const n2 = q('n2');
    expect(questionOutSchema.safeParse(n2).success).toBe(true);
    expect(n2.theme).toBe(ECO);
    expect(n2.candidats.alpha).toMatchObject({ evidence: 'vote_an', position: 'contre', stance: 'non' });
    // beta : pas de vote nominatif → proxy du groupe B (majorité contre)
    expect(n2.candidats.beta).toMatchObject({ evidence: 'groupe', position: 'contre', groupe: 'B' });
    expect(n2.scrutin.url).toBe('https://www.assemblee-nationale.fr/dyn/17/scrutins/502');
  });

  it('sens « contre=oui » : Oui = contre ; motion de censure : soutien implicite des députés absents', () => {
    expect(q('inverse').ouiSignifie).toBe('contre');
    expect(q('inverse').candidats.alpha?.stance).toBe('oui');
    const c = q('censure');
    expect(c.scrutin.censure).toBe(true);
    expect(c.ouiSignifie).toBe('contre');
    expect(c.candidats.alpha).toMatchObject({ evidence: 'censure_implicite', position: 'contre', stance: 'oui' });
  });

  it('question sans recherche : affichable (votes AN + proxies), titre = question entière, signalée', () => {
    const n2 = q('n2');
    expect(n2.recherche).toBe(false);
    expect(n2.titre).toBe(nb('Question approfondie n2 ?'));
    expect(n2.contexte).toBeNull();
    expect(r.report.approfondi.questionsSansRecherche).toContain('n2');
    expect(r.report.approfondi.questionsSansRecherche).not.toContain('n1');
    expect(r.report.questionsSansRecherche).toEqual(['q1', 'q2']);
  });

  it('recherche et « En clair » d’une nouvelle question : fusionnées, pas orphelines', () => {
    const n1 = q('n1');
    expect(n1.recherche).toBe(true);
    expect(n1.titre).toBe('Titre n1');
    expect(n1.candidats.beta).toMatchObject({ evidence: 'declaration', position: 'pour' });
    expect(n1.enClair?.questionSimple).toBe(nb('Faut-il n1 ?'));
    expect(r.report.issues.map((i) => i.code)).not.toContain('recherche-orpheline');
    expect(r.report.issues.map((i) => i.code)).not.toContain('en-clair-orphelin');
    expect(r.report.approfondi.enClairManquants).not.toContain('n1');
  });

  it('catégorie sous le seuil : non proposée, signalée ; bilan par catégorie', () => {
    expect(r.categories.map((c) => c.categorie)).toEqual(['economie-travail']);
    expect(codesAppro(r)).toContain('approfondi-categorie-insuffisante');
    const immig = r.report.approfondi.categories.find((c) => c.id === 'immigration');
    expect(immig).toMatchObject({ questions: 4, existantes: 1, nouvelles: 3, proposee: false });
    const ecoR = r.report.approfondi.categories.find((c) => c.id === 'economie-travail');
    expect(ecoR).toMatchObject({ questions: MIN_QUESTIONS_CATEGORIE + 3, existantes: 1, avecRecherche: 1, avecEnClair: 1, proposee: true });
    expect(r.report.approfondi.existantesNonReprises).toEqual([]);
  });

  it('positions des nouvelles questions comptées à part', () => {
    expect(Object.values(r.report.approfondi.preuves).reduce((a, b) => a + b, 0)).toBe(2 * (MIN_QUESTIONS_CATEGORIE + 2 + 3));
  });
});

describe('mode approfondi — entrées écartées et contrôles', () => {
  it('entrées invalides, catégorie inconnue, doublon : écartées une à une', () => {
    const sel = [
      ...nouvelles(MIN_QUESTIONS_CATEGORIE).map((e, i) => entree(e, i)),
      { ...entree({ id: 'mauvais-scrutin' }, 50), scrutin: 'SCRUTIN-1' },
      { ...entree({ id: 'mauvaise-portee' }, 51), typeVote: 'loi' },
      entree({ id: 'culture', categorie: 'Culture' }, 52),
      entree({ id: 'n1' }, 53),
      'pas un objet',
    ];
    const base = avecApprofondi([]);
    const r = buildData({
      ...base,
      selectionApprofondi: JSON.stringify(sel),
      // un vote par identifiant (celui de la première entrée)
      votesApprofondi: JSON.stringify(sel.slice(0, MIN_QUESTIONS_CATEGORIE + 3).map((s) => voteDe(s as ReturnType<typeof entree>))),
    });
    expect(errorsOf(r)).toEqual([]);
    const ecartees = r.report.approfondi.ecartees;
    expect(ecartees.map((e) => e.id)).toEqual(['mauvais-scrutin', 'mauvaise-portee', 'culture', 'n1', null]);
    expect(ecartees.find((e) => e.id === 'n1')?.motifs.join()).toMatch(/doublon/);
    expect(ecartees.find((e) => e.id === 'culture')?.motifs.join()).toMatch(/catégorie « Culture » inconnue/);
    expect(r.data?.approfondi?.categories[0]?.questions).toHaveLength(MIN_QUESTIONS_CATEGORIE);
  });

  it('catégorie à la casse ou aux accents près : acceptée, signalée en info', () => {
    const r = buildData(avecApprofondi(nouvelles(MIN_QUESTIONS_CATEGORIE, 'n', { categorie: 'economie et travail' })));
    expect(r.data?.approfondi?.categories.map((c) => c.libelle)).toEqual([ECO]);
    expect(codesAppro(r)).toContain('approfondi-categorie-proche');
  });

  it('vote manquant ou scrutin différent : question écartée (relancer extract_votes.py --approfondi)', () => {
    const r = buildData(
      avecApprofondi(nouvelles(MIN_QUESTIONS_CATEGORIE + 2), {
        votes: (sel) => sel.slice(0, MIN_QUESTIONS_CATEGORIE + 1).map((s, i) => voteDe(s, i === 0 ? { scrutin: 'VTANR5L17V9999' } : {})),
      }),
    );
    expect(errorsOf(r)).toEqual([]);
    const motifs: Record<string, string> = Object.fromEntries(r.report.approfondi.ecartees.map((e) => [e.id ?? '', e.motifs.join()]));
    expect(motifs.n1).toMatch(/ne correspond pas/);
    expect(motifs[`n${String(MIN_QUESTIONS_CATEGORIE + 2)}`]).toMatch(/extract_votes\.py --approfondi/);
    expect(r.data?.approfondi?.categories[0]?.questions).toHaveLength(MIN_QUESTIONS_CATEGORIE);
  });

  it('votes-approfondi.json absent : nouvelles questions écartées, avertissement explicite', () => {
    const r = buildData({ ...avecApprofondi([{ id: 'q1', existant: true }, ...nouvelles(3)]), votesApprofondi: null });
    expect(errorsOf(r)).toEqual([]);
    expect(r.report.approfondi.votes).toBe('absent');
    expect(codesAppro(r)).toContain('approfondi-votes-absent');
    expect(r.data?.approfondi).toBeNull();
  });

  it('existant incohérent : id principal non marqué → repris tel quel ; marqué mais inconnu → nouvelle question', () => {
    const r = buildData(
      avecApprofondi([{ id: 'q1', existant: false, scrutin: 'VTANR5L16V100' }, { id: 'fantome', existant: true }, ...nouvelles(MIN_QUESTIONS_CATEGORIE)], {
        votes: (sel) => sel.filter((s) => s.id !== 'q1').map((s) => voteDe(s)),
      }),
    );
    expect(codesAppro(r)).toEqual(expect.arrayContaining(['approfondi-id-principal', 'approfondi-existant-inconnu']));
    const refs = r.data?.approfondi?.categories[0]?.questions ?? [];
    expect(refs.find((x) => x.id === 'q1')?.existant).toBe(true);
    expect(refs.find((x) => x.id === 'fantome')?.existant).toBe(false);
  });

  it('question existante avec un autre scrutin : reprise telle quelle, avertissement', () => {
    const r = buildData(avecApprofondi([{ id: 'q1', existant: true, scrutin: 'VTANR5L16V999' }, ...nouvelles(MIN_QUESTIONS_CATEGORIE)]));
    expect(codesAppro(r)).toContain('approfondi-scrutin-existant');
    expect(r.data?.approfondi?.categories[0]?.questions[0]).toEqual({ id: 'q1', existant: true, portee: 'ensemble' });
  });

  it('portée déclarée contredite par l’intitulé officiel, date ou résultat différents : signalés', () => {
    const r = buildData(
      avecApprofondi([...nouvelles(MIN_QUESTIONS_CATEGORIE - 1), { id: 'faux', typeVote: 'ensemble', date: '2025-01-19', resultat: 'rejeté' }], {
        votes: (sel) => sel.map((s) => voteDe(s, s.id === 'faux' ? { titreScrutin: "l'amendement n° 3 de M. X" } : {})),
      }),
    );
    expect(codesAppro(r)).toEqual(expect.arrayContaining(['approfondi-portee', 'approfondi-date', 'approfondi-resultat']));
    // la portée déclarée reste affichée (la sélection est éditoriale), mais elle est à vérifier
    expect(r.data?.approfondi?.categories[0]?.questions.find((x) => x.id === 'faux')?.portee).toBe('ensemble');
  });

  it('motion de censure déclarée mais pas d’après l’intitulé officiel (ou l’inverse) : question écartée', () => {
    const r = buildData(
      avecApprofondi([...nouvelles(MIN_QUESTIONS_CATEGORIE), { id: 'fausse-censure', typeVote: 'motion_censure', sens: 'contre=oui' }, { id: 'censure-cachee' }], {
        votes: (sel) =>
          sel.map((s) =>
            s.id === 'fausse-censure'
              ? voteDe(s, { titreScrutin: "l'ensemble du projet de loi de finances" })
              : s.id === 'censure-cachee'
                ? voteDe(s, { titreScrutin: 'la motion de censure déposée par M. X' })
                : voteDe(s),
          ),
      }),
    );
    expect(errorsOf(r)).toEqual([]);
    const motifs = Object.fromEntries(r.report.approfondi.ecartees.map((e) => [e.id ?? '', e.motifs.join()]));
    expect(motifs['fausse-censure']).toMatch(/déclarée motion de censure/);
    expect(motifs['censure-cachee']).toMatch(/non déclarée motion de censure/);
    expect(r.data?.approfondi?.categories[0]?.questions).toHaveLength(MIN_QUESTIONS_CATEGORIE);
  });

  it('recherche d’une entrée écartée : rattachée au mode approfondi, pas « orpheline » dans le bilan principal', () => {
    const sel = [...nouvelles(MIN_QUESTIONS_CATEGORIE).map((e, i) => entree(e, i)), entree({ id: 'culture', categorie: 'Culture' }, 40)];
    const r = buildData({
      ...avecApprofondi([]),
      research: { culture: JSON.stringify(researchFile('culture')) },
      selectionApprofondi: JSON.stringify(sel),
      votesApprofondi: JSON.stringify(sel.slice(0, MIN_QUESTIONS_CATEGORIE).map((s) => voteDe(s))),
    });
    expect(r.report.issues.map((i) => i.code)).not.toContain('recherche-orpheline');
    expect(r.report.approfondi.ecartees.map((e) => e.id)).toEqual(['culture']);
  });

  it('attributions.json : une clé de nouvelle question n’est pas orpheline', () => {
    const base = avecApprofondi(nouvelles(MIN_QUESTIONS_CATEGORIE));
    const r = buildData({ ...base, attributions: JSON.stringify({ 'n1/alpha': { trouve: false, orateur: null, estLeCandidat: null } }) });
    expect(r.report.issues.map((i) => i.code)).not.toContain('attribution-orpheline');
  });

  it('candidats : position du proxy limitée dans le temps, comme pour le parcours principal', () => {
    const base = avecApprofondi(nouvelles(MIN_QUESTIONS_CATEGORIE));
    const r = buildData({ ...base, candidats: [candidat('alpha', ['A']), candidat('beta', ['B'], 'PA2', { proxyPeriodes: [{ au: '2024-12-31' }] })] });
    const n1 = r.categories[0]?.questions[0];
    expect(n1?.candidats.beta).toMatchObject({ evidence: 'inconnu' });
    expect(r.report.approfondi.issues.map((i) => i.code)).toContain('proxy-hors-periode');
    expect(r.report.issues.map((i) => i.code)).not.toContain('proxy-hors-periode');
  });
});

describe('portée d’après l’intitulé officiel', () => {
  it.each([
    ["l'amendement n° 2091 de M. Maillard à l'article premier", 'amendement'],
    ["l'amendement de suppression n° 4 de Mme X", 'amendement'],
    ["les amendements identiques n° 3 et 7", 'amendement'],
    ["l'article premier de la proposition de loi constitutionnelle", 'article'],
    ["l'article 7 (examen prioritaire)", 'article'],
    ["l'article unique de la proposition de loi visant à interdire le glyphosate", 'ensemble'],
    ['la motion de censure déposée par…', 'motion_censure'],
    ["l'ensemble du projet de loi pour le plein emploi", 'ensemble'],
    ['l’ensemble de la proposition de loi', 'ensemble'],
    ['la motion de rejet préalable', null],
    ['la déclaration du Gouvernement', null],
  ])('%s → %s', (titre, attendu) => {
    expect(porteeDepuisTitre(titre)).toBe(attendu);
  });
});

describe('résultat de la sélection comparé à l’open data AN', () => {
  const vote = { sort: 'adopté', pour: 463, contre: 74, abstention: 20 } as const;
  it.each([
    ['adopté', true],
    ['adopté 463/74/20', true],
    ['  adopté 463/74/20 ', true],
    ['adopté 463/74/21', false],
    ['rejeté 463/74/20', false],
    ['adoptée', true],
    ['voté', false],
  ])('%s → %s', (resultat, attendu) => {
    expect(resultatConforme(resultat, vote)).toBe(attendu);
  });
});
