# 0011 In-app `/dev` portal single-sourced from `docs/`

Status: Superseded by [0015](./0015-docs-and-diagrams-in-the-repository.md) · 2026-10-02 (accepted 2026-09-30)

## Context

Reviewers should be able to see the architecture and diagrams rendered while running the app, without GitHub.

## Decision

A lazily loaded `/dev` section of the React app renders the repository's Markdown (README, guides, ADRs) with `react-markdown` and `mermaid`, links to the API explorer and shows build information. Content is bundled from `docs/` at build time.

## Consequences

- **Positive:** One copy of the docs; diagrams render in the product; the todo bundle stays small.
- **Negative:** The web image build includes `docs/`; the portal adds two dependencies to its own chunk.

## Alternatives considered

A separate static docs site (custom build tooling), links to GitHub only (needs internet, not rendered in the app).
