import { describe, expect, it } from 'vitest';
import { BREAKABLE_TYPO, deepFrenchSpacing, frenchSpacing } from './typo';

const N = '\u00a0';

describe('typographie française', () => {
  it('guillemets : espaces insécables à l’intérieur, ajoutées si absentes', () => {
    expect(frenchSpacing('pourquoi « Non » ?')).toBe(`pourquoi «${N}Non${N}»${N}?`);
    expect(frenchSpacing('dit «non»')).toBe(`dit «${N}non${N}»`);
    expect(frenchSpacing('«\u202fmot\u202f»')).toBe(`«${N}mot${N}»`);
    expect(frenchSpacing('« sur\ndeux lignes »')).toBe(`«${N}sur\ndeux lignes${N}»`);
  });

  it('ponctuation haute : espace insécable devant : ; ! ? (sans en ajouter)', () => {
    expect(frenchSpacing('Objet du vote : texte ; suite ! Vraiment ?')).toBe(`Objet du vote${N}: texte${N}; suite${N}! Vraiment${N}?`);
    expect(frenchSpacing('Debout !')).toBe(`Debout${N}!`);
    expect(frenchSpacing('https://www.example.fr/page?a=1')).toBe('https://www.example.fr/page?a=1');
    expect(frenchSpacing('Note: anglais')).toBe('Note: anglais');
  });

  it('idempotent', () => {
    const once = frenchSpacing('L’autre point de vue : pourquoi « Non » ?');
    expect(frenchSpacing(once)).toBe(once);
    expect(BREAKABLE_TYPO.test(once)).toBe(false);
    expect(BREAKABLE_TYPO.test('pourquoi « Non » ?')).toBe(true);
    expect(BREAKABLE_TYPO.test(`«${N}Non${N}» ?`)).toBe(true);
  });

  it('deepFrenchSpacing : toutes les chaînes, clés et autres valeurs intactes', () => {
    const input = { 'a ?': 'b ?', n: 1, z: null, t: true, l: ['« x »', { k: 'y :' }] };
    expect(deepFrenchSpacing(input)).toEqual({ 'a ?': `b${N}?`, n: 1, z: null, t: true, l: [`«${N}x${N}»`, { k: `y${N}:` }] });
  });
});
