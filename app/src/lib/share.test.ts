import { describe, expect, it } from 'vitest';
import { decodeAnswers, encodeAnswers, shareUrl } from './share';
import { position, question } from './testdata';

const qs = ['a', 'b', 'c', 'd'].map((id) => question(id, 'T', { x: position('oui') }));

describe('partage par URL', () => {
  it('aller-retour, une lettre par question, « _ » finaux omis', () => {
    const answers = { a: 'oui', c: 'passe' } as const;
    const code = encodeAnswers(qs, answers);
    expect(code).toBe('o_p');
    expect(decodeAnswers(qs, code)).toEqual(answers);
    expect(shareUrl('https://exemple.org/vote/', qs, { d: 'non' })).toBe('https://exemple.org/vote/#/resultats?r=___n');
  });

  it('codes invalides ou vides rejetés ; caractères au-delà des questions ignorés', () => {
    expect(decodeAnswers(qs, null)).toBeNull();
    expect(decodeAnswers(qs, '')).toBeNull();
    expect(decodeAnswers(qs, '___')).toBeNull();
    expect(decodeAnswers(qs, 'ox<script>')).toBeNull();
    expect(decodeAnswers(qs, 'nnnnnn')).toEqual({ a: 'non', b: 'non', c: 'non', d: 'non' });
  });
});
