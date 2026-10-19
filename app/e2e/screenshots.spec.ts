// Captures d'écran de référence (npm run screenshots) → app/screenshots/
import { test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppData } from '../src/types';

/** Données du build (mode approfondi présent ou non). */
const DATA = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src', 'generated', 'data.json'), 'utf8')) as AppData;
const CATEGORIES = DATA.approfondi?.categories ?? [];
/** Catégorie capturée : celle qui contient une question sur un article ou un amendement, à défaut la première. */
const CATEGORIE = CATEGORIES.find((c) => c.questions.some((r) => r.portee === 'amendement' || r.portee === 'article')) ?? CATEGORIES[0];

const SIZES = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1280, height: 900 },
} as const;

const OUT = 'screenshots';

/** Candidat dont la page sert de capture « parti » (screenshots/*-parti.png, Rassemblement national). */
const PAGE_PARTI = process.env.PAGE_PARTI ?? 'lepen';
/** Autres pages parti : Les Républicains, La France insoumise, Parti socialiste (screenshots/*-parti-lr.png…). */
const PAGE_PARTI_LR = 'retailleau';
const PAGE_PARTI_LFI = 'melenchon';
const PAGE_PARTI_PS = 'glucksmann';

async function answerQuick(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /Mode rapide/ }).click();
  const pattern = ['Oui', 'Non', 'Non', 'Oui', 'Passer', 'Oui', 'Non'];
  const label = page.locator('.progress__label');
  await label.waitFor();
  const total = Number(/sur (\d+)/.exec((await label.textContent()) ?? '')?.[1]);
  for (let n = 1; n <= total; n += 1) {
    await page.getByText(`Question ${n} sur ${total}`).waitFor();
    const choice = pattern[(n - 1) % pattern.length] ?? 'Oui';
    await page.getByRole('group', { name: 'Votre réponse' }).getByRole('button', { name: choice, exact: true }).click();
    await page.getByRole('link', { name: n === total ? /Voir mes résultats/ : /Question suivante/ }).click();
  }
  await page.getByRole('heading', { level: 1, name: 'Vos résultats' }).waitFor();
}

for (const [name, viewport] of Object.entries(SIZES)) {
  test.describe(name, () => {
    test.use({ viewport, deviceScaleFactor: name === 'mobile' ? 2 : 1, isMobile: name === 'mobile', hasTouch: name === 'mobile' });

    test('accueil', async ({ page }) => {
      await page.goto('./');
      await page.screenshot({ path: `${OUT}/${name}-accueil.png`, fullPage: true });
    });

    test('révélation', async ({ page }) => {
      await page.goto('./#/question/ordonnances-travail');
      await page.screenshot({ path: `${OUT}/${name}-question.png` });
      await page.getByRole('button', { name: 'Oui', exact: true }).click();
      await page.locator('.reveal__title').waitFor();
      await page.waitForTimeout(600); // défilement doux vers la révélation
      await page.screenshot({ path: `${OUT}/${name}-revelation.png` });
      await page.screenshot({ path: `${OUT}/${name}-revelation-complete.png`, fullPage: true });
    });

    test('en clair et attribution', async ({ page }) => {
      await page.goto('./#/question/retraites-64');
      await page.getByRole('region', { name: 'En clair' }).waitFor();
      await page.screenshot({ path: `${OUT}/${name}-question-en-clair.png`, fullPage: true });
      await page.goto('./#/question/lpm-2024-2030');
      await page.getByRole('button', { name: 'Oui', exact: true }).click();
      await page.locator('.reveal__title').waitFor();
      await page.waitForTimeout(600);
      const card = page.locator('.cand').filter({ hasText: 'Marine Le Pen' });
      await card.scrollIntoViewIfNeeded();
      await card.screenshot({ path: `${OUT}/${name}-attribution.png` });
    });

    test('partis et candidats', async ({ page }) => {
      await page.goto('./#/candidats');
      await page.locator('.pcard').first().waitFor();
      await page.screenshot({ path: `${OUT}/${name}-partis.png`, fullPage: true });
      // option « Probité uniquement »
      await page.getByRole('checkbox', { name: /Probité uniquement/ }).check();
      await page.screenshot({ path: `${OUT}/${name}-partis-probite.png`, fullPage: true });
      for (const [id, suffixe] of [
        [PAGE_PARTI, ''],
        [PAGE_PARTI_LR, '-lr'],
        [PAGE_PARTI_LFI, '-lfi'],
        [PAGE_PARTI_PS, '-ps'],
      ] as const) {
        await page.goto(`./#/candidat/${id}`);
        await page.getByRole('heading', { level: 2, name: 'Condamnations en justice' }).waitFor();
        // une citation dépliée, pour montrer la source
        const citation = page.locator('details.condamnation__citation summary').first();
        if ((await citation.count()) > 0) await citation.click();
        await page.screenshot({ path: `${OUT}/${name}-parti${suffixe}.png`, fullPage: true });
      }
    });

    test('synthèse par famille et filtre', async ({ page }) => {
      await page.goto(`./#/candidat/${PAGE_PARTI}`);
      const titre = page.getByRole('heading', { level: 2, name: 'Condamnations en justice' });
      await titre.waitFor();
      await titre.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: `${OUT}/${name}-parti-synthese.png` });
      // filtre : Probité décochée, liste réduite aux autres familles
      const filtre = page.getByRole('group', { name: 'Familles affichées dans la liste' });
      await filtre.getByRole('checkbox', { name: /^Probité/ }).uncheck();
      await filtre.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: `${OUT}/${name}-parti-filtre.png` });
    });

    test('passif : anciens membres (RN, LR)', async ({ page }) => {
      for (const [id, suffixe] of [
        [PAGE_PARTI, ''],
        [PAGE_PARTI_LR, '-lr'],
      ] as const) {
        await page.goto(`./#/candidat/${id}`);
        const titre = page.locator('#justice-passif');
        await titre.waitFor();
        // haut de la section, une source d'appartenance dépliée
        await page.locator('.jpassif details.appart__sources summary').first().click();
        await titre.evaluate((el) => el.scrollIntoView({ block: 'start' }));
        await page.screenshot({ path: `${OUT}/${name}-parti${suffixe}-passif.png` });
      }
    });

    test('mentions', async ({ page }) => {
      await page.goto('./#/mentions');
      await page.getByRole('heading', { level: 2, name: 'Éditeur et hébergement' }).waitFor();
      await page.screenshot({ path: `${OUT}/${name}-mentions.png`, fullPage: true });
    });

    test('mode approfondi', async ({ page }) => {
      test.skip(!CATEGORIE, 'pas de mode approfondi dans ce build');
      if (!CATEGORIE) return;
      test.setTimeout(90_000);
      const c = CATEGORIE;
      await page.goto('./#/approfondi');
      await page.locator('.categorie').first().waitFor();
      await page.screenshot({ path: `${OUT}/${name}-approfondi.png`, fullPage: true });
      // question sur un amendement ou un article : la portée est affichée sous la question
      const ciblee = c.questions.find((r) => r.portee === 'amendement' || r.portee === 'article') ?? c.questions[0];
      await page.goto(`./#/approfondi/${c.id}/question/${ciblee?.id ?? ''}`);
      await page.locator('.portee').waitFor();
      await page.screenshot({ path: `${OUT}/${name}-approfondi-question.png`, fullPage: true });
      await page.getByRole('button', { name: 'Oui', exact: true }).click();
      await page.locator('.reveal__title').waitFor();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${name}-approfondi-revelation.png` });
      // parcours complet de la catégorie, puis restitution
      const pattern = ['Oui', 'Non', 'Non', 'Oui', 'Passer', 'Oui', 'Non'];
      for (const [i, ref] of c.questions.entries()) {
        await page.goto(`./#/approfondi/${c.id}/question/${ref.id}`);
        await page.getByText(`Question ${String(i + 1)} sur ${String(c.questions.length)}`).waitFor();
        await page.getByRole('group', { name: 'Votre réponse' }).getByRole('button', { name: pattern[i % pattern.length] ?? 'Oui', exact: true }).click();
      }
      await page.getByRole('link', { name: /Voir mes résultats/ }).click();
      await page.locator('.ranking').waitFor();
      await page.screenshot({ path: `${OUT}/${name}-approfondi-resultats.png`, fullPage: true });
      await page.goto(`./#/approfondi/${c.id}`);
      await page.locator('.appro-liste li').first().waitFor();
      await page.screenshot({ path: `${OUT}/${name}-approfondi-categorie.png`, fullPage: true });
    });

    test('restitution', async ({ page }) => {
      test.setTimeout(90_000);
      await answerQuick(page);
      await page.screenshot({ path: `${OUT}/${name}-resultats.png`, fullPage: true });
      await page.locator('.rank__details summary').first().click();
      await page.locator('.rank__details').first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${OUT}/${name}-resultats-detail.png` });
    });
  });
}

test('mode sombre (mobile)', async ({ page }) => {
  await page.setViewportSize(SIZES.mobile);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./#/question/retraites-64');
  await page.getByRole('button', { name: 'Non', exact: true }).click();
  await page.locator('.reveal__title').waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/mobile-sombre-revelation.png` });
});
