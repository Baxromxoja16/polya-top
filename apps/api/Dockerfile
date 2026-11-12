# syntax=docker/dockerfile:1
# Build konteksti — repozitoriy ildizi:  docker build -f apps/api/Dockerfile .

FROM node:26-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH TURBO_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@12.18.0 --allow-scripts=pnpm
WORKDIR /repo

FROM base AS build
# Avval faqat manifestlar — dependency qatlami kodga o'zgarish bo'lganda keshdan olinadi
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared-kernel/package.json packages/shared-kernel/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm turbo run build --filter=@polya/api...
# Faqat produksiya bog'liqliklari bilan mustaqil papka
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter=@polya/api deploy --prod --legacy /out

FROM node:26-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/main.js"]
