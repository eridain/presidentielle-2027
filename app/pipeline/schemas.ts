// Schémas de validation (zod) des entrées du pipeline et du fichier produit.
// Utilisés uniquement au build : zod n'est pas embarqué dans l'application.
import { z } from 'zod';
import { PORTEES } from '../src/lib/categories';
import { periodeDecision } from '../src/lib/justice';

export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.');
  } catch {
    return false;
  }
}

export const httpUrl = z.string().refine(isHttpUrl, { message: 'URL http(s) invalide' });
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date AAAA-MM-JJ attendue');
export const looseDate = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, 'date AAAA[-MM[-JJ]] attendue');
export const questionId = z.string().regex(/^[a-z0-9-]+$/, 'identifiant de question invalide');
export const scrutinUid = z.string().regex(/^VT(AN|CG)R5L\d+V\d+$/, 'identifiant de scrutin invalide');

// ---------------------------------------------------------------- entrées

export const selectionSchema = z.array(
  z.object({
    id: questionId,
    theme: z.string().min(1),
    scrutin: scrutinUid,
    question: z.string().min(1),
    sens: z.enum(['pour=oui', 'motion_censure=non']),
    note: z.string().optional(),
  }),
);
export type SelectionEntry = z.infer<typeof selectionSchema>[number];

/**
 * Période de validité d'un proxy de groupe (bornes incluses, l'une ou l'autre peut manquer) :
 * le candidat appartenait au parti du groupe (ou à une formation alliée) entre ces dates.
 */
export const proxyPeriodeSchema = z
  .object({ du: isoDate.optional(), au: isoDate.optional() })
  .strict()
  .refine((p) => p.du !== undefined || p.au !== undefined, { message: 'période sans borne (du / au)' })
  .refine((p) => p.du === undefined || p.au === undefined || p.du <= p.au, { message: 'période inversée (du > au)' });
export type ProxyPeriode = z.infer<typeof proxyPeriodeSchema>;

/** Identifiant de parti : nom du fichier data/justice/<partiId>.json. */
export const partiId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'identifiant de parti invalide');

/** Rattachement d'un candidat à un parti (le premier de la liste est son parti principal). */
export const partiRattachementSchema = z
  .object({
    id: partiId,
    /** Nom affiché du parti (sert aussi quand data/justice/<id>.json manque). */
    nom: z.string().trim().min(1),
    /** Nature du lien quand ce n'est pas le parti principal (phrase affichée). */
    rattachement: z.string().trim().min(1).optional(),
  })
  .strict();

export const candidatsSchema = z.array(
  z
    .object({
      id: z.string().regex(/^[a-z]+$/),
      nom: z.string().min(1),
      parti: z.string().min(1),
      /** Parti(s) du candidat, principal en premier (section « Partis & candidats »). */
      partis: z.array(partiRattachementSchema).min(1).optional(),
      acteur: z.string().regex(/^PA\d+$/).nullable(),
      proxyGroupe: z.array(z.string().min(1)),
      /** Absent : proxy valable à toute date. Sinon, valable seulement pendant l'une de ces périodes. */
      proxyPeriodes: z.array(proxyPeriodeSchema).min(1).optional(),
      /** Explication affichée quand le proxy est écarté (hors période). */
      proxyMotif: z.string().trim().min(1).optional(),
    })
    .refine((c) => c.proxyPeriodes === undefined || c.proxyGroupe.length > 0, {
      message: 'proxyPeriodes sans proxyGroupe',
      path: ['proxyPeriodes'],
    })
    .refine((c) => new Set((c.partis ?? []).map((p) => p.id)).size === (c.partis ?? []).length, {
      message: 'parti cité deux fois',
      path: ['partis'],
    }),
);
export type CandidatInput = z.infer<typeof candidatsSchema>[number];

const count = z.number().int().nonnegative();

/** Entrée de votes.json (et de votes-approfondi.json) : résultat du scrutin et votes nominatifs des candidats. */
const voteEntrySchema = z.object({
  id: questionId,
  scrutin: scrutinUid,
  question: z.string(),
  sens: z.string(),
  note: z.string().optional(),
  date: isoDate,
  titreScrutin: z.string().min(1),
  typeVote: z.string().min(1),
  sort: z.enum(['adopté', 'rejeté']),
  pour: count,
  contre: count,
  abstention: count,
  dossier: z.string().nullable(),
  dossierRef: z.string().nullable(),
  urlScrutin: httpUrl.nullable(),
  groupes: z.array(
    z.object({
      organe: z.string(),
      libelle: z.string(),
      abrege: z.string().nullable(),
      membres: count,
      majoritaire: z.string().nullable(),
      pour: count,
      contre: count,
      abstention: count,
      nonVotants: count,
    }),
  ),
  candidats: z.record(
    z.string(),
    z.object({
      gouvernement: z.string().nullable(),
      position: z.enum(['pour', 'contre', 'abstention', 'absent', 'non-votant']).nullable(),
      groupe: z.string().optional(),
      parDelegation: z.boolean().optional(),
      source: z.string(),
    }),
  ),
});

export const votesSchema = z.array(voteEntrySchema.extend({ theme: z.string() }));

/**
 * Entrée de data/build/votes-approfondi.json (extract_votes.py --approfondi) : mêmes champs que votes.json, avec la
 * catégorie et la portée du scrutin (ensemble | article | amendement | motion_censure) reprises de la sélection.
 */
export const voteApprofondiSchema = voteEntrySchema.extend({
  categorie: z.string().optional(),
  portee: z.string().nullable().optional(),
});

export type VoteEntry = z.infer<typeof voteEntrySchema>;
export type VoteCandidat = VoteEntry['candidats'][string];

// ---------------------------------------------------------------- recherche (éléments)

export const sourceLinkSchema = z.object({ titre: z.string().trim().min(1), url: httpUrl });

export const argumentSchema = z.object({
  auteur: z.string().trim().min(1),
  resume: z.string().trim().min(1),
  citation: z.string().trim().min(1).nullable().optional(),
  url: httpUrl,
  date: looseDate.nullable().optional(),
});

// ---------------------------------------------------------------- sortie (AppData)

const scrutinPosition = z.enum(['pour', 'contre', 'abstention']);
const nullableText = z.string().min(1).nullable();

const argumentOut = z.object({
  auteur: z.string().min(1),
  resume: z.string().min(1),
  citation: nullableText,
  url: httpUrl,
  date: looseDate.nullable(),
});

const candidatePositionOut = z
  .object({
    position: scrutinPosition.nullable(),
    stance: z.enum(['oui', 'non', 'abstention', 'inconnu']),
    evidence: z.enum([
      'vote_an',
      'vote_congres',
      'vote_senat',
      'vote_pe',
      'gouvernement',
      'declaration',
      'censure_implicite',
      'groupe',
      'inconnu',
    ]),
    detail: z.string().min(1),
    note: nullableText,
    groupe: nullableText,
    url: httpUrl.nullable(),
    date: looseDate.nullable(),
    argument: nullableText,
    citation: nullableText,
    argumentUrl: httpUrl.nullable(),
    commentaire: nullableText,
    incoherence: nullableText,
    attribution: z
      .object({
        duCandidat: z.boolean().nullable(),
        porteur: z.enum(['groupe', 'gouvernement']).nullable(),
        orateur: nullableText,
        groupe: nullableText,
        verification: z.enum(['compte-rendu', 'recherche']).nullable(),
      })
      .refine((a) => (a.duCandidat === false) === (a.porteur !== null), { message: 'porteur sans propos de tiers' })
      .nullable(),
  })
  .refine((p) => (p.attribution === null) === (p.argument === null && p.citation === null), {
    message: 'attribution sans argument ni citation',
  })
  .refine((p) => (p.position === null) === (p.stance === 'inconnu'), {
    message: 'position et stance incohérentes',
  })
  .refine((p) => (p.evidence === 'inconnu') === (p.position === null), {
    message: 'nature de preuve et position incohérentes',
  })
  .refine((p) => p.evidence === 'inconnu' || p.url !== null, {
    message: 'position connue sans source',
  });

const sourceJusticeOut = z.object({
  titre: z.string().min(1),
  url: httpUrl,
  citations: z.array(z.string().min(1)).min(1),
  date: isoDate.nullable(),
});

/** Date partielle ou complète : AAAA, AAAA-MM ou AAAA-MM-JJ (date calendaire valide). */
const datePartielle = z.string().refine((d) => periodeDecision(d) !== null, { message: 'date AAAA, AAAA-MM ou AAAA-MM-JJ attendue' });

const appartenanceOut = z
  .object({
    statut: z.enum(['membre', 'suspendu', 'exclu', 'depart', 'retire', 'decede', 'personne_morale', 'inconnu']),
    depuis: datePartielle.nullable(),
    detail: nullableText,
    lien: z.enum(['oui', 'non', 'inconnu']).nullable(),
    reactionParti: nullableText,
    sources: z.array(sourceJusticeOut),
  })
  // jamais un statut affirmé sans preuve (sauf le parti lui-même, personne morale)
  .refine((a) => a.statut === 'inconnu' || a.statut === 'personne_morale' || a.sources.length > 0, {
    message: 'appartenance sans source',
  });

const condamnationOut = z.object({
  id: z.string().min(1),
  personne: z.string().min(1),
  categorie: z.enum(['candidat', 'parti', 'ancien_dirigeant', 'dirigeant', 'depute', 'senateur', 'eurodepute', 'ancien_membre']),
  candidat: nullableText,
  roleActuel: nullableText,
  infraction: z.string().min(1),
  faits: nullableText,
  juridiction: z.string().min(1),
  // AAAA-MM-JJ, ou AAAA-MM / AAAA quand les sources ne donnent pas le jour (date calendaire valide)
  dateDecision: datePartielle,
  peine: nullableText,
  statut: z.enum(['definitive', 'appel_en_cours', 'pourvoi_en_cours', 'inconnu']),
  nature: z.enum(['penale', 'financiere', 'civile']),
  famille: z.enum(['probite', 'violences', 'haine', 'diffamation', 'autres']),
  lieeMandatPolitique: z.boolean().nullable(),
  // Règle éditoriale : jamais de condamnation affichée sans source vérifiable et citation.
  sources: z.array(sourceJusticeOut).min(1),
  appartenance: appartenanceOut,
});

const ficheOut = z.object({
  dateConsultation: isoDate,
  predecesseurs: z.array(z.string().min(1)),
  fondation: nullableText,
  presentation: nullableText,
  presentationSources: z.array(sourceLinkSchema),
  direction: z.array(z.object({ nom: z.string().min(1), fonction: z.string().min(1), url: httpUrl.nullable() })),
  effectifs: z
    .object({
      deputes: count.nullable(),
      senateurs: count.nullable(),
      eurodeputes: count.nullable(),
      sources: z.array(sourceLinkSchema).min(1),
      precision: nullableText,
    })
    .nullable(),
  condamnations: z.array(condamnationOut),
  liste: z.enum(['vide', 'remplie', 'absente']),
  personnesVerifiees: count.nullable(),
  appartenance: z.enum(['lue', 'absente', 'illisible']),
  anciens: z.object({
    liste: z.enum(['vide', 'remplie', 'absente']),
    personnesVerifiees: count.nullable(),
    dateConsultation: isoDate.nullable(),
  }),
});

/** Question produite (parcours principal ou mode approfondi). */
export const questionOutSchema = z.object({
  id: questionId,
  theme: z.string().min(1),
  titre: z.string().min(1),
  question: z.string().min(1),
  ouiSignifie: z.enum(['pour', 'contre']),
  contexte: nullableText,
  contexteSources: z.array(sourceLinkSchema),
  recherche: z.boolean(),
  enClair: z
    .object({
      questionSimple: z.string().min(1),
      enBref: z.string().min(1),
      pourquoiPour: z.string().min(1),
      pourquoiContre: z.string().min(1),
      ceQuiSestPasse: z.string().min(1),
      lexique: z.array(z.object({ terme: z.string().min(1), definition: z.string().min(1) })),
    })
    .nullable(),
  scrutin: z.object({
    uid: scrutinUid,
    assemblee: z.enum(['AN', 'Congrès']),
    numero: z.string().min(1),
    date: isoDate,
    titre: z.string().min(1),
    typeVote: z.string().min(1),
    sort: z.enum(['adopté', 'rejeté']),
    pour: count,
    contre: count,
    abstention: count,
    url: httpUrl.nullable(),
    urlDossier: httpUrl.nullable(),
    censure: z.boolean(),
    note: nullableText,
  }),
  groupes: z.array(
    z.object({
      abrege: z.string().min(1),
      libelle: z.string().min(1),
      membres: count,
      majoritaire: scrutinPosition.nullable(),
      pour: count,
      contre: count,
      abstention: count,
      nonVotants: count,
    }),
  ),
  arguments: z.object({
    pour: z.array(argumentOut),
    contre: z.array(argumentOut),
    abstention: z.array(argumentOut),
  }),
  candidats: z.record(z.string(), candidatePositionOut),
  alertes: z.array(z.string()),
});

export const appDataSchema = z.object({
  version: z.literal(1),
  genereLe: z.string().min(1),
  collecteAN: z.string().nullable(),
  candidats: z.array(
    z.object({
      id: z.string().min(1),
      nom: z.string().min(1),
      parti: z.string().min(1),
      tri: z.string().min(1),
      proxy: z.object({
        groupes: z.array(z.string().min(1)),
        periodes: z.array(z.object({ du: isoDate.nullable(), au: isoDate.nullable() })),
        motif: nullableText,
      }),
      partis: z.array(z.string().min(1)),
      bio: z.object({ texte: z.string().min(1), sources: z.array(sourceLinkSchema).min(1) }).nullable(),
    }),
  ),
  partis: z.array(
    z.object({
      id: partiId,
      nom: z.string().min(1),
      sigle: nullableText,
      candidats: z.array(z.object({ id: z.string().min(1), rattachement: nullableText })),
      fiche: ficheOut.nullable(),
    }),
  ),
  themes: z.array(z.string().min(1)),
  questions: z.array(questionOutSchema),
  approfondi: z
    .object({
      categories: z.array(
        z.object({
          id: z.string().regex(/^[a-z0-9-]+$/),
          libelle: z.string().min(1),
          questions: z.array(z.object({ id: questionId, existant: z.boolean(), portee: z.enum(PORTEES) })).min(1),
        }),
      ),
    })
    .nullable(),
});
