# 0014 Curated PR workflow and AI attribution

Status: Accepted · 2026-09-30

## Context

The history should show how the work was done; AI assistance is used and should be transparent.

## Decision

One branch and PR per work package, merged with a merge commit after curating the branch into a few meaningful, green commits (fixups autosquashed). Conventional Commits. Every AI-assisted commit carries a `Co-Authored-By: Claude` trailer; decisions are recorded in these ADRs and the spec.

## Consequences

- **Positive:** A readable, bisectable history with visible review points; clear accountability.
- **Negative:** Some branch-tidying before each PR.

## Alternatives considered

Squash merges (lose the test-first steps), committing straight to `main` (no review points), no attribution (less transparent).
