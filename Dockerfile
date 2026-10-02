# syntax=docker/dockerfile:1

FROM node:24.21-alpine AS base
WORKDIR /repo
# Opt out of install-time telemetry from @scarf/scarf (pulled in by swagger-ui-dist).
ENV SCARF_ANALYTICS=false

# Every workspace manifest + the lockfile: the cache key for dependency installs.
FROM base AS manifests
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/diagrams/package.json packages/diagrams/
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

FROM source AS build-web
RUN npm run build -w @foci/web

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
# The runtime never calls npm/npx/corepack/yarn (CMD is `node apps/api/dist/server.js`,
# and the `migrate` stage below runs node-pg-migrate directly); drop the base image's
# global package managers so their CVEs don't show up in a scan of this image.
RUN rm -rf \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /opt/yarn-v* \
  && ! command -v npm && ! command -v npx && ! command -v corepack \
  && ! command -v yarn && ! command -v yarnpkg
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=10 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "apps/api/dist/server.js"]

# Same image, one-shot command: apply pending SQL migrations and exit.
FROM api AS migrate
HEALTHCHECK NONE
CMD ["node_modules/.bin/node-pg-migrate", "up", "-m", "apps/api/migrations"]

# Static SPA behind unprivileged nginx (no Node in the final image).
FROM nginxinc/nginx-unprivileged:1.31-alpine AS web
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build-web /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --retries=10 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1

# Browser tests: the official image ships matching browsers; only the test runner is installed.
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS e2e
WORKDIR /e2e
RUN npm init -y >/dev/null \
  && npm install --no-audit --no-fund --save-exact @playwright/test@1.63.0
COPY e2e/ ./
CMD ["npx", "playwright", "test"]
