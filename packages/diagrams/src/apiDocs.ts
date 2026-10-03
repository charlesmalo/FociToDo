import { inlineRefs } from './inlineRefs.js';

export interface SwaggerAssets {
  css: string;
  js: string;
}

/**
 * A closing tag inside inline JS or CSS would end the element early; `<\/tag` is equivalent
 * there. The replacement keeps the original case (`</SCRIPT` stays upper-case).
 */
const inlineJs = (source: string): string => source.replace(/<\/(script)/gi, '<\\/$1');
const inlineCss = (source: string): string => source.replace(/<\/(style)/gi, '<\\/$1');
const inlineJson = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * One self-contained page: Swagger UI and the OpenAPI document inlined, so it opens from disk
 * with no server and no network. "Try it out" is off — no API stands behind a file — and the
 * online spec validator badge is off, so the page never calls out.
 */
export function renderApiDocs(document: unknown, assets: SwaggerAssets): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FociToDo API reference</title>
<style>${inlineCss(assets.css)}</style>
</head>
<body>
<div id="swagger-ui"></div>
<script>${inlineJs(assets.js)}</script>
<script>
window.ui = SwaggerUIBundle({ spec: ${inlineJson(inlineRefs(document))}, dom_id: '#swagger-ui', deepLinking: true, supportedSubmitMethods: [], validatorUrl: null });
</script>
</body>
</html>
`;
}
