import { QuestionView } from '../../components/QuestionView';
import {
  categorieHref,
  categorieQuestionHref,
  categorieResultatsHref,
  estExistante,
  porteeDe,
  reponsesCategorie,
  useCategorie,
} from '../../lib/approfondi';
import type { CategorieIndex } from '../../types';
import { useQuiz } from '../../state/useQuiz';
import { NotFoundPage } from '../NotFoundPage';
import { Chargement } from './Chargement';
import { PorteeNote, PorteeRevelation } from './PorteeNote';

/** Question d'une catégorie (#/approfondi/<categorie>/question/<id>) : même expérience que le parcours principal. */
export function CategorieQuestionPage({ categorie: c, id }: { categorie: CategorieIndex; id: string }) {
  const quiz = useQuiz();
  const state = useCategorie(c);
  if (!c.questions.some((r) => r.id === id)) return <NotFoundPage />;
  if (state.status !== 'ready') return <Chargement state={state} />;
  const q = state.questions.find((x) => x.id === id);
  if (!q) return <NotFoundPage />;
  const existant = estExistante(c, id);
  const answers = reponsesCategorie(c, quiz.answers, quiz.approfondi[c.id]);
  return (
    <QuestionView
      question={q}
      parcours={state.questions}
      answers={answers}
      // une question du parcours principal garde une seule réponse sur tout le site
      onAnswer={(value) => (existant ? quiz.answer(id, value) : quiz.answerApprofondi(c.id, id, value))}
      questionHref={(x) => categorieQuestionHref(c.id, x)}
      resultsHref={categorieResultatsHref(c.id)}
      startHref={categorieHref(c.id)}
      startLabel="Catégorie"
      surtitre={c.libelle}
      ordreEnClair={state.questions}
      mentions={<PorteeNote portee={porteeDe(c, id)} existant={existant} recherche={q.recherche} />}
      noteRevelation={<PorteeRevelation portee={porteeDe(c, id)} question={q} />}
    />
  );
}
