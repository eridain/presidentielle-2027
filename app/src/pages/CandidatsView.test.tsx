// Liste « Partis & candidats » (react-dom/server) : ordre alphabétique, ligne de compteurs par famille, option
// « Probité uniquement ». Noms et faits fictifs.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildData } from '../../pipeline/build';
import { ancienne, anciensFile, candidat, condamnation, inputs, justice, justiceFile, membre, membresDe, membresFile } from '../../pipeline/fixtures';
import { CandidatsView } from './CandidatsView';

// zulu : beaucoup de condamnations ; alpha : liste vide ; mike : fiche absente ; kilo : aucune en probité ;
// oscar et papa : deux partis, l'un à liste vide, l'autre non publié (dans un ordre puis dans l'autre).
const CANDS = [
  candidat('zulu', ['Z'], 'PA1', { partis: [{ id: 'pz', nom: 'Parti Z' }] }),
  candidat('alpha', ['A'], 'PA2', { partis: [{ id: 'pa', nom: 'Parti A' }] }),
  candidat('mike', ['M'], 'PA3', { partis: [{ id: 'pm', nom: 'Parti M' }] }),
  candidat('kilo', ['K'], 'PA4', { partis: [{ id: 'pk', nom: 'Parti K' }] }),
  candidat('oscar', ['O'], 'PA5', { partis: [{ id: 'pa', nom: 'Parti A' }, { id: 'pm', nom: 'Parti M' }] }),
  candidat('papa', ['P'], 'PA6', { partis: [{ id: 'pm', nom: 'Parti M' }, { id: 'pa', nom: 'Parti A' }] }),
];

const FICHES = {
    pz: justiceFile('pz', {
      condamnations: [
        condamnation({ personne: 'Prénom Zulu', categorie: 'candidat', roleActuel: null, famille: 'probite', dateDecision: '2020-01-01' }),
        condamnation({ personne: 'Un Membre', famille: 'probite', dateDecision: '2019-01-01' }),
        condamnation({ personne: 'Deux Membre', famille: 'probite', dateDecision: '2018-01-01' }),
        condamnation({ personne: 'Trois Membre', famille: 'haine' }),
        condamnation({ personne: 'Prénom Zulu', categorie: 'candidat', roleActuel: null, famille: 'diffamation', dateDecision: '2017-01-01' }),
        condamnation({ personne: 'Quatre Membre', famille: 'autres' }),
      ],
    }),
    pa: justiceFile('pa', { condamnations: [] }),
    pk: justiceFile('pk', { condamnations: [condamnation({ personne: 'Cinq Membre', famille: 'violences' })] }),
};
// chaque personne condamnée est membre de son parti (niveau 1)
const r = buildData({ ...inputs([{ id: 'q1' }], CANDS), justice: justice(FICHES), justiceMembres: justice(membresDe(FICHES)) });
if (!r.data) throw new Error('données non construites');
const data = r.data;

function render(probiteSeuleInitiale = false) {
  const html = renderToStaticMarkup(<CandidatsView data={data} probiteSeuleInitiale={probiteSeuleInitiale} />);
  const cartes = html
    .split('<li class="pcard">')
    .slice(1)
    .map((c) =>
      c
        .replace(/<span class="sr-only">[^<]*<\/span>/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    );
  return { html, cartes };
}

// Appartenance (round 7) : zulu a aussi un ancien membre (départ) et un ancien député (anciens/) ; kilo, un membre
// décédé seulement.
const avecPassif = buildData({
  ...inputs([{ id: 'q1' }], CANDS),
  justice: justice({
    ...FICHES,
    pz: justiceFile('pz', {
      condamnations: [...(FICHES.pz.condamnations as unknown[]), condamnation({ personne: 'Ex Membre', famille: 'probite', dateDecision: '2016-01-01' })],
    }),
  }),
  justiceMembres: justice({
    ...membresDe(FICHES),
    pz: membresFile('pz', [
      ...['Prénom Zulu', 'Un Membre', 'Deux Membre', 'Trois Membre', 'Quatre Membre'].map((p) => membre(p)),
      membre('Ex Membre', { statutMembre: 'depart', depuis: '2018' }),
    ]),
    pk: membresFile('pk', [membre('Cinq Membre', { statutMembre: 'decede', depuis: '2020' })]),
  }),
  justiceAnciens: justice({ pz: anciensFile('pz', [ancienne({ famille: 'haine' })]) }),
}).data;

describe('liste « Partis & candidats »', () => {
  it('ordre alphabétique conservé (aucun tri par nombre de condamnations), une carte par candidat', () => {
    const { html } = render();
    expect([...html.matchAll(/<a class="pcard__nom" href="#\/candidat\/([a-z]+)">/g)].map((m) => m[1])).toEqual(['alpha', 'kilo', 'mike', 'oscar', 'papa', 'zulu']);
  });

  it('ligne compacte : familles non nulles seulement, ordre de gravité, « dont candidat » s’il est non nul', () => {
    const { cartes } = render();
    expect(cartes[5]).toBe('Prénom Zulu Parti zulu Probité : 3 (dont candidat : 1) · Propos haine : 1 · Diffamation : 1 (dont candidat : 1) · Autres : 1');
    expect(cartes[1]).toBe('Prénom Kilo Parti kilo Violences : 1');
    // liste vide ; fiche absente
    expect(cartes[0]).toBe('Prénom Alpha Parti alpha Condamnations : aucune trouvée dans les sources consultées');
    expect(cartes[2]).toBe('Prénom Mike Parti mike Condamnations : recherche en cours');
    // une fiche vide et une fiche non publiée, dans les deux ordres : jamais « aucune trouvée » ni « retenue »
    expect(cartes[3]).toBe('Prénom Oscar Parti oscar Condamnations : recherche en cours');
    expect(cartes[4]).toBe('Prénom Papa Parti papa Condamnations : recherche en cours');
  });

  it('Probité mise en avant : pictogramme et gras, sans couleur', () => {
    const { html } = render();
    expect(html).toMatch(/<span class="pcard__famille pcard__famille--probite"><strong><svg class="picto"[^>]*aria-hidden="true"/);
    expect(html).toContain('<span class="sr-only">Condamnations par famille : </span>');
  });

  it('option « Probité uniquement » : décochée au départ ; cochée, seule la famille Probité est comptée, même à zéro', () => {
    const { html } = render();
    expect(html).toMatch(/<input id="probite-seule" type="checkbox"\/>/);
    expect(html).toContain('<label for="probite-seule">Probité uniquement');
    const seule = render(true);
    expect(seule.html).toMatch(/<input id="probite-seule" type="checkbox" checked=""\/>/);
    // toute fiche publiée affiche « Probité : N » (lecture homogène d'une carte à l'autre) ; fiche absente : recherche en cours
    expect(seule.cartes).toEqual([
      'Prénom Alpha Parti alpha Probité : 0',
      'Prénom Kilo Parti kilo Probité : 0',
      'Prénom Mike Parti mike Condamnations : recherche en cours',
      'Prénom Oscar Parti oscar Condamnations : recherche en cours',
      'Prénom Papa Parti papa Condamnations : recherche en cours',
      'Prénom Zulu Parti zulu Probité : 3 (dont candidat : 1)',
    ]);
  });

  it('appartenance : compteurs niveau 1 seulement, « (+N anciens) » discret, Probité uniquement comprise', () => {
    if (!avecPassif) throw new Error('données non construites');
    const cartes = (probite: boolean) => {
      const html = renderToStaticMarkup(<CandidatsView data={avecPassif} probiteSeuleInitiale={probite} />);
      return {
        html,
        // texte visible (sans les compléments pour lecteurs d'écran)
        cartes: html
          .split('<li class="pcard">')
          .slice(1)
          .map((c) => c.replace(/<span class="sr-only">[^<]*<\/span>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()),
      };
    };
    const tout = cartes(false);
    // les compteurs ne bougent pas : l'ancien membre et l'ancien député ne sont pas comptés
    expect(tout.cartes[5]).toBe('Prénom Zulu Parti zulu Probité : 3 (dont candidat : 1) · Propos haine : 1 · Diffamation : 1 (dont candidat : 1) · Autres : 1 (+2 anciens)');
    // aucun membre actuel condamné : « aucune », et le passif à part
    expect(tout.cartes[1]).toBe('Prénom Kilo Parti kilo Condamnations : aucune chez la personne candidate, le parti ou ses membres actuels (+1 ancien)');
    expect(tout.html).toContain(' <span class="pcard__passif"><span aria-hidden="true">(+2\u00a0anciens)</span><span class="sr-only">(+2 condamnations d’anciens membres, non comptées)</span></span>');
    // liste principale non publiée, passif publié : « recherche en cours (+N anciens) »
    const nonPubliee = buildData({
      ...inputs([{ id: 'q1' }], CANDS),
      justice: justice({ ...FICHES, pk: justiceFile('pk', { condamnations: undefined }) }),
      justiceAnciens: justice({ pk: anciensFile('pk', [ancienne()]) }),
    }).data;
    if (!nonPubliee) throw new Error('données non construites');
    const kilo = renderToStaticMarkup(<CandidatsView data={nonPubliee} />).split('<li class="pcard">')[2] ?? '';
    expect(kilo.replace(/<span class="sr-only">[^<]*<\/span>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).toBe(
      'Prénom Kilo Parti kilo Condamnations : recherche en cours (+1 ancien)',
    );
    const probite = cartes(true);
    expect(probite.cartes[5]).toBe('Prénom Zulu Parti zulu Probité : 3 (dont candidat : 1) (+1 ancien)');
    expect(probite.cartes[1]).toBe('Prénom Kilo Parti kilo Probité : 0');
  });

  it('le lien de chaque carte porte le seul nom du candidat (nom accessible court)', () => {
    const { html } = render();
    expect(html).toContain('<a class="pcard__nom" href="#/candidat/zulu">Prénom Zulu</a>');
  });
});
