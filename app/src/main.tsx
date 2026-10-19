import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { QuizProvider } from './state/QuizProvider';
import './styles.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QuizProvider>
        <App />
      </QuizProvider>
    </StrictMode>,
  );
}
