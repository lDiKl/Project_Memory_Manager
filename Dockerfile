# Runtime image for the public PMM CLI.
FROM node:20-bookworm-slim AS deps

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/cli/package.json apps/cli/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY . .

RUN pnpm build

FROM node:20-bookworm-slim AS runtime

WORKDIR /workspace

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

COPY --from=build /app /app

ENV NODE_ENV=production

ENTRYPOINT ["node", "/app/apps/cli/dist/index.js"]
CMD ["--help"]
