import { altText, type Diagram } from './extract.js';
import { relativeImagePath } from './paths.js';

export const DETAILS_OPEN = '<details><summary>Mermaid source</summary>';
export const DETAILS_CLOSE = '</details>';

export function expectedImageLine(diagram: Diagram): string {
  return `![${altText(diagram)}](${relativeImagePath(diagram.file, diagram.id)})`;
}

/**
 * Spec §2.2: image, blank, <details>, blank, fence, blank, </details> — the blank lines are
 * required: without one, GitHub's CommonMark renderer treats <details> as an HTML block that
 * swallows everything up to the next blank line, so the Mermaid fence never renders as a fence.
 * The image, <details> and </details> lines must also sit at column 0-3 (checked on the raw,
 * untrimmed line): 4+ leading spaces turns the line into a code block instead of HTML/an image.
 * A blank line (or end of file) must follow </details> for the same reason.
 */
export function checkLayout(markdown: string, diagrams: readonly Diagram[]): string[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const at = (index: number): string | undefined => lines[index]?.trim();
  const indentOk = (index: number): boolean => {
    const line = lines[index];
    return line !== undefined && !/^ {4}/.test(line);
  };

  return diagrams.flatMap((diagram) => {
    const image = expectedImageLine(diagram);
    const fence = diagram.line - 1;
    const close = diagram.endLine - 1;
    const afterClose = lines[close + 3];
    const ok =
      at(fence - 1) === '' &&
      at(fence - 2) === DETAILS_OPEN &&
      at(fence - 3) === '' &&
      at(fence - 4) === image &&
      at(close + 1) === '' &&
      at(close + 2) === DETAILS_CLOSE &&
      [fence - 4, fence - 2, close + 2].every(indentOk) &&
      (afterClose === undefined || afterClose.trim() === '');
    return ok
      ? []
      : [
          `${diagram.file}:${diagram.line}: ${diagram.id} must be shown as its image above its collapsed source — ` +
            `expected "${image}", then "${DETAILS_OPEN}" above the fence and "${DETAILS_CLOSE}" below it`,
        ];
  });
}
