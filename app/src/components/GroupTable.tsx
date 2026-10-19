import type { Question } from '../types';

export function GroupTable({ question }: { question: Question }) {
  const censure = question.scrutin.censure;
  return (
    <div className="table-scroll">
      <table className="groups">
        <caption className="sr-only">Vote par groupe parlementaire</caption>
        <thead>
          <tr>
            <th scope="col">Groupe</th>
            {censure ? (
              <>
                <th scope="col">Ont voté la censure</th>
                <th scope="col">Membres</th>
              </>
            ) : (
              <>
                <th scope="col">Pour</th>
                <th scope="col">Contre</th>
                <th scope="col">Abst.</th>
                <th scope="col">Majorité</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {question.groupes.map((g) => (
            <tr key={g.abrege}>
              <th scope="row">
                <abbr title={g.libelle}>{g.abrege}</abbr>
              </th>
              {censure ? (
                <>
                  <td>{g.pour}</td>
                  <td>{g.membres}</td>
                </>
              ) : (
                <>
                  <td>{g.pour}</td>
                  <td>{g.contre}</td>
                  <td>{g.abstention}</td>
                  <td>{g.majoritaire ?? '—'}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
