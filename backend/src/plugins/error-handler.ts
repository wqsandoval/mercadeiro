import type { FastifyError, FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { HttpError } from "../lib/http-error.js";

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      reply.status(error.statusCode).send({ error: error.message, details: error.details });
      return;
    }

    if (error instanceof ZodError) {
      reply.status(400).send({ error: "Dados inválidos", details: error.issues });
      return;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        reply.status(409).send({ error: "Registro duplicado", details: error.meta });
        return;
      }
      if (error.code === "P2025") {
        reply.status(404).send({ error: "Registro não encontrado" });
        return;
      }
    }

    // Erros nativos do Fastify (ex: FST_ERR_CTP_EMPTY_JSON_BODY quando um cliente
    // envia Content-Type: application/json com corpo vazio, como um DELETE sem
    // body) já chegam com um statusCode 4xx correto — refletir isso em vez de
    // mascarar como 500 (erro de cliente, não de servidor).
    const fastifyError = error as FastifyError;
    if (
      typeof fastifyError.statusCode === "number" &&
      fastifyError.statusCode >= 400 &&
      fastifyError.statusCode < 500
    ) {
      reply.status(fastifyError.statusCode).send({ error: fastifyError.message });
      return;
    }

    request.log.error(error);
    reply.status(500).send({ error: "Erro interno do servidor" });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: `Rota não encontrada: ${request.method} ${request.url}` });
  });
}
