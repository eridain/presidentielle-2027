import { describe, expect, it } from 'vitest';
import { selectQuick } from './quick';
import { position, question } from './testdata';

describe('mode rapide', () => {
  const qs = [
    question('t1-a', 'T1', { x: position('oui', 'groupe') }, '2020-01-01'),
    question('t1-b', 'T1', { x: position('oui', 'vote_an') }, '2019-01-01'),
    question('t1-c', 'T1', { x: position('oui', 'vote_an') }, '2021-01-01'),
    question('t2-a', 'T2', { x: position('inconnu') }),
    question('t3-a', 'T3', { x: position('oui') }),
    question('t3-b', 'T3', { x: position('oui') }),
  ];

  it('au moins une question par thème, la mieux documentée, ordre d’origine conservé', () => {
    const sel = selectQuick(qs, ['T1', 'T2', 'T3'], 3).map((q) => q.id);
    // T1 : t1-b et t1-c ont un vote nominatif ; t1-c est la plus récente
    expect(sel).toEqual(['t1-c', 't2-a', 't3-a']);
  });

  it('les questions supplémentaires vont d’abord aux thèmes les plus fournis', () => {
    const sel = selectQuick(qs, ['T1', 'T2', 'T3'], 4).map((q) => q.id);
    expect(sel).toEqual(['t1-b', 't1-c', 't2-a', 't3-a']);
  });

  it('déterministe et borné', () => {
    expect(selectQuick(qs, ['T1', 'T2', 'T3'], 5)).toEqual(selectQuick(qs, ['T1', 'T2', 'T3'], 5));
    expect(selectQuick(qs, ['T1', 'T2', 'T3'], 50)).toHaveLength(qs.length);
  });
});
