# Mercadeiro

Monorepo do app de lista de compras Mercadeiro.

## Estrutura

- `/frontend` — Vue 3 + Composition API + Pinia + Vue Router + Tailwind
- `/backend` — Node.js + Fastify + Prisma + PostgreSQL
- `/tests` — Playwright: testes de API (backend) e de UI (frontend, navegador real)

## Documentos de referência

- `mercadeiro-plano-de-tarefas.md` — plano de desenvolvimento por fases
- `mercadeiro-regras-de-negocio.md` — casos de uso e regras de negócio
- `mercadeiro-tasks.json` — checklist estruturado com critérios de aceite

## Rodando localmente

```bash
npm install
npm run dev
```

Sobe tudo de uma vez: Postgres via docker, backend (Fastify) e frontend (Vite), com saída colorida por serviço (`[backend]` / `[frontend]`). `Ctrl+C` encerra os três juntos. Frontend em http://localhost:5173, API em http://localhost:3333.

Para subir só uma parte: `npm run dev:backend`, `npm run dev:frontend` ou `npm run db:up` (só o Postgres).

Veja `backend/.env.example` para as variáveis de ambiente necessárias.

## API

Documentação OpenAPI da API em `backend/openapi.yaml` (cobre os endpoints da Fase 1). Validar com:

```bash
npm run lint:openapi --workspace=backend
```

**Autenticação:** todas as rotas exigem `Authorization: Bearer <token>`, exceto `/health`. O token é único (app single-user) e vive em `API_BEARER_TOKEN` no `.env` do backend — gere um novo com `openssl rand -hex 32`.

## Testes

Suíte Playwright com dois tipos de teste, contra a aplicação real (sem mocks). Requer Postgres rodando e migrations/seed aplicados:

```bash
npm run db:up --workspace=backend
npm run prisma:migrate --workspace=backend
npm run prisma:seed --workspace=backend

npm test              # suíte completa: API + UI
npm run test:api      # só API (tests/api) — não abre navegador
npm run test:frontend # só UI (tests/ui) — navegador real (Chromium)
```

Backend e frontend são iniciados automaticamente pela suíte (`webServer` do Playwright) caso não estejam rodando. Os testes de UI logam uma vez (`tests/ui/auth.setup.ts`) e reaproveitam a sessão salva; `tests/ui/login.spec.ts` roda à parte, sem sessão, para testar o próprio fluxo de login/guard. Relatório HTML: `npm run report --workspace=tests`.

Primeira vez rodando testes de UI: `npm exec --workspace=tests -- playwright install chromium` (baixa o Chromium; não é necessário para os testes de API).

## Deploy (produção)

Backend e frontend rodam como containers Docker separados, atrás de um **Traefik já existente na VPS** (rede Docker externa compartilhada — este projeto não sobe Traefik nem Postgres). Postgres de produção é externo/gerenciado.

- `backend/Dockerfile` — build multi-stage; no start do container roda `prisma migrate deploy` automaticamente antes de subir o servidor (ver `backend/docker-entrypoint.sh`).
- `frontend/Dockerfile` — build do Vite servido por nginx (`frontend/nginx.conf`), com fallback de SPA. A URL da API é embutida no bundle em build-time via `VITE_API_BASE_URL`.
- `docker-compose.prod.yml` — define os dois serviços com labels de roteamento do Traefik (`Host()`, TLS via certresolver) e os conecta à rede externa do Traefik.

**Pré-requisitos na VPS:**
1. Traefik já rodando, com uma rede Docker externa (ex: `traefik-public`) e um certresolver configurado.
2. Um Postgres acessível (gerenciado ou em outra VPS) — este stack não cria banco.
3. DNS de `DOMAIN_API` e `DOMAIN_FRONTEND` apontando para a VPS.

**Deploy:**

```bash
cp .env.prod.example .env.prod
# preencher DOMAIN_API, DOMAIN_FRONTEND, DATABASE_URL, API_BEARER_TOKEN, CORS_ORIGIN
# e conferir se TRAEFIK_NETWORK / TRAEFIK_ENTRYPOINT / TRAEFIK_CERTRESOLVER batem com o Traefik da VPS

docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

Todas as variáveis estão documentadas em `.env.prod.example`. `.env.prod` nunca deve ser commitado (já está no `.gitignore`).
