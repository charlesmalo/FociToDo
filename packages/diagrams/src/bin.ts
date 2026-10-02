import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { mmdcRenderer } from './mmdc.js';
import { renderRepository } from './render.js';
import { fsRepo } from './repo.js';

const renderer = mmdcRenderer({
  mmdc: process.env.MMDC ?? '/home/mermaidcli/node_modules/.bin/mmdc',
  puppeteerConfig: process.env.PUPPETEER_CONFIG ?? '/puppeteer-config.json',
  mermaidConfig: fileURLToPath(new URL('../mermaid.config.json', import.meta.url)),
  exec: promisify(execFile),
});

try {
  const manifest = await renderRepository(fsRepo(process.cwd()), renderer);
  console.log(`Rendered ${manifest.diagrams.length} diagrams into docs/diagrams/`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
