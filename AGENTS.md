# Agent instructions

See [CLAUDE.md](./CLAUDE.md) — it applies to every AI coding agent working in this repository.

Everything here is Docker-only and non-interactive; never run host `npm`/`node`. Quick reference (see [README.md](./README.md) for full detail, headers and expected output):

```bash
# Boot — blocks until healthy, exits non-zero if something isn't
docker compose up --build -d --wait

# Verify — non-zero exit on a non-2xx response
curl -fsS http://localhost:8080/api/health
docker compose ps

# Full gate (format, lint, typecheck, tests, 100% coverage) — exit 0 = passed
docker compose --profile test run --rm --build test

# One test file (dev profile)
docker compose --profile dev run --rm dev npx vitest run <file>

# Regenerate docs/diagrams after editing a Mermaid block
docker compose --profile docs run --rm --build diagrams

# End-to-end — teardown runs even if the tests fail
(docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml run --rm --build e2e; \
 rc=$?; docker compose -p foci-e2e -f compose.yaml -f compose.e2e.yaml down -v; exit $rc)

# Teardown
docker compose down -v
```
