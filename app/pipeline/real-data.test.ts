// Test d'intégration sur les vraies données du dépôt (../data) : invariants du pipeline.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cleMemeDecision,
  compteursCarte,
  FAMILLES,
  isFamille,
  niveau,
  pageJustice,
  passifCarte,
  periodeDecision,
} from '../src/lib/justice';
import { BREAKABLE_TYPO } from '../src/lib/typo';
import { selectQuick } from '../src/lib/quick';
import { rankCandidates } from '../src/lib/scoring';
import { decodeAnswers, encodeAnswers } from '../src/lib/share';
import { buildData } from './build';
import { NOT_RESEARCH } from './research';
import { GROUP_VOTE_MENTION, proxyActif } from './resolve';
import { appDataSchema, candidatsSchema } from './schemas';

const DATA = resolve(import.meta.dirname, '..', '..', 'data');
const readJson = (p: string): unknown => JSON.parse(readFileSync(join(DATA, p), 'utf8'));

describe.runIf(existsSync(join(DATA, 'build', 'votes.json')))('données réelles', () => {
  const votes = readJson('build/votes.json') as { id: string; candidats: Record<string, { position: string | null }> }[];
  const research: Record<string, string> = {};
  for (const f of readdirSync(join(DATA, 'research')))
    if (f.endsWith('.json') && !NOT_RESEARCH.has(f)) research[f.slice(0, -5)] = readFileSync(join(DATA, 'research', f), 'utf8');
  const simple: Record<string, string> = {};
  const simpleDir = join(DATA, 'research', 'simple');
  if (existsSync(simpleDir))
    for (const f of readdirSync(simpleDir)) if (f.endsWith('.json')) simple[f.slice(0, -5)] = readFileSync(join(simpleDir, f), 'utf8');
  const attributionsPath = join(DATA, 'research', 'attributions.json');
  const attributions = existsSync(attributionsPath) ? readFileSync(attributionsPath, 'utf8') : null;
  // Fiches partis (data/justice/) présentes au moment du test : chacune est facultative.
  const justiceDir = join(DATA, 'justice');
  const lireDossier = (dir: string) => {
    const out: Record<string, { content: string; modifieLe: string | null }> = {};
    if (existsSync(dir))
      for (const f of readdirSync(dir)) if (f.endsWith('.json')) out[f.slice(0, -5)] = { content: readFileSync(join(dir, f), 'utf8'), modifieLe: null };
    return out;
  };
  const justice = lireDossier(justiceDir);
  // appartenance actuelle et anciens membres (round 7), facultatifs
  const justiceMembres = lireDossier(join(justiceDir, 'membres'));
  const justiceAnciens = lireDossier(join(justiceDir, 'anciens'));

  const run = (withResearch: boolean, withAttributions = true, approfondi: { selection: string | null; votes: string | null } | null = null) =>
    buildData({
      selection: readJson('selection.json'),
      votes,
      candidats: readJson('candidats.json'),
      research: withResearch ? research : {},
      simple: withResearch ? simple : {},
      attributions: withResearch && withAttributions ? attributions : null,
      justice: withResearch ? justice : {},
      justiceMembres: withResearch ? justiceMembres : {},
      justiceAnciens: withResearch ? justiceAnciens : {},
      selectionApprofondi: approfondi?.selection ?? null,
      votesApprofondi: approfondi?.votes ?? null,
      collecteAN: null,
      now: new Date(),
    });

  for (const withResearch of [true, false]) {
    describe(withResearch ? 'avec la recherche disponible' : 'sans aucun fichier de recherche', () => {
      const { data, report } = run(withResearch);

      it('aucune erreur bloquante et schéma de sortie respecté', () => {
        expect(report.issues.filter((i) => i.severity === 'erreur')).toEqual([]);
        expect(appDataSchema.safeParse(data).success).toBe(true);
        expect(data?.questions).toHaveLength(33);
      });

      it('chaque question a une position (éventuellement inconnue) pour les 14 candidats', () => {
        for (const q of data?.questions ?? []) expect(Object.keys(q.candidats)).toHaveLength(14);
      });

      it('les votes nominatifs officiels sont repris tels quels (le vote officiel prime)', () => {
        for (const v of votes) {
          const q = data?.questions.find((x) => x.id === v.id);
          for (const [cid, c] of Object.entries(v.candidats)) {
            if (c.position === 'pour' || c.position === 'contre' || c.position === 'abstention') {
              expect(q?.candidats[cid]?.position, `${v.id}/${cid}`).toBe(c.position);
              expect(['vote_an', 'vote_congres']).toContain(q?.candidats[cid]?.evidence);
            }
          }
        }
      });

      it('proxies datés : appliqués seulement dans les périodes de candidats.json', () => {
        const cands = candidatsSchema.parse(readJson('candidats.json'));
        for (const q of data?.questions ?? [])
          for (const [cid, p] of Object.entries(q.candidats))
            if (p.evidence === 'groupe') {
              const c = cands.find((x) => x.id === cid);
              expect(c && proxyActif(c, q.scrutin.date), `${q.id}/${cid}`).toBe(true);
            }
        // décisions éditoriales (round 2)
        const proxy = (cid: string) =>
          (data?.questions ?? []).filter((q) => q.candidats[cid]?.evidence === 'groupe').map((q) => q.scrutin.date);
        expect(proxy('glucksmann').every((d) => d >= '2019-03-01')).toBe(true);
        expect(proxy('glucksmann').length).toBeGreaterThan(0);
        expect(proxy('bertrand').every((d) => d < '2017-12-11' || d >= '2021-10-01')).toBe(true);
        expect(proxy('bertrand').some((d) => d < '2017-12-11')).toBe(true);
        expect(proxy('lisnard').every((d) => d <= '2026-03-31')).toBe(true);
        expect(report.issues.filter((i) => i.code === 'proxy-conteste')).toEqual([]);
      });

      it('aucun guillemet ni ponctuation haute précédé ou suivi d’une espace sécable', () => {
        const bad: string[] = [];
        const walk = (v: unknown): void => {
          if (typeof v === 'string') {
            if (BREAKABLE_TYPO.test(v)) bad.push(v);
          } else if (Array.isArray(v)) v.forEach(walk);
          else if (v && typeof v === 'object') Object.values(v).forEach(walk);
        };
        walk(data);
        expect(bad).toEqual([]);
      });

      it('retraites-64 : voter la censure = Non', () => {
        const q = data?.questions.find((x) => x.id === 'retraites-64');
        expect(q?.scrutin.censure).toBe(true);
        expect(q?.candidats.lepen).toMatchObject({ position: 'pour', stance: 'non', evidence: 'vote_an' });
      });
    });
  }

  describe.runIf(attributions !== null)('attribution des citations (attributions.json)', () => {
    const checks = JSON.parse(attributions ?? '{}') as Record<string, { trouve: boolean; orateur: string | null; estLeCandidat: boolean | null }>;
    const { data, report } = run(true);
    const at = (key: string) => {
      const [q, c] = key.split('/');
      return data?.questions.find((x) => x.id === q)?.candidats[c ?? '']?.attribution;
    };

    it('LPM 2023 : la citation affichée sous Marine Le Pen est attribuée à Laurent Jacobelli', () => {
      expect(at('lpm-2024-2030/lepen')).toEqual({
        duCandidat: false,
        porteur: 'groupe',
        orateur: 'Laurent Jacobelli',
        groupe: 'RN',
        verification: 'compte-rendu',
      });
    });

    it('chaque citation prononcée par un autre député est signalée comme telle, avec son auteur', () => {
      const autres = Object.entries(checks).filter(([, v]) => v.trouve && v.estLeCandidat === false);
      expect(autres.length).toBeGreaterThan(0);
      for (const [key] of autres) {
        expect(at(key), key).toMatchObject({ duCandidat: false, porteur: 'groupe', verification: 'compte-rendu' });
        expect(at(key)?.orateur, key).toMatch(/^\p{Lu}/u);
        expect(at(key)?.orateur, key).not.toMatch(/^(M\.|Mme)\s|!/);
      }
      for (const [key] of Object.entries(checks).filter(([, v]) => v.trouve && v.estLeCandidat === true))
        expect(at(key)?.duCandidat, key).toBe(true);
    });

    it('sans attributions.json, la recherche suffit à signaler ces mêmes citations', () => {
      const sans = run(true, false).data;
      for (const [key] of Object.entries(checks).filter(([, v]) => v.trouve && v.estLeCandidat === false)) {
        const [q, c] = key.split('/');
        expect(sans?.questions.find((x) => x.id === q)?.candidats[c ?? '']?.attribution?.duCandidat, key).toBe(false);
      }
    });

    it('aucun écart entre le compte rendu et la recherche, aucune entrée orpheline', () => {
      expect(report.issues.filter((i) => i.code.startsWith('attribution'))).toEqual([]);
      expect(report.proposDeTiers.filter((p) => p.verification === 'compte-rendu')).toHaveLength(
        Object.values(checks).filter((v) => v.trouve && v.estLeCandidat === false).length,
      );
    });
  });

  describe('round 4 : partis et condamnations', () => {
    const { data, report } = run(true);
    const PARTIS = ['rn', 'lfi', 'debout', 'ps', 'place-publique', 'ecologistes', 'generation-ecologie', 'renaissance', 'horizons', 'lr', 'nous-france', 'nouvelle-energie', 'reconquete', 'dlf', 'pcf'];

    it('chaque candidat est rattaché à son ou ses partis (15 partis)', () => {
      expect(data?.partis.map((p) => p.id).sort()).toEqual([...PARTIS].sort());
      const partis = (id: string) => data?.candidats.find((c) => c.id === id)?.partis;
      expect(partis('glucksmann')).toEqual(['place-publique', 'ps']);
      expect(partis('bertrand')).toEqual(['nous-france', 'lr']);
      for (const c of data?.candidats ?? []) if (!['glucksmann', 'bertrand'].includes(c.id)) expect(c.partis, c.id).toHaveLength(1);
      expect(report.issues.filter((i) => i.code === 'justice-orphelin' || (i.code === 'parti-nom' && i.severity !== 'info'))).toEqual([]);
    });

    it('fichiers présents lus ; absents « en cours de documentation » ; aucune erreur bloquante', () => {
      expect(report.issues.filter((i) => i.severity === 'erreur')).toEqual([]);
      for (const p of data?.partis ?? []) {
        if (justice[p.id]) expect(report.justice.partis.find((x) => x.id === p.id)?.fichier, p.id).not.toBe('absent');
        else expect(p.fiche, p.id).toBeNull();
      }
    });

    it('chaque condamnation affichée a au moins une source http(s) avec citation, un statut et une date valides', () => {
      for (const p of data?.partis ?? [])
        for (const c of p.fiche?.condamnations ?? []) {
          expect(c.sources.length, c.id).toBeGreaterThan(0);
          for (const s of c.sources) {
            expect(s.url, c.id).toMatch(/^https?:\/\/[^/]+\.[^/]+/);
            expect(s.citations.length, c.id).toBeGreaterThan(0);
            for (const q of s.citations) expect(q.trim().length, c.id).toBeGreaterThan(0);
          }
          expect(['definitive', 'appel_en_cours', 'pourvoi_en_cours', 'inconnu']).toContain(c.statut);
          expect(c.dateDecision, c.id).toMatch(/^\d{4}(-\d{2}(-\d{2})?)?$/);
          expect(periodeDecision(c.dateDecision), c.id).not.toBeNull();
        }
    });

    it('round 5 : une date partielle (AAAA, AAAA-MM) n’est jamais un motif de rejet', () => {
      for (const r of report.justice.rejets)
        for (const m of r.motifs) expect(m, `${r.parti}[${String(r.index)}]`).not.toMatch(/dateDecision « \d{4}(-(0[1-9]|1[0-2]))? »/);
    });

    it('round 6 : famille de chaque condamnation = champ du fichier (« autres » s’il est absent ou invalide)', () => {
      for (const p of data?.partis ?? []) {
        const f = justice[p.id];
        if (!f || !p.fiche) continue;
        const raw = (JSON.parse(f.content) as { condamnations?: { famille?: unknown }[] }).condamnations ?? [];
        const anciens = justiceAnciens[p.id];
        const rawA = anciens ? ((JSON.parse(anciens.content) as { condamnations?: { famille?: unknown }[] }).condamnations ?? []) : [];
        for (const c of p.fiche.condamnations) {
          const a = /-ancien-(\d+)$/.exec(c.id);
          const attendu = a ? rawA[Number(a[1])]?.famille : raw[Number(c.id.slice(p.id.length + 1))]?.famille;
          expect(FAMILLES, c.id).toContain(c.famille);
          expect(c.famille, c.id).toBe(isFamille(attendu) ? attendu : 'autres');
        }
      }
    });

    it('round 6-7 : page de chaque candidat — synthèse par famille = niveau 1, passif à part, ordre de gravité', () => {
      for (const c of data?.candidats ?? []) {
        if (!data) break;
        const page = pageJustice(data, c);
        expect(page.synthese.map((l) => l.famille), c.id).toEqual([...FAMILLES]);
        expect(page.synthese.reduce((n, l) => n + l.total, 0), c.id).toBe(page.total);
        expect(page.synthese.reduce((n, l) => n + l.passif, 0), c.id).toBe(page.passif.total);
        // recompte indépendant depuis les fiches : décisions distinctes (au jour près) du candidat et des membres, par niveau
        const fiches = c.partis.flatMap((id) => data.partis.find((p) => p.id === id)?.fiche?.condamnations ?? []);
        for (const l of page.synthese) {
          const distinctes = (pred: (k: (typeof fiches)[number]) => boolean) =>
            new Set(fiches.filter((k) => k.famille === l.famille && pred(k)).map((k) => cleMemeDecision(k) ?? k.id)).size;
          expect(l.candidat, `${c.id}/${l.famille}`).toBe(distinctes((k) => k.candidat === c.id));
          expect(l.parti, `${c.id}/${l.famille}`).toBe(distinctes((k) => k.candidat === null && k.categorie === 'parti' && niveau(k) === 1));
          expect(l.membres, `${c.id}/${l.famille}`).toBe(distinctes((k) => k.candidat === null && k.categorie !== 'parti' && niveau(k) === 1));
          expect(l.passif, `${c.id}/${l.famille}`).toBe(distinctes((k) => k.candidat === null && niveau(k) === 2));
        }
        const ids = page.familles.flatMap((g) => g.sousGroupes.flatMap((s) => s.items.map((k) => k.id)));
        expect(ids.length, c.id).toBe(page.total);
        const passif = page.passif.familles.flatMap((g) => g.personnes.flatMap((x) => x.items.map((k) => k.id)));
        expect(passif.length, c.id).toBe(page.passif.total);
        expect(new Set([...ids, ...passif]).size, c.id).toBe(ids.length + passif.length);
      }
    });

    it('round 7 : appartenance de chaque condamnation = membres/ (chaîne exacte) ou bloc de anciens/ ; niveaux', () => {
      const statutsMembres = new Map<string, string>();
      for (const [id, f] of Object.entries(justiceMembres))
        for (const p of (JSON.parse(f.content) as { personnes: { personne: string; statutMembre: string }[] }).personnes)
          statutsMembres.set(`${id}|${p.personne}`, p.statutMembre);
      for (const p of data?.partis ?? [])
        for (const c of p.fiche?.condamnations ?? []) {
          if (c.categorie === 'ancien_membre') {
            expect(niveau(c), c.id).toBe(2);
            expect(c.candidat, c.id).toBeNull();
            continue;
          }
          // toutes les personnes des fiches sont documentées dans membres/ (aucun statut « inconnu » par défaut)
          expect(c.appartenance.statut, c.id).toBe(statutsMembres.get(`${p.id}|${c.personne}`));
          if (c.candidat !== null) expect(niveau(c), c.id).toBe(1);
        }
      expect(report.issues.filter((i) => i.code.startsWith('appartenance-') && i.severity !== 'info')).toEqual([]);
      const condamnations = (data?.partis ?? []).flatMap((p) => p.fiche?.condamnations ?? []);
      const de = (personne: string) => condamnations.filter((c) => c.personne.startsWith(personne));
      // retirés sans adhésion confirmée (choix de l'utilisateur) : niveau 2 ; le RN (personne morale) : niveau 1
      for (const nom of ['Sarkozy Nicolas', 'Fillon François', 'Harlem Désir', 'Adrien Quatennens'])
        for (const c of de(nom)) expect([c.appartenance.statut, niveau(c)], c.id).toEqual(['retire', 2]);
      for (const c of de('Rassemblement national (personne morale')) expect([c.appartenance.statut, niveau(c)], c.id).toEqual(['personne_morale', 1]);
      for (const c of de('Le Pen Jean-Marie')) expect([c.appartenance.statut, niveau(c)], c.id).toEqual(['decede', 2]);
      // le soutien public de la direction LR à Nicolas Sarkozy est repris (affiché au niveau 2)
      expect(de('Sarkozy Nicolas')[0]?.appartenance.reactionParti).toMatch(/soutien/);
    });

    it('round 7 : cartes « Partis & candidats » — compteurs niveau 1 seulement, (+N anciens) = passif', () => {
      for (const c of data?.candidats ?? []) {
        if (!data) break;
        const page = pageJustice(data, c);
        const n1 = compteursCarte(page.synthese).reduce((n, k) => n + k.n, 0);
        expect(n1, c.id).toBe(page.total);
        expect(passifCarte(page.synthese), c.id).toBe(page.passif.total);
        expect(passifCarte(page.synthese, true), c.id).toBe(page.passif.familles[0]?.total);
      }
    });

    it('aucune condamnation ne disparaît sans être listée : affichées + rejetées = entrées de la fiche et de anciens/', () => {
      const entrees = (f: { content: string } | undefined) => {
        const raw = f ? (JSON.parse(f.content) as { condamnations?: unknown }) : {};
        return Array.isArray(raw.condamnations) ? raw.condamnations.length : 0;
      };
      for (const [id, f] of Object.entries(justice)) {
        let n: number;
        try {
          n = entrees(f) + entrees(justiceAnciens[id]);
        } catch {
          continue;
        }
        const bilan = report.justice.partis.find((x) => x.id === id);
        if (bilan) expect(bilan.affichees + bilan.rejetees, id).toBe(n);
      }
    });
  });

  describe('round 3 : version « En clair » et précisions', () => {
    const { data, report } = run(true);

    it('les 33 questions ont une fiche « En clair » ; retraites-64 : Oui = favorable à la réforme', () => {
      expect(report.enClairManquants).toEqual([]);
      expect(data?.questions.every((q) => q.enClair !== null)).toBe(true);
      const r64 = data?.questions.find((q) => q.id === 'retraites-64');
      expect(r64?.ouiSignifie).toBe('contre');
      expect(r64?.enClair?.questionSimple).toMatch(/64 ans/);
      expect(r64?.enClair?.pourquoiPour).toMatch(/défenseurs/);
    });

    it('sans proxy appliqué, aucune précision affichée ne cite un vote de groupe', () => {
      for (const q of data?.questions ?? [])
        for (const [cid, p] of Object.entries(q.candidats))
          if (p.evidence !== 'groupe' && p.commentaire) expect(GROUP_VOTE_MENTION.test(p.commentaire), `${q.id}/${cid}`).toBe(false);
    });

    it('les trois proxies maintenus malgré une réserve restent appliqués et étiquetés', () => {
      const maintenus = report.issues.filter((i) => i.code === 'proxy-conteste-maintenu').map((i) => `${i.question}/${i.candidat}`);
      expect(maintenus.sort()).toEqual(['climat-resilience/glucksmann', 'legitime-defense-policiers/bertrand', 'lpm-2024-2030/glucksmann']);
      for (const key of maintenus) {
        const [q, c] = key.split('/');
        expect(data?.questions.find((x) => x.id === q)?.candidats[c ?? '']).toMatchObject({
          evidence: 'groupe',
          note: 'Proxy maintenu malgré une réserve de la recherche',
        });
      }
    });
  });

  // ------------------------------------------------------------ round 8 : mode approfondi
  describe('parcours principal inchangé (non-régression du round 8)', () => {
    const { data } = run(true);
    const questions = data?.questions ?? [];

    it('les 33 questions, dans l’ordre de selection.json (ordre qui fonde le lien de partage)', () => {
      const selection = readJson('selection.json') as { id: string }[];
      expect(questions.map((q) => q.id)).toEqual(selection.map((s) => s.id));
      expect(questions).toHaveLength(33);
    });

    it('sélection du mode rapide identique (15 questions)', () => {
      expect(selectQuick(questions, data?.themes ?? [], 15).map((q) => q.id)).toEqual([
        'ordonnances-travail', 'isf-ifi', 'asile-immigration-2018', 'ceta', 'neonicotinoides-2020', 'securite-globale', 'separatisme',
        'pma-pour-toutes', 'pass-vaccinal', 'retraites-64', 'nucleaire-2023', 'anti-squat', 'rsa-15h', 'ukraine-accord', 'nouvelle-caledonie-2024',
      ]);
    });

    // Classements relevés avant le round 8 (données du commit 05f5991) pour deux liens déjà partageables :
    // un lien partagé donne le même résultat. À mettre à jour seulement si les votes ou la recherche des 33 questions changent.
    it('liens de partage existants : même décodage, même classement', () => {
      if (!data) throw new Error('données absentes');
      const a = decodeAnswers(questions, 'onp'.repeat(11));
      expect(Object.keys(a ?? {})).toEqual(questions.map((q) => q.id));
      expect(encodeAnswers(questions, a ?? {})).toBe('onp'.repeat(11));
      const r = rankCandidates(data, questions, a ?? {});
      expect(r.classes.map((s) => [s.candidatId, Math.round((s.score ?? 0) * 1000)])).toEqual([
        ['retailleau', 613], ['lepen', 595], ['philippe', 559], ['dupontaignan', 556], ['lisnard', 536], ['attal', 493], ['tondelier', 481],
        ['bertrand', 474], ['melenchon', 446], ['ruffin', 432], ['roussel', 418], ['batho', 412], ['glucksmann', 357], ['zemmour', 333],
      ]);
      const b = decodeAnswers(questions, 'oonnpo_on');
      const r2 = rankCandidates(data, questions, b ?? {}, { votesSeulement: true });
      expect(r2.classes.map((s) => [s.candidatId, Math.round((s.score ?? 0) * 1000)])).toEqual([
        ['attal', 667], ['batho', 583], ['lepen', 571], ['dupontaignan', 500], ['retailleau', 500], ['roussel', 500], ['melenchon', 429], ['ruffin', 429],
      ]);
      expect(r2.insuffisants.map((s) => s.candidatId)).toEqual(['bertrand', 'glucksmann', 'lisnard', 'philippe', 'tondelier', 'zemmour']);
    });
  });

  const FIXTURE = resolve(import.meta.dirname, 'fixtures', 'approfondi');
  describe.runIf(existsSync(join(FIXTURE, 'votes-approfondi.json')))('mode approfondi : fixture sur les vraies données', () => {
    const fixture = {
      selection: readFileSync(join(FIXTURE, 'selection-approfondi.json'), 'utf8'),
      votes: readFileSync(join(FIXTURE, 'votes-approfondi.json'), 'utf8'),
    };
    const sans = run(true);
    const avec = run(true, true, fixture);

    it('aucune erreur, parcours principal strictement identique, bilan principal inchangé', () => {
      expect(avec.report.issues.filter((i) => i.severity === 'erreur')).toEqual([]);
      expect(appDataSchema.safeParse(avec.data).success).toBe(true);
      expect(avec.data?.questions).toEqual(sans.data?.questions);
      expect(avec.data?.themes).toEqual(sans.data?.themes);
      expect(avec.report.issues.length).toBe(sans.report.issues.length);
      expect(avec.report.preuves).toEqual(sans.report.preuves);
    });

    it('catégories proposées, questions existantes reprises, entrées invalides écartées', () => {
      expect(avec.data?.approfondi?.categories.map((c) => [c.id, c.questions.length])).toEqual([
        ['economie-travail', 21],
        ['immigration', 11],
      ]);
      expect(avec.report.approfondi.ecartees.map((e) => e.id)).toEqual(['fx-categorie-inconnue', 'fx-scrutin-invalide']);
      expect(avec.report.approfondi.categories.find((c) => c.id === 'defense-international')).toMatchObject({ questions: 4, proposee: false });
      const eco = avec.data?.approfondi?.categories[0];
      expect(eco?.questions.filter((r) => r.existant).map((r) => r.id)).toEqual([
        'ordonnances-travail', 'pouvoir-achat-2022', 'assurance-chomage-2022', 'rsa-15h', 'arcelormittal',
      ]);
      // une question existante n'est jamais recopiée dans le fichier de la catégorie
      const fichier = avec.categories.find((c) => c.categorie === 'economie-travail');
      expect(fichier?.questions.some((q) => q.id === 'ordonnances-travail')).toBe(false);
      expect(fichier?.questions).toHaveLength(16);
    });

    it('extract_votes.py --approfondi : même extraction que votes.json pour un scrutin commun', () => {
      const appro = JSON.parse(fixture.votes) as Record<string, unknown>[];
      for (const v of votes) {
        const a = appro.find((x) => x.id === v.id);
        if (!a) continue;
        const champs = ['scrutin', 'date', 'titreScrutin', 'typeVote', 'sort', 'pour', 'contre', 'abstention', 'urlScrutin', 'groupes', 'candidats'] as const;
        const officiel = v as unknown as Record<string, unknown>;
        for (const k of champs) expect(a[k], `${v.id}.${k}`).toEqual(officiel[k]);
      }
      expect(appro.find((x) => x.id === 'fx-smic-suppression-article-1')).toMatchObject({ portee: 'amendement', categorie: 'Économie & travail' });
    });

    it('nouvelles questions : votes nominatifs officiels repris tels quels', () => {
      const appro = JSON.parse(fixture.votes) as { id: string; candidats: Record<string, { position: string | null }> }[];
      for (const c of avec.categories)
        for (const q of c.questions) {
          const v = appro.find((x) => x.id === q.id);
          for (const [cid, p] of Object.entries(v?.candidats ?? {}))
            if (p.position === 'pour' || p.position === 'contre' || p.position === 'abstention')
              expect(q.candidats[cid], `${q.id}/${cid}`).toMatchObject({ position: p.position, evidence: 'vote_an' });
        }
    });
  });

  const SELECTION_APPRO = join(DATA, 'selection-approfondi.json');
  describe.runIf(existsSync(SELECTION_APPRO))('mode approfondi : data/selection-approfondi.json', () => {
    const votesPath = join(DATA, 'build', 'votes-approfondi.json');
    const appro = {
      selection: readFileSync(SELECTION_APPRO, 'utf8'),
      votes: existsSync(votesPath) ? readFileSync(votesPath, 'utf8') : null,
    };
    const sans = run(true);
    const avec = run(true, true, appro);

    it('aucune erreur bloquante, parcours principal strictement identique', () => {
      expect(avec.report.issues.filter((i) => i.severity === 'erreur')).toEqual([]);
      expect(appDataSchema.safeParse(avec.data).success).toBe(true);
      expect(avec.data?.questions).toEqual(sans.data?.questions);
    });

    it('les questions existantes de la sélection sont celles du parcours principal (même scrutin)', () => {
      const selection = JSON.parse(appro.selection) as { id: string; scrutin: string; existant?: boolean }[];
      const principal = new Map((readJson('selection.json') as { id: string; scrutin: string }[]).map((s) => [s.id, s.scrutin]));
      for (const e of selection.filter((x) => x.existant)) expect(principal.get(e.id), e.id).toBe(e.scrutin);
      // les 33 questions du parcours principal figurent chacune dans une catégorie
      expect(avec.report.approfondi.existantesNonReprises).toEqual([]);
    });

    it('nouvelles questions : votes nominatifs officiels repris tels quels, aucune question sans position pour un candidat', () => {
      const officiels = appro.votes ? (JSON.parse(appro.votes) as { id: string; candidats: Record<string, { position: string | null }> }[]) : [];
      for (const c of avec.categories)
        for (const q of c.questions) {
          expect(Object.keys(q.candidats), q.id).toHaveLength(14);
          for (const [cid, p] of Object.entries(officiels.find((x) => x.id === q.id)?.candidats ?? {}))
            if (p.position === 'pour' || p.position === 'contre' || p.position === 'abstention')
              expect(q.candidats[cid], `${q.id}/${cid}`).toMatchObject({ position: p.position, evidence: 'vote_an' });
        }
    });
  });
});
