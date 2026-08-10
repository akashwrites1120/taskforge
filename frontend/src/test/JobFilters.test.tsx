import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { JobFilters, readFiltersFromParams, writeFiltersToParams } from '../components/JobFilters';
import type { Filters } from '../components/JobFilters';

const DEFAULT_FILTERS: Filters = {
  status: [],
  job_type: [],
  search: '',
  start_time: '',
  end_time: '',
};

describe('JobFilters — URL serialization', () => {
  it('round-trips filters through URLSearchParams', () => {
    const filters: Filters = {
      status: ['pending', 'retrying'],
      job_type: ['send_email'],
      search: 'abc',
      start_time: '',
      end_time: '',
    };
    const params = writeFiltersToParams(filters);
    const parsed = readFiltersFromParams(params);
    expect(parsed.status).toEqual(['pending', 'retrying']);
    expect(parsed.job_type).toEqual(['send_email']);
    expect(parsed.search).toBe('abc');
  });

  it('handles empty filters cleanly', () => {
    const params = writeFiltersToParams(DEFAULT_FILTERS);
    const parsed = readFiltersFromParams(params);
    expect(parsed.status).toHaveLength(0);
    expect(parsed.search).toBe('');
  });
});

describe('JobFilters — rendering', () => {
  it('renders status filter chips', () => {
    render(
      <MemoryRouter>
        <JobFilters filters={DEFAULT_FILTERS} onChange={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByText('pending')).toBeDefined();
    expect(screen.getByText('dead letter')).toBeDefined();
  });
});
