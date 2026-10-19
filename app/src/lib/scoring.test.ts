import { describe, expect, it } from 'vitest';
import { rankCandidates, scoreByTheme, scoreCandidate, verdict } from './scoring';
import { appData, position, question } from './testdata';
import { EVIDENCE_WEIGHTS, MIN_COMPARABLE } from './weights';

describe('verdict', () => {
  it('accord, désaccord, demi-accord, exclusions', () => {
    expect(verdict('oui', 'oui')).toBe('accord');
    expect(verdict('non', 'oui')).toBe('desaccord');
    expect(verdict('oui', 'abstention')).toBe('abstention');
    expect(verdict('oui', 'inconnu')).toBe('non-comparable');
    expect(verdict('passe', 'oui')).toBe('non-comparable');
    expect(verdict(undefined, 'oui')).toBe('non-comparable');
  });
});

describe('scoreCandidate', () => {
  const qs = [
    question('q1', 'T1', { a: position('oui', 'vote_an') }),
    question('q2', 'T1', { a: position('non', 'groupe') }),
    question('q3', 'T2', { a: position('abstention', 'declaration') }),
    question('q4', 'T2', { a: position('inconnu') }),
    question('q5', 'T2', { a: position('oui', 'gouvernement') }),
    question('q6', 'T3', { a: position('oui', 'censure_implicite') }),
  ];
  const answers = { q1: 'oui', q2: 'oui', q3: 'non', q4: 'oui', q5: 'passe', q6: 'non' } as const;

  it('somme pondérée des accords / somme des poids comparables', () => {
    const s = scoreCandidate('a', qs, answers);
    // q1 accord ×1 ; q2 désaccord ×0,25 ; q3 demi-accord ×0,5 ; q4 inconnu exclu ; q5 passée exclue ; q6 désaccord ×0,5
    const num = 1 * 1 + 0.25 * 0 + 0.5 * 0.5 + 0.5 * 0;
    const den = 1 + 0.25 + 0.5 + 0.5;
    expect(s.score).toBeCloseTo(num / den, 10);
    expect(s.comparables).toBe(4);
    expect(s.votesReels).toBe(1);
    expect(s.accords).toBe(1);
    expect(s.desaccords).toBe(2);
    expect(s.abstentions).toBe(1);
    expect(s.confiance).toBeCloseTo(1 / den, 10);
    expect(s.classe).toBe(true);
  });

  it('poids documentés : vote 1, gouvernement 0,75, déclaration 0,5, proxy 0,25, censure implicite 0,5', () => {
    expect(EVIDENCE_WEIGHTS).toMatchObject({
      vote_an: 1,
      vote_congres: 1,
      vote_senat: 1,
      vote_pe: 1,
      gouvernement: 0.75,
      declaration: 0.5,
      groupe: 0.25,
      censure_implicite: 0.5,
      inconnu: 0,
    });
  });

  it(`moins de ${MIN_COMPARABLE} questions comparables : non classé`, () => {
    const s = scoreCandidate('a', qs.slice(0, 2), { q1: 'oui', q2: 'oui' });
    expect(s.comparables).toBe(2);
    expect(s.classe).toBe(false);
  });

  it('option votes nominatifs seulement', () => {
    const s = scoreCandidate('a', qs, answers, { votesSeulement: true });
    expect(s.comparables).toBe(1);
    expect(s.score).toBe(1);
    expect(s.confiance).toBe(1);
  });

  it('aucune question comparable : score null', () => {
    expect(scoreCandidate('a', qs, {}).score).toBeNull();
  });

  it('répartition par thème', () => {
    const s = scoreCandidate('a', qs, answers);
    const byTheme = scoreByTheme(s, ['T1', 'T2', 'T3']);
    expect(byTheme[0]).toEqual({ theme: 'T1', score: 1 / 1.25, n: 2 });
    expect(byTheme[1]).toEqual({ theme: 'T2', score: 0.5, n: 1 });
    expect(byTheme[2]).toEqual({ theme: 'T3', score: 0, n: 1 });
  });
});

describe('rankCandidates', () => {
  it('score décroissant, égalités et données insuffisantes par ordre alphabétique', () => {
    const qs = ['q1', 'q2', 'q3'].map((id) =>
      question(id, 'T', {
        zed: position('oui'),
        abel: position('oui'),
        mid: position('non'),
        few: id === 'q1' ? position('oui') : position('inconnu'),
      }),
    );
    const data = appData(qs, ['zed', 'mid', 'few', 'abel']);
    const { classes, insuffisants } = rankCandidates(data, qs, { q1: 'oui', q2: 'oui', q3: 'oui' });
    expect(classes.map((s) => s.candidatId)).toEqual(['abel', 'zed', 'mid']);
    expect(insuffisants.map((s) => s.candidatId)).toEqual(['few']);
  });
});
