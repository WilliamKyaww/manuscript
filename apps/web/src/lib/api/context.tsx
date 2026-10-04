import { createContext, type ReactNode, useContext } from 'react';
import { type ApiClient, createApiClient } from './client';

const defaultClient = createApiClient();
const ApiClientContext = createContext<ApiClient>(defaultClient);

/** Provides the API client; tests pass a client with a fake `fetch`. */
export function ApiProvider({ client, children }: { client?: ApiClient; children: ReactNode }) {
  return (
    <ApiClientContext.Provider value={client ?? defaultClient}>
      {children}
    </ApiClientContext.Provider>
  );
}

export function useApi(): ApiClient {
  return useContext(ApiClientContext);
}
