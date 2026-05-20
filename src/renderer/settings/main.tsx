import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/globals.css';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root in settings/index.html');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
