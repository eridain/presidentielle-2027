import { describe, expect, it } from 'vitest';
import { renseigne, SITE } from '../config';
import { formatDate, formatPercent, formatPeriodes } from './format';
import { parseHash } from './router';
import { collectSources } from './sources';
import { appData, position, question } from './testdata';

describe('routage par fragment', () => {
  it('chemin et paramètres', () => {
    expect(parseHash('')).toMatchObject({ path: '/' });
    expect(parseHash('#/')).toMatchObject({ path: '/' });
    expect(parseHash('#/question/ceta').path).toBe('/question/ceta');
    const r = parseHash('#/resultats?r=onp');
    expect(r.path).toBe('/resultats');
    expect(r.params.get('r')).toBe('onp');
  });
});

describe('formats', () => {
  it('dates en français', () => {
    expect(formatDate('2017-11-28')).toBe('28 novembre 2017');
    expect(formatDate('2024-03-01')).toBe('1er mars 2024');
    expect(formatDate('2023-05')).toBe('mai 2023');
    expect(formatDate('2023')).toBe('2023');
    expect(formatDate(null)).toBe('');
  });
  it('pourcentages', () => {
    expect(formatPercent(0.666)).toBe('67 %');
    expect(formatPercent(null)).toBe('—');
  });
});

describe('inventaire des sources', () => {
  it('dédoublonne les URLs par question et compte les URLs distinctes', () => {
    const q = question('q1', 'T', { a: position('oui'), b: position('non') });
    const data = appData([q], ['a', 'b']);
    const { parQuestion, total } = collectSources(data);
    expect(total).toBe(2);
    const urls = parQuestion[0]?.sources.map((s) => s.url);
    expect(urls).toEqual(['https://www.assemblee-nationale.fr/dyn/16/scrutins/q1', 'https://www.assemblee-nationale.fr/x']);
    expect(parQuestion[0]?.sources[1]?.libelles).toHaveLength(2);
  });
});

describe('périodes de validité des proxies (affichage)', () => {
  it('une ou plusieurs périodes, bornes ouvertes ou fermées', () => {
    expect(formatPeriodes([{ du: '2019-03-01', au: null }])).toBe('à partir du 1er mars 2019');
    expect(formatPeriodes([{ du: null, au: '2026-03-31' }])).toBe("jusqu'au 31 mars 2026");
    expect(formatPeriodes([{ au: '2017-12-10' }, { du: '2021-10-01' }])).toBe("jusqu'au 10 décembre 2017 et à partir du 1er octobre 2021");
    expect(formatPeriodes([])).toBe('');
  });
});

describe('mentions légales (config)', () => {
  it('champ vide, nul ou absent = non renseigné, jamais « undefined »', () => {
    expect(renseigne(null)).toBeNull();
    expect(renseigne(undefined)).toBeNull();
    expect(renseigne('   ')).toBeNull();
    expect(renseigne(' Association X ')).toBe('Association X');
  });
  it('les champs éditeur, contact et hébergeur existent dans la configuration', () => {
    expect(Object.keys(SITE)).toEqual(expect.arrayContaining(['editeur', 'contact', 'hebergeur']));
  });
});
