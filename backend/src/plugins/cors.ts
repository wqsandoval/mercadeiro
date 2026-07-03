import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";

/**
 * Frontend e backend rodam em domínios/subdomínios separados em produção
 * (ex: app.dominio.com / api.dominio.com), exigindo CORS explícito. Em dev,
 * sem CORS_ORIGIN configurado, reflete a origem da requisição (equivalente a
 * "*" mas compatível com credenciais) — sem restringir o fluxo local atual.
 */
export async function registerCors(app: FastifyInstance) {
  const origens = (process.env.CORS_ORIGIN ?? "*")
    .split(",")
    .map((origem) => origem.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin: origens.includes("*") ? true : origens,
  });
}
