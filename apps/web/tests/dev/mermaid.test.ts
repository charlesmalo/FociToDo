import { describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted above imports and consts, so the mocks must be created with vi.hoisted.
const { initialize, render } = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async (id: string) => ({ svg: `<svg id="${id}"></svg>` })),
}));
vi.mock('mermaid', () => ({ default: { initialize, render } }));

describe('renderMermaid', () => {
  it('initialises mermaid once (strict, neutral) and returns the SVG', async () => {
    const { renderMermaid } = await import('../../src/dev/mermaid');
    await expect(renderMermaid('m1', 'flowchart LR\nA-->B')).resolves.toBe('<svg id="m1"></svg>');
    await renderMermaid('m2', 'flowchart LR\nB-->C');
    expect(initialize).toHaveBeenCalledOnce();
    expect(initialize).toHaveBeenCalledWith({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'strict',
    });
    expect(render).toHaveBeenCalledWith('m2', 'flowchart LR\nB-->C');
  });
});
