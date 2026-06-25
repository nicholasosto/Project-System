import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// CSS order is load-bearing: @trembus/ui first (carries the --tcl-* token layer + base),
// then @trembus/viz (adds its component layer), then the app's own chrome. The dark theme
// rides on <html data-theme="dark"> (see index.html) — both dist styles bundle the tokens.
import '@trembus/ui/styles.css';
import '@trembus/viz/styles.css';
import './styles/app.css';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
