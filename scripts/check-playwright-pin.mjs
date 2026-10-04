// Fails when the Playwright test runner and the Playwright images drift apart (browsers would not start).
// Every Playwright stage in the Dockerfile (e2e, screenshots) must match the root package.json pin.
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const dockerfile = readFileSync('Dockerfile', 'utf8');

const pinned = manifest.devDependencies?.['@playwright/test'];
const images = [...dockerfile.matchAll(/playwright:v(\d+\.\d+\.\d+)-noble/g)].map((m) => m[1]);
const installs = [...dockerfile.matchAll(/@playwright\/test@(\d+\.\d+\.\d+)/g)].map((m) => m[1]);

if (
  pinned === undefined ||
  images.length === 0 ||
  installs.length === 0 ||
  ![...images, ...installs].every((version) => version === pinned)
) {
  console.error(
    `Playwright versions differ: package.json=${pinned} images=${images.join(',')} installs=${installs.join(',')}`,
  );
  process.exit(1);
}
console.log(`Playwright pinned consistently at ${pinned} (${images.length} images)`);
