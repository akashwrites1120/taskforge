import { useQuery } from '@tanstack/react-query';
import { apiClient, type JobFilters } from '../apiClient';

export function useJobs(filters: JobFilters = {}) {
  return useQuery({
    queryKey: ['jobs', filters],
    queryFn: () => apiClient.listJobs(filters),
    refetchInterval: 5000,
    placeholderData: (prev) => prev,
  });
}
