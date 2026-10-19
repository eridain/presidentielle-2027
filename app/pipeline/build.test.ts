import { describe, expect, it } from 'vitest';
import { buildData } from './build';
import { candidat, decl, groupe, inputs, researchFile, voteCand } from './fixtures';
import { groupMajority, proxyActif, toStance } from './resolve';
import { formatPeriodes } from '../src/lib/format';
import { BREAKABLE_TYPO, frenchSpacing as nb } from '../src/lib/typo';
import { appDataSchema } from './schemas';

const errorsOf = (r: ReturnType<typeof buildData>) => r.report.issues.filter((i) => i.severity === 'erreur');
const codes = (r: ReturnType<typeof buildData>) => r.report.issues.map((i) => i.code);
const pos = (r: ReturnType<typeof buildData>, q: string, c: string) => {
  const p = r.data?.questions.find((x) => x.id === q)?.candidats[c];
  if (!p) throw new Error(`position ${q}/${c} absente`);
  return p;
};

describe('résolution des positions — priorités', () => {
  it('1. le vote nominatif officiel prime, une recherche contradictoire est signalée', () => {
    const r = buildData(
      inputs([{ id: 'q1', candidats: { alpha: voteCand('contre', { groupe: 'A' }) } }], undefined, {
        q1: researchFile('q1', { alpha: decl('pour') }),
      }),
    );
    expect(errorsOf(r)).toEqual([]);
    const p = pos(r, 'q1', 'alpha');
    expect(p).toMatchObject({ position: 'contre', stance: 'non', evidence: 'vote_an', groupe: 'A' });
    expect(p.url).toBe('https://www.assemblee-nationale.fr/dyn/16/scrutins/100');
    expect(p.incoherence).toMatch(/vote officiel est retenu/);
    expect(r.report.incoherences).toHaveLength(1);
    // l'argument et la citation de la recherche restent affichés, avec leur source
    expect(p.argument).toBe('Ses raisons.');
    expect(p.argumentUrl).toBe('https://www.example.fr/interview');
  });

  it('1. un scrutin du Congrès donne une preuve vote_congres, avec repli sur l’open data sans URL officielle', () => {
    const r = buildData(inputs([{ id: 'ivg', scrutin: 'VTCGR5L16V1', url: null, candidats: { alpha: voteCand('pour') } }]));
    expect(pos(r, 'ivg', 'alpha')).toMatchObject({ evidence: 'vote_congres', url: 'https://data.assemblee-nationale.fr' });
    expect(r.data?.questions[0]?.scrutin.assemblee).toBe('Congrès');
    expect(codes(r)).toContain('url-scrutin-absente');
  });

  it('2. vote au Sénat / déclaration de la recherche pour un candidat sans vote AN', () => {
    const r = buildData(
      inputs([{ id: 'q1', candidats: { alpha: voteCand(null) } }], undefined, {
        q1: researchFile('q1', {
          alpha: { ...decl('pour'), type: 'vote_senat', url: 'https://www.senat.fr/scrutin-public/2018/scr2018-65.html' },
          beta: decl('abstention'),
        }),
      }),
    );
    expect(pos(r, 'q1', 'alpha')).toMatchObject({ evidence: 'vote_senat', stance: 'oui', url: 'https://www.senat.fr/scrutin-public/2018/scr2018-65.html' });
    expect(pos(r, 'q1', 'beta')).toMatchObject({ evidence: 'declaration', stance: 'abstention' });
  });

  it('2. une recherche « vote_an » sans vote officiel correspondant est ignorée et signalée', () => {
    const r = buildData(
      inputs([{ id: 'q1', candidats: { alpha: voteCand(null) } }], undefined, {
        q1: researchFile('q1', { alpha: { ...decl('pour'), type: 'vote_an' } }),
      }),
    );
    expect(pos(r, 'q1', 'alpha').evidence).toBe('groupe'); // retombe sur le proxy
    expect(r.report.incoherences.map((i) => i.candidat)).toEqual(['alpha']);
  });

  it('2. une preuve sans URL valide n’est pas retenue', () => {
    const r = buildData(
      inputs([{ id: 'q1' }], [candidat('alpha')], { q1: researchFile('q1', { alpha: decl('pour', { url: 'ftp://exemple' }) }) }),
    );
    expect(pos(r, 'q1', 'alpha').evidence).toBe('inconnu');
    expect(codes(r)).toEqual(expect.arrayContaining(['url-invalide', 'preuve-sans-source']));
  });

  it('3. membre du gouvernement : position du gouvernement fournie par la recherche', () => {
    const r = buildData(
      inputs(
        [{ id: 'q1', candidats: { alpha: voteCand(null, { gouvernement: 'membre' }), beta: voteCand(null) } }],
        [candidat('alpha', ['A']), candidat('beta', ['B'])],
        {
          // la recherche documente la position du gouvernement via une autre entrée « gouvernement »
          q1: researchFile('q1', { beta: { ...decl('pour'), type: 'gouvernement' } }),
        },
      ),
    );
    expect(pos(r, 'q1', 'alpha')).toMatchObject({ evidence: 'gouvernement', position: 'pour', url: 'https://www.example.fr/interview' });
  });

  it('3. membre du gouvernement sans position documentée : proxy de groupe', () => {
    const r = buildData(inputs([{ id: 'q1', candidats: { alpha: voteCand(null, { gouvernement: 'membre' }) } }]));
    expect(pos(r, 'q1', 'alpha')).toMatchObject({ evidence: 'groupe', groupe: 'A', position: 'pour' });
    expect(codes(r)).toContain('gouvernement-sans-position');
  });

  it('4. proxy : premier groupe de proxyGroupe présent dans le scrutin, clairement étiqueté', () => {
    const r = buildData(
      inputs([{ id: 'q1', groupes: [groupe('LFI-NFP', 0, 70, 0), groupe('B', 5, 0, 0)] }], [candidat('alpha', ['FI', 'LFI-NFP'], null)]),
    );
    const p = pos(r, 'q1', 'alpha');
    expect(p).toMatchObject({ evidence: 'groupe', groupe: 'LFI-NFP', position: 'contre', stance: 'non' });
    expect(p.detail).toMatch(/Proxy/);
    expect(p.detail).toMatch(/Ce n'est pas un vote de/);
    expect(r.report.proxies).toEqual([{ question: 'q1', candidat: 'alpha', groupe: 'LFI-NFP' }]);
  });

  it('4. la majorité du groupe est recalculée depuis le décompte (champ AN incohérent)', () => {
    const r = buildData(
      inputs([{ id: 'q1', groupes: [groupe('A', 12, 106, 0, 122, 'pour')] }], [candidat('alpha', ['A'], null)]),
    );
    expect(pos(r, 'q1', 'alpha').position).toBe('contre');
    expect(codes(r)).toContain('majorite-recalculee');
  });

  it('5. député absent : inconnu « n’a pas pris part au vote », sans proxy', () => {
    const r = buildData(inputs([{ id: 'q1', candidats: { alpha: voteCand('absent') } }]));
    expect(pos(r, 'q1', 'alpha')).toMatchObject({ evidence: 'inconnu', stance: 'inconnu', note: "N'a pas pris part au vote" });
  });

  it('5. député absent avec déclaration sourcée : la déclaration est retenue avec la mention', () => {
    const r = buildData(
      inputs([{ id: 'q1', candidats: { alpha: voteCand('absent') } }], undefined, { q1: researchFile('q1', { alpha: decl('contre') }) }),
    );
    expect(pos(r, 'q1', 'alpha')).toMatchObject({ evidence: 'declaration', stance: 'non' });
    expect(pos(r, 'q1', 'alpha').note).toMatch(/n'a pas pris part au vote/);
  });

  it('5. ni vote, ni recherche, ni groupe : inconnu', () => {
    const r = buildData(inputs([{ id: 'q1' }], [candidat('alpha', [], null)]));
    expect(pos(r, 'q1', 'alpha')).toMatchObject({ evidence: 'inconnu', position: null, stance: 'inconnu', url: null });
  });
});

describe('proxies datés (périodes de validité, candidats.json)', () => {
  const MOTIF = "le groupe A ne sert de référence qu'à partir du 1er mars 2019 (alliance électorale).";
  // Comme Glucksmann : proxy seulement à partir du 2019-03-01.
  const depuis = candidat('alpha', ['A'], null, { proxyPeriodes: [{ du: '2019-03-01' }], proxyMotif: MOTIF });
  // Comme Bertrand : avant le 2017-12-11 et à partir du 2021-10-01.
  const trou = candidat('beta', ['B'], null, { proxyPeriodes: [{ au: '2017-12-10' }, { du: '2021-10-01' }] });
  // Comme Lisnard : jusqu'au 2026-03-31.
  const jusqua = candidat('gamma', ['A'], null, { proxyPeriodes: [{ au: '2026-03-31' }] });
  const permanent = candidat('delta', ['B'], null);

  it('proxyActif : bornes incluses, plusieurs périodes, absence de période = toujours', () => {
    expect(proxyActif(permanent, '1990-01-01')).toBe(true);
    expect(proxyActif(depuis, '2019-02-28')).toBe(false);
    expect(proxyActif(depuis, '2019-03-01')).toBe(true);
    expect(proxyActif(trou, '2017-12-10')).toBe(true);
    expect(proxyActif(trou, '2017-12-11')).toBe(false);
    expect(proxyActif(trou, '2021-09-30')).toBe(false);
    expect(proxyActif(trou, '2021-10-01')).toBe(true);
    expect(proxyActif(jusqua, '2026-03-31')).toBe(true);
    expect(proxyActif(jusqua, '2026-04-01')).toBe(false);
    expect(proxyActif({ proxyPeriodes: [{ du: '2020-01-01', au: '2020-12-31' }] }, '2021-01-01')).toBe(false);
  });

  it('formatPeriodes : texte affiché', () => {
    expect(formatPeriodes([{ du: '2019-03-01' }])).toBe('à partir du 1er mars 2019');
    expect(formatPeriodes([{ au: '2017-12-10' }, { du: '2021-10-01' }])).toBe("jusqu'au 10 décembre 2017 et à partir du 1er octobre 2021");
    expect(formatPeriodes([{ du: '2020-01-01', au: '2020-12-31' }])).toBe('du 1er janvier 2020 au 31 décembre 2020');
  });

  const run = (dates: string[], cands = [depuis, trou, jusqua, permanent], research: Record<string, unknown> = {}) =>
    buildData(inputs(dates.map((date, i) => ({ id: `q${i + 1}`, date })), cands, research));

  it('avant la période : pas de proxy, position inconnue expliquée, signalée dans le rapport', () => {
    const r = run(['2017-11-28', '2019-07-23']);
    expect(errorsOf(r)).toEqual([]);
    const avant = pos(r, 'q1', 'alpha');
    expect(avant).toMatchObject({ evidence: 'inconnu', stance: 'inconnu', position: null, groupe: null, url: null });
    expect(avant.detail).toBe(nb(`Pas de vote nominatif sur ce scrutin ni de position documentée. Pas de proxy de groupe à cette date : ${MOTIF}`));
    expect(pos(r, 'q2', 'alpha')).toMatchObject({ evidence: 'groupe', groupe: 'A', position: 'pour' });
    expect(r.report.proxies.filter((p) => p.candidat === 'alpha')).toEqual([{ question: 'q2', candidat: 'alpha', groupe: 'A' }]);
    const hors = r.report.issues.filter((i) => i.code === 'proxy-hors-periode');
    // beta (période « jusqu'au 10 décembre 2017 » puis « à partir du 1er octobre 2021 ») : q1 dans la période, q2 dans le trou
    expect(hors.map((i) => `${i.question}/${i.candidat}`)).toEqual(['q1/alpha', 'q2/beta']);
    expect(pos(r, 'q1', 'beta').evidence).toBe('groupe');
    expect(hors[0]?.message).toMatch(/Proxy A \(pour\) non appliqué : scrutin du 2017-11-28 hors de la période de validité \(à partir du 1er mars 2019\)/);
  });

  it('deux périodes séparées : rien entre les deux, bornes incluses ; motif généré sans proxyMotif', () => {
    const r = run(['2017-12-10', '2017-12-11', '2021-09-30', '2021-10-01']);
    expect(['q1', 'q2', 'q3', 'q4'].map((q) => pos(r, q, 'beta').evidence)).toEqual(['groupe', 'inconnu', 'inconnu', 'groupe']);
    expect(pos(r, 'q2', 'beta').detail).toContain(
      nb("Pas de proxy de groupe à cette date : le proxy de groupe (B) ne s'applique que jusqu'au 10 décembre 2017 et à partir du 1er octobre 2021."),
    );
    // un candidat sans période garde son proxy à toute date
    expect(['q1', 'q2', 'q3', 'q4'].map((q) => pos(r, q, 'delta').evidence)).toEqual(['groupe', 'groupe', 'groupe', 'groupe']);
  });

  it('fin de période : proxy jusqu’au dernier jour inclus, plus rien ensuite', () => {
    const r = run(['2026-03-31', '2026-04-01']);
    expect(pos(r, 'q1', 'gamma').evidence).toBe('groupe');
    expect(pos(r, 'q2', 'gamma').evidence).toBe('inconnu');
  });

  it('les preuves plus fortes restent prioritaires hors période (déclaration, vote nominatif)', () => {
    const r = buildData(
      inputs([{ id: 'q1', date: '2018-04-22', candidats: { beta: voteCand('contre', { groupe: 'B' }) } }], [depuis, trou], {
        q1: researchFile('q1', { alpha: decl('pour') }),
      }),
    );
    expect(pos(r, 'q1', 'alpha')).toMatchObject({ evidence: 'declaration', position: 'pour' });
    expect(pos(r, 'q1', 'beta')).toMatchObject({ evidence: 'vote_an', position: 'contre' });
    expect(codes(r)).not.toContain('proxy-hors-periode');
  });

  it('réserve de la recherche : avertissement sans période, information quand une période a été décidée', () => {
    const reserve = (detail: string) => ({ position: 'inconnu', type: 'groupe', detail, url: 'https://www.example.fr/x' });
    const r = run(['2017-11-28', '2021-05-04'], [depuis, permanent], {
      q1: researchFile('q1', { alpha: reserve('Pas de parti en 2017 : aucun proxy de groupe disponible.'), delta: reserve('Proxy indisponible.') }),
      q2: researchFile('q2', { alpha: reserve('Pas de groupe de son parti en 2021 : pas de proxy.') }),
    });
    const of = (code: string) => r.report.issues.filter((i) => i.code === code).map((i) => `${i.question}/${i.candidat}/${i.severity}`);
    // hors période : écarté, la réserve est mentionnée, pas d'avertissement
    expect(of('proxy-hors-periode')).toEqual(['q1/alpha/info']);
    expect(r.report.issues.find((i) => i.code === 'proxy-hors-periode')?.message).toMatch(/La recherche le juge aussi non pertinent/);
    // dans la période décidée : maintenu, simple information
    expect(of('proxy-conteste-maintenu')).toEqual(['q2/alpha/info']);
    expect(pos(r, 'q2', 'alpha').evidence).toBe('groupe');
    // sans période (aucune décision) : avertissement, comme avant
    expect(of('proxy-conteste')).toEqual(['q1/delta/avertissement']);
  });

  it('la règle de proxy est exportée dans les données (Méthodologie)', () => {
    const r = run(['2020-01-01'], [depuis, permanent]);
    expect(r.data?.candidats.map((c) => c.proxy)).toEqual([
      { groupes: ['A'], periodes: [{ du: '2019-03-01', au: null }], motif: nb(MOTIF) },
      { groupes: ['B'], periodes: [], motif: null },
    ]);
    expect(appDataSchema.safeParse(r.data).success).toBe(true);
  });

  it('candidats.json : périodes invalides refusées (erreur bloquante)', () => {
    for (const proxyPeriodes of [[{ du: '2020-01-01', au: '2019-01-01' }], [{}], [], [{ depuis: '2020-01-01' }], [{ du: '2020-1-1' }]]) {
      const r = buildData(inputs([{ id: 'q1' }], [{ ...candidat('alpha', ['A']), proxyPeriodes } as ReturnType<typeof candidat>]));
      expect(r.data, JSON.stringify(proxyPeriodes)).toBeNull();
      expect(codes(r)).toContain('schema-entree');
    }
    const sansGroupe = buildData(inputs([{ id: 'q1' }], [candidat('alpha', [], null, { proxyPeriodes: [{ du: '2020-01-01' }] })]));
    expect(sansGroupe.data).toBeNull();
  });
});

describe('typographie des textes produits', () => {
  it('espaces insécables autour des guillemets et avant : ; ! ? dans toutes les chaînes', () => {
    const r = buildData(
      inputs([{ id: 'q1' }], [candidat('alpha', ['A']), { ...candidat('beta', ['B']), parti: 'Debout !' }], {
        q1: researchFile(
          'q1',
          { alpha: decl('pour', { citation: 'Nous disons «non» ! Pourquoi ?', detail: 'Interview : « oui »' }) },
          { titre: 'L’autre point de vue : pourquoi « Non » ?', contexte: 'Texte dit « anti-casseurs ».' },
        ),
      }),
    );
    const strings: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === 'string') strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(r.data);
    expect(strings.filter((x) => BREAKABLE_TYPO.test(x))).toEqual([]);
    const q = r.data?.questions[0];
    expect(q?.titre).toBe('L’autre point de vue\u00a0: pourquoi «\u00a0Non\u00a0»\u00a0?');
    expect(pos(r, 'q1', 'alpha').citation).toBe('Nous disons «\u00a0non\u00a0»\u00a0! Pourquoi\u00a0?');
    expect(r.data?.candidats[1]?.parti).toBe('Debout\u00a0!');
    // les URL et identifiants ne sont pas touchés
    expect(pos(r, 'q1', 'alpha').url).toBe('https://www.example.fr/interview');
  });
});

describe('cas particulier : motion de censure (retraites-64)', () => {
  const censure = () =>
    inputs(
      [
        {
          id: 'retraites-64',
          sens: 'motion_censure=non',
          groupes: [groupe('RE', 0, 0, 0, 170, 'pour'), groupe('LFI', 74, 0, 0, 74, 'pour'), groupe('LR', 19, 0, 0, 61, 'pour')],
          candidats: {
            alpha: voteCand('pour', { groupe: 'LFI' }),
            beta: voteCand('absent'),
            gamma: voteCand(null),
            delta: voteCand(null),
            eps: voteCand(null),
          },
        },
      ],
      [candidat('alpha', ['LFI']), candidat('beta', ['LR']), candidat('gamma', ['RE']), candidat('delta', ['LFI']), candidat('eps', ['LR'])],
    );

  it('voter la censure = Non à la réforme (ouiSignifie « contre » par défaut)', () => {
    const r = buildData(censure());
    expect(r.data?.questions[0]?.ouiSignifie).toBe('contre');
    expect(r.data?.questions[0]?.scrutin.censure).toBe(true);
    expect(pos(r, 'retraites-64', 'alpha')).toMatchObject({ evidence: 'vote_an', position: 'pour', stance: 'non' });
    expect(pos(r, 'retraites-64', 'alpha').detail).toMatch(/A voté la motion de censure/);
  });

  it('député en mandat absent des votants = soutien implicite à faible poids, étiqueté', () => {
    const r = buildData(censure());
    expect(pos(r, 'retraites-64', 'beta')).toMatchObject({
      evidence: 'censure_implicite',
      position: 'contre',
      stance: 'oui',
      note: "N'a pas voté la censure",
    });
  });

  it('proxy de groupe : majorité des membres (et non le champ AN, « pour » partout)', () => {
    const r = buildData(censure());
    expect(pos(r, 'retraites-64', 'gamma')).toMatchObject({ evidence: 'groupe', position: 'contre', stance: 'oui' }); // RE : 0/170
    expect(pos(r, 'retraites-64', 'delta')).toMatchObject({ evidence: 'groupe', position: 'pour', stance: 'non' }); // LFI : 74/74
    expect(pos(r, 'retraites-64', 'eps')).toMatchObject({ evidence: 'groupe', position: 'contre', stance: 'oui' }); // LR : 19/61
    expect(r.data?.questions[0]?.groupes.map((g) => g.majoritaire)).toEqual(['contre', 'pour', 'contre']);
  });

  it('une déclaration de la recherche prime sur le soutien implicite', () => {
    const base = censure();
    const r = buildData({ ...base, research: { 'retraites-64': JSON.stringify(researchFile('retraites-64', { beta: decl('pour') }, { ouiSignifie: 'contre' })) } });
    expect(pos(r, 'retraites-64', 'beta')).toMatchObject({ evidence: 'declaration', stance: 'non' });
  });

  it('signale une recherche qui note un membre du gouvernement « pour » la censure', () => {
    const base = censure();
    const r = buildData({
      ...base,
      research: { 'retraites-64': JSON.stringify(researchFile('retraites-64', { gamma: { ...decl('pour'), type: 'gouvernement' } }, { ouiSignifie: 'contre' })) },
    });
    expect(codes(r)).toContain('censure-suspecte');
  });
});

describe('correspondance Oui / Non', () => {
  it('ouiSignifie « contre » de la recherche inverse la traduction, et est signalé', () => {
    const r = buildData(
      inputs([{ id: 'q1', candidats: { alpha: voteCand('pour'), beta: voteCand('contre') } }], undefined, {
        q1: researchFile('q1', {}, { ouiSignifie: 'contre', question: 'Faut-il s’opposer au texte ?' }),
      }),
    );
    expect(pos(r, 'q1', 'alpha').stance).toBe('non');
    expect(pos(r, 'q1', 'beta').stance).toBe('oui');
    expect(r.data?.questions[0]?.question).toBe(nb('Faut-il s’opposer au texte ?'));
    expect(codes(r)).toContain('sens-inverse');
  });

  it('toStance', () => {
    expect(toStance('pour', 'pour')).toBe('oui');
    expect(toStance('contre', 'pour')).toBe('non');
    expect(toStance('pour', 'contre')).toBe('non');
    expect(toStance('abstention', 'contre')).toBe('abstention');
    expect(toStance(null, 'pour')).toBe('inconnu');
  });
});

describe('fichiers de recherche manquants ou invalides', () => {
  it('sans aucune recherche : questions issues de selection/votes, positions AN + proxies', () => {
    const r = buildData(inputs([{ id: 'ordonnances-travail', candidats: { alpha: voteCand('contre') } }, { id: 'q2' }]));
    expect(errorsOf(r)).toEqual([]);
    const q = r.data?.questions[0];
    expect(q).toMatchObject({ recherche: false, titre: 'Ordonnances travail (2017)', question: nb('Question ordonnances-travail ?'), contexte: null });
    expect(q?.arguments).toEqual({ pour: [], contre: [], abstention: [] });
    expect(pos(r, 'ordonnances-travail', 'alpha').evidence).toBe('vote_an');
    expect(pos(r, 'ordonnances-travail', 'beta').evidence).toBe('groupe');
    expect(r.data?.questions[1]?.titre).toMatch(/Question q2/);
    expect(r.report.questionsSansRecherche).toEqual(['ordonnances-travail', 'q2']);
  });

  it('JSON illisible (écriture en cours) : fichier ignoré, avertissement, build valide', () => {
    const r = buildData(inputs([{ id: 'q1' }], undefined, { q1: '{"id": "q1", "titre": ' }));
    expect(errorsOf(r)).toEqual([]);
    expect(codes(r)).toContain('recherche-illisible');
    expect(r.report.fichiersRechercheIgnores).toEqual(['q1.json (illisible)']);
    expect(r.data?.questions[0]?.recherche).toBe(false);
  });

  it('éléments invalides écartés un par un (URL, candidat inconnu), le reste est conservé', () => {
    const file = researchFile(
      'q1',
      { alpha: decl('pour'), inconnu: decl('pour') },
      {
        contexteSources: [
          { titre: 'ok', url: 'https://www.legifrance.gouv.fr/x' },
          { titre: 'ko', url: 'javascript:alert(1)' },
        ],
        argumentsContre: [{ auteur: 'X', resume: 'r', url: 'pas une url' }],
      },
    );
    const r = buildData(inputs([{ id: 'q1' }], undefined, { q1: file }));
    expect(errorsOf(r)).toEqual([]);
    const q = r.data?.questions[0];
    expect(q?.contexteSources).toEqual([{ titre: 'ok', url: 'https://www.legifrance.gouv.fr/x' }]);
    expect(q?.arguments.contre).toEqual([]);
    expect(q?.arguments.pour).toHaveLength(1);
    expect(codes(r)).toEqual(expect.arrayContaining(['url-invalide', 'argument-invalide', 'candidat-inconnu']));
    expect(pos(r, 'q1', 'alpha').evidence).toBe('declaration');
  });

  it('recherche orpheline (sans question) ignorée', () => {
    const r = buildData(inputs([{ id: 'q1' }], undefined, { autre: researchFile('autre') }));
    expect(codes(r)).toContain('recherche-orpheline');
    expect(r.data?.questions).toHaveLength(1);
  });

  it('incohérence selection.json / votes.json : erreur bloquante', () => {
    const base = inputs([{ id: 'q1' }]);
    const votes = (base.votes as { scrutin: string }[]).map((v) => ({ ...v, scrutin: 'VTANR5L16V999' }));
    const r = buildData({ ...base, votes });
    expect(codes(r)).toContain('scrutin-different');
    expect(errorsOf(r).length).toBeGreaterThan(0);
  });

  it('votes.json invalide : erreur de schéma, pas de données', () => {
    const r = buildData({ ...inputs([{ id: 'q1' }]), votes: [{ id: 'q1' }] });
    expect(r.data).toBeNull();
    expect(codes(r)).toContain('schema-entree');
  });

  it('le fichier produit respecte le schéma de sortie', () => {
    const r = buildData(
      inputs([{ id: 'q1', candidats: { alpha: voteCand('pour') } }], undefined, { q1: researchFile('q1', { beta: decl('contre') }) }),
    );
    expect(appDataSchema.safeParse(r.data).success).toBe(true);
    expect(r.data?.candidats.map((c) => c.tri)).toEqual(['Alpha', 'Beta']);
  });
});

describe('groupMajority', () => {
  it('scrutin ordinaire : position la plus fréquente, égalité arbitrée par le champ AN, null sans suffrage', () => {
    expect(groupMajority({ membres: 10, pour: 1, contre: 5, abstention: 2, majoritaire: 'pour' }, false)).toBe('contre');
    expect(groupMajority({ membres: 21, pour: 8, contre: 8, abstention: 5, majoritaire: 'pour' }, false)).toBe('pour');
    expect(groupMajority({ membres: 21, pour: 8, contre: 8, abstention: 5, majoritaire: 'abstention' }, false)).toBeNull();
    expect(groupMajority({ membres: 5, pour: 0, contre: 0, abstention: 0, majoritaire: 'pour' }, false)).toBeNull();
  });
  it('motion de censure : plus de la moitié des membres', () => {
    expect(groupMajority({ membres: 20, pour: 18, contre: 0, abstention: 0, majoritaire: 'pour' }, true)).toBe('pour');
    expect(groupMajority({ membres: 61, pour: 19, contre: 0, abstention: 0, majoritaire: 'pour' }, true)).toBe('contre');
  });
});

describe('attribution des propos (round 3)', () => {
  const groupArg = {
    position: 'pour',
    type: 'vote_an',
    detail: "Pas d'intervention personnelle retrouvée : argument = explication de vote de son groupe A (Paul Orateur).",
    argument: '(Groupe A) Un argument du groupe.',
    citation: 'Mots prononcés en séance.',
    url: 'https://www.assemblee-nationale.fr/dyn/16/comptes-rendus/seance/cr1',
    date: '2023-03-20',
  };
  const base = (attributions?: unknown) => ({
    ...inputs([{ id: 'q1', candidats: { alpha: voteCand('pour', { groupe: 'A' }), beta: voteCand('contre', { groupe: 'B' }) } }], undefined, {
      q1: researchFile('q1', { alpha: groupArg, beta: decl('contre') }),
    }),
    attributions: attributions === undefined ? null : JSON.stringify(attributions),
  });

  it('attributions.json : orateur ≠ candidat → propos de son groupe, auteur et groupe du vote, listés au rapport', () => {
    const r = buildData(base({ 'q1/alpha': { trouve: true, orateur: 'M. Paul Orateur', estLeCandidat: false } }));
    expect(errorsOf(r)).toEqual([]);
    expect(pos(r, 'q1', 'alpha').attribution).toEqual({
      duCandidat: false,
      porteur: 'groupe',
      orateur: 'Paul Orateur',
      groupe: 'A',
      verification: 'compte-rendu',
    });
    // la position elle-même ne change pas
    expect(pos(r, 'q1', 'alpha')).toMatchObject({ evidence: 'vote_an', position: 'pour', argument: '(Groupe A) Un argument du groupe.' });
    expect(r.report.attributionsLues).toBe(true);
    expect(r.report.proposDeTiers).toEqual([
      { question: 'q1', candidat: 'alpha', porteur: 'groupe', orateur: 'Paul Orateur', groupe: 'A', verification: 'compte-rendu', citation: true },
    ]);
    // déclaration sans indication : attribution inconnue ; pas d'argument : null
    expect(pos(r, 'q1', 'beta').attribution).toMatchObject({ duCandidat: null, verification: null });
    expect(appDataSchema.safeParse(r.data).success).toBe(true);
  });

  it('attributions.json absent : la recherche suffit à signaler l’argument de groupe', () => {
    const r = buildData(base());
    expect(r.report.attributionsLues).toBe(false);
    expect(pos(r, 'q1', 'alpha').attribution).toMatchObject({ duCandidat: false, orateur: 'Paul Orateur', groupe: 'A', verification: 'recherche' });
  });

  it('attributions.json : orateur = candidat → ses propos', () => {
    const r = buildData(base({ 'q1/alpha': { trouve: true, orateur: 'M. Prénom Alpha', estLeCandidat: true } }));
    expect(pos(r, 'q1', 'alpha').attribution).toMatchObject({ duCandidat: true, porteur: null, verification: 'compte-rendu' });
    expect(codes(r)).toContain('attribution-divergente');
  });

  it('entrées orphelines ou sans citation signalées, fichier illisible toléré', () => {
    const r = buildData(
      base({
        'q9/alpha': { trouve: true, orateur: 'M. X Y', estLeCandidat: false },
        'q1/beta': { trouve: true, orateur: 'M. X Y', estLeCandidat: false },
      }),
    );
    expect(codes(r)).toEqual(expect.arrayContaining(['attribution-orpheline']));
    // beta a une citation (decl) : l'entrée est utilisée
    expect(pos(r, 'q1', 'beta').attribution).toMatchObject({ duCandidat: false, orateur: 'X Y', groupe: 'B' });
    const ill = buildData({ ...base(), attributions: '{"q1/alpha": ' });
    expect(errorsOf(ill)).toEqual([]);
    expect(codes(ill)).toContain('attributions-invalides');
    expect(pos(ill, 'q1', 'alpha').attribution?.verification).toBe('recherche');
  });

  it('pas d’argument ni de citation : attribution null (schéma)', () => {
    const r = buildData(inputs([{ id: 'q1' }]));
    expect(pos(r, 'q1', 'alpha').attribution).toBeNull();
  });
});

describe('précision de la recherche et proxies (round 3)', () => {
  it('sans proxy appliqué, une précision citant un vote de groupe est masquée ; avec proxy, elle reste', () => {
    const detail = 'PROXY : le groupe A a voté pour (10 pour, 2 contre).';
    const r = buildData(
      inputs([{ id: 'q1', candidats: { alpha: voteCand('pour', { groupe: 'A' }) } }], [candidat('alpha', ['A']), candidat('beta', ['B'])], {
        q1: researchFile('q1', {
          alpha: { position: 'pour', type: 'groupe', detail, url: 'https://www.example.fr/x' },
          beta: { position: 'contre', type: 'groupe', detail: 'PROXY : le groupe B a voté contre.', url: 'https://www.example.fr/x' },
        }),
      }),
    );
    expect(pos(r, 'q1', 'alpha')).toMatchObject({ evidence: 'vote_an', commentaire: null });
    expect(r.report.issues.filter((i) => i.code === 'precision-masquee').map((i) => i.candidat)).toEqual(['alpha']);
    expect(pos(r, 'q1', 'beta')).toMatchObject({ evidence: 'groupe', commentaire: 'PROXY : le groupe B a voté contre.' });
  });

  it('proxy hors période : la précision « PROXY : … » n’est plus affichée', () => {
    const c = candidat('alpha', ['A'], null, { proxyPeriodes: [{ du: '2019-03-01' }] });
    const r = buildData(
      inputs([{ id: 'q1', date: '2017-11-28' }], [c], {
        q1: researchFile('q1', { alpha: { position: 'pour', type: 'groupe', detail: 'Proxy : le groupe A a voté pour.', url: 'https://www.example.fr/x' } }),
      }),
    );
    expect(pos(r, 'q1', 'alpha')).toMatchObject({ evidence: 'inconnu', commentaire: null });
  });

  it('une précision sans vote de groupe reste affichée', () => {
    const r = buildData(
      inputs([{ id: 'q1', candidats: { alpha: voteCand('pour', { groupe: 'A' }) } }], undefined, {
        q1: researchFile('q1', { alpha: { ...decl('pour'), type: 'vote_an', detail: 'Vote nominatif ; alors membre du groupe A.' } }),
      }),
    );
    expect(pos(r, 'q1', 'alpha').commentaire).toBe('Vote nominatif ; alors membre du groupe A.');
  });

  it('proxy maintenu malgré une réserve de la recherche : appliqué et étiqueté', () => {
    const c = candidat('alpha', ['A'], null, { proxyPeriodes: [{ du: '2019-03-01' }] });
    const r = buildData(
      inputs([{ id: 'q1', date: '2021-05-04' }], [c], {
        q1: researchFile('q1', { alpha: { position: 'inconnu', type: 'groupe', detail: 'Pas de groupe de son parti : pas de proxy.', url: 'https://www.example.fr/x' } }),
      }),
    );
    expect(pos(r, 'q1', 'alpha')).toMatchObject({ evidence: 'groupe', note: 'Proxy maintenu malgré une réserve de la recherche' });
    expect(pos(r, 'q1', 'alpha').commentaire).toMatch(/pas de proxy/);
  });
});

describe('version « En clair » (round 3)', () => {
  const fiche = (id: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      id,
      questionSimple: 'Faut-il une question simple ?',
      enBref: 'Ce que change le texte.',
      pourquoiPour: 'Les partisans disent ceci, en une phrase.',
      pourquoiContre: 'Les opposants disent cela, en une phrase.',
      ceQuiSestPasse: 'Adopté puis promulgué.',
      lexique: [{ terme: '49.3', definition: 'Adoption sans vote, sauf censure.' }],
      ...extra,
    });

  it('fichier valide fusionné, typographie appliquée ; question sans fiche : null et listée', () => {
    const r = buildData({ ...inputs([{ id: 'q1' }, { id: 'q2' }]), simple: { q1: fiche('q1') } });
    expect(errorsOf(r)).toEqual([]);
    expect(r.data?.questions[0]?.enClair).toEqual({
      questionSimple: 'Faut-il une question simple ?',
      enBref: 'Ce que change le texte.',
      pourquoiPour: 'Les partisans disent ceci, en une phrase.',
      pourquoiContre: 'Les opposants disent cela, en une phrase.',
      ceQuiSestPasse: 'Adopté puis promulgué.',
      lexique: [{ terme: '49.3', definition: 'Adoption sans vote, sauf censure.' }],
    });
    expect(r.data?.questions[1]?.enClair).toBeNull();
    expect(r.report.enClairManquants).toEqual(['q2']);
    expect(appDataSchema.safeParse(r.data).success).toBe(true);
  });

  it('fichier illisible ou incomplet : ignoré (affichage d’origine), avertissement', () => {
    const r = buildData({
      ...inputs([{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }]),
      simple: { q1: '{"id": "q1", ', q2: fiche('q2', { enBref: '  ' }), q3: fiche('autre') },
    });
    expect(errorsOf(r)).toEqual([]);
    expect(r.data?.questions.map((q) => q.enClair === null)).toEqual([true, true, false]);
    expect(codes(r)).toEqual(expect.arrayContaining(['en-clair-illisible', 'en-clair-incomplet', 'en-clair-id']));
    expect(r.report.enClairManquants).toEqual(['q1', 'q2']);
  });

  it('lexique : entrée invalide écartée, le reste conservé ; fichier orphelin ignoré', () => {
    const r = buildData({
      ...inputs([{ id: 'q1' }]),
      simple: { q1: fiche('q1', { lexique: [{ terme: 'CMP' }, { terme: 'IFI', definition: 'Impôt sur la fortune immobilière.' }] }), q9: fiche('q9') },
    });
    expect(r.data?.questions[0]?.enClair?.lexique).toEqual([{ terme: 'IFI', definition: 'Impôt sur la fortune immobilière.' }]);
    expect(codes(r)).toEqual(expect.arrayContaining(['en-clair-lexique', 'en-clair-orphelin']));
  });

  it('contrôles du brief signalés sans bloquer : longueur, équilibre des camps, lexique', () => {
    const r = buildData({
      ...inputs([{ id: 'q1' }]),
      simple: {
        q1: fiche('q1', {
          questionSimple: 'Faut-il ' + 'vraiment '.repeat(20) + 'voter ?',
          pourquoiPour: 'Court.',
          lexique: [1, 2, 3, 4].map((n) => ({ terme: `T${n}`, definition: 'Déf.' })),
        }),
      },
    });
    const info = r.report.issues.filter((i) => i.code.startsWith('en-clair')).map((i) => `${i.code}/${i.severity}`);
    expect(info).toEqual(['en-clair-longueur/info', 'en-clair-equilibre/info', 'en-clair-lexique/info']);
    expect(r.data?.questions[0]?.enClair).not.toBeNull();
  });
});
