import raw from '../generated/data.json';
import type { AppData } from '../types';
import { selectQuick } from './quick';
import { QUICK_COUNT } from './weights';

export const data: AppData = raw;
export const questionsById = new Map(data.questions.map((q) => [q.id, q]));
export const candidatsById = new Map(data.candidats.map((c) => [c.id, c]));

/** Questions du mode rapide (sélection déterministe, voir quick.ts). */
export const quickQuestions = selectQuick(data.questions, data.themes, QUICK_COUNT);

const years = data.questions.map((q) => Number(q.scrutin.date.slice(0, 4)));
export const periode = { debut: Math.min(...years), fin: Math.max(...years) };
