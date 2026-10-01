import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MermaidBlock } from '../../src/dev/MermaidBlock';

describe('MermaidBlock', () => {
  it('shows progress, then the rendered diagram', async () => {
    const renderDiagram = vi.fn(async () => '<svg data-testid="svg"></svg>');
    render(<MermaidBlock code="flowchart LR" render={renderDiagram} />);
    expect(screen.getByRole('status')).toHaveTextContent('Rendering diagram…');
    expect(await screen.findByRole('img', { name: 'Diagram' })).toContainElement(
      screen.getByTestId('svg'),
    );
    expect(renderDiagram).toHaveBeenCalledWith(
      expect.stringMatching(/^mermaid-\d+$/),
      'flowchart LR',
    );
  });

  it('falls back to the source when rendering fails', async () => {
    render(
      <MermaidBlock code="not a diagram" render={async () => Promise.reject(new Error('x'))} />,
    );
    expect(await screen.findByText('not a diagram')).toBeInTheDocument();
  });

  it('ignores results that arrive after unmount', async () => {
    let resolve: (svg: string) => void = () => undefined;
    let reject: (error: Error) => void = () => undefined;
    const first = render(
      <MermaidBlock code="a" render={() => new Promise<string>((r) => (resolve = r))} />,
    );
    const second = render(
      <MermaidBlock code="b" render={() => new Promise<string>((_r, j) => (reject = j))} />,
    );
    first.unmount();
    second.unmount();
    resolve('<svg></svg>');
    reject(new Error('late'));
    await Promise.resolve();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
