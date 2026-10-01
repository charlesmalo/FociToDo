let initialised = false;

/** Loads mermaid on demand (it stays out of the todo bundle) and renders one diagram to SVG. */
export async function renderMermaid(id: string, code: string): Promise<string> {
  const { default: mermaid } = await import('mermaid');
  if (!initialised) {
    mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
    initialised = true;
  }
  const { svg } = await mermaid.render(id, code);
  return svg;
}
