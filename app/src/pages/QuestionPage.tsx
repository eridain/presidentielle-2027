import { QuestionView } from '../components/QuestionView';
import { data, questionsById } from '../lib/data';
import { href } from '../lib/router';
import { useQuiz } from '../state/useQuiz';
import { NotFoundPage } from './NotFoundPage';

const questionHref = (id: string) => href(`/question/${id}`);

export function QuestionPage({ id }: { id: string }) {
  const { answers, answer, parcours: parcoursMode } = useQuiz();
  const q = questionsById.get(id);
  if (!q) return <NotFoundPage />;

  // Parcours : celui du mode choisi ; une question hors parcours s'affiche dans le parcours complet.
  const parcours = parcoursMode.some((x) => x.id === q.id) ? parcoursMode : data.questions;
  return (
    <QuestionView
      question={q}
      parcours={parcours}
      answers={answers}
      onAnswer={(value) => answer(q.id, value)}
      questionHref={questionHref}
      resultsHref={href('/resultats')}
      startHref={href('/')}
      startLabel="Accueil"
      surtitre={q.theme}
      ordreEnClair={data.questions}
    />
  );
}
