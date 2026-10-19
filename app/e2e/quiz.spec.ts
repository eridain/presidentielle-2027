import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renseigne, SITE } from '../src/config';
import {
  compteursCarte,
  contexteAppartenance,
  FAMILLE_LABEL,
  FAMILLES,
  formatCompteur,
  libelleAppartenance,
  MENTION_ECARTEE,
  MENTION_PROBITE,
  pageJustice,
  passifCarte,
  TITRE_PASSIF,
} from '../src/lib/justice';
import { cleQuestions } from '../src/lib/share';
import type { AppData, CategorieIndex } from '../src/types';

/** Données du build testé (src/generated/data.json, écrit par npm run data). */
const DATA = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src', 'generated', 'data.json'), 'utf8')) as AppData;

/** Origine du site testé (playwright.config.ts : port 4173, ou E2E_PORT). */
const HOST = `localhost:${process.env.E2E_PORT ?? '4173'}`;

/** Échoue sur toute erreur console et toute requête hors de l'origine du site (aucun tiers). */
function guard(page: Page) {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol !== 'data:' && url.host !== HOST) problems.push(`requête externe : ${req.url()}`);
  });
  return problems;
}

async function axe(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${label} — ${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

/**
 * Textes affichés contenant une espace sécable collée à un guillemet français ou devant : ; ! ?
 * (le guillemet ou le signe pourrait alors passer seul à la ligne). Renvoie les extraits fautifs.
 */
async function breakableTypo(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let text = '';
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const tag = n.parentElement?.tagName;
      if (tag !== 'SCRIPT' && tag !== 'STYLE') text += n.nodeValue ?? '';
    }
    const bad: string[] = [];
    for (const m of text.matchAll(/«[ \t\r\n]|[ \t\r\n][»:;!?]/g))
      bad.push(text.slice(Math.max(0, m.index - 40), m.index + 10));
    return bad;
  });
}

/** Aucun débordement horizontal (texte coupé sur mobile). */
async function sansDebordement(page: Page, label: string) {
  const largeurs = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(largeurs[0], `${label} : largeur du document / de la fenêtre`).toBeLessThanOrEqual(largeurs[1] ?? 0);
}

/** Identifiants des 14 candidats (data/candidats.json). */
const CANDIDATS = ['melenchon', 'roussel', 'ruffin', 'tondelier', 'batho', 'glucksmann', 'attal', 'philippe', 'retailleau', 'bertrand', 'lisnard', 'lepen', 'zemmour', 'dupontaignan'];

/** Répond à tout le parcours en cours (en partant de la question 1) et arrive sur la page de résultats. */
async function answerAll(page: Page) {
  const pattern = ['Oui', 'Non', 'Oui', 'Passer', 'Non'];
  const label = page.locator('.progress__label');
  const total = Number(/sur (\d+)/.exec((await label.textContent()) ?? '')?.[1]);
  expect(total).toBeGreaterThan(0);
  for (let n = 1; n <= total; n += 1) {
    await expect(label).toContainText(`Question ${n} sur ${total}`);
    const choice = pattern[(n - 1) % pattern.length] ?? 'Oui';
    await page.getByRole('group', { name: 'Votre réponse' }).getByRole('button', { name: choice, exact: true }).click();
    await expect(page.locator('.reveal')).toBeVisible();
    await page.getByRole('link', { name: n === total ? /Voir mes résultats/ : /Question suivante/ }).click();
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Vos résultats' })).toBeVisible();
}

test('accueil : principe, modes et absence de ressource tierce', async ({ page }) => {
  const problems = guard(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('votes réels');
  await expect(page.getByRole('button', { name: /Mode rapide/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Mode complet/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Lire la méthodologie' })).toBeVisible();
  await axe(page, 'accueil');
  expect(problems).toEqual([]);
});

test('parcours rapide complet jusqu’à la restitution, persistance et partage par URL', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const problems = guard(page);
  await page.goto('./');
  await page.getByRole('button', { name: /Mode rapide/ }).click();
  await expect(page.locator('.progress__label')).toContainText('Question 1 sur 15');

  // Révélation : résultat du scrutin, groupes de candidats, badges de preuve, lien officiel.
  await page.getByRole('group', { name: 'Votre réponse' }).getByRole('button', { name: 'Oui', exact: true }).click();
  const reveal = page.locator('.reveal');
  await expect(reveal.getByRole('heading', { level: 2 })).toContainText('Vous avez répondu Oui');
  await expect(reveal.getByRole('heading', { name: /Même position que vous/ })).toBeVisible();
  await expect(reveal.getByRole('heading', { name: /Position inverse/ })).toBeVisible();
  await expect(reveal.locator('.badge').first()).toBeVisible();
  await expect(reveal.locator('.scrutin')).toContainText(/scrutin n°\s\d+/);
  await expect(page.getByRole('button', { name: 'Oui', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await axe(page, 'révélation');

  // Retour arrière possible depuis la 2e question.
  await page.getByRole('link', { name: /Question suivante/ }).click();
  await expect(page.locator('.progress__label')).toContainText('Question 2 sur 15');
  await page.getByRole('link', { name: /Précédente/ }).click();
  await expect(page.locator('.progress__label')).toContainText('Question 1 sur 15');
  await expect(page.getByRole('button', { name: 'Oui', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await answerAll(page);
  const ranking = page.locator('.ranking > li');
  expect(await ranking.count()).toBeGreaterThan(0);
  await expect(ranking.first()).toContainText(/questions? comparables?/);
  await expect(page.getByRole('heading', { name: 'Limites à garder en tête' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Répartition par thème' })).toBeVisible();
  await axe(page, 'résultats');

  const order = await page.locator('.ranking .rank__name').allTextContents();
  const shareUrl = await page.locator('#share-url').inputValue();
  expect(shareUrl).toMatch(/#\/resultats\?r=[onp_]+$/);

  // Persistance locale : un rechargement conserve les réponses.
  await page.reload();
  await expect(page.locator('.ranking .rank__name')).toHaveText(order);

  // Option « votes nominatifs uniquement ».
  await page.getByLabel(/Ne compter que les votes nominatifs/).check();
  await expect(page.getByLabel(/Ne compter que les votes nominatifs/)).toBeChecked();

  // Partage : un navigateur vierge retrouve le même classement depuis l'URL seule.
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await other.goto(shareUrl);
  await expect(other.getByRole('heading', { level: 1, name: 'Résultats partagés' })).toBeVisible();
  await expect(other.locator('.ranking .rank__name')).toHaveText(order);
  await fresh.close();

  expect(problems).toEqual([]);
});

test('réponse au clavier et focus sur la révélation', async ({ page }) => {
  await page.goto('./#/question/retraites-64');
  const oui = page.getByRole('button', { name: 'Non', exact: true });
  await oui.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.reveal__title')).toBeFocused();
  await expect(page.locator('.scrutin')).toContainText('Motion de censure');
});

test('mode sombre : contrastes conformes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./#/question/retraites-64');
  await page.getByRole('button', { name: 'Non', exact: true }).click();
  await expect(page.locator('.reveal')).toBeVisible();
  await axe(page, 'révélation sombre');
  await page.goto('./#/candidat/lepen');
  await expect(page.getByRole('heading', { level: 2, name: 'Condamnations en justice' })).toBeVisible();
  await axe(page, 'page candidat sombre');
});

test('pages Méthodologie, Sources et Mentions', async ({ page }) => {
  const problems = guard(page);
  await page.goto('./#/methodologie');
  await expect(page.getByRole('heading', { level: 1, name: 'Méthodologie' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Poids par nature de preuve' })).toContainText('0,25');
  await axe(page, 'méthodologie');
  await page.goto('./#/sources');
  await expect(page.getByRole('heading', { level: 1, name: 'Sources' })).toBeVisible();
  expect(await page.locator('.sources a[target=_blank]').count()).toBeGreaterThan(30);
  await page.goto('./#/mentions');
  await expect(page.getByText(/site indépendant/i).first()).toBeVisible();
  expect(problems).toEqual([]);
});

test('typographie : aucun guillemet ni signe ( : ; ! ? ) ne peut passer seul à la ligne', async ({ page }) => {
  test.setTimeout(60_000);
  /** Pages du mode approfondi (s'il est présent dans le build) : choix, catégorie, question et révélation, résultat partagé. */
  const pagesApprofondi = (): [string, (() => Promise<void>) | null][] => {
    const c = DATA.approfondi?.categories[0];
    const q = c?.questions.find((r) => !r.existant) ?? c?.questions[0];
    if (!c || !q) return [];
    const r = 'onp'.repeat(c.questions.length).slice(0, c.questions.length);
    return [
      ['./#/approfondi', null],
      [`./#/approfondi/${c.id}`, null],
      [
        `./#/approfondi/${c.id}/question/${q.id}`,
        () => page.getByRole('group', { name: 'Votre réponse' }).getByRole('button', { name: 'Oui', exact: true }).click(),
      ],
      [`./#/approfondi/${c.id}/resultats?r=${r}&k=${cleQuestions(c.questions.map((x) => x.id))}`, null],
    ];
  };
  const pages: [string, (() => Promise<void>) | null][] = [
    ['./', null],
    ['./#/question/ordonnances-travail', null],
    [
      './#/question/ordonnances-travail',
      () => page.getByRole('group', { name: 'Votre réponse' }).getByRole('button', { name: 'Oui', exact: true }).click(),
    ],
    [
      './#/question/retraites-64',
      () => page.getByRole('group', { name: 'Votre réponse' }).getByRole('button', { name: 'Non', exact: true }).click(),
    ],
    [
      './#/question/lpm-2024-2030',
      () => page.getByRole('group', { name: 'Votre réponse' }).getByRole('button', { name: 'Oui', exact: true }).click(),
    ],
    [`./#/resultats?r=${'onp'.repeat(11)}`, null],
    ['./#/candidats', null],
    ...CANDIDATS.map((id): [string, null] => [`./#/candidat/${id}`, null]),
    ['./#/methodologie', null],
    ['./#/sources', null],
    ['./#/mentions', null],
    ...pagesApprofondi(),
  ];
  for (const [url, action] of pages) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    if (action) {
      await action();
      await expect(page.locator('.reveal')).toBeVisible();
    }
    expect(await breakableTypo(page), url).toEqual([]);
  }
});

test('titre « L’autre point de vue » : « Non » ? reste sur une seule ligne, même très étroit', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('./#/question/ordonnances-travail');
  await page.getByRole('group', { name: 'Votre réponse' }).getByRole('button', { name: 'Oui', exact: true }).click();
  const heading = page.locator('.otherside h3');
  await expect(heading).toHaveText(/L’autre point de vue\s:\spourquoi\s«\sNon\s»\s\?/);
  const unit = heading.locator('.nowrap');
  await expect(unit).toHaveText(/^«\u00a0Non\u00a0»\u00a0\?$/);
  // un fragment par nœud de texte, tous sur la même ligne
  const tops = await unit.evaluate((el) => [...new Set([...el.getClientRects()].map((r) => Math.round(r.top)))]);
  expect(tops).toHaveLength(1);
});

test('proxy daté : pas de proxy hors période (Glucksmann, ordonnances 2017)', async ({ page }) => {
  await page.goto('./#/question/ordonnances-travail');
  await page.getByRole('group', { name: 'Votre réponse' }).getByRole('button', { name: 'Oui', exact: true }).click();
  const card = page.locator('.cgroup--unknown .cand').filter({ hasText: 'Raphaël Glucksmann' });
  await expect(card).toBeVisible();
  await expect(card.locator('.cand__detail')).toContainText('Pas de proxy de groupe à cette date');
  await expect(card.locator('.cand__detail')).toContainText('1er mars 2019');
  await page.goto('./#/methodologie');
  const list = page.locator('.proxies-dates li');
  await expect(list).toHaveCount(3);
  await expect(list).toContainText(['Xavier Bertrand', 'Raphaël Glucksmann', 'David Lisnard']);
});

test('mentions : champs éditoriaux renseignés affichés, champs vides jamais affichés', async ({ page }) => {
  await page.goto('./#/mentions');
  await expect(page.getByRole('heading', { level: 2, name: 'Éditeur et hébergement' })).toBeVisible();
  const champs = [SITE.editeur, SITE.contact, SITE.hebergeur].filter((v) => renseigne(v) !== null);
  await expect(page.locator('.edition li')).toHaveCount(champs.length);
  if (champs.length === 0) await expect(page.getByText('Site à usage personnel.', { exact: true })).toBeVisible();
  else await expect(page.getByText('Site à usage personnel.', { exact: true })).toHaveCount(0);
  if (renseigne(SITE.contact)?.includes('@')) await expect(page.locator('.edition a[href^="mailto:"]')).toHaveAttribute('href', `mailto:${SITE.contact ?? ''}`);
  const text = (await page.locator('main').textContent()) ?? '';
  expect(text).not.toMatch(/undefined|null|NaN|non renseigné|à compléter/);
  await axe(page, 'mentions');
});

test('En clair : question simplifiée, deux camps au même format, lexique, texte en détail replié', async ({ page }) => {
  const problems = guard(page);
  await page.goto('./#/question/retraites-64');
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toHaveText(/^Êtes-vous pour le recul de l'âge légal de départ à la retraite de 62 à 64 ans\s\?$/);
  await expect(page.locator('.question__titre')).toHaveText('Retraite à 64 ans (réforme 2023)');
  // la question officielle reste visible, en plus petit
  await expect(page.locator('.question__full')).toContainText('Formulation complète');
  await expect(page.locator('.question__full')).toContainText('Êtes-vous favorable au report progressif');

  const enClair = page.getByRole('region', { name: 'En clair' });
  await expect(enClair).toBeVisible();
  await expect(enClair.locator('.enclair__bref')).toContainText('motion de censure');
  // convention : « Oui » = Oui à la question simplifiée (ici, favorable à la réforme), pas « pour » au scrutin
  const oui = enClair.getByRole('region', { name: 'Ceux qui disent Oui' });
  const non = enClair.getByRole('region', { name: 'Ceux qui disent Non' });
  await expect(oui).toContainText('Ses défenseurs');
  await expect(non).toContainText('Ses opposants');
  // même poids visuel : même taille de police, même bordure, même largeur
  const style = (l: typeof oui) =>
    l.evaluate((el) => {
      const cs = getComputedStyle(el);
      return [cs.borderTopWidth, cs.borderTopStyle, cs.backgroundColor, cs.fontSize, Math.round(el.getBoundingClientRect().width)];
    });
  expect(await style(oui)).toEqual(await style(non));
  await expect(enClair.getByRole('heading', { name: 'Ce qui s’est passé' })).toBeVisible();
  await expect(enClair.getByRole('heading', { name: 'Mots à connaître' })).toBeVisible();
  await expect(enClair.locator('.lexique dt')).toContainText(['49.3', 'Motion de censure']);

  // contexte détaillé : replié par défaut, ouvrable au clavier
  const details = page.locator('details.context');
  await expect(details.locator('summary')).toHaveText('Le texte en détail (sources)');
  await expect(details).not.toHaveAttribute('open', '');
  await details.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await expect(details.locator('a').first()).toBeVisible();
  await axe(page, 'question (En clair)');

  // révélation : la question simplifiée est rappelée en tête
  await page.getByRole('group', { name: 'Votre réponse' }).getByRole('button', { name: 'Non', exact: true }).click();
  await expect(page.locator('.reveal__q')).toContainText('Êtes-vous pour le recul de l');
  await expect(page.locator('.reveal__title')).toBeFocused();
  expect(problems).toEqual([]);
});

test('En clair : l’ordre des deux camps alterne d’une question à l’autre', async ({ page }) => {
  const order = async (id: string) => {
    await page.goto(`./#/question/${id}`);
    return page.locator('.camp__title').allTextContents();
  };
  // ordonnances-travail : 1re question de la liste ; isf-ifi : 2e
  expect(await order('ordonnances-travail')).toEqual(['Ceux qui disent Oui', 'Ceux qui disent Non']);
  expect(await order('isf-ifi')).toEqual(['Ceux qui disent Non', 'Ceux qui disent Oui']);
});

test('attribution : une citation d’un autre député n’est jamais présentée comme celle du candidat (LPM 2023)', async ({ page }) => {
  await page.goto('./#/question/lpm-2024-2030');
  await page.getByRole('group', { name: 'Votre réponse' }).getByRole('button', { name: 'Oui', exact: true }).click();
  const lepen = page.locator('.cand').filter({ has: page.getByRole('heading', { name: 'Marine Le Pen' }) });
  await expect(lepen.locator('.cand__arg .label')).toHaveText(/^Argument de son groupe\s:$/);
  await expect(lepen.locator('.cand__quote')).toContainText('nous voterons pour cette LPM');
  await expect(lepen.locator('.cand__attrib')).toHaveText(/^Propos de Laurent Jacobelli \(groupe RN\), pas de Marine Le Pen\.$/);
  await expect(lepen).not.toContainText('Ses raisons');
  // propos du candidat lui-même (orateur vérifié dans le compte rendu) : « Ses raisons », sans mention
  const roussel = page.locator('.cand').filter({ has: page.getByRole('heading', { name: 'Fabien Roussel' }) });
  await expect(roussel.locator('.cand__arg .label')).toHaveText(/^Ses raisons\s:$/);
  await expect(roussel.locator('.cand__attrib')).toHaveCount(0);
  await axe(page, 'révélation (attribution)');
  // la distinction est expliquée dans la Méthodologie
  await page.goto('./#/methodologie');
  await expect(page.getByRole('heading', { level: 2, name: /Propos du candidat ou de son groupe/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /En clair/ })).toBeVisible();
});


const STATUTS = [
  'Définitive',
  'Appel en cours — présomption d’innocence',
  'Pourvoi en cassation en cours — présomption d’innocence',
  'Statut non confirmé',
];
const ALPHABETIQUE = [
  'Gabriel Attal',
  'Delphine Batho',
  'Xavier Bertrand',
  'Nicolas Dupont-Aignan',
  'Raphaël Glucksmann',
  'Marine Le Pen',
  'David Lisnard',
  'Jean-Luc Mélenchon',
  'Édouard Philippe',
  'Bruno Retailleau',
  'Fabien Roussel',
  'François Ruffin',
  'Marine Tondelier',
  'Éric Zemmour',
];

test('Partis & candidats : navigation vers une page parti / candidat', async ({ page }) => {
  const problems = guard(page);
  await page.goto('./');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await nav.getByRole('link', { name: 'Partis & candidats' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Partis & candidats' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Partis & candidats' })).toHaveAttribute('aria-current', 'page');
  // liste : ordre alphabétique (nom de famille), chaque carte mène à une page
  await expect(page.locator('.pcard__nom')).toHaveText(ALPHABETIQUE);
  await axe(page, 'liste des candidats');

  await page.locator('.pcard').filter({ hasText: 'Marine Le Pen' }).click();
  await expect(page).toHaveURL(/#\/candidat\/lepen$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Marine Le Pen' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Partis & candidats' })).toHaveAttribute('aria-current', 'true');
  for (const name of ['Biographie', 'Rassemblement national', 'Ses positions sur les 33 questions', 'Condamnations en justice'])
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^${name}`) })).toBeVisible();

  // positions sur les 33 questions, avec nature de la preuve, repliées puis dépliées
  const positions = page.locator('.positions__item');
  await expect(positions.first()).toBeHidden();
  await page.getByText('Voir les 33 questions, une par une').click();
  await expect(positions).toHaveCount(33);
  await expect(page.locator('.positions .badge').first()).toBeVisible();

  // avertissement, compteurs, badges de statut et sources dépliables
  const avert = page.getByRole('note', { name: 'Périmètre et précautions' });
  await expect(avert).toContainText('identique pour tous les partis');
  await expect(avert).toContainText(/sources consultées à la date du \d{2}\/\d{2}\/\d{4}|Liste en cours d’établissement/);
  await expect(avert).toContainText('une absence de mention ne signifie pas absence de condamnation');
  await expect(avert).toContainText('présumée innocente');
  await expect(avert).toContainText('mises en examen');
  await expect(avert).toContainText('amnistiées');
  if (renseigne(SITE.contactRectification) === null) await expect(avert).not.toContainText(/rectification|à compléter/i);
  else await expect(avert).toContainText('Demande de rectification');
  const items = page.locator('.condamnation');
  const n = await items.count();
  for (let i = 0; i < n; i += 1) {
    const item = items.nth(i);
    await expect(item.locator('.statut')).toHaveCount(1);
    await expect(item.locator('.famille')).toHaveCount(1);
    expect(STATUTS).toContain(((await item.locator('.statut').textContent()) ?? '').replace(/^Statut\s:\s/, ''));
    expect(await item.locator('.condamnation__sources a[target=_blank]').count()).toBeGreaterThan(0);
    // date selon sa précision : « le 16 décembre 2025 », « en mai 2015 », « en 1998 »
    await expect(item.locator('time')).toHaveText(/^(le (1er|[12]?\d|3[01]) \p{L}+ \d{4}|en (\p{L}+ )?\d{4})$/u);
  }
  if (n > 0) {
    const citation = items.first().locator('details.condamnation__citation').first();
    await citation.locator('summary').click();
    await expect(citation.locator('blockquote')).toBeVisible();
    // compteurs : niveau 1 seulement (liste principale), le passif à part
    const n1 = await page.locator('.jfamille .condamnation').count();
    await expect(page.locator('.compteurs')).toContainText(`${String(n1)} condamnation${n1 > 1 ? 's' : ''} comptée`);
  } else {
    await expect(page.locator('.justice')).toContainText(
      /Aucune condamnation (trouvée|retenue) dans les sources consultées pour le périmètre retenu\.|Recherche en cours/,
    );
  }
  await axe(page, 'page candidat');

  // lien vers une question depuis le résumé des positions
  await positions.first().getByRole('link').click();
  await expect(page).toHaveURL(/#\/question\/[a-z0-9-]+$/);
  await expect(page.getByRole('group', { name: 'Votre réponse' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('Partis & candidats : candidat rattaché à deux partis, Méthodologie', async ({ page }) => {
  await page.goto('./#/candidat/glucksmann');
  await expect(page.getByRole('heading', { level: 2, name: /^Place publique/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /^Parti socialiste/ })).toBeVisible();
  await expect(page.getByText('Le Parti socialiste a organisé la primaire sociale-démocrate remportée par Raphaël Glucksmann.')).toBeVisible();
  await expect(page.locator('.jetat li > .label')).toHaveText([
    /^Raphaël Glucksmann$/,
    /^Place publique\s:\sle parti et ses membres$/,
    /^Parti socialiste\s:\sle parti et ses membres$/,
  ]);
  // deux partis : chaque catégorie de membres précise le parti
  await expect(page.locator('.jfamille--probite h4').first()).toHaveText(/^Anciens dirigeants — Parti socialiste/);
  // lien du bandeau vers la section de la Méthodologie
  await page.getByRole('link', { name: 'Périmètre et règles détaillés (Méthodologie)' }).click();
  const h2 = page.getByRole('heading', { level: 2, name: /Condamnations\s:\spérimètre et règles/ });
  await expect(h2).toBeInViewport();
  await expect(h2).toBeFocused();
  await expect(page.locator('main')).toContainText('les mises en examen, gardes à vue, enquêtes, plaintes et procès en cours sans jugement');
  // candidat inconnu : page introuvable
  await page.goto('./#/candidat/inconnu');
  await expect(page.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible();
});

test('familles : synthèse en tête de section, Probité mise en avant, filtre au clavier (page de Marine Le Pen)', async ({ page }) => {
  const problems = guard(page);
  const lepen = DATA.candidats.find((c) => c.id === 'lepen');
  if (!lepen) throw new Error('lepen absent des données');
  const attendu = pageJustice(DATA, lepen);
  const nProbite = attendu.synthese[0]?.total ?? 0;
  expect(nProbite).toBeGreaterThan(0);
  await page.goto('./#/candidat/lepen');

  // synthèse visible, en tête de section (avant le bandeau), cinq familles dans l'ordre de gravité, Probité d'abord
  const synthese = page.getByRole('region', { name: 'Synthèse par famille d’infractions' });
  await expect(synthese).toBeVisible();
  const ordre = await page.locator('.justice').evaluate((el) =>
    [...el.querySelectorAll('.jsynthese, .justice__avert, .jfiltre, .jfamille')].map((n) => n.classList[n.classList.length - 1] ?? ''),
  );
  expect(ordre.slice(0, 3)).toEqual(['jsynthese', 'justice__avert', 'jfiltre']);
  expect(ordre[3]).toBe('jfamille--probite');
  const lignes = synthese.locator('.jfam');
  await expect(lignes).toHaveCount(5);
  await sansDebordement(page, 'page de Marine Le Pen');
  // les blocs de la synthèse restent dans la colonne de texte
  const colonne = await page.locator('article.candidat').evaluate((el) => el.getBoundingClientRect().right);
  for (const b of await lignes.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right))) expect(b).toBeLessThanOrEqual(colonne + 1);
  await expect(lignes.locator('.jfam__nom')).toHaveText(FAMILLES.map((f) => FAMILLE_LABEL[f]));
  const probite = lignes.first();
  await expect(probite).toHaveClass(/jfam--probite/);
  await expect(probite).toContainText(MENTION_PROBITE);
  await expect(probite.locator('svg.picto')).toBeVisible();
  await expect(probite.locator('.jfam__total')).toHaveText(new RegExp(`^\\D*${String(nProbite)}\\D*$`));
  await expect(probite).toContainText(`Marine Le Pen\u00a0: ${String(attendu.synthese[0]?.candidat)}`);
  // pas de couleur d'alerte : bordure et texte du bloc Probité en niveaux de gris
  const couleurs = await probite.evaluate((el) => {
    const cs = getComputedStyle(el);
    return [cs.borderLeftColor, cs.color, cs.backgroundColor];
  });
  for (const c of couleurs) {
    const [r = 0, g = 0, b = 0] = (c.match(/\d+(\.\d+)?/g) ?? []).map(Number);
    expect(Math.max(r, g, b) - Math.min(r, g, b), c).toBeLessThan(16);
  }

  // liste principale (niveau 1) : familles dans l'ordre de gravité, toutes les cases cochées au départ
  const items = page.locator('.jfamille .condamnation');
  await expect(items).toHaveCount(attendu.total);
  const passif = page.locator('.jpassif .condamnation');
  await expect(passif).toHaveCount(attendu.passif.total);
  const pProbite = attendu.passif.familles[0]?.total ?? 0;
  const familles = await page.locator('.jfamille').evaluateAll((els) => els.map((e) => e.getAttribute('aria-labelledby')?.replace('justice-f-', '')));
  expect(familles).toEqual(attendu.familles.filter((f) => f.total > 0).map((f) => f.famille));
  const filtre = page.getByRole('group', { name: 'Familles affichées dans la liste' });
  const cases = filtre.getByRole('checkbox');
  await expect(cases).toHaveCount(5);
  for (let i = 0; i < 5; i += 1) await expect(cases.nth(i)).toBeChecked();

  // décocher « Probité » au clavier : ses condamnations disparaissent de la liste, la synthèse reste complète
  const caseProbite = filtre.getByRole('checkbox', { name: /^Probité/ });
  await caseProbite.focus();
  await page.keyboard.press('Space');
  await expect(caseProbite).not.toBeChecked();
  await expect(page.locator('.condamnation[data-famille="probite"]')).toHaveCount(0);
  await expect(items).toHaveCount(attendu.total - nProbite);
  await expect(page.locator('.jfiltre__etat')).toHaveText(
    `${String(attendu.total - nProbite)} condamnations affichées sur ${String(attendu.total)} (+\u00a0${String(attendu.passif.total - pProbite)} sur ${String(attendu.passif.total)} chez d’anciens membres).`,
  );
  // le filtre agit aussi sur le passif
  await expect(passif).toHaveCount(attendu.passif.total - pProbite);
  await expect(lignes).toHaveCount(5);
  await axe(page, 'page candidat, filtre actif');
  // Tab jusqu'à la case suivante, Espace : deux familles masquées
  await page.keyboard.press('Tab');
  await expect(cases.nth(1)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(cases.nth(1)).not.toBeChecked();
  await expect(page.locator('.condamnation[data-famille="violences"]')).toHaveCount(0);
  // « Tout afficher » au clavier : retour à la liste complète ; le bouton disparaît, le focus passe à la première case
  await page.getByRole('button', { name: 'Tout afficher' }).focus();
  await page.keyboard.press('Enter');
  for (let i = 0; i < 5; i += 1) await expect(cases.nth(i)).toBeChecked();
  await expect(items).toHaveCount(attendu.total);
  await expect(passif).toHaveCount(attendu.passif.total);
  await expect(page.getByRole('button', { name: 'Tout afficher' })).toHaveCount(0);
  await expect(cases.first()).toBeFocused();

  // le badge de statut reste en tête de chaque condamnation, l'étiquette de famille après
  const premier = items.first();
  const ordreBadges = await premier.evaluate((el) => {
    const s = el.querySelector('.statut');
    const f = el.querySelector('.famille');
    return s && f ? s.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING : 0;
  });
  expect(ordreBadges).toBeGreaterThan(0);

  // écrans étroits : rien ne déborde (page candidat et liste)
  await page.setViewportSize({ width: 320, height: 720 });
  await sansDebordement(page, 'page de Marine Le Pen, 320 px');
  await page.goto('./#/candidats');
  await expect(page.locator('.pcard').first()).toBeVisible();
  await sansDebordement(page, 'liste des candidats, 320 px');
  expect(problems).toEqual([]);
});

test('Partis & candidats : compteurs par famille sur chaque carte, option « Probité uniquement »', async ({ page }) => {
  const problems = guard(page);
  await page.goto('./#/candidats');
  await expect(page.locator('.pcard__nom')).toHaveText(ALPHABETIQUE);
  const ligne = (probiteSeule: boolean) =>
    ALPHABETIQUE.map((nom) => {
      const c = DATA.candidats.find((x) => x.nom === nom);
      if (!c) throw new Error(nom);
      const p = pageJustice(DATA, c);
      const compteurs = compteursCarte(p.synthese, probiteSeule);
      if (!p.documente) return /recherche en cours/;
      // « (+N anciens) » à l'écran, texte complet pour les lecteurs d'écran
      const n = passifCarte(p.synthese, probiteSeule);
      const s = n > 1 ? 's' : '';
      const plus = n > 0 ? ` (+${String(n)}\u00a0ancien${s})(+${String(n)} condamnation${s} d’ancien${s} membre${s}, non comptée${s})` : '';
      // « Condamnations par famille : » : préfixe pour lecteurs d'écran (masqué à l'écran)
      return compteurs.length ? `Condamnations par famille\u00a0: ${compteurs.map(formatCompteur).join('\u00a0· ')}${plus}` : /aucune (trouvée|retenue)/;
    });
  await expect(page.locator('.pcard__familles')).toHaveText(ligne(false));
  // ordre alphabétique conservé quel que soit le nombre de condamnations
  await expect(page.locator('.pcard__nom')).toHaveText(ALPHABETIQUE);
  // option au clavier
  const option = page.getByRole('checkbox', { name: /Probité uniquement/ });
  await expect(option).not.toBeChecked();
  await option.focus();
  await page.keyboard.press('Space');
  await expect(option).toBeChecked();
  await expect(page.locator('.pcard__familles')).toHaveText(ligne(true));
  await sansDebordement(page, 'liste des candidats');
  await expect(page.locator('.pcard__familles').filter({ hasText: /Violences|Propos haine|Diffamation|Autres/ })).toHaveCount(0);
  await expect(page.locator('.pcard__nom')).toHaveText(ALPHABETIQUE);
  await axe(page, 'liste des candidats, Probité uniquement');
  // la carte entière reste cliquable : un clic sur la ligne de compteurs (recouverte par le lien) ouvre la page
  const ligneZemmour = page.locator('.pcard').filter({ hasText: 'Éric Zemmour' }).locator('.pcard__familles');
  await ligneZemmour.scrollIntoViewIfNeeded();
  const box = await ligneZemmour.boundingBox();
  if (!box) throw new Error('ligne de compteurs invisible');
  await page.mouse.click(box.x + 10, box.y + box.height / 2);
  await expect(page).toHaveURL(/#\/candidat\/zemmour$/);
  expect(problems).toEqual([]);
});

test('appartenance : passif distinct sous la liste, compteurs niveau 1 seuls (pages RN, LR, LFI, PS)', async ({ page }) => {
  test.setTimeout(60_000);
  const problems = guard(page);
  for (const id of ['lepen', 'retailleau', 'melenchon', 'glucksmann']) {
    const c = DATA.candidats.find((x) => x.id === id);
    if (!c) throw new Error(id);
    const attendu = pageJustice(DATA, c);
    expect(attendu.passif.total, id).toBeGreaterThan(0);
    await page.goto(`./#/candidat/${id}`);
    const section = page.getByRole('region', { name: TITRE_PASSIF });
    await expect(section, id).toBeVisible();
    // à part : après la liste principale, avant l'état de la recherche ; aucune condamnation dans les deux
    const ordre = await page.locator('.justice').evaluate((el) =>
      [...el.querySelectorAll('.jfamille, .jpassif, .jetat')].map((n) => n.classList[0] ?? ''),
    );
    expect(ordre.indexOf('jpassif'), id).toBe(ordre.lastIndexOf('jfamille') + 1);
    expect(ordre.at(-1), id).toBe('jetat');
    await expect(page.locator('.jfamille .condamnation'), id).toHaveCount(attendu.total);
    await expect(section.locator('.condamnation'), id).toHaveCount(attendu.passif.total);
    await expect(page.locator('.jfamille .jpassif, .jpassif .jfamille'), id).toHaveCount(0);
    // une ligne de contexte par personne (et par famille), badge d'appartenance, statut judiciaire sur chaque décision
    const personnes = attendu.passif.familles.flatMap((f) => f.personnes);
    const blocs = section.locator('.jpersonne');
    await expect(blocs, id).toHaveCount(personnes.length);
    await expect(blocs.locator('.jpersonne__contexte'), id).toHaveText(personnes.map((x) => contexteAppartenance(x.appartenance)));
    await expect(blocs.locator('.jpersonne__head .appart'), id).toHaveText(personnes.map((x) => `Appartenance au parti\u00a0: ${libelleAppartenance(x.appartenance)}`));
    for (const item of await section.locator('.condamnation').all()) await expect(item.locator('.statut')).toHaveCount(1);
    // niveau 1 : badge d'appartenance sur chaque condamnation
    for (const item of await page.locator('.jfamille .condamnation').all()) await expect(item.locator('.appart')).toHaveCount(1);
    // style atténué, mais contrastes conformes et rien qui déborde
    const passifCouleur = await section.locator('h3').evaluate((el) => getComputedStyle(el).color);
    const titreCouleur = await page.locator('#justice-synthese').evaluate((el) => getComputedStyle(el).color);
    expect(passifCouleur, id).not.toBe(titreCouleur);
    // synthèse : la ligne discrète du passif ; « voir le passif » amène le focus sur la section
    await expect(page.locator('.jsynthese__passif'), id).toContainText(`+\u00a0${String(attendu.passif.total)} chez d’anciens membres`);
    await page.locator('.jsynthese__passif').getByRole('link', { name: 'voir le passif' }).click();
    await expect(section.locator('h3')).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`#/candidat/${id}$`));
    await sansDebordement(page, `candidat ${id}`);
    await axe(page, `candidat ${id}, passif`);
  }
  // RN : la personne morale est comptée (badge « Parti ») ; Jean-Marie Le Pen (décès) au passif ; exclusion liée à
  // l'affaire mise en valeur (Daniel Grenon)
  await page.goto('./#/candidat/lepen');
  await expect(page.locator('.jfamille .condamnation').filter({ hasText: 'Rassemblement national (personne morale' }).locator('.appart').first()).toHaveText(/Parti$/);
  const jmlp = page.locator('.jpersonne').filter({ hasText: 'Le Pen Jean-Marie' });
  await expect(jmlp.first().locator('.jpersonne__contexte')).toHaveText('Décès en 2025');
  await expect(page.locator('.jfamille .condamnation__qui').filter({ hasText: 'Le Pen Jean-Marie' })).toHaveCount(0);
  await expect(page.locator('.jpersonne').filter({ hasText: 'Grenon Daniel' })).toContainText(MENTION_ECARTEE);
  // LR : Nicolas Sarkozy « Retrait — adhésion non confirmée », au passif, avec le soutien public de la direction
  await page.goto('./#/candidat/retailleau');
  const sarkozy = page.locator('.jpersonne').filter({ hasText: 'Sarkozy Nicolas' }).first();
  await expect(sarkozy.locator('.appart')).toHaveText(/Retrait — adhésion non confirmée$/);
  await expect(sarkozy.locator('.appart__reaction')).toContainText('soutien');
  // (son nom peut figurer dans les faits d'une autre condamnation : on vérifie la personne condamnée)
  await expect(page.locator('.jfamille .condamnation__qui').filter({ hasText: 'Sarkozy' })).toHaveCount(0);
  // la source de l'appartenance se déplie
  const details = sarkozy.locator('details.appart__sources');
  await details.locator('summary').click();
  await expect(details.locator('blockquote').first()).toBeVisible();
  // mode sombre : le passif atténué reste lisible (contrastes conformes)
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./#/candidat/lepen');
  await expect(page.getByRole('region', { name: TITRE_PASSIF })).toBeVisible();
  await axe(page, 'candidat lepen, passif, mode sombre');
  expect(problems).toEqual([]);
});

test('Méthodologie : appartenance actuelle (niveaux, passif)', async ({ page }) => {
  await page.goto('./#/methodologie?section=appartenance');
  const h3 = page.getByRole('heading', { level: 3, name: 'Appartenance actuelle' });
  await expect(h3).toBeInViewport();
  await expect(h3).toBeFocused();
  const main = page.locator('main');
  await expect(main).toContainText('Toujours au parti (comptées)');
  await expect(main).toContainText('Anciens membres (passif, non comptées)');
  await expect(main).toContainText(MENTION_ECARTEE);
  await expect(main).toContainText('Retrait — adhésion non confirmée');
  await axe(page, 'méthodologie, appartenance');
});

test('Méthodologie : familles de condamnations, ordre de gravité et choix éditorial', async ({ page }) => {
  await page.goto('./#/methodologie?section=familles');
  const h3 = page.getByRole('heading', { level: 3, name: 'Familles de condamnations' });
  await expect(h3).toBeInViewport();
  await expect(h3).toBeFocused();
  const table = page.getByRole('table', { name: /Familles de condamnations/ });
  await expect(table.locator('tbody th')).toHaveText(FAMILLES.map((f) => FAMILLE_LABEL[f]));
  await expect(page.locator('main')).toContainText('L’ordre de gravité est un choix éditorial');
  await expect(page.locator('main')).toContainText('qualification juridique');
  await axe(page, 'méthodologie');
});

test('le nom d’un candidat renvoie à sa page, depuis la révélation et depuis la restitution', async ({ page }) => {
  await page.goto('./#/question/ordonnances-travail');
  await page.getByRole('group', { name: 'Votre réponse' }).getByRole('button', { name: 'Oui', exact: true }).click();
  await page.locator('.cand').getByRole('heading', { name: 'Marine Le Pen' }).getByRole('link').click();
  await expect(page).toHaveURL(/#\/candidat\/lepen$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Marine Le Pen' })).toBeVisible();

  await page.goto(`./#/resultats?r=${'onp'.repeat(11)}`);
  const first = page.locator('.ranking .rank__name a').first();
  const nom = (await first.textContent()) ?? '';
  expect(nom.length).toBeGreaterThan(0);
  await first.click();
  await expect(page.getByRole('heading', { level: 1, name: nom })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Résultats partagés' })).toBeVisible();
});

test('accessibilité (axe) et absence de ressource tierce sur les 14 pages candidat', async ({ page }) => {
  test.setTimeout(90_000);
  const problems = guard(page);
  for (const id of CANDIDATS) {
    await page.goto(`./#/candidat/${id}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Condamnations en justice' })).toBeVisible();
    // une seule mise en page : mêmes sections, dans le même ordre, pour tous les candidats
    const h2 = await page.locator('article.candidat h2').allTextContents();
    expect(h2[0], id).toBe('Biographie');
    expect(h2.slice(-2), id).toEqual(['Ses positions sur les 33 questions', 'Condamnations en justice']);
    await expect(page.getByRole('note', { name: 'Périmètre et précautions' })).toBeVisible();
    await sansDebordement(page, `candidat ${id}`);
    await axe(page, `candidat ${id}`);
  }
  expect(problems).toEqual([]);
});

// ------------------------------------------------------------------------------------------------ round 8

/** Catégorie la plus courte du build (parcours e2e plus rapide). */
const CATEGORIE: CategorieIndex | undefined = [...(DATA.approfondi?.categories ?? [])].sort((a, b) => a.questions.length - b.questions.length)[0];

test('mode approfondi absent du build : aucune option sur l’accueil, page « indisponible »', async ({ page }) => {
  test.skip(DATA.approfondi !== null, 'mode approfondi présent dans ce build');
  await page.goto('./');
  await expect(page.getByRole('button', { name: /Mode rapide/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Approfondir par catégorie/ })).toHaveCount(0);
  await page.goto('./#/approfondi');
  await expect(page.getByText('Le mode approfondi n’est pas disponible pour le moment.')).toBeVisible();
});

test('mode approfondi : choix de catégorie, parcours complet, restitution, persistance et partage', async ({ page, browser }) => {
  test.skip(!CATEGORIE, 'pas de mode approfondi dans ce build (data/selection-approfondi.json absent)');
  if (!CATEGORIE) return;
  test.setTimeout(120_000);
  const c = CATEGORIE;
  const problems = guard(page);
  // une question du parcours principal reprise dans la catégorie, répondue d'abord dans le parcours principal
  const commune = c.questions.find((r) => r.existant);
  if (commune) {
    await page.goto(`./#/question/${commune.id}`);
    await page.getByRole('group', { name: 'Votre réponse' }).getByRole('button', { name: 'Non', exact: true }).click();
    await expect(page.locator('.reveal')).toBeVisible();
  }

  // Accueil : troisième option, après les deux parcours.
  await page.goto('./');
  const modes = page.locator('.modes > *');
  await expect(modes).toHaveCount(3);
  await expect(modes.nth(0)).toContainText('Mode rapide');
  await expect(modes.nth(1)).toContainText('Mode complet');
  await expect(modes.nth(2)).toContainText('Pour aller plus loin');
  await page.getByRole('link', { name: /Approfondir par catégorie/ }).click();

  // Choix de la catégorie : nombre de questions et durée estimée.
  await expect(page.getByRole('heading', { level: 1, name: 'Approfondir par catégorie' })).toBeVisible();
  const cartes = page.locator('.categorie');
  await expect(cartes).toHaveCount(DATA.approfondi?.categories.length ?? 0);
  const carte = cartes.filter({ has: page.getByRole('heading', { level: 2, name: c.libelle }) });
  await expect(carte).toContainText(`${String(c.questions.length)} questions · environ`);
  await expect(carte).toContainText('minutes');
  await axe(page, 'choix de catégorie');
  await sansDebordement(page, 'choix de catégorie');
  await carte.getByRole('link', { name: /Commencer|Reprendre/ }).click();

  // Parcours : même expérience par question, portée du scrutin affichée.
  const label = page.locator('.progress__label');
  await expect(label).toContainText(`sur ${String(c.questions.length)}`);
  await expect(page.locator('.theme')).toHaveText(c.libelle);
  await expect(page.locator('.portee')).toBeVisible();
  const pattern = ['Oui', 'Non', 'Oui', 'Passer', 'Non'];
  const reponses: Record<string, string> = {};
  for (const [i, ref] of c.questions.entries()) {
    await page.goto(`./#/approfondi/${c.id}/question/${ref.id}`);
    await expect(label).toContainText(`Question ${String(i + 1)} sur ${String(c.questions.length)}`);
    const portee = page.locator('.portee__label');
    await expect(portee).toHaveText(
      { ensemble: 'Vote sur l’ensemble du texte', article: 'Vote sur un article', amendement: 'Vote sur un amendement', motion_censure: 'Vote sur une motion de censure' }[ref.portee],
    );
    if (ref.existant) {
      await expect(page.getByText(/Question aussi posée dans le parcours principal/)).toBeVisible();
      if (ref.id === commune?.id) {
        // la réponse donnée dans le parcours principal est reprise, pas redemandée
        await expect(page.getByRole('button', { name: 'Non', exact: true })).toHaveAttribute('aria-pressed', 'true');
        continue;
      }
    }
    const choix = pattern[i % pattern.length] ?? 'Oui';
    reponses[ref.id] = choix;
    await page.getByRole('group', { name: 'Votre réponse' }).getByRole('button', { name: choix, exact: true }).click();
    await expect(page.locator('.reveal')).toBeVisible();
    await expect(page.locator('.reveal .scrutin')).toContainText(/scrutin n°\s\d+/);
    if (ref.portee === 'article' || ref.portee === 'amendement')
      await expect(page.locator('.reveal .portee--revelation')).toContainText(/porte sur cet (article|amendement), pas sur le texte entier/);
    else await expect(page.locator('.reveal .portee--revelation')).toHaveCount(0);
    if (i === 0) {
      await expect(page.locator('.reveal__title')).toBeFocused();
      await axe(page, 'révélation (mode approfondi)');
    }
  }
  await page.getByRole('link', { name: /Voir mes résultats/ }).click();

  // Restitution de la catégorie : mêmes règles, détail question par question.
  await expect(page.getByRole('heading', { level: 1, name: `Vos résultats — ${c.libelle}` })).toBeVisible();
  const order = await page.locator('.ranking .rank__name').allTextContents();
  const insuff = await page.locator('.insuff > li strong').allTextContents();
  expect(order.length + insuff.length).toBe(14);
  if (order.length > 0) {
    await page.locator('.rank__details summary').first().click();
    await expect(page.locator('.rank__details .qlist__item').first()).toBeVisible();
    await expect(page.locator('.rank__details').first()).not.toContainText('Par thème');
  }
  await expect(page.getByRole('heading', { name: 'Limites à garder en tête' })).toBeVisible();
  await axe(page, 'restitution de catégorie');
  await sansDebordement(page, 'restitution de catégorie');
  const shareUrl = await page.locator('#share-url').inputValue();
  expect(shareUrl).toMatch(new RegExp(`#/approfondi/${c.id}/resultats\\?r=[onp_]+&k=[0-9a-z]+$`));

  // Persistance locale par catégorie.
  await page.reload();
  await expect(page.locator('.ranking .rank__name')).toHaveText(order);
  await page.goto('./#/approfondi');
  await expect(page.locator('.categorie').filter({ hasText: c.libelle })).toContainText(`Vous avez répondu à ${String(c.questions.length)} questions sur ${String(c.questions.length)}`);

  // Une seule réponse par question sur tout le site : la question commune répondue dans la catégorie l'est aussi dans le parcours principal.
  const autreCommune = c.questions.find((r) => r.existant && r.id !== commune?.id && reponses[r.id]);
  if (autreCommune) {
    await page.goto(`./#/question/${autreCommune.id}`);
    await expect(page.getByRole('button', { name: reponses[autreCommune.id] ?? 'Oui', exact: true })).toHaveAttribute('aria-pressed', 'true');
  }

  // Effacement des réponses propres à la catégorie : les questions communes gardent la leur ; focus sur la confirmation.
  await page.goto(`./#/approfondi/${c.id}`);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Effacer mes réponses de cette catégorie' }).click();
  const confirmation = page.getByRole('status').filter({ hasText: 'ont été effacées' });
  await expect(confirmation).toBeFocused();
  const communes = c.questions.filter((r) => r.existant).length;
  await expect(page.locator('.lead')).toContainText(
    communes > 0 ? `Vous avez répondu à ${String(communes)} question` : 'Vous n’avez pas encore répondu',
  );

  // Partage : un navigateur vierge retrouve le même classement depuis l'URL seule.
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await other.goto(shareUrl);
  await expect(other.getByRole('heading', { level: 1, name: `Résultats partagés — ${c.libelle}` })).toBeVisible();
  await expect(other.locator('.ranking .rank__name')).toHaveText(order);
  // lien d'une version précédente de la catégorie : signalé, pas relu
  await other.goto(shareUrl.replace(/k=[0-9a-z]+$/, 'k=perime'));
  await expect(other.getByText(/version précédente des questions de cette catégorie/)).toBeVisible();
  await fresh.close();

  expect(problems).toEqual([]);
});

test('le parcours principal ne télécharge ni les pages ni les questions du mode approfondi', async ({ page }) => {
  test.skip(!CATEGORIE, 'pas de mode approfondi dans ce build');
  const fichiers: string[] = [];
  page.on('request', (req) => fichiers.push(new URL(req.url()).pathname));
  await page.goto('./');
  await page.getByRole('button', { name: /Mode rapide/ }).click();
  await page.getByRole('group', { name: 'Votre réponse' }).getByRole('button', { name: 'Oui', exact: true }).click();
  await expect(page.locator('.reveal')).toBeVisible();
  await page.goto(`./#/resultats?r=${'onp'.repeat(11)}`);
  await expect(page.locator('.ranking')).toBeVisible();
  const ids = (DATA.approfondi?.categories ?? []).map((c) => c.id);
  const approfondi = (f: string) => f.includes('/assets/ApprofondiRoutes-') || ids.some((id) => f.includes(`/assets/${id}-`));
  expect(fichiers.filter(approfondi)).toEqual([]);
  // ouverture d'une catégorie : seul le fichier de cette catégorie est chargé
  await page.goto(`./#/approfondi/${CATEGORIE?.id ?? ''}`);
  await expect(page.locator('.appro-liste li').first()).toBeVisible();
  const charges = ids.filter((id) => fichiers.some((f) => f.includes(`/assets/${id}-`)));
  expect(charges).toEqual([CATEGORIE?.id]);
});

test('Méthodologie : mode approfondi (choix des scrutins, articles et amendements)', async ({ page }) => {
  test.skip(!CATEGORIE, 'pas de mode approfondi dans ce build');
  await page.goto('./#/methodologie?section=approfondi');
  const titre = page.getByRole('heading', { level: 2, name: /Approfondir par catégorie/ });
  await expect(titre).toBeFocused();
  await expect(page.locator('main')).toContainText('le vote sur l’ensemble d’un texte est retenu en priorité');
  await expect(page.locator('main')).toContainText('article ou un amendement emblématique');
  await axe(page, 'méthodologie (mode approfondi)');
});

test('mode approfondi : aucun débordement horizontal à 320 px', async ({ page }) => {
  test.skip(!CATEGORIE, 'pas de mode approfondi dans ce build');
  if (!CATEGORIE) return;
  const c = CATEGORIE;
  await page.setViewportSize({ width: 320, height: 700 });
  const ciblee = c.questions.find((r) => r.portee === 'article' || r.portee === 'amendement') ?? c.questions[0];
  for (const url of ['./', './#/approfondi', `./#/approfondi/${c.id}`, `./#/approfondi/${c.id}/question/${ciblee?.id ?? ''}`]) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await sansDebordement(page, url);
  }
  await page.getByRole('group', { name: 'Votre réponse' }).getByRole('button', { name: 'Oui', exact: true }).click();
  await expect(page.locator('.reveal')).toBeVisible();
  await sansDebordement(page, 'révélation 320 px');
  const r = 'on'.repeat(c.questions.length).slice(0, c.questions.length);
  await page.goto(`./#/approfondi/${c.id}/resultats?r=${r}&k=${cleQuestions(c.questions.map((x) => x.id))}`);
  await expect(page.getByRole('heading', { level: 1, name: `Résultats partagés — ${c.libelle}` })).toBeVisible();
  await sansDebordement(page, 'restitution 320 px');
});

test('Sources : celles des questions du mode approfondi sont chargées à la demande', async ({ page }) => {
  test.skip(!CATEGORIE, 'pas de mode approfondi dans ce build');
  const problems = guard(page);
  await page.goto('./#/sources');
  const section = page.getByRole('region', { name: 'Mode « Approfondir par catégorie »' });
  await expect(section).toBeVisible();
  await expect(section.locator('h3')).toHaveCount(0);
  await section.getByRole('button', { name: 'Afficher ces sources' }).click();
  await expect(section.locator('h3')).toHaveText((DATA.approfondi?.categories ?? []).map((c) => c.libelle));
  // le bouton disparaît : le focus passe au premier titre de catégorie
  await expect(section.locator('h3').first()).toBeFocused();
  // une question par nouvelle question de chaque catégorie, chacune avec au moins la page officielle du scrutin
  const nouvelles = (DATA.approfondi?.categories ?? []).reduce((n, c) => n + c.questions.filter((r) => !r.existant).length, 0);
  await expect(section.locator('h4')).toHaveCount(nouvelles);
  expect(await section.locator('a[target=_blank]').count()).toBeGreaterThanOrEqual(nouvelles);
  await axe(page, 'sources (mode approfondi)');
  expect(problems).toEqual([]);
});

test('mode approfondi : contrastes conformes en mode sombre (portée, révélation)', async ({ page }) => {
  test.skip(!CATEGORIE, 'pas de mode approfondi dans ce build');
  const c = (DATA.approfondi?.categories ?? []).find((x) => x.questions.some((r) => r.portee === 'amendement')) ?? CATEGORIE;
  const ref = c?.questions.find((r) => r.portee === 'amendement') ?? c?.questions[0];
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`./#/approfondi/${c?.id ?? ''}/question/${ref?.id ?? ''}`);
  await expect(page.locator('.portee').first()).toBeVisible();
  await page.getByRole('group', { name: 'Votre réponse' }).getByRole('button', { name: 'Oui', exact: true }).click();
  await expect(page.locator('.reveal')).toBeVisible();
  await axe(page, 'question approfondie sombre');
  await page.goto('./#/approfondi');
  await axe(page, 'choix de catégorie sombre');
});
