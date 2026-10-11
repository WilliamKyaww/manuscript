import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../lib/api/context';
import { dataOverviewQuery } from '../../data/api';

/** The open vault, its recent neighbours and whether switching restarts at once (task 23.03). */
export function useCurrentVault() {
  const api = useApi();
  const overview = useQuery({ ...dataOverviewQuery(api), staleTime: 60_000 });
  return {
    vault: overview.data?.vault ?? null,
    recent: overview.data?.recentVaults ?? [],
    canRestart: overview.data?.canRestart ?? false,
    isPending: overview.isPending,
    isError: overview.isError,
    refetch: () => void overview.refetch(),
  };
}

/** A vault path as the operating system writes it, from the vault's folder and a vault path. */
export function systemPath(root: string, relative: string): string {
  const separator = root.includes('\\') ? '\\' : '/';
  const base = root.replace(/[\\/]+$/, '');
  return relative === '' ? base : `${base}${separator}${relative.split('/').join(separator)}`;
}
