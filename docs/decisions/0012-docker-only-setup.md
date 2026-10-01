# 0012 One multi-stage Dockerfile, Compose profiles, Docker-only setup

Status: Accepted · 2026-09-30

## Context

Reviewers must be able to run the app and every test without installing Node or Postgres, on any OS and CPU architecture.

## Decision

One root Dockerfile (one cached `npm ci`; targets `test`, `api`, `migrate`, `web`, `e2e`) and Compose with a default stack plus `test` and `dev` profiles and an e2e overlay run under its own project name. Pinned multi-arch base images; non-root runtimes.

## Consequences

- Identical commands locally and in CI; tests use a throwaway RAM-backed Postgres; e2e never touches demo data.
  − Long-ish Compose commands (documented verbatim).

## Alternatives considered

Per-app Dockerfiles (duplicated install stages), a Makefile (not available by default on Windows), Testcontainers (needs the Docker socket inside containers).
