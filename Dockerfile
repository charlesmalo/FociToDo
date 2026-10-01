# syntax=docker/dockerfile:1

FROM node:24.21-alpine AS base
WORKDIR /repo

# One install for the whole monorepo; re-runs only when a manifest or the lockfile changes.
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM deps AS source
COPY . .

# Lint, typecheck and every test layer with the coverage gate.
FROM source AS test
ENV COVERAGE_DIR=/reports/coverage
CMD ["npm", "run", "test:ci"]
