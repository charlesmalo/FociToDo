import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalise } from './extract.js';
import type { Renderer } from './render.js';

export type ExecFile = (file: string, args: readonly string[]) => Promise<unknown>;

export interface MmdcOptions {
  /** Path of the Mermaid CLI binary. */
  mmdc: string;
  /** Puppeteer launch config (the official image's sandbox settings). */
  puppeteerConfig: string;
  /** Mermaid config: deterministic ids, SVG text labels, theme. */
  mermaidConfig: string;
  exec: ExecFile;
}

export function mmdcRenderer(options: MmdcOptions): Renderer {
  return async (source) => {
    const dir = mkdtempSync(join(tmpdir(), 'diagram-'));
    try {
      const input = join(dir, 'input.mmd');
      const output = join(dir, 'output.svg');
      writeFileSync(input, `${normalise(source)}\n`);
      await options.exec(options.mmdc, [
        '-p',
        options.puppeteerConfig,
        '-c',
        options.mermaidConfig,
        '-b',
        'white',
        '-q',
        '-i',
        input,
        '-o',
        output,
      ]);
      return readFileSync(output, 'utf8');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}
