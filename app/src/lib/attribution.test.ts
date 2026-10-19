import { describe, expect, it } from 'vitest';
import type { Attribution } from '../types';
import { argumentLabel, attributionMention, proposDeTiers } from './attribution';
import { deNom } from './format';
import { ouiEnPremier } from './questions';

const att = (fields: Partial<Attribution>): Attribution => ({
  duCandidat: false,
  porteur: 'groupe',
  orateur: null,
  groupe: null,
  verification: 'compte-rendu',
  ...fields,
});

describe('attribution des propos (affichage)', () => {
  it('titre : « Ses raisons » pour le candidat ou si inconnu, sinon le porteur réel', () => {
    expect(argumentLabel(null)).toBe('Ses raisons');
    expect(argumentLabel(att({ duCandidat: true, porteur: null }))).toBe('Ses raisons');
    expect(argumentLabel(att({ duCandidat: null, porteur: null, verification: null }))).toBe('Ses raisons');
    expect(argumentLabel(att({}))).toBe('Argument de son groupe');
    expect(argumentLabel(att({ porteur: 'gouvernement' }))).toBe('Argument du Gouvernement');
    expect(proposDeTiers(att({}))).toBe(true);
    expect(proposDeTiers(att({ duCandidat: null }))).toBe(false);
  });

  it('mention explicite de l’auteur réel, avec élision', () => {
    expect(attributionMention(att({ orateur: 'Laurent Jacobelli', groupe: 'RN' }), 'Marine Le Pen')).toBe(
      'Propos de Laurent Jacobelli (groupe RN), pas de Marine Le Pen.',
    );
    expect(attributionMention(att({ orateur: 'Elsa Faucillon', groupe: 'GDR' }), 'Fabien Roussel')).toBe(
      'Propos d’Elsa Faucillon (groupe GDR), pas de Fabien Roussel.',
    );
    expect(attributionMention(att({ orateur: 'Loïc Kervran', groupe: 'HOR' }), 'Édouard Philippe')).toBe(
      'Propos de Loïc Kervran (groupe HOR), pas d’Édouard Philippe.',
    );
    expect(attributionMention(att({ groupe: 'FI' }), 'François Ruffin')).toBe('Explication du groupe FI, pas de François Ruffin.');
    expect(attributionMention(att({}), 'François Ruffin')).toBe('Explication de son groupe, pas de François Ruffin.');
    expect(attributionMention(att({ porteur: 'gouvernement' }), 'Gabriel Attal')).toBe(
      'Position du Gouvernement, pas une déclaration personnelle de Gabriel Attal.',
    );
    expect(attributionMention(att({ duCandidat: true, porteur: null }), 'Marine Le Pen')).toBeNull();
    expect(attributionMention(null, 'Marine Le Pen')).toBeNull();
  });

  it('élision', () => {
    expect(deNom('Éric Zemmour')).toBe('d’Éric Zemmour');
    expect(deNom('Hubert Wulfranc')).toBe('d’Hubert Wulfranc');
    expect(deNom('Jean-Luc Mélenchon')).toBe('de Jean-Luc Mélenchon');
  });
});

describe('« En clair » : ordre des camps', () => {
  it('alterne d’une question à l’autre selon le rang dans la liste complète', () => {
    const qs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(qs.map((q) => ouiEnPremier(qs, q.id))).toEqual([true, false, true]);
    expect(ouiEnPremier(qs, 'inconnue')).toBe(true);
  });
});
