// Fails when the Playwright test runner and the Playwright image drift apart (browsers would not start).
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const dockerfile = readFileSync('Dockerfile', 'utf8');

const pinned = manifest.devDependencies?.['@playwright/test'];
const image = dockerfile.match(/playwright:v(\d+\.\d+\.\d+)-noble/)?.[1];
const installed = dockerfile.match(/@playwright\/test@(\d+\.\d+\.\d+)/)?.[1];

if (pinned === undefined || pinned !== image || pinned !== installed) {
  console.error(
    `Playwright versions differ: package.json=${pinned} image=${image} e2e install=${installed}`,
  );
  process.exit(1);
}
console.log(`Playwright pinned consistently at ${pinned}`);
