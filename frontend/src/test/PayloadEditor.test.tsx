import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PayloadEditor } from '../components/PayloadEditor';

describe('PayloadEditor', () => {
  it('shows initial JSON value', () => {
    render(
      <PayloadEditor
        initialValue={{ to: 'test@example.com' }}
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toContain('"to"');
    expect(textarea.value).toContain('test@example.com');
  });

  it('shows validation error for invalid JSON', async () => {
    const onSave = vi.fn();
    render(
      <PayloadEditor initialValue={{}} onSave={onSave} onCancel={() => {}} />
    );
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'not-json{' } });
    fireEvent.click(screen.getByText('Requeue with Payload'));
    expect(screen.getByText(/Invalid JSON/i)).toBeDefined();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('calls onSave with parsed object for valid JSON', () => {
    const onSave = vi.fn();
    render(
      <PayloadEditor initialValue={{}} onSave={onSave} onCancel={() => {}} />
    );
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '{"key": "value"}' } });
    fireEvent.click(screen.getByText('Requeue with Payload'));
    expect(onSave).toHaveBeenCalledWith({ key: 'value' });
  });
});
