import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { mmdcRenderer } from './mmdc.js';
import { renderRepository } from './render.js';
import { fsRepo } from './repo.js';
import { SCREENSHOT_MANIFEST_PATH, writeScreenshotManifest } from './screenshots.js';

const repo = fsRepo(process.cwd());

try {
  if (process.argv[2] === 'screenshots') {
    // Run by the screenshots command right after the Playwright scenes wrote docs/images.
    const manifest = writeScreenshotManifest(repo);
    const count = Object.keys(manifest.images).length;
    console.log(`Recorded ${count} screenshots in ${SCREENSHOT_MANIFEST_PATH}`);
  } else {
    const renderer = mmdcRenderer({
      mmdc: process.env.MMDC ?? '/home/mermaidcli/node_modules/.bin/mmdc',
      puppeteerConfig: process.env.PUPPETEER_CONFIG ?? '/puppeteer-config.json',
      mermaidConfig: fileURLToPath(new URL('../mermaid.config.json', import.meta.url)),
      exec: promisify(execFile),
    });
    const manifest = await renderRepository(repo, renderer);
    console.log(`Rendered ${manifest.diagrams.length} diagrams into docs/diagrams/`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
