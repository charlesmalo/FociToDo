# 0015 Docs and diagrams live in the repository

Status: Accepted · 2026-10-02 · Supersedes [0011](./0011-in-app-developer-portal.md)

## Context

The `/dev` portal (ADR 0011) rendered the repository's Markdown and Mermaid diagrams inside the web app. GitHub already renders the same Markdown and Mermaid, so the portal duplicated it, and it shipped development material — with `mermaid`, `react-markdown`, `remark-gfm` and a `lodash-es` security override — in the production image.

## Decision

Remove the portal: the production web app contains only the to-do application. Documentation is read in the repository, starting from the README, which maps every guide and diagram. Each Mermaid diagram also gets a generated SVG image committed under `docs/diagrams/`, shown above its collapsed Mermaid source, so it previews in any Markdown viewer; a test-gate check keeps images in step with their source.

## Consequences

- **Positive:** Smaller production app and dependency tree (three runtime packages and a security override gone); one copy of the docs, readable without running the app.
- **Negative:** Diagram images are generated files that must be regenerated when a diagram changes (enforced by the test gate); reading rendered docs needs GitHub or any Markdown viewer instead of the running app.

## Alternatives considered

Hiding the link but keeping `/dev` (ships unreachable code), a separate documentation site (extra build and hosting).
