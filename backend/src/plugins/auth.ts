import type { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { unauthorized } from "../lib/http-error.js";

const ROTAS_PUBLICAS = new Set(["/health"]);

function extrairToken(header: string | undefined): string | null {
  if (!header) return null;
  const [esquema, token] = header.split(" ");
  if (esquema?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function tokensIguais(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Autenticação por bearer token único (app single-user, sem contas — ver
 * mercadeiro-regras-de-negocio.md §5.8). O token vive em API_BEARER_TOKEN no
 * .env do backend. Todas as rotas exigem o header `Authorization: Bearer <token>`,
 * exceto /health (usado por health checks de infraestrutura sem credenciais).
 */
export function registerAuth(app: FastifyInstance) {
  const token = process.env.API_BEARER_TOKEN;
  if (!token) {
    throw new Error(
      "API_BEARER_TOKEN não configurado no .env do backend — obrigatório para autenticar a API.",
    );
  }

  app.addHook("onRequest", async (request, reply) => {
    if (ROTAS_PUBLICAS.has(request.url.split("?")[0])) return;

    const recebido = extrairToken(request.headers.authorization);
    if (!recebido || !tokensIguais(recebido, token)) {
      reply.header("WWW-Authenticate", "Bearer");
      throw unauthorized();
    }
  });
}
