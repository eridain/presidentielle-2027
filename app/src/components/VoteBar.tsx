import { plural } from '../lib/format';

/** Barre de résultat du scrutin (décompte toujours écrit en clair). */
export function VoteBar({ pour, contre, abstention }: { pour: number; contre: number; abstention: number }) {
  const total = pour + contre + abstention || 1;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="votebar">
      <div className="votebar__track" aria-hidden="true">
        <span className="votebar__seg votebar__seg--pour" style={{ width: pct(pour) }} />
        <span className="votebar__seg votebar__seg--contre" style={{ width: pct(contre) }} />
        <span className="votebar__seg votebar__seg--abst" style={{ width: pct(abstention) }} />
      </div>
      <p className="votebar__legend">
        <span><span className="swatch swatch--pour" aria-hidden="true" /> {pour} pour</span>
        <span><span className="swatch swatch--contre" aria-hidden="true" /> {contre} contre</span>
        <span><span className="swatch swatch--abst" aria-hidden="true" /> {plural(abstention, 'abstention')}</span>
      </p>
    </div>
  );
}
