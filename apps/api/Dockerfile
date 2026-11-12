# Build a partir da raiz do monorepo: docker build -f apps/api/Dockerfile .
FROM node:22-alpine

ENV CI=true
RUN npm install -g pnpm@11.20.0

WORKDIR /app

# só manifests primeiro, para cachear o install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @giro/api...

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 3333

# aplica migrations pendentes e sobe a API (com o bot, se houver token)
CMD ["sh", "-c", "node --import tsx src/db/migrate.ts && exec node --import tsx src/server.ts"]
