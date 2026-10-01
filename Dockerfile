# syntax=docker/dockerfile:1

###############################################################################
# Builder stage: install ALL dependencies and compile TypeScript
###############################################################################
FROM node:26-alpine AS builder

# `prepare` runs husky, which fails outside a git repository. Disable it.
ENV HUSKY=0

# Toolchain for dependencies that compile from source (node-gyp).
RUN apk add --no-cache python3 make g++

WORKDIR /app

# pnpm major version must match the lockfile version (pnpm 12).
RUN npm install -g pnpm@12

# Copy only the manifests first so this layer is cached until they change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Deterministic install of every dependency (including devDependencies for tsc).
RUN pnpm install --frozen-lockfile

# Compile TypeScript to dist/ (tsc -p tsconfig.build.json).
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

###############################################################################
# Runtime stage: production dependencies + compiled output + SQL migrations
###############################################################################
FROM node:26-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    LOG_LEVEL=info

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Production dependencies only, still deterministic. Build tools are added and
# removed within the same layer so they do not persist in the final image.
RUN apk add --no-cache python3 make g++ \
  && npm install -g pnpm@12 \
  && HUSKY=0 pnpm install --frozen-lockfile --prod \
  && npm uninstall -g pnpm \
  && apk del python3 make g++

# drizzle/ must sit next to dist/: migrations are resolved relative to
# dist/infrastructure/database/migrate.js (../../../drizzle/...).
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node drizzle ./drizzle

# The OpenAPI document is discovered from the project root, so it must sit next
# to package.json here. /docs stays off unless DOCS_ENABLED=true.
COPY --chown=node:node docs/openapi.yaml ./docs/openapi.yaml

# Allow the unprivileged user to create local files (e.g. SQLite db) in /app.
RUN chown node:node /app

USER node

EXPOSE 3000

# Uses Node's built-in fetch; no curl/wget required in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(function(r){process.exit(r.status===200?0:1)}).catch(function(){process.exit(1)})"

CMD ["node", "dist/server.js"]
