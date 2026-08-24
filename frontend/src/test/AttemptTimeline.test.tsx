import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AttemptTimeline } from '../components/AttemptTimeline';
import type { JobAttempt } from '../types';

const makeAttempt = (overrides: Partial<JobAttempt>): JobAttempt => ({
  id: 1,
  job_id: 'job-1',
  attempt_number: 0,
  result: 'success',
  error_message: null,
  stack_trace: null,
  duration_ms: 500,
  created_at: new Date().toISOString(),
  ...overrides,
});

describe('AttemptTimeline', () => {
  it('shows empty state when no attempts', () => {
    render(<AttemptTimeline attempts={[]} />);
    expect(screen.getByText(/No attempts recorded yet/i)).toBeDefined();
  });

  it('renders attempt result label', () => {
    render(<AttemptTimeline attempts={[makeAttempt({ result: 'error', error_message: 'connection refused' })]} />);
    expect(screen.getByText('Error')).toBeDefined();
    expect(screen.getByText(/connection refused/i)).toBeDefined();
  });

  it('flags reclaimed_by_reaper entries specially', () => {
    render(
      <AttemptTimeline attempts={[makeAttempt({ result: 'reclaimed_by_reaper' })]} />
    );
    expect(screen.getByText(/Reclaimed by Reaper/i)).toBeDefined();
    expect(screen.getByText(/Worker crash detected/i)).toBeDefined();
  });
});
