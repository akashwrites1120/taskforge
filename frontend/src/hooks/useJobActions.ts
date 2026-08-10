import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../apiClient';

export function useRequeueJob(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload?: unknown) => apiClient.requeueJob(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['job', id] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useDiscardJob(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.discardJob(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['job', id] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}
