import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiProvider } from './lib/api/context';
import { createQueryClient } from './lib/queryClient';
import { router } from './router';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element in index.html');

const queryClient = createQueryClient();

createRoot(container).render(
  <StrictMode>
    <ApiProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ApiProvider>
  </StrictMode>,
);
