import { PageTitle } from '../components/PageTitle';
import { data } from '../lib/data';
import { CandidatsView } from './CandidatsView';

export function CandidatsPage() {
  return (
    <div className="prose">
      <PageTitle title="Partis & candidats" />
      <CandidatsView data={data} />
    </div>
  );
}
