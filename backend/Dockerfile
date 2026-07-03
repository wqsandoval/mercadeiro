# Build context é a raiz do monorepo (npm workspaces) — ver docker-compose.prod.yml.
# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
RUN npm ci --workspace=backend --include-workspace-root

COPY backend backend
RUN npm run prisma:generate --workspace=backend
RUN npm run build --workspace=backend
RUN npm prune --omit=dev --workspace=backend --include-workspace-root

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/backend/package.json backend/package.json
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/prisma backend/prisma
COPY backend/docker-entrypoint.sh backend/docker-entrypoint.sh
RUN chmod +x backend/docker-entrypoint.sh && chown -R app:app /app

USER app
WORKDIR /app/backend
EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3333)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
