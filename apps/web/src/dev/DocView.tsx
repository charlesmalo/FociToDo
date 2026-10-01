import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './DevPortal.module.css';
import type { DocLibrary, DocPage } from './docs';
import { linkTarget } from './links';
import { MermaidBlock } from './MermaidBlock';

interface DocViewProps {
  page: DocPage;
  library: DocLibrary;
}

export function DocView({ page, library }: DocViewProps) {
  const components: Components = {
    a: ({ href, children }) => {
      const target = linkTarget(page.path, href);
      return /^https?:/.test(target) ? (
        <a href={target} target="_blank" rel="noreferrer">
          {children}
        </a>
      ) : (
        <a href={target}>{children}</a>
      );
    },
    img: ({ src, alt }) => (
      <img src={library.assetUrl(page.path, src as string | undefined)} alt={alt} />
    ),
    code: ({ className, children }) =>
      className === 'language-mermaid' ? (
        <MermaidBlock code={String(children).trimEnd()} />
      ) : (
        <code className={className}>{children}</code>
      ),
  };

  return (
    <article className={styles.doc}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {page.markdown}
      </ReactMarkdown>
    </article>
  );
}
