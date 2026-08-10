import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusPill } from '../components/StatusPill';

describe('StatusPill', () => {
  it('renders "Pending" for pending status', () => {
    render(<StatusPill status="pending" />);
    expect(screen.getByText('Pending')).toBeDefined();
  });

  it('renders "Dead Letter" for dead_letter status', () => {
    render(<StatusPill status="dead_letter" />);
    expect(screen.getByText('Dead Letter')).toBeDefined();
  });

  it('renders "Succeeded" for succeeded status', () => {
    render(<StatusPill status="succeeded" />);
    expect(screen.getByText('Succeeded')).toBeDefined();
  });
});
