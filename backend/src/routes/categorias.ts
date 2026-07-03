import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { badRequest, conflict, notFound } from "../lib/http-error.js";

const criarCategoriaSchema = z.object({
  nome: z.string().trim().min(1),
  ordem: z.number().int().optional(),
});

const atualizarCategoriaSchema = z.object({
  nome: z.string().trim().min(1).optional(),
  ordem: z.number().int().optional(),
});

export async function categoriasRoutes(app: FastifyInstance) {
  app.get("/categorias", async () => {
    return prisma.categoria.findMany({ orderBy: { ordem: "asc" } });
  });

  app.get("/categorias/:id", async (request) => {
    const { id } = request.params as { id: string };
    const categoria = await prisma.categoria.findUnique({ where: { id } });
    if (!categoria) throw notFound("Categoria");
    return categoria;
  });

  app.post("/categorias", async (request, reply) => {
    const parsed = criarCategoriaSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

    const categoria = await prisma.categoria.create({ data: parsed.data });
    reply.status(201);
    return categoria;
  });

  app.put("/categorias/:id", async (request) => {
    const { id } = request.params as { id: string };
    const parsed = atualizarCategoriaSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("Dados inválidos", parsed.error.issues);

    const existente = await prisma.categoria.findUnique({ where: { id } });
    if (!existente) throw notFound("Categoria");

    return prisma.categoria.update({ where: { id }, data: parsed.data });
  });

  app.delete("/categorias/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existente = await prisma.categoria.findUnique({ where: { id } });
    if (!existente) throw notFound("Categoria");

    const produtosVinculados = await prisma.produto.count({ where: { categoriaId: id } });
    if (produtosVinculados > 0) {
      throw conflict(
        `Categoria possui ${produtosVinculados} produto(s) vinculado(s) e não pode ser removida`,
      );
    }

    await prisma.categoria.delete({ where: { id } });
    reply.status(204);
  });
}
