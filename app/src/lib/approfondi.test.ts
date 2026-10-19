// Mode « Approfondir par catégorie » côté application : partage par URL d'une catégorie, réponses (une seule par
// question sur tout le site), stockage par catégorie, score par catégorie, durée estimée.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CategorieIndex } from '../types';
import { CATEGORIES, dureeMinutes, normaliserCategorie, reponsesCategorie } from './categories';
import { rankCandidates, scoreCandidate } from './scoring';
import { cleQuestions, decodeAnswers, decodeCategorie, encodeAnswers, encodeCategorie } from './share';
import { loadApprofondi, loadState, saveApprofondi } from './storage';
import { appData, position, question } from './testdata';
import { MIN_COMPARABLE } from './weights';

const cat: CategorieIndex = {
  id: 'economie-travail',
  libelle: 'Économie & travail',
  questions: [
    { id: 'principale', existant: true, portee: 'ensemble' },
    { id: 'n1', existant: false, portee: 'amendement' },
    { id: 'n2', existant: false, portee: 'ensemble' },
  ],
};

describe('lien de partage d’une catégorie', () => {
  const qs = ['a', 'b', 'c', 'd'].map((id) => question(id, 'Économie & travail', { x: position('oui') }));

  it('aller-retour : une lettre par question, clé de contrôle des questions couvertes', () => {
    const answers = { a: 'oui', c: 'passe' } as const;
    const { r, k } = encodeCategorie(qs, answers);
    expect(r).toBe('o_p');
    expect(k).toBe(cleQuestions(['a', 'b', 'c']));
    expect(decodeCategorie(qs, r, k)).toEqual({ answers, perime: false });
  });

  it('questions ajoutées en fin de catégorie : les liens existants restent valides', () => {
    const { r, k } = encodeCategorie(qs, { a: 'non', b: 'oui' });
    const plus = [...qs, question('e', 'T', {})];
    expect(decodeCategorie(plus, r, k)).toEqual({ answers: { a: 'non', b: 'oui' }, perime: false });
  });

  it('questions réordonnées ou retirées : lien périmé, réponses non relues (jamais attribuées à une autre question)', () => {
    const { r, k } = encodeCategorie(qs, { a: 'non', b: 'oui' });
    expect(decodeCategorie([qs[1], qs[0], qs[2], qs[3]].filter((q) => q !== undefined), r, k)).toEqual({ answers: null, perime: true });
    expect(decodeCategorie(qs.slice(0, 1), r, k)).toEqual({ answers: null, perime: true });
    expect(decodeCategorie(qs, r, null)).toEqual({ answers: null, perime: true });
    expect(decodeCategorie(qs, r, 'zzz')).toEqual({ answers: null, perime: true });
  });

  it('codes invalides rejetés sans être signalés comme périmés', () => {
    expect(decodeCategorie(qs, null, null)).toEqual({ answers: null, perime: false });
    expect(decodeCategorie(qs, 'ox<script>', 'k')).toEqual({ answers: null, perime: false });
  });

  it('clé stable et sensible à l’ordre', () => {
    expect(cleQuestions(['a', 'b'])).toBe(cleQuestions(['a', 'b']));
    expect(cleQuestions(['a', 'b'])).not.toBe(cleQuestions(['b', 'a']));
    expect(cleQuestions(['ab'])).not.toBe(cleQuestions(['a', 'b']));
  });

  it('le lien du parcours principal est inchangé (pas de clé, mêmes lettres)', () => {
    expect(encodeAnswers(qs, { b: 'non', d: 'oui' })).toBe('_n_o');
    expect(decodeAnswers(qs, '_n_o')).toEqual({ b: 'non', d: 'oui' });
  });
});

describe('réponses d’une catégorie', () => {
  it('question du parcours principal : sa réponse unique ; question propre : la réponse de la catégorie', () => {
    const a = reponsesCategorie(cat, { principale: 'oui', autre: 'non', n1: 'non' }, { n1: 'passe', n2: 'oui', etrangere: 'oui' });
    expect(a).toEqual({ principale: 'oui', n1: 'passe', n2: 'oui' });
    expect(reponsesCategorie(cat, {}, undefined)).toEqual({});
  });
});

describe('stockage local du mode approfondi', () => {
  const store = new Map<string, string>();
  beforeAll(() => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      },
    });
  });
  afterEach(() => store.clear());
  afterAll(() => vi.unstubAllGlobals());

  it('par catégorie, séparé du parcours principal ; valeurs invalides écartées', () => {
    saveApprofondi({ 'economie-travail': { n1: 'oui', n2: 'passe' }, immigration: { i1: 'non' } });
    expect(loadApprofondi()).toEqual({ 'economie-travail': { n1: 'oui', n2: 'passe' }, immigration: { i1: 'non' } });
    expect(loadState()).toEqual({ mode: null, answers: {} });
    store.set('vote-reel:approfondi:v1', JSON.stringify({ 'Mauvais id': { a: 'oui' }, immigration: { i1: 'peut-être', i2: 'non' }, vide: {} }));
    expect(loadApprofondi()).toEqual({ immigration: { i2: 'non' } });
    store.set('vote-reel:approfondi:v1', '{ illisible');
    expect(loadApprofondi()).toEqual({});
    saveApprofondi({});
    expect(store.has('vote-reel:approfondi:v1')).toBe(false);
  });
});

describe('score par catégorie : mêmes règles que le parcours principal', () => {
  const T = 'Économie & travail';
  const all = [
    question('g1', 'Autre', { a: position('oui'), b: position('non') }),
    question('c1', T, { a: position('oui', 'vote_an'), b: position('oui', 'groupe') }),
    question('c2', T, { a: position('non', 'declaration'), b: position('oui', 'vote_an') }),
    question('c3', T, { a: position('abstention', 'vote_an'), b: position('inconnu') }),
    question('c4', T, { a: position('oui', 'gouvernement'), b: position('oui', 'vote_an') }),
  ];
  const categorie = all.filter((q) => q.theme === T);
  const data = appData(all, ['a', 'b']);
  const answers = { g1: 'non', c1: 'oui', c2: 'oui', c3: 'oui', c4: 'oui' } as const;

  it('pondération, couverture, confiance : calculées sur les seules questions de la catégorie', () => {
    const s = scoreCandidate('a', categorie, answers);
    // c1 accord ×1 ; c2 désaccord ×0,5 ; c3 demi-accord ×1 ; c4 accord ×0,75
    expect(s.score).toBeCloseTo((1 + 0 + 0.5 + 0.75) / (1 + 0.5 + 1 + 0.75), 10);
    expect(s.comparables).toBe(4);
    expect(s.votesReels).toBe(2);
    expect(s.confiance).toBeCloseTo(2 / 3.25, 10);
    // g1 (hors catégorie) n'entre pas dans le score de la catégorie
    expect(scoreCandidate('a', all, answers).comparables).toBe(5);
  });

  it(`seuil « données insuffisantes » (${String(MIN_COMPARABLE)} questions comparables) et option votes nominatifs`, () => {
    const r = rankCandidates(data, categorie, answers);
    expect(r.classes.map((s) => s.candidatId)).toEqual(['b', 'a']);
    const votes = rankCandidates(data, categorie, answers, { votesSeulement: true });
    // a : 2 votes nominatifs (c1, c3), b : 2 (c2, c4) → moins de 3 comparables : aucun classé
    expect(votes.classes).toEqual([]);
    expect(votes.insuffisants.map((s) => s.candidatId)).toEqual(['a', 'b']);
  });
});

describe('catégories', () => {
  it('dix catégories aux libellés exacts du brief, identifiants uniques', () => {
    expect(CATEGORIES.map((c) => c.libelle)).toEqual([
      'Économie & travail',
      'Fiscalité & budget',
      'Commerce international & Europe',
      'Immigration',
      'Sécurité & justice',
      'Libertés publiques & institutions',
      'Société & bioéthique',
      'Environnement, agriculture & énergie',
      'Santé & protection sociale',
      'Défense & international',
    ]);
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(10);
  });

  it('durée estimée et comparaison tolérante des libellés', () => {
    expect(dureeMinutes(22)).toBe(9);
    expect(dureeMinutes(20)).toBe(8);
    expect(dureeMinutes(1)).toBe(1);
    expect(normaliserCategorie('Économie & travail')).toBe(normaliserCategorie('economie et  travail'));
    expect(normaliserCategorie('Économie & travail')).not.toBe(normaliserCategorie('Fiscalité & budget'));
  });
});
