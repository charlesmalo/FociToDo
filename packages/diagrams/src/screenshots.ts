import { posix } from 'node:path';
import { sourceFiles } from './check.js';
import { hashFiles, sha256 } from './hash.js';
import { resolveLink } from './paths.js';
import type { Repo } from './repo.js';

// Spec 2026-10-03 brief-duedate §5.1: the gate proves, without a browser, that the screenshots
// were generated from the current UI inputs and were not edited by hand.

export const SCREENSHOTS_DIR = 'docs/images';
export const SCREENSHOT_MANIFEST_PATH = `${SCREENSHOTS_DIR}/manifest.json`;
export const SCREENSHOTS_COMMAND = 'docker compose --profile docs run --rm --build screenshots';

const FIX = `run: ${SCREENSHOTS_COMMAND}`;

export interface ScreenshotManifest {
  /** sha256 over every UI input file and the Playwright version. */
  inputsHash: string;
  playwright: string;
  /** Image path → sha256 of its bytes. */
  images: Record<string, string>;
}

/** Folder metadata macOS writes on its own; git-ignored, so it never reaches a checkout. */
const isOsMetadata = (path: string) => posix.basename(path) === '.DS_Store';

/** Everything that can change a screenshot: the web app, the shared contract and the generator. */
export function screenshotInputs(repo: Repo): string[] {
  const index = 'apps/web/index.html';
  return [
    ...repo.list('apps/web/src'),
    ...(repo.exists(index) ? [index] : []),
    ...repo.list('packages/shared/src'),
    ...repo.list('screenshots'),
  ]
    .filter((path) => !isOsMetadata(path))
    .sort();
}

/** Lockfiles are not inputs; only the pinned Playwright version is (it decides the browser). */
export function playwrightVersion(repo: Repo): string {
  const manifest = JSON.parse(repo.read('package.json')) as {
    devDependencies?: Record<string, string>;
  };
  const version = manifest.devDependencies?.['@playwright/test'];
  if (version === undefined) {
    throw new Error('package.json does not pin devDependencies["@playwright/test"]');
  }
  return version;
}

export function inputsHash(repo: Repo): string {
  return sha256(
    `${hashFiles(repo, screenshotInputs(repo))}playwright@${playwrightVersion(repo)}\n`,
  );
}

const screenshotsOnDisk = (repo: Repo) =>
  repo.list(SCREENSHOTS_DIR).filter((path) => path.endsWith('.png'));

export function buildScreenshotManifest(repo: Repo): ScreenshotManifest {
  return {
    inputsHash: inputsHash(repo),
    playwright: playwrightVersion(repo),
    images: Object.fromEntries(
      screenshotsOnDisk(repo).map((path) => [path, sha256(repo.readBytes(path))]),
    ),
  };
}

/** Records the screenshots just generated; run by the screenshots command after the scenes. */
export function writeScreenshotManifest(repo: Repo): ScreenshotManifest {
  const manifest = buildScreenshotManifest(repo);
  repo.write(SCREENSHOT_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function isScreenshotManifest(value: unknown): value is ScreenshotManifest {
  if (typeof value !== 'object' || value === null) return false;
  const { inputsHash, playwright, images } = value as Record<string, unknown>;
  return (
    typeof inputsHash === 'string' &&
    typeof playwright === 'string' &&
    typeof images === 'object' &&
    images !== null &&
    !Array.isArray(images) &&
    Object.values(images).every((hash) => typeof hash === 'string')
  );
}

function parseScreenshotManifest(text: string): ScreenshotManifest {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${SCREENSHOT_MANIFEST_PATH} is not JSON`);
  }
  if (!isScreenshotManifest(value)) {
    throw new Error(`${SCREENSHOT_MANIFEST_PATH} is not a screenshot manifest`);
  }
  return value;
}

/** Repository paths of the Markdown images `file` shows: `![alt](link)` or `![alt](link "title")`. */
function shownImages(file: string, text: string): string[] {
  return [...text.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map(([, link]) =>
    resolveLink(file, link as string),
  );
}

/** Every screenshot rule of spec §5.1; an empty list means docs/images is current. */
export function checkScreenshots(repo: Repo): string[] {
  if (!repo.exists(SCREENSHOT_MANIFEST_PATH)) {
    return [`${SCREENSHOT_MANIFEST_PATH} is missing — ${FIX}`];
  }
  let manifest: ScreenshotManifest;
  try {
    manifest = parseScreenshotManifest(repo.read(SCREENSHOT_MANIFEST_PATH));
  } catch (error) {
    const reason = (error as Error).message;
    return [`${SCREENSHOT_MANIFEST_PATH} is unreadable (${reason}) — ${FIX}`];
  }
  const problems: string[] = [];
  if (manifest.inputsHash !== inputsHash(repo)) {
    problems.push(`screenshots are stale: a UI input changed — ${FIX}`);
  }
  for (const [path, hash] of Object.entries(manifest.images)) {
    if (!repo.exists(path)) problems.push(`${path} is in the manifest but missing — ${FIX}`);
    else if (sha256(repo.readBytes(path)) !== hash) {
      problems.push(`${path} differs from the manifest (edited by hand?) — ${FIX}`);
    }
  }
  const recorded = new Set(Object.keys(manifest.images));
  for (const path of screenshotsOnDisk(repo)) {
    if (!recorded.has(path))
      problems.push(`${path} is not in ${SCREENSHOT_MANIFEST_PATH} — ${FIX}`);
  }
  for (const file of sourceFiles(repo)) {
    for (const image of shownImages(file, repo.read(file))) {
      if (image.startsWith(`${SCREENSHOTS_DIR}/`) && !recorded.has(image)) {
        problems.push(
          `${file} shows ${image}, which is not in ${SCREENSHOT_MANIFEST_PATH} — ${FIX}`,
        );
      }
    }
  }
  return problems;
}
