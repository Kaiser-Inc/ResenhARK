# Build from the repo root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
# Manifests only, so dependency layers are cached until a lockfile or package.json changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

FROM base AS build
RUN pnpm install --frozen-lockfile --filter api...
COPY apps/api apps/api
COPY packages/shared packages/shared
RUN pnpm --filter api build \
 && pnpm --filter @resenhark/shared exec tsc -p . --noEmit false --outDir dist

FROM base AS deps
RUN pnpm install --frozen-lockfile --prod --filter api...

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/apps/api/node_modules apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules packages/shared/node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/assets apps/api/assets
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
# The shared package exports TypeScript source for dev and for the web (Next transpiles it).
# Node cannot load .ts from a dependency, so the image points the export at the compiled output.
RUN node -e 'const f="packages/shared/package.json",p=require("./"+f);p.exports={".":"./dist/index.js"};require("fs").writeFileSync(f,JSON.stringify(p,null,2))'
USER node
WORKDIR /app/apps/api
EXPOSE 3333
CMD ["node", "dist/main.js"]
