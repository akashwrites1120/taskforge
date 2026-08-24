import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../apiClient';

const TERMINAL = new Set(['succeeded', 'dead_letter']);

export function useJobDetail(id: string) {
  return useQuery({
    queryKey: ['job', id],
    queryFn: () => apiClient.getJob(id),
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      if (!status || TERMINAL.has(status)) return false;
      return 3000;
    },
  });
}
