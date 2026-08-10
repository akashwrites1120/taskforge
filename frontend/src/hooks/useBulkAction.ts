import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../apiClient';

interface BulkActionState {
  total: number;
  done: number;
  errors: string[];
}

export function useBulkAction(action: 'requeue' | 'discard') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]): Promise<BulkActionState> => {
      const errors: string[] = [];
      let done = 0;
      for (const id of ids) {
        try {
          if (action === 'requeue') await apiClient.requeueJob(id);
          else await apiClient.discardJob(id);
          done++;
        } catch (e) {
          errors.push(`${id}: ${(e as Error).message}`);
        }
      }
      return { total: ids.length, done, errors };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}
