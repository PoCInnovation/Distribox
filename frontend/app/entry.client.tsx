import { hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { initSuperTokens } from './config/supertokens';
import App from './root';

initSuperTokens();

hydrateRoot(
  document.getElementById('root') as HTMLElement,
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
