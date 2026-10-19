// Résolution de la position d'un candidat sur une question, par ordre de priorité :
//   1. vote nominatif officiel (data/build/votes.json) — AN ou Congrès ;
//   2. entrée de la recherche de type vote_senat | vote_congres | vote_pe | gouvernement | declaration
//      avec une position connue et une source valide ;
//   2 bis. motion de censure : député(e) en mandat qui ne figure pas parmi les votants
//      = n'a pas voté la censure → soutien implicite, à faible poids ;
//   3. membre du gouvernement à la date (votes.json) → position du gouvernement fournie par la recherche ;
//   4. proxy : position majoritaire du groupe AN de son parti présent dans le scrutin, seulement si
//      la date du scrutin tombe dans une période de validité du proxy (candidats.json, proxyPeriodes) ;
//   5. inconnu (« absent » = député(e) n'ayant pas pris part au vote : pas de proxy).
// Puis : attribution des propos (attribution.ts) et masquage des précisions qui citent un vote de groupe
// quand aucun proxy n'est appliqué.
import { formatPeriodes } from '../src/lib/format';
import type { CandidatePosition, EvidenceType, ScrutinPosition, Stance } from '../src/types';
import { resolveAttribution, type AttributionCheck } from './attribution';
import type { Issue } from './report';
import type { Research, ResearchCandidate, ResearchType } from './research';
import type { CandidatInput, VoteEntry } from './schemas';

/** Portail open data de l'AN : source des votes nominatifs quand la page du scrutin n'est pas connue. */
export const OPEN_DATA_AN_URL = 'https://data.assemblee-nationale.fr';

/** Détecte une recherche qui juge le proxy de groupe non pertinent (ou douteux) pour ce candidat à cette date. */
export const PROXY_CONTESTED =
  /(aucun proxy|pas de proxy|proxy (de groupe )?(indisponible|non disponible|incertain|indicatif)|à titre indicatif)/i;

/** Mention affichée sur un proxy appliqué malgré une réserve de la recherche. */
export const PROXY_RESERVE_NOTE = 'Proxy maintenu malgré une réserve de la recherche';

/**
 * Texte de la recherche qui évoque un vote de groupe (« PROXY : le groupe GDR a voté contre »,
 * « le groupe RN s'est abstenu ») : affiché seulement si un proxy est réellement appliqué.
 */
export const GROUP_VOTE_MENTION =
  /\bproxy\b|\bgroupes?\b[^.;]{0,120}?\b(?:a|ont|avait|avaient|s['’]est|s['’]était|était|étaient)\s+(?:\p{L}+ment\s+)?(?:voté|abstenu|partagé|divisé)|\bgroupe\b[^.;]{0,60}?\babstenu/iu;

/**
 * Le proxy de groupe s'applique-t-il à cette date ? Oui si le candidat n'a pas de période de
 * validité (proxy permanent), sinon seulement si la date tombe dans l'une d'elles (bornes incluses).
 */
export function proxyActif(candidat: Pick<CandidatInput, 'proxyPeriodes'>, date: string): boolean {
  const periodes = candidat.proxyPeriodes;
  if (periodes === undefined) return true;
  return periodes.some((p) => (p.du === undefined || date >= p.du) && (p.au === undefined || date <= p.au));
}

export const RESEARCH_EVIDENCE: readonly ResearchType[] = [
  'vote_senat',
  'vote_congres',
  'vote_pe',
  'gouvernement',
  'declaration',
];

export function toStance(position: ScrutinPosition | null, ouiSignifie: 'pour' | 'contre'): Stance {
  if (position === null) return 'inconnu';
  if (position === 'abstention') return 'abstention';
  return position === ouiSignifie ? 'oui' : 'non';
}

export function scrutinNumero(uid: string): string {
  return /V(\d+)$/.exec(uid)?.[1] ?? uid;
}

function isKnown(p: ResearchCandidate['position']): p is ScrutinPosition {
  return p === 'pour' || p === 'contre' || p === 'abstention';
}

/**
 * Position majoritaire d'un groupe, recalculée à partir des décomptes (le champ
 * `positionMajoritaire` de l'open data vaut « pour » pour tous les groupes lors d'une
 * motion de censure, même sans aucun votant).
 * - scrutin ordinaire : position la plus fréquente parmi les suffrages du groupe ;
 *   en cas d'égalité, la position indiquée par l'AN si elle fait partie des ex aequo ; null si aucun suffrage ;
 * - motion de censure : « pour » si plus de la moitié des membres l'ont votée, sinon « contre »
 *   (la majorité du groupe n'a pas voté la censure).
 */
export function groupMajority(
  g: { membres: number; pour: number; contre: number; abstention: number; majoritaire: string | null },
  censure: boolean,
): ScrutinPosition | null {
  if (censure) {
    if (g.membres <= 0) return null;
    return g.pour * 2 > g.membres ? 'pour' : 'contre';
  }
  const counts: [ScrutinPosition, number][] = [
    ['pour', g.pour],
    ['contre', g.contre],
    ['abstention', g.abstention],
  ];
  const max = Math.max(...counts.map(([, n]) => n));
  if (max <= 0) return null;
  const top = counts.filter(([, n]) => n === max).map(([p]) => p);
  if (top.length === 1) return top[0] ?? null;
  return top.find((p) => p === g.majoritaire) ?? null;
}

export interface GovPosition {
  position: ScrutinPosition;
  url: string;
  date: string | null;
  source: string;
}

/**
 * Position du gouvernement selon la recherche : position commune des entrées de type
 * « gouvernement » (si elles concordent). Null si la recherche ne la fournit pas.
 */
export function governmentPosition(research: Research | null, candidats: readonly CandidatInput[]): GovPosition | null {
  if (!research) return null;
  const entries = Object.entries(research.candidats).filter(
    ([, c]) => c.type === 'gouvernement' && isKnown(c.position) && c.url !== null,
  );
  const first = entries[0];
  if (!first) return null;
  const positions = new Set(entries.map(([, c]) => c.position));
  if (positions.size !== 1) return null;
  const [cid, c] = first;
  const nom = candidats.find((x) => x.id === cid)?.nom ?? cid;
  return { position: c.position as ScrutinPosition, url: c.url as string, date: c.date, source: nom };
}

export interface ResolveContext {
  candidat: CandidatInput;
  vote: VoteEntry;
  research: Research | null;
  ouiSignifie: 'pour' | 'contre';
  censure: boolean;
  govPosition: GovPosition | null;
  /** Vérification de l'orateur dans le compte rendu de séance (attributions.json), si elle existe. */
  attributionCheck?: AttributionCheck | null;
}

export interface ResolveResult {
  position: CandidatePosition;
  issues: Issue[];
}

const POSITION_LABEL: Record<ScrutinPosition, string> = { pour: 'pour', contre: 'contre', abstention: 'abstention' };

export function resolvePosition(ctx: ResolveContext): ResolveResult {
  const res = resolveEvidence(ctx);
  const position = { ...res.position };
  const issues = [...res.issues];
  const where = { question: ctx.vote.id, candidat: ctx.candidat.id };

  // Aucun proxy appliqué : une précision qui cite le vote du groupe prêterait à confusion.
  if (position.evidence !== 'groupe' && position.commentaire && GROUP_VOTE_MENTION.test(position.commentaire)) {
    issues.push({
      severity: 'info',
      code: 'precision-masquee',
      ...where,
      message: `Précision de la recherche non affichée (vote de groupe cité sans proxy appliqué) : « ${position.commentaire} »`,
    });
    position.commentaire = null;
  }

  const r = ctx.research;
  const { attribution, problemes } = resolveAttribution({
    nom: ctx.candidat.nom,
    research: r?.candidats[ctx.candidat.id] ?? null,
    groupe: position.groupe,
    check: ctx.attributionCheck ?? null,
    auteurs: r ? [...r.argumentsPour, ...r.argumentsContre, ...r.argumentsAbstention].map((a) => a.auteur) : [],
  });
  position.attribution = attribution;
  for (const p of problemes) issues.push({ ...p, ...where });
  return { position, issues };
}

function resolveEvidence(ctx: ResolveContext): ResolveResult {
  const { candidat, vote, research, ouiSignifie, censure, govPosition } = ctx;
  const cid = candidat.id;
  const issues: Issue[] = [];
  const official = vote.candidats[cid];
  const r = research?.candidats[cid] ?? null;
  const congres = vote.scrutin.startsWith('VTCG');
  const numero = scrutinNumero(vote.scrutin);
  const lieu = congres ? 'au Congrès du Parlement' : "à l'Assemblée nationale";
  const scrutinUrl = vote.urlScrutin ?? research?.urlScrutin ?? OPEN_DATA_AN_URL;

  // Éléments communs apportés par la recherche (arguments, citation).
  const fromResearch = {
    argument: r?.argument ?? null,
    citation: r?.citation ?? null,
    argumentUrl: r?.argument || r?.citation ? r.url : null,
  };

  const make = (
    position: ScrutinPosition | null,
    evidence: EvidenceType,
    fields: Partial<CandidatePosition> & { detail: string },
  ): CandidatePosition => ({
    position,
    stance: toStance(position, ouiSignifie),
    evidence,
    note: null,
    groupe: null,
    url: null,
    date: null,
    ...fromResearch,
    commentaire: null,
    incoherence: null,
    attribution: null,
    ...fields,
  });

  const officialPosition =
    official?.position === 'pour' || official?.position === 'contre' || official?.position === 'abstention'
      ? official.position
      : null;

  // 1. Vote nominatif officiel.
  if (officialPosition !== null) {
    let incoherence: string | null = null;
    if (r && isKnown(r.position) && r.position !== officialPosition) {
      incoherence = `La recherche indique « ${r.position} » (${r.type ?? 'type non précisé'}) alors que le vote officiel est « ${officialPosition} » : le vote officiel est retenu.`;
      issues.push({ severity: 'avertissement', code: 'incoherence-vote', question: vote.id, candidat: cid, message: incoherence });
    }
    const groupe = official?.groupe ?? null;
    const detail = censure
      ? `A voté la motion de censure ${lieu} (scrutin n°\u00a0${numero})${groupe ? `, groupe ${groupe}` : ''}.`
      : `Vote nominatif ${lieu} (scrutin n°\u00a0${numero})${groupe ? `, groupe ${groupe}` : ''}.`;
    const argumentUrl = fromResearch.argumentUrl !== scrutinUrl ? fromResearch.argumentUrl : null;
    return {
      position: make(officialPosition, congres ? 'vote_congres' : 'vote_an', {
        detail,
        note: official?.parDelegation ? 'Vote par délégation' : null,
        groupe,
        url: scrutinUrl,
        date: vote.date,
        argumentUrl,
        commentaire: r?.detail ?? null,
        incoherence,
      }),
      issues,
    };
  }

  const absent = official?.position === 'absent' || official?.position === 'non-votant';
  if (r?.type === 'vote_an' && isKnown(r.position)) {
    issues.push({
      severity: 'avertissement',
      code: 'incoherence-vote',
      question: vote.id,
      candidat: cid,
      message: `La recherche indique un vote AN « ${r.position} » absent des données officielles (${absent ? "n'a pas pris part au vote" : 'pas de vote nominatif'}) : non retenu.`,
    });
  }

  // 2. Preuve issue de la recherche (Sénat, Congrès, Parlement européen, gouvernement, déclaration).
  if (r && r.type && RESEARCH_EVIDENCE.includes(r.type) && isKnown(r.position)) {
    if (r.url === null) {
      issues.push({
        severity: 'avertissement',
        code: 'preuve-sans-source',
        question: vote.id,
        candidat: cid,
        message: `Position « ${r.position} » (${r.type}) sans URL valide : non retenue.`,
      });
    } else {
      return {
        position: make(r.position, r.type, {
          detail: r.detail ?? `Position documentée par la recherche (${r.type}).`,
          note: absent ? "Député(e) à cette date, n'a pas pris part au vote" : null,
          url: r.url,
          date: r.date,
          argumentUrl: null,
        }),
        issues,
      };
    }
  }

  // 2 bis. Motion de censure : ne pas figurer parmi les votants = ne pas avoir voté la censure.
  if (censure && absent) {
    return {
      position: make('contre', 'censure_implicite', {
        detail: `Député(e) en mandat, ne figure pas parmi les votants de la motion de censure (scrutin n°\u00a0${numero}) : seuls les votes « pour » sont enregistrés. Soutien implicite au texte, à faible poids.`,
        note: "N'a pas voté la censure",
        url: scrutinUrl,
        date: vote.date,
        commentaire: r?.detail ?? null,
      }),
      issues,
    };
  }

  // 3. Membre du gouvernement à la date du vote.
  if (official?.gouvernement && govPosition) {
    return {
      position: make(govPosition.position, 'gouvernement', {
        detail: `Membre du Gouvernement à la date du vote : position du Gouvernement (${POSITION_LABEL[govPosition.position]}), documentée par la recherche (${govPosition.source}).`,
        url: govPosition.url,
        date: govPosition.date,
        commentaire: r?.detail ?? null,
      }),
      issues,
    };
  }
  if (official?.gouvernement && !absent) {
    issues.push({
      severity: 'info',
      code: 'gouvernement-sans-position',
      question: vote.id,
      candidat: cid,
      message: 'Membre du Gouvernement à la date, mais la recherche ne fournit pas la position du Gouvernement.',
    });
  }

  // 4. Proxy : position majoritaire du groupe de son parti (jamais pour un(e) député(e) absent(e)),
  //    seulement si le candidat appartenait à ce parti à la date du scrutin (périodes de validité).
  const contested = r?.detail ? PROXY_CONTESTED.test(r.detail) : false;
  const proxyGroup = absent
    ? null
    : candidat.proxyGroupe
        .map((abrege) => {
          const g = vote.groupes.find((x) => x.abrege === abrege);
          const maj = g ? groupMajority(g, censure) : null;
          return g && maj ? { abrege, g, maj } : null;
        })
        .find((x) => x !== null) ?? null;
  const horsPeriode = proxyGroup !== null && !proxyActif(candidat, vote.date);
  if (proxyGroup && horsPeriode) {
    issues.push({
      severity: 'info',
      code: 'proxy-hors-periode',
      question: vote.id,
      candidat: cid,
      message: `Proxy ${proxyGroup.abrege} (${proxyGroup.maj}) non appliqué : scrutin du ${vote.date} hors de la période de validité (${formatPeriodes(candidat.proxyPeriodes ?? [])}).${contested ? ' La recherche le juge aussi non pertinent.' : ''}`,
    });
  } else if (proxyGroup) {
    const { abrege, g, maj } = proxyGroup;
    const scope = congres ? 'au Congrès' : "à l'Assemblée";
    const detail = censure
      ? `Proxy : ${g.pour} des ${g.membres} membres du groupe « ${g.libelle} » (${abrege}) ont voté la motion de censure ; ${maj === 'pour' ? "la majorité du groupe l'a votée" : "la majorité du groupe ne l'a pas votée (soutien implicite au texte)"}. Ce n'est pas un vote de ${candidat.nom}.`
      : `Proxy : position majoritaire du groupe « ${g.libelle} » (${abrege}) ${scope} — ${g.pour} pour, ${g.contre} contre, ${g.abstention} abstention(s). Ce n'est pas un vote de ${candidat.nom}.`;
    issues.push({ severity: 'info', code: 'proxy', question: vote.id, candidat: cid, message: `Proxy groupe ${abrege} (${maj}).` });
    if (contested && r?.detail) {
      // Une période de validité dans candidats.json = décision éditoriale prise pour ce candidat :
      // la réserve de la recherche est alors une simple information.
      issues.push(
        candidat.proxyPeriodes
          ? {
              severity: 'info',
              code: 'proxy-conteste-maintenu',
              question: vote.id,
              candidat: cid,
              message: `Proxy ${abrege} maintenu (période de validité retenue : ${formatPeriodes(candidat.proxyPeriodes)}) alors que la recherche émet une réserve : « ${r.detail} »`,
            }
          : {
              severity: 'avertissement',
              code: 'proxy-conteste',
              question: vote.id,
              candidat: cid,
              message: `Proxy ${abrege} appliqué (règle candidats.json) alors que la recherche l'estime non pertinent : « ${r.detail} »`,
            },
      );
    }
    return {
      position: make(maj, 'groupe', {
        detail,
        note: contested ? PROXY_RESERVE_NOTE : null,
        groupe: abrege,
        url: scrutinUrl,
        date: vote.date,
        commentaire: r?.detail ?? null,
      }),
      issues,
    };
  }

  // 5. Inconnu.
  let detail: string;
  let note: string | null = null;
  if (absent) {
    detail = `Député(e) à cette date, n'a pas pris part au vote (scrutin n°\u00a0${numero}).`;
    note = "N'a pas pris part au vote";
  } else if (official?.gouvernement) {
    detail = 'Membre du Gouvernement à la date du vote ; position du Gouvernement non documentée.';
  } else if (horsPeriode) {
    const periodes = formatPeriodes(candidat.proxyPeriodes ?? []);
    const motif =
      candidat.proxyMotif ??
      `le proxy de groupe (${candidat.proxyGroupe.join(', ')}) ne s'applique ${/^[aàâeéèêiîoôuy]/i.test(periodes) ? "qu'" : 'que '}${periodes}.`;
    detail = `Pas de vote nominatif sur ce scrutin ni de position documentée. Pas de proxy de groupe à cette date : ${motif}${/[.!?]$/.test(motif) ? '' : '.'}`;
  } else {
    detail = "Pas de vote nominatif sur ce scrutin, ni de position documentée, ni de groupe de référence présent dans le scrutin.";
  }
  issues.push({ severity: 'info', code: 'position-inconnue', question: vote.id, candidat: cid, message: detail });
  return {
    position: make(null, 'inconnu', {
      detail,
      note,
      commentaire: r?.detail ?? null,
      argumentUrl: fromResearch.argumentUrl,
    }),
    issues,
  };
}
