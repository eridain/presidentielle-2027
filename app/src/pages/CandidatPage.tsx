import { candidatsById, data } from '../lib/data';
import { CandidatView } from './CandidatView';
import { NotFoundPage } from './NotFoundPage';

export function CandidatPage({ id }: { id: string }) {
  const candidat = candidatsById.get(id);
  if (!candidat) return <NotFoundPage />;
  return <CandidatView data={data} candidat={candidat} />;
}
