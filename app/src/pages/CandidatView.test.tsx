// Rendu de la page « parti / candidat » (react-dom/server) à partir de données construites par le pipeline
// avec des fiches fictives : page rendue, badges de statut, message « aucune condamnation », fiche absente.
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildData } from '../../pipeline/build';
import { SITE } from '../config';
import {
  ancienne,
  anciensFile,
  candidat,
  condamnation,
  inputs,
  justice,
  justiceFile,
  membre,
  membresDe,
  membresFile,
  source,
} from '../../pipeline/fixtures';
import { AUCUNE, AUCUNE_ACTUELS, AUCUNE_RETENUE, AvertissementJustice, EN_COURS } from '../components/Justice';
import type { AppData } from '../types';
import { CandidatView } from './CandidatView';

const CANDS = [
  candidat('alpha', ['A'], 'PA1', { partis: [{ id: 'pa', nom: 'Parti A' }] }),
  candidat('beta', ['B'], 'PA2', {
    partis: [
      { id: 'pb', nom: 'Parti B' },
      { id: 'pa', nom: 'Parti A', rattachement: 'Prénom Beta est membre du Parti A.' },
    ],
  }),
  candidat('gamma', ['C'], 'PA3', { partis: [{ id: 'pc', nom: 'Parti C' }] }),
];

/** Données construites ; par défaut, chaque personne condamnée est « membre » de son parti (niveau 1). */
function appData(files: Record<string, unknown>, annexes: { membres?: Record<string, unknown>; anciens?: Record<string, unknown> } = {}): AppData {
  const r = buildData({
    ...inputs([{ id: 'q1' }], CANDS),
    justice: justice(files),
    justiceMembres: justice(annexes.membres ?? membresDe(files)),
    justiceAnciens: justice(annexes.anciens ?? {}),
  });
  if (!r.data) throw new Error('données non construites');
  return r.data;
}

function render(data: AppData, id: string) {
  const c = data.candidats.find((x) => x.id === id);
  if (!c) throw new Error(id);
  return visible(renderToStaticMarkup(<CandidatView data={data} candidat={c} />));
}

function visible(html: string) {
  // texte visible : sans les compléments pour lecteurs d'écran ; « dt » suivi de « : » comme à l'écran (CSS)
  const text = html
    .replace(/<span class="sr-only">[^<]*<\/span>/g, '')
    .replace(/<\/dt>/g, ' : ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/ ([.,)])/g, '$1')
    .replace(/\( /g, '(');
  return { html, text };
}

const STATUTS = ['definitive', 'appel_en_cours', 'pourvoi_en_cours', 'inconnu'] as const;

const data = appData({
  pa: justiceFile('pa', {
    sigle: 'PA',
    predecesseurs: ['Ancien Parti A (1990-2016)'],
    candidats: [{ id: 'alpha', bio: 'Parcours fictif de Prénom Alpha.', sources: [{ titre: 'Biographie', url: 'https://www.bio.example.fr/alpha' }] }],
    condamnations: [
      ...STATUTS.map((statut, i) => condamnation({ personne: `Membre${String(i)} Fictif`, statut, dateDecision: `2020-0${String(i + 1)}-15` })),
      condamnation({ personne: 'Rejet Fictif', infraction: 'MARQUEUR-REJET', sources: [] }),
      condamnation({ personne: 'Prénom Beta', categorie: 'candidat', roleActuel: null, dateDecision: '2018-05-04', sources: [source({ url: 'https://www.a.example.fr/beta' })] }),
      condamnation({ personne: 'Ancien Chef', categorie: 'ancien_dirigeant', nature: 'financiere', lieeMandatPolitique: false }),
    ],
  }),
  pb: justiceFile('pb', {
    condamnations: [
      // même décision que dans la fiche du Parti A : affichée une seule fois, sources réunies
      condamnation({ personne: 'Beta Prénom', categorie: 'candidat', roleActuel: null, dateDecision: '2018-05-04', sources: [source({ url: 'https://www.b.example.fr/beta' })] }),
    ],
  }),
  pc: justiceFile('pc', { condamnations: [] }),
});

// Familles variées (Parti A) : 4 probité (parti, ancien dirigeant, deux parlementaires), 1 violences, 1 haine,
// 2 diffamation (dont le candidat), 1 autres.
const familles = appData({
  pa: justiceFile('pa', {
    condamnations: [
      condamnation({ personne: 'Autre Membre', famille: 'autres', dateDecision: '2022-01-01' }),
      condamnation({ personne: 'Diff Membre', categorie: 'senateur', famille: 'diffamation', dateDecision: '2010-01-01' }),
      condamnation({ personne: 'Prénom Alpha', categorie: 'candidat', roleActuel: null, famille: 'diffamation', dateDecision: '2015-01-01' }),
      condamnation({ personne: 'Alpha Vieux', famille: 'probite', dateDecision: '2001-01-01' }),
      condamnation({ personne: 'Parti Alpha', categorie: 'parti', roleActuel: null, famille: 'probite', dateDecision: '2012-02-02' }),
      condamnation({ personne: 'Zeta Membre', famille: 'probite', dateDecision: '2020-01-01' }),
      condamnation({ personne: 'Ancien Chef', categorie: 'ancien_dirigeant', famille: 'probite', statut: 'appel_en_cours', dateDecision: '2019-01-01' }),
      condamnation({ personne: 'Haine Membre', categorie: 'dirigeant', famille: 'haine', statut: 'inconnu' }),
      condamnation({ personne: 'Violent Membre', famille: 'violences', statut: 'pourvoi_en_cours' }),
    ],
  }),
});

/** HTML de la section d'une famille dans la liste. */
function sectionFamille(html: string, famille: string): string {
  const debut = html.indexOf(`<section class="jfamille jfamille--${famille}"`);
  const fin = html.indexOf('<section class="jfamille', debut + 1);
  return html.slice(debut, fin === -1 ? html.indexOf('id="justice-etat"') : fin);
}

describe('page parti / candidat', () => {
  it('page rendue : biographie, parti, direction, effectifs, positions et section condamnations', () => {
    const { html, text } = render(data, 'alpha');
    expect(html).toMatch(/<h1[^>]*>Prénom Alpha<\/h1>/);
    expect(text).toContain('Parcours fictif de Prénom Alpha.');
    expect(html).toContain('href="https://www.bio.example.fr/alpha"');
    expect(html).toMatch(/<h2 id="parti-pa">Parti A<span class="muted"> \(PA\)<\/span><\/h2>/);
    expect(text).toContain('Parti fondé en 2016.');
    expect(text).toContain('Prédécesseur : Ancien Parti A (1990-2016)');
    expect(text).toContain('Martin Dominique — président');
    expect(text).toContain('10 députés · 2 sénateurs · 0 député européen');
    expect(html).toContain('href="https://www.assemblee-nationale.fr/dyn/deputes"');
    // lien vers ses votes : une ligne par question, avec la nature de la preuve
    expect(html).toContain('href="#/question/q1"');
    expect(text).toMatch(/Ses positions sur 1 question\b/);
    expect(html).toContain('class="badge badge--proxy"');
    expect(text).toContain('Condamnations en justice');
  });

  it('bandeau d’avertissement : périmètre, date de consultation, présomption d’innocence, exclusions, rectification', () => {
    const { text } = render(data, 'alpha');
    expect(text).toContain('Périmètre, identique pour tous les partis');
    expect(text).toContain('Liste établie à partir des sources consultées à la date du 18/10/2026 ; une absence de mention ne signifie pas absence de condamnation.');
    expect(text).toContain('présumée innocente tant qu’une décision n’est pas définitive');
    expect(text).toMatch(/mises en examen.*procédures en cours sans jugement/);
    expect(text).toMatch(/amnistiées ou effacées par une réhabilitation/);
    // contactRectification de la configuration publique (src/config.ts) : une ligne de rectification, aucun « à compléter »
    expect(text).toContain(`Demande de rectification : ${SITE.contactRectification ?? ''}`);
    expect(text).not.toMatch(/à compléter/i);
  });

  it('demande de rectification : affichée seulement si le contact est renseigné', () => {
    const avert = (contactRectification: string | null) =>
      visible(renderToStaticMarkup(<AvertissementJustice dateConsultation="2026-10-18" contactRectification={contactRectification} />));
    for (const vide of [null, '', '   ']) {
      const { html } = avert(vide);
      expect(html).not.toMatch(/rectification|à compléter/i);
      expect(html.match(/<li>/g)).toHaveLength(5);
    }
    const mail = avert('rectif@example.fr');
    expect(mail.text).toContain('Demande de rectification : rectif@example.fr');
    expect(mail.html).toContain('href="mailto:rectif@example.fr"');
    const form = avert('https://www.example.fr/formulaire');
    expect(form.text).toContain('Demande de rectification : formulaire de rectification');
    expect(form.html).toMatch(/href="https:\/\/www\.example\.fr\/formulaire" target="_blank"/);
  });

  it('badge de statut pour chaque condamnation, et compteurs neutres par statut', () => {
    const { html, text } = render(data, 'alpha');
    expect(html).toContain('<span class="statut statut--definitive"><span class="sr-only">Statut\u00a0: </span>Définitive</span>');
    expect(text).toContain('Appel en cours — présomption d’innocence');
    expect(text).toContain('Pourvoi en cassation en cours — présomption d’innocence');
    expect(text).not.toMatch(/présumé innocent\b/);
    expect(text).toContain('Statut non confirmé');
    expect(html.match(/class="statut statut--/g)).toHaveLength(5); // 4 membres + 1 ancien dirigeant
    expect(text).toContain('5 condamnations comptées sur cette page');
    expect(text).toContain('Définitive : 2');
    expect(text).toContain('Appel en cours : 1');
    expect(text).toContain('Pourvoi en cassation en cours : 1');
    expect(text).toContain('Statut non confirmé : 1');
  });

  it('chaque ligne : personne, rôle, infraction, faits, juridiction, date, peine, nature, source et citation dépliable', () => {
    const { html, text } = render(data, 'alpha');
    expect(text).toContain('Membre0 Fictif — député de la 1re circonscription de Nulle-Part');
    expect(text).toContain('Infraction : détournement de fonds publics');
    expect(text).toContain('Faits : Emplois fictifs entre 2010 et 2012.');
    expect(text).toContain('Juridiction : tribunal correctionnel de Paris');
    expect(text).toContain('Décision rendue : le 15 janvier 2020');
    expect(html).toContain('<time dateTime="2020-01-15">le 15 janvier 2020</time>');
    expect(text).toContain('Peine : 6 mois d’emprisonnement avec sursis');
    expect(text).toContain('Nature : pénale · faits liés à un mandat ou à une activité politique');
    expect(text).toContain('Nature : financière · faits sans lien avec un mandat politique');
    expect(html).toMatch(/<a href="https:\/\/www\.journal\.example\.fr\/article-1" target="_blank" rel="noopener noreferrer"/);
    expect(html).toMatch(/<details class="condamnation__citation"><summary>Citation/);
    expect(text).toContain('« Le tribunal a condamné la personne à une amende. »');
  });

  it('liste regroupée par famille, puis par catégorie de personne, puis par date (plus récente d’abord)', () => {
    const { html } = render(familles, 'alpha');
    // familles dans l'ordre de gravité, familles vides omises de la liste
    const h3 = [...html.matchAll(/<h3 id="justice-f-([a-z]+)">/g)].map((m) => m[1]);
    expect(h3).toEqual(['probite', 'violences', 'haine', 'diffamation', 'autres']);
    const titres = (f: string) =>
      [...(sectionFamille(html, f).matchAll(/<h4 id="[^"]+">([^<]+)/g))].map((m) => m[1]?.trim());
    expect(titres('probite')).toEqual(['Le parti (personne morale)', 'Anciens dirigeants', 'Parlementaires en exercice']);
    expect(titres('diffamation')).toEqual(['Prénom Alpha', 'Parlementaires en exercice']);
    // à l'intérieur d'une catégorie : date décroissante, pas l'ordre alphabétique des personnes
    const personnes = [...sectionFamille(html, 'probite').matchAll(/<p class="condamnation__qui"><strong>([^<]+)/g)].map((m) => m[1]);
    expect(personnes).toEqual(['Parti Alpha', 'Ancien Chef', 'Zeta Membre', 'Alpha Vieux']);
    // aucune famille vide affichée dans la liste
    const vide = render(appData({ pc: justiceFile('pc', { condamnations: [condamnation({ famille: 'haine' })] }) }), 'gamma');
    expect([...vide.html.matchAll(/<h3 id="justice-f-([a-z]+)">/g)].map((m) => m[1])).toEqual(['haine']);
  });

  it('synthèse en tête de section : compteurs par famille (candidat, parti, membres actuels), Probité mise en avant', () => {
    const { html, text } = render(familles, 'alpha');
    // en tête de section, avant le bandeau et la liste
    const pos = (needle: string) => html.indexOf(needle);
    expect(pos('id="justice-synthese"')).toBeGreaterThan(pos('id="justice-title"'));
    expect(pos('id="justice-synthese"')).toBeLessThan(pos('Périmètre et précautions'));
    expect(pos('id="justice-synthese"')).toBeLessThan(pos('id="justice-f-probite"'));
    // les cinq familles, dans l'ordre de gravité, familles à zéro comprises ; Probité en premier, pictogramme et mention
    const lignes = [...html.matchAll(/<li class="jfam jfam--([a-z]+)( jfam--vide)?">/g)].map((m) => m[1]);
    expect(lignes).toEqual(['probite', 'violences', 'haine', 'diffamation', 'autres']);
    const probite = html.slice(pos('class="jfam jfam--probite"'), pos('class="jfam jfam--violences'));
    expect(probite).toContain('<svg class="picto"');
    expect(probite).toContain('aria-hidden="true"');
    expect(text).toContain(
      'Probité : argent public, corruption, fraude 4 Atteintes à la probité : manquement au devoir d’exemplarité des élus. Prénom Alpha : 0 · Le parti (personne morale) : 1 · Membres actuels : 3 Statut des décisions : définitive 3 · appel en cours 1',
    );
    expect(text).toContain('Propos : diffamation, injure 2 Prénom Alpha : 1 · Le parti (personne morale) : 0 · Membres actuels : 1 Statut des décisions : définitive 2');
    expect(text).toContain('Violences contre les personnes 1 Prénom Alpha : 0 · Le parti (personne morale) : 0 · Membres actuels : 1 Statut des décisions : pourvoi en cours 1');
    expect(text).toContain('Propos : haine, discrimination, négationnisme 1 Prénom Alpha : 0 · Le parti (personne morale) : 0 · Membres actuels : 1 Statut des décisions : non confirmé 1');
    // le total reste lisible par un lecteur d'écran (« : 4 condamnations »)
    expect(probite).toMatch(/<span class="jfam__total"><span class="sr-only">\u00a0: <\/span>4<span class="sr-only"> condamnations<\/span><\/span>/);
    expect(text).toContain('9 condamnations comptées sur cette page');
    // une seule mention « exemplarité » dans la synthèse, et aucune dans les autres familles
    expect(html.slice(pos('class="jfam jfam--violences'), pos('class="compteurs"'))).not.toContain('exemplarité');
  });

  it('badge de famille sur chaque condamnation, secondaire par rapport au badge de statut', () => {
    const { html } = render(familles, 'alpha');
    const items = html.split('<li class="condamnation"').slice(1);
    expect(items).toHaveLength(9);
    for (const item of items) {
      const famille = /^ data-famille="([a-z]+)"/.exec(item)?.[1] ?? '';
      expect(['probite', 'violences', 'haine', 'diffamation', 'autres']).toContain(famille);
      // statut d'abord (en-tête de la condamnation), famille ensuite
      expect(item.indexOf('class="statut statut--')).toBeGreaterThan(0);
      expect(item.indexOf(`class="famille famille--${famille}"`)).toBeGreaterThan(item.indexOf('class="statut statut--'));
      expect(item).toContain('<span class="sr-only">Famille\u00a0: </span>');
    }
    expect(html).toMatch(/<span class="famille famille--probite"><svg class="picto"[^>]*aria-hidden="true"/);
    expect(html).toContain('<span class="sr-only">Famille\u00a0: </span>Propos\u00a0: diffamation, injure</span>');
  });

  it('filtre par famille : une case par famille, toutes cochées au départ', () => {
    const { html, text } = render(familles, 'alpha');
    expect(html).toContain('<legend>Familles affichées dans la liste</legend>');
    const cases = [...html.matchAll(/<input type="checkbox" name="famille"( checked="")? value="([a-z]+)"/g)].map((m) => [m[2], m[1] !== undefined]);
    expect(cases).toEqual([
      ['probite', true],
      ['violences', true],
      ['haine', true],
      ['diffamation', true],
      ['autres', true],
    ]);
    // chaque case est étiquetée (label englobant) avec le nombre de condamnations de la famille
    expect(text).toContain('Probité : argent public, corruption, fraude (4) Violences contre les personnes (1)');
    expect(html).toContain('role="status"');
    expect(text).toContain('Toutes les familles sont affichées (9 condamnations).');
    expect(text).not.toContain('Tout afficher');
    // rien à filtrer : ni filtre ni liste
    expect(render(data, 'gamma').html).not.toContain('Familles affichées');
  });

  it('une condamnation rejetée au build n’est jamais affichée', () => {
    expect(render(data, 'alpha').html).not.toContain('MARQUEUR-REJET');
    expect(render(data, 'beta').html).not.toContain('MARQUEUR-REJET');
  });

  it('condamnation d’un autre candidat du parti : renvoi vers sa page, pas mêlée aux membres', () => {
    const { html, text } = render(data, 'alpha');
    expect(text).toContain('Prénom Beta (autre candidature issue de ce parti) : 1 condamnation relevée, présentée sur sa page.');
    expect(html).toContain('href="#/candidat/beta"');
    // la liste du parti n'est pas vide : « retenue », jamais « trouvée »
    expect(text).toContain('État de la recherche Prénom Alpha Aucune condamnation retenue dans les sources consultées pour le périmètre retenu.');
    expect(text).toContain('Parti A : le parti et ses membres 5 condamnations comptées ci-dessus (le parti et ses membres actuels).');
    expect(text).not.toContain(AUCUNE);
  });

  it('candidat rattaché à deux partis : ses condamnations une seule fois (sources réunies), puis un bloc par parti', () => {
    const { html, text } = render(data, 'beta');
    expect(text).toMatch(/Prénom Beta \(1\)/);
    expect(html).toContain('https://www.b.example.fr/beta');
    expect(html).toContain('https://www.a.example.fr/beta');
    expect([...html.matchAll(/<li class="jbloc" data-parti="(p[a-z])">/g)].map((m) => m[1])).toEqual(['pb', 'pa']);
    // plusieurs partis : le nom du parti précise chaque catégorie de membres
    expect([...html.matchAll(/<h4 id="[^"]+">([^<]+)/g)].map((m) => m[1]?.trim())).toEqual([
      'Prénom Beta',
      'Anciens dirigeants — Parti A',
      'Parlementaires en exercice — Parti A',
    ]);
    expect(text).toContain('Les partis (personnes morales) : 0');
    expect(text).toContain('Parti B : le parti et ses membres Aucune condamnation retenue dans les sources consultées pour le périmètre retenu.');
    expect(text).toContain('Prénom Beta est membre du Parti A.');
    // Parti B : aucune condamnation de membre ; Parti A : 5 → total 6 sur la page
    expect(text).toContain('6 condamnations comptées sur cette page');
  });

  it('message vide : fiche lue sans aucune condamnation', () => {
    const { html, text } = render(data, 'gamma');
    expect(text).toContain(AUCUNE);
    expect(html.match(new RegExp(AUCUNE.replace(/[.]/g, '\\.'), 'g'))).toHaveLength(2); // le candidat et son parti
    expect(html).not.toContain('class="condamnation"');
    expect(text).toContain('0 condamnation comptée sur cette page');
    expect(text).toContain('Définitive : 0');
  });

  it('liste de condamnations absente : présentation affichée, condamnations « recherche en cours »', () => {
    const sansListe = appData({ pc: justiceFile('pc', { condamnations: undefined }) });
    const { text } = render(sansListe, 'gamma');
    expect(text).toContain('Parti fondé en 2016.');
    expect(text.split(EN_COURS.replace('\u00a0', ' ')).length - 1).toBe(2); // le candidat et son parti
    expect(text).not.toContain(AUCUNE);
    expect(text).not.toContain(AUCUNE_RETENUE);
    expect(text).not.toContain('condamnation comptée');
  });

  it('entrées toutes rejetées au contrôle : jamais « aucune condamnation trouvée »', () => {
    const rejetees = appData({ pc: justiceFile('pc', { condamnations: [condamnation({ dateDecision: '2006-13' }), condamnation({ sources: [] })] }) });
    const { text } = render(rejetees, 'gamma');
    expect(text).not.toContain(AUCUNE);
    expect(text).toContain(AUCUNE_RETENUE);
    expect(text).toContain('Parti C : le parti et ses membres Aucune condamnation retenue dans les sources consultées pour le périmètre retenu.');
    expect(text).not.toContain('Dupont Camille');
  });

  it('dates partielles affichées « en 1998 », « en mai 2015 » ; tri chronologique (plus récente d’abord)', () => {
    const dates = appData({
      pc: justiceFile('pc', {
        condamnations: [
          ...['1998', '2015-05-12', '1990-05', '2015', '2015-05'].map((dateDecision, i) =>
            condamnation({ personne: 'Prénom Gamma', categorie: 'candidat', dateDecision, juridiction: `juridiction ${String(i)}` }),
          ),
          condamnation({ personne: 'Zeta Membre', dateDecision: '2001' }),
          condamnation({ personne: 'Zeta Membre', dateDecision: '2001-03-02' }),
          condamnation({ personne: 'Alpha Membre', dateDecision: '1995' }),
        ],
      }),
    });
    const { html, text } = render(dates, 'gamma');
    const affichees = [...html.matchAll(/<time dateTime="([^"]+)">([^<]+)<\/time>/g)].map((m) => [m[1], m[2]]);
    expect(affichees).toEqual([
      // le candidat : plus récente d'abord
      ['2015-05-12', 'le 12 mai 2015'],
      ['2015-05', 'en mai 2015'],
      ['2015', 'en 2015'],
      ['1998', 'en 1998'],
      ['1990-05', 'en mai 1990'],
      // parlementaires : plus récente d'abord (même règle que pour le candidat)
      ['2001-03-02', 'le 2 mars 2001'],
      ['2001', 'en 2001'],
      ['1995', 'en 1995'],
    ]);
    expect(text).toContain('Décision rendue : en 1998');
    expect(text).toContain('Décision rendue : en mai 1990');
    expect(text).toContain('8 condamnations comptées sur cette page');
  });

  it('candidat à deux partis, même date partielle dans les deux fiches : jamais fusionnées (deux décisions possibles)', () => {
    const cand = (url: string) =>
      condamnation({ personne: 'Prénom Beta', categorie: 'candidat', roleActuel: null, dateDecision: '2018', sources: [source({ url })] });
    const deux = appData({ pb: justiceFile('pb', { condamnations: [cand('https://www.b.example.fr/x')] }), pa: justiceFile('pa', { condamnations: [cand('https://www.a.example.fr/x')] }) });
    const { html, text } = render(deux, 'beta');
    expect(text).toMatch(/Prénom Beta \(2\)/);
    expect(html.match(/<time dateTime="2018">en 2018<\/time>/g)).toHaveLength(2);
  });

  it('fiche absente : « recherche en cours », jamais « aucune condamnation trouvée »', () => {
    const sans = appData({ pa: justiceFile('pa') });
    const { text } = render(sans, 'gamma');
    expect(text).toContain('Recherche en cours : aucune liste n’est encore publiée.');
    expect(text).toContain('Présentation du parti en cours de documentation.');
    expect(text).toContain('Biographie en cours de documentation.');
    expect(text).toContain('Liste en cours d’établissement');
    expect(text).not.toContain(AUCUNE);
    expect(text).not.toContain('condamnation comptée');
  });
});

// Appartenance (round 7) — Parti A : un membre, un membre suspendu soutenu par le parti, le parti (personne morale) ;
// passif : un exclu à cause de l'affaire (deux décisions), un retiré, un décédé, et un ancien député (anciens/).
const fichesAppart = {
  pa: justiceFile('pa', {
    condamnations: [
      condamnation({ personne: 'Membre Actuel', famille: 'probite', dateDecision: '2020-01-01' }),
      condamnation({ personne: 'Membre Suspendu', categorie: 'senateur', famille: 'autres', dateDecision: '2021-01-01' }),
      condamnation({ personne: 'Parti Alpha', categorie: 'parti', roleActuel: null, famille: 'probite', dateDecision: '2012-02-02' }),
      condamnation({ personne: 'Fondateur Exclu', categorie: 'ancien_dirigeant', famille: 'haine', dateDecision: '1990' }),
      condamnation({ personne: 'Fondateur Exclu', categorie: 'ancien_dirigeant', famille: 'haine', dateDecision: '2016-01-01', statut: 'inconnu' }),
      condamnation({ personne: 'Ancien Président', categorie: 'ancien_dirigeant', famille: 'probite', dateDecision: '2021-03-01' }),
      condamnation({ personne: 'Ancien Trésorier', categorie: 'ancien_dirigeant', famille: 'probite', dateDecision: '1997' }),
    ],
  }),
};
const appart = appData(fichesAppart, {
  membres: {
    pa: membresFile('pa', [
      membre('Membre Actuel'),
      membre('Membre Suspendu', { statutMembre: 'suspendu', depuis: '2026-09-25', reactionParti: 'La direction lui a apporté son soutien public.' }),
      membre('Parti Alpha', { statutMembre: 'personne_morale', depuis: null }),
      membre('Fondateur Exclu', { statutMembre: 'exclu', depuis: '2015-08-20', lienAvecCondamnation: 'oui', detail: 'Exclu le 20 août 2015 pour ses propos.' }),
      membre('Ancien Président', { statutMembre: 'retire', depuis: '2016-11', detail: 'Retiré depuis 2016, adhésion non renouvelée.', reactionParti: 'Le président du parti lui a apporté son « soutien ».' }),
      membre('Ancien Trésorier', { statutMembre: 'decede', depuis: '2017-03-21', detail: 'Mort en 2017.' }),
    ]),
  },
  anciens: { pa: anciensFile('pa', [ancienne({ personne: 'Ancien Député', famille: 'probite', dateDecision: '2019-06-01' })]) },
});

describe('appartenance actuelle : niveau 1 compté, niveau 2 « Passif » à part', () => {
  const { html, text } = render(appart, 'alpha');
  const pos = (needle: string) => html.indexOf(needle);

  it('synthèse et compteurs : niveau 1 seul (membres actuels, suspendus compris) + ligne discrète du passif', () => {
    expect(text).toContain('Probité : argent public, corruption, fraude 2 Atteintes à la probité : manquement au devoir d’exemplarité des élus. Prénom Alpha : 0 · Le parti (personne morale) : 1 · Membres actuels : 1');
    expect(text).toContain('Autres infractions 1 Prénom Alpha : 0 · Le parti (personne morale) : 0 · Membres actuels : 1');
    expect(text).toContain('Propos : haine, discrimination, négationnisme 0 ');
    expect(text).toContain('+ 5 chez d’anciens membres, non comptées dans ces totaux : Probité 3 · Propos haine 2 (voir le passif).');
    expect(text).toContain('3 condamnations comptées sur cette page (la personne candidate, le parti, ses membres actuels), par statut');
    expect(html).toContain('href="#/candidat/alpha"');
  });

  it('passif : section distincte, sous la liste principale et avant l’état de la recherche, titre et intro', () => {
    expect(pos('id="justice-passif"')).toBeGreaterThan(pos('id="justice-f-autres"'));
    expect(pos('id="justice-passif"')).toBeLessThan(pos('id="justice-etat"'));
    expect(html).toMatch(/<section class="jpassif" aria-labelledby="justice-passif"><h3 id="justice-passif" tabindex="-1">Passif\u00a0: anciens membres condamnés \(non comptés dans les totaux\)<\/h3>/);
    expect(text).toContain('5 condamnations de personnes qui ne sont plus membres du parti');
    // regroupé par famille (ordre de gravité), puis par personne (décision la plus récente d'abord)
    const passif = html.slice(pos('id="justice-passif"'), pos('id="justice-etat"'));
    expect([...passif.matchAll(/<h4 id="justice-passif-([a-z]+)">/g)].map((m) => m[1])).toEqual(['probite', 'haine']);
    expect([...passif.matchAll(/<p class="jpersonne__qui"><strong>([^<]+)/g)].map((m) => m[1])).toEqual([
      'Ancien Président',
      'Ancien Député',
      'Ancien Trésorier',
      'Fondateur Exclu',
    ]);
    // une seule ligne de contexte par personne, même avec deux décisions
    expect(passif.match(/class="jpersonne__contexte"/g)).toHaveLength(4);
    expect(passif.match(/<li class="condamnation"/g)).toHaveLength(5);
    // aucune condamnation du passif dans la liste principale, et inversement
    const principale = html.slice(pos('id="justice-f-probite"'), pos('id="justice-passif"'));
    expect(principale).not.toMatch(/Fondateur Exclu|Ancien Président|Ancien Député|Ancien Trésorier/);
    expect(passif).not.toMatch(/Membre Actuel|Membre Suspendu|Parti Alpha/);
  });

  it('lignes de contexte, badges épicènes, mention positive de l’exclusion, réaction du parti aux deux niveaux', () => {
    const passif = visible(html.slice(pos('id="justice-passif"'), pos('id="justice-etat"'))).text;
    expect(passif).toContain('Fondateur Exclu — député de la 1re circonscription de Nulle-Part Exclusion du parti Exclusion du parti en 2015 — en lien avec l’affaire Exclu le 20 août 2015 pour ses propos. Le parti a écarté cette personne après l’affaire.');
    expect(passif).toContain('Retrait — adhésion non confirmée Retrait de la vie politique en 2016, adhésion au parti non confirmée');
    expect(passif).toContain('Réaction du parti à son égard : Le président du parti lui a apporté son « soutien ».');
    expect(passif).toContain('Décès Décès en 2017');
    expect(passif).toContain('Départ du parti A quitté le parti en 2018 — pour un autre motif A quitté le parti en 2018 pour une autre formation.');
    // niveau 1 : badge sur chaque condamnation, « Suspension depuis … », réaction du parti, source dépliable
    const principale = visible(html.slice(pos('id="justice-f-probite"'), pos('id="justice-passif"'))).text;
    expect(principale).toContain('Suspension depuis le 25 septembre 2026 Réaction du parti à son égard : La direction lui a apporté son soutien public.');
    expect(principale).toMatch(/Parti Alpha.*Parti Source de l’appartenance/);
    expect(html.match(/<span class="appart appart--[a-z_]+"><span class="sr-only">Appartenance au parti\u00a0: <\/span>/g)).toHaveLength(3 + 4);
    expect(html).toContain('<summary>Source de l’appartenance</summary>');
  });

  it('chaque condamnation : badge d’appartenance (sur elle au niveau 1, sur le bloc de la personne au passif)', () => {
    const items = html.split('<li class="condamnation"').slice(1);
    expect(items).toHaveLength(8);
    const n1 = html.slice(pos('id="justice-f-probite"'), pos('id="justice-passif"')).split('<li class="condamnation"').slice(1);
    expect(n1).toHaveLength(3);
    for (const item of n1) expect(item).toContain('class="appart appart--');
    for (const bloc of html.slice(pos('id="justice-passif"')).split('<li class="jpersonne"').slice(1)) expect(bloc).toContain('class="appart appart--');
  });

  it('filtre : les familles masquent aussi le passif ; état annoncé ; état de la recherche par niveau', () => {
    expect(text).toContain('Toutes les familles sont affichées (3 condamnations, + 5 chez d’anciens membres).');
    expect(text).toMatch(/Probité : argent public, corruption, fraude \(2, \+ 3 anciens\)/);
    expect(text).toContain('Parti A : le parti et ses membres 3 condamnations comptées ci-dessus (le parti et ses membres actuels). 5 condamnations d’anciens membres dans le passif, non comptées.');
    expect(text).toContain('Recherche sur les anciens membres (anciens dirigeants, anciens parlementaires ou ministres depuis 2012) : sources consultées le 18/10/2026 · personnes vérifiées : 12.');
  });

  it('seulement des anciens membres : synthèse à zéro, passif affiché, jamais « aucune condamnation trouvée »', () => {
    const seul = appData(
      { pc: justiceFile('pc', { condamnations: [condamnation({ personne: 'Parti Parti', famille: 'probite' })] }) },
      { membres: { pc: membresFile('pc', [membre('Parti Parti', { statutMembre: 'depart', depuis: '2020' })]) } },
    );
    const r = render(seul, 'gamma');
    expect(r.text).toContain('0 condamnation comptée sur cette page');
    expect(r.html).toContain('id="justice-passif"');
    expect(r.text).toContain(AUCUNE_ACTUELS);
    expect(r.text).not.toContain(AUCUNE);
    // fiche membres/ absente : statut inconnu (passif), signalé dans l'état de la recherche
    const sansMembres = appData({ pc: justiceFile('pc', { condamnations: [condamnation({ personne: 'Sans Statut' })] }) }, { membres: {} });
    const r2 = render(sansMembres, 'gamma');
    expect(r2.text).toContain('Statut inconnu Appartenance actuelle au parti non établie par la recherche');
    expect(r2.text).toContain('Appartenance actuelle des personnes condamnées : non documentée (statut inconnu).');
  });
});

describe('neutralité visuelle', () => {
  it('badges de statut et d’appartenance, familles (Probité comprise), filtre, passif et cartes : seulement les couleurs neutres de la palette', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
    for (const sel of ['statut', 'famille', 'jfam', 'jfamille', 'jfiltre', 'picto', 'pcard', 'appart', 'jpassif', 'jpersonne', 'jsynthese']) {
      const rules = [...css.matchAll(new RegExp(`\\.${sel}[^{]*\\{([^}]*)\\}`, 'g'))].map((m) => m[1] ?? '');
      expect(rules.length, sel).toBeGreaterThan(0);
      for (const r of rules)
        for (const [, v] of r.matchAll(/(?:color|background|border[a-z-]*|outline):\s*([^;]+);/g)) expect(v, sel).not.toMatch(/#|rgb|hsl|red|orange/i);
    }
  });
});
