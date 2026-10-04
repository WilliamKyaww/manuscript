import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, AppProviders } from './app/App';
import { notifyError } from './lib/notify';
import { createQueryClient } from './lib/queryClient';
import { createAppRouter } from './router';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element in index.html');

const queryClient = createQueryClient({ onMutationError: notifyError });
const router = createAppRouter();

createRoot(container).render(
  <StrictMode>
    <AppProviders queryClient={queryClient}>
      <App router={router} />
    </AppProviders>
  </StrictMode>,
);
