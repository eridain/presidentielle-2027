// Données de test minimales pour les modules de l'application (non embarquées : importées par les tests seulement).
import type { AppData, CandidatePosition, EvidenceType, Question, Stance } from '../types';

export function position(stance: Stance, evidence: EvidenceType = 'vote_an'): CandidatePosition {
  const p = stance === 'oui' ? 'pour' : stance === 'non' ? 'contre' : stance === 'abstention' ? 'abstention' : null;
  return {
    position: p,
    stance,
    evidence: stance === 'inconnu' ? 'inconnu' : evidence,
    detail: 'détail',
    note: null,
    groupe: null,
    url: stance === 'inconnu' ? null : 'https://www.assemblee-nationale.fr/x',
    date: '2023-01-01',
    argument: null,
    citation: null,
    argumentUrl: null,
    commentaire: null,
    incoherence: null,
    attribution: null,
  };
}

export function question(id: string, theme: string, candidats: Record<string, CandidatePosition>, date = '2023-01-01'): Question {
  return {
    id,
    theme,
    titre: `Titre ${id}`,
    question: `Question ${id} ?`,
    ouiSignifie: 'pour',
    contexte: null,
    contexteSources: [],
    recherche: false,
    enClair: null,
    scrutin: {
      uid: 'VTANR5L16V1',
      assemblee: 'AN',
      numero: '1',
      date,
      titre: 'texte',
      typeVote: 'scrutin public solennel',
      sort: 'adopté',
      pour: 1,
      contre: 0,
      abstention: 0,
      url: `https://www.assemblee-nationale.fr/dyn/16/scrutins/${id}`,
      urlDossier: null,
      censure: false,
      note: null,
    },
    groupes: [],
    arguments: { pour: [], contre: [], abstention: [] },
    candidats,
    alertes: [],
  };
}

export function appData(questions: Question[], ids: string[]): AppData {
  return {
    version: 1,
    genereLe: '2026-10-17T00:00:00Z',
    collecteAN: null,
    candidats: ids.map((id) => ({
      id,
      nom: `X ${id}`,
      parti: 'P',
      tri: id,
      proxy: { groupes: [], periodes: [], motif: null },
      partis: [],
      bio: null,
    })),
    partis: [],
    themes: [...new Set(questions.map((q) => q.theme))],
    questions,
    approfondi: null,
  };
}
