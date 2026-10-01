# syntax=docker/dockerfile:1

FROM node:24.21-alpine AS base
WORKDIR /repo

# Every workspace manifest + the lockfile: the cache key for dependency installs.
FROM base AS manifests
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# One full install (dev dependencies included) for building and testing.
FROM manifests AS deps
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM deps AS source
COPY . .

# Lint, typecheck and every test layer with the coverage gate.
FROM source AS test
ENV COVERAGE_DIR=/reports/coverage
CMD ["npm", "run", "test:ci"]

FROM source AS build-api
RUN npm run build -w @foci/shared -w @foci/api

# Production dependencies of the API (and the shared package it links to) only.
FROM manifests AS api-prod-deps
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund -w @foci/api -w @foci/shared

# Runtime: non-root, compiled JavaScript + production dependencies + migrations.
FROM node:24.21-alpine AS api
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=api-prod-deps --chown=node:node /repo/node_modules ./node_modules
COPY --chown=node:node packages/shared/package.json packages/shared/
COPY --from=build-api --chown=node:node /repo/packages/shared/dist packages/shared/dist
COPY --chown=node:node apps/api/package.json apps/api/
COPY --from=build-api --chown=node:node /repo/apps/api/dist apps/api/dist
COPY --chown=node:node apps/api/migrations apps/api/migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=10 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "apps/api/dist/server.js"]

# Same image, one-shot command: apply pending SQL migrations and exit.
FROM api AS migrate
HEALTHCHECK NONE
CMD ["node_modules/.bin/node-pg-migrate", "up", "-m", "apps/api/migrations"]
