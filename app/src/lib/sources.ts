// Inventaire de toutes les URLs citées, par question (page Sources).
import type { AppData, Candidat, Question } from '../types';

export interface SourceEntry {
  url: string;
  libelles: string[];
}

export interface QuestionSources {
  questionId: string;
  titre: string;
  sources: SourceEntry[];
}

export interface PartiSources {
  partiId: string;
  nom: string;
  /** Candidats rattachés (pour le lien vers leur page). */
  candidats: string[];
  sources: SourceEntry[];
}

/** Sources de chaque question (scrutin, dossier, contexte, arguments, preuves et propos des candidats). */
export function sourcesDesQuestions(
  questions: readonly Question[],
  candidats: readonly Pick<Candidat, 'id' | 'nom'>[],
  all: Set<string> = new Set(),
): QuestionSources[] {
  const names = new Map(candidats.map((c) => [c.id, c.nom]));
  return questions.map((q) => {
    const map = new Map<string, Set<string>>();
    const add = (url: string | null, libelle: string) => {
      if (!url) return;
      if (!map.has(url)) map.set(url, new Set());
      map.get(url)?.add(libelle);
      all.add(url);
    };
    add(q.scrutin.url, `Scrutin officiel n° ${q.scrutin.numero} (${q.scrutin.assemblee})`);
    add(q.scrutin.urlDossier, 'Dossier législatif');
    for (const s of q.contexteSources) add(s.url, s.titre);
    for (const [camp, list] of Object.entries(q.arguments))
      for (const a of list) add(a.url, `Argument ${camp} — ${a.auteur}`);
    for (const [cid, p] of Object.entries(q.candidats)) {
      const nom = names.get(cid) ?? cid;
      add(p.url, `${nom} — preuve de position`);
      add(p.argumentUrl, `${nom} — argument / citation`);
    }
    return {
      questionId: q.id,
      titre: q.titre,
      sources: [...map.entries()].map(([url, libelles]) => ({ url, libelles: [...libelles] })),
    };
  });
}

export function collectSources(data: AppData): { parQuestion: QuestionSources[]; parParti: PartiSources[]; total: number } {
  const all = new Set<string>();
  const parQuestion = sourcesDesQuestions(data.questions, data.candidats, all);
  // Partis : présentation, direction, effectifs, biographies (rangées sous le parti principal), condamnations.
  const parParti = data.partis
    .map((p) => {
      const map = new Map<string, Set<string>>();
      const add = (url: string | null, libelle: string) => {
        if (!url) return;
        if (!map.has(url)) map.set(url, new Set());
        map.get(url)?.add(libelle);
        all.add(url);
      };
      const f = p.fiche;
      for (const s of f?.presentationSources ?? []) add(s.url, `Présentation du parti — ${s.titre}`);
      for (const d of f?.direction ?? []) add(d.url, `Direction — ${d.nom}`);
      for (const s of f?.effectifs?.sources ?? []) add(s.url, 'Effectifs parlementaires');
      for (const c of data.candidats)
        if (c.partis[0] === p.id) for (const s of c.bio?.sources ?? []) add(s.url, `Biographie — ${c.nom}`);
      for (const c of f?.condamnations ?? []) for (const s of c.sources) add(s.url, `Condamnation — ${c.personne}`);
      return {
        partiId: p.id,
        nom: p.nom,
        candidats: p.candidats.map((c) => c.id),
        sources: [...map.entries()].map(([url, libelles]) => ({ url, libelles: [...libelles] })),
      };
    })
    .filter((p) => p.sources.length > 0);
  return { parQuestion, parParti, total: all.size };
}
