/** A Markdown heading's plain text: the `#` marker goes, code spans lose their backticks. */
export function headingText(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/`/g, '')
    .trim();
}

/** File-name slug (spec §2.1): lower case, every run outside a-z0-9 becomes one hyphen. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** GitHub's heading anchor: lower case, punctuation dropped, each space becomes a hyphen. */
export function githubSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}
