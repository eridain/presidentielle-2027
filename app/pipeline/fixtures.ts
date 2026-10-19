// Jeux de données minimaux pour les tests du pipeline.
import type { BuildInputs } from './build';

type Pos = 'pour' | 'contre' | 'abstention' | 'absent' | null;

export function candidat(
  id: string,
  proxyGroupe: string[] = [],
  acteur: string | null = 'PA1',
  extra: {
    proxyPeriodes?: { du?: string; au?: string }[];
    proxyMotif?: string;
    partis?: { id: string; nom: string; rattachement?: string }[];
  } = {},
) {
  return { id, nom: `Prénom ${id[0]?.toUpperCase()}${id.slice(1)}`, parti: `Parti ${id}`, acteur, proxyGroupe, ...extra };
}

export function groupe(abrege: string, pour: number, contre: number, abstention: number, membres?: number, majoritaire?: string) {
  return {
    organe: `PO-${abrege}`,
    libelle: `Groupe ${abrege}`,
    abrege,
    membres: membres ?? pour + contre + abstention,
    majoritaire: majoritaire ?? (pour >= contre && pour >= abstention ? 'pour' : contre >= abstention ? 'contre' : 'abstention'),
    pour,
    contre,
    abstention,
    nonVotants: 0,
  };
}

export function voteCand(position: Pos, opts: { groupe?: string; gouvernement?: string | null } = {}) {
  const base = { gouvernement: opts.gouvernement ?? null, position, source: 'test' };
  return position === 'pour' || position === 'contre' || position === 'abstention'
    ? { ...base, groupe: opts.groupe ?? 'G', parDelegation: false }
    : base;
}

export interface QuestionFixture {
  id: string;
  scrutin?: string;
  sens?: 'pour=oui' | 'motion_censure=non';
  theme?: string;
  groupes?: ReturnType<typeof groupe>[];
  candidats?: Record<string, ReturnType<typeof voteCand>>;
  url?: string | null;
  /** Date du scrutin (AAAA-MM-JJ), 2023-03-20 par défaut. */
  date?: string;
}

export function inputs(questions: QuestionFixture[], cands = [candidat('alpha', ['A']), candidat('beta', ['B'])], research: Record<string, unknown> = {}): BuildInputs {
  const selection = questions.map((q, i) => ({
    id: q.id,
    theme: q.theme ?? 'Thème',
    scrutin: q.scrutin ?? `VTANR5L16V${100 + i}`,
    question: `Question ${q.id} ?`,
    sens: q.sens ?? 'pour=oui',
  }));
  const votes = questions.map((q, i) => {
    return {
      ...selection[i],
      date: q.date ?? '2023-03-20',
      titreScrutin: `l'ensemble du texte ${q.id}`,
      typeVote: 'scrutin public solennel',
      sort: 'adopté',
      pour: 300,
      contre: 200,
      abstention: 10,
      dossier: null,
      dossierRef: null,
      urlScrutin: q.url === undefined ? `https://www.assemblee-nationale.fr/dyn/16/scrutins/${100 + i}` : q.url,
      groupes: q.groupes ?? [groupe('A', 10, 2, 0), groupe('B', 1, 20, 3)],
      candidats: q.candidats ?? {},
    };
  });
  return {
    selection,
    votes,
    candidats: cands,
    research: Object.fromEntries(Object.entries(research).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])),
    collecteAN: '2026-10-17T16:22:06Z',
    now: new Date('2026-10-17T18:00:00Z'),
  };
}

export function researchFile(id: string, candidats: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return {
    id,
    titre: `Titre ${id}`,
    question: `Question recherchée ${id} ?`,
    ouiSignifie: 'pour',
    contexte: 'Contexte factuel.',
    contexteSources: [{ titre: 'Source', url: 'https://www.vie-publique.fr/loi/1' }],
    urlScrutin: 'https://www.assemblee-nationale.fr/dyn/16/scrutins/100',
    urlDossier: 'https://www.assemblee-nationale.fr/dyn/16/dossiers/x',
    argumentsPour: [
      { auteur: 'A (G)', resume: 'Argument pour.', citation: 'Citation pour.', url: 'https://www.assemblee-nationale.fr/cr/1', date: '2023-03-20' },
    ],
    argumentsContre: [
      { auteur: 'B (H)', resume: 'Argument contre.', citation: null, url: 'https://www.assemblee-nationale.fr/cr/1', date: '2023-03-20' },
    ],
    candidats,
    alertes: [],
    ...extra,
  };
}

export const decl = (position: string, extra: Record<string, unknown> = {}) => ({
  position,
  type: 'declaration',
  detail: 'Déclaration à la radio.',
  argument: 'Ses raisons.',
  citation: 'Ses mots.',
  url: 'https://www.example.fr/interview',
  date: '2023-01-10',
  ...extra,
});

// ---------------------------------------------------------------- data/justice (noms fictifs uniquement)

export function source(extra: Record<string, unknown> = {}) {
  return {
    titre: 'Journal de référence',
    url: 'https://www.journal.example.fr/article-1',
    citation: 'Le tribunal a condamné la personne à une amende.',
    date: '2021-06-02',
    ...extra,
  };
}

export function condamnation(extra: Record<string, unknown> = {}) {
  return {
    personne: 'Dupont Camille',
    categorie: 'depute',
    roleActuel: 'député de la 1re circonscription de Nulle-Part',
    infraction: 'détournement de fonds publics',
    faits: 'Emplois fictifs entre 2010 et 2012.',
    juridiction: 'tribunal correctionnel de Paris',
    dateDecision: '2021-06-01',
    peine: '6 mois d’emprisonnement avec sursis',
    statut: 'definitive',
    nature: 'penale',
    famille: 'probite',
    lieeMandatPolitique: true,
    sources: [source()],
    ...extra,
  };
}

export function justiceFile(partiId: string, extra: Record<string, unknown> = {}) {
  return {
    partiId,
    nom: `Parti ${partiId}`,
    sigle: partiId.toUpperCase(),
    predecesseurs: [],
    fondation: '2016',
    direction: [{ nom: 'Martin Dominique', fonction: 'président', url: 'https://www.parti.example.fr/direction' }],
    presentation: 'Parti fondé en 2016.',
    presentationSources: [{ titre: 'Encyclopédie', url: 'https://www.encyclopedie.example.fr/parti' }],
    effectifs: { deputes: 10, senateurs: 2, eurodeputes: 0, source: 'https://www.assemblee-nationale.fr/dyn/deputes' },
    candidats: [],
    condamnations: [],
    perimetre: { personnesVerifiees: 25, methode: 'Requêtes « nom condamné ».', limites: 'Sénateurs non vérifiés.' },
    alertes: [],
    ...extra,
  };
}

/** Fichiers data/justice prêts pour BuildInputs.justice. */
export function justice(files: Record<string, unknown>, modifieLe: string | null = '2026-10-18') {
  return Object.fromEntries(
    Object.entries(files).map(([k, v]) => [k, { content: typeof v === 'string' ? v : JSON.stringify(v), modifieLe }]),
  );
}

// ---------------------------------------------------------------- data/justice/membres et anciens (noms fictifs)

/** Entrée de data/justice/membres/<parti>.json (schéma : data/justice/BRIEF-MEMBRES.md). */
export function membre(personne: string, extra: Record<string, unknown> = {}) {
  return {
    personne,
    statutMembre: 'membre',
    depuis: '2017',
    detail: 'Membre du parti depuis 2017.',
    lienAvecCondamnation: null,
    reactionParti: null,
    sources: [source({ titre: 'Fiche officielle', url: 'https://www.parti.example.fr/membres', citation: 'Membre du parti.', date: '2026-10-01' })],
    ...extra,
  };
}

export function membresFile(partiId: string, personnes: unknown[], extra: Record<string, unknown> = {}) {
  return { partiId, personnes, alertes: [], ...extra };
}

/**
 * Fichiers membres/ pour des fiches de test : chaque personne condamnée « membre » (le parti : « personne_morale »),
 * donc au niveau 1 — les condamnations sont comptées comme avant l'appartenance.
 */
export function membresDe(files: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [id, f] of Object.entries(files)) {
    if (typeof f !== 'object' || f === null) continue;
    const list = (f as { condamnations?: unknown }).condamnations;
    const personnes = new Map<string, unknown>();
    for (const c of Array.isArray(list) ? (list as { personne?: unknown; categorie?: unknown }[]) : [])
      if (typeof c.personne === 'string' && !personnes.has(c.personne))
        personnes.set(c.personne, membre(c.personne, c.categorie === 'parti' ? { statutMembre: 'personne_morale', depuis: null } : {}));
    out[id] = membresFile(id, [...personnes.values()]);
  }
  return out;
}

/** Condamnation de data/justice/anciens/<parti>.json : catégorie ancien_membre, bloc appartenance. */
export function ancienne(extra: Record<string, unknown> = {}, appartenance: Record<string, unknown> = {}) {
  return condamnation({
    personne: 'Ancien Député',
    categorie: 'ancien_membre',
    roleActuel: 'ancien député (2012-2017)',
    dateDecision: '2016-03-01',
    appartenance: {
      statutMembre: 'depart',
      depuis: '2018',
      detail: 'A quitté le parti en 2018 pour une autre formation.',
      lienAvecCondamnation: 'non',
      reactionParti: null,
      sources: [source({ titre: 'Presse', url: 'https://www.presse.example.fr/depart', citation: 'Il a quitté le parti.' })],
      ...appartenance,
    },
    ...extra,
  });
}

export function anciensFile(partiId: string, condamnations: unknown[], extra: Record<string, unknown> = {}) {
  return {
    partiId,
    condamnations,
    perimetre: { personnesVerifiees: 12, methode: 'Anciens parlementaires depuis 2012.', limites: 'Anciens sénateurs non vérifiés.' },
    alertes: [],
    ...extra,
  };
}
