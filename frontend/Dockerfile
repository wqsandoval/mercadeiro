# Build context é a raiz do monorepo (npm workspaces) — ver docker-compose.prod.yml.
# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace=frontend --include-workspace-root

COPY frontend frontend

# URL pública da API, embutida no bundle em build-time (Vite só expõe vars
# prefixadas VITE_). Ajuste via build arg no docker-compose.prod.yml.
ARG VITE_API_BASE_URL=/
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build --workspace=frontend

FROM nginx:1.27-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
