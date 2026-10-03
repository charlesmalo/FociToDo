import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { renderApiDocs } from '../src/apiDocs.js';
import { inlineRefs } from '../src/inlineRefs.js';

/**
 * Local `$ref`s left outside `components` after inlining. A cyclic schema used from a path
 * would leave its inner `$ref` under `paths` and fail this check, by design.
 */
function unresolved(value: unknown, path: string, check: boolean): string[] {
  if (typeof value !== 'object' || value === null) return [];
  const here = value as Record<string, unknown>;
  const found =
    check && typeof here.$ref === 'string' && here.$ref.startsWith('#/')
      ? [`${path}: ${here.$ref}`]
      : [];
  return found.concat(
    Object.entries(here).flatMap(([key, child]) =>
      unresolved(child, `${path}/${key}`, check && !(path === '' && key === 'components')),
    ),
  );
}

const assets = { css: 'body{margin:0}', js: 'window.SwaggerUIBundle=function(){};' };

describe('renderApiDocs', () => {
  it('inlines the stylesheet, the script and the spec, and disables "Try it out"', () => {
    const html = renderApiDocs({ openapi: '3.1.0', info: { title: 'T', version: '1' } }, assets);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<style>body{margin:0}</style>');
    expect(html).toContain('window.SwaggerUIBundle=function(){};');
    expect(html).toContain('"openapi":"3.1.0"');
    expect(html).toContain('supportedSubmitMethods: []');
    expect(html).toContain('validatorUrl: null');
    expect(html).not.toMatch(/<(script|link)[^>]+(src|href)=/);
  });

  it('inlines local $refs so Swagger UI needs no resolver (it cannot resolve them from file://)', () => {
    const html = renderApiDocs({ a: { $ref: '#/d/x' }, d: { x: { type: 'string' } } }, assets);
    expect(html).toContain('"a":{"type":"string"}');
  });

  it('escapes a closing tag in the script keeping its case, and in the stylesheet', () => {
    const html = renderApiDocs({}, { css: 'a{}/*</style>*/', js: 'var s="</SCRIPT>";' });
    expect(html).toContain('var s="<\\/SCRIPT>";');
    expect(html).toContain('<style>a{}/*<\\/style>*/</style>');
    expect(html.match(/<\/style>/g)).toHaveLength(1);
  });

  it('cannot be broken out of by </script> in the spec or the script', () => {
    const html = renderApiDocs(
      { info: { description: '</script><script>alert(1)</script>' } },
      { css: '', js: 'var s="</script>";' },
    );
    expect(html.match(/<\/script>/g)).toHaveLength(2);
  });
});

describe('unresolved (test helper)', () => {
  it('reports a local $ref outside components', () => {
    expect(unresolved({ paths: { a: { $ref: '#/x' } } }, '', true)).toHaveLength(1);
  });
});

describe('this repository', () => {
  it('has docs/api/index.html in sync with apps/api/openapi.json (regenerate with UPDATE_API_DOCS=1)', async () => {
    const root = new URL('../../../', import.meta.url);
    const require = createRequire(import.meta.url);
    const document = JSON.parse(await readFile(new URL('apps/api/openapi.json', root), 'utf8'));
    const html = renderApiDocs(document, {
      css: await readFile(require.resolve('swagger-ui-dist/swagger-ui.css'), 'utf8'),
      js: await readFile(require.resolve('swagger-ui-dist/swagger-ui-bundle.js'), 'utf8'),
    });
    expect(unresolved(inlineRefs(document), '', true)).toEqual([]);
    const path = fileURLToPath(new URL('docs/api/index.html', root));
    if (process.env.UPDATE_API_DOCS === '1') await writeFile(path, html);
    const committed = await readFile(path, 'utf8');
    expect(committed).toBe(html);
    const page = new JSDOM(committed).window.document;
    const scripts = page.querySelectorAll('script');
    expect(scripts).toHaveLength(2);
    expect(page.querySelectorAll('style')).toHaveLength(1);
    expect(scripts[1]?.textContent?.trim().startsWith('window.ui = SwaggerUIBundle(')).toBe(true);
  });
});
