import { useEffect, useState } from 'react';
import styles from './DevPortal.module.css';
import { renderMermaid } from './mermaid';

let sequence = 0;

interface MermaidBlockProps {
  code: string;
  render?: (id: string, code: string) => Promise<string>;
}

export function MermaidBlock({ code, render = renderMermaid }: MermaidBlockProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    sequence += 1;
    render(`mermaid-${sequence}`, code).then(
      (result) => {
        if (active) setSvg(result);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [code, render]);

  if (failed) return <code>{code}</code>;
  if (svg === null) return <span role="status">Rendering diagram…</span>;
  // Mermaid output for our own docs, rendered with securityLevel "strict" (sanitised SVG).
  return (
    <span
      role="img"
      aria-label="Diagram"
      className={styles.diagram}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
