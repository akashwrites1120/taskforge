import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../apiClient';

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => apiClient.getStats(),
    refetchInterval: 5000,
  });
}
