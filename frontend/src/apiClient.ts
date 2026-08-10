// Typed API client wrapping native fetch.
// All methods throw on non-OK responses.

import type {
  JobListResponse,
  JobDetailResponse,
  StatsResponse,
  EnqueueResponse,
} from './types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface JobFilters {
  status?: string[];
  job_type?: string[];
  search?: string;
  start_time?: string;
  end_time?: string;
  limit?: number;
  offset?: number;
}

function buildQuery(filters: JobFilters): string {
  const p = new URLSearchParams();
  filters.status?.forEach((s) => p.append('status', s));
  filters.job_type?.forEach((t) => p.append('job_type', t));
  if (filters.search) p.set('search', filters.search);
  if (filters.start_time) p.set('start_time', filters.start_time);
  if (filters.end_time) p.set('end_time', filters.end_time);
  if (filters.limit != null) p.set('limit', String(filters.limit));
  if (filters.offset != null) p.set('offset', String(filters.offset));
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

export const apiClient = {
  getStats: () => request<StatsResponse>('/stats'),

  listJobs: (filters: JobFilters = {}) =>
    request<JobListResponse>(`/jobs${buildQuery(filters)}`),

  getJob: (id: string) => request<JobDetailResponse>(`/jobs/${id}`),

  enqueueJob: (body: object) =>
    request<EnqueueResponse>('/jobs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  requeueJob: (id: string, payload?: unknown) =>
    request<{ status: string }>(`/jobs/${id}/requeue`, {
      method: 'POST',
      body: payload ? JSON.stringify({ payload }) : undefined,
    }),

  discardJob: (id: string) =>
    request<{ status: string }>(`/jobs/${id}/discard`, { method: 'POST' }),
};
