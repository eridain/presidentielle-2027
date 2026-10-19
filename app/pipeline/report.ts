// Rapport du pipeline : anomalies, couverture, proxies, incohérences.
import { APPARTENANCE_LABEL, FAMILLE_COURT, FAMILLES, STATUTS_MEMBRE } from '../src/lib/justice';
import type { AppData, EvidenceType } from '../src/types';
import type { JusticeReport } from './justice';

export type Severity = 'erreur' | 'avertissement' | 'info';

export interface Issue {
  severity: Severity;
  code: string;
  question?: string | undefined;
  candidat?: string | undefined;
  /** Parti concerné (fichier data/justice/<parti>.json). */
  parti?: string | undefined;
  message: string;
}

/** Bilan des questions construites : commun au parcours principal et au mode approfondi. */
export interface QuestionsReport {
  issues: Issue[];
  questionsSansRecherche: string[];
  /** Nombre de positions par nature de preuve. */
  preuves: Record<EvidenceType, number>;
  /** Par candidat : nombre de positions connues / inconnues / dont votes nominatifs. */
  couverture: Record<string, { connues: number; inconnues: number; votes: number; proxies: number }>;
  proxies: { question: string; candidat: string; groupe: string }[];
  incoherences: Issue[];
  /** Questions sans fichier « En clair » valide (data/research/simple/<id>.json). */
  enClairManquants: string[];
  /** Positions dont l'argument ou la citation n'est pas du candidat. */
  proposDeTiers: {
    question: string;
    candidat: string;
    porteur: 'groupe' | 'gouvernement' | null;
    orateur: string | null;
    groupe: string | null;
    verification: 'compte-rendu' | 'recherche' | null;
    /** Une citation verbatim est affichée (sinon seulement un argument paraphrasé). */
    citation: boolean;
  }[];
}

export interface BuildReport extends QuestionsReport {
  fichiersRechercheIgnores: string[];
  /** data/research/attributions.json a été lu. */
  attributionsLues: boolean;
  /** Partis, biographies et condamnations (data/justice/). */
  justice: JusticeReport;
  /**
   * Mode « Approfondir par catégorie » : bilan séparé (ses anomalies ne sont jamais bloquantes et ne se mêlent
   * pas à celles du parcours principal).
   */
  approfondi: ApprofondiReport;
}

export interface ApprofondiReport extends QuestionsReport {
  /** Lecture de data/selection-approfondi.json. */
  selection: 'absent' | 'illisible' | 'lu';
  /** Lecture de data/build/votes-approfondi.json. */
  votes: 'absent' | 'illisible' | 'lu';
  /** Entrées du fichier de sélection. */
  entrees: number;
  /** Entrées écartées (invalides, catégorie inconnue, doublon, vote manquant…). */
  ecartees: { index: number; id: string | null; motifs: string[] }[];
  categories: {
    id: string;
    libelle: string;
    questions: number;
    existantes: number;
    nouvelles: number;
    avecRecherche: number;
    avecEnClair: number;
    /** Proposée sur le site (assez de questions). */
    proposee: boolean;
  }[];
  /** Questions du parcours principal reprises dans aucune catégorie. */
  existantesNonReprises: string[];
}

export const EVIDENCE_TYPES: readonly EvidenceType[] = [
  'vote_an',
  'vote_congres',
  'vote_senat',
  'vote_pe',
  'gouvernement',
  'declaration',
  'censure_implicite',
  'groupe',
  'inconnu',
];

export function emptyPreuves(): Record<EvidenceType, number> {
  return Object.fromEntries(EVIDENCE_TYPES.map((e) => [e, 0])) as Record<EvidenceType, number>;
}

export function errors(report: BuildReport): Issue[] {
  return report.issues.filter((i) => i.severity === 'erreur');
}

const SEVERITY_LABEL: Record<Severity, string> = { erreur: 'ERREUR', avertissement: 'AVERT.', info: 'info' };

function where(i: Issue): string {
  return [i.parti, i.question, i.candidat].filter(Boolean).join(' / ');
}

/** Rapport lisible (Markdown), écrit dans app/data-report.md et résumé dans la console. */
export function formatReport(report: BuildReport, data: AppData | null): string {
  const lines: string[] = [];
  const count = (s: Severity) => report.issues.filter((i) => i.severity === s).length;
  lines.push('# Rapport du pipeline de données', '');
  if (data) {
    lines.push(`- Généré le : ${data.genereLe}`);
    lines.push(`- Open data AN collectée le : ${data.collecteAN ?? 'inconnu'}`);
    lines.push(`- Questions : ${data.questions.length} — avec recherche : ${data.questions.filter((q) => q.recherche).length}`);
    lines.push(`- Candidats : ${data.candidats.length}`);
  }
  lines.push(`- Erreurs : ${count('erreur')} — avertissements : ${count('avertissement')} — infos : ${count('info')}`, '');

  lines.push('## Questions sans recherche', '');
  lines.push(
    report.questionsSansRecherche.length
      ? report.questionsSansRecherche.map((q) => `- ${q}`).join('\n')
      : '_Aucune : toutes les questions ont un fichier de recherche valide._',
    '',
  );
  if (report.fichiersRechercheIgnores.length) {
    lines.push('## Fichiers de recherche ignorés', '', ...report.fichiersRechercheIgnores.map((f) => `- ${f}`), '');
  }

  lines.push('## Version « En clair » (data/research/simple/)', '');
  if (data) lines.push(`Fiches valides : ${data.questions.filter((q) => q.enClair).length} sur ${data.questions.length}.`, '');
  lines.push(
    report.enClairManquants.length
      ? ['Questions sans fiche valide (affichage d\'origine : titre, question officielle, contexte) :', '', ...report.enClairManquants.map((q) => `- ${q}`)].join('\n')
      : '_Aucune question sans fiche « En clair »._',
    '',
  );
  const enClairIssues = report.issues.filter((i) => i.code.startsWith('en-clair'));
  if (enClairIssues.length)
    lines.push('Contrôles (non bloquants) :', '', ...enClairIssues.map((i) => `- [${SEVERITY_LABEL[i.severity]}] ${where(i)} : ${i.message}`), '');

  lines.push('## Attribution des propos affichés sous les candidats', '');
  const cr = report.proposDeTiers.filter((p) => p.verification === 'compte-rendu').length;
  lines.push(
    `- \`attributions.json\` : ${report.attributionsLues ? 'lu' : '**absent ou illisible** — attribution déduite de la recherche seulement'}.`,
    `- Positions dont l'argument ou la citation n'est **pas** du candidat (affichées « Argument de son groupe » / « Argument du Gouvernement », auteur nommé) : ${report.proposDeTiers.length}, dont ${cr} relevée(s) dans le compte rendu de séance et ${report.proposDeTiers.length - cr} indiquée(s) par la recherche.`,
    '',
  );
  if (report.proposDeTiers.length) {
    lines.push('| Question | Candidat | Porteur | Auteur réel | Groupe | Source de l\'attribution | Citation |', '|---|---|---|---|---|---|---|');
    for (const p of report.proposDeTiers)
      lines.push(
        `| ${p.question} | ${p.candidat} | ${p.porteur ?? '?'} | ${p.orateur ?? '_non nommé_'} | ${p.groupe ?? '—'} | ${p.verification ?? '?'} | ${p.citation ? 'oui' : 'non'} |`,
      );
    lines.push('');
  }
  const attIssues = report.issues.filter((i) => i.code.startsWith('attribution') || i.code === 'citation-non-retrouvee');
  if (attIssues.length) lines.push(...attIssues.map((i) => `- [${SEVERITY_LABEL[i.severity]}] ${where(i)} (${i.code}) : ${i.message}`), '');

  const masquees = report.issues.filter((i) => i.code === 'precision-masquee');
  lines.push('## Précisions de la recherche masquées', '');
  lines.push(
    `Quand aucun proxy n'est appliqué, la « Précision de la recherche » n'est pas affichée si elle cite un vote de groupe (${masquees.length} cas).`,
    '',
    ...masquees.map((i) => `- ${where(i)}`),
    '',
  );

  lines.push('## Positions par nature de preuve', '', '| Nature | Nombre |', '|---|---:|');
  for (const [k, v] of Object.entries(report.preuves)) lines.push(`| ${k} | ${v} |`);
  lines.push('');

  lines.push(
    '## Couverture par candidat',
    '',
    '| Candidat | Positions connues | dont votes nominatifs | dont proxies | Inconnues |',
    '|---|---:|---:|---:|---:|',
  );
  for (const [cid, c] of Object.entries(report.couverture))
    lines.push(`| ${cid} | ${c.connues} | ${c.votes} | ${c.proxies} | ${c.inconnues} |`);
  lines.push('');

  if (data) {
    lines.push('## Candidats sans position (par question)', '');
    for (const q of data.questions) {
      const unknown = Object.entries(q.candidats)
        .filter(([, p]) => p.stance === 'inconnu')
        .map(([cid]) => cid);
      if (unknown.length) lines.push(`- **${q.id}** : ${unknown.join(', ')}`);
    }
    lines.push('');
  }

  lines.push('## Proxies de groupe utilisés', '');
  lines.push(
    report.proxies.length
      ? report.proxies.map((p) => `- ${p.question} / ${p.candidat} → ${p.groupe}`).join('\n')
      : '_Aucun._',
    '',
  );

  if (data) {
    const dated = data.candidats.filter((c) => c.proxy.periodes.length > 0);
    lines.push('## Proxies limités dans le temps (candidats.json)', '');
    lines.push(
      dated.length
        ? dated
            .map((c) => {
              const periodes = c.proxy.periodes
                .map((p) => (p.du && p.au ? `du ${p.du} au ${p.au}` : p.du ? `à partir du ${p.du}` : `jusqu'au ${p.au ?? '?'}`))
                .join(' ; ');
              return `- ${c.id} (${c.proxy.groupes.join(', ')}) : ${periodes}${c.proxy.motif ? ` — ${c.proxy.motif}` : ''}`;
            })
            .join('\n')
        : '_Aucun : tous les proxies valent à toute date._',
      '',
    );
  }

  const horsPeriode = report.issues.filter((i) => i.code === 'proxy-hors-periode');
  lines.push('## Proxies écartés (scrutin hors de la période de validité)', '');
  lines.push(horsPeriode.length ? horsPeriode.map((i) => `- ${where(i)} : ${i.message}`).join('\n') : '_Aucun._', '');

  const maintenus = report.issues.filter((i) => i.code === 'proxy-conteste-maintenu');
  lines.push('## Proxies maintenus malgré une réserve de la recherche', '');
  lines.push(
    maintenus.length
      ? [
          'Proxy appliqué dans la période validée pour ce candidat (candidats.json), alors que la recherche émet une réserve :',
          '',
          ...maintenus.map((i) => `- ${where(i)} : ${i.message}`),
        ].join('\n')
      : '_Aucun._',
    '',
  );

  lines.push('## Incohérences (le vote officiel prévaut)', '');
  lines.push(
    report.incoherences.length
      ? report.incoherences.map((i) => `- ${where(i)} : ${i.message}`).join('\n')
      : '_Aucune._',
    '',
  );

  const recalc = report.issues.filter((i) => i.code === 'majorite-recalculee');
  lines.push('## Majorités de groupe recalculées', '');
  lines.push(
    `Le champ \`positionMajoritaire\` de l'open data AN diverge du décompte nominatif pour ${recalc.length} couple(s) scrutin/groupe ; la majorité est recalculée à partir des décomptes (motions de censure : « pour » si plus de la moitié des membres l'ont votée).`,
    '',
    ...recalc.map((i) => `- ${i.question} : ${i.message}`),
    '',
  );

  lines.push(...formatJustice(report));
  lines.push(...formatApprofondi(report.approfondi));

  const notable = report.issues.filter(
    (i) => i.severity !== 'info' && !report.incoherences.includes(i) && i.code !== 'recherche-absente',
  );
  lines.push('## Erreurs et avertissements', '');
  lines.push(
    notable.length ? notable.map((i) => `- [${SEVERITY_LABEL[i.severity]}] ${where(i)} (${i.code}) : ${i.message}`).join('\n') : '_Aucun._',
    '',
  );
  return lines.join('\n');
}

/** Section « Mode approfondi » : sélection, catégories, questions sans recherche, anomalies (jamais bloquantes). */
export function formatApprofondi(a: ApprofondiReport): string[] {
  const lines: string[] = ['## Mode approfondi (data/selection-approfondi.json)', ''];
  if (a.selection === 'absent')
    return [...lines, '_Fichier absent : pas de mode « Approfondir par catégorie » sur le site (parcours principal inchangé)._', ''];
  if (a.selection === 'illisible')
    return [...lines, '**Fichier illisible** : mode approfondi désactivé.', '', ...a.issues.map((i) => `- [${SEVERITY_LABEL[i.severity]}] ${i.message}`), ''];
  const proposees = a.categories.filter((c) => c.proposee);
  const retenues = a.categories.reduce((n, c) => n + c.questions, 0);
  lines.push(
    `- Entrées du fichier : ${String(a.entrees)} — retenues : ${String(retenues)} — **écartées : ${String(a.ecartees.length)}**.`,
    `- Votes officiels des nouveaux scrutins (data/build/votes-approfondi.json) : ${a.votes}.`,
    `- Catégories proposées sur le site : ${String(proposees.length)} sur ${String(a.categories.length)} (au moins 10 questions retenues ; objectif 20).`,
    `- Questions du parcours principal reprises dans aucune catégorie : ${a.existantesNonReprises.length ? a.existantesNonReprises.join(', ') : 'aucune'}.`,
    '',
    '| Catégorie | Questions | dont parcours principal | dont nouvelles | avec recherche | avec « En clair » | Proposée |',
    '|---|---:|---:|---:|---:|---:|---|',
    ...a.categories.map(
      (c) =>
        `| ${c.libelle} | ${String(c.questions)} | ${String(c.existantes)} | ${String(c.nouvelles)} | ${String(c.avecRecherche)} | ${String(c.avecEnClair)} | ${c.proposee ? 'oui' : c.questions > 0 ? '**non** (trop peu de questions)' : 'non (aucune question)'} |`,
    ),
    '',
  );
  lines.push('### Nouvelles questions sans recherche (affichées avec les votes AN et les proxies)', '');
  lines.push(a.questionsSansRecherche.length ? a.questionsSansRecherche.map((q) => `- ${q}`).join('\n') : '_Aucune._', '');
  lines.push('### Nouvelles questions sans fiche « En clair »', '');
  lines.push(a.enClairManquants.length ? a.enClairManquants.map((q) => `- ${q}`).join('\n') : '_Aucune._', '');
  lines.push('### Entrées écartées', '');
  lines.push(
    a.ecartees.length ? a.ecartees.map((e) => `- [${String(e.index)}] ${e.id ?? '(sans identifiant)'} : ${e.motifs.join(' ; ')}`).join('\n') : '_Aucune._',
    '',
  );
  lines.push('### Positions des nouvelles questions par nature de preuve', '', '| Nature | Nombre |', '|---|---:|');
  for (const [k, v] of Object.entries(a.preuves)) lines.push(`| ${k} | ${String(v)} |`);
  lines.push('');
  if (Object.keys(a.couverture).length) {
    lines.push('| Candidat | Positions connues | dont votes nominatifs | dont proxies | Inconnues |', '|---|---:|---:|---:|---:|');
    for (const [cid, c] of Object.entries(a.couverture))
      lines.push(`| ${cid} | ${String(c.connues)} | ${String(c.votes)} | ${String(c.proxies)} | ${String(c.inconnues)} |`);
    lines.push('');
  }
  const notable = a.issues.filter((i) => i.severity !== 'info' && i.code !== 'recherche-absente');
  lines.push('### Avertissements du mode approfondi (non bloquants)', '');
  lines.push(notable.length ? notable.map((i) => `- [${SEVERITY_LABEL[i.severity]}] ${where(i) ? `${where(i)} ` : ''}(${i.code}) : ${i.message}`).join('\n') : '_Aucun._', '');
  const infos = a.issues.filter((i) => i.severity === 'info' && i.code.startsWith('approfondi-'));
  if (infos.length) lines.push('### Contrôles de la sélection (info)', '', ...infos.map((i) => `- ${where(i) ? `${where(i)} ` : ''}(${i.code}) : ${i.message}`), '');
  return lines;
}

const STATUT_COURT: Record<keyof JusticeReport['partis'][number]['parStatut'], string> = {
  definitive: 'Définitive',
  appel_en_cours: 'Appel',
  pourvoi_en_cours: 'Pourvoi',
  inconnu: 'Non confirmé',
};

const ORIGINE_DATE = {
  fichier: 'champ dateConsultation',
  releve: 'justice-dates.json',
  modification: 'dernière modification',
  generation: 'génération',
} as const;

/**
 * Appartenance actuelle (data/justice/membres/) et anciens membres (data/justice/anciens/) : niveau 1 (candidat, parti,
 * membres actuels — seuls comptés sur le site) et niveau 2 (passif : anciens membres), par parti et par famille.
 */
function formatNiveaux(report: BuildReport): string[] {
  const j = report.justice;
  const somme = (n: 1 | 2, p: JusticeReport['partis'][number]) => FAMILLES.reduce((k, f) => k + p.niveaux[n][f], 0);
  const total = (n: 1 | 2) => j.partis.reduce((k, p) => k + somme(n, p), 0);
  const inconnus = j.partis.filter((p) => p.inconnus.length > 0);
  const lines = [
    '### Appartenance actuelle et niveaux',
    '',
    `- Fichiers membres/ lus : ${String(j.partis.filter((p) => p.membres === 'lu').length)} sur ${String(j.partis.length)} ; anciens/ lus : ${String(j.partis.filter((p) => p.anciens === 'lu').length)} (« ignoré » : fiche du parti illisible).`,
    `- **Niveau 1 (comptées : candidat, parti, membres actuels, y compris suspendus) : ${String(total(1))}** — niveau 2 (passif : anciens membres, non comptées) : ${String(total(2))}, dont ${String(j.partis.reduce((k, p) => k + p.anciensAffichees, 0))} de la recherche anciens/.`,
    `- Par statut d'appartenance : ${STATUTS_MEMBRE.map((st) => `${APPARTENANCE_LABEL[st]} ${String(j.partis.reduce((k, p) => k + p.parAppartenance[st], 0))}`).join(', ')}.`,
    `- Personnes au statut « inconnu » (fichier membres/ absent, personne absente, statut non sourcé, ou non établi par la recherche anciens/) : ${inconnus.length ? inconnus.map((p) => `${p.id} : ${p.inconnus.join(', ')}`).join(' ; ') : 'aucune'}.`,
    '',
    `| Parti | Candidats | membres/ | anciens/ | ${FAMILLES.map((f) => `N1 ${FAMILLE_COURT[f]}`).join(' | ')} | **N1** | ${FAMILLES.map((f) => `N2 ${FAMILLE_COURT[f]}`).join(' | ')} | **N2** |`,
    `|---|---|---|---|${FAMILLES.map(() => '---:|').join('')}---:|${FAMILLES.map(() => '---:|').join('')}---:|`,
    ...j.partis.map(
      (p) =>
        `| ${p.id} | ${p.candidats.join(', ')} | ${p.membres} | ${p.anciens} | ${FAMILLES.map((f) => p.niveaux[1][f]).join(' | ')} | ${String(somme(1, p))} | ${FAMILLES.map((f) => p.niveaux[2][f]).join(' | ')} | ${String(somme(2, p))} |`,
    ),
    '',
    `| Parti | ${STATUTS_MEMBRE.map((st) => APPARTENANCE_LABEL[st]).join(' | ')} | dont anciens/ | Personnes vérifiées (anciens/) |`,
    `|---|${STATUTS_MEMBRE.map(() => '---:|').join('')}---:|---:|`,
    ...j.partis.map((p) => `| ${p.id} | ${STATUTS_MEMBRE.map((st) => p.parAppartenance[st]).join(' | ')} | ${String(p.anciensAffichees)} | ${p.personnesVerifieesAnciens ?? '—'} |`),
    '',
    '_Niveau 1 : la personne candidate (toujours), le parti (personne morale), les membres et membres suspendus — seules ces condamnations sont comptées dans la synthèse et sur les cartes du site. Niveau 2 (« Passif ») : exclus, partis, retirés de la vie politique sans adhésion confirmée, décédés, appartenance inconnue, et toutes les entrées de anciens/ ; affichées à part, non comptées. Jointure membres/ par la chaîne exacte du champ `personne`._',
    '',
  ];
  return lines;
}

/** Section « Partis et condamnations » : bilan par parti, rejets, points à relire. */
function formatJustice(report: BuildReport): string[] {
  const j = report.justice;
  const lines: string[] = ['## Partis et condamnations (data/justice/)', ''];
  if (j.partis.length === 0) return [...lines, '_Aucun parti rattaché aux candidats (champ `partis` de candidats.json)._', ''];
  const lus = j.partis.filter((p) => p.fichier === 'lu');
  const total = (k: 'affichees' | 'rejetees' | 'datesPartielles') => j.partis.reduce((n, p) => n + p[k], 0);
  const partielles = j.partis.filter((p) => p.datesPartielles > 0).map((p) => `${p.id} ${String(p.datesPartielles)}`);
  lines.push(
    `- Fiches lues : ${lus.length} sur ${j.partis.length}${lus.length < j.partis.length ? ` — absentes ou illisibles (« en cours de documentation » sur le site) : ${j.partis.filter((p) => p.fichier !== 'lu').map((p) => `${p.id} (${p.fichier})`).join(', ')}` : ''}.`,
    `- Condamnations affichées (fiches et anciens/) : ${total('affichees')} — **rejetées (jamais affichées) : ${total('rejetees')}**.`,
    `- Condamnations affichées avec une date de décision partielle (AAAA ou AAAA-MM, affichée « en 1998 », « en mai 2015 ») : ${total('datesPartielles')}${partielles.length ? ` (${partielles.join(', ')})` : ''}.`,
    `- Condamnations affichées par famille (ordre de gravité) : ${FAMILLES.map((f) => `${FAMILLE_COURT[f]} ${String(j.partis.reduce((n, p) => n + p.parFamille[f], 0))}`).join(', ')} — famille absente ou invalide, classée « Autres » : ${String(report.issues.filter((i) => i.code === 'justice-famille-absente' || i.code === 'justice-famille-invalide').length)}.`,
    `- Candidats sans biographie sourcée : ${j.candidatsSansBio.length ? j.candidatsSansBio.join(', ') : 'aucun'}.`,
  );
  if (j.fichiersOrphelins.length) lines.push(`- Fichiers ignorés (aucun parti correspondant) : ${j.fichiersOrphelins.join(', ')}.`);
  lines.push(
    '',
    `| Parti | Candidats | Fiche | Consultation (origine) | Affichées | Rejetées | ${Object.values(STATUT_COURT).join(' | ')} | Personnes vérifiées |`,
    `|---|---|---|---|---:|---:|${Object.keys(STATUT_COURT).map(() => '---:|').join('')}---:|`,
  );
  for (const p of j.partis)
    lines.push(
      `| ${p.id} | ${p.candidats.join(', ')} | ${p.fichier} | ${p.dateConsultation ? `${p.dateConsultation} (${p.origineDate ? ORIGINE_DATE[p.origineDate] : '?'})` : '—'} | ${p.affichees} | ${p.rejetees} | ${Object.keys(STATUT_COURT).map((k) => p.parStatut[k as keyof typeof STATUT_COURT]).join(' | ')} | ${p.personnesVerifiees ?? '—'} |`,
    );
  lines.push(
    '',
    `| Parti | ${FAMILLES.map((f) => FAMILLE_COURT[f]).join(' | ')} | Affichées |`,
    `|---|${FAMILLES.map(() => '---:|').join('')}---:|`,
    ...j.partis.map((p) => `| ${p.id} | ${FAMILLES.map((f) => p.parFamille[f]).join(' | ')} | ${p.affichees} |`),
    '',
    '_Familles : classement de chaque condamnation d’après sa qualification juridique (champ `famille` de la fiche), de la plus grave à la moins grave (choix éditorial). Une discordance apparente entre la famille et la qualification figure dans « Points à relire »._',
  );
  lines.push('', ...formatNiveaux(report));
  lines.push(
    '_Date affichée sur le site (« sources consultées à la date du… ») : champ `dateConsultation` de la fiche ; à défaut, date relevée dans `data/justice-dates.json` ; à défaut, date de dernière modification de la fiche (dernier commit git si elle est versionnée et inchangée, sinon date du fichier — à confirmer)._',
    '',
  );

  lines.push('### Erreurs : condamnations rejetées (non affichées)', '');
  lines.push(
    j.rejets.length
      ? j.rejets.map((r) => `- [REJET] ${r.parti} / ${r.liste === 'anciens' ? 'anciens/' : ''}condamnations[${r.index}] (${r.personne ?? 'personne inconnue'}) : ${r.motifs.join(' ; ')}`).join('\n')
      : '_Aucune._',
    '',
  );

  const justiceIssues = report.issues.filter((i) => i.parti && i.code !== 'condamnation-rejetee' && i.code !== 'justice-absent');
  if (justiceIssues.length)
    lines.push('### Contrôles des fiches', '', ...justiceIssues.map((i) => `- [${SEVERITY_LABEL[i.severity]}] ${where(i)} (${i.code}) : ${i.message}`), '');

  const relire = j.partis.filter((p) => p.aRelire.length || p.alertes.length);
  lines.push('### Points à relire avant publication', '');
  lines.push(
    'Entrées affichées dont le texte évoque une relaxe, une annulation ou une procédure en cours, citations de plus de 40 mots, famille qui ne correspond pas à la qualification juridique, alertes de la recherche (jamais affichées sur le site) :',
    '',
  );
  if (relire.length === 0) lines.push('_Aucun._', '');
  for (const p of relire) {
    lines.push(`**${p.id}**`, '');
    for (const a of p.aRelire) lines.push(`- ${a}`);
    for (const a of p.alertes) lines.push(`- Alerte de la recherche : ${a}`);
    lines.push('');
  }

  const methodes = j.partis.filter((p) => p.methode || p.limites || p.methodeAnciens || p.limitesAnciens);
  if (methodes.length) {
    lines.push('### Méthode et limites déclarées par la recherche (non affichées sur le site)', '');
    for (const p of methodes) {
      if (p.methode || p.limites) lines.push(`- **${p.id}**${p.methode ? ` — méthode : ${p.methode}` : ''}${p.limites ? ` — limites : ${p.limites}` : ''}`);
      if (p.methodeAnciens || p.limitesAnciens)
        lines.push(`- **${p.id} (anciens/)**${p.methodeAnciens ? ` — méthode : ${p.methodeAnciens}` : ''}${p.limitesAnciens ? ` — limites : ${p.limitesAnciens}` : ''}`);
    }
    lines.push('');
  }
  return lines;
}
