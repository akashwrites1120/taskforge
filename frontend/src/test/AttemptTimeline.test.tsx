import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AttemptTimeline } from '../components/AttemptTimeline';
import type { JobAttempt } from '../types';

const makeAttempt = (overrides: Partial<JobAttempt>): JobAttempt => ({
  ID: 'att-1',
  JobID: 'job-1',
  AttemptNumber: 0,
  Result: 'success',
  ErrorMessage: null,
  StackTrace: null,
  DurationMs: 500,
  CreatedAt: new Date().toISOString(),
  ...overrides,
});

describe('AttemptTimeline', () => {
  it('shows empty state when no attempts', () => {
    render(<AttemptTimeline attempts={[]} />);
    expect(screen.getByText(/No attempts recorded yet/i)).toBeDefined();
  });

  it('renders attempt result label', () => {
    render(<AttemptTimeline attempts={[makeAttempt({ Result: 'error', ErrorMessage: 'connection refused' })]} />);
    expect(screen.getByText('Error')).toBeDefined();
    expect(screen.getByText(/connection refused/i)).toBeDefined();
  });

  it('flags reclaimed_by_reaper entries specially', () => {
    render(
      <AttemptTimeline attempts={[makeAttempt({ Result: 'reclaimed_by_reaper' })]} />
    );
    expect(screen.getByText(/Reclaimed by Reaper/i)).toBeDefined();
    expect(screen.getByText(/Worker crash detected/i)).toBeDefined();
  });
});
