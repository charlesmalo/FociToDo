import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBanner } from '../../../src/todos/components/ErrorBanner';

describe('ErrorBanner', () => {
  it('announces the message without a retry button by default', () => {
    render(<ErrorBanner message="Something broke" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something broke');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('offers a retry action', async () => {
    const onRetry = vi.fn();
    render(<ErrorBanner message="Offline" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
