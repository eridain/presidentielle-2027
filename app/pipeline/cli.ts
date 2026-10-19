// `npm run data` : lit ../data, fusionne, valide, écrit src/generated/data.json et data-report.md.
// Code de sortie 1 si une erreur bloquante est détectée (le fichier n'est alors pas écrit).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildData } from './build';
import type { JusticeFile } from './justice';
import { errors, formatReport } from './report';
import { NOT_RESEARCH } from './research';
import { FAMILLES } from '../src/lib/justice';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = resolve(APP, '..', 'data');
const RESEARCH_DIR = join(DATA, 'research');

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

const research: Record<string, string> = {};
if (existsSync(RESEARCH_DIR)) {
  for (const f of readdirSync(RESEARCH_DIR).sort()) {
    if (!f.endsWith('.json') || NOT_RESEARCH.has(f)) continue;
    research[f.slice(0, -'.json'.length)] = readFileSync(join(RESEARCH_DIR, f), 'utf8');
  }
}

// Version « En clair » (facultative) : data/research/simple/<id>.json
const SIMPLE_DIR = join(RESEARCH_DIR, 'simple');
const simple: Record<string, string> = {};
if (existsSync(SIMPLE_DIR)) {
  for (const f of readdirSync(SIMPLE_DIR).sort()) {
    if (f.endsWith('.json')) simple[f.slice(0, -'.json'.length)] = readFileSync(join(SIMPLE_DIR, f), 'utf8');
  }
}
// Orateur réel des citations tirées des comptes rendus de séance (facultatif).
const attributionsPath = join(RESEARCH_DIR, 'attributions.json');

// Partis, biographies et condamnations (facultatif) : data/justice/<partiId>.json.
// VOTE_REEL_JUSTICE_DIR permet de construire le site avec un autre dossier (fixtures de test).
const JUSTICE_DIR = process.env.VOTE_REEL_JUSTICE_DIR ? resolve(process.env.VOTE_REEL_JUSTICE_DIR) : join(DATA, 'justice');
/** Date à Paris (AAAA-MM-JJ). */
const parisDate = (d: Date) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d);
/**
 * Dernière modification d'une fiche, à défaut de champ dateConsultation : date du dernier commit si le fichier est
 * versionné et inchangé (un clone récent ne la fausse pas), sinon date de modification du fichier.
 */
function modifieLe(path: string): string {
  try {
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dirname(path), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    // clone superficiel (CI) : le seul commit connu daterait toutes les fiches du jour du clone
    if (git('rev-parse', '--is-shallow-repository') === 'false' && git('status', '--porcelain', '--', path) === '') {
      const d = git('log', '-1', '--format=%cs', '--', path);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    }
  } catch {
    // pas de dépôt git (image Docker) : date du fichier
  }
  return parisDate(statSync(path).mtime);
}
// Dates de consultation relevées à l'intégration des fiches (data/justice-dates.json, facultatif) : partiId → AAAA-MM-JJ.
const datesPath = join(DATA, 'justice-dates.json');
const releves: Record<string, unknown> = existsSync(datesPath) ? (readJson(datesPath) as Record<string, unknown>) : {};
/** Fichiers <partiId>.json d'un dossier (facultatif) : contenu brut et date de modification. */
function lireDossier(dir: string, avecReleve: boolean): Record<string, JusticeFile> {
  const out: Record<string, JusticeFile> = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.json')) continue;
    const path = join(dir, f);
    const id = f.slice(0, -'.json'.length);
    const releve = avecReleve ? releves[id] : undefined;
    out[id] = { content: readFileSync(path, 'utf8'), releve: typeof releve === 'string' ? releve : null, modifieLe: modifieLe(path) };
  }
  return out;
}
const justice = lireDossier(JUSTICE_DIR, true);
// Appartenance actuelle des personnes condamnées, condamnations d'anciens membres (passif) : facultatifs.
const justiceMembres = lireDossier(join(JUSTICE_DIR, 'membres'), false);
const justiceAnciens = lireDossier(join(JUSTICE_DIR, 'anciens'), false);

// Mode « Approfondir par catégorie » (facultatif) : data/selection-approfondi.json + data/build/votes-approfondi.json.
// VOTE_REEL_APPROFONDI_DIR=<dossier> lit ces deux fichiers ailleurs (fixture de test : pipeline/fixtures/approfondi).
const APPRO_DIR = process.env.VOTE_REEL_APPROFONDI_DIR ? resolve(process.env.VOTE_REEL_APPROFONDI_DIR) : null;
const selectionApprofondiPath = APPRO_DIR ? join(APPRO_DIR, 'selection-approfondi.json') : join(DATA, 'selection-approfondi.json');
const votesApprofondiPath = APPRO_DIR ? join(APPRO_DIR, 'votes-approfondi.json') : join(DATA, 'build', 'votes-approfondi.json');
const readIfExists = (path: string): string | null => (existsSync(path) ? readFileSync(path, 'utf8') : null);

const collectedPath = join(DATA, 'raw', 'COLLECTED_AT');
const { data, report, categories } = buildData({
  selection: readJson(join(DATA, 'selection.json')),
  votes: readJson(join(DATA, 'build', 'votes.json')),
  candidats: readJson(join(DATA, 'candidats.json')),
  research,
  simple,
  attributions: existsSync(attributionsPath) ? readFileSync(attributionsPath, 'utf8') : null,
  justice,
  justiceMembres,
  justiceAnciens,
  selectionApprofondi: readIfExists(selectionApprofondiPath),
  votesApprofondi: readIfExists(votesApprofondiPath),
  collecteAN: existsSync(collectedPath) ? readFileSync(collectedPath, 'utf8').trim() || null : null,
  now: new Date(),
});

const markdown = formatReport(report, data);
writeFileSync(join(APP, 'data-report.md'), markdown + '\n', 'utf8');

const errs = errors(report);
const warnings = report.issues.filter((i) => i.severity === 'avertissement');
console.log(`Fichiers de recherche lus : ${Object.keys(research).length}`);
console.log(`Questions sans recherche : ${report.questionsSansRecherche.length}`);
console.log(
  `Fiches « En clair » : ${Object.keys(simple).length} lues, ${report.enClairManquants.length} question(s) sans fiche valide${report.enClairManquants.length ? ` (${report.enClairManquants.join(', ')})` : ''}`,
);
console.log(
  `attributions.json : ${report.attributionsLues ? 'lu' : 'absent'} — propos de tiers affichés comme tels : ${report.proposDeTiers.length} (dont ${report.proposDeTiers.filter((p) => p.verification === 'compte-rendu').length} vérifiés en séance)`,
);
console.log(`Positions par nature de preuve : ${Object.entries(report.preuves).map(([k, v]) => `${k}=${v}`).join(', ')}`);
console.log(
  `Proxies utilisés : ${report.proxies.length} — écartés hors période : ${report.issues.filter((i) => i.code === 'proxy-hors-periode').length} — incohérences : ${report.incoherences.length}`,
);
const j = report.justice;
console.log(
  `Partis : ${j.partis.filter((p) => p.fichier === 'lu').length} fiche(s) lue(s) sur ${j.partis.length} (${JUSTICE_DIR}) — condamnations affichées : ${j.partis.reduce((n, p) => n + p.affichees, 0)}, rejetées : ${j.rejets.length}`,
);
console.log(
  `Par famille (ordre de gravité) : ${FAMILLES.map((f) => `${f}=${String(j.partis.reduce((n, p) => n + p.parFamille[f], 0))}`).join(', ')} — famille absente ou invalide (classée « autres ») : ${String(report.issues.filter((i) => i.code === 'justice-famille-absente' || i.code === 'justice-famille-invalide').length)}`,
);
const niv = (n: 1 | 2) => FAMILLES.map((f) => `${f}=${String(j.partis.reduce((k, p) => k + p.niveaux[n][f], 0))}`).join(', ');
const total = (n: 1 | 2) => j.partis.reduce((k, p) => k + FAMILLES.reduce((m, f) => m + p.niveaux[n][f], 0), 0);
console.log(
  `Appartenance (membres/ : ${String(j.partis.filter((p) => p.membres === 'lu').length)} fichier(s), anciens/ : ${String(j.partis.filter((p) => p.anciens === 'lu').length)}) — niveau 1 (comptées) : ${String(total(1))} (${niv(1)}) ; niveau 2 (passif) : ${String(total(2))} (${niv(2)}), dont anciens/ ${String(j.partis.reduce((k, p) => k + p.anciensAffichees, 0))} ; statut inconnu : ${String(j.partis.reduce((k, p) => k + p.parAppartenance.inconnu, 0))}`,
);
const a = report.approfondi;
console.log(
  a.selection === 'absent'
    ? `Mode approfondi : ${selectionApprofondiPath} absent — pas de mode approfondi`
    : `Mode approfondi (${selectionApprofondiPath}) : fichier ${a.selection}, votes ${a.votes} — ${String(a.entrees)} entrées, ${String(a.ecartees.length)} écartée(s) ; catégories proposées : ${String(a.categories.filter((c) => c.proposee).length)}/${String(a.categories.length)} (${a.categories.filter((c) => c.questions > 0).map((c) => `${c.id}=${String(c.questions)}${c.proposee ? '' : ' non proposée'}`).join(', ')}) ; nouvelles questions sans recherche : ${String(a.questionsSansRecherche.length)}, sans « En clair » : ${String(a.enClairManquants.length)} ; avertissements : ${String(a.issues.filter((i) => i.severity === 'avertissement').length)} (non bloquants)`,
);
for (const r of j.rejets) console.error(`REJET ${r.parti}/${r.liste === 'anciens' ? 'anciens/' : ''}condamnations[${r.index}] (${r.personne ?? '?'}) : ${r.motifs.join(' ; ')}`);
console.log(`Erreurs : ${errs.length} — avertissements : ${warnings.length}`);
for (const e of errs) console.error(`ERREUR ${[e.question, e.candidat].filter(Boolean).join('/')} : ${e.message}`);
console.log(`Rapport détaillé : ${join(APP, 'data-report.md')}`);

if (errs.length > 0 || !data) {
  console.error('Données invalides : src/generated/data.json non mis à jour.');
  process.exit(1);
}
const outDir = join(APP, 'src', 'generated');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'data.json'), JSON.stringify(data), 'utf8');
console.log(`OK → ${join(outDir, 'data.json')} (${data.questions.length} questions)`);
// Une catégorie = un fichier, chargé seulement quand on l'ouvre (le parcours principal ne le télécharge jamais).
const approDir = join(outDir, 'approfondi');
rmSync(approDir, { recursive: true, force: true });
if (categories.length > 0) {
  mkdirSync(approDir, { recursive: true });
  for (const c of categories) writeFileSync(join(approDir, `${c.categorie}.json`), JSON.stringify(c), 'utf8');
  console.log(`OK → ${approDir} (${String(categories.length)} catégorie(s), ${String(categories.reduce((n, c) => n + c.questions.length, 0))} nouvelles questions)`);
}
